/** Public route families shared by routing, sitemap, and offline release checks. */
export const PUBLIC_PATHS = /** @type {const} */ ([
  '/',
  '/catalog',
  '/news',
  '/downloads',
  '/contact',
  '/inquiry',
]);

/** @param {{newsIds?: readonly string[], downloadIds?: readonly string[]}} input */
export function bilingualRouteInventory({
  newsIds = [],
  downloadIds = [],
} = {}) {
  const chinese = [...PUBLIC_PATHS];
  const details = [
    ...newsIds
      .filter((id) => /^\d{1,160}$/.test(id))
      .sort()
      .map((id) => `/news?id=${id}`),
    ...downloadIds
      .filter((id) => /^\d{1,160}$/.test(id))
      .sort()
      .map((id) => `/downloads?id=${id}`),
  ];
  const paths = [...new Set([...chinese, ...details])];
  return [
    ...paths,
    ...paths.map((path) => (path === '/' ? '/en' : `/en${path}`)),
  ];
}
