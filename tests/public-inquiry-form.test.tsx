// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicInquiryForm } from '../components/public-inquiry-form';
import { initialPublicContent } from '../lib/public-content';

describe('localized inquiry email workflow', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  for (const locale of ['zh-TW', 'en'] as const)
    it(`creates the existing mailto inquiry in ${locale}`, async () => {
      const inquiry = structuredClone(initialPublicContent.inquiry);
      if (locale === 'en')
        Object.assign(inquiry.text, {
          subject: 'Product inquiry: ',
          defaultSubject: 'Product information',
          emailName: 'Name: ',
          emailCompany: 'Company: ',
          emailPhone: 'Phone: ',
          emailEmail: 'Email: ',
          emailMessage: 'Requirements:',
          sent: 'Inquiry email created.',
        });
      await act(async () =>
        root.render(
          <PublicInquiryForm inquiry={inquiry} product="FSCAN-4350G & XAVIS" />,
        ),
      );
      const values = {
        name: 'Lin',
        company: 'Test company',
        phone: '06-3319283',
        email: 'lin@example.com',
        message: 'Fish sorting\nLine 2 & specifications',
      };
      for (const [name, value] of Object.entries(values)) {
        const field = container.querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >(`[name="${name}"]`)!;
        field.value = value;
      }
      const location = { href: '' };
      vi.stubGlobal('window', { location });
      await act(async () =>
        container
          .querySelector('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          ),
      );
      const url = new URL(location.href);
      expect(url.protocol).toBe('mailto:');
      expect(url.pathname).toBe('info-unirise@unirise.tw');
      expect(url.searchParams.get('subject')).toBe(
        locale === 'en'
          ? 'Product inquiry: FSCAN-4350G & XAVIS'
          : '詢問產品：FSCAN-4350G & XAVIS',
      );
      const body = url.searchParams.get('body')!;
      for (const value of Object.values(values)) expect(body).toContain(value);
      expect(body).toContain(locale === 'en' ? 'Requirements:' : '需求說明：');
      expect(container.querySelector('.form-status')?.textContent).toBe(
        inquiry.text.sent,
      );
    });

  it('uses managed required/email validation messages and clears them after input', async () => {
    const inquiry = structuredClone(initialPublicContent.inquiry);
    inquiry.text.required = 'Please complete this field.';
    inquiry.text.invalidEmail = 'Enter a valid email address.';
    await act(async () =>
      root.render(<PublicInquiryForm inquiry={inquiry} product="" />),
    );
    const field = container.querySelector<HTMLInputElement>('[name="email"]')!;
    expect(field.checkValidity()).toBe(false);
    expect(field.validationMessage).toBe('Please complete this field.');
    field.value = 'invalid';
    await act(async () =>
      field.dispatchEvent(new Event('input', { bubbles: true })),
    );
    expect(field.checkValidity()).toBe(false);
    expect(field.validationMessage).toBe('Enter a valid email address.');
    field.value = 'lin@example.com';
    await act(async () =>
      field.dispatchEvent(new Event('input', { bubbles: true })),
    );
    expect(field.checkValidity()).toBe(true);
  });
});
