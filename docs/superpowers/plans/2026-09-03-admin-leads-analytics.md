# Unirise Phase 1 Administration, Leads, and Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a passwordless administrator area that manages Phase 1 content, captures chatbot leads, emails notifications through Resend, and reports private first-party analytics.

**Architecture:** Keep the existing Vinext/React site as the sole application. Use Cloudflare D1 for authentication, content, leads, audit records, and event data; expose small server-side route handlers; and use React client views for the admin and chat forms. Resend is called only from server routes, with secrets held in Sites runtime settings or local `.dev.vars`.

**Tech Stack:** React 19, Vinext, TypeScript, Cloudflare Workers/D1, Resend REST API, Vitest, existing Sites deployment.

**Spec:** `docs/superpowers/specs/2026-09-03-admin-leads-analytics-design.md`

## Global Constraints

- Preserve existing public routes, legacy `/news?id=<id>` links, visitor counting, chatbot rate limiting, and visual styling.
- Allow administrator access only to the explicit `hungyu@gmail.com` allowlist entry at launch.
- Store secrets only in `RESEND_API_KEY` and `RESEND_FROM_EMAIL` runtime environment variables or untracked `.dev.vars`.
- Store hashed one-time codes and session tokens, never raw values.
- Do not send lead details, admin records, sessions, or raw IP addresses to Groq or an analytics vendor.
- Enforce same-origin validation, field limits, and rate limits for all state-changing routes.
- Retain sanitized chatbot questions for at most 90 days; never display raw IP addresses or session tokens.

## File Structure

- `drizzle/0002_add_admin_content_leads_analytics.sql` — D1 schema, indexes, initial allowlist, and seed data.
- `db/schema.ts` — D1 table-name constants and shared record types.
- `lib/admin-auth.ts` — allowlist checks, code/session hashing, expiry, and authentication guards.
- `lib/content-repository.ts` — validated reads and writes for news, downloads, and knowledge records.
- `lib/analytics.ts` — privacy-preserving event recording and date-range metric queries.
- `lib/lead-service.ts` and `lib/resend.ts` — lead validation, persistence, and server-only email delivery.
- `app/api/admin/**`, `app/api/leads/route.ts`, and `app/api/analytics/route.ts` — authenticated and public API boundaries.
- `app/admin/**` and admin components — login, overview, content, lead, chat-gap, and administrator views.
- `components/support-chat.tsx` — quote/specialist action and compact lead form.
- `app/news/page.tsx`, `app/downloads/page.tsx`, `lib/site-knowledge.ts`, and `app/api/chat/route.ts` — published D1 content and question outcome recording.
- `tests/**/*.test.ts` — unit, route-boundary, and end-to-end-style tests using a D1 test double.

---

### Task 1: Establish a test harness and shared D1 test double

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/helpers/fake-d1.ts`
- Create: `tests/setup.test.ts`

**Interfaces:**
- Produces `createFakeD1(): D1Database` for repository and service tests.
- Produces `npm test` running `vitest run`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/setup.test.ts
import { describe, expect, it } from 'vitest';
import { createFakeD1 } from './helpers/fake-d1';

describe('test D1 harness', () => {
  it('binds values and returns a selected row', async () => {
    const db = createFakeD1();
    await db.prepare('INSERT INTO example (id, value) VALUES (?, ?)').bind('a', 'ok').run();
    await expect(db.prepare<{ value: string }>('SELECT value FROM example WHERE id = ?').bind('a').first())
      .resolves.toEqual({ value: 'ok' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/setup.test.ts`

Expected: FAIL because Vitest and `createFakeD1` do not exist.

- [ ] **Step 3: Implement the minimal test setup**

```ts
// package.json scripts and devDependencies
"test": "vitest run",
"test:watch": "vitest",
"vitest": "^3.2.4"
```

Implement `FakeD1` with `prepare`, `bind`, `run`, `first`, and `all`; keep its SQL support limited to the insert/select patterns used by this project. Add a `vitest.config.ts` with `environment: 'node'` and `include: ['tests/**/*.test.ts']`.

