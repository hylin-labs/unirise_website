'use client';

import { type SyntheticEvent, useState } from 'react';
import type { InquiryPayload } from '../lib/translation-types';

export function PublicInquiryForm({
  inquiry,
  product,
}: {
  inquiry: InquiryPayload;
  product: string;
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
          requestType: 'quote',
          name: value('name'),
          company: value('company'),
          phone: value('phone'),
          email: value('email'),
          topic: value('product'),
          message: value('message'),
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
      <h2>{product || text.heading}</h2>
      <p>{text.help}</p>
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
