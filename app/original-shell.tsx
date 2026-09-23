'use client';

import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { LanguageSwitcher } from '../components/language-switcher';
import { SupportChat } from '../components/support-chat';
import type { Locale } from '../lib/locales';
import { localizedPath } from '../lib/localized-route';
import { initialPublicContent } from '../lib/public-content';
import type { ChromePayload } from '../lib/translation-types';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- Shared public chrome preserves original image dimensions and native anchors so its reproduced layout and navigation stay unchanged. */

type MenuKind = 'industry' | 'brand';

function internalHref(locale: Locale, href: string) {
  const url = new URL(href, 'https://unirise.invalid');
  return localizedPath(locale, url.pathname, url.search, url.hash);
}

function productHref(locale: Locale, kind: MenuKind, id: string) {
  return localizedPath(locale, '/catalog', `?type=${kind}&id=${id}`);
}

function Dropdown({
  chrome,
  groups,
  kind,
  locale,
}: {
  chrome: ChromePayload;
  groups: ChromePayload['text']['industryMenu'];
  kind: MenuKind;
  locale: Locale;
}) {
  const literalGroups = chrome.literals[`${kind}Menu`];
  return (
    <div className={`original-dropdown ${kind === 'brand' ? 'is-wide' : ''}`}>
      {groups.map((group, index) => {
        const literalGroup = literalGroups[index];
        return (
          <div
            className="original-menu-group"
            key={`${kind}-${literalGroup.id}`}
          >
            <a
              className="original-menu-title"
              href={productHref(locale, kind, literalGroup.id)}
            >
              {group.title}
              <i
                className="original-fa original-fa-angle-right"
                aria-hidden="true"
              />
            </a>
            <div className="original-submenu">
              {group.items.map((item, itemIndex) => (
                <a
                  href={productHref(
                    locale,
                    kind,
                    literalGroup.items[itemIndex],
                  )}
                  key={`${literalGroup.items[itemIndex]}-${item}`}
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type ChromeProps = {
  locale?: Locale;
  chrome?: ChromePayload;
  pathname?: string;
};

export function OriginalHeader({
  locale = 'zh-TW',
  chrome = initialPublicContent.chrome,
  pathname,
}: ChromeProps) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<string | null>(null);
  const nav = chrome.text.nav;
  const firstIndustryId = chrome.literals.industryMenu[0].items[0];
  const firstBrandId = chrome.literals.brandMenu[0].id;
  return (
    <header className="original-header">
      <div className="original-header-top">
        <div className="original-top-links">
          <a href={chrome.literals.addressUrl} target="_blank" rel="noreferrer">
            {chrome.text.address}
          </a>
          <a href={localizedPath(locale, '/contact')}>{chrome.text.contact}</a>
          <a href={localizedPath(locale, '/search')}>
            <i className="original-fa original-fa-search" aria-hidden="true" />
            {chrome.text.search}
          </a>
        </div>
        <a href={localizedPath(locale, '/')} aria-label={chrome.text.homeLink}>
          <img
            src={chrome.literals.logoUrl}
            width="347"
            height="90"
            alt={chrome.text.company}
          />
        </a>
        <div className="original-top-links right">
          <a href={localizedPath(locale, '/inquiry')}>
            <i className="original-fa original-fa-cart" aria-hidden="true" />
            {chrome.text.cart}
          </a>
          <span className="original-language-label">{chrome.text.language}</span>
          <span className="original-language-switcher">
            <LanguageSwitcher pathname={pathname} />
          </span>
        </div>
      </div>
      <nav className="original-main-nav" aria-label={chrome.text.menu}>
        <button
          className="original-mobile-toggle"
          type="button"
          onClick={() => setMobileMenu((value) => !value)}
          aria-expanded={mobileMenu}
          aria-label={chrome.text.openMenu}
        >
          {mobileMenu ? <X /> : <Menu />}
        </button>
        <div className={`original-nav-list ${mobileMenu ? 'open' : ''}`}>
          <div className="original-mobile-utilities">
            <a href={localizedPath(locale, '/search')}>
              <i className="original-fa original-fa-search" aria-hidden="true" />
              {chrome.text.search}
            </a>
            <span className="original-mobile-language">
              <span>{chrome.text.language}</span>
              <LanguageSwitcher pathname={pathname} />
            </span>
          </div>
          <div
            className={`original-nav-item ${mobilePanel === 'industry' ? 'mobile-open' : ''}`}
          >
            <a href={productHref(locale, 'industry', firstIndustryId)}>
              {nav[0]}
            </a>
            <button
              className="original-submenu-toggle"
              type="button"
              onClick={() =>
                setMobilePanel((value) =>
                  value === 'industry' ? null : 'industry',
                )
              }
              aria-label={chrome.text.expandIndustry}
              aria-expanded={mobilePanel === 'industry'}
            >
              <i
                className={`original-fa ${mobilePanel === 'industry' ? 'original-fa-minus' : 'original-fa-plus'}`}
                aria-hidden="true"
              />
            </button>
            <Dropdown
              chrome={chrome}
              groups={chrome.text.industryMenu}
              kind="industry"
              locale={locale}
            />
          </div>
          <div
            className={`original-nav-item ${mobilePanel === 'brand' ? 'mobile-open' : ''}`}
          >
            <a href={productHref(locale, 'brand', firstBrandId)}>{nav[1]}</a>
            <button
              className="original-submenu-toggle"
              type="button"
              onClick={() =>
                setMobilePanel((value) => (value === 'brand' ? null : 'brand'))
              }
              aria-label={chrome.text.expandBrand}
              aria-expanded={mobilePanel === 'brand'}
            >
              <i
                className={`original-fa ${mobilePanel === 'brand' ? 'original-fa-minus' : 'original-fa-plus'}`}
                aria-hidden="true"
              />
            </button>
            <Dropdown
              chrome={chrome}
              groups={chrome.text.brandMenu}
              kind="brand"
              locale={locale}
            />
          </div>
          <div className="original-nav-item">
            <a href={internalHref(locale, chrome.literals.navUrls[2])}>
              {nav[2]}
            </a>
          </div>
          <div
            className={`original-nav-item ${mobilePanel === 'downloads' ? 'mobile-open' : ''}`}
          >
            <a href={localizedPath(locale, '/downloads')}>{nav[3]}</a>
            <button
              className="original-submenu-toggle"
              type="button"
              onClick={() =>
                setMobilePanel((value) =>
                  value === 'downloads' ? null : 'downloads',
                )
              }
              aria-label={chrome.text.expandDownloads}
              aria-expanded={mobilePanel === 'downloads'}
            >
              <i
                className={`original-fa ${mobilePanel === 'downloads' ? 'original-fa-minus' : 'original-fa-plus'}`}
                aria-hidden="true"
              />
            </button>
            <div className="original-dropdown downloads-menu">
              {chrome.text.downloads.map((label, index) => (
                <a
                  href={localizedPath(
                    locale,
                    '/downloads',
                    `?id=${chrome.literals.downloadIds[index]}`,
                  )}
                  key={chrome.literals.downloadIds[index]}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div className="original-nav-item">
            <a href={internalHref(locale, chrome.literals.navUrls[4])}>
              {nav[4]}
            </a>
          </div>
          <div className="original-nav-item">
            <a href={internalHref(locale, chrome.literals.navUrls[5])}>
              {nav[5]}
            </a>
          </div>
        </div>
      </nav>
    </header>
  );
}

export function OriginalFooter({
  locale = 'zh-TW',
  chrome = initialPublicContent.chrome,
}: ChromeProps) {
  const copyright = chrome.text.copyright.replace(
    /\b20\d{2}\b/,
    String(new Date().getFullYear()),
  );
  return (
    <>
      <footer className="original-footer" id="contact">
        <div className="original-container original-footer-grid">
          <div>
            <nav>
              {chrome.text.nav.map((label, index) => (
                <a
                  href={internalHref(locale, chrome.literals.navUrls[index])}
                  key={chrome.literals.navUrls[index]}
                >
                  {label}
                </a>
              ))}
            </nav>
            <div className="original-social">
              <a
                href={chrome.literals.facebookUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
              >
                <i
                  className="original-fa original-fa-facebook"
                  aria-hidden="true"
                />
              </a>
              <a
                href={chrome.literals.lineUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="LINE"
              >
                <i
                  className="original-icomoon original-line"
                  aria-hidden="true"
                />
              </a>
              <a
                href={chrome.literals.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="YouTube"
              >
                <i
                  className="original-fa original-fa-youtube"
                  aria-hidden="true"
                />
              </a>
              <span aria-label="Instagram">
                <i
                  className="original-fa original-fa-instagram"
                  aria-hidden="true"
                />
              </span>
            </div>
          </div>
          <div className="original-footer-info">
            <img
              src={chrome.literals.footerLogoUrl}
              alt={chrome.text.company}
            />
            <a href={chrome.literals.phoneUrl}>
              <i className="original-fa original-fa-phone" aria-hidden="true" />
              <span> {chrome.literals.phone}</span>
            </a>
            <a href={chrome.literals.emailUrl}>
              <i
                className="original-fa original-fa-envelope"
                aria-hidden="true"
              />
              {chrome.literals.email}
            </a>
            <a
              href={chrome.literals.footerAddressUrl}
              target="_blank"
              rel="noreferrer"
            >
              <i className="original-fa original-fa-map" aria-hidden="true" />
              {chrome.text.footerAddress}
            </a>
          </div>
        </div>
        <div className="original-copyright">
          <div className="original-container">
            {copyright}
          </div>
        </div>
      </footer>
      <a className="original-to-top" href="#top" aria-label={chrome.text.top}>
        <img src="/reference/original/gotop.svg" alt="" />
      </a>
      <SupportChat locale={locale} labels={chrome.text.chat} />
    </>
  );
}
