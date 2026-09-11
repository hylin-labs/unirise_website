import './globals.css';
import './fidelity.css';
import { localizedPageMetadata } from '../lib/locale-seo';

export const metadata = localizedPageMetadata('zh-TW', '/');
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><body>{children}</body></html>; }
