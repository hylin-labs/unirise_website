# Unirise Technology website

## Local setup

1. Install Node.js 22.13 or later, then run `npm ci`.
2. Copy `.dev.vars.example` to an untracked `.dev.vars` file and set every value:
   - `GROQ_API_KEY`: the server-only Groq key used by the test chatbot and administrator-initiated English drafts. Do not expose it as a client variable or create a second browser credential.
   - `RESEND_API_KEY`: the server-only Resend API key.
   - `RESEND_FROM_EMAIL`: a sender address verified in Resend, for example `Unirise <updates@your-verified-domain>`.
   - `ADMIN_AUTH_PEPPER`: a unique, high-entropy server secret used to protect one-time administrator codes.
   - `ANALYTICS_HASH_PEPPER`: a separate unique, high-entropy server secret used to hash visitor identifiers.
3. Build once to create the local Worker configuration at `dist/server/wrangler.json`: `npm run build`.
4. For a clean local D1 database, apply every migration in order. The generated configuration names the local binding `DB` and local database `site-creator-d1`:

   1. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0000_add_visitor_statistics.sql`
   2. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0001_add_chat_rate_limits.sql`
   3. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0002_add_admin_content_leads_analytics.sql`
   4. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0003_add_bilingual_content.sql`

   Migration `0002` is schema-only. On the first Worker request, the idempotent runtime initializer creates the `hungyu@gmail.com` allowlist entry and imports the legacy public content. A new Worker isolate can run that safe initializer again; `INSERT OR IGNORE` keeps the resulting data stable.

5. Start the local Worker with `npm run start`. The cross-platform Node wrapper resolves the repository-root `.dev.vars` path before it calls Wrangler, so it is not affected by the generated `dist/server/wrangler.json` location. Run `npm run dev` only for the Vite development server.

## Administrator English drafts

English translation is initiated by an administrator from `/admin`. Each Worker invocation processes one durable job item, so the administrator interface can poll until the job finishes. Groq failures are recorded as safe error codes on the individual item; retry a selected failed item from `/admin`, or start a new selected job after its Chinese source changes. Groq access is never exposed in the browser. The existing server-only `GROQ_API_KEY` powers both the test chatbot and these English drafts.

Open **英文翻譯** in the administrator sidebar, start the untranslated/outdated batch, and keep processing/resuming its saved job until every item is terminal. Review failed items and retry them individually. Preview and edit each English record, then mark reviewed content published; unpublish it to make it private. AI records marked `needs_review` are already public immediately, including English chatbot knowledge whose Chinese source is published. `draft` English knowledge never enters English retrieval, and missing English knowledge never falls back to Chinese in chat. Public pages may retain Chinese content until their English translation is available.

Chinese source edits flag older English for review without replacing human edits. Check source-version warnings before approving English. Do not call a rollout complete while its translation batch has pending or failed items. The analytics overview compares both languages and the chat-gap list labels each unanswered question's language.

## Bilingual release checks

Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`, `npm run test:local-worker-smoke`, then `node scripts/smoke-bilingual-local-worker.mjs`, in that order. The shared `lib/public-route-inventory.mjs` supplies public route families for routing, sitemap expectations, and smoke coverage. The bilingual smoke follows rendered catalog/query links and checks original local assets. It uses a temporary copy of the built Worker, temporary sentinel configuration, migrations through `0003`, and isolated local D1; Groq responses are mocked and other outbound Worker fetches are blocked. Cleanup removes only that temporary workspace. It never reads the root `.dev.vars` or applies remote migrations.

Before publishing, manually check desktop/mobile menus, carousel, language switching with query and anchor, news/download details, inquiry forms, source links, visitor labels, and the translation manager. Automated route checks do not establish pixel-level visual parity. A verified Resend sender is a separate, pre-existing production prerequisite; successful local bilingual tests do not prove email delivery.

## Required checks for this feature

The following checks are green for the admin, lead, and analytics feature:

1. `npm test`
2. `npm run lint`
3. `npm exec oxlint -- tests/admin-leads-analytics.e2e.test.ts`
4. `npm exec oxfmt -- --check tests/admin-leads-analytics.e2e.test.ts`
5. `npm run build`
6. `git diff --check`
7. `npm run test:local-worker-smoke` (only when no root `.dev.vars` already exists; it creates and removes a sentinel-only file and isolated local D1 state)

Then manually check the administrator login, publish a knowledge entry, ask the chatbot a matching question and verify its source link, submit a quote lead, simulate email failure, filter the analytics dashboard by date, open `/news?id=3944`, and confirm the visitor counter works.

## Production release prerequisites

Production release is blocked until all of the following are complete:

1. Verify the `RESEND_FROM_EMAIL` sender/domain in Resend.
2. Build the site and inspect the Sites deployment package. The supported migration bundle is `dist/.openai/drizzle/0000_add_visitor_statistics.sql`, `dist/.openai/drizzle/0001_add_chat_rate_limits.sql`, `dist/.openai/drizzle/0002_add_admin_content_leads_analytics.sql`, and `dist/.openai/drizzle/0003_add_bilingual_content.sql`. `.openai/hosting.json` declares the logical D1 binding as `DB`; Sites owns the bound production database and migration history.
3. Use the existing Sites deploy pipeline to preview and apply that packaged migration bundle. Do not run arbitrary remote `wrangler d1 execute` commands against a production database.

   - **Fresh production database:** confirm the Sites migration preview contains the four files in ascending order, then let the Sites deployment apply them once. The first Worker request performs the safe runtime content initialization.
   - **Existing production database:** review the Sites migration status and generated migration plan before release. Apply only the package migrations the Sites pipeline marks as pending. If the recorded migration state or schema is ambiguous, stop and reconcile it through the deployment owner; never rerun a migration merely because object names appear to exist.

4. For local-only troubleshooting, use schema SQL and `PRAGMA` output rather than object-name checks as evidence. For example, compare `PRAGMA table_info('admin_users')` and `PRAGMA index_list('admin_sessions')` against `drizzle/0002_add_admin_content_leads_analytics.sql`; table or index names alone do not establish compatible columns, constraints, or migration state.
5. Configure `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_AUTH_PEPPER`, and `ANALYTICS_HASH_PEPPER` as Sites production secrets for that project. Do not expose them as client variables or commit them to the repository.
6. Complete every feature check above, including `npm run lint`, against the release build before declaring the production release ready.
7. Sign in through `/admin/login` as the initial allowlisted administrator, `hungyu@gmail.com`, and verify only the intended published content is public.

After those prerequisites are confirmed, publish the validated build using the existing Sites release process and perform a non-sensitive production smoke test. Do not publish, configure production secrets, or run remote D1 commands from a local `.dev.vars` file.
