'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { VisitorCounter } from '../components/visitor-counter';
import { SupportChat } from '../components/support-chat';

type MenuGroup = { title: string; id: string; items: { label: string; id: string }[] };

const industryGroups: MenuGroup[] = [
  { title: '食材分選', id: '1', items: [{ label: 'OPTIMUM-食材分選', id: '73' }, { label: 'Smart Grader-採樣分析', id: '82' }] },
  { title: 'X光機異物檢測', id: '4', items: [{ label: 'XAVIS-X光機檢測', id: '77' }, { label: 'XAVIS-FSCAN自動重量檢測機', id: '97' }, { label: 'XAVIS-FSCAN重量分級檢測機', id: '100' }, { label: 'XAVIS-FSCAN鋁箔金屬檢測機', id: '98' }] },
  { title: '回收再生', id: '6', items: [{ label: 'NIR手持式分析儀', id: '84' }, { label: 'NIHOT-回收再生', id: '78' }, { label: 'Matthiessen-破袋機', id: '91' }, { label: '合軒', id: '81' }] },
  { title: '塑膠化工', id: '7', items: [{ label: 'MEAF-板材押出生產線', id: '86' }, { label: 'PROMIX-物理發泡', id: '79' }, { label: 'SBI-測厚儀', id: '96' }] },
];

const tuples = (rows: string[][]) => rows.map(([label, id]) => ({ label, id }));
const brandGroups: MenuGroup[] = [
  { title: '品牌介紹', id: '89', items: tuples([['OPTIMUM','90'],['XAVIS','91'],['Smart Grader','110'],['MEAF','124'],['PROMIX','93'],['SBI','146'],['NIR','109'],['NIHOT','92'],['Matthiessen','131'],['合軒','98']]) },
  { title: 'OPTIMUM-食材分選', id: '1', items: tuples([['NOVUS (皮帶式-適用新鮮、乾燥或冷凍產品)','78'],['VENTUS (適用堅果和乾果等產品)','80'],['TRIPLUS (自由落體式-適用新鮮、乾燥或冷凍產品)','79'],['MAGNUS (適用易碎水果)','150']]) },
  { title: 'XAVIS-自動重量檢測機', id: '147', items: tuples([['CWF590W輕量型重量檢測機','156'],['CWF590WR滾輪式重量檢測機','158'],['CSCAN自動重量檢測機','149'],['CWIN69X多列式重量檢測機','161']]) },
  { title: 'XAVIS-重量分級檢測機', id: '159', items: [{ label: 'XAVIS重量分級檢測機', id: '160' }] },
  { title: 'XAVIS-食品異物X光機檢測', id: '2', items: tuples([['小包裝/未包裝X光食品自動異物檢測機','5'],['低密度中型包裝/散裝 X光食品自動異物檢測機','81'],['高密度中型包裝 X光食品自動異物檢測機','82'],['管道式 X光食品自動異物檢測機','83'],['大型包裝 X光食品自動異物檢測機','84'],['小型罐頭/瓶子包裝 X光食品自動異物檢測機','85'],['大型罐頭/瓶子包裝 X光食品自動異物檢測機','86'],['魚骨/雞骨專用 X光食品自動異物檢測機','127']]) },
  { title: 'XAVIS-鋁箔金屬檢測機', id: '152', items: tuples([['MDN-200AD鋁箔金屬檢測機(標準)','153'],['MDN-200AH鋁箔金屬檢測機(進階)','154']]) },
  { title: 'XAVIS-工業產品X光機檢測', id: '120', items: [{ label: '電池檢測專用', id: '121' }] },
  { title: 'Smart Grader-採樣分析', id: '111', items: tuples([['智慧採樣分析器','113'],['智慧分級機','114']]) },
  { title: 'MEAF-板材押出生產線', id: '122', items: [{ label: '板材押出生產線', id: '123' }] },
  { title: 'PROMIX-物理發泡', id: '72', items: tuples([['P1 冷卻混合器','128'],['熔體混合器','129']]) },
  { title: 'SBI-測厚儀', id: '140', items: tuples([['KAPA I & KAPA II 電容/渦流雙感測厚薄儀','141'],['KAPA IR 紅外線厚薄儀','142'],['XRS SOFT X-RAY 低能量X光厚薄儀','143'],['SHADOW 雷射陰影測量厚薄儀','144'],['STG 雷射位移測量厚薄儀','145']]) },
  { title: 'NIR手持式分析儀', id: '112', items: tuples([['手持式NIR分析儀-塑料用','116'],['手持式NIR分析儀-紡織用','151'],['手持螢幕NIR分析儀-塑料用','155']]) },
  { title: 'NIHOT-回收再生', id: '7', items: tuples([['SDM 移動式風選機','87'],['SDI 風選機','104'],['WSF 風選機','105'],['DDS 風選機','106'],['SDX 風選機','107'],['碟篩','108']]) },
  { title: 'Matthiessen-破袋機', id: '137', items: [{ label: 'SFIIIK3 破袋機', id: '138' }] },
  { title: '合軒', id: '99', items: tuples([['渦電流分選機','100'],['磁滾筒','101'],['上吸式磁鐵','102'],['鋁罐分選機','103']]) },
];

