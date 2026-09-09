import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({
  assign: vi.fn(),
  cleanups: [] as Array<() => void>,
  effects: [] as Array<() => void | (() => void)>,
  hash: '#news',
  hookIndex: 0,
  listeners: new Map<string, Set<() => void>>(),
  locationReads: 0,
  search: '?flag',
  state: [] as unknown[],
  reset() {
    this.assign.mockReset();
    this.cleanups = [];
    this.effects = [];
    this.hash = '#news';
    this.hookIndex = 0;
    this.listeners = new Map();
    this.locationReads = 0;
    this.search = '?flag';
    this.state = [];
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/catalog',
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      browser.effects.push(effect);
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

type LanguageLink = {
  props: {
    href: string;
    onClick: (event: { preventDefault: () => void }) => void;
  };
};

function renderLanguageSwitcher() {
  browser.hookIndex = 0;
  return LanguageSwitcher();
}

function languageLinks() {
  const element = renderLanguageSwitcher();
  return element.props.children as LanguageLink[];
}

function languageHrefs() {
  return languageLinks().map((link) => link.props.href);
}

function flushEffects() {
  const effects = browser.effects.splice(0);
  effects.forEach((effect) => {
    const cleanup = effect();
    if (cleanup) browser.cleanups.push(cleanup);
  });
}

beforeEach(() => {
  browser.reset();
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('window', {
    addEventListener: (event: string, listener: () => void) => {
      const listeners = browser.listeners.get(event) ?? new Set<() => void>();
      listeners.add(listener);
      browser.listeners.set(event, listeners);
    },
    location: {
      assign: browser.assign,
      get hash() {
        browser.locationReads += 1;
        return browser.hash;
      },
      get search() {
        browser.locationReads += 1;
        return browser.search;
      },
    },
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
  it('renders deterministically without reading browser location before mount', () => {
    expect(languageHrefs()).toEqual(['/catalog', '/en/catalog']);
    expect(browser.locationReads).toBe(0);
  });

  it('uses the raw browser query and hash after mount', () => {
    renderLanguageSwitcher();
    flushEffects();

    expect(languageHrefs()).toEqual(['/catalog?flag#news', '/en/catalog?flag#news']);
  });

  it('updates language links when the browser hash changes', () => {
    renderLanguageSwitcher();
    flushEffects();
    browser.hash = '#brands';
    const listeners = browser.listeners.get('hashchange');

    expect(listeners).toBeDefined();
    listeners?.forEach((listener) => listener());

    expect(languageHrefs()).toEqual(['/catalog?flag#brands', '/en/catalog?flag#brands']);
  });

  it('corrects an unsynchronized anchor destination at click time', () => {
    const englishLink = languageLinks()[1];
    const preventDefault = vi.fn();

    englishLink.props.onClick({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(browser.assign).toHaveBeenCalledWith('/en/catalog?flag#news');
  });
});
