import { Fragment, type ReactNode } from 'react';
import { OriginalFooter, OriginalHeader } from '../app/original-shell';
import type { Locale } from '../lib/locales';
import { localizedPath, type PublicPath } from '../lib/localized-route';
import type { ChromePayload } from '../lib/translation-types';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- Keep the original public shell assets, anchors, and layout dimensions. */

type Breadcrumb = { label: string; href?: string };

export function PublicInnerPage({
  locale,
  path,
  chrome,
  title,
  eyebrow,
  breadcrumbs,
  contentClassName,
  children,
}: {
  locale: Locale;
  path: PublicPath;
  chrome: ChromePayload;
  title: string;
  eyebrow: string;
  breadcrumbs: Breadcrumb[];
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <main id="top" className="original-home original-inner-page">
      <OriginalHeader
        locale={locale}
        chrome={chrome}
        pathname={localizedPath(locale, path)}
      />
      <section className="original-sub-banner">
        <img src="/reference/original/subbanner.png" alt="" />
      </section>
      <section
        className={`original-inner-content${contentClassName ? ` ${contentClassName}` : ''}`}
      >
        <nav className="original-breadcrumb">
          <a href={localizedPath(locale, '/')}>{chrome.text.home}</a>
          {breadcrumbs.map((entry, index) => (
            <Fragment key={index}>
              <span>/</span>
              {entry.href ? (
                <a href={entry.href}>{entry.label}</a>
              ) : (
                <strong>{entry.label}</strong>
              )}
            </Fragment>
          ))}
        </nav>
        <div className="original-inner-title">
          <span>{eyebrow}</span>
          <small>{title}</small>
        </div>
        {children}
      </section>
      <OriginalFooter locale={locale} chrome={chrome} />
    </main>
  );
}
