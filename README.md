# Unirise Technology website

## Local setup

1. Install Node.js 22.13 or later, then run `npm ci`.
2. Copy `.dev.vars.example` to an untracked `.dev.vars` file and set every value:
   - `GROQ_API_KEY`: the server-only Groq key used by the test chatbot.
   - `RESEND_API_KEY`: the server-only Resend API key.
   - `RESEND_FROM_EMAIL`: a sender address verified in Resend, for example `Unirise <updates@your-verified-domain>`.
   - `ADMIN_AUTH_PEPPER`: a unique, high-entropy server secret used to protect one-time administrator codes.
   - `ANALYTICS_HASH_PEPPER`: a separate unique, high-entropy server secret used to hash visitor identifiers.
3. Apply the D1 migration `drizzle/0002_add_admin_content_leads_analytics.sql` to the local D1 database before testing administrator, chatbot knowledge, leads, or analytics. The migration creates the initial enabled administrator allowlist entry for `hungyu@gmail.com`.
4. Start the site with `npm run dev`.

## Required local checks

Run these checks before requesting a release:

\`\`\`bash
npm test
npm run lint
npm run build
git diff --check
\`\`\`

Then manually check the administrator login, publish a knowledge entry, ask the chatbot a matching question and verify its source link, submit a quote lead, simulate email failure, filter the analytics dashboard by date, open `/news?id=3944`, and confirm the visitor counter works.

## Production release prerequisites

Production release is blocked until all of the following are complete:

1. Verify the `RESEND_FROM_EMAIL` sender/domain in Resend.
2. Apply `drizzle/0002_add_admin_content_leads_analytics.sql` to the production Cloudflare D1 database.
3. Configure `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_AUTH_PEPPER`, and `ANALYTICS_HASH_PEPPER` as Sites production secrets. Do not expose these as client variables or commit them to the repository.
4. Complete the required checks above against the release build.
5. Sign in through `/admin/login` as the initial allowlisted administrator, `hungyu@gmail.com`, and verify only the intended published content is public.

After those prerequisites are confirmed, publish the validated build using the existing Sites release process and perform a non-sensitive production smoke test. Do not publish or configure production secrets from a local `.dev.vars` file.
