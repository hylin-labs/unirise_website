'use client';

import { useEffect } from 'react';
import type { Locale } from '../lib/locales';

/** Updates the one root document element without rendering a nested html tag. */
export function LocaleDocumentLanguage({ locale }: { locale: Locale }) {
  useEffect(() => {
    const documentElement = document.documentElement;
    const previous = documentElement.lang;
    documentElement.lang = locale === 'en' ? 'en' : 'zh-Hant';
    return () => {
      documentElement.lang = previous;
    };
  }, [locale]);
  return null;
}
