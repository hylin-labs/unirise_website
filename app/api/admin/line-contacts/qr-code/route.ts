import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../../../../lib/admin-auth';
import {
  findLineContact,
  LineContactValidationError,
  replaceLineContactQrImage,
} from '../../../../../lib/line-contacts';

type Runtime = { DB: D1Database; DOCUMENTS?: R2Bucket };
type Authenticate = typeof requireAdmin;

const MAX_QR_IMAGE_BYTES = 1_000_000;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function json(error: string, status: number) {
  return Response.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function isUploadedImage(value: FormDataEntryValue | null): value is File {
  return (
    !!value &&
    typeof value === 'object' &&
    'size' in value &&
    typeof value.size === 'number' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function'
  );
}

function expectedSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/png')
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  if (contentType === 'image/jpeg')
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function extensionFor(contentType: string) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  return 'webp';
}

async function uploadPayload(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data'))
    throw new LineContactValidationError('invalid_upload');
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_QR_IMAGE_BYTES + 16_384)
  ) {
    throw new LineContactValidationError('qr_image_too_large');
  }
  const form = await request.formData();
  const entries = [...form.entries()];
  if (
    entries.some(([key]) => key !== 'contactId' && key !== 'image') ||
    form.getAll('contactId').length !== 1 ||
    form.getAll('image').length !== 1
  ) {
    throw new LineContactValidationError('invalid_upload');
  }
  const contactId = form.get('contactId');
  const image = form.get('image');
  if (!validId(contactId) || !isUploadedImage(image))
    throw new LineContactValidationError('invalid_upload');
  if (image.size <= 0) throw new LineContactValidationError('qr_image_required');
  if (image.size > MAX_QR_IMAGE_BYTES)
    throw new LineContactValidationError('qr_image_too_large');
  const imageType = image.type.toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(imageType))
    throw new LineContactValidationError('qr_image_type_invalid');
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.byteLength !== image.size || !expectedSignature(bytes, imageType))
    throw new LineContactValidationError('qr_image_signature_invalid');
  return { contactId, bytes, imageType };
}

export function createAdminLineContactQrHandler(
  runtime: Runtime,
  authenticate: Authenticate = requireAdmin,
) {
  return async function handleQrCode(request: Request) {
    const actor = await authenticate(request, runtime.DB);
    if (!actor) return json('unauthorized', 401);
    if (actor.role !== 'admin') return json('forbidden', 403);
    if (!hasTrustedOrigin(request)) return json('origin_not_allowed', 403);
    if (!runtime.DOCUMENTS) return json('document_storage_unavailable', 503);

    try {
      if (request.method === 'GET') {
        const id = new URL(request.url).searchParams.get('id') ?? '';
        if (!validId(id)) return json('invalid_request', 400);
        const contact = await findLineContact(runtime.DB, id);
        if (!contact) return json('not_found', 404);
        if (!contact.qrImageKey) return json('qr_image_not_found', 404);
        const stored = await runtime.DOCUMENTS.get(contact.qrImageKey);
        if (!stored) return json('qr_image_not_found', 404);
        return new Response(stored.body, {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': stored.httpMetadata?.contentType ?? 'image/png',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      if (request.method !== 'POST') return json('method_not_allowed', 405);
      const { contactId, bytes, imageType } = await uploadPayload(request);
      if (!(await findLineContact(runtime.DB, contactId)))
        return json('not_found', 404);
      const storageKey = `line-contacts/${contactId}/qr-${crypto.randomUUID()}.${extensionFor(imageType)}`;
      await runtime.DOCUMENTS.put(storageKey, bytes, {
        httpMetadata: { contentType: imageType },
      });
      let replacement: Awaited<ReturnType<typeof replaceLineContactQrImage>>;
      try {
        replacement = await replaceLineContactQrImage(
          runtime.DB,
          contactId,
          storageKey,
          actor,
        );
      } catch (error) {
        await runtime.DOCUMENTS.delete(storageKey);
        throw error;
      }
      if (!replacement) {
        await runtime.DOCUMENTS.delete(storageKey);
        return json('not_found', 404);
      }
      if (replacement.replacedQrImageKey)
        await runtime.DOCUMENTS
          .delete(replacement.replacedQrImageKey)
          .catch((error) => console.error('LINE QR image cleanup failed', error));
      return Response.json(
        { contact: replacement.contact },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      if (error instanceof LineContactValidationError) {
        const status = error.message === 'qr_image_too_large' ? 413 : 400;
        return json(error.message, status);
      }
      console.error('LINE QR image operation failed', error);
      return json('line_contact_qr_operation_unavailable', 503);
    }
  };
}

function handler(request: Request) {
  return createAdminLineContactQrHandler(env as unknown as Runtime)(request);
}

export const GET = handler;
export const POST = handler;
