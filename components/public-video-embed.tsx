'use client';

import { Play } from 'lucide-react';
import { useState } from 'react';
import { youtubeEmbedUrl, youtubeWatchUrl } from '../lib/youtube';

/* oxlint-disable next/no-img-element -- The poster may be an administrator-managed public image URL. */

export function PublicVideoEmbed({
  label,
  openLabel,
  playLabel,
  poster,
  src,
  title,
}: {
  label: string;
  openLabel: string;
  playLabel: string;
  poster: string;
  src: string;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embedUrl = youtubeEmbedUrl(src);
  const publicUrl = youtubeWatchUrl(src);
  return (
    <section
      className="video-section"
      aria-label={label}
      data-video-src={embedUrl}
    >
      <div className="video-wrap">
        {playing ? (
          <iframe
            src={`${embedUrl}${embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            className="video-poster"
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={playLabel}
          >
            <img src={poster} alt="" />
            <span>
              <Play aria-hidden="true" />
              {playLabel}
            </span>
          </button>
        )}
      </div>
      <a href={publicUrl} target="_blank" rel="noreferrer">
        {openLabel}
      </a>
    </section>
  );
}
