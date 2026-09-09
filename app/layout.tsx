import './globals.css';
import './fidelity.css';
import { siteMetadata } from '../lib/site-metadata';

export const metadata = siteMetadata;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><body>{children}</body></html>; }
