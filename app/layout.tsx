import type { Metadata } from 'next';
import './globals.css';
import './fidelity.css';
export const metadata: Metadata = {
  title: '合軒科技有限公司 | Unirise Technology Inc.',
  description: '食品分選、X光異物檢測、回收再生與塑膠化工解決方案。',
  openGraph: { title: '合軒科技有限公司', description: '精密分選・X光檢測・回收再生', images: [{ url: '/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: '合軒科技有限公司', description: '精密分選・X光檢測・回收再生', images: ['/og.png'] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-Hant"><body>{children}</body></html>; }
