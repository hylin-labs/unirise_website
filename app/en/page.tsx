import type { Metadata } from 'next';
import { PublicHomeRoute } from '../page';

export const metadata: Metadata = {
  title: 'Unirise Technology Inc. | Food Sorting and Inspection Solutions',
  description:
    'Food sorting, X-ray inspection, recycling, and plastics processing solutions from Unirise Technology Inc.',
  alternates: { canonical: '/en', languages: { 'zh-TW': '/', en: '/en' } },
  other: { 'content-language': 'en' },
};

export default function EnglishHomePage() {
  return <PublicHomeRoute locale="en" />;
}
