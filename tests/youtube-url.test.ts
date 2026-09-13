import { describe, expect, it } from 'vitest';
import {
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeVideoId,
  youtubeWatchUrl,
} from '../lib/youtube';

describe('YouTube URL normalization', () => {
  const id = '3tIKwCNFBYU';

  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?feature=shared`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ])('recognizes %s', (url) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it('creates embeddable, public, and thumbnail URLs', () => {
    const source = `https://youtu.be/${id}`;
    expect(youtubeEmbedUrl(source)).toBe(
      `https://www.youtube.com/embed/${id}`,
    );
    expect(youtubeWatchUrl(source)).toBe(
      `https://www.youtube.com/watch?v=${id}`,
    );
    expect(youtubeThumbnailUrl(source)).toBe(
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    );
  });

  it('leaves non-YouTube video URLs unchanged', () => {
    const source = 'https://media.example.com/video.mp4';
    expect(youtubeVideoId(source)).toBeNull();
    expect(youtubeEmbedUrl(source)).toBe(source);
    expect(youtubeWatchUrl(source)).toBe(source);
    expect(youtubeThumbnailUrl(source)).toBeNull();
  });
});
