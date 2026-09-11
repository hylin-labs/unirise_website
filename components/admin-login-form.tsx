'use client';

import { type SyntheticEvent, useState } from 'react';
import styles from './admin-dashboard.module.css';

export function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/admin/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setStatus(
          response.status === 401
            ? '帳號或密碼不正確。'
            : '目前無法登入，請稍後再試。',
        );
        return;
      }
      window.location.assign('/admin');
    } catch {
      setStatus('目前無法登入，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={signIn} className={styles.loginForm}>
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
        <label htmlFor="admin-password">管理員密碼</label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          maxLength={512}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? '登入中…' : '登入管理後台'}
        </button>
      </form>
      {status ? <p className={styles.loginStatus}>{status}</p> : null}
    </>
  );
}
