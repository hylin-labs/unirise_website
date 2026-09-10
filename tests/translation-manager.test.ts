// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationManager } from '../components/translation-manager';
import { sqliteD1 } from './helpers/sqlite-d1';
import { seedLegacyContent } from '../lib/seed-content';
import * as repository from '../lib/translation-repository';
import { createTranslationsAdminHandler } from '../app/api/admin/translations/route';

vi.mock('cloudflare:workers', () => ({ env: {} }));
const actor = {
  id: 'hungyu@gmail.com',
  email: 'hungyu@gmail.com',
  role: 'admin' as const,
};

describe('translation manager interactions', () => {
  let database: ReturnType<typeof sqliteD1>;
  let container: HTMLDivElement;
  let root: Root;
  let providerFails = false;
  beforeEach(async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    database = sqliteD1();
    await seedLegacyContent(database.d1);
    const handler = createTranslationsAdminHandler(
      database.d1,
      async () => actor,
      {
        groqApiKey: 'test',
        fetcher: async (_url, init) => {
          if (providerFails) return new Response('', { status: 502 });
          if (typeof init?.body !== 'string')
            throw new Error('expected JSON body');
          const input = JSON.parse(init.body);
          const { source } = JSON.parse(input.messages[1].content);
          return Response.json({
            choices: [{ message: { content: JSON.stringify(source) } }],
          });
        },
      },
    );
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      handler(new Request(`https://unirise.test${url}`, init)),
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    providerFails = false;
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await vi.runOnlyPendingTimersAsync();
    });
    container.remove();
    database.sqlite.close();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  async function render() {
    await act(async () => {
      root.render(createElement(TranslationManager));
    });
  }
  async function click(label: string) {
    const button = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === label,
    );
    expect(button, `button ${label} exists`).toBeDefined();
    expect(button!.disabled).toBe(false);
    await act(async () => button!.click());
  }
  async function advance(ms: number) {
    await act(async () => vi.advanceTimersByTimeAsync(ms));
  }

  it('reloads persisted progress and resumes the remaining one-item steps', async () => {
    const sources = (await repository.enumerateSources(database.d1))
      .filter((source) => source.resourceType === 'news')
      .slice(0, 2);
    const job = await repository.createTranslationJob(
      database.d1,
      'reload-job',
      actor,
      sources,
    );
    await render();
    await click('繼續批次');
    await advance(1);
    expect(
      (await repository.listTranslationJobItems(database.d1, job.id)).filter(
        (item) => item.state === 'succeeded',
      ),
    ).toHaveLength(1);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.textContent).toContain('1 / 2 項已處理');
    await click('繼續批次');
    await advance(1);
    expect(container.textContent).toContain('2 / 2 項已處理');
    expect(
      (await repository.getTranslationJob(database.d1, job.id))?.state,
    ).toBe('completed');
  });

  it('offers failed-item retry and completes the same item through the UI', async () => {
    const source = (await repository.getCanonicalSource(
      database.d1,
      'news',
      '3944',
    ))!;
    const job = await repository.createTranslationJob(
      database.d1,
      'retry-ui',
      actor,
      [source],
    );
    providerFails = true;
    await render();
    await click('繼續批次');
    await advance(1);
    expect(container.textContent).toContain('翻譯服務暫時無法使用');
    providerFails = false;
    await click('重試此項');
    await advance(1);
    expect(container.textContent).toContain('成功 1');
    expect(
      (await repository.listTranslationJobItems(database.d1, job.id))[0]
        .attempts,
    ).toBe(2);
  });

  it('opens outdated English against current source literals so a manual update can be saved', async () => {
    const source = (await repository.getCanonicalSource(
      database.d1,
      'news',
      '3944',
    ))!;
    await repository.saveTranslation(
      database.d1,
      { ...source, origin: 'ai', status: 'needs_review' },
      actor,
    );
    const changed = structuredClone(source);
    if (changed.payload.kind !== 'news') throw new Error('expected news');
    changed.payload.literals.imageUrl = '/reference/new-image.jpg';
    await repository.updateCanonicalSource(database.d1, changed, actor);
    await render();
    const select = container.querySelector(
      'select',
    ) as unknown as HTMLSelectElement;
    await act(async () => {
      select.value = 'news';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const resource = Array.from(container.querySelectorAll('article')).find(
      (article) => article.textContent?.includes('雞骨、魚刺 X 光異物檢測機'),
    );
    // Locate by source title so this checks the resource chosen by the administrator.
    const card =
      resource ??
      Array.from(container.querySelectorAll('article')).find((article) =>
        article.textContent?.includes(
          source.payload.kind === 'news' ? source.payload.text.title : '',
        ),
      )!;
    const edit = Array.from(card.querySelectorAll('button')).find(
      (button) => button.textContent === '編輯英文與預覽',
    )!;
    await act(async () => edit.click());
    await click('預覽英文');
    expect(container.querySelector('[aria-label="英文預覽"]')).not.toBeNull();
    await act(async () =>
      container
        .querySelector('form')!
        .dispatchEvent(
          new Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
    const saved = await repository.getTranslation(database.d1, 'news', '3944');
    expect(saved).toMatchObject({
      sourceVersion: 2,
      origin: 'human',
      status: 'draft',
      payload: { literals: { imageUrl: '/reference/new-image.jpg' } },
    });
    expect(container.querySelector('form')).toBeNull();
  });
});
