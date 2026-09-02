'use client';

import { useSearchParams } from 'next/navigation';
import { newsPosts } from '../news-data';
import { OriginalFooter, OriginalHeader } from '../original-shell';

export default function NewsPage() {
  const id = useSearchParams().get('id');
  const post = newsPosts.find((item) => item.id === id);
  return <main id="top" className="original-home original-inner-page"><OriginalHeader/><section className="original-sub-banner"><img src="/reference/original/subbanner.png" alt=""/></section><section className="original-inner-content news-page"><nav className="original-breadcrumb"><a href="/">HOME</a><span>/</span><strong>最新消息</strong></nav><div className="original-inner-title"><span>News</span><small>{post?.title || '最新消息'}</small></div>{post ? <article className="article article-detail"><img src={post.image} alt={post.title} decoding="async" /><time>NEWS · {post.id}</time><h2>{post.title}</h2><p className="article-lead">{post.lead}</p><ul>{post.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>{post.video && <div className="video-wrap"><iframe src={post.video} title={`${post.title} 影片`} allowFullScreen /></div>}<div className="article-actions"><a href="/news">← 回到最新消息</a><a className="original-inquiry-button" href={`/inquiry?product=${encodeURIComponent(post.title)}`}>洽詢更多資訊</a></div></article> : <div className="news-card-grid">{newsPosts.map((item) => <article className="article news-card" key={item.id}><a href={`/news?id=${item.id}`}><img src={item.image} alt={item.title} loading="lazy" decoding="async" /></a><time>NEWS</time><h2>{item.title}</h2><p>{item.lead}</p><a href={`/news?id=${item.id}`}>了解更多 →</a></article>)}</div>}</section><OriginalFooter/></main>;
}
