'use client';

import { Play } from 'lucide-react';
import { useState } from 'react';

/* oxlint-disable next/no-img-element -- The poster may be an administrator-managed public image URL. */

function publicVideoUrl(src: string) {
  const match = src.match(/youtube\.com\/embed\/([^?&/]+)/i);
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : src;
}

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
  return (
    <section className="video-section" aria-label={label}>
      <div className="video-wrap">
        {playing ? (
          <iframe
            src={`${src}${src.includes('?') ? '&' : '?'}autoplay=1`}
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
      <a href={publicVideoUrl(src)} target="_blank" rel="noreferrer">
        {openLabel}
      </a>
    </section>
  );
}
