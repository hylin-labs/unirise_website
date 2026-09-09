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

   The final migration creates the initial enabled administrator allowlist entry for `hungyu@gmail.com`.

5. Start the local Worker against that generated configuration with `npm run start`, or run `npm run dev` for the Vite development server.

## Required checks for this feature

The following checks are green for the admin, lead, and analytics feature:

1. `npm test`
2. `npm exec oxlint -- tests/admin-leads-analytics.e2e.test.ts`
3. `npm exec oxfmt -- --check tests/admin-leads-analytics.e2e.test.ts`
4. `npm run build`
5. `git diff --check`

Then manually check the administrator login, publish a knowledge entry, ask the chatbot a matching question and verify its source link, submit a quote lead, simulate email failure, filter the analytics dashboard by date, open `/news?id=3944`, and confirm the visitor counter works.

`npm run lint` is not currently a green repository-wide release gate. It reports pre-existing accessibility, React-compiler, and legacy-page findings outside this feature. Treat that baseline as known technical debt and a separate full-release blocker; do not claim a clean full-repository lint result until those findings are resolved.

## Production release prerequisites

Production release is blocked until all of the following are complete:

1. Verify the `RESEND_FROM_EMAIL` sender/domain in Resend.
2. In the Sites project identified by `.openai/hosting.json`, confirm that its Cloudflare D1 binding is named `DB`. Select that bound production D1 database, then apply the same migrations in this exact order: `drizzle/0000_add_visitor_statistics.sql`, `drizzle/0001_add_chat_rate_limits.sql`, and `drizzle/0002_add_admin_content_leads_analytics.sql`.
3. If migration is performed from the Cloudflare CLI rather than the D1 SQL console, replace `<production-d1-name-or-id>` with the D1 database bound as `DB` in Sites and run:

   1. `npx wrangler d1 execute <production-d1-name-or-id> --remote --file drizzle/0000_add_visitor_statistics.sql`
   2. `npx wrangler d1 execute <production-d1-name-or-id> --remote --file drizzle/0001_add_chat_rate_limits.sql`
   3. `npx wrangler d1 execute <production-d1-name-or-id> --remote --file drizzle/0002_add_admin_content_leads_analytics.sql`

4. Configure `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_AUTH_PEPPER`, and `ANALYTICS_HASH_PEPPER` as Sites production secrets for that project. Do not expose them as client variables or commit them to the repository.
5. Complete the feature checks above against the release build. Resolve the separate full-repository lint baseline before declaring a fully clean production release.
6. Sign in through `/admin/login` as the initial allowlisted administrator, `hungyu@gmail.com`, and verify only the intended published content is public.

After those prerequisites are confirmed, publish the validated build using the existing Sites release process and perform a non-sensitive production smoke test. Do not publish, configure production secrets, or run remote D1 commands from a local `.dev.vars` file.
