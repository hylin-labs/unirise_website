import { describe, expect, it } from 'vitest';
import { isChatRequestAllowed } from '../lib/chat-rate-limit';
import { scheduleAnalyticsRetention } from '../lib/analytics-retention';
import { hashVisitorIdentifier } from '../lib/analytics';

type RateLimitRow = {
  bucket: string;
  visitor_hash: string;
  request_count: number;
};

type ChatQuestionRow = { id: string; created_at: string };

class RateLimitStatement {
  private values: unknown[] = [];

  constructor(
    private readonly sql: string,
    private readonly database: RateLimitDatabase,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    const query = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (query.startsWith('delete from site_chat_rate_limits')) {
      this.database.deleteTargets.push('site_chat_rate_limits');
      const [chatCutoff, leadCutoff, analyticsCutoff] = this.values.map(String);
      this.database.rows = this.database.rows.filter((row) => {
        if (
          !row.bucket.startsWith('lead:') &&
          !row.bucket.startsWith('analytics:')
        ) {
          return row.bucket >= chatCutoff;
        }
        if (row.bucket.startsWith('lead:')) return row.bucket >= leadCutoff;
        if (row.bucket.startsWith('analytics:')) {
          return row.bucket >= analyticsCutoff;
        }
        return true;
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (query.startsWith('delete from chat_question_log')) {
      this.database.deleteTargets.push('chat_question_log');
      const cutoff = String(this.values[0]);
      this.database.questions = this.database.questions.filter(
        (row) => row.created_at >= cutoff,
      );
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`Unsupported run: ${this.sql}`);
  }

  async first<T>() {
    const query = this.sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!query.startsWith('insert into site_chat_rate_limits')) {
      throw new Error(`Unsupported first: ${this.sql}`);
    }
    const [bucket, visitorHash] = this.values.map(String);
    const existing = this.database.rows.find(
      (row) => row.bucket === bucket && row.visitor_hash === visitorHash,
    );
    if (existing) existing.request_count += 1;
    else {
      this.database.rows.push({
        bucket,
        visitor_hash: visitorHash,
        request_count: 1,
      });
    }
    return {
      request_count: existing?.request_count ?? 1,
    } as T;
  }
}

class RateLimitDatabase {
  rows: RateLimitRow[] = [];
  questions: ChatQuestionRow[] = [];
  deleteTargets: string[] = [];

  readonly d1 = {
    prepare: (sql: string) =>
      new RateLimitStatement(sql, this) as unknown as D1PreparedStatement,
  } as unknown as D1Database;
}

const PEPPER_A = 'analytics-test-pepper-a-at-least-32-characters';
const PEPPER_B = 'analytics-test-pepper-b-at-least-32-characters';
const NOW = new Date('2026-09-08T20:30:00.000Z');

describe('chat throttle privacy and retention', () => {
  it('keys the chat throttle identity with the server secret', async () => {
    const first = new RateLimitDatabase();
    const second = new RateLimitDatabase();

    await isChatRequestAllowed(first.d1, '203.0.113.44', PEPPER_A, NOW);
    await isChatRequestAllowed(second.d1, '203.0.113.44', PEPPER_B, NOW);

    expect(first.rows[0].visitor_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.rows[0].visitor_hash).not.toBe('203.0.113.44');
    expect(first.rows[0].visitor_hash).not.toBe(second.rows[0].visitor_hash);
    expect(first.rows[0].visitor_hash).not.toBe(
      await hashVisitorIdentifier(
        '203.0.113.44',
        PEPPER_A,
        'analytics-throttle',
      ),
    );
  });

  it('removes expired chat, lead, and analytics throttle rows on the scheduled cleanup', async () => {
    const database = new RateLimitDatabase();
    database.rows = [
      {
        bucket: '2026-09-08T18:29',
        visitor_hash: 'old-chat',
        request_count: 1,
      },
      {
        bucket: '2026-09-08T20:29',
        visitor_hash: 'new-chat',
        request_count: 1,
      },
      {
        bucket: 'lead:2026-09-08T18:29',
        visitor_hash: 'old-lead',
        request_count: 1,
      },
      {
        bucket: 'lead:2026-09-08T20:29',
        visitor_hash: 'new-lead',
        request_count: 1,
      },
      {
        bucket: 'analytics:2026-09-08T18:29',
        visitor_hash: 'old-analytics',
        request_count: 1,
      },
      {
        bucket: 'analytics:2026-09-08T20:29',
        visitor_hash: 'new-analytics',
        request_count: 1,
      },
    ];

    let scheduled: Promise<unknown> | undefined;
    scheduleAnalyticsRetention(
      database.d1,
      {
        waitUntil(promise) {
          scheduled = promise;
        },
      },
      NOW,
    );
    await scheduled;

    expect(database.rows.map((row) => row.visitor_hash)).toEqual([
      'new-chat',
      'new-lead',
      'new-analytics',
    ]);
  });

  it('prunes only chat questions older than 90 days during the hourly cleanup', async () => {
    const database = new RateLimitDatabase();
    database.questions = [
      { id: 'expired', created_at: '2026-06-10T20:29:59.999Z' },
      { id: 'cutoff', created_at: '2026-06-10T20:30:00.000Z' },
      { id: 'recent', created_at: '2026-06-10T20:30:00.001Z' },
    ];

    let scheduled: Promise<unknown> | undefined;
    scheduleAnalyticsRetention(
      database.d1,
      {
        waitUntil(promise) {
          scheduled = promise;
        },
      },
      NOW,
    );
    await scheduled;

    expect(database.questions.map((row) => row.id)).toEqual([
      'cutoff',
      'recent',
    ]);
    expect(database.deleteTargets).toEqual([
      'site_chat_rate_limits',
      'chat_question_log',
    ]);
  });
});
