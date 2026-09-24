import { describe, expect, it } from 'vitest';
import { createAdminLineContactQrHandler } from '../app/api/admin/line-contacts/qr-code/route';
import { createLineContact, findLineContact } from '../lib/line-contacts';
import { sqliteD1 } from './helpers/sqlite-d1';

const admin = async () => ({
  id: 'admin-1',
  email: 'hungyu@gmail.com',
  role: 'admin' as const,
});

class TestBucket {
  readonly objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >();

  async put(key: string, value: Uint8Array, options?: R2PutOptions) {
    const metadata = options?.httpMetadata;
    this.objects.set(key, {
      bytes: value,
      contentType:
        metadata && 'contentType' in metadata
          ? metadata.contentType ?? 'application/octet-stream'
          : 'application/octet-stream',
    });
    return { etag: 'test-etag' } as R2Object;
  }

  async get(key: string) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      body: new Blob([Uint8Array.from(stored.bytes).buffer]).stream(),
      httpMetadata: { contentType: stored.contentType },
    } as unknown as R2ObjectBody;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

async function setup() {
  const { d1, sqlite } = sqliteD1();
  sqlite
    .prepare(
      'INSERT INTO admin_users (id, email, role, enabled) VALUES (?, ?, ?, 1)',
    )
    .run('admin-1', 'hungyu@gmail.com', 'admin');
  const contact = await createLineContact(
    d1,
    {
      labelZh: '業務聯絡',
      labelEn: 'Sales contact',
      lineUrl: 'https://lin.ee/example',
      enabled: true,
      displayOrder: 0,
    },
    await admin(),
  );
  const bucket = new TestBucket();
  const handler = createAdminLineContactQrHandler(
    { DB: d1, DOCUMENTS: bucket as unknown as R2Bucket },
    admin,
  );
  return { d1, contact, bucket, handler };
}

function pngFile(bytes: number[]) {
  return new Blob([new Uint8Array(bytes)], { type: 'image/png' });
}

function uploadRequest(contactId: string, image: Blob) {
  const body = new FormData();
  body.set('contactId', contactId);
  body.set('image', image, 'line-qr.png');
  return new Request('https://unirise.example/api/admin/line-contacts/qr-code', {
    method: 'POST',
    headers: { Origin: 'https://unirise.example' },
    body,
  });
}

describe('LINE QR Code 圖片上傳', () => {
  it('管理員可上傳已驗證的 PNG 並儲存在 R2', async () => {
    const { d1, contact, bucket, handler } = await setup();
    const response = await handler(
      uploadRequest(contact.id, pngFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    );
    expect(response.status).toBe(201);
    expect(bucket.objects.size).toBe(1);
    const stored = await findLineContact(d1, contact.id);
    expect(stored?.qrImageKey).toMatch(/^line-contacts\//);

    const image = await handler(
      new Request(
        `https://unirise.example/api/admin/line-contacts/qr-code?id=${contact.id}`,
      ),
    );
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toBe('image/png');
  });

  it('拒絕偽裝為圖片的檔案', async () => {
    const { contact, bucket, handler } = await setup();
    const response = await handler(
      uploadRequest(contact.id, pngFile([0x3c, 0x68, 0x74, 0x6d, 0x6c])),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'qr_image_signature_invalid' });
    expect(bucket.objects.size).toBe(0);
  });
});
