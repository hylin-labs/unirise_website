import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
  hookIndex: 0,
  listeners: new Map<string, Set<() => void>>(),
  location: { hash: '#news', search: '?flag' },
  state: [] as unknown[],
  reset() {
    this.cleanups = [];
    this.hookIndex = 0;
    this.listeners = new Map();
    this.location = { hash: '#news', search: '?flag' };
    this.state = [];
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/catalog',
  useSearchParams: () => ({ toString: () => 'flag=' }),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) browser.cleanups.push(cleanup);
    },
    useState: <Value,>(initial: Value | (() => Value)) => {
      const index = browser.hookIndex++;
      if (browser.state.length <= index) {
        browser.state[index] = typeof initial === 'function' ? (initial as () => Value)() : initial;
      }
      const setValue = (next: Value | ((previous: Value) => Value)) => {
        const previous = browser.state[index] as Value;
        browser.state[index] = typeof next === 'function'
          ? (next as (previous: Value) => Value)(previous)
          : next;
      };
      return [browser.state[index] as Value, setValue] as const;
    },
  };
});

import { LanguageSwitcher } from '../components/language-switcher';

function renderLanguageSwitcher() {
  browser.hookIndex = 0;
  return LanguageSwitcher();
}

function languageHrefs() {
  const element = renderLanguageSwitcher();
  return (element.props.children as Array<{ props: { href: string } }>).map((child) => child.props.href);
}

beforeEach(() => {
  browser.reset();
  vi.stubGlobal('window', {
    addEventListener: (event: string, listener: () => void) => {
      const listeners = browser.listeners.get(event) ?? new Set<() => void>();
      listeners.add(listener);
      browser.listeners.set(event, listeners);
    },
    location: browser.location,
    removeEventListener: (event: string, listener: () => void) => {
      browser.listeners.get(event)?.delete(listener);
    },
  });
});

afterEach(() => {
  browser.cleanups.forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});

describe('LanguageSwitcher', () => {
  it('keeps a bare browser query flag and initial hash in its language links', () => {
    expect(languageHrefs()).toEqual(['/catalog?flag#news', '/en/catalog?flag#news']);
  });

  it('updates language links when the browser hash changes', () => {
    languageHrefs();
    browser.location.hash = '#brands';
    const listeners = browser.listeners.get('hashchange');

    expect(listeners).toBeDefined();
    listeners?.forEach((listener) => listener());

    expect(languageHrefs()).toEqual(['/catalog?flag#brands', '/en/catalog?flag#brands']);
  });
});
