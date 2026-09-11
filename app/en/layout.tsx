import type { Metadata } from 'next';
import { LocaleDocumentLanguage } from '../../components/locale-document-language';
import { localizedPageMetadata } from '../../lib/locale-seo';

export const metadata: Metadata = localizedPageMetadata('en', '/');

export default function EnglishLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <LocaleDocumentLanguage locale="en" />
      {children}
    </>
  );
}
