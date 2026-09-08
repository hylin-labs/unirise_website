'use client';

import Image from 'next/image';
import Link from 'next/link';
import { type SyntheticEvent, useState } from 'react';
import styles from '../../../components/admin-dashboard.module.css';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('hungyu@gmail.com');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function requestCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error('request_failed');
      setStep('code');
      setStatus('如果此信箱已獲授權，登入碼已寄出。登入碼於 10 分鐘後失效。');
    } catch {
      setStatus('目前無法寄送登入碼，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      if (!response.ok) {
        setStatus(
          response.status === 401
            ? '登入碼不正確或已失效。'
            : '目前無法驗證登入碼，請稍後再試。',
        );
        return;
      }
      window.location.assign('/admin');
    } catch {
      setStatus('目前無法驗證登入碼，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard} aria-labelledby="admin-login-title">
        <Link className={styles.brand} href="/">
          <Image
            src="/reference/original/logo.png"
            width={347}
            height={90}
            alt="合軒科技有限公司"
            priority
          />
        </Link>
        <p className={styles.eyebrow}>UNIRISE ADMINISTRATION</p>
        <h1 id="admin-login-title">管理後台登入</h1>
        <p className={styles.intro}>使用獲授權的公司信箱取得一次性登入碼。</p>
        {step === 'email' ? (
          <form onSubmit={requestCode} className={styles.loginForm}>
            <label htmlFor="admin-email">電子信箱</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              maxLength={320}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" disabled={busy}>
              {busy ? '寄送中…' : '寄送登入碼'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className={styles.loginForm}>
            <label htmlFor="admin-code">六位數登入碼</label>
            <input
              id="admin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ''))
              }
            />
            <button type="submit" disabled={busy || code.length !== 6}>
              {busy ? '驗證中…' : '登入管理後台'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => {
                setStep('email');
                setCode('');
                setStatus('');
              }}
            >
              更換信箱
            </button>
          </form>
        )}
        {status ? <p className={styles.loginStatus}>{status}</p> : null}
        <Link className={styles.backLink} href="/">
          ← 返回公開網站
        </Link>
      </section>
    </main>
  );
}
