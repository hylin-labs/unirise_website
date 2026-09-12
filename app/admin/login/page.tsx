'use client';

import Image from 'next/image';
import { AdminLoginForm } from '../../../components/admin-login-form';
import styles from '../../../components/admin-dashboard.module.css';

/* oxlint-disable next/no-html-link-for-pages -- These links intentionally leave the admin client state and perform a full public-site navigation. */

export default function AdminLoginPage() {
  return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard} aria-labelledby="admin-login-title">
        <a className={styles.brand} href="/" aria-label="返回公開網站">
          <Image
            src="/reference/original/logo.png"
            width={347}
            height={90}
            alt="合軒科技有限公司"
            priority
          />
        </a>
        <p className={styles.eyebrow}>UNIRISE ADMINISTRATION</p>
        <h1 id="admin-login-title">管理後台登入</h1>
        <p className={styles.intro}>使用獲授權的管理員信箱與密碼登入。</p>
        <AdminLoginForm />
        <a className={styles.backLink} href="/">
          ← 返回公開網站
        </a>
      </section>
    </main>
  );
}
