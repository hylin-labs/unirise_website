import { env } from 'cloudflare:workers';
import { listPublishedDownloads } from '../../lib/content-repository';
import { OriginalFooter, OriginalHeader } from '../original-shell';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- Preserve the legacy public markup and links. */

type DownloadsPageProps = {
  searchParams: Promise<{ collection?: string; id?: string }>;
};

export default async function DownloadsPage({
  searchParams,
}: DownloadsPageProps) {
  const params = await searchParams;
  const db = (env as unknown as { DB: D1Database }).DB;
  const downloads = await listPublishedDownloads(db);
  const selected = params.id
    ? downloads.find((item) => item.legacyId === params.id)
    : downloads.find((item) => item.title === params.collection);
  const collection = selected?.title;

  return (
    <main id="top" className="original-home original-inner-page">
      <OriginalHeader />
      <section className="original-sub-banner">
        <img src="/reference/original/subbanner.png" alt="" />
      </section>
      <section className="original-inner-content">
        <nav className="original-breadcrumb">
          <a href="/">HOME</a>
          <span>/</span>
          <strong>下載專區</strong>
        </nav>
        <div className="original-inner-title">
          <span>Download</span>
          <small>{collection || '下載專區'}</small>
        </div>
        <div className="original-content-panel download-panel">
          <h2>{collection ? `${collection} 資料索取` : '選擇產品資料'}</h2>
          <p>
            原網站設有下列產品資料分類。為確保資料為最新版本，請透過詢價系統索取。
          </p>
          {collection ? (
            <a
              className="original-inquiry-button"
              href={`/inquiry?product=${encodeURIComponent(collection)}`}
            >
              索取產品資料
            </a>
          ) : (
            <div className="download-list">
              {downloads.map((item) => (
                <a href={`/downloads?id=${item.legacyId}`} key={item.id}>
                  {item.title}
                  <span>→</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>
      <OriginalFooter />
    </main>
  );
}
