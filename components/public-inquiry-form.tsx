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
  const [sent, setSent] = useState(false);
  const { text, literals } = inquiry;
  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => {
      const entry = form.get(name);
      return typeof entry === 'string' ? entry : '';
    };
    const subject = `${text.subject}${value('product') || text.defaultSubject}`;
    const body = [
      `${text.emailName}${value('name')}`,
      `${text.emailCompany}${value('company')}`,
      `${text.emailPhone}${value('phone')}`,
      `${text.emailEmail}${value('email')}`,
      '',
      text.emailMessage,
      value('message'),
    ].join('\n');
    window.location.href = `${literals.emailUrl}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
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
      <button className="original-inquiry-button" type="submit">
        {text.submit}
      </button>
      {sent && <small className="form-status">{text.sent}</small>}
      <small>
        {text.servicePhone}：{literals.phone}　｜　{literals.email}
      </small>
    </form>
  );
}
