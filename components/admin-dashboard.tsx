'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { AdminIdentity } from '../lib/admin-auth';
import type { DashboardSnapshot } from '../lib/analytics';
import styles from './admin-dashboard.module.css';

type View = 'overview' | 'content' | 'leads' | 'gaps';

const metricCards: Array<{
  key: keyof DashboardSnapshot['metrics'];
  label: string;
  percent?: boolean;
}> = [
  { key: 'uniqueVisitors', label: '不重複訪客' },
  { key: 'pageViews', label: '瀏覽次數' },
  { key: 'downloadClicks', label: '下載點擊' },
  { key: 'chatQuestions', label: '聊天問題' },
  { key: 'chatAnswerRate', label: '回答率', percent: true },
  { key: 'unansweredQuestions', label: '未回答問題' },
  { key: 'leads', label: '有效詢問' },
  { key: 'leadConversionRate', label: '詢問轉換率', percent: true },
];

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: dateValue(from), to: dateValue(to) };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(new Date(value));
}

function Empty({ children }: { children: string }) {
  return <p className={styles.empty}>{children}</p>;
}

export function AdminDashboard({ identity }: { identity: AdminIdentity }) {
  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState(initialRange);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(range);
      const response = await fetch(`/api/analytics?${params}`, {
        cache: 'no-store',
      });
      if (response.status === 401) {
        window.location.assign('/admin/login');
        return;
      }
      if (!response.ok) throw new Error('dashboard_unavailable');
      setSnapshot((await response.json()) as DashboardSnapshot);
    } catch {
      setError('目前無法載入儀表板資料，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' }).catch(
      () => undefined,
    );
    window.location.assign('/admin/login');
  }

  async function setPublication(
    kind: 'news' | 'downloads' | 'knowledge',
    id: string,
    status: 'draft' | 'published',
  ) {
    const operation = `${kind}:${id}`;
    setUpdating(operation);
    setError('');
    try {
      const response = await fetch(`/api/admin/${kind}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (response.status === 409) {
        setError('內容已由其他工作階段更新。資料已重新載入，請再次確認。');
      } else if (!response.ok) {
        throw new Error('update_failed');
      }
      await load();
    } catch {
      setError('無法更新發布狀態，請稍後再試。');
    } finally {
      setUpdating('');
    }
  }

  return (
    <main className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <Link
          className={styles.dashboardBrand}
          href="/"
          aria-label="回到合軒科技網站"
        >
          <Image
            src="/reference/original/logo_footer.svg"
            width={330}
            height={72}
            alt="合軒科技有限公司"
          />
        </Link>
        <nav aria-label="管理後台">
          {(
            [
              ['overview', '總覽'],
              ['content', '內容管理'],
              ['leads', '客戶詢問'],
              ['gaps', '聊天缺口'],
            ] as Array<[View, string]>
          ).map(([id, label]) => (
            <button
              type="button"
              className={view === id ? styles.activeNav : ''}
              onClick={() => setView(id)}
              key={id}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.account}>
          <span>登入身分</span>
          <strong>{identity.email}</strong>
          <button type="button" onClick={logout}>
            登出
          </button>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>UNIRISE ADMINISTRATION</p>
            <h1>
              {view === 'overview'
                ? '網站成效總覽'
                : view === 'content'
                  ? '內容管理'
                  : view === 'leads'
                    ? '客戶詢問'
                    : '聊天知識缺口'}
            </h1>
          </div>
          <div className={styles.dateFilters}>
            <label>
              起始日期
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(event) =>
                  setRange((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              結束日期
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(event) =>
                  setRange((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
            </label>
          </div>
        </header>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className={styles.loading}>正在載入最新資料…</div>
        ) : null}

        {!loading && snapshot && view === 'overview' ? (
          <>
            <div className={styles.metricGrid}>
              {metricCards.map((card) => {
                const value = snapshot.metrics[card.key];
                return (
                  <article className={styles.metricCard} key={card.key}>
                    <span>{card.label}</span>
                    <strong>
                      {card.percent
                        ? `${(value * 100).toFixed(1)}%`
                        : new Intl.NumberFormat('zh-TW').format(value)}
                    </strong>
                  </article>
                );
              })}
            </div>
            <div className={styles.splitPanels}>
              <article className={styles.panel}>
                <h2>最多瀏覽頁面</h2>
                {snapshot.topPages.length ? (
                  <ol className={styles.ranking}>
                    {snapshot.topPages.map((item) => (
                      <li key={item.path}>
                        <span>{item.path}</span>
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>選定期間尚無頁面瀏覽資料。</Empty>
                )}
              </article>
              <article className={styles.panel}>
                <h2>下載內容點擊</h2>
                {snapshot.topDownloads.length ? (
                  <ol className={styles.ranking}>
                    {snapshot.topDownloads.map((item) => (
                      <li key={item.path}>
                        <span>{item.path}</span>
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>選定期間尚無下載點擊資料。</Empty>
                )}
              </article>
            </div>
          </>
        ) : null}

        {!loading && snapshot && view === 'content' ? (
          <div className={styles.contentSections}>
            {(
              [
                ['news', '最新消息', snapshot.content.news],
                ['downloads', '下載專區', snapshot.content.downloads],
                ['knowledge', '聊天知識', snapshot.content.knowledge],
              ] as const
            ).map(([kind, label, records]) => (
              <article className={styles.panel} key={kind}>
                <div className={styles.panelHeading}>
                  <h2>{label}</h2>
                  <span>{records.length} 筆</span>
                </div>
                {records.length ? (
                  <div className={styles.contentList}>
                    {records.map((record) => {
                      const operation = `${kind}:${record.id}`;
                      const published = record.status === 'published';
                      return (
                        <div className={styles.contentRow} key={record.id}>
                          <div>
                            <strong>{record.title}</strong>
                            <small>
                              {'legacyId' in record
                                ? `原網址 ID：${record.legacyId}`
                                : record.href}
                              <br />
                              更新：{formatDate(record.updatedAt)}
                            </small>
                          </div>
                          <span
                            className={
                              published ? styles.published : styles.draft
                            }
                          >
                            {published ? '已發布' : '草稿'}
                          </span>
                          <button
                            type="button"
                            disabled={updating === operation}
                            onClick={() =>
                              setPublication(
                                kind,
                                record.id,
                                published ? 'draft' : 'published',
                              )
                            }
                          >
                            {updating === operation
                              ? '更新中…'
                              : published
                                ? '取消發布'
                                : '發布'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Empty>目前沒有內容。</Empty>
                )}
              </article>
            ))}
          </div>
        ) : null}

        {!loading && snapshot && view === 'leads' ? (
          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>客戶詢問</h2>
              <span>{snapshot.leads.length} 筆</span>
            </div>
            {snapshot.leads.length ? (
              <div className={styles.leadGrid}>
                {snapshot.leads.map((lead) => (
                  <article className={styles.leadCard} key={lead.id}>
                    <div className={styles.leadHeader}>
                      <span>
                        {lead.requestType === 'quote' ? '索取報價' : '聯絡專員'}
                      </span>
                      <time>{formatDate(lead.createdAt)}</time>
                    </div>
                    <h3>
                      {lead.name}
                      {lead.company ? ` · ${lead.company}` : ''}
                    </h3>
                    <a href={`mailto:${lead.email}`}>{lead.email}</a>
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`}>{lead.phone}</a>
                    ) : null}
                    <p>{lead.message}</p>
                    <small>
                      來源：{lead.sourcePath} · 狀態：{lead.status} · Email{' '}
                      {lead.emailDelivered ? '已送出' : '待處理'}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>選定期間尚無客戶詢問。</Empty>
            )}
          </article>
        ) : null}

        {!loading && snapshot && view === 'gaps' ? (
          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <h2>未回答問題</h2>
              <span>{snapshot.unansweredQuestions.length} 筆</span>
            </div>
            <p className={styles.panelIntro}>
              問題中的電子信箱與電話會在儲存前隱藏，並於 90 天後自動清除。
            </p>
            {snapshot.unansweredQuestions.length ? (
              <div className={styles.gapList}>
                {snapshot.unansweredQuestions.map((question) => (
                  <article key={question.id}>
                    <time>{formatDate(question.createdAt)}</time>
                    <p>{question.question}</p>
                  </article>
                ))}
              </div>
            ) : (
              <Empty>選定期間沒有未回答的聊天問題。</Empty>
            )}
          </article>
        ) : null}
      </section>
    </main>
  );
}
