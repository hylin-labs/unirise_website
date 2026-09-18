'use client';

import { type SyntheticEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminIdentity } from '../lib/admin-auth';
import type { KnowledgeDocument } from '../lib/document-repository';
import { redirectAdminUnauthorized } from '../lib/admin-content';
import styles from './admin-dashboard.module.css';

const accessLabels = {
  public: '公開知識（可供審核後的網站助理使用）',
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
    'internal',
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      setFile(null);
      setTitle('');
      setNotice(
        access === 'confidential'
          ? '機密文件已安全保存，不會進入網站助理。'
          : '文件已保存，下一階段可進行文字擷取與審核。',
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

  return (
    <main className={styles.dashboard}>
      <aside className={styles.sidebar}>
        <Link
          className={styles.dashboardBrand}
          href="/admin"
          aria-label="返回管理後台"
        >
          合軒科技管理後台
        </Link>
        <nav aria-label="文件管理導覽">
          <Link
            className={`${styles.navLink} ${styles.activeNav}`}
            href="/admin/documents"
          >
            技術文件
          </Link>
          <Link className={styles.navLink} href="/admin">
            返回管理總覽
          </Link>
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
            原始檔案僅保存在私有文件庫。公開文件仍必須完成文字擷取與人工審核，才會供網站助理回答。
          </p>
          <form className={styles.editorForm} onSubmit={upload}>
            <label>
              PDF 檔案
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  chooseFile(event.currentTarget.files?.[0] ?? null)
                }
              />
            </label>
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
                {saving ? '儲存中…' : '安全保存文件'}
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
                <div className={styles.contentRow} key={record.id}>
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
                    <span>
                      {record.assistantStatus === 'excluded'
                        ? '不進入助理'
                        : '待文字擷取'}
                    </span>
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
      </section>
    </main>
  );
}
