'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AdminLoginForm } from '../../../components/admin-login-form';
import styles from '../../../components/admin-dashboard.module.css';

export default function AdminLoginPage() {
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
        <p className={styles.intro}>使用獲授權的管理員信箱與密碼登入。</p>
        <AdminLoginForm />
        <Link className={styles.backLink} href="/">
          ← 返回公開網站
        </Link>
      </section>
    </main>
  );
}
