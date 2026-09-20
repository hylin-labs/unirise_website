'use client';

import { type SyntheticEvent, useState } from 'react';
import type { Locale } from '../lib/locales';
import type { InquiryPayload } from '../lib/translation-types';

export function PublicInquiryForm({
  inquiry,
  product,
  brief = '',
  locale = 'zh-TW',
  service = false,
}: {
  inquiry: InquiryPayload;
  product: string;
  brief?: string;
  locale?: Locale;
  service?: boolean;
}) {
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const { text, literals } = inquiry;
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const value = (name: string) => {
      const entry = form.get(name);
      return typeof entry === 'string' ? entry : '';
    };
    setSending(true);
    setStatus('');
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: service ? 'specialist' : 'quote',
          name: value('name'),
          company: value('company'),
          phone: value('phone'),
          email: value('email'),
          topic: service
            ? `${locale === 'en' ? 'Service support' : '設備服務支援'}｜${value('product')}`
            : value('product'),
          message: brief
            ? `${brief}\n\n${value('message')}`.trim()
            : value('message'),
          sourcePath: `${window.location.pathname}${window.location.search}`,
        }),
      });
      const payload = (await response.json()) as { followUpDelayed?: boolean };
      if (!response.ok) {
        setStatus(response.status === 429 ? text.rateLimited : text.error);
        return;
      }
      formElement.reset();
      setStatus(payload.followUpDelayed ? text.delayed : text.sent);
    } catch {
      setStatus(text.error);
    } finally {
      setSending(false);
    }
  };
  const invalid = (
    event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const field = event.currentTarget;
    field.setCustomValidity(
      field.validity.valueMissing
        ? text.required
        : field.validity.typeMismatch
          ? text.invalidEmail
          : '',
    );
  };
  const clearValidity = (
    event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => event.currentTarget.setCustomValidity('');
  const validation = { onInvalid: invalid, onInput: clearValidity };
  return (
    <form
      className="original-content-panel inquiry-panel inquiry-form"
      onSubmit={submit}
      aria-busy={sending}
    >
      <h2>
        {service
          ? locale === 'en'
            ? 'Equipment service support'
            : '既有設備服務支援'
          : product || text.heading}
      </h2>
      <p>
        {service
          ? locale === 'en'
            ? 'Tell us the equipment model, observed condition, and the best way to contact you. A specialist will review the request.'
            : '請提供設備型號、目前狀況與聯絡方式；專員會先檢視需求後與您聯繫。'
          : text.help}
      </p>
      {brief && (
        <div className="inquiry-brief" aria-live="polite">
          <strong>{locale === 'en' ? 'Project brief' : '專案需求摘要'}</strong>
          <p>{brief}</p>
        </div>
      )}
      <label>
        {text.name}
        <input name="name" required autoComplete="name" {...validation} />
      </label>
      <label>
        {text.company}
        <input
          name="company"
          required
          autoComplete="organization"
          {...validation}
        />
      </label>
      <div className="form-pair">
        <label>
          {text.phone}
          <input name="phone" required autoComplete="tel" {...validation} />
        </label>
        <label>
          {text.email}
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            {...validation}
          />
        </label>
      </div>
      <label>
        {text.product}
        <input name="product" defaultValue={product} />
      </label>
      <label>
        {text.message}
        <textarea
          name="message"
          required
          rows={6}
          placeholder={text.placeholder}
          {...validation}
        />
      </label>
      <button className="original-inquiry-button" type="submit" disabled={sending}>
        {sending ? text.sending : text.submit}
      </button>
      {status && (
        <small className="form-status" aria-live="polite">
          {status}
        </small>
      )}
      <small>
        {text.servicePhone}：{literals.phone}　｜　{literals.email}
      </small>
    </form>
  );
}
