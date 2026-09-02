'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';

const slides = [
  { image: '/reference/hero-xavis.png', label: 'XAVIS' },
  { image: '/reference/hero-optimum.png', label: 'Optimum' },
];
const navItems = ['產業服務', '代理品牌', '最新消息', '下載專區', '詢價系統', '聯絡我們'];
const services = [
  ['食材分選', '以光學科技提升品質與產能', '/reference/feature-food.jpg'],
  ['X光機異物檢測', '讓每一道檢測更精準可靠', '/reference/feature-xray.jpg'],
  ['回收再生', '以智慧分選開創循環價值', '/reference/feature-recycle.jpg'],
  ['塑膠化工', '從材料到製程的專業支援', '/reference/feature-plastic.jpg'],
];
const news = [
  ['2025.10.01', '食品安全與自動化檢測，讓每個環節都更值得信賴。'],
  ['2025.07.21', '智慧分選解決方案，協助產線持續提高效能。'],
  ['2025.05.13', '完整產品資訊與技術服務，歡迎與我們聯絡。'],
];

export default function Home() {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 7000);
    return () => window.clearInterval(timer);
  }, []);
  const previous = () => setSlide((current) => (current - 1 + slides.length) % slides.length);
  const next = () => setSlide((current) => (current + 1) % slides.length);
  return <main id="top">
    <header className="site-header">
      <div className="utility-bar"><div className="shell utility-inner">
        <div className="utility-links"><a href="#contact">公司地址</a><i /> <a href="#contact">聯絡我們</a><i /> <a href="#services">搜尋</a></div>
        <img className="brand-logo" src="/reference/logo.png" alt="UniRise 合軒科技有限公司" />
        <div className="utility-links right"><a href="#contact">詢問車</a><i /> <a href="#">語系</a><i /> <span className="translate">Select Language⌄</span></div>
      </div></div>
      <nav className="main-nav"><div className="shell nav-inner">
        <button className="menu-button" type="button" aria-label="開啟選單" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={24} /> : <Menu size={24} />}</button>
        <div className={`nav-links ${menuOpen ? 'is-open' : ''}`}>{navItems.map((item, index) => <a key={item} href={index === 0 ? '#services' : index === 2 ? '#news' : '#contact'} onClick={() => setMenuOpen(false)}>{item}</a>)}</div>
      </div></nav>
    </header>
    <section className="hero" aria-label="主視覺輪播">
      {slides.map((item, index) => <div key={item.label} className={`hero-slide ${slide === index ? 'active' : ''}`} aria-hidden={slide !== index}><img src={item.image} alt="" /></div>)}
      <button className="hero-arrow left" type="button" aria-label="上一張" onClick={previous}><ChevronLeft /></button><button className="hero-arrow right" type="button" aria-label="下一張" onClick={next}><ChevronRight /></button>
      <div className="hero-indicator" aria-label={`目前為第 ${slide + 1} 張，共 ${slides.length} 張`}>{slides.map((item, index) => <button key={item.label} type="button" onClick={() => setSlide(index)} aria-label={`切換至 ${item.label}`} className={slide === index ? 'current' : ''} />)}</div>
    </section>
    <section className="intro shell" id="services"><div className="section-kicker">OUR SERVICES</div><h1>產業服務</h1><p>專注於食品、回收再生與塑膠化工領域，提供精密設備、完整技術支援與可信賴的服務。</p>
      <div className="service-grid">{services.map(([title, description, image], index) => <article className="service-card" key={title}><img src={image} alt="" /><div className="service-content"><span>0{index + 1}</span><h2>{title}</h2><p>{description}</p><a href="#contact">了解更多 <b>→</b></a></div></article>)}</div>
    </section>
    <section className="brands"><div className="shell brand-content"><div><div className="section-kicker">PARTNER BRANDS</div><h2>代理品牌</h2><p>整合國際設備與在地服務，讓高品質解決方案真正落地於您的產線。</p></div><div className="brand-list"><span>OPTIMUM</span><span>XAVIS</span><span>SMART<br />GRADER</span><span>NIHOT</span><span>PROMIX</span><span>MEAF</span></div></div></section>
    <section className="news shell" id="news"><div className="news-head"><div><div className="section-kicker">WHAT'S NEW</div><h2>最新消息</h2></div><a href="#contact">所有消息 →</a></div><div className="news-list">{news.map(([date, copy]) => <article key={date}><time>{date}</time><p>{copy}</p><a href="#contact" aria-label={`閱讀 ${copy}`}>↗</a></article>)}</div></section>
    <footer id="contact"><div className="footer-main"><div className="shell footer-grid"><div><img src="/reference/logo.png" alt="UniRise 合軒科技有限公司" /><div className="footer-links">{navItems.map((item) => <a href="#services" key={item}>{item}</a>)}</div><div className="social">f　LINE　▶　◎</div></div><address><a href="tel:063319283">☎　06-3319283</a><a href="mailto:info-unirise@unirise.tw">✉　info-unirise@unirise.tw</a><span>●　台南市東區裕義路598號</span></address></div></div><div className="footer-bottom"><div className="shell">Copyright © 2021 合軒科技有限公司 All Rights Reserved.</div></div></footer>
    <a className="to-top" href="#top" aria-label="回到頁面頂端">TOP</a>
  </main>;
}
