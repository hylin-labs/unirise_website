'use client';

import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import type { AdminIdentity } from '../lib/admin-auth';
import type {
  DocumentReview,
  KnowledgeDocument,
} from '../lib/document-repository';
import { redirectAdminUnauthorized } from '../lib/admin-content';
import styles from './admin-dashboard.module.css';

/* oxlint-disable next/no-html-link-for-pages -- Standard anchors avoid Vinext's failing client-side prefetch for these administrative routes. */

const accessLabels = {
  public: '公開知識（自動加入網站助理）',
  internal: '內部知識（僅管理後台）',
  confidential: '機密資料（永不供網站助理使用）',
} as const;

function formatSize(bytes: number) {
  return `${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 1 }).format(bytes / 1_048_576)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(
    new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`),
  );
}

export function DocumentManager({ identity }: { identity: AdminIdentity }) {
  const [records, setRecords] = useState<KnowledgeDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('技術文件');
  const [language, setLanguage] = useState<'zh-TW' | 'en' | 'mixed'>('zh-TW');
  const [access, setAccess] = useState<'public' | 'internal' | 'confidential'>(
    'public',
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [reviewFilter, setReviewFilter] = useState<
    'review_required' | 'approved' | 'rejected'
  >('approved');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/documents', {
        cache: 'no-store',
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('load_failed');
      const payload = (await response.json()) as {
        records: KnowledgeDocument[];
      };
      setRecords(payload.records);
    } catch {
      setError('目前無法載入技術文件，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function chooseFile(next: File | null) {
    setFile(next);
    if (next && !title) setTitle(next.name.replace(/\.pdf$/i, ''));
  }

  async function upload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('請選擇 PDF 檔案。');
      return;
    }
    if (file.type && file.type !== 'application/pdf') {
      setError('目前僅接受 PDF 檔案。');
      return;
    }
    if (file.size > 52_428_800) {
      setError('目前單一檔案上限為 50 MB。');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          'X-Document-Original-Filename': encodeURIComponent(file.name),
          'X-Document-Title': encodeURIComponent(title),
          'X-Document-Category': encodeURIComponent(category),
          'X-Document-Language': language,
          'X-Document-Access': access,
          'X-Document-File-Size': String(file.size),
        },
        body: file,
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('upload_failed');
      const payload = (await response.json()) as {
        record: { status: 'approved' | 'excluded' | 'failed' };
      };
      setFile(null);
      setTitle('');
      setNotice(
        payload.record.status === 'approved'
          ? access === 'public'
            ? '文件已完成自動擷取與安全檢查，現在可供網站助理回答。'
            : '文件已完成自動擷取與安全檢查，保留為內部知識。'
          : payload.record.status === 'excluded'
            ? '文件已安全保存；因權限或敏感內容規則，不會提供網站助理使用。'
            : '文件已保存，但無法讀取文字。請改上傳可搜尋文字的 PDF。',
      );
      await load();
    } catch {
      setError('文件尚未保存。請確認檔案與網路後再試。');
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: KnowledgeDocument) {
    if (
      !window.confirm(
        `確定要永久刪除「${record.displayTitle}」嗎？原始 PDF 與後續擷取資料都會一併移除。`,
      )
    )
      return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: record.id }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('delete_failed');
      setNotice('文件已永久刪除。');
      await load();
    } catch {
      setError('無法刪除文件，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  async function openReview(record: KnowledgeDocument) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `/api/admin/document-reviews?id=${encodeURIComponent(record.id)}`,
        { cache: 'no-store' },
      );
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('review_load_failed');
      const payload = (await response.json()) as { review: DocumentReview };
      setReview(payload.review);
      setReviewFilter('approved');
      setDrafts(
        Object.fromEntries(
          payload.review.chunks.map((chunk) => [chunk.id, chunk.content]),
        ),
      );
    } catch {
      setError('目前無法載入文件處理紀錄，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  async function applyReview(
    chunkId: string,
    action: 'approve' | 'reject' | 'save',
  ) {
    if (!review) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/document-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: review.document.id,
          chunkId,
          action,
          content: action === 'save' ? drafts[chunkId] : undefined,
        }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('review_update_failed');
      const payload = (await response.json()) as { review: DocumentReview };
      setReview(payload.review);
      setDrafts(
        Object.fromEntries(
          payload.review.chunks.map((chunk) => [chunk.id, chunk.content]),
        ),
      );
      await load();
    } catch {
      setError('段落尚未更新，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  async function approveAll() {
    if (!review) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/document-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: review.document.id,
          action: 'approve_all',
        }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('approve_all_failed');
      const payload = (await response.json()) as { review: DocumentReview };
      setReview(payload.review);
      setReviewFilter('approved');
      setNotice('待處理段落已核准。');
      await load();
    } catch {
      setError('無法批次核准，請稍後再試。');
    } finally {
      setSaving(false);
    }
  }

  function assistantStatusLabel(record: KnowledgeDocument) {
    if (record.assistantStatus === 'excluded') return '已安全排除';
    if (record.assistantStatus === 'processing') return '系統自動處理中…';
    if (record.assistantStatus === 'review_required') {
      return `舊文件待處理${record.extractionPageCount ? `・${record.extractionPageCount} 頁` : ''}`;
    }
    if (record.assistantStatus === 'approved') {
      return record.accessLevel === 'public'
        ? '已加入助理'
        : '已完成內部處理';
    }
    if (record.assistantStatus === 'failed')
      return record.extractionError === 'no_extractable_text'
        ? '找不到可擷取文字（需要 OCR）'
        : '自動處理失敗';
    return '等待系統自動處理';
  }

  return (
    <main className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <a
          className={styles.dashboardBrand}
          href="/admin"
          aria-label="返回管理後台"
        >
          合軒科技管理後台
        </a>
        <nav aria-label="文件管理導覽">
          <a
            className={`${styles.navLink} ${styles.activeNav}`}
            href="/admin/documents"
          >
            技術文件
          </a>
          <a className={styles.navLink} href="/admin/ai-health">
            AI 服務狀態
          </a>
          <a className={styles.navLink} href="/admin">
            返回管理總覽
          </a>
        </nav>
        <div className={styles.account}>
          <span>登入身分</span>
          <strong>{identity.email}</strong>
        </div>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>UNIRISE KNOWLEDGE</p>
            <h1>技術文件知識庫</h1>
          </div>
        </header>
        {error ? <p className={styles.error}>{error}</p> : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}
        <article className={styles.panel}>
          <h2>上傳 PDF 文件</h2>
          <p className={styles.panelIntro}>
            上傳後，系統會自動擷取文字、略過敏感段落，並將可用內容直接加入網站助理。原始 PDF 僅保存在私有文件庫。
          </p>
          <form className={styles.editorForm} onSubmit={upload}>
            <div className={styles.documentUploadField}>
              <span id="document-file-label">PDF 檔案</span>
              <input
                id="document-file"
                className={styles.fileInput}
                type="file"
                accept="application/pdf,.pdf"
                aria-describedby="document-file-help"
                onChange={(event) =>
                  chooseFile(event.currentTarget.files?.[0] ?? null)
                }
              />
              <label className={styles.filePicker} htmlFor="document-file">
                選擇 PDF 檔案
              </label>
              <p className={styles.fileName} id="document-file-help">
                {file
                  ? `已選擇：${file.name}（${formatSize(file.size)}）`
                  : '尚未選擇檔案（僅限 PDF，單一檔案最大 50 MB）'}
              </p>
            </div>
            <label>
              顯示名稱
              <input
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                maxLength={255}
                required
              />
            </label>
            <label>
              分類
              <input
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
                maxLength={80}
                required
              />
            </label>
            <label>
              原始語言
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.currentTarget.value as typeof language)
                }
              >
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
                <option value="mixed">中英文混合</option>
              </select>
            </label>
            <label>
              資料權限
              <select
                value={access}
                onChange={(event) =>
                  setAccess(event.currentTarget.value as typeof access)
                }
              >
                {Object.entries(accessLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.editorActions}>
              <button type="submit" disabled={saving}>
                {saving ? '上傳並自動處理中…' : '上傳並自動加入助理'}
              </button>
            </div>
          </form>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2>已保存文件</h2>
            <span>{records.length} 份</span>
          </div>
          {loading ? (
            <p className={styles.empty}>載入中…</p>
          ) : records.length ? (
            <div className={styles.contentList}>
              {records.map((record) => (
                <div
                  className={`${styles.contentRow} ${styles.documentRow}`}
                  key={record.id}
                >
                  <div>
                    <strong>{record.displayTitle}</strong>
                    <small>
                      {record.originalFilename}
                      <br />
                      {record.category} · {formatSize(record.fileSize)} ·{' '}
                      {formatDate(record.updatedAt)}
                    </small>
                  </div>
                  <span
                    className={
                      record.accessLevel === 'confidential'
                        ? styles.draft
                        : styles.published
                    }
                  >
                    {accessLabels[record.accessLevel]}
                  </span>
                  <div className={styles.rowActions}>
                    <span>{assistantStatusLabel(record)}</span>
                    {record.extractionPageCount ? (
                      <button
                        type="button"
                        onClick={() => void openReview(record)}
                        disabled={saving}
                      >
                        檢視處理紀錄
                      </button>
                    ) : null}
                    <button
                      className={styles.deleteButton}
                      type="button"
                      onClick={() => void remove(record)}
                      disabled={saving}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>尚未上傳文件。</p>
          )}
        </article>
        {review ? (
          <article className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <h2>處理紀錄：{review.document.displayTitle}</h2>
                <p className={styles.panelIntro}>
                  這是選用的進階檢視功能；一般上傳已由系統完成安全檢查並自動加入助理。
                </p>
              </div>
              <div className={styles.headingActions}>
                {review.summary.reviewRequired ? (
                  <button
                    type="button"
                    onClick={() => void approveAll()}
                    disabled={saving}
                  >
                    核准舊版待處理段落
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setReview(null)}
                  disabled={saving}
                >
                  關閉紀錄
                </button>
              </div>
            </div>
            <div className={styles.reviewSummary}>
              <span>待審 {review.summary.reviewRequired}</span>
              <span>已核准 {review.summary.approved}</span>
              <span>已排除 {review.summary.rejected}</span>
            </div>
            <div className={styles.reviewFilters} aria-label="段落審核篩選">
              {(
                [
                  ['review_required', '舊版待處理'],
                  ['approved', '已核准'],
                  ['rejected', '已排除'],
                ] as const
              ).map(([value, label]) => (
                <button
                  className={
                    reviewFilter === value ? styles.activeReviewFilter : ''
                  }
                  key={value}
                  type="button"
                  onClick={() => setReviewFilter(value)}
                  disabled={saving}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.reviewList}>
              {review.chunks
                .filter((chunk) => chunk.status === reviewFilter)
                .map((chunk) => (
                  <section className={styles.reviewChunk} key={chunk.id}>
                    <div className={styles.reviewChunkHeading}>
                      <strong>段落 {chunk.chunkNumber + 1}</strong>
                      <span>
                        來源頁碼：{chunk.pageStart}
                        {chunk.pageEnd === chunk.pageStart
                          ? ''
                          : `–${chunk.pageEnd}`}
                      </span>
                    </div>
                    <textarea
                      aria-label={`段落 ${chunk.chunkNumber + 1} 內容`}
                      value={drafts[chunk.id] ?? chunk.content}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [chunk.id]: event.currentTarget.value,
                        }))
                      }
                      disabled={saving}
                      rows={7}
                    />
                    <div className={styles.reviewActions}>
                      <button
                        type="button"
                        onClick={() => void applyReview(chunk.id, 'save')}
                        disabled={saving}
                      >
                        儲存內容
                      </button>
                      {chunk.status !== 'approved' ? (
                        <button
                          type="button"
                          onClick={() => void applyReview(chunk.id, 'approve')}
                          disabled={saving}
                        >
                          核准
                        </button>
                      ) : null}
                      {chunk.status !== 'rejected' ? (
                        <button
                          className={styles.deleteButton}
                          type="button"
                          onClick={() => void applyReview(chunk.id, 'reject')}
                          disabled={saving}
                        >
                          排除
                        </button>
                      ) : null}
                    </div>
                  </section>
                ))}
              {!review.chunks.some((chunk) => chunk.status === reviewFilter) ? (
                <p className={styles.empty}>這個篩選條件目前沒有段落。</p>
              ) : null}
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
