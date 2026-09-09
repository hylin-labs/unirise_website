import { describe, expect, it } from 'vitest';
import { publicAnalyticsPath } from '../lib/public-analytics-path';

describe('public analytics browser path', () => {
  it.each([
    ['/inquiry', '?product=buyer@example.com', '/inquiry'],
    ['/downloads', '?collection=Confidential%20Project', '/downloads'],
    [
      '/catalog',
      '?type=brand&id=127&item=private%20note',
      '/catalog?type=brand&id=127',
    ],
    ['/news', '?id=3944&email=buyer@example.com', '/news?id=3944'],
  ])('keeps only validated identifiers from %s%s', (pathname, search, want) => {
    expect(publicAnalyticsPath(pathname, search)).toBe(want);
  });
});
