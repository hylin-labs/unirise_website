'use client';

import { LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import { SyntheticEvent, useEffect, useRef, useState } from 'react';
import { publicAnalyticsPath } from '../lib/public-analytics-path';
import type { Locale } from '../lib/locales';
import { initialPublicContent } from '../lib/public-content';
import type { ChromePayload } from '../lib/translation-types';
import styles from './support-chat.module.css';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
type LeadRequestType = 'quote' | 'specialist';

function errorMessage(labels: ChromePayload['text']['chat'], code?: string) {
  if (code === 'rate_limited') return labels.rateLimited;
  if (code === 'chat_not_configured') return labels.notConfigured;
  return labels.error;
}

type SupportChatProps = {
  locale: Locale;
  labels?: ChromePayload['text']['chat'];
};

export function SupportChat({
  locale,
  labels = initialPublicContent.chrome.text.chat,
}: SupportChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: labels.welcome },
  ]);
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [leadActionsAvailable, setLeadActionsAvailable] = useState(false);
  const [leadRequestType, setLeadRequestType] =
    useState<LeadRequestType | null>(null);
  const [leadSending, setLeadSending] = useState(false);
  const [leadStatus, setLeadStatus] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const leadOriginRef = useRef<HTMLButtonElement>(null);
  const leadNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (leadRequestType) leadNameRef.current?.focus();
  }, [leadRequestType]);

  async function send(text = value) {
    const message = text.trim();
    if (!message || sending) return;
    const priorMessages = messages.slice(1);
    const nextMessages = [
      ...messages,
      { role: 'user' as const, content: message },
    ];
    setMessages(nextMessages);
    setValue('');
    setSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, message, history: priorMessages }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
      };
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            response.ok && payload.answer
              ? payload.answer
              : errorMessage(labels, payload.error),
        },
      ]);
      if (response.ok && payload.answer) setLeadActionsAvailable(true);
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: errorMessage(labels) },
      ]);
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function openLeadForm(
    requestType: LeadRequestType,
    origin: HTMLButtonElement,
  ) {
    if (leadSending) return;
    leadOriginRef.current = origin;
    setLeadRequestType(requestType);
    setLeadStatus('');
  }

  function closeLeadForm() {
    if (leadSending) return;
    setLeadRequestType(null);
    window.setTimeout(() => leadOriginRef.current?.focus(), 0);
  }

  async function submitLead(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadRequestType || leadSending) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setLeadSending(true);
    setLeadStatus('');
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locale,
          requestType: leadRequestType,
          name: formData.get('name'),
          email: formData.get('email'),
          company: formData.get('company'),
          phone: formData.get('phone'),
          topic: formData.get('topic'),
          message: formData.get('message'),
          sourcePath: publicAnalyticsPath(window.location.pathname, '') ?? '/',
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        followUpDelayed?: boolean;
      };
      if (!response.ok) {
        setLeadStatus(
          payload.error === 'rate_limited'
            ? labels.leadRateLimited
            : labels.leadInvalid,
        );
        return;
      }
      form.reset();
      setLeadRequestType(null);
      window.setTimeout(() => leadOriginRef.current?.focus(), 0);
      setLeadStatus(
        payload.followUpDelayed ? labels.leadDelayed : labels.leadReceived,
      );
    } catch {
      setLeadStatus(labels.leadError);
    } finally {
      setLeadSending(false);
    }
  }

  return (
    <>
      {open && (
        <section
          id="support-chat-panel"
          className={styles.panel}
          aria-label={labels.title}
        >
          <header className={styles.header}>
            <div>
              <strong>{labels.title}</strong>
              <small>{labels.subtitle}</small>
            </div>
            <button
              className={styles.close}
              type="button"
              onClick={() => setOpen(false)}
              disabled={leadSending}
              aria-label={labels.close}
            >
              <X size={20} />
            </button>
          </header>
          <div
            className={`${styles.messages} ${leadRequestType ? styles.messagesCompact : ''}`}
            aria-live="polite"
          >
            {messages.length === 1 && (
              <div className={styles.suggestions}>
                {labels.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`}>
                <p
                  className={`${styles.message} ${message.role === 'user' ? styles.user : ''}`}
                >
                  {message.content}
                </p>
              </div>
            ))}
            {sending && (
              <p className={styles.message}>
                <LoaderCircle size={16} aria-label={labels.replying} />
              </p>
            )}
          </div>
          {leadActionsAvailable && (
            <div className={styles.leadArea}>
              <div className={styles.leadActions} aria-label={labels.followUp}>
                <button
                  type="button"
                  onClick={(event) =>
                    openLeadForm('quote', event.currentTarget)
                  }
                  disabled={leadSending}
                  aria-pressed={leadRequestType === 'quote'}
                >
                  {labels.quote}
                </button>
                <button
                  type="button"
                  onClick={(event) =>
                    openLeadForm('specialist', event.currentTarget)
                  }
                  disabled={leadSending}
                  aria-pressed={leadRequestType === 'specialist'}
                >
                  {labels.specialist}
                </button>
              </div>
              {leadRequestType && (
                <form
                  className={styles.leadForm}
                  onSubmit={submitLead}
                  aria-busy={leadSending}
                  aria-label={
                    leadRequestType === 'quote'
                      ? labels.quoteForm
                      : labels.specialistForm
                  }
                >
                  <div className={styles.leadFormHeader}>
                    <strong>
                      {leadRequestType === 'quote'
                        ? labels.quote
                        : labels.specialist}
                    </strong>
                    <button
                      type="button"
                      onClick={closeLeadForm}
                      disabled={leadSending}
                      aria-label={labels.closeLead}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className={styles.leadGrid}>
                    <label>
                      {labels.name}
                      <span aria-hidden="true">＊</span>
                      <input
                        ref={leadNameRef}
                        name="name"
                        required
                        maxLength={120}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      {labels.email}
                      <span aria-hidden="true">＊</span>
                      <input
                        type="email"
                        name="email"
                        required
                        maxLength={320}
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      {labels.company}
                      <input
                        name="company"
                        maxLength={160}
                        autoComplete="organization"
                      />
                    </label>
                    <label>
                      {labels.phone}
                      <input name="phone" maxLength={50} autoComplete="tel" />
                    </label>
                    <label className={styles.leadFull}>
                      {labels.topic}
                      <input name="topic" maxLength={200} />
                    </label>
                    <label className={styles.leadFull}>
                      {labels.message}
                      <span aria-hidden="true">＊</span>
                      <textarea
                        name="message"
                        required
                        maxLength={4000}
                        rows={3}
                      />
                    </label>
                  </div>
                  <p>{labels.contactPrivacy}</p>
                  <button
                    className={styles.leadSubmit}
                    type="submit"
                    disabled={leadSending}
                  >
                    {leadSending ? labels.sending : labels.submitLead}
                  </button>
                </form>
              )}
              {leadStatus && (
                <output className={styles.leadStatus}>{leadStatus}</output>
              )}
            </div>
          )}
          <p className={styles.notice}>{labels.privacy}</p>
          <form className={styles.form} onSubmit={submit}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={700}
              rows={2}
              placeholder={labels.placeholder}
              aria-label={labels.question}
            />
            <button
              type="submit"
              disabled={sending || !value.trim()}
              aria-label={labels.send}
            >
              <Send size={18} />
            </button>
          </form>
        </section>
      )}
      <button
        className={styles.launcher}
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={leadSending}
        aria-expanded={open}
        aria-controls="support-chat-panel"
        aria-label={open ? labels.close : labels.open}
      >
        {open ? <X size={26} /> : <MessageCircle size={27} />}
      </button>
    </>
  );
}
