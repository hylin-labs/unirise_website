'use client';

import { LoaderCircle, MessageCircle, Send, X } from 'lucide-react';
import { SyntheticEvent, useEffect, useRef, useState } from 'react';
import { publicAnalyticsPath } from '../lib/public-analytics-path';
import styles from './support-chat.module.css';

type ChatSource = { title: string; href: string };
type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
};
type LeadRequestType = 'quote' | 'specialist';

const welcome: ChatMessage = {
  role: 'assistant',
  content:
    '您好，我是合軒科技的測試版網站助理。我可以協助您了解產品領域、代理品牌、聯絡方式與詢價流程。',
};
const suggestions = [
  '有哪些食品分選方案？',
  'X 光檢測能協助什麼？',
  '如何聯絡或詢價？',
];

function errorMessage(code?: string) {
  if (code === 'rate_limited') return '目前詢問較多，請稍後一分鐘再試。';
  if (code === 'chat_not_configured')
    return '測試版聊天服務正在設定中，請稍後再試或直接聯絡合軒科技。';
  return '目前無法取得回覆，請稍後再試或直接使用詢價系統。';
}

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
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
        body: JSON.stringify({ message, history: priorMessages }),
      });
      const payload = (await response.json()) as {
        answer?: string;
        error?: string;
        sources?: ChatSource[];
      };
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            response.ok && payload.answer
              ? payload.answer
              : errorMessage(payload.error),
          sources: response.ok ? payload.sources : undefined,
        },
      ]);
      if (response.ok && payload.answer) setLeadActionsAvailable(true);
    } catch {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: errorMessage() },
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
            ? '送出次數較多，請稍後再試。'
            : '資料未能送出，請確認必填欄位後再試。',
        );
        return;
      }
      form.reset();
      setLeadRequestType(null);
      window.setTimeout(() => leadOriginRef.current?.focus(), 0);
      setLeadStatus(
        payload.followUpDelayed
          ? '已收到您的需求；目前通知服務暫時無法使用，聯絡可能稍有延遲。'
          : '已收到您的需求，我們會儘快與您聯絡。',
      );
    } catch {
      setLeadStatus('資料未能送出，請稍後再試。');
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
          aria-label="合軒科技網站助理"
        >
          <header className={styles.header}>
            <div>
              <strong>合軒科技網站助理</strong>
              <small>測試版｜公開資訊問答</small>
            </div>
            <button
              className={styles.close}
              type="button"
              onClick={() => setOpen(false)}
              disabled={leadSending}
              aria-label="關閉聊天"
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
                {suggestions.map((suggestion) => (
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
                {message.role === 'assistant' &&
                  message.sources &&
                  message.sources.length > 0 && (
                    <div className={styles.sources}>
                      參考網站內容：
                      {message.sources.map((source) => (
                        <a href={source.href} key={source.href}>
                          {source.title}
                        </a>
                      ))}
                    </div>
                  )}
              </div>
            ))}
            {sending && (
              <p className={styles.message}>
                <LoaderCircle size={16} aria-label="正在回覆" />
              </p>
            )}
          </div>
          {leadActionsAvailable && (
            <div className={styles.leadArea}>
              <div className={styles.leadActions} aria-label="後續服務">
                <button
                  type="button"
                  onClick={(event) =>
                    openLeadForm('quote', event.currentTarget)
                  }
                  disabled={leadSending}
                  aria-pressed={leadRequestType === 'quote'}
                >
                  索取報價
                </button>
                <button
                  type="button"
                  onClick={(event) =>
                    openLeadForm('specialist', event.currentTarget)
                  }
                  disabled={leadSending}
                  aria-pressed={leadRequestType === 'specialist'}
                >
                  聯絡專員
                </button>
              </div>
              {leadRequestType && (
                <form
                  className={styles.leadForm}
                  onSubmit={submitLead}
                  aria-busy={leadSending}
                  aria-label={
                    leadRequestType === 'quote'
                      ? '索取報價表單'
                      : '聯絡專員表單'
                  }
                >
                  <div className={styles.leadFormHeader}>
                    <strong>
                      {leadRequestType === 'quote' ? '索取報價' : '聯絡專員'}
                    </strong>
                    <button
                      type="button"
                      onClick={closeLeadForm}
                      disabled={leadSending}
                      aria-label="關閉聯絡表單"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className={styles.leadGrid}>
                    <label>
                      姓名<span aria-hidden="true">＊</span>
                      <input
                        ref={leadNameRef}
                        name="name"
                        required
                        maxLength={120}
                        autoComplete="name"
                      />
                    </label>
                    <label>
                      電子信箱<span aria-hidden="true">＊</span>
                      <input
                        type="email"
                        name="email"
                        required
                        maxLength={320}
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      公司
                      <input
                        name="company"
                        maxLength={160}
                        autoComplete="organization"
                      />
                    </label>
                    <label>
                      電話
                      <input name="phone" maxLength={50} autoComplete="tel" />
                    </label>
                    <label className={styles.leadFull}>
                      產品／主題
                      <input name="topic" maxLength={200} />
                    </label>
                    <label className={styles.leadFull}>
                      需求說明<span aria-hidden="true">＊</span>
                      <textarea
                        name="message"
                        required
                        maxLength={4000}
                        rows={3}
                      />
                    </label>
                  </div>
                  <p>聯絡資料僅用於回覆本次需求。</p>
                  <button
                    className={styles.leadSubmit}
                    type="submit"
                    disabled={leadSending}
                  >
                    {leadSending ? '送出中…' : '送出需求'}
                  </button>
                </form>
              )}
              {leadStatus && (
                <output className={styles.leadStatus}>{leadStatus}</output>
              )}
            </div>
          )}
          <p className={styles.notice}>聊天內容請勿輸入敏感個資。</p>
          <form className={styles.form} onSubmit={submit}>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={700}
              rows={2}
              placeholder="請輸入您的問題"
              aria-label="聊天問題"
            />
            <button
              type="submit"
              disabled={sending || !value.trim()}
              aria-label="送出問題"
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
        aria-label={open ? '關閉聊天' : '開啟聊天'}
      >
        {open ? <X size={26} /> : <MessageCircle size={27} />}
      </button>
    </>
  );
}
