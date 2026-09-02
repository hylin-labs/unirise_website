'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';

const slides = [{ image: '/reference/hero-xavis.png', label: 'XAVIS' }, { image: '/reference/hero-optimum.png', label: 'Optimum' }];
type MenuGroup = { title: string; items: string[] };
const industryGroups: MenuGroup[] = [
  { title: '食材分選', items: ['OPTIMUM-食材分選', 'Smart Grader-採樣分析'] },
  { title: 'X光機異物檢測', items: ['XAVIS-X光機檢測', 'XAVIS-FSCAN自動重量檢測機', 'XAVIS-FSCAN重量分級檢測機', 'XAVIS-FSCAN鋁箔金屬檢測機'] },
  { title: '回收再生', items: ['NIR手持式分析儀', 'NIHOT-回收再生', 'Matthiessen-破袋機', '合軒'] },
  { title: '塑膠化工', items: ['MEAF-板材押出生產線', 'PROMIX-物理發泡', 'SBI-測厚儀'] },
];
const brandGroups: MenuGroup[] = [
  { title: '品牌介紹', items: ['OPTIMUM', 'XAVIS', 'Smart Grader', 'MEAF', 'PROMIX', 'SBI', 'NIR', 'NIHOT', 'Matthiessen', '合軒'] },
  { title: 'OPTIMUM-食材分選', items: ['NOVUS（皮帶式-適用新鮮、乾燥或冷凍產品）', 'VENTUS（適用堅果和乾果等產品）', 'TRIPLUS（自由落體式-適用新鮮、乾燥或冷凍產品）', 'MAGNUS（適用易碎水果）'] },
  { title: 'XAVIS-自動重量檢測機', items: ['CWF590W輕量型重量檢測機', 'CWF590WR滾輪式重量檢測機', 'CSCAN自動重量檢測機', 'CWIN69X多列式重量檢測機'] },
  { title: 'XAVIS-重量分級檢測機', items: ['XAVIS重量分級檢測機'] },
  { title: 'XAVIS-食品異物X光機檢測', items: ['小包裝／未包裝X光食品自動異物檢測機', '低密度中型包裝／散裝 X光食品自動異物檢測機', '高密度中型包裝 X光食品自動異物檢測機', '管道式 X光食品自動異物檢測機', '大型包裝 X光食品自動異物檢測機', '小型罐頭／瓶子包裝 X光食品自動異物檢測機', '大型罐頭／瓶子包裝 X光食品自動異物檢測機', '魚骨／雞骨專用 X光食品自動異物檢測機'] },
  { title: 'XAVIS-鋁箔金屬檢測機', items: ['MDN-200AD鋁箔金屬檢測機（標準）', 'MDN-200AH鋁箔金屬檢測機（進階）'] },
  { title: 'XAVIS-工業產品X光機檢測', items: ['電池檢測專用'] }, { title: 'Smart Grader-採樣分析', items: ['智慧採樣分析器', '智慧分級機'] }, { title: 'MEAF-板材押出生產線', items: ['板材押出生產線'] }, { title: 'PROMIX-物理發泡', items: ['P1 冷卻混合器', '熔體混合器'] },
  { title: 'SBI-測厚儀', items: ['KAPA I & KAPA II 電容／渦流雙感測厚薄儀', 'KAPA IR 紅外線厚薄儀', 'XRS SOFT X-RAY 低能量X光厚薄儀', 'SHADOW 雷射陰影測量厚薄儀', 'STG 雷射位移測量厚薄儀'] }, { title: 'NIR手持式分析儀', items: ['手持式NIR分析儀-塑料用', '手持式NIR分析儀-紡織用', '手持螢幕NIR分析儀-塑料用'] },
  { title: 'NIHOT-回收再生', items: ['SDM 移動式風選機', 'SDI 風選機', 'WSF 風選機', 'DDS 風選機', 'SDX 風選機', '碟篩'] }, { title: 'Matthiessen-破袋機', items: ['SFIIIK3 破袋機'] }, { title: '合軒', items: ['渦電流分選機', '磁滾筒', '上吸式磁鐵', '鋁罐分選機'] },
];
const downloadGroups: MenuGroup[] = [{ title: '下載專區', items: ['NIHOT-回收再生', 'OPTIMUM-食材分選', 'PROMIX-塑膠化工', 'XAVIS-X光檢測'] }];
const services = [['食材分選', '從天然或加工食品原物料，依顏色與外觀瑕疵完成品質等級分類。', '/reference/feature-food.jpg'], ['X光機異物檢測', '各類食品包裝型態的X光機檢查，為食品出廠前安全把關。', '/reference/feature-xray.jpg'], ['回收再生', '消費端廢棄物整體風選分類設備，支持循環自動化方案。', '/reference/feature-recycle.jpg'], ['塑膠化工', '食品容器生產的物理性發泡技術與量測解決方案。', '/reference/feature-plastic.jpg']];
const news = [['雞骨魚骨專用X光異物檢測機 Xavis', '【AI 智慧辨識低密度骨頭異物，提升食品安全與檢測效率！】'], ['M1 SF 皮帶稱重機和袋裝填充機 Manter', '【溫和秤重、精準填充，打造高效率蔬果包裝產線！】'], ['多段式重量分級機 Xavis', '【精準分級、高效作業，協助水產品加工提升產能與品質一致性】'], ['番茄自動包裝線 Manter', '【從秤重、包裝到棧板堆疊，一站式提升蔬果包裝效率！】']];
const navItems = [{ label: '產業服務', target: '#services', groups: industryGroups }, { label: '代理品牌', target: '#brands', groups: brandGroups }, { label: '最新消息', target: '/news' }, { label: '下載專區', target: '/downloads', groups: downloadGroups }, { label: '詢價系統', target: '/inquiry' }, { label: '聯絡我們', target: '/contact' }];

