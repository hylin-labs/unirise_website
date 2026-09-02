'use client';

import { useSearchParams } from 'next/navigation';
import { newsPosts } from '../news-data';

export default function NewsPage() {
  const id = useSearchParams().get('id');
  const post = newsPosts.find((item) => item.id === id);
  return <main className="detail-page"><header className="detail-nav"><a href="/">← 回到首頁</a><img src="/reference/logo.png" alt="UniRise 合軒科技有限公司" /><a href="/contact">聯絡我們</a></header><section className="detail-hero"><div><p>NEWS</p><h1>{post?.title || '最新消息'}</h1><span>合軒科技有限公司</span></div></section><section className="detail-shell news-page">{post ? <article className="article article-detail"><img src={post.image} alt={post.title} /><time>NEWS · {post.id}</time><h2>{post.title}</h2><p className="article-lead">{post.lead}</p><ul>{post.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>{post.video && <div className="video-wrap"><iframe src={post.video} title={`${post.title} 影片`} allowFullScreen /></div>}<div className="article-actions"><a href="/news">← 回到最新消息</a><a className="detail-cta" href={`/inquiry?product=${encodeURIComponent(post.title)}`}>洽詢更多資訊 →</a></div></article> : <div className="news-card-grid">{newsPosts.map((item) => <article className="article news-card" key={item.id}><a href={`/news?id=${item.id}`}><img src={item.image} alt={item.title} /></a><time>NEWS</time><h2>{item.title}</h2><p>{item.lead}</p><a href={`/news?id=${item.id}`}>了解更多 →</a></article>)}</div>}</section></main>;
}
