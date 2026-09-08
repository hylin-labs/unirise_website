import { env } from 'cloudflare:workers';
import {
  findPublishedNewsByLegacyId,
  listPublishedNews,
} from '../../lib/content-repository';
import { OriginalFooter, OriginalHeader } from '../original-shell';

/* oxlint-disable next/no-img-element, next/no-html-link-for-pages -- Preserve the legacy public markup and links. */

type NewsPageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function NewsPage({ searchParams }: NewsPageProps) {
  const { id } = await searchParams;
  const db = (env as unknown as { DB: D1Database }).DB;
  const post = id ? await findPublishedNewsByLegacyId(db, id) : null;
  const posts = post ? [] : await listPublishedNews(db);

  return (
    <main id="top" className="original-home original-inner-page">
      <OriginalHeader />
      <section className="original-sub-banner">
        <img src="/reference/original/subbanner.png" alt="" />
      </section>
      <section className="original-inner-content news-page">
        <nav className="original-breadcrumb">
          <a href="/">HOME</a>
          <span>/</span>
          <strong>最新消息</strong>
        </nav>
        <div className="original-inner-title">
          <span>News</span>
          <small>{post?.title || '最新消息'}</small>
        </div>
        {post ? (
          <article className="article article-detail">
            <img src={post.imageUrl} alt={post.title} decoding="async" />
            <time>NEWS · {post.legacyId}</time>
            <h2>{post.title}</h2>
            <p className="article-lead">{post.lead}</p>
            <ul>
              {post.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
            {post.videoUrl && (
              <div className="video-wrap">
                <iframe
                  src={post.videoUrl}
                  title={`${post.title} 影片`}
                  allowFullScreen
                />
              </div>
            )}
            <div className="article-actions">
              <a href="/news">← 回到最新消息</a>
              <a
                className="original-inquiry-button"
                href={`/inquiry?product=${encodeURIComponent(post.title)}`}
              >
                洽詢更多資訊
              </a>
            </div>
          </article>
        ) : (
          <div className="news-card-grid">
            {posts.map((item) => (
              <article className="article news-card" key={item.id}>
                <a href={`/news?id=${encodeURIComponent(item.legacyId)}`}>
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                  />
                </a>
                <time>NEWS</time>
                <h2>{item.title}</h2>
                <p>{item.lead}</p>
                <a href={`/news?id=${encodeURIComponent(item.legacyId)}`}>
                  了解更多 →
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
      <OriginalFooter />
    </main>
  );
}
