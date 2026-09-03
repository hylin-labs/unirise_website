import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  destroyAdminSession,
  requestAdminCode as requestAdminCodeWithPepper,
  requireAdmin,
  verifyAdminCode as verifyAdminCodeWithPepper,
} from '../lib/admin-auth';
import { sendLoginCode } from '../lib/resend';
import { createRequestCodeHandler } from '../app/api/admin/auth/request-code/route';
import { createLogoutHandler } from '../app/api/admin/auth/logout/route';

vi.mock('cloudflare:workers', () => ({ env: {} }));

const TEST_PEPPER = 'unit-test-only-pepper';

const requestAdminCode = (
  db: D1Database,
  email: string,
  visitorIdentifier: string,
  mailer: Parameters<typeof requestAdminCodeWithPepper>[3],
) =>
  requestAdminCodeWithPepper(db, email, visitorIdentifier, mailer, TEST_PEPPER);

const verifyAdminCode = (
  db: D1Database,
  email: string,
  code: string,
  now = new Date(),
) => verifyAdminCodeWithPepper(db, email, code, now, TEST_PEPPER);

type Row = Record<string, unknown>;

const d1Result = (changes = 0, results: Row[] = []) => ({
  success: true as const,
  results,
  meta: {
    duration: 0,
    size_after: 0,
    rows_read: results.length,
    rows_written: changes,
    last_row_id: 0,
    changed_db: changes > 0,
    changes,
  },
});

class AuthPreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly db: AuthDatabase,
  ) {}

  bind(...values: unknown[]): this {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return (this.db.read(this.sql, this.values)[0] as T | undefined) ?? null;
  }

  async all<T>() {
    const rows = this.db.read(this.sql, this.values) as T[];
    return d1Result(0, rows as Row[]);
  }

  async run() {
    return d1Result(this.db.write(this.sql, this.values));
  }
}

class AuthDatabase {
  readonly users: Row[] = [
    { id: 'admin-1', email: 'hungyu@gmail.com', role: 'admin', enabled: 1 },
  ];
  readonly codes: Row[] = [];
  readonly sessions: Row[] = [];

  readonly d1 = {
    prepare: (sql: string) =>
      new AuthPreparedStatement(sql, this) as unknown as D1PreparedStatement,
  } as unknown as D1Database;

  read(sql: string, values: unknown[]): Row[] {
    const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (query.includes('from admin_users') && !query.includes('join')) {
      return this.users.filter(
        (row) => row.email === values[0] && row.enabled === 1,
      );
    }
    if (query.startsWith('select count(*) as count from admin_login_codes')) {
      const like = String(values[0]);
      const cutoff = String(values[1]);
      const pattern = new RegExp(
        `^${like.split('%').map(escapeRegExp).join('.*')}$`,
      );
      return [
        {
          count: this.codes.filter(
            (row) =>
              pattern.test(String(row.id)) && String(row.created_at) >= cutoff,
          ).length,
        },
      ];
    }
    if (query.includes('from admin_login_codes c join admin_users u')) {
      const user = this.users.find(
        (row) => row.email === values[0] && row.enabled === 1,
      );
      if (!user) return [];
      return this.codes
        .filter((row) => row.admin_user_id === user.id && row.used_at == null)
        .sort((left, right) =>
          String(right.created_at).localeCompare(String(left.created_at)),
        )
        .slice(0, 1)
        .map((row) => ({
          ...row,
          admin_id: user.id,
          email: user.email,
          role: user.role,
        }));
    }
    if (query.includes('from admin_sessions s join admin_users u')) {
      const session = this.sessions.find(
        (row) =>
          row.token_hash === values[0] &&
          row.revoked_at == null &&
          String(row.expires_at) > String(values[1]),
      );
      const user =
        session &&
        this.users.find(
          (row) => row.id === session.admin_user_id && row.enabled === 1,
        );
      return user ? [{ id: user.id, email: user.email, role: user.role }] : [];
    }
    throw new Error(`AuthDatabase does not support read SQL: ${sql}`);
  }

