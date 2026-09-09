const NUMERIC_ID = /^\d{1,12}$/;

export function publicAnalyticsPath(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  if (pathname === '/') return '/';
  if (pathname === '/news' || pathname === '/downloads') {
    const id = params.get('id');
    return id && NUMERIC_ID.test(id) ? `${pathname}?id=${id}` : pathname;
  }
  if (pathname === '/catalog') {
    const type = params.get('type');
    const id = params.get('id');
    return (type === 'brand' || type === 'industry') &&
      id &&
      NUMERIC_ID.test(id)
      ? `/catalog?type=${type}&id=${id}`
      : '/catalog';
  }
  if (pathname === '/inquiry' || pathname === '/contact') return pathname;
  return null;
}