const featureCards = [
  { title: '食材分選', id: '1', image: '/reference/original/feature01.jpg' },
  { title: 'X光檢測', id: '4', image: '/reference/original/feature02.jpg' },
  { title: '回收再生', id: '6', image: '/reference/original/feature03.jpg' },
  { title: '塑膠化工', id: '7', image: '/reference/original/feature04.jpg' },
];

const agencies = [
  ['index_005.jpg','板材押出生產線','122'], ['index_003.jpg','風選機','7'], ['index_004.jpg','食材分選','1'], ['index_001.jpg','物理發泡','72'], ['index_010.png','測厚儀','140'], ['index_006.jpg','採樣分析','111'], ['index_007.jpg','NIR手持式分析儀','112'], ['index_008.jpg','X光食品異物檢測','2'], ['index_009.jpg','渦電流及除鐵設備','99'],
];

const homeNews = [
  ['3944','59d79791614c286ba688923bb61c0027.jpg','雞骨魚骨專用X光異物檢測機 Xavis','【AI 智慧辨識低密度骨頭異物，提升食品安全與檢測效率！】'],
  ['3943','832c31c5d6883b514158eb460ca7c076.jpg','M1 SF 皮帶稱重機和袋裝填充機 Manter','【溫和秤重、精準填充，打造高效率蔬果包裝產線！】'],
  ['3942','fc2a96f247a92a5c8f9c312cea0c60a9.jpg','多段式重量分級機 Xavis','【精準分級、高效作業，協助水產品加工提升產能與品質一致性】'],
  ['3941','163bb1825e00146110f9f80f0fe9a8ef.jpg','番茄自動包裝線 Manter','【從秤重、包裝到棧板堆疊，一站式提升蔬果包裝效率！】'],
];

const productHref = (kind: 'industry' | 'brand', id: string) => `/catalog?type=${kind}&id=${id}`;

function Dropdown({ groups, kind }: { groups: MenuGroup[]; kind: 'industry' | 'brand' }) {
  return <div className={`original-dropdown ${kind === 'brand' ? 'is-wide' : ''}`}>
    {groups.map(group => <div className="original-menu-group" key={`${kind}-${group.id}`}>
      <a className="original-menu-title" href={productHref(kind, group.id)}>{group.title}<i className="original-fa original-fa-angle-right" aria-hidden="true" /></a>
      <div className="original-submenu">{group.items.map(item => <a key={`${item.id}-${item.label}`} href={productHref(kind, item.id)}>{item.label}</a>)}</div>
    </div>)}
  </div>;
}