  write(sql: string, values: unknown[]): number {
    const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (query.startsWith('insert into admin_login_codes')) {
      if (query.includes(' select ')) {
        const emailPattern = likePattern(String(values[7]));
        const emailCutoff = String(values[8]);
        const emailLimit = Number(values[9]);
        const visitorPattern = likePattern(String(values[10]));
        const visitorCutoff = String(values[11]);
        const visitorLimit = Number(values[12]);
        const emailCount = this.codes.filter(
          (row) =>
            emailPattern.test(String(row.id)) &&
            String(row.created_at) >= emailCutoff,
        ).length;
        const visitorCount = this.codes.filter(
          (row) =>
            visitorPattern.test(String(row.id)) &&
            String(row.created_at) >= visitorCutoff,
        ).length;
        if (emailCount >= emailLimit || visitorCount >= visitorLimit) return 0;
      }
      this.codes.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('insert into admin_sessions')) {
      this.sessions.push(rowFromInsert(sql, values));
      return 1;
    }
    if (query.startsWith('update admin_login_codes set attempts_remaining')) {
      const row = this.codes.find(
        (item) =>
          item.id === values[0] &&
          item.used_at == null &&
          Number(item.attempts_remaining) > 0 &&
          (!query.includes('expires_at > ?') ||
            String(item.expires_at) > String(values[1])),
      );
      if (!row) return 0;
      row.attempts_remaining = Number(row.attempts_remaining) - 1;
      return 1;
    }
    if (query.startsWith('update admin_login_codes set used_at')) {
      const row = this.codes.find(
        (item) =>
          item.id === values[1] &&
          item.used_at == null &&
          (!query.includes('expires_at > ?') ||
            String(item.expires_at) > String(values[2])),
      );
      if (!row) return 0;
      row.used_at = values[0];
      return 1;
    }
    if (query.startsWith('update admin_sessions set revoked_at')) {
      const row = this.sessions.find(
        (item) => item.token_hash === values[1] && item.revoked_at == null,
      );
      if (!row) return 0;
      row.revoked_at = values[0];
      return 1;
    }
    if (query.startsWith('delete from admin_login_codes')) {
      const index = this.codes.findIndex((item) => item.id === values[0]);
      if (index < 0) return 0;
      this.codes.splice(index, 1);
      return 1;
    }
    throw new Error(`AuthDatabase does not support write SQL: ${sql}`);
  }
}