const catalogLink = (group: string, item = '') => `/catalog?group=${encodeURIComponent(group)}${item ? `&item=${encodeURIComponent(item)}` : ''}`;

function MegaMenu({ groups, label }: { groups: MenuGroup[]; label: string }) { return <div className={`mega-menu ${groups.length > 6 ? 'mega-menu-large' : ''}`} aria-label={`${label}子選單`}>{groups.map((group) => <section className="menu-group" key={group.title}><a className="menu-heading" href={catalogLink(group.title)}>{group.title}</a>{group.items.map((item) => <a href={catalogLink(group.title, item)} key={item}>{item}</a>)}</section>)}</div>; }

export default function Home() {
  const [slide, setSlide] = useState(0); const [menuOpen, setMenuOpen] = useState(false); const [activeMenu, setActiveMenu] = useState<string | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setSlide((current) => (current + 1) % slides.length), 7000); return () => window.clearInterval(timer); }, []);
  const previous = () => setSlide((current) => (current - 1 + slides.length) % slides.length); const next = () => setSlide((current) => (current + 1) % slides.length); const toggleMenu = (label: string) => setActiveMenu((current) => current === label ? null : label);
  return <main id="top"><header className="site-header"><div className="utility-bar"><div className="shell utility-inner"><div className="utility-links"><a href="#contact">公司地址</a><i /> <a href="#contact">聯絡我們</a><i /> <a href="#services">搜尋</a></div><img className="brand-logo" src="/reference/logo.png" alt="UniRise 合軒科技有限公司" /><div className="utility-links right"><a href="#contact">詢問車</a><i /> <a href="#">語系</a><i /> <span className="translate">Select Language⌄</span></div></div></div><nav className="main-nav"><div className="shell nav-inner"><button className="menu-button" type="button" aria-label="開啟選單" onClick={() => { setMenuOpen(!menuOpen); setActiveMenu(null); }}>{menuOpen ? <X size={24} /> : <Menu size={24} />}</button><div className={`nav-links ${menuOpen ? 'is-open' : ''}`}>{navItems.map((item) => <div className="nav-item" key={item.label} onMouseEnter={() => item.groups && setActiveMenu(item.label)} onMouseLeave={() => item.groups && setActiveMenu(null)}><a href={item.target} onClick={(event) => { if (item.groups) { event.preventDefault(); toggleMenu(item.label); } else { setMenuOpen(false); } }} aria-haspopup={Boolean(item.groups)} aria-expanded={item.groups ? activeMenu === item.label : undefined}>{item.label}{item.groups && <ChevronDown size={13} />}</a>{item.groups && activeMenu === item.label && <MegaMenu label={item.label} groups={item.groups} />}</div>)}</div></div></nav></header>
    <section className="hero" aria-label="主視覺輪播">{slides.map((item, index) => <div key={item.label} className={`hero-slide ${slide === index ? 'active' : ''}`} aria-hidden={slide !== index}><img src={item.image} alt="" /></div>)}<button className="hero-arrow left" type="button" aria-label="上一張" onClick={previous}><ChevronLeft /></button><button className="hero-arrow right" type="button" aria-label="下一張" onClick={next}><ChevronRight /></button><div className="hero-indicator" aria-label={`目前為第 ${slide + 1} 張，共 ${slides.length} 張`}>{slides.map((item, index) => <button key={item.label} type="button" onClick={() => setSlide(index)} aria-label={`切換至 ${item.label}`} className={slide === index ? 'current' : ''} />)}</div></section>
    <section className="overview"><div className="shell"><div className="section-kicker">SOLUTION OVERVIEW</div><h1>食品生產者到消費端的循環自動化方案</h1><p>我們提供從食品原物料的自動化分選、各類食品包裝的X光檢查、肉類及無刺鮮魚的高解析度檢測，到食品容器物理性發泡與消費端廢棄物風選分類的完整支援。</p></div></section>
    <section className="intro shell" id="services"><div className="section-kicker">INDUSTRIAL SERVICES</div><h2>產業服務</h2><p>以下服務分類與產品品牌均依原網站的資訊架構整理。</p><div className="service-grid">{services.map(([title, description, image], index) => <article className="service-card" key={title}><img src={image} alt="" /><div className="service-content"><span>0{index + 1}</span><h3>{title}</h3><p>{description}</p><a href={catalogLink(title)}>查看產品分類 <b>→</b></a></div></article>)}</div></section>
    <section className="brands" id="brands"><div className="shell brand-content"><div><div className="section-kicker">AGENCY BRAND</div><h2>代理品牌</h2><p>原網站列出 OPTIMUM、XAVIS、Smart Grader、MEAF、PROMIX、SBI、NIR、NIHOT、Matthiessen 與合軒等品牌及產品線。</p><a className="text-link" href={catalogLink('品牌介紹')}>查看完整代理產品 →</a></div><div className="brand-list"><span>OPTIMUM</span><span>XAVIS</span><span>SMART<br />GRADER</span><span>NIHOT</span><span>PROMIX</span><span>MEAF</span></div></div></section>
    <section className="downloads shell" id="downloads"><div><div className="section-kicker">DOWNLOADS</div><h2>下載專區</h2></div><div>{downloadGroups[0].items.map((item) => <a href={`/downloads?collection=${encodeURIComponent(item)}`} key={item}>{item}<span>→</span></a>)}</div></section>
    <section className="news shell" id="news"><div className="news-head"><div><div className="section-kicker">NEWS</div><h2>最新消息</h2></div><a href="/news">所有消息 →</a></div><div className="news-list">{news.map(([title, summary]) => <article key={title}><div><h3>{title}</h3><p>{summary}</p></div><a href={`/news?title=${encodeURIComponent(title)}`} aria-label={`閱讀 ${title}`}>↗</a></article>)}</div></section>
    <footer id="contact"><div className="footer-main"><div className="shell footer-grid"><div><img src="/reference/logo.png" alt="UniRise 合軒科技有限公司" /><div className="footer-links">{navItems.map((item) => <a href={item.target} key={item.label}>{item.label}</a>)}</div><div className="social">f　LINE　▶　◎</div></div><address><a href="tel:063319283">☎　06-3319283</a><a href="mailto:info-unirise@unirise.tw">✉　info-unirise@unirise.tw</a><span>●　台南市東區裕義路598號</span></address></div></div><div className="footer-bottom"><div className="shell">Copyright © 2021 合軒科技有限公司 All Rights Reserved.</div></div></footer><a className="to-top" href="#top" aria-label="回到頁面頂端">TOP</a></main>;
}
