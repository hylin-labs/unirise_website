// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicInquiryForm } from '../components/public-inquiry-form';
import { initialPublicContent } from '../lib/public-content';

describe('localized inquiry workflow', () => {
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
    it(`submits an enquiry directly in ${locale}`, async () => {
      const inquiry = structuredClone(initialPublicContent.inquiry);
      if (locale === 'en')
        Object.assign(inquiry.text, {
          sent: 'Your enquiry was received.',
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
      let requestOptions: RequestInit | undefined;
      const fetchStub = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          requestOptions = init;
          return new Response(
            JSON.stringify({ accepted: true, followUpDelayed: false }),
            {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        },
      );
      vi.stubGlobal('fetch', fetchStub);
      await act(async () =>
        container
          .querySelector('form')!
          .dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true }),
          ),
      );
      expect(fetchStub).toHaveBeenCalledWith(
        '/api/leads',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(JSON.parse(requestOptions?.body as string)).toMatchObject({
        requestType: 'quote',
        topic: 'FSCAN-4350G & XAVIS',
        ...values,
      });
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
