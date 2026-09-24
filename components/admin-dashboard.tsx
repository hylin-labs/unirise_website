'use client';

import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import type { AdminIdentity } from '../lib/admin-auth';
import {
  buildAdminContentPayload,
  emptyAdminContentEditor,
  parseDatabaseTimestamp,
  redirectAdminUnauthorized,
  type AdminContentEditor,
  type AdminContentKind,
} from '../lib/admin-content';
import type { DashboardSnapshot } from '../lib/analytics';
import { youtubeThumbnailUrl } from '../lib/youtube';
import styles from './admin-dashboard.module.css';
import { LineContactManager } from './line-contact-manager';
import { TranslationManager } from './translation-manager';

/* oxlint-disable next/no-html-link-for-pages -- The logo intentionally performs a full navigation out of administrator state. */

type View =
  | 'overview'
  | 'content'
  | 'leads'
  | 'gaps'
  | 'translations'
  | 'lineContacts';

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function initialRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: dateValue(from), to: dateValue(to) };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(parseDatabaseTimestamp(value));
}

function Empty({ children }: { children: string }) {
  return <p className={styles.empty}>{children}</p>;
}

const leadStatusLabels = {
  new: '新詢問',
  contacted: '已聯絡',
  closed: '已結案',
} as const;

export function AdminDashboard({ identity }: { identity: AdminIdentity }) {
  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState(initialRange);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updating, setUpdating] = useState('');
  const [editor, setEditor] = useState<AdminContentEditor | null>(null);
  const [preview, setPreview] = useState(false);

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
    setNotice('');
    try {
      const response = await fetch(`/api/admin/${kind}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (response.status === 409) {
        await load();
        setError('內容已由其他工作階段更新。資料已重新載入，請再次確認。');
        return;
      } else if (!response.ok) {
        throw new Error('update_failed');
      }
      setNotice(
        status === 'published'
          ? '內容已發布，將顯示於公開網站。'
          : '內容已改為草稿，已從公開網站移除。',
      );
      await load();
    } catch {
      setError('無法更新發布狀態，請稍後再試。');
    } finally {
      setUpdating('');
    }
  }

  async function setLeadStatus(
    id: string,
    status: keyof typeof leadStatusLabels,
  ) {
    const operation = `lead:${id}`;
    setUpdating(operation);
    setError('');
    try {
      const response = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('lead_update_failed');
      await load();
    } catch {
      setError('無法更新客戶詢問狀態，請稍後再試。');
    } finally {
      setUpdating('');
    }
  }

  function editContent(
    kind: AdminContentKind,
    record: DashboardSnapshot['content'][AdminContentKind][number],
    showPreview = false,
  ) {
    const next = emptyAdminContentEditor(kind);
    next.id = record.id;
    next.title = record.title;
    next.status = record.status === 'published' ? 'published' : 'draft';
    if ('legacyId' in record) next.legacyId = record.legacyId;
    if ('lead' in record) {
      next.lead = record.lead;
      next.imageUrl = record.imageUrl;
      next.highlightsText = record.highlights.join('\n');
      next.videoUrl = record.videoUrl ?? '';
    }
    if ('href' in record) {
      next.href = record.href;
      next.body = record.content;
      next.tagsText = record.tags.join(', ');
    }
    setEditor(next);
    setPreview(showPreview);
  }

  async function saveContent(publishAfterSave = false) {
    if (!editor) return;
    setUpdating(`save:${editor.kind}`);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/${editor.kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildAdminContentPayload(editor)),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (response.status === 400) {
        setError(
          editor.kind === 'news'
            ? '新聞未儲存。請確認已填寫標題、摘要及有效的高解析圖片網址（https:// 或 / 開頭）。'
            : '內容未儲存。請確認所有必填欄位與網址格式後再試。',
        );
        return;
      }
      if (response.status === 409) {
        await load();
        setError('內容已由其他工作階段更新。資料已重新載入，請再次編輯。');
        return;
      } else if (!response.ok) {
        throw new Error('save_failed');
      }
      const saved = (await response.json()) as { record?: { id?: unknown } };
      const savedId =
        typeof saved.record?.id === 'string' ? saved.record.id : editor.id;
      if (publishAfterSave) {
        if (!savedId) throw new Error('missing_saved_id');
        const publication = await fetch(`/api/admin/${editor.kind}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: savedId, status: 'published' }),
        });
        if (redirectAdminUnauthorized(publication, window.location)) return;
        if (!publication.ok) throw new Error('publish_failed');
      }
      setEditor(null);
      setPreview(false);
      setNotice(
        publishAfterSave
          ? '內容已儲存並發布，公開網站會立即顯示最新內容。'
          : '內容已儲存為草稿。發布後才會顯示於公開網站。',
      );
      await load();
    } catch {
      setError(
        publishAfterSave
          ? '內容可能已儲存，但尚未成功發布。請重新載入後確認狀態。'
          : '內容未儲存。請確認必填欄位及網址格式後再試。',
      );
    } finally {
      setUpdating('');
    }
  }

  async function deleteContent(
    kind: 'news' | 'downloads' | 'knowledge',
    id: string,
    title: string,
  ) {
    if (
      !window.confirm(
        `確定要永久刪除「${title}」嗎？此動作也會移除相關英文翻譯，無法復原。`,
      )
    ) {
      return;
    }
    const operation = `delete:${kind}:${id}`;
    setUpdating(operation);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/admin/${kind}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('delete_failed');
      if (editor?.id === id) {
        setEditor(null);
        setPreview(false);
      }
      setNotice('內容已永久刪除，公開網站與聊天知識庫會立即同步更新。');
      await load();
    } catch {
      setError('無法刪除內容，請重新載入後再試。');
    } finally {
      setUpdating('');
    }
  }

  return (
    <main className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <a
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
        </a>
        <nav aria-label="管理後台">
          {(
            [
              ['overview', '總覽'],
              ['content', '內容管理'],
              ['leads', '客戶詢問'],
              ['gaps', '聊天缺口'],
              ...(identity.role === 'admin'
                ? [['translations', '英文翻譯']]
                : []),
              ...(identity.role === 'admin'
                ? [['lineContacts', 'LINE 聯絡']]
                : []),
            ] as Array<[View, string]>
          ).map(([id, label]) => (
            <button
              type="button"
              className={view === id ? styles.activeNav : ''}
              onClick={() => setView(id)}
              key={id}
            >
              {label}
              {id === 'translations' && snapshot?.translations?.needsReview
                ? `（${snapshot.translations.needsReview}）`
                : ''}
            </button>
          ))}
          <a className={styles.navLink} href="/admin/documents">
            技術文件
          </a>
          <a className={styles.navLink} href="/admin/knowledge-quality">
            知識品質
          </a>
          <a className={styles.navLink} href="/admin/ai-health">
            AI 服務狀態
          </a>
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
                    : view === 'translations'
                      ? '英文翻譯管理'
                      : view === 'lineContacts'
                        ? 'LINE 聯絡管理'
                        : '聊天知識缺口'}
            </h1>
          </div>
          <div
            className={
              view === 'translations' || view === 'lineContacts'
                ? styles.hiddenFilters
                : styles.dateFilters
            }
          >
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
        {notice ? <div className={styles.notice}>{notice}</div> : null}
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
            <article className={styles.panel}>
              <h2>語系成效比較</h2>
              <p className={styles.panelIntro}>
                同一訪客可瀏覽兩種語系，因此各語系訪客數相加可能高於總訪客數。
              </p>
              <div className={styles.localeTable}>
                <table aria-label="語系成效比較">
                  <thead>
                    <tr>
                      <th scope="col">指標</th>
                      <th scope="col">繁體中文</th>
                      <th scope="col">English</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricCards.map((card) => (
                      <tr key={card.key}>
                        <th scope="row">{card.label}</th>
                        {(['zh-TW', 'en'] as const).map((locale) => {
                          const value =
                            snapshot.byLocale[locale].metrics[card.key];
                          return (
                            <td key={locale}>
                              {card.percent
                                ? `${(value * 100).toFixed(1)}%`
                                : new Intl.NumberFormat('zh-TW').format(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
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

        {view === 'translations' && identity.role === 'admin' ? (
          <TranslationManager />
        ) : null}

        {view === 'lineContacts' && identity.role === 'admin' ? (
          <LineContactManager />
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
                  <div className={styles.headingActions}>
                    <span>{records.length} 筆</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditor(emptyAdminContentEditor(kind));
                        setPreview(false);
                      }}
                    >
                      ＋ 新增
                    </button>
                  </div>
                </div>
                {editor?.kind === kind ? (
                  <form
                    className={styles.contentEditor}
                    onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
                      event.preventDefault();
                      void saveContent(false);
                    }}
                  >
                    <div className={styles.editorHeading}>
                      <h3>
                        {editor.id ? `編輯：${editor.title}` : `新增${label}`}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setEditor(null);
                          setPreview(false);
                        }}
                      >
                        關閉
                      </button>
                    </div>
                    <div className={styles.editorFields}>
                      {kind === 'downloads' && (
                        <label>
                          下載編號
                          <input
                            required
                            inputMode="numeric"
                            pattern="[0-9]+"
                            value={editor.legacyId}
                            onChange={(event) =>
                              setEditor({
                                ...editor,
                                legacyId: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                      {kind === 'news' ? (
                        <p className={styles.editorNotice}>
                          公開新聞編號由系統自動建立，無需填寫原網址 ID。
                        </p>
                      ) : null}
                      <label>
                        標題
                        <input
                          required
                          maxLength={160}
                          value={editor.title}
                          onChange={(event) =>
                            setEditor({ ...editor, title: event.target.value })
                          }
                        />
                      </label>
                      {kind === 'news' ? (
                        <>
                          <label className={styles.fullField}>
                            摘要
                            <textarea
                              required
                              maxLength={8000}
                              rows={4}
                              value={editor.lead}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  lead: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            高解析圖片網址
                            <input
                              required
                              value={editor.imageUrl}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  imageUrl: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            影片網址（選填）
                            <input
                              value={editor.videoUrl}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  videoUrl: event.target.value,
                                })
                              }
                            />
                            <small>
                              支援 YouTube 一般網址、youtu.be 短網址、Shorts
                              及嵌入網址。
                            </small>
                          </label>
                          <label className={styles.fullField}>
                            重點（每行一項）
                            <textarea
                              rows={5}
                              value={editor.highlightsText}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  highlightsText: event.target.value,
                                })
                              }
                            />
                          </label>
                        </>
                      ) : null}
                      {kind === 'knowledge' ? (
                        <>
                          <label>
                            標籤（逗號分隔）
                            <input
                              value={editor.tagsText}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  tagsText: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className={styles.fullField}>
                            可供聊天機器人搜尋的內容
                            <textarea
                              required
                              maxLength={8000}
                              rows={8}
                              value={editor.body}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  body: event.target.value,
                                })
                              }
                            />
                          </label>
                        </>
                      ) : null}
                      <p className={styles.editorNotice}>
                        發布狀態：
                        {editor.id && editor.status === 'published'
                          ? '已發布'
                          : '草稿'}
                        。儲存不會變更發布狀態；請使用內容清單中的發布按鈕。
                      </p>
                    </div>
                    <div className={styles.editorActions}>
                      <button
                        type="button"
                        onClick={() => setPreview((value) => !value)}
                      >
                        {preview ? '關閉預覽' : '預覽'}
                      </button>
                      <button
                        type="submit"
                        disabled={updating === `save:${kind}`}
                      >
                        {updating === `save:${kind}` ? '儲存中…' : '儲存為草稿'}
                      </button>
                      {editor.status === 'draft' ? (
                        <button
                          type="button"
                          disabled={updating === `save:${kind}`}
                          onClick={() => void saveContent(true)}
                        >
                          {updating === `save:${kind}`
                            ? '發布中…'
                            : '儲存並發布'}
                        </button>
                      ) : null}
                    </div>
                    {preview ? (
                      <article className={styles.contentPreview}>
                        <span>
                          {editor.status === 'published'
                            ? '發布預覽'
                            : '草稿預覽'}
                        </span>
                        {kind === 'news' && editor.imageUrl ? (
                          /* oxlint-disable-next-line next/no-img-element -- Admin previews user-selected local or remote URLs without an optimization allowlist. */
                          <img
                            src={
                              youtubeThumbnailUrl(editor.imageUrl) ??
                              editor.imageUrl
                            }
                            alt="新聞圖片預覽"
                          />
                        ) : null}
                        <h3>{editor.title || '尚未輸入標題'}</h3>
                        <p>
                          {kind === 'knowledge'
                            ? editor.body
                            : kind === 'news'
                              ? editor.lead
                              : `下載項目：${editor.title}`}
                        </p>
                        {kind === 'news' && editor.highlightsText ? (
                          <ul>
                            {editor.highlightsText
                              .split('\n')
                              .filter(Boolean)
                              .map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                          </ul>
                        ) : null}
                        {kind === 'knowledge' ? (
                          <small>此內容僅供網站助理查詢與回答。</small>
                        ) : null}
                      </article>
                    ) : null}
                  </form>
                ) : null}
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
                                ? kind === 'news'
                                  ? `新聞編號：${record.legacyId}`
                                  : `下載編號：${record.legacyId}`
                                : '供網站助理使用'}
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
                          <div className={styles.rowActions}>
                            <button
                              type="button"
                              onClick={() => editContent(kind, record)}
                            >
                              編輯
                            </button>
                            <button
                              className={styles.deleteButton}
                              type="button"
                              disabled={
                                updating === `delete:${kind}:${record.id}`
                              }
                              onClick={() =>
                                void deleteContent(
                                  kind,
                                  record.id,
                                  record.title,
                                )
                              }
                            >
                              {updating === `delete:${kind}:${record.id}`
                                ? '刪除中…'
                                : '刪除'}
                            </button>
                            <button
                              type="button"
                              onClick={() => editContent(kind, record, true)}
                            >
                              預覽
                            </button>
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
                    <label className={styles.leadStatus}>
                      處理狀態
                      <select
                        value={lead.status}
                        disabled={updating === `lead:${lead.id}`}
                        onChange={(event) =>
                          void setLeadStatus(
                            lead.id,
                            event.currentTarget
                              .value as keyof typeof leadStatusLabels,
                          )
                        }
                      >
                        {Object.entries(leadStatusLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
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
                    <small>
                      語系：{question.locale === 'en' ? 'English' : '繁體中文'}
                    </small>
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
