// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminDashboard } from '../components/admin-dashboard';
import {
  bilingualRouteInventory,
  PUBLIC_PATHS,
} from '../lib/public-route-inventory.mjs';
import { alternateLocalePath } from '../lib/localized-route';
import { localizedSitemapEntries, siteOrigin } from '../lib/locale-seo';

afterEach(() => vi.unstubAllGlobals());

it('uses one public inventory for reciprocal links and sitemap coverage', () => {
  const inputs = { newsIds: ['3944'], downloadIds: ['3853'] };
  const routes = bilingualRouteInventory(inputs);
  const urls = localizedSitemapEntries(inputs).map(({ url }) => url);
  expect(PUBLIC_PATHS).toHaveLength(6);
  const publicFolders = readdirSync(resolve('app'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !['admin', 'api', 'en'].includes(entry.name) &&
        existsSync(resolve('app', entry.name, 'page.tsx')),
    )
    .map((entry) => `/${entry.name}`);
  expect([...PUBLIC_PATHS].sort()).toEqual(['/', ...publicFolders].sort());
  for (const path of PUBLIC_PATHS) {
    expect(
      existsSync(
        resolve(
          'app/en',
          path === '/' ? 'page.tsx' : `${path.slice(1)}/page.tsx`,
        ),
      ),
    ).toBe(true);
  }
  for (const path of routes) {
    const url = new URL(path, siteOrigin);
    expect(url.origin).toBe(siteOrigin);
    expect(urls).toContain(url.href);
    const alternate = alternateLocalePath(url.pathname, url.search);
    const translated = new URL(alternate, siteOrigin);
    expect(translated.origin).toBe(siteOrigin);
    expect(alternateLocalePath(translated.pathname, translated.search)).toBe(
      path,
    );
  }
});

it('shows both locale metrics and the language of unanswered questions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const metrics = {
    uniqueVisitors: 5,
    pageViews: 8,
    downloadClicks: 2,
    chatQuestions: 4,
    chatAnswerRate: 0.75,
    unansweredQuestions: 1,
    leads: 1,
    leadConversionRate: 0.2,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        metrics,
        byLocale: {
          'zh-TW': { metrics, topPages: [], topDownloads: [] },
          en: {
            metrics: { ...metrics, uniqueVisitors: 2, leadConversionRate: 0.5 },
            topPages: [],
            topDownloads: [],
          },
        },
        topPages: [],
        topDownloads: [],
        unansweredQuestions: [
          {
            id: 'q',
            locale: 'en',
            question: 'Spare parts?',
            createdAt: '2026-09-11T00:00:00Z',
            sourceIds: [],
          },
        ],
      }),
    ),
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        createElement(AdminDashboard, {
          identity: { id: 'admin', email: 'admin@example.test', role: 'admin' },
        }),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const table = container.querySelector('table[aria-label="語系成效比較"]');
    expect(table?.textContent).toContain('繁體中文');
    expect(table?.textContent).toContain('English');
    expect(table?.textContent).toContain('50.0%');
    const gapButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === '聊天缺口',
    )!;
    await act(async () => gapButton.click());
    expect(container.textContent).toContain('語系：English');
    expect(container.textContent).toContain('Spare parts?');
  } finally {
    await act(async () => root.unmount());
  }
});
