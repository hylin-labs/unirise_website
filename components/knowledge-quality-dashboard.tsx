'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminIdentity } from '../lib/admin-auth';
import type { DocumentKnowledgeFact } from '../lib/document-repository';
import type { KnowledgeQualityResult } from '../lib/knowledge-quality';
import { redirectAdminUnauthorized } from '../lib/admin-content';
import styles from './admin-dashboard.module.css';

/* oxlint-disable next/no-html-link-for-pages -- Administrative navigation uses full page loads because client-side prefetch is not reliable in this runtime. */

type QualityPayload = {
  facts: DocumentKnowledgeFact[];
  evaluation: { total: number; passed: number; passRate: number; results: KnowledgeQualityResult[] };
  documents: Array<{ id: string; title: string; accessLevel: string; assistantStatus: string; pages: number | null; updatedAt: string }>;
};

export function KnowledgeQualityDashboard({ identity }: { identity: AdminIdentity }) {
  const [payload, setPayload] = useState<QualityPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/knowledge-quality', { cache: 'no-store' });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('load_failed');
      setPayload((await response.json()) as QualityPayload);
    } catch { setError('目前無法載入知識品質資料，請稍後再試。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  return <main className={styles.dashboard}>
    <aside className={styles.sidebar}>
      <div className={styles.dashboardBrand}>合軒科技管理後台</div>
      <nav aria-label="管理後台">
        <a className={styles.navLink} href="/admin/documents">技術文件</a>
        <a className={styles.activeNav} href="/admin/knowledge-quality">知識品質</a>
        <a className={styles.navLink} href="/admin">返回管理總覽</a>
      </nav>
      <div className={styles.account}><span>登入身分</span><strong>{identity.email}</strong></div>
    </aside>
    <section className={styles.workspace}>
      <header className={styles.topbar}><div><p>UNIRISE KNOWLEDGE QUALITY</p><h1>技術知識品質</h1></div><button className={styles.refreshButton} type="button" onClick={() => void load()} disabled={loading}>{loading ? '檢查中…' : '重新檢查'}</button></header>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {loading ? <div className={styles.loading}>正在檢查已核准的公開知識…</div> : null}
      {!loading && payload ? <>
        <div className={styles.metricGrid}>
          <article className={styles.metricCard}><span>已上傳文件</span><strong>{payload.documents.length}</strong></article>
          <article className={styles.metricCard}><span>已加入助理的事實</span><strong>{payload.facts.length}</strong></article>
          <article className={styles.metricCard}><span>題庫通過</span><strong>{payload.evaluation.passed}／{payload.evaluation.total}</strong></article>
          <article className={styles.metricCard}><span>目前通過率</span><strong>{(payload.evaluation.passRate * 100).toFixed(1)}%</strong></article>
        </div>
        <article className={styles.panel}><h2>可引用事實</h2><p className={styles.panelIntro}>僅列出公開、已核准文件中的事實；每一筆都保留來源頁碼。</p><div className={styles.localeTable}><table><thead><tr><th>文件／頁碼</th><th>類型</th><th>內容</th></tr></thead><tbody>{payload.facts.map((fact) => <tr key={fact.id}><td>{fact.subject}<br /><small>第 {fact.sourcePageStart}{fact.sourcePageEnd === fact.sourcePageStart ? '' : `–${fact.sourcePageEnd}`} 頁</small></td><td>{fact.factType}</td><td>{fact.value}{fact.unit ? ` ${fact.unit}` : ''}</td></tr>)}</tbody></table></div></article>
        <article className={styles.panel}><h2>題庫驗證結果</h2><p className={styles.panelIntro}>只驗證已核准文件的結構化回答；不會將文件內容傳送到外部模型。</p><div className={styles.qualityList}>{payload.evaluation.results.map((result) => <article className={result.passed ? styles.qualityPass : styles.qualityFail} key={result.id}><strong>{result.passed ? '通過' : '需處理'}・{result.question}</strong><span>{result.locale === 'zh-TW' ? '繁體中文' : 'English'}／{result.category}</span>{!result.passed ? <small>{result.answerTermsMissing.length ? `缺少：${result.answerTermsMissing.join('、')}` : '找不到符合的來源頁碼'}</small> : null}</article>)}</div></article>
      </> : null}
    </section>
  </main>;
}
