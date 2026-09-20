// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisitorCounter } from '../components/visitor-counter';
import { SupportChat } from '../components/support-chat';
import { initialPublicContent } from '../lib/public-content';

describe('bilingual public request contracts', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(
        'https://unirise.tw/en/news?id=78&email=private@example.com',
      ),
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('sends English page and download events while displaying site-wide visitor totals', async () => {
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({
          url,
          body:
            typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        return Response.json(
          url === '/api/visitor-stats'
            ? { total: 4321, today: 123 }
            : { accepted: true },
        );
      }),
    );
    await act(async () => root.render(<VisitorCounter locale="en" />));
    expect(requests).toContainEqual({
      url: '/api/visitor-stats',
      body: undefined,
    });
    expect(requests).toContainEqual({
      url: '/api/analytics',
      body: { locale: 'en', name: 'page_view', path: '/en/news?id=78' },
    });
    expect(container.textContent).toContain('Total visitors 4,321');
    expect(container.textContent).toContain('Visitors today 123');
    const link = document.createElement('a');
    link.href =
      'https://unirise.tw/en/downloads?id=78&email=private@example.com';
    document.body.appendChild(link);
    link.addEventListener('click', (event) => event.preventDefault());
    await act(async () =>
      link.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ),
    );
    link.remove();
    expect(requests).toContainEqual({
      url: '/api/analytics',
      body: {
        locale: 'en',
        name: 'download_click',
        path: '/en/downloads?id=78',
        metadata: { downloadId: '78' },
      },
    });
    expect(JSON.stringify(requests)).not.toContain('private@example.com');
  });

  it('sends current locale on chat and lead requests and preserves the English source path', async () => {
    const labels = structuredClone(initialPublicContent.chrome.text.chat);
    labels.suggestions = ['Inspection equipment'];
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected JSON request body');
        requests.push({ url, body: JSON.parse(init.body) });
        return Response.json(
          url === '/api/chat'
            ? {
                answer: 'Verified answer',
                sources: [{ title: 'Internal technical document, page 3' }],
              }
            : { accepted: true },
        );
      }),
    );
    await act(async () =>
      root.render(<SupportChat locale="en" labels={labels} />),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-controls="support-chat-panel"]',
        )!
        .click(),
    );
    const suggestion = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Inspection equipment',
    )!;
    await act(async () => suggestion.click());
    expect(container.textContent).toContain('Verified answer');
    expect(container.textContent).not.toContain('Internal technical document');
    expect(requests[0]).toEqual({
      url: '/api/chat',
      body: { locale: 'en', message: 'Inspection equipment', history: [] },
    });
    const quote = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === labels.quote,
    )!;
    await act(async () => quote.click());
    for (const [name, value] of Object.entries({
      name: 'Lin',
      email: 'buyer@example.com',
      message: 'Please quote.',
    })) {
      container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="${name}"]`,
      )!.value = value;
    }
    const leadForm = container
      .querySelector('input[name="name"]')!
      .closest('form')!;
    await act(async () =>
      leadForm.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    expect(requests[1]).toMatchObject({
      url: '/api/leads',
      body: {
        locale: 'en',
        sourcePath: '/en/news',
        name: 'Lin',
        email: 'buyer@example.com',
      },
    });
  });
});
