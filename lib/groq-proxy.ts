export type GroqProxyBinding = {
  fetch(request: Request): Promise<Response>;
};

export function requestGroqCompletion(
  endpoint: string,
  init: RequestInit,
  fetcher: typeof fetch,
  proxy?: GroqProxyBinding,
) {
  if (!proxy) return fetcher(endpoint, init);
  return proxy.fetch(new Request(endpoint, init));
}