function rowFromInsert(sql: string, values: unknown[]): Row {
  const match = sql.match(/\(([^)]+)\)\s*(?:values|select)/i);
  if (!match) throw new Error(`Cannot parse INSERT: ${sql}`);
  const columns = match[1].split(',').map((column) => column.trim());
  return Object.fromEntries(
    columns.map((column, index) => [column, values[index]]),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function likePattern(value: string) {
  return new RegExp(`^${value.split('%').map(escapeRegExp).join('.*')}$`);
}

describe('passwordless admin authentication', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns neutral acceptance without delivering or storing a code for an outside address', async () => {
    const database = new AuthDatabase();
    const deliveries: Array<{ to: string; code: string }> = [];

    const result = await requestAdminCode(
      database.d1,
      'outside@example.com',
      'visitor-a',
      async (message) => {
        deliveries.push(message);
      },
    );

    expect(result).toEqual({ accepted: true });
    expect(deliveries).toEqual([]);
    expect(database.codes).toEqual([]);
  });

  it('delivers a six-digit code while storing only its hash', async () => {
    const database = new AuthDatabase();
    const deliveries: Array<{ to: string; code: string }> = [];

    await requestAdminCode(
      database.d1,
      ' HUNGYU@GMAIL.COM ',
      'visitor-a',
      async (message) => {
        deliveries.push(message);
      },
    );

    expect(deliveries).toEqual([
      { to: 'hungyu@gmail.com', code: expect.stringMatching(/^\d{6}$/) },
    ]);
    expect(JSON.stringify(database.codes)).not.toContain(deliveries[0].code);
    expect(database.codes[0]).toMatchObject({
      admin_user_id: 'admin-1',
      attempts_remaining: 5,
      used_at: null,
    });
  });

  it('accepts a valid code once and never stores the raw session token', async () => {
    const database = new AuthDatabase();
    let code = '';
    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        code = message.code;
      },
    );

    const verified = await verifyAdminCode(
      database.d1,
      'hungyu@gmail.com',
      code,
      new Date(),
    );

    expect(verified).toMatchObject({
      id: 'admin-1',
      email: 'hungyu@gmail.com',
      role: 'admin',
    });
    expect(verified?.sessionToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(JSON.stringify(database.sessions)).not.toContain(
      verified?.sessionToken,
    );
    await expect(
      verifyAdminCode(database.d1, 'hungyu@gmail.com', code, new Date()),
    ).resolves.toBeNull();
  });

  it('requires the server-only pepper to verify a code', async () => {
    const database = new AuthDatabase();
    let code = '';
    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        code = message.code;
      },
    );

    await expect(
      verifyAdminCodeWithPepper(
        database.d1,
        'hungyu@gmail.com',
        code,
        new Date(),
        'wrong-pepper',
      ),
    ).resolves.toBeNull();
    await expect(
      verifyAdminCode(database.d1, 'hungyu@gmail.com', code),
    ).resolves.toMatchObject({ email: 'hungyu@gmail.com' });
  });

  it('rejects expired codes and stops accepting guesses after five attempts', async () => {
    const expiredDatabase = new AuthDatabase();
    let expiredCode = '';
    await requestAdminCode(
      expiredDatabase.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        expiredCode = message.code;
      },
    );
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await expect(
      verifyAdminCode(
        expiredDatabase.d1,
        'hungyu@gmail.com',
        expiredCode,
        new Date(),
      ),
    ).resolves.toBeNull();

    const guessedDatabase = new AuthDatabase();
    let validCode = '';
    await requestAdminCode(
      guessedDatabase.d1,
      'hungyu@gmail.com',
      'visitor-b',
      async (message) => {
        validCode = message.code;
      },
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        verifyAdminCode(
          guessedDatabase.d1,
          'hungyu@gmail.com',
          '000000',
          new Date(),
        ),
      ).resolves.toBeNull();
    }
    await expect(
      verifyAdminCode(
        guessedDatabase.d1,
        'hungyu@gmail.com',
        validCode,
        new Date(),
      ),
    ).resolves.toBeNull();
  });

  it('rate-limits repeated delivery by hashed email and visitor identifiers', async () => {
    const database = new AuthDatabase();
    const deliveries: Array<{ to: string; code: string }> = [];
    for (let request = 0; request < 10; request += 1) {
      await requestAdminCode(
        database.d1,
        'hungyu@gmail.com',
        'visitor-a',
        async (message) => {
          deliveries.push(message);
        },
      );
    }

    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.length).toBeLessThan(10);
    expect(JSON.stringify(database.codes)).not.toContain('visitor-a');
    expect(JSON.stringify(database.codes)).not.toContain('hungyu@gmail.com');
  });

  it('reserves concurrent email and visitor request capacity atomically', async () => {
    const database = new AuthDatabase();
    const deliveries: Array<{ to: string; code: string }> = [];

    await Promise.all(
      Array.from({ length: 10 }, () =>
        requestAdminCode(
          database.d1,
          'hungyu@gmail.com',
          'shared-visitor',
          async (message) => {
            deliveries.push(message);
          },
        ),
      ),
    );

    expect(deliveries).toHaveLength(3);
    expect(database.codes).toHaveLength(3);
  });

  it('retains throttle accounting when delivery fails', async () => {
    const database = new AuthDatabase();
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        requestAdminCode(
          database.d1,
          'hungyu@gmail.com',
          'shared-visitor',
          async () => {
            throw new Error('delivery unavailable');
          },
        ),
      ),
    );

    expect(database.codes).toHaveLength(3);
    expect(database.codes.every((row) => row.used_at != null)).toBe(true);
    log.mockRestore();
  });

  it('allows only one session when the same valid code is verified in parallel', async () => {
    const database = new AuthDatabase();
    let code = '';
    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        code = message.code;
      },
    );

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        verifyAdminCode(database.d1, 'hungyu@gmail.com', code),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(database.sessions).toHaveLength(1);
    expect(database.codes[0].attempts_remaining).toBe(0);
  });

  it('sets the session cookie with the required scope and security attributes', () => {
    expect(createAdminSessionCookie('opaque-token')).toBe(
      'unirise_admin_session=opaque-token; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax',
    );
    expect(clearAdminSessionCookie()).toBe(
      'unirise_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('authenticates an admin API request with the emitted root-scoped cookie', async () => {
    const database = new AuthDatabase();
    let code = '';
    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        code = message.code;
      },
    );
    const verified = await verifyAdminCode(
      database.d1,
      'hungyu@gmail.com',
      code,
    );
    const setCookie = createAdminSessionCookie(verified?.sessionToken ?? '');
    const cookie = setCookie.split(';', 1)[0];
    const apiRequest = new Request('https://unirise.tw/api/admin/news', {
      headers: { cookie },
    });

    expect(setCookie).toContain('Path=/;');
    await expect(requireAdmin(apiRequest, database.d1)).resolves.toEqual({
      id: 'admin-1',
      email: 'hungyu@gmail.com',
      role: 'admin',
    });
  });

  it('authenticates and destroys an active session from the cookie', async () => {
    const database = new AuthDatabase();
    let code = '';
    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        code = message.code;
      },
    );
    const verified = await verifyAdminCode(
      database.d1,
      'hungyu@gmail.com',
      code,
      new Date(),
    );
    const request = new Request('https://unirise.tw/admin', {
      headers: { cookie: `unirise_admin_session=${verified?.sessionToken}` },
    });

    await expect(requireAdmin(request, database.d1)).resolves.toEqual({
      id: 'admin-1',
      email: 'hungyu@gmail.com',
      role: 'admin',
    });
    await destroyAdminSession(request, database.d1);
    await expect(requireAdmin(request, database.d1)).resolves.toBeNull();
  });

  it('rejects an otherwise valid session after twelve hours', async () => {
    const database = new AuthDatabase();
    let code = '';
    await requestAdminCode(
      database.d1,
      'hungyu@gmail.com',
      'visitor-a',
      async (message) => {
        code = message.code;
      },
    );
    const verified = await verifyAdminCode(
      database.d1,
      'hungyu@gmail.com',
      code,
      new Date(),
    );
    const request = new Request('https://unirise.tw/admin', {
      headers: {
        cookie: `unirise_admin_session=${verified?.sessionToken}`,
      },
    });

    vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);

    await expect(requireAdmin(request, database.d1)).resolves.toBeNull();
  });
});

