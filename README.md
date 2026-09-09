# Unirise Technology website

## Local setup

1. Install Node.js 22.13 or later, then run `npm ci`.
2. Copy `.dev.vars.example` to an untracked `.dev.vars` file and set every value:
   - `GROQ_API_KEY`: the server-only Groq key used by the test chatbot.
   - `RESEND_API_KEY`: the server-only Resend API key.
   - `RESEND_FROM_EMAIL`: a sender address verified in Resend, for example `Unirise <updates@your-verified-domain>`.
   - `ADMIN_AUTH_PEPPER`: a unique, high-entropy server secret used to protect one-time administrator codes.
   - `ANALYTICS_HASH_PEPPER`: a separate unique, high-entropy server secret used to hash visitor identifiers.
3. Build once to create the local Worker configuration at `dist/server/wrangler.json`: `npm run build`.
4. For a clean local D1 database, apply every migration in order. The generated configuration names the local binding `DB` and local database `site-creator-d1`:

   1. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0000_add_visitor_statistics.sql`
   2. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0001_add_chat_rate_limits.sql`
   3. `npx wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --file drizzle/0002_add_admin_content_leads_analytics.sql`

   Migration `0002` is schema-only. On the first Worker request, the idempotent runtime initializer creates the `hungyu@gmail.com` allowlist entry and imports the legacy public content. A new Worker isolate can run that safe initializer again; `INSERT OR IGNORE` keeps the resulting data stable.

5. Start the local Worker with `npm run start`. The cross-platform Node wrapper resolves the repository-root `.dev.vars` path before it calls Wrangler, so it is not affected by the generated `dist/server/wrangler.json` location. Run `npm run dev` only for the Vite development server.

## Required checks for this feature

The following checks are green for the admin, lead, and analytics feature:

1. `npm test`
2. `npm exec oxlint -- tests/admin-leads-analytics.e2e.test.ts`
3. `npm exec oxfmt -- --check tests/admin-leads-analytics.e2e.test.ts`
4. `npm run build`
5. `git diff --check`
6. `npm run test:local-worker-smoke` (only when no root `.dev.vars` already exists; it creates and removes a sentinel-only file and isolated local D1 state)

Then manually check the administrator login, publish a knowledge entry, ask the chatbot a matching question and verify its source link, submit a quote lead, simulate email failure, filter the analytics dashboard by date, open `/news?id=3944`, and confirm the visitor counter works.

`npm run lint` is not currently a green repository-wide release gate. It reports pre-existing accessibility, React-compiler, and legacy-page findings outside this feature. Treat that baseline as known technical debt and a separate full-release blocker; do not claim a clean full-repository lint result until those findings are resolved.

## Production release prerequisites

Production release is blocked until all of the following are complete:

1. Verify the `RESEND_FROM_EMAIL` sender/domain in Resend.
2. Build the site and inspect the Sites deployment package. The supported migration bundle is `dist/.openai/drizzle/0000_add_visitor_statistics.sql`, `dist/.openai/drizzle/0001_add_chat_rate_limits.sql`, and `dist/.openai/drizzle/0002_add_admin_content_leads_analytics.sql`. `.openai/hosting.json` declares the logical D1 binding as `DB`; Sites owns the bound production database and migration history.
3. Use the existing Sites deploy pipeline to preview and apply that packaged migration bundle. Do not run arbitrary remote `wrangler d1 execute` commands against a production database.

   - **Fresh production database:** confirm the Sites migration preview contains the three files in ascending order, then let the Sites deployment apply them once. The first Worker request performs the safe runtime content initialization.
   - **Existing production database:** review the Sites migration status and generated migration plan before release. Apply only the package migrations the Sites pipeline marks as pending. If the recorded migration state or schema is ambiguous, stop and reconcile it through the deployment owner; never rerun a migration merely because object names appear to exist.

4. For local-only troubleshooting, use schema SQL and `PRAGMA` output rather than object-name checks as evidence. For example, compare `PRAGMA table_info('admin_users')` and `PRAGMA index_list('admin_sessions')` against `drizzle/0002_add_admin_content_leads_analytics.sql`; table or index names alone do not establish compatible columns, constraints, or migration state.
5. Configure `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_AUTH_PEPPER`, and `ANALYTICS_HASH_PEPPER` as Sites production secrets for that project. Do not expose them as client variables or commit them to the repository.
6. Complete the feature checks above against the release build. Resolve the separate full-repository lint baseline before declaring a fully clean production release.
7. Sign in through `/admin/login` as the initial allowlisted administrator, `hungyu@gmail.com`, and verify only the intended published content is public.

After those prerequisites are confirmed, publish the validated build using the existing Sites release process and perform a non-sensitive production smoke test. Do not publish, configure production secrets, or run remote D1 commands from a local `.dev.vars` file.
