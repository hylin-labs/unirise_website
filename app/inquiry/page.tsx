'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OriginalFooter, OriginalHeader } from '../original-shell';

export default function InquiryPage() {
  const product = useSearchParams().get('product') || '';
  const [sent, setSent] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = `詢問產品：${form.get('product') || '產品資料索取'}`;
    const body = [`姓名：${form.get('name')}`, `公司：${form.get('company')}`, `電話：${form.get('phone')}`, `Email：${form.get('email')}`, '', '需求說明：', form.get('message')].join('\n');
    window.location.href = `mailto:info-unirise@unirise.tw?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  };
  return <main id="top" className="original-home original-inner-page"><OriginalHeader/><section className="original-sub-banner"><img src="/reference/original/subbanner.png" alt=""/></section><section className="original-inner-content"><nav className="original-breadcrumb"><a href="/">HOME</a><span>/</span><strong>詢價系統</strong></nav><div className="original-inner-title"><span>Inquiry</span><small>詢價系統</small></div><form className="original-content-panel inquiry-panel inquiry-form" onSubmit={submit}><h2>{product || '產品詢問與資料索取'}</h2><p>填寫下列表單後，系統會開啟您的郵件程式並建立一封寄給合軒科技的詢問信。</p><label>姓名<input name="name" required autoComplete="name" /></label><label>公司名稱<input name="company" required autoComplete="organization" /></label><div className="form-pair"><label>聯絡電話<input name="phone" required autoComplete="tel" /></label><label>電子信箱<input type="email" name="email" required autoComplete="email" /></label></div><label>詢問產品<input name="product" defaultValue={product} /></label><label>需求說明<textarea name="message" required rows={6} placeholder="請說明您的產線需求、欲檢測／分選的產品與預計導入時間。" /></label><button className="original-inquiry-button" type="submit">建立詢問信</button>{sent && <small className="form-status">已建立詢問信；若未自動開啟，請直接寄信至 info-unirise@unirise.tw。</small>}<small>服務電話：06-3319283　｜　info-unirise@unirise.tw</small></form></section><OriginalFooter/></main>;
}
