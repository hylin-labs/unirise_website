import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  parseLocale,
  parseLocaleOrDefault,
} from '../lib/locales';
import {
  alternateLocalePath,
  localeFromPathname,
  localizedPath,
  publicPathWithoutLocale,
} from '../lib/localized-route';

describe('locale contract', () => {
  it('accepts only the supported locales', () => {
    expect(DEFAULT_LOCALE).toBe('zh-TW');
    expect(LOCALE_COOKIE_NAME).toBe('unirise_locale');
    expect(parseLocale('zh-TW')).toBe('zh-TW');
    expect(parseLocale('en')).toBe('en');
    expect(parseLocale('en-US')).toBeNull();
    expect(parseLocaleOrDefault('unexpected')).toBe('zh-TW');
  });
});

describe('localized public routes', () => {
  it.each([
    ['/', '/en'],
    ['/catalog', '/en/catalog'],
    ['/news', '/en/news'],
    ['/downloads', '/en/downloads'],
    ['/contact', '/en/contact'],
    ['/inquiry', '/en/inquiry'],
  ])('maps %s to its English equivalent %s', (zhPath, enPath) => {
    expect(localizedPath('en', zhPath)).toBe(enPath);
    expect(localizedPath('zh-TW', enPath)).toBe(zhPath);
    expect(alternateLocalePath(zhPath)).toBe(enPath);
    expect(alternateLocalePath(enPath)).toBe(zhPath);
  });

  it.each([
    ['/catalog', '?type=brand&id=89'],
    ['/news', '?id=3944'],
    ['/downloads', '?id=3853'],
    ['/inquiry', '?product=Optimum%20Optical'],
  ])('preserves supplied query strings for %s', (pathname, search) => {
    expect(localizedPath('en', pathname, search)).toBe(`/en${pathname}${search}`);
    expect(alternateLocalePath(`/en${pathname}`, search)).toBe(`${pathname}${search}`);
  });

  it.each(['#news', '#brands', '#contact'])('preserves supplied anchors', (hash) => {
    expect(localizedPath('en', '/', '', hash)).toBe(`/en${hash}`);
    expect(alternateLocalePath('/en', '', hash)).toBe(`/${hash}`);
  });

  it('rejects unsafe and unsupported paths instead of producing an external URL', () => {
    expect(publicPathWithoutLocale('//attacker.example')).toBeNull();
    expect(localeFromPathname('//attacker.example')).toBeNull();
    expect(localizedPath('en', '//attacker.example')).toBe('/en');
    expect(alternateLocalePath('//attacker.example')).toBe('/');
  });
});
