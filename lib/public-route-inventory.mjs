/** Public route families shared by routing, sitemap, and offline release checks. */
export const PUBLIC_PATHS = /** @type {const} */ ([
  '/',
  '/catalog',
  '/news',
  '/downloads',
  '/search',
  '/contact',
  '/inquiry',
  '/project',
]);

/** Stable home sections that must retain language switching and accessible navigation. */
export const PUBLIC_HOME_ANCHORS = /** @type {const} */ ([
  '#news',
  '#brands',
  '#contact',
]);

/**
 * Representative, non-indexable public UI states. IDs deliberately point to
 * seeded/public content and are coverage probes, not a complete product index.
 */
export const REPRESENTATIVE_PUBLIC_QUERY_PATHS = /** @type {const} */ ([
  '/catalog?type=industry&id=73',
  '/catalog?type=brand&id=127',
  '/inquiry?product=FSCAN-4350G%20%26%20XAVIS',
]);

/** @typedef {{newsIds?: readonly string[], downloadIds?: readonly string[]}} RouteInventoryInput */

function englishPath(path) {
  const [pathname, suffix = ''] = path.split(/(?=[?#])/u, 2);
  return pathname === '/' ? `/en${suffix}` : `/en${pathname}${suffix}`;
}

function withLocales(paths) {
  const unique = [...new Set(paths)];
  return [...unique, ...unique.map(englishPath)];
}

/** @param {RouteInventoryInput} input */
function publishedDetailPaths(input = {}) {
  const { newsIds = [], downloadIds = [] } = input;
  return [
    ...newsIds
      .filter((id) => /^\d{1,160}$/.test(id))
      .sort((left, right) => left.localeCompare(right))
      .map((id) => `/news?id=${id}`),
    ...downloadIds
      .filter((id) => /^\d{1,160}$/.test(id))
      .sort((left, right) => left.localeCompare(right))
      .map((id) => `/downloads?id=${id}`),
  ];
}

/** @param {RouteInventoryInput} input */
export function bilingualRouteInventory(input = {}) {
  const { newsIds = [], downloadIds = [] } = input;
  return withLocales([
    ...PUBLIC_PATHS,
    ...PUBLIC_HOME_ANCHORS.map((anchor) => `/${anchor}`),
    ...REPRESENTATIVE_PUBLIC_QUERY_PATHS,
    ...publishedDetailPaths({ newsIds, downloadIds }),
  ]);
}

/**
 * Indexable subset of the shared inventory. Anchors, catalog filters, and
 * inquiry product text are intentionally omitted from the sitemap.
 */
/** @param {RouteInventoryInput} input */
export function bilingualSitemapRouteInventory(input = {}) {
  const { newsIds = [], downloadIds = [] } = input;
  return withLocales([
    ...PUBLIC_PATHS,
    ...publishedDetailPaths({ newsIds, downloadIds }),
  ]);
}
