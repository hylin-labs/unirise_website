// @vitest-environment happy-dom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/catalog',
}));

import { LanguageSwitcher } from '../components/language-switcher';

describe('LanguageSwitcher auxiliary activation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.history.replaceState(null, '', '/catalog?old#brands');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(createElement(LanguageSwitcher));
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.cookie = 'unirise_locale=; Max-Age=0; Path=/';
  });

  it('updates the raw destination through an actual auxiliary-click event without intercepting navigation', () => {
    const englishLink = container.querySelector<HTMLAnchorElement>('a[href^="/en"]');
    const assign = vi.spyOn(window.location, 'assign');

    expect(englishLink?.getAttribute('href')).toBe('/en/catalog?old#brands');
    window.history.replaceState(null, '', '/catalog?flag#news');

    const event = new MouseEvent('auxclick', {
      bubbles: true,
      button: 1,
      cancelable: true,
    });
    englishLink?.dispatchEvent(event);

    expect(englishLink?.getAttribute('href')).toBe('/en/catalog?flag#news');
    expect(event.defaultPrevented).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(document.cookie).toContain('unirise_locale=en');
  });
});
