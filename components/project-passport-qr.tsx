'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { Locale } from '../lib/locales';

export function ProjectPassportQr({ href, locale }: { href: string; locale: Locale }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    QRCode.toDataURL(new URL(href, window.location.origin).toString(), {
      errorCorrectionLevel: 'M', margin: 1, width: 220,
    }).then(setImage).catch(() => setImage(''));
  }, [href]);
  if (!image) return null;
  return (
    <figure className="project-passport-qr">
      {/* oxlint-disable-next-line next/no-img-element -- The QR code is generated in-browser as a data URL and is not an optimizable remote asset. */}
      <img src={image} width="220" height="220" alt={locale === 'en' ? 'QR code for this solution passport' : '本方案護照的 QR Code'} />
      <figcaption>{locale === 'en' ? 'Scan to open this shareable solution passport.' : '掃描即可開啟此可分享的方案護照。'}</figcaption>
    </figure>
  );
}
