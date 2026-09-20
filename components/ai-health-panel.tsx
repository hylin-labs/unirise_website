'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminIdentity } from '../lib/admin-auth';
import { redirectAdminUnauthorized } from '../lib/admin-content';
import styles from './admin-dashboard.module.css';

/* oxlint-disable next/no-html-link-for-pages -- Administrative anchors intentionally perform full navigations to preserve the verified session behavior. */

type ModelCheck = {
  model: string;
  status: 'healthy' | 'http_error' | 'connection_failed' | 'timeout';
  httpStatus?: number;
};

type HealthPayload = {
  provider: 'groq';
  status: 'healthy' | 'fallback_healthy' | 'unavailable' | 'not_configured';
  primary?: ModelCheck;
  fallback?: ModelCheck;
};

function resultLabel(result: ModelCheck) {
  if (result.status === 'healthy') return '可正常回應';
  if (result.status === 'timeout') return '逾時';
  if (result.status === 'connection_failed') return '無法建立連線';
  return `服務拒絕（HTTP ${result.httpStatus ?? '未知'}）`;
}

function summary(payload: HealthPayload) {
  if (payload.status === 'healthy') return 'Qwen 已可從公開網站正常回應。';
  if (payload.status === 'fallback_healthy')
    return 'Qwen 暫時不可用；GPT-OSS 備援已可正常回應。';
  if (payload.status === 'not_configured')
    return '尚未設定網站助理的服務金鑰。';
  return '公開主機目前無法完成 Groq 聊天請求，網站助理會改用安全文件備援。';
}

export function AiHealthPanel({ identity }: { identity: AdminIdentity }) {
  const [result, setResult] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/ai-health', {
        cache: 'no-store',
      });
      if (redirectAdminUnauthorized(response, window.location)) return;
      const payload = (await response.json()) as HealthPayload;
      if (!response.ok && !payload.status) throw new Error('health_failed');
      setResult(payload);
    } catch {
      setError('目前無法完成 AI 服務檢查，請稍後再試。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void check(), 0);
    return () => window.clearTimeout(timer);
  }, [check]);

  const healthy =
    result?.status === 'healthy' || result?.status === 'fallback_healthy';

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
        <nav aria-label="AI 服務導覽">
          <a
            className={`${styles.navLink} ${styles.activeNav}`}
            href="/admin/ai-health"
          >
            AI 服務狀態
          </a>
          <a className={styles.navLink} href="/admin/documents">
            技術文件
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
            <p>UNIRISE AI OPERATIONS</p>
            <h1>網站助理服務狀態</h1>
          </div>
        </header>
        <article className={styles.panel}>
          <h2>Groq 模型連線檢查</h2>
          <p className={styles.panelIntro}>
            此檢查只會傳送極小的測試訊息，不會傳送客戶提問、技術文件或 API
            金鑰。
          </p>
          {loading ? <p className={styles.loading}>正在檢查模型連線…</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          {result ? (
            <div className={styles.healthStatus}>
              <p
                className={
                  healthy ? styles.healthHealthy : styles.healthProblem
                }
              >
                {summary(result)}
              </p>
              {result.primary ? (
                <p>
                  <strong>Qwen 主模型：</strong>
                  {resultLabel(result.primary)}
                </p>
              ) : null}
              {result.fallback ? (
                <p>
                  <strong>GPT-OSS 備援模型：</strong>
                  {resultLabel(result.fallback)}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className={styles.editorActions}>
            <button
              type="button"
              onClick={() => void check()}
              disabled={loading}
            >
              {loading ? '檢查中…' : '重新檢查'}
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
