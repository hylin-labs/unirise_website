export class RequestTooLargeError extends Error {
  constructor() {
    super('request_too_large');
  }
}

export async function readLimitedRequestBody(
  request: Request,
  maxBytes: number,
) {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)
  ) {
    throw new RequestTooLargeError();
  }
  if (!request.body) throw new Error('invalid_request');

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }
  return `${body}${decoder.decode()}`;
}
