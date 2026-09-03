'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { VisitorCounter } from '../components/visitor-counter';
import { SupportChat } from '../components/support-chat';

type MenuGroup = { title: string; id: string; items: { label: string; id: string }[] };
const tuples = (rows: string[][]) => rows.map(([label, id]) => ({ label, id }));
const productHref = (kind: 'industry' | 'brand', id: string) => `/catalog?type=${kind}&id=${id}`;

const industryGroups: MenuGroup[] = [
  { title: '食材分選', id: '1', items: tuples([['OPTIMUM-食材分選','73'],['Smart Grader-採樣分析','82']]) },
  { title: 'X光機異物檢測', id: '4', items: tuples([['XAVIS-X光機檢測','77'],['XAVIS-FSCAN自動重量檢測機','97'],['XAVIS-FSCAN重量分級檢測機','100'],['XAVIS-FSCAN鋁箔金屬檢測機','98']]) },
  { title: '回收再生', id: '6', items: tuples([['NIR手持式分析儀','84'],['NIHOT-回收再生','78'],['Matthiessen-破袋機','91'],['合軒','81']]) },
  { title: '塑膠化工', id: '7', items: tuples([['MEAF-板材押出生產線','86'],['PROMIX-物理發泡','79'],['SBI-測厚儀','96']]) },
];

const brandGroups: MenuGroup[] = [
  { title: '品牌介紹', id: '89', items: tuples([['OPTIMUM','90'],['XAVIS','91'],['Smart Grader','110'],['MEAF','124'],['PROMIX','93'],['SBI','146'],['NIR','109'],['NIHOT','92'],['Matthiessen','131'],['合軒','98']]) },
  { title: 'OPTIMUM-食材分選', id: '1', items: tuples([['NOVUS (皮帶式-適用新鮮、乾燥或冷凍產品)','78'],['VENTUS (適用堅果和乾果等產品)','80'],['TRIPLUS (自由落體式-適用新鮮、乾燥或冷凍產品)','79'],['MAGNUS (適用易碎水果)','150']]) },
  { title: 'XAVIS-自動重量檢測機', id: '147', items: tuples([['CWF590W輕量型重量檢測機','156'],['CWF590WR滾輪式重量檢測機','158'],['CSCAN自動重量檢測機','149'],['CWIN69X多列式重量檢測機','161']]) },
  { title: 'XAVIS-重量分級檢測機', id: '159', items: tuples([['XAVIS重量分級檢測機','160']]) },
  { title: 'XAVIS-食品異物X光機檢測', id: '2', items: tuples([['小包裝/未包裝X光食品自動異物檢測機','5'],['低密度中型包裝/散裝 X光食品自動異物檢測機','81'],['高密度中型包裝 X光食品自動異物檢測機','82'],['管道式 X光食品自動異物檢測機','83'],['大型包裝 X光食品自動異物檢測機','84'],['小型罐頭/瓶子包裝 X光食品自動異物檢測機','85'],['大型罐頭/瓶子包裝 X光食品自動異物檢測機','86'],['魚骨/雞骨專用 X光食品自動異物檢測機','127']]) },
  { title: 'XAVIS-鋁箔金屬檢測機', id: '152', items: tuples([['MDN-200AD鋁箔金屬檢測機(標準)','153'],['MDN-200AH鋁箔金屬檢測機(進階)','154']]) },
  { title: 'XAVIS-工業產品X光機檢測', id: '120', items: tuples([['電池檢測專用','121']]) },
  { title: 'Smart Grader-採樣分析', id: '111', items: tuples([['智慧採樣分析器','113'],['智慧分級機','114']]) },
  { title: 'MEAF-板材押出生產線', id: '122', items: tuples([['板材押出生產線','123']]) },
  { title: 'PROMIX-物理發泡', id: '72', items: tuples([['P1 冷卻混合器','128'],['熔體混合器','129']]) },
  { title: 'SBI-測厚儀', id: '140', items: tuples([['KAPA I & KAPA II 電容/渦流雙感測厚薄儀','141'],['KAPA IR 紅外線厚薄儀','142'],['XRS SOFT X-RAY 低能量X光厚薄儀','143'],['SHADOW 雷射陰影測量厚薄儀','144'],['STG 雷射位移測量厚薄儀','145']]) },
  { title: 'NIR手持式分析儀', id: '112', items: tuples([['手持式NIR分析儀-塑料用','116'],['手持式NIR分析儀-紡織用','151'],['手持螢幕NIR分析儀-塑料用','155']]) },
  { title: 'NIHOT-回收再生', id: '7', items: tuples([['SDM 移動式風選機','87'],['SDI 風選機','104'],['WSF 風選機','105'],['DDS 風選機','106'],['SDX 風選機','107'],['碟篩','108']]) },
  { title: 'Matthiessen-破袋機', id: '137', items: tuples([['SFIIIK3 破袋機','138']]) },
  { title: '合軒', id: '99', items: tuples([['渦電流分選機','100'],['磁滾筒','101'],['上吸式磁鐵','102'],['鋁罐分選機','103']]) },
];

function Dropdown({ groups, kind }: { groups: MenuGroup[]; kind: 'industry' | 'brand' }) {
  return <div className={`original-dropdown ${kind === 'brand' ? 'is-wide' : ''}`}>
    {groups.map(group => <div className="original-menu-group" key={`${kind}-${group.id}`}>
      <a className="original-menu-title" href={productHref(kind, group.id)}>{group.title}<i className="original-fa original-fa-angle-right" aria-hidden="true" /></a>
      <div className="original-submenu">{group.items.map(item => <a key={`${item.id}-${item.label}`} href={productHref(kind, item.id)}>{item.label}</a>)}</div>
    </div>)}
  </div>;
}

