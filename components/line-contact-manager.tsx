'use client';

import { type SyntheticEvent, useEffect, useState } from 'react';
import { redirectAdminUnauthorized } from '../lib/admin-content';
import styles from './admin-dashboard.module.css';

type LineContact = {
  id: string;
  labelZh: string;
  labelEn: string;
  lineUrl: string;
  enabled: boolean;
  displayOrder: number;
  updatedAt: string;
};
type Draft = Omit<LineContact, 'id' | 'updatedAt'>;
const emptyDraft: Draft = {
  labelZh: '',
  labelEn: '',
  lineUrl: '',
  enabled: true,
  displayOrder: 0,
};

function draftFromContact(contact: LineContact): Draft {
  const { id: _id, updatedAt: _updatedAt, ...draft } = contact;
  return draft;
}

function messageFor(error: string) {
  if (error === 'lineUrl must be a LINE link')
    return '請輸入 LINE 的加好友連結，例如 https://line.me/ti/p/… 或 https://lin.ee/…';
  if (error === 'not_found') return '這個聯絡窗口已不存在，請重新載入。';
  return '無法儲存 LINE 聯絡設定，請確認內容後再試。';
}

export function LineContactManager() {
  const [contacts, setContacts] = useState<LineContact[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/line-contacts', {
        headers: { Accept: 'application/json' },
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) throw new Error('load_failed');
      const payload = (await response.json()) as { contacts?: LineContact[] };
      setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
    } catch {
      setError('無法載入 LINE 聯絡設定，請重新載入後再試。');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/admin/line-contacts', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (redirectAdminUnauthorized(response, window.location)) return;
        if (!response.ok) throw new Error('load_failed');
        const payload = (await response.json()) as { contacts?: LineContact[] };
        setContacts(Array.isArray(payload.contacts) ? payload.contacts : []);
      })
      .catch((loadError: unknown) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === 'AbortError'
        )
          return;
        setError('無法載入 LINE 聯絡設定，請重新載入後再試。');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  function resetEditor() {
    setDraft(emptyDraft);
    setEditingId(null);
  }
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/line-contacts', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingId ? { id: editingId, ...draft } : draft),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'save_failed');
      setNotice(editingId ? 'LINE 聯絡窗口已更新。' : 'LINE 聯絡窗口已新增。');
      resetEditor();
      await load();
    } catch (saveError) {
      setError(messageFor(saveError instanceof Error ? saveError.message : ''));
    } finally {
      setSaving(false);
    }
  }
  async function remove(contact: LineContact) {
    if (!window.confirm(`確定要刪除「${contact.labelZh}」嗎？`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/line-contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contact.id }),
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? 'delete_failed');
      }
      if (editingId === contact.id) resetEditor();
      setNotice('LINE 聯絡窗口已刪除。');
      await load();
    } catch {
      setError('無法刪除 LINE 聯絡窗口，請重新載入後再試。');
    } finally {
      setSaving(false);
    }
  }
  return (
    <article className={styles.panel}>
      <h2>LINE 聯絡窗口</h2>
      <p className={styles.panelIntro}>
        每一筆連結都會在公開網站自動產生 QR Code。訪客可掃描 QR Code 或直接開啟
        LINE；訊息會送至該 LINE 帳號，不會寫入網站資料庫。
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {loading ? <p className={styles.empty}>正在載入 LINE 聯絡窗口…</p> : null}
      {!loading && contacts.length ? (
        <div className={styles.lineContactList}>
          {contacts.map((contact) => (
            <article className={styles.lineContactRow} key={contact.id}>
              <div>
                <h3>{contact.labelZh}</h3>
                <p>{contact.labelEn}</p>
                <a
                  href={contact.lineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {contact.lineUrl}
                </a>
              </div>
              <div className={styles.lineContactMeta}>
                <span>{contact.enabled ? '公開中' : '暫停顯示'}</span>
                <span>排序 {contact.displayOrder}</span>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(draftFromContact(contact));
                      setEditingId(contact.id);
                      setNotice('');
                      setError('');
                    }}
                    disabled={saving}
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(contact)}
                    disabled={saving}
                  >
                    刪除
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <form
        className={styles.editorForm}
        onSubmit={(event) => void save(event)}
      >
        <h3 className={styles.fullField}>
          {editingId ? '編輯聯絡窗口' : '新增聯絡窗口'}
        </h3>
        <label>
          繁體中文名稱
          <input
            value={draft.labelZh}
            onChange={(event) =>
              setDraft((value) => ({ ...value, labelZh: event.target.value }))
            }
            maxLength={80}
            required
            placeholder="例如：業務聯絡"
          />
        </label>
        <label>
          English label
          <input
            value={draft.labelEn}
            onChange={(event) =>
              setDraft((value) => ({ ...value, labelEn: event.target.value }))
            }
            maxLength={80}
            required
            placeholder="For example: Sales contact"
          />
        </label>
        <label className={styles.fullField}>
          LINE QR Code 對應連結
          <input
            type="url"
            value={draft.lineUrl}
            onChange={(event) =>
              setDraft((value) => ({ ...value, lineUrl: event.target.value }))
            }
            maxLength={2048}
            required
            placeholder="https://line.me/ti/p/… 或 https://lin.ee/…"
          />
        </label>
        <label>
          顯示排序
          <input
            type="number"
            min="0"
            max="999"
            value={draft.displayOrder}
            onChange={(event) =>
              setDraft((value) => ({
                ...value,
                displayOrder: Number(event.target.value),
              }))
            }
            required
          />
        </label>
        <label className={styles.lineEnabledField}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft((value) => ({ ...value, enabled: event.target.checked }))
            }
          />
          在公開網站顯示
        </label>
        <p className={styles.editorNotice}>
          請從 LINE 的「我的 QR Code」複製連結貼上。系統只接受 line.me 或 lin.ee
          的 HTTPS 連結，避免訪客被帶往不安全網站。
        </p>
        <div className={styles.editorActions}>
          {editingId ? (
            <button type="button" onClick={resetEditor} disabled={saving}>
              取消
            </button>
          ) : null}
          <button type="submit" disabled={saving}>
            {saving ? '儲存中…' : editingId ? '儲存變更' : '新增聯絡窗口'}
          </button>
        </div>
      </form>
    </article>
  );
}
