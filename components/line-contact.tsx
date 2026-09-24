'use client';

/* oxlint-disable next/no-img-element -- QR data URLs are generated in the browser and cannot use an image optimizer. */

import QRCode from 'qrcode';
import { useEffect, useId, useState } from 'react';
import type { Locale } from '../lib/locales';

type PublicLineContact = {
  id: string;
  labelZh: string;
  labelEn: string;
  lineUrl: string | null;
  qrImageUrl: string | null;
  displayOrder: number;
};

const fallbackContacts: PublicLineContact[] = [
  {
    id: 'hungyu-test',
    labelZh: 'Hungyu（測試聯絡）',
    labelEn: 'Hungyu (test contact)',
    lineUrl: 'https://line.me/ti/p/Rg3ax2MQJn',
    qrImageUrl: null,
    displayOrder: 0,
  },
];

function isContact(value: unknown): value is PublicLineContact {
  if (!value || typeof value !== 'object') return false;
  const contact = value as Record<string, unknown>;
  return (
    typeof contact.id === 'string' &&
    typeof contact.labelZh === 'string' &&
    typeof contact.labelEn === 'string' &&
    (contact.lineUrl === null || typeof contact.lineUrl === 'string') &&
    (contact.qrImageUrl === null || typeof contact.qrImageUrl === 'string') &&
    typeof contact.displayOrder === 'number'
  );
}

function contactLabel(contact: PublicLineContact, locale: Locale) {
  return locale === 'en' ? contact.labelEn : contact.labelZh;
}

function useLineContacts(initialContacts = fallbackContacts) {
  const [contacts, setContacts] =
    useState<PublicLineContact[]>(initialContacts);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/line-contacts', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('line_contacts_unavailable');
        const payload = (await response.json()) as { contacts?: unknown };
        if (
          !Array.isArray(payload.contacts) ||
          !payload.contacts.every(isContact)
        )
          throw new Error('line_contacts_invalid');
        setContacts(payload.contacts);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
      });
    return () => controller.abort();
  }, []);
  return contacts;
}

export function LineFooterLink({
  locale,
  fallbackUrl,
}: {
  locale: Locale;
  fallbackUrl: string;
}) {
  const contacts = useLineContacts([
    { ...fallbackContacts[0], lineUrl: fallbackUrl, qrImageUrl: null },
  ]);
  const firstContact = contacts.find((contact) => contact.lineUrl);
  if (!firstContact?.lineUrl) return null;
  return (
    <a
      href={firstContact.lineUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={
        locale === 'en' ? 'Contact us via LINE' : '透過 LINE 聯絡我們'
      }
    >
      <i className="original-icomoon original-line" aria-hidden="true" />
    </a>
  );
}

export function LineFloatingContact({ locale }: { locale: Locale }) {
  const contacts = useLineContacts();
  const [open, setOpen] = useState(false);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const panelId = useId();
  useEffect(() => {
    let active = true;
    const contactsWithoutUploadedQr = contacts.filter(
      (contact): contact is PublicLineContact & { lineUrl: string } =>
        !contact.qrImageUrl && typeof contact.lineUrl === 'string',
    );
    void Promise.all(
      contactsWithoutUploadedQr.map(
        async (contact) =>
          [
            contact.id,
            await QRCode.toDataURL(contact.lineUrl, {
              width: 128,
              margin: 1,
              errorCorrectionLevel: 'M',
              color: { dark: '#1a1a1a', light: '#ffffff' },
            }),
          ] as const,
      ),
    ).then((entries) => {
      if (active) setQrCodes(Object.fromEntries(entries) as Record<string, string>);
    });
    return () => {
      active = false;
    };
  }, [contacts]);
  if (!contacts.length) return null;
  const title = locale === 'en' ? 'Contact us on LINE' : '透過 LINE 聯絡';
  const chooseText =
    locale === 'en'
      ? 'Choose a contact and scan or open LINE.'
      : '選擇聯絡窗口，掃描 QR Code 或直接開啟 LINE。';
  return (
    <div className="line-floating-contact">
      {open ? (
        <section
          className="line-floating-panel"
          id={panelId}
          aria-label={title}
        >
          <div className="line-floating-panel-heading">
            <strong>{title}</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={
                locale === 'en' ? 'Close LINE contacts' : '關閉 LINE 聯絡窗口'
              }
            >
              ×
            </button>
          </div>
          <p>{chooseText}</p>
          <div className="line-contact-list">
            {contacts.map((contact) => {
              const content = (
                <>
                  {contact.qrImageUrl || qrCodes[contact.id] ? (
                    <img src={contact.qrImageUrl ?? qrCodes[contact.id]} alt="" />
                  ) : (
                    <span className="line-qr-loading" aria-hidden="true" />
                  )}
                  <span>
                    <strong>{contactLabel(contact, locale)}</strong>
                    <small>
                      {contact.lineUrl
                        ? locale === 'en'
                          ? 'Open LINE'
                          : '開啟 LINE'
                        : locale === 'en'
                          ? 'Scan QR Code'
                          : '請掃描 QR Code'}
                    </small>
                  </span>
                </>
              );
              return contact.lineUrl ? (
                <a
                  className="line-contact-card"
                  href={contact.lineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={contact.id}
                >
                  {content}
                </a>
              ) : (
                <div className="line-contact-card" key={contact.id}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
      <button
        type="button"
        className="line-floating-button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <i className="original-icomoon original-line" aria-hidden="true" />
        <span>{locale === 'en' ? 'Contact Unirise' : '聯繫合軒'}</span>
      </button>
    </div>
  );
}