describe('admin authentication routes', () => {
  it('returns neutral acceptance without awaiting delivery work', async () => {
    const database = new AuthDatabase();
    const background: Promise<unknown>[] = [];
    let deliveryStarted = false;
    let releaseDelivery!: () => void;
    const deliveryGate = new Promise<void>((resolve) => {
      releaseDelivery = resolve;
    });
    const handler = createRequestCodeHandler({
      db: database.d1,
      codePepper: TEST_PEPPER,
      mailer: async () => {
        deliveryStarted = true;
        await deliveryGate;
      },
      waitUntil: (promise) => background.push(promise),
      onError: vi.fn(),
    });

    const response = await Promise.race([
      handler(
        new Request('https://unirise.tw/api/admin/auth/request-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://unirise.tw',
          },
          body: JSON.stringify({ email: 'hungyu@gmail.com' }),
        }),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('request awaited delivery')), 50),
      ),
    ]);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    await vi.waitFor(() => expect(deliveryStarted).toBe(true));
    expect(background).toHaveLength(1);
    releaseDelivery();
    await background[0];
  });

  it('clears the browser cookie even when session revocation fails', async () => {
    const failingDb = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error('D1 unavailable');
          },
        }),
      }),
    } as unknown as D1Database;
    const onError = vi.fn();
    const handler = createLogoutHandler(failingDb, onError);

    const response = await handler(
      new Request('https://unirise.tw/api/admin/auth/logout', {
        method: 'POST',
        headers: {
          cookie: 'unirise_admin_session=opaque-token',
          Origin: 'https://unirise.tw',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toBe(
      'unirise_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    );
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('Resend login-code delivery', () => {
  it('keeps the API key in the authorization header and escapes emailed HTML values', async () => {
    let request: RequestInit | undefined;
    const fetchStub = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        request = init;
        return new Response(null, { status: 202 });
      },
    );

    await sendLoginCode(
      { to: 'owner+<tag>@example.com', code: '12<34&' },
      {
        apiKey: 'resend-secret',
        fromEmail: 'admin@unirise.tw',
        fetch: fetchStub,
      },
    );

    expect(fetchStub).toHaveBeenCalledOnce();
    expect(new Headers(request?.headers).get('Authorization')).toBe(
      'Bearer resend-secret',
    );
    if (typeof request?.body !== 'string')
      throw new Error('Expected a JSON string request body');
    const body = JSON.parse(request.body) as { html: string };
    expect(body.html).toContain('owner+&lt;tag&gt;@example.com');
    expect(body.html).toContain('12&lt;34&amp;');
    expect(JSON.stringify(body)).not.toContain('resend-secret');
  });
});
