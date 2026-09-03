import { uniriseSchema } from '../db/schema';

const ADMIN_SESSION_COOKIE = 'unirise_admin_session';
const APPLICATION_HASH_SALT = 'unirise-admin-auth-v1';
const CODE_LIFETIME_MS = 10 * 60 * 1000;
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

export type AdminIdentity = {
  id: string;
  email: string;
  role: 'admin' | 'editor';
};

export type LoginCodeMailer = (message: {
  to: string;
  code: string;
}) => Promise<void>;

type LoginCodeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts_remaining: number;
  used_at: string | null;
  admin_id: string;
  email: string;
  role: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function hash(value: string) {
  return bytesToHex(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
}

async function hashIdentifier(kind: 'email' | 'visitor', value: string) {
  return hash(`${APPLICATION_HASH_SALT}:${kind}:${value}`);
}

async function hashCode(id: string, code: string) {
  return hash(`${APPLICATION_HASH_SALT}:code:${id}:${code}`);
}

async function hashSessionToken(token: string) {
  return hash(`${APPLICATION_HASH_SALT}:session:${token}`);
}

function randomDigits() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1_000_000).padStart(6, '0');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function safeRole(role: string): AdminIdentity['role'] | null {
  return role === 'admin' || role === 'editor' ? role : null;
}

function equalHashes(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readCookie(request: Request, name: string) {
  const value = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function requestCount(db: D1Database, idPattern: string, cutoff: string) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM ${uniriseSchema.adminLoginCodes} WHERE id LIKE ? AND created_at >= ?`,
    )
    .bind(idPattern, cutoff)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function requestAdminCode(
  db: D1Database,
  email: string,
  visitorIdentifier: string,
  mailer: LoginCodeMailer,
): Promise<{ accepted: true }> {
  const normalizedEmail = normalizeEmail(email);
  const user = await db
    .prepare(
      `SELECT id, email, role FROM ${uniriseSchema.adminUsers} WHERE email = ? AND enabled = 1 LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<{ id: string; email: string; role: string }>();

  if (!user || !safeRole(user.role)) return { accepted: true };

  const now = new Date();
  const emailHash = await hashIdentifier('email', normalizedEmail);
  const visitorHash = await hashIdentifier('visitor', visitorIdentifier);
  const cutoff = new Date(now.getTime() - REQUEST_WINDOW_MS).toISOString();
  const [emailRequests, visitorRequests] = await Promise.all([
    requestCount(db, `${emailHash}:%`, cutoff),
    requestCount(db, `%:${visitorHash}:%`, cutoff),
  ]);
  if (
    emailRequests >= MAX_REQUESTS_PER_WINDOW ||
    visitorRequests >= MAX_REQUESTS_PER_WINDOW
  ) {
    return { accepted: true };
  }

  const id = `${emailHash}:${visitorHash}:${crypto.randomUUID()}`;
  const code = randomDigits();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CODE_LIFETIME_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO ${uniriseSchema.adminLoginCodes} (id, admin_user_id, code_hash, expires_at, attempts_remaining, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, await hashCode(id, code), expiresAt, 5, null, createdAt)
    .run();

  try {
    await mailer({ to: normalizedEmail, code });
  } catch (error) {
    await db
      .prepare(`DELETE FROM ${uniriseSchema.adminLoginCodes} WHERE id = ?`)
      .bind(id)
      .run();
    console.error('Admin login code delivery failed', error);
  }

  return { accepted: true };
}

export async function verifyAdminCode(
  db: D1Database,
  email: string,
  code: string,
  now = new Date(),
): Promise<
  (AdminIdentity & { sessionToken: string; expiresAt: string }) | null
> {
  const normalizedEmail = normalizeEmail(email);
  if (!/^\d{6}$/.test(code)) return null;

  const row = await db
    .prepare(
      `SELECT c.id, c.code_hash, c.expires_at, c.attempts_remaining, c.used_at, u.id AS admin_id, u.email, u.role
     FROM ${uniriseSchema.adminLoginCodes} c
     JOIN ${uniriseSchema.adminUsers} u ON u.id = c.admin_user_id
     WHERE u.email = ? AND u.enabled = 1 AND c.used_at IS NULL
     ORDER BY c.created_at DESC LIMIT 1`,
    )
    .bind(normalizedEmail)
    .first<LoginCodeRow>();

  const role = row && safeRole(row.role);
  if (
    !row ||
    !role ||
    row.attempts_remaining <= 0 ||
    row.expires_at <= now.toISOString()
  )
    return null;

  const candidateHash = await hashCode(row.id, code);
  if (!equalHashes(candidateHash, row.code_hash)) {
    await db
      .prepare(
        `UPDATE ${uniriseSchema.adminLoginCodes} SET attempts_remaining = attempts_remaining - 1 WHERE id = ? AND attempts_remaining > 0 AND used_at IS NULL`,
      )
      .bind(row.id)
      .run();
    return null;
  }

  const consumed = await db
    .prepare(
      `UPDATE ${uniriseSchema.adminLoginCodes} SET used_at = ? WHERE id = ? AND attempts_remaining > 0 AND used_at IS NULL`,
    )
    .bind(now.toISOString(), row.id)
    .run();
  if (consumed.meta.changes !== 1) return null;

  const sessionToken = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO ${uniriseSchema.adminSessions} (id, admin_user_id, token_hash, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      row.admin_id,
      await hashSessionToken(sessionToken),
      expiresAt,
      null,
      now.toISOString(),
    )
    .run();

  return { id: row.admin_id, email: row.email, role, sessionToken, expiresAt };
}

export function createAdminSessionCookie(sessionToken: string) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; Path=/admin; Max-Age=${SESSION_LIFETIME_MS / 1000}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function requireAdmin(
  request: Request,
  db: D1Database,
): Promise<AdminIdentity | null> {
  const sessionToken = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!sessionToken) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.role
     FROM ${uniriseSchema.adminSessions} s
     JOIN ${uniriseSchema.adminUsers} u ON u.id = s.admin_user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL AND u.enabled = 1
     LIMIT 1`,
    )
    .bind(await hashSessionToken(sessionToken), new Date().toISOString())
    .first<{ id: string; email: string; role: string }>();
  const role = row && safeRole(row.role);
  return row && role ? { id: row.id, email: row.email, role } : null;
}

export async function destroyAdminSession(
  request: Request,
  db: D1Database,
): Promise<void> {
  const sessionToken = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!sessionToken) return;
  await db
    .prepare(
      `UPDATE ${uniriseSchema.adminSessions} SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(new Date().toISOString(), await hashSessionToken(sessionToken))
    .run();
}
