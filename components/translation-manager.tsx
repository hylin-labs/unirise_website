'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseDatabaseTimestamp,
  redirectAdminUnauthorized,
} from '../lib/admin-content';
import {
  translationStateLabel,
  type TranslationResource,
  type TranslationListing,
  type AdminTranslationJob,
  type AdminJobItem,
} from '../lib/translation-admin';
import type { TranslationPayload } from '../lib/translation-types';
import styles from './translation-manager.module.css';

const typeLabels = {
  news: '最新消息',
  download: '下載項目',
  knowledge: '聊天知識',
  public_content: '網站固定內容',
};
const jobLabels = {
  pending: '等待處理',
  running: '處理中',
  completed: '已完成',
  failed: '部分項目失敗',
};
const failureLabels: Record<string, string> = {
  translation_not_configured: '尚未設定翻譯服務',
  translation_timeout: '翻譯服務逾時',
  translation_upstream_unavailable: '翻譯服務暫時無法使用',
  translation_output_invalid: '翻譯格式未通過檢查',
  translation_persistence_failed: '譯文未能儲存',
};
type TextField = { path: string[]; value: string };
function textFields(value: unknown, path: string[] = []): TextField[] {
  if (typeof value === 'string') return [{ path, value }];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    textFields(child, [...path, key]),
  );
}
function time(value?: string | null) {
  if (!value) return '尚無紀錄';
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Taipei',
  }).format(parseDatabaseTimestamp(value));
}
type ResourceAction = 'translate' | 'edit' | 'review' | 'publish' | 'unpublish';
export function TranslationResourceCard({
  resource,
  busy,
  onAction,
}: {
  resource: TranslationResource;
  busy: boolean;
  onAction: (action: ResourceAction, resource: TranslationResource) => void;
}) {
  const { source, translation } = resource;
  const fields = textFields(source.payload.text);
  const outdated =
    translation &&
    (translation.outdated ||
      translation.sourceVersion !== source.sourceVersion);
  return (
    <article className={styles.resource}>
      <div className={styles.heading}>
        <h3>{fields[0]?.value ?? source.resourceId}</h3>
        <span>{typeLabels[source.resourceType]}</span>
      </div>
      <p className={styles.excerpt}>
        {fields
          .slice(0, 3)
          .map((field) => field.value)
          .join(' ')
          .slice(0, 240)}
      </p>
      <p className={styles.state}>
        {translationStateLabel(resource)}
        {outdated ? '・來源已更新' : ''}
      </p>
      <dl className={styles.metadata}>
        <div>
          <dt>來源版本</dt>
          <dd>
            {source.sourceVersion}（
            {source.status === 'published' ? '已發布' : '草稿'}）
          </dd>
        </div>
        <div>
          <dt>英文版本</dt>
          <dd>
            {translation?.sourceVersion ?? '尚無'}
            {outdated ? '・需要更新' : translation ? '・與來源一致' : ''}
          </dd>
        </div>
        <div>
          <dt>譯文來源</dt>
          <dd>
            {translation
              ? translation.origin === 'ai'
                ? 'AI'
                : '人工編輯'
              : '尚無'}
          </dd>
        </div>
        <div>
          <dt>最近翻譯</dt>
          <dd>{time(translation?.translatedAt)}</dd>
        </div>
        <div>
          <dt>最近審核</dt>
          <dd>{time(translation?.reviewedAt)}</dd>
        </div>
      </dl>
      {translation?.failureReason ? (
        <output>
          {failureLabels[translation.failureReason] ?? '翻譯未完成，請重試。'}
        </output>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={
            busy ||
            source.status !== 'published' ||
            translation?.origin === 'human'
          }
          onClick={() => onAction('translate', resource)}
        >
          翻譯此項
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction('edit', resource)}
        >
          編輯英文與預覽
        </button>
        {translation ? (
          <>
            {translation.status === 'needs_review' ? (
              <button
                type="button"
                disabled={busy || !!outdated}
                onClick={() => onAction('review', resource)}
              >
                確認審核並發布
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || (translation.status === 'draft' && !!outdated)}
              onClick={() =>
                onAction(
                  translation.status === 'draft' ? 'publish' : 'unpublish',
                  resource,
                )
              }
            >
              {translation.status === 'draft' ? '發布英文' : '取消發布'}
            </button>
          </>
        ) : null}
      </div>
      {translation?.origin === 'human' ? (
        <small>人工譯文受到保護，請直接編輯英文。</small>
      ) : null}
    </article>
  );
}

type JobResponse = {
  job: AdminTranslationJob;
  items: AdminJobItem[];
  result?: { state: string };
};
export function TranslationManager() {
  const [listing, setListing] = useState<TranslationListing | null>(null);
  const [filter, setFilter] = useState({
    resourceType: '',
    state: '',
    outdated: '',
    origin: '',
    q: '',
  });
  const [offset, setOffset] = useState(0);
  const [jobOffset, setJobOffset] = useState(0);
  const [selectedJob, setSelectedJob] = useState('');
  const [runningJob, setRunningJob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<{
    resource: TranslationResource;
    payload: TranslationPayload;
  } | null>(null);
  const [preview, setPreview] = useState(false);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const api = useCallback(
    async <T,>(url: string, method = 'GET', payload?: object): Promise<T> => {
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        ...(payload
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          : {}),
      });
      if (redirectAdminUnauthorized(response, window.location))
        throw new Error('unauthorized');
      if (response.status === 409) throw new Error('conflict');
      if (!response.ok)
        throw new Error(response.status === 403 ? 'forbidden' : 'unavailable');
      return response.json() as Promise<T>;
    },
    [],
  );
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const query = new URLSearchParams({
      limit: '20',
      offset: String(offset),
      jobOffset: String(jobOffset),
    });
    for (const [key, value] of Object.entries(filter))
      if (value) query.set(key, value);
    if (selectedJob) query.set('jobId', selectedJob);
    const next = await api<TranslationListing>(
      `/api/admin/translations?${query}`,
    );
    if (mounted.current && generation === loadGeneration.current)
      setListing(next);
  }, [api, filter, offset, selectedJob, jobOffset]);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const showError = useCallback((reason: unknown) => {
    if (!mounted.current) return;
    setError(
      reason instanceof Error && reason.message === 'conflict'
        ? '資料已被更新。已重新載入，請保留目前編輯內容並重新確認版本。'
        : reason instanceof Error && reason.message === 'forbidden'
          ? '只有管理員可以管理翻譯。'
          : '操作未完成，請稍後再試。批次進度已保留。',
    );
  }, []);
  useEffect(() => {
    void load().catch(showError);
  }, [load, showError]);
  useEffect(() => {
    if (!runningJob) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = async () => {
      try {
        const result = await api<JobResponse>(
          '/api/admin/translations',
          'POST',
          { action: 'next', jobId: runningJob },
        );
        if (stopped) return;
        await loadRef.current();
        if (stopped) return;
        if (result.job.state === 'completed' || result.job.state === 'failed') {
          setRunningJob('');
          return;
        }
        timer = setTimeout(
          () => void step(),
          result.result?.state === 'idle' ? 3000 : 300,
        );
      } catch (reason) {
        if (!stopped) {
          showError(reason);
          setRunningJob('');
        }
      }
    };
    timer = setTimeout(() => void step(), 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, runningJob, showError]);

  async function mutate(method: string, payload: object) {
    setBusy(true);
    setError('');
    try {
      const result = await api<JobResponse>(
        '/api/admin/translations',
        method,
        payload,
      );
      if (!mounted.current) return;
      if (result.job) {
        setSelectedJob(result.job.id);
        setRunningJob(result.job.id);
      }
      await loadRef.current();
      return true;
    } catch (reason) {
      showError(reason);
      await loadRef.current().catch(() => undefined);
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function action(action: ResourceAction, resource: TranslationResource) {
    if (action === 'edit') {
      const payload = structuredClone(resource.source.payload);
      if (resource.translation) {
        const english = new Map(
          textFields(resource.translation.payload.text).map((field) => [
            field.path.join('.'),
            field.value,
          ]),
        );
        for (const field of textFields(payload.text)) {
          const value = english.get(field.path.join('.'));
          if (value === undefined) continue;
          let target = payload.text as unknown as Record<string, unknown>;
          for (const key of field.path.slice(0, -1))
            target = target[key] as Record<string, unknown>;
          target[field.path.at(-1)!] = value;
        }
      }
      setEditor({ resource, payload });
      setPreview(false);
      return;
    }
    const { resourceType, resourceId, sourceVersion } = resource.source;
    void mutate(
      action === 'translate' ? 'POST' : 'PATCH',
      action === 'translate'
        ? {
            action,
            requestKey: crypto.randomUUID(),
            resourceType,
            resourceId,
            sourceVersion,
          }
        : {
            action,
            resourceType,
            resourceId,
            sourceVersion,
            expectedUpdatedAt: resource.translation?.updatedAt ?? null,
          },
    );
  }
  const blocked = busy || !!runningJob;
  return (
    <section className={styles.manager} aria-label="英文翻譯管理">
      <p>
        AI
        譯文完成後會公開顯示，並標記為待人工審核。人工編輯先儲存為草稿，再由管理員發布。
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {listing ? (
        <p aria-live="polite">
          共 {listing.summary.total} 項・未翻譯 {listing.summary.missing}{' '}
          項・待審核 {listing.summary.needsReview} 項・已發布{' '}
          {listing.summary.published} 項・來源已更新 {listing.summary.outdated}{' '}
          項
        </p>
      ) : (
        <p>正在載入翻譯資料…</p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={blocked}
          onClick={() =>
            void mutate('POST', {
              action: 'start',
              requestKey: crypto.randomUUID(),
            })
          }
        >
          批次翻譯缺少或過期的英文
        </button>
        {runningJob ? (
          <button
            type="button"
            onClick={() => {
              setRunningJob('');
              void loadRef.current().catch(showError);
            }}
          >
            暫停後續處理
          </button>
        ) : null}
      </div>
      <p className={styles.notice}>
        每次處理一項。可安全離開或重新載入，之後從下方批次繼續；進行中的項目會完成或在逾時後重新接手。
      </p>
      <section className={styles.jobs} aria-label="翻譯批次">
        <h2>翻譯批次</h2>
        {selectedJob ? (
          <button type="button" onClick={() => setSelectedJob('')}>
            查看所有批次
          </button>
        ) : null}
        {listing?.jobs.map((job) => (
          <article key={job.id}>
            <strong>
              {time(job.createdAt)}・{jobLabels[job.state]}
            </strong>
            <p aria-live="polite">
              {job.progress.succeeded +
                job.progress.failed +
                job.progress.skipped}{' '}
              / {job.progress.total} 項已處理・成功 {job.progress.succeeded}
              ・失敗 {job.progress.failed}・略過 {job.progress.skipped}
            </p>
            <progress
              aria-label="批次進度"
              value={
                job.progress.succeeded +
                job.progress.failed +
                job.progress.skipped
              }
              max={Math.max(1, job.progress.total)}
            />
            <div className={styles.actions}>
              <button type="button" onClick={() => setSelectedJob(job.id)}>
                查看詳情
              </button>
              {['pending', 'running'].includes(job.state) ? (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => {
                    setError('');
                    setSelectedJob(job.id);
                    setRunningJob(job.id);
                  }}
                >
                  繼續批次
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!selectedJob ? (
          <div className={styles.actions}>
            <button
              type="button"
              disabled={jobOffset === 0}
              onClick={() => setJobOffset(Math.max(0, jobOffset - 20))}
            >
              較新的批次
            </button>
            <button
              type="button"
              disabled={(listing?.jobs.length ?? 0) < 20}
              onClick={() => setJobOffset(jobOffset + 20)}
            >
              較舊的批次
            </button>
          </div>
        ) : null}
        {listing?.items.map((item) => (
          <div className={styles.jobItem} key={item.id}>
            <span>
              {typeLabels[item.resourceType]}・{item.resourceId}・
              {item.state === 'failed'
                ? '失敗'
                : item.state === 'succeeded'
                  ? '成功'
                  : item.state === 'skipped'
                    ? '已略過'
                    : item.state === 'running'
                      ? '處理中'
                      : '等待處理'}
              ・已嘗試 {item.attempts} 次
            </span>
            {item.failureReason ? (
              <p>
                {failureLabels[item.failureReason] ?? '翻譯未完成，請重試。'}
              </p>
            ) : null}
            {item.state === 'failed' ? (
              <button
                type="button"
                disabled={blocked}
                onClick={() =>
                  void mutate('PATCH', {
                    action: 'retry',
                    jobId: item.jobId,
                    itemId: item.id,
                  })
                }
              >
                重試此項
              </button>
            ) : null}
          </div>
        ))}
      </section>
      <div className={styles.filters}>
        <label>
          內容類型
          <select
            value={filter.resourceType}
            onChange={(event) => {
              setOffset(0);
              setFilter({ ...filter, resourceType: event.target.value });
            }}
          >
            <option value="">全部類型</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          英文狀態
          <select
            value={filter.state}
            onChange={(event) => {
              setOffset(0);
              setFilter({ ...filter, state: event.target.value });
            }}
          >
            <option value="">全部狀態</option>
            <option value="missing">尚未翻譯</option>
            <option value="draft">草稿</option>
            <option value="needs_review">待人工審核</option>
            <option value="published">已發布</option>
          </select>
        </label>
        <label>
          來源版本
          <select
            value={filter.outdated}
            onChange={(event) => {
              setOffset(0);
              setFilter({ ...filter, outdated: event.target.value });
            }}
          >
            <option value="">全部版本</option>
            <option value="true">來源已更新</option>
            <option value="false">未過期</option>
          </select>
        </label>
        <label>
          譯文來源
          <select
            value={filter.origin}
            onChange={(event) => {
              setOffset(0);
              setFilter({ ...filter, origin: event.target.value });
            }}
          >
            <option value="">全部來源</option>
            <option value="ai">AI</option>
            <option value="human">人工</option>
          </select>
        </label>
        <label>
          搜尋中文內容
          <input
            value={filter.q}
            maxLength={160}
            onChange={(event) => {
              setOffset(0);
              setFilter({ ...filter, q: event.target.value });
            }}
          />
        </label>
      </div>
      {editor ? (
        <form
          className={styles.editor}
          onSubmit={(event) => {
            event.preventDefault();
            const { resourceType, resourceId, sourceVersion } =
              editor.resource.source;
            void mutate('PATCH', {
              action: 'edit',
              resourceType,
              resourceId,
              sourceVersion,
              expectedUpdatedAt: editor.resource.translation?.updatedAt ?? null,
              payload: editor.payload,
            }).then((saved) => {
              if (saved) setEditor(null);
            });
          }}
        >
          <h2>編輯英文</h2>
          <p>只編輯文字。網址、型號和規格須保留；儲存後為未公開草稿。</p>
          {textFields(editor.payload.text).map((field, index) => (
            <label key={field.path.join('.')}>
              <strong>英文文字 {index + 1}</strong>
              <small lang="zh-TW">
                {textFields(editor.resource.source.payload.text)[index]?.value}
              </small>
              <textarea
                lang="en"
                required
                maxLength={field.path.at(-1) === 'title' ? 160 : 8000}
                rows={3}
                value={field.value}
                onChange={(event) => {
                  const payload = structuredClone(editor.payload);
                  let target = payload.text as unknown as Record<
                    string,
                    unknown
                  >;
                  for (const key of field.path.slice(0, -1))
                    target = target[key] as Record<string, unknown>;
                  target[field.path.at(-1)!] = event.target.value;
                  setEditor({ ...editor, payload });
                }}
              />
            </label>
          ))}
          <div className={styles.actions}>
            <button type="button" onClick={() => setPreview(!preview)}>
              {preview ? '關閉預覽' : '預覽英文'}
            </button>
            <button type="submit" disabled={blocked}>
              儲存英文草稿
            </button>
            <button type="button" onClick={() => setEditor(null)}>
              關閉編輯
            </button>
          </div>
          {preview ? (
            <article className={styles.preview} lang="en" aria-label="英文預覽">
              {textFields(editor.payload.text).map((field) => (
                <p key={field.path.join('.')}>{field.value}</p>
              ))}
            </article>
          ) : null}
        </form>
      ) : null}
      <div className={styles.resources}>
        {listing?.resources.map((resource) => (
          <TranslationResourceCard
            key={`${resource.source.resourceType}:${resource.source.resourceId}`}
            resource={resource}
            busy={blocked}
            onAction={action}
          />
        ))}
      </div>
      {listing && !listing.resources.length ? (
        <p>沒有符合條件的內容。</p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          上一頁
        </button>
        <span>
          第 {Math.floor(offset / 20) + 1} 頁・共 {listing?.total ?? 0} 項
        </span>
        <button
          type="button"
          disabled={!listing || offset + 20 >= listing.total}
          onClick={() => setOffset(offset + 20)}
        >
          下一頁
        </button>
      </div>
    </section>
  );
}
