const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

function validVideoId(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return /^[A-Za-z0-9_-]{6,32}$/.test(normalized) ? normalized : null;
}

export function youtubeVideoId(source: string | null | undefined) {
  if (!source) return null;

  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      return validVideoId(url.pathname.split('/').filter(Boolean)[0]);
    }
    if (!youtubeHosts.has(host)) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'watch') return validVideoId(url.searchParams.get('v'));
    if (['embed', 'shorts', 'live'].includes(segments[0] ?? '')) {
      return validVideoId(segments[1]);
    }
    return validVideoId(url.searchParams.get('v'));
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(source: string) {
  const id = youtubeVideoId(source);
  return id ? `https://www.youtube.com/embed/${id}` : source;
}

export function youtubeWatchUrl(source: string) {
  const id = youtubeVideoId(source);
  return id ? `https://www.youtube.com/watch?v=${id}` : source;
}

export function youtubeThumbnailUrl(source: string | null | undefined) {
  const id = youtubeVideoId(source);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