- [ ] **Step 4: Run the harness and existing quality checks**

Run: `npm test -- tests/setup.test.ts && npm run build && npm run lint`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests
git commit -m "test: add D1 service test harness"
```

### Task 2: Add D1 schema, migrations, and migration-seed tests

**Files:**
- Create: `drizzle/0002_add_admin_content_leads_analytics.sql`
- Modify: `db/schema.ts`
- Create: `lib/seed-content.ts`
- Create: `tests/schema-and-seed.test.ts`

**Interfaces:**
- Produces typed table constants in `uniriseSchema`.
- Produces `seedLegacyContent(db: D1Database): Promise<void>`.
- Consumes `newsPosts` and existing knowledge entries without changing public IDs or URLs.

- [ ] **Step 1: Write failing migration/seed tests**

```ts
import { describe, expect, it } from 'vitest';
import { createFakeD1 } from './helpers/fake-d1';
import { seedLegacyContent } from '../lib/seed-content';

describe('legacy content seed', () => {
  it('keeps news 3944 published and addressable by its existing ID', async () => {
    const db = createFakeD1();
    await seedLegacyContent(db);
    const row = await db.prepare<{ legacy_id: string; status: string }>(
      'SELECT legacy_id, status FROM managed_news WHERE legacy_id = ?'
    ).bind('3944').first();
    expect(row).toEqual({ legacy_id: '3944', status: 'published' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/schema-and-seed.test.ts`

Expected: FAIL because the schema and seed function do not exist.

- [ ] **Step 3: Write the migration and seed implementation**

Create tables for `admin_users`, `admin_login_codes`, `admin_sessions`, `admin_audit_log`, `managed_news`, `managed_downloads`, `chat_knowledge`, `chat_leads`, `site_events`, and `chat_question_log`. Add indexes for active sessions, published content, lead status/date, event date/path, and question outcome/date. Seed `hungyu@gmail.com` as enabled admin, the current `newsPosts`, four existing download collections, and all current site-knowledge records as published rows. Use `INSERT OR IGNORE` so migration deployment is repeat-safe.

```ts
export const uniriseSchema = {
  adminUsers: 'admin_users',
  adminSessions: 'admin_sessions',
  managedNews: 'managed_news',
  managedDownloads: 'managed_downloads',
  chatKnowledge: 'chat_knowledge',
  chatLeads: 'chat_leads',
  siteEvents: 'site_events',
  chatQuestions: 'chat_question_log',
} as const;
```

- [ ] **Step 4: Verify migration shape and seed behaviour**

Run: `npm test -- tests/schema-and-seed.test.ts && npm run build`

Expected: the test passes; no public page compilation regressions.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0002_add_admin_content_leads_analytics.sql db/schema.ts lib/seed-content.ts tests/schema-and-seed.test.ts
git commit -m "feat: add admin content and analytics schema"
```

### Task 3: Implement passwordless admin authentication and Resend delivery

**Files:**
- Create: `lib/admin-auth.ts`
- Create: `lib/resend.ts`
- Create: `app/api/admin/auth/request-code/route.ts`
- Create: `app/api/admin/auth/verify-code/route.ts`
- Create: `app/api/admin/auth/logout/route.ts`
- Create: `tests/admin-auth.test.ts`

**Interfaces:**
- Produces `requestAdminCode`, `verifyAdminCode`, `requireAdmin`, and `destroyAdminSession`.
- Produces `sendLoginCode({ to, code }: { to: string; code: string }): Promise<void>`.
- Requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL` only on server routes.

- [ ] **Step 1: Write failing security tests**

```ts
it('does not create a login code for an address outside the allowlist', async () => {
  const result = await requestAdminCode(db, 'outside@example.com', 'visitor-a', mailer);
  expect(result.accepted).toBe(true);
  expect(mailer.calls).toHaveLength(0);
});

it('rejects an expired or reused code and accepts a valid code once', async () => {
  const code = await issueTestCode(db, 'hungyu@gmail.com');
  await expect(verifyAdminCode(db, 'hungyu@gmail.com', code, clock.now())).resolves.toMatchObject({ email: 'hungyu@gmail.com' });
  await expect(verifyAdminCode(db, 'hungyu@gmail.com', code, clock.now())).resolves.toBeNull();
});
```

- [ ] **Step 2: Run authentication tests to verify they fail**

Run: `npm test -- tests/admin-auth.test.ts`

Expected: FAIL because auth and mail modules do not exist.

- [ ] **Step 3: Implement the minimal server-only auth flow**

Generate a six-digit code with `crypto.getRandomValues`, SHA-256 hash it with an application salt, set 10-minute expiry and five attempts, and create a random opaque session token whose hash is stored for 12 hours. Route handlers return a neutral success response from request-code, set only the raw session token in an `HttpOnly; Secure; SameSite=Lax; Path=/admin` cookie after verification, and clear that cookie on logout. `sendLoginCode` calls `https://api.resend.com/emails` with a server-side bearer token and an escaped email body.

```ts
export async function requireAdmin(request: Request, db: D1Database): Promise<{ id: string; email: string; role: 'admin' | 'editor' } | null>;
```

- [ ] **Step 4: Verify security and build**

Run: `npm test -- tests/admin-auth.test.ts && npm run build`

Expected: allowlist, expiry, one-time use, neutral response, and cookie tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/admin-auth.ts lib/resend.ts app/api/admin/auth tests/admin-auth.test.ts
git commit -m "feat: add passwordless admin authentication"
```

### Task 4: Add managed-content repositories, public reads, and content APIs

**Files:**
- Create: `lib/content-repository.ts`
- Create: `app/api/admin/news/route.ts`
- Create: `app/api/admin/downloads/route.ts`
- Create: `app/api/admin/knowledge/route.ts`
- Modify: `app/news/page.tsx`
- Modify: `app/downloads/page.tsx`
- Modify: `lib/site-knowledge.ts`
- Modify: `app/api/chat/route.ts`
- Create: `tests/content-repository.test.ts`
- Create: `tests/chat-retrieval.test.ts`

**Interfaces:**
- Produces `listPublishedNews`, `findPublishedNewsByLegacyId`, `listPublishedDownloads`, `retrievePublishedKnowledge`, and admin create/update/publish functions.
- Admin API routes consume `requireAdmin`; public page functions consume published-only repository reads.

- [ ] **Step 1: Write failing publication boundary tests**

```ts
it('never returns a draft knowledge record to public retrieval', async () => {
  await saveKnowledge(db, { title: 'Draft', href: '/contact', body: 'private', tags: [], status: 'draft' }, admin);
  await saveKnowledge(db, { title: 'Published', href: '/contact', body: 'address', tags: [], status: 'published' }, admin);
  await expect(retrievePublishedKnowledge(db, 'address')).resolves.toEqual([
    expect.objectContaining({ title: 'Published' }),
  ]);
});
```

- [ ] **Step 2: Run content tests to verify they fail**

Run: `npm test -- tests/content-repository.test.ts tests/chat-retrieval.test.ts`

Expected: FAIL because repository functions do not exist.

- [ ] **Step 3: Implement repositories and routes**

Validate every admin payload: title 1–160 characters, body 1–8,000 characters, tags up to 12 items, and URLs limited to local paths or `https:`. Write an audit row for each mutation. Preserve news legacy IDs and public query behavior. Replace static public lists and retrieval source assembly with published D1 reads; keep the present static arrays only as migration seed input.

```ts
export async function retrievePublishedKnowledge(db: D1Database, query: string, limit = 4): Promise<KnowledgeSource[]>;
```

- [ ] **Step 4: Verify public/private content separation**

Run: `npm test -- tests/content-repository.test.ts tests/chat-retrieval.test.ts && npm run build`

Expected: drafts remain inaccessible to pages and chat; publishing makes records source-linkable.

- [ ] **Step 5: Commit**

```bash
git add lib/content-repository.ts app/api/admin app/news/page.tsx app/downloads/page.tsx lib/site-knowledge.ts app/api/chat/route.ts tests
git commit -m "feat: manage published news downloads and chat knowledge"
```

### Task 5: Add chat lead capture, lead persistence, and email notification

**Files:**
- Create: `lib/lead-service.ts`
- Create: `app/api/leads/route.ts`
- Modify: `components/support-chat.tsx`
- Modify: `components/support-chat.module.css`
- Create: `tests/lead-service.test.ts`

**Interfaces:**
- Produces `createChatLead(db, input, context, mailer): Promise<{ id: string; emailDelivered: boolean }>`.
- Public `POST /api/leads` consumes quote or specialist request fields and returns no internal email details.

- [ ] **Step 1: Write failing lead tests**

```ts
it('stores a valid quote lead and requests an email notification', async () => {
  const result = await createChatLead(db, {
    requestType: 'quote', name: 'Lin', email: 'buyer@example.com', message: 'Need an X-ray inspection quote.',
  }, { sourcePath: '/' }, mailer);
  expect(result.emailDelivered).toBe(true);
  expect(mailer.calls[0].to).toBe('hungyu@gmail.com');
});

it('rejects a lead without name, valid work email, or request details', async () => {
  await expect(createChatLead(db, { requestType: 'quote', name: '', email: 'bad', message: '' }, { sourcePath: '/' }, mailer))
    .rejects.toThrow('invalid_lead');
});
```

- [ ] **Step 2: Run lead tests to verify they fail**

Run: `npm test -- tests/lead-service.test.ts`

Expected: FAIL because lead persistence and validation do not exist.

- [ ] **Step 3: Implement the lead boundary and chat UI**

After a successful chat answer, render **索取報價** and **聯絡專員**. Open an accessible compact form requiring name, email, and message; accept optional company, phone, and product/topic. Validate server-side, save to `chat_leads`, record an `inquiry_submitted` event, email `hungyu@gmail.com`, and return a visitor-safe result if email delivery fails. Never include chat history in the notification. Rate-limit lead submissions by hashed visitor ID.

```ts
type LeadInput = {
  requestType: 'quote' | 'specialist'; name: string; email: string; message: string;
  company?: string; phone?: string; topic?: string;
};
```

- [ ] **Step 4: Verify the lead flow**

Run: `npm test -- tests/lead-service.test.ts && npm run build`

Expected: valid leads persist and notify; invalid input is rejected; an email outage keeps the lead.

- [ ] **Step 5: Commit**

```bash
git add lib/lead-service.ts app/api/leads components/support-chat.tsx components/support-chat.module.css tests/lead-service.test.ts
git commit -m "feat: capture chatbot quote and specialist leads"
```

### Task 6: Record privacy-preserving events and build the admin dashboard

**Files:**
- Create: `lib/analytics.ts`
- Create: `app/api/analytics/route.ts`
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/page.tsx`
- Create: `components/admin-dashboard.tsx`
- Create: `components/admin-dashboard.module.css`
- Modify: `components/visitor-counter.tsx`
- Modify: `app/api/chat/route.ts`
- Create: `tests/analytics.test.ts`

**Interfaces:**
- Produces `recordEvent` and `getDashboardMetrics(db, { from, to })`.
- Dashboard consumes a valid admin session and returns metrics plus sanitized unanswered questions.

- [ ] **Step 1: Write failing metric tests**

```ts
it('calculates conversion from leads divided by distinct visitors', async () => {
  await recordEvent(db, { visitorHash: 'a', name: 'page_view', path: '/' });
  await recordEvent(db, { visitorHash: 'b', name: 'page_view', path: '/news' });
  await recordEvent(db, { visitorHash: 'a', name: 'inquiry_submitted', path: '/' });
  await expect(getDashboardMetrics(db, { from: '2026-09-01', to: '2026-09-03' }))
    .resolves.toMatchObject({ uniqueVisitors: 2, leads: 1, leadConversionRate: 0.5 });
});
```

- [ ] **Step 2: Run analytics tests to verify they fail**

Run: `npm test -- tests/analytics.test.ts`

Expected: FAIL because event functions and metrics do not exist.

- [ ] **Step 3: Implement events, dashboard, and dashboard navigation**

Record `page_view`, `download_click`, `chat_question`, `chat_answered`, `chat_unanswered`, and `inquiry_submitted` with hashed visitor IDs and non-sensitive metadata. Make chat route store a sanitized question and selected source IDs; delete question rows older than 90 days on write. Add administrator-only overview cards, date filters, content/lead/gap views, and a logout action. Ensure page views exclude `/admin` and development origins.

```ts
export type DashboardMetrics = {
  uniqueVisitors: number; pageViews: number; downloadClicks: number; chatQuestions: number;
  chatAnswerRate: number; unansweredQuestions: number; leads: number; leadConversionRate: number;
};
```

- [ ] **Step 4: Verify metrics and protected dashboard**

Run: `npm test -- tests/analytics.test.ts && npm run build`

Expected: metrics match the defined formulas; unauthenticated `/admin` access redirects to login.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics.ts app/api/analytics app/api/chat/route.ts app/admin components tests/analytics.test.ts
git commit -m "feat: add private analytics dashboard"
```

### Task 7: End-to-end verification, secrets configuration, and public release

**Files:**
- Modify: `.dev.vars.example`
- Modify: `README.md`
- Create: `tests/admin-leads-analytics.e2e.test.ts`

**Interfaces:**
- Consumes all prior public and admin APIs.
- Produces reproducible local and production release instructions without secret values.

- [ ] **Step 1: Write an end-to-end-style failing test**

```ts
it('publishes knowledge, answers from it, saves a quote lead, and reports one conversion', async () => {
  const admin = await authenticateAllowlistedAdmin(app, 'hungyu@gmail.com');
  await admin.publishKnowledge({ title: 'Test source', href: '/contact', body: 'Test answer', tags: ['test'] });
  await expect(app.chat('Test answer?')).resolves.toMatchObject({ sources: [expect.objectContaining({ title: 'Test source' })] });
  await app.submitLead({ requestType: 'quote', name: 'Lin', email: 'buyer@example.com', message: 'Please contact me.' });
  await expect(admin.dashboard()).resolves.toMatchObject({ leads: 1, leadConversionRate: expect.any(Number) });
});
```

- [ ] **Step 2: Run the complete test suite to verify the end-to-end test fails**

Run: `npm test`

Expected: FAIL only on the new end-to-end test until the prior components are wired together.

- [ ] **Step 3: Wire the final integration and document exact configuration**

Create `.dev.vars.example` with empty values for `GROQ_API_KEY`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`; keep it safe for Git. Document how to add the two Resend values to local `.dev.vars` and Sites production secrets, verify the sender, apply the D1 migration locally and in Sites, and use `hungyu@gmail.com` for initial login. Do not put any secret value in the document.

- [ ] **Step 4: Run all validation checks**

Run: `npm test && npm run lint && npm run build`

Expected: all commands exit 0. Then manually test local login, publication, source-linked chat answer, quote lead persistence, simulated email failure, dashboard date range, legacy `/news?id=3944`, and visitor counter.

- [ ] **Step 5: Commit and release**

```bash
git add .dev.vars.example README.md tests/admin-leads-analytics.e2e.test.ts
git commit -m "test: verify admin lead and analytics release"
git push origin main
```

Package the validated `dist` build, save a Sites version, deploy it to the existing public site only after `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured as Sites secrets, then perform a non-sensitive production verification.

## Plan Self-Review

- **Spec coverage:** Tasks 2–4 cover managed content and chatbot retrieval; Task 3 covers allowlist, code expiry, sessions, and audit; Task 5 covers the lead flow and Resend notification; Task 6 covers every defined metric, chat gaps, and privacy; Task 7 covers configuration, migration, end-to-end behaviour, and release.
- **Placeholder scan:** No unfinished implementation labels or unspecified validation steps remain. Phase 2 product management is excluded from all task deliverables.
- **Type consistency:** `requireAdmin`, `retrievePublishedKnowledge`, `createChatLead`, `recordEvent`, and `getDashboardMetrics` are defined before they are consumed by later tasks.