export function OriginalHeader() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<string | null>(null);
  return <header className="original-header">
    <div className="original-header-top">
      <div className="original-top-links"><a href="https://goo.gl/maps/dvcWWbp4xf8AZ3dF6" target="_blank" rel="noreferrer">公司地址</a><a href="/contact">聯絡我們</a><a href="/catalog"><i className="original-fa original-fa-search" aria-hidden="true" />搜尋</a></div>
      <a href="/" aria-label="回到首頁"><img src="/reference/original/logo.png" width="347" height="90" alt="合軒科技有限公司" /></a>
      <div className="original-top-links right"><a href="/inquiry"><i className="original-fa original-fa-cart" aria-hidden="true" />詢問車</a><button type="button">語系</button><span>Select Language⌄</span></div>
    </div>
    <nav className="original-main-nav" aria-label="主要選單">
      <button className="original-mobile-toggle" type="button" onClick={() => setMobileMenu(value => !value)} aria-expanded={mobileMenu} aria-label="開啟選單">{mobileMenu ? <X/> : <Menu/>}</button>
      <div className={`original-nav-list ${mobileMenu ? 'open' : ''}`}>
        <div className={`original-nav-item ${mobilePanel==='industry'?'mobile-open':''}`}><a href={productHref('industry','73')}>產業服務</a><button className="original-submenu-toggle" type="button" onClick={()=>setMobilePanel(value=>value==='industry'?null:'industry')} aria-label="展開產業服務子選單" aria-expanded={mobilePanel==='industry'}><i className={`original-fa ${mobilePanel==='industry'?'original-fa-minus':'original-fa-plus'}`} aria-hidden="true"/></button><Dropdown groups={industryGroups} kind="industry"/></div>
        <div className={`original-nav-item ${mobilePanel==='brand'?'mobile-open':''}`}><a href={productHref('brand','89')}>代理品牌</a><button className="original-submenu-toggle" type="button" onClick={()=>setMobilePanel(value=>value==='brand'?null:'brand')} aria-label="展開代理品牌子選單" aria-expanded={mobilePanel==='brand'}><i className={`original-fa ${mobilePanel==='brand'?'original-fa-minus':'original-fa-plus'}`} aria-hidden="true"/></button><Dropdown groups={brandGroups} kind="brand"/></div>
        <div className="original-nav-item"><a href="/news">最新消息</a></div>
        <div className={`original-nav-item ${mobilePanel==='downloads'?'mobile-open':''}`}><a href="/downloads?id=3853">下載專區</a><button className="original-submenu-toggle" type="button" onClick={()=>setMobilePanel(value=>value==='downloads'?null:'downloads')} aria-label="展開下載專區子選單" aria-expanded={mobilePanel==='downloads'}><i className={`original-fa ${mobilePanel==='downloads'?'original-fa-minus':'original-fa-plus'}`} aria-hidden="true"/></button><div className="original-dropdown downloads-menu">{[['NIHOT-回收再生','3853'],['OPTIMUM-食材分選','77'],['PROMIX-塑膠化工','3854'],['XAVIS-X光檢測','78']].map(([label,id])=><a key={id} href={`/downloads?id=${id}`}>{label}</a>)}</div></div>
        <div className="original-nav-item"><a href="/inquiry">詢價系統</a></div>
        <div className="original-nav-item"><a href="/contact">聯絡我們</a></div>
      </div>
    </nav>
  </header>;
}

export function OriginalFooter() {
  return <>
    <footer className="original-footer" id="contact">
      <div className="original-container original-footer-grid">
        <div><nav>{[['產業服務',productHref('industry','73')],['代理品牌',productHref('brand','89')],['最新消息','/news'],['下載專區','/downloads?id=3853'],['詢價系統','/inquiry'],['聯絡我們','/contact']].map(([label,href])=><a href={href} key={label}>{label}</a>)}</nav><div className="original-social"><a href="https://www.facebook.com/%E5%90%88%E8%BB%92%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8-161123071369104" target="_blank" rel="noreferrer" aria-label="Facebook"><i className="original-fa original-fa-facebook" aria-hidden="true" /></a><a href="https://line.me/ti/p/W1QdEgfzdb" target="_blank" rel="noreferrer" aria-label="LINE"><i className="original-icomoon original-line" aria-hidden="true" /></a><a href="https://www.youtube.com/channel/UCuIR83-YHMNnVc8lbaDB2nQ" target="_blank" rel="noreferrer" aria-label="YouTube"><i className="original-fa original-fa-youtube" aria-hidden="true" /></a><span aria-label="Instagram"><i className="original-fa original-fa-instagram" aria-hidden="true" /></span></div></div>
        <div className="original-footer-info"><img src="/reference/original/logo_footer.svg" alt="合軒科技有限公司"/><a href="tel:06-3319283"><i className="original-fa original-fa-phone" aria-hidden="true" /><span> 06-3319283</span></a><a href="mailto:info-unirise@unirise.tw"><i className="original-fa original-fa-envelope" aria-hidden="true" />info-unirise@unirise.tw</a><a href="https://goo.gl/maps/oqLuxoMzVYdmJEwg9" target="_blank" rel="noreferrer"><i className="original-fa original-fa-map" aria-hidden="true" />台南市東區裕義路598號</a></div>
      </div>
      <div className="original-copyright"><div className="original-container">Copyright © 2021 合軒科技有限公司 All Rights Reserved.<VisitorCounter/></div></div>
    </footer>
    <a className="original-to-top" href="#top" aria-label="回到頂端"><img src="/reference/original/gotop.svg" alt=""/></a>
    <SupportChat/>
  </>;
}