export default function Home() {
  const [slide, setSlide] = useState(0);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<string | null>(null);
  const [agencyStart, setAgencyStart] = useState(0);
  const [agencyVisible, setAgencyVisible] = useState(4);

  useEffect(() => {
    const heroTimer = window.setInterval(() => setSlide(current => (current + 1) % 2), 5000);
    const agencyTimer = window.setInterval(() => setAgencyStart(current => (current + 1) % agencies.length), 3000);
    const resize = () => setAgencyVisible(window.innerWidth < 768 ? 1 : window.innerWidth < 992 ? 2 : window.innerWidth < 1200 ? 3 : 4);
    resize(); window.addEventListener('resize', resize);
    return () => { window.clearInterval(heroTimer); window.clearInterval(agencyTimer); window.removeEventListener('resize', resize); };
  }, []);

  const visibleAgencies = useMemo(() => Array.from({ length: agencyVisible }, (_, i) => agencies[(agencyStart + i) % agencies.length]), [agencyStart, agencyVisible]);
  const moveAgency = (amount: number) => setAgencyStart(current => (current + amount + agencies.length) % agencies.length);

  return <main id="top" className="original-home">
    <header className="original-header">
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
          <div className={`original-nav-item ${mobilePanel==='downloads'?'mobile-open':''}`}><a href="/downloads">下載專區</a><button className="original-submenu-toggle" type="button" onClick={()=>setMobilePanel(value=>value==='downloads'?null:'downloads')} aria-label="展開下載專區子選單" aria-expanded={mobilePanel==='downloads'}><i className={`original-fa ${mobilePanel==='downloads'?'original-fa-minus':'original-fa-plus'}`} aria-hidden="true"/></button><div className="original-dropdown downloads-menu">{[['NIHOT-回收再生','3853'],['OPTIMUM-食材分選','77'],['PROMIX-塑膠化工','3854'],['XAVIS-X光檢測','78']].map(([label,id])=><a key={id} href={`/downloads?id=${id}`}>{label}</a>)}</div></div>
          <div className="original-nav-item"><a href="/inquiry">詢價系統</a></div>
          <div className="original-nav-item"><a href="/contact">聯絡我們</a></div>
        </div>
      </nav>
    </header>

    <section className="original-hero" aria-label="主視覺輪播">
      {[
        ['7ad461d02fa445546a8567d1c8293e3b.png','d714bdbb203af483c6cbbf4ebe90ba83.png'],
        ['af0039c7a213a8374289c273de51f4f8.png','951780546b18659f46dcd675d14e19d3.png'],
      ].map(([desktop,mobile],index)=><a href="/" className={`original-hero-slide ${slide===index?'active':''}`} aria-hidden={slide!==index} key={desktop}><picture><source media="(max-width:768px)" srcSet={`/reference/original/${mobile}`} /><img src={`/reference/original/${desktop}`} alt={`banner-0${index+1}`} /></picture></a>)}
      <button type="button" className="original-hero-arrow prev" onClick={()=>setSlide(current=>(current+1)%2)} aria-label="Previous slide"><i className="original-fa original-fa-play" aria-hidden="true" /></button>
      <button type="button" className="original-hero-arrow next" onClick={()=>setSlide(current=>(current+1)%2)} aria-label="Next slide"><i className="original-fa original-fa-play" aria-hidden="true" /></button>
      <a className="original-scroll" href="#scroll"><img src="/reference/original/scrollDown_mouse.svg" alt="向下捲動" /></a>
    </section>

    <div id="scroll">
      <section className="original-about">
        <div className="original-about-inner">
          <article>
            <div className="original-about-title"><span>SOLUTION OVERVIEW</span><small>食品生產者到消費端的循環自動化方案</small></div>
            <h2>我們提供</h2>
            <ul><li>從天然或加工的食品原物料依顏色/外觀<br/>瑕疵透過自動化分選機完成品質等級分類</li><li>各類食品包裝型態的X光機檢查,為食品出廠前的安全把關</li><li>肉類及無刺鮮魚的高解析度X光機</li><li>食品容器生產的物理性發泡技術裝置</li><li>消費端廢棄物整體風選分類設備</li></ul>
          </article>
          <div className="original-about-image"><img src="/reference/original/indexAbout.png" alt="食品生產循環自動化方案" /></div>
        </div>
      </section>

      <section className="original-features" aria-label="產業服務">
        {featureCards.map(card=><article className="original-feature" key={card.id}>
          <img src={card.image} alt="" />
          <div className="original-feature-overlay"><div className="original-feature-border"><div><h2>{card.title}</h2><div className="original-feature-linkbox"><span className="original-feature-line"><img src="/reference/original/arrowR.png" alt="" /></span><a href={productHref('industry',card.id)}>Read More <img src="/reference/original/addWhite.png" alt="" /></a></div></div></div></div>
        </article>)}
      </section>

      <section className="original-agency" id="brands">
        <div className="original-container">
          <div className="original-section-title"><span>AGENCY BRAND</span><small>代理品牌</small></div>
          <div className="original-agency-carousel">
            <button type="button" onClick={()=>moveAgency(-1)} aria-label="上一組品牌"><i className="original-fa original-fa-play" aria-hidden="true" /></button>
            <div className="original-agency-list">{visibleAgencies.map(([image,title,id])=><article key={`${agencyStart}-${id}`}><a href={productHref('brand',id)}><img src={`/reference/original/${image}`} alt={title}/></a><h3>{title}</h3></article>)}</div>
            <button type="button" onClick={()=>moveAgency(1)} aria-label="下一組品牌"><i className="original-fa original-fa-play" aria-hidden="true" /></button>
          </div>
        </div>
      </section>

      <section className="original-news" id="news">
        <div className="original-container">
          <div className="original-section-title"><span>NEWS</span><small>最新消息</small></div>
          <div className="original-news-grid">{homeNews.map(([id,image,title,lead])=><article className="original-news-item" key={id}>
            <a className="original-news-image" href={`/news?id=${id}`}><img src={`/reference/original/${image}`} alt={title}/></a>
            <div><h3>{title}</h3><p>{lead}</p><a className="original-news-more" href={`/news?id=${id}`}>了解更多</a></div>
          </article>)}</div>
        </div>
      </section>
    </div>

    <footer className="original-footer" id="contact">
      <div className="original-container original-footer-grid">
        <div><nav>{[['產業服務',productHref('industry','73')],['代理品牌',productHref('brand','89')],['最新消息','/news'],['下載專區','/downloads?id=3853'],['詢價系統','/inquiry'],['聯絡我們','/contact']].map(([label,href])=><a href={href} key={label}>{label}</a>)}</nav><div className="original-social"><a href="https://www.facebook.com/%E5%90%88%E8%BB%92%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8-161123071369104" target="_blank" rel="noreferrer" aria-label="Facebook"><i className="original-fa original-fa-facebook" aria-hidden="true" /></a><a href="https://line.me/ti/p/W1QdEgfzdb" target="_blank" rel="noreferrer" aria-label="LINE"><i className="original-icomoon original-line" aria-hidden="true" /></a><a href="https://www.youtube.com/channel/UCuIR83-YHMNnVc8lbaDB2nQ" target="_blank" rel="noreferrer" aria-label="YouTube"><i className="original-fa original-fa-youtube" aria-hidden="true" /></a><span aria-label="Instagram"><i className="original-fa original-fa-instagram" aria-hidden="true" /></span></div></div>
        <div className="original-footer-info"><img src="/reference/original/logo_footer.svg" alt="合軒科技有限公司"/><a href="tel:06-3319283"><i className="original-fa original-fa-phone" aria-hidden="true" /><span> 06-3319283</span></a><a href="mailto:info-unirise@unirise.tw"><i className="original-fa original-fa-envelope" aria-hidden="true" />info-unirise@unirise.tw</a><a href="https://goo.gl/maps/oqLuxoMzVYdmJEwg9" target="_blank" rel="noreferrer"><i className="original-fa original-fa-map" aria-hidden="true" />台南市東區裕義路598號</a></div>
      </div>
      <div className="original-copyright"><div className="original-container">Copyright © 2021 合軒科技有限公司 All Rights Reserved.<VisitorCounter/></div></div>
    </footer>
    <a className="original-to-top" href="#top" aria-label="回到頂端"><img src="/reference/original/gotop.svg" alt=""/></a>
    <SupportChat/>
  </main>;
}
