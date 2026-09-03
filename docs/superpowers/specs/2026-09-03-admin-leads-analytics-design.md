# Unirise Phase 1: Administration, Chat Leads, and Analytics

## Purpose

Create a secure first-party administration area for the existing Unirise website. The first release lets an authorised team member maintain public news, download entries, and chatbot knowledge; receive qualified chatbot inquiries; and view useful site activity. Full editable product categories, specifications, and image management are intentionally deferred to Phase 2.

## Scope

### Included in Phase 1

- Passwordless administrator login using one-time email codes.
- An explicit administrator allowlist, initially containing `hungyu@gmail.com`.
- News, download-entry, and chatbot-knowledge drafts, publishing, editing, and unpublishing.
- A chat lead form for quote requests and specialist contact requests.
- D1 storage for content, leads, events, unanswered chat questions, login state, and audit records.
- Resend notifications for login codes and newly submitted leads, initially delivered to `hungyu@gmail.com`.
- An admin dashboard for visitor activity, page views, downloads, chat activity, unanswered questions, and inquiry conversion.
- Existing public pages and chatbot retrieval changed to read published Phase 1 content from D1, with the current public content seeded during migration.

### Deferred to Phase 2

- Full editable product hierarchy, specifications, product images, and catalogue import tools.
- Multiple team roles beyond the initial administrator, although the schema supports future roles.
- CRM synchronisation, sales assignment automation, and email campaign features.
- File upload hosting; Phase 1 download entries reference existing approved brochure URLs.

## Architecture

The existing Vinext/React application remains the single website. Cloudflare D1 remains the system of record. A new `/admin` route group and server-side API routes are added to the same application. No external CMS is introduced.

```text
Visitor -> public pages / chatbot -> D1 published content
Visitor -> quote or specialist form -> D1 lead -> Resend email -> hungyu@gmail.com
Administrator -> email code -> secure session -> /admin -> D1 content, leads, analytics
Public page and chat events -> D1 analytics tables -> /admin dashboard
```

The public chatbot continues to send only the selected public website context and the visitor question to Groq. It does not send lead-form details, administrator data, or D1 records outside the selected chatbot context.

## Authentication and Access

- The login page accepts an email address only.
- The server checks the active administrator allowlist before issuing a code. Unlisted addresses receive the same neutral response as listed addresses, preventing account enumeration.
- A six-digit, single-use code is generated server-side, hashed before persistence, expires after 10 minutes, and is limited to five verification attempts.
- Code requests and attempts are rate-limited by a salted visitor hash and email hash.
- Successful verification creates a random, opaque session ID in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The database stores only a hash of the session token and expires sessions after 12 hours.
- Every content publish, unpublish, edit, and lead-status change is written to an audit log with the administrator ID and timestamp.
- The initial allowlist entry and lead-notification recipient are `hungyu@gmail.com`. Future administrators can be added through the admin panel only by an existing administrator.

## Resend Configuration

The runtime reads these Sites secret environment variables:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

During development, Resend's verified test sender may be used only for the verified owner recipient. Before public administrator login is enabled for additional recipients, `RESEND_FROM_EMAIL` must be a verified sender on a domain controlled by Unirise. Secrets are stored in Sites runtime settings and local `.dev.vars`, never committed to Git or returned to the browser.

## Data Model

### Identity and audit

- `admin_users`: email, role (`admin` or future `editor`), enabled flag, created and updated timestamps.
- `admin_login_codes`: user ID, code hash, expiry, attempt count, consumed timestamp, request visitor hash.
- `admin_sessions`: user ID, token hash, expiry, created and last-used timestamps.
- `admin_audit_log`: actor user ID, action, entity type, entity ID, JSON summary, timestamp.

### Managed public content

- `managed_news`: stable legacy ID, title, lead text, body, highlights JSON, publish status, published timestamp, updated timestamp.
- `managed_downloads`: title, category, description, approved external or local brochure URL, publish status, updated timestamp.
- `chat_knowledge`: title, source URL, body, tags, publish status, updated timestamp.

The migration seeds current public news, downloads, and the existing website retrieval knowledge into these tables. Public routes read only records marked published. Existing legacy links such as `/news?id=3944` remain valid.

### Leads and analytics

- `chat_leads`: request type (`quote` or `specialist`), name, company, work email, phone, selected product or topic, message, source page, status (`new`, `contacted`, `closed`), created timestamp, and last update.
- `site_events`: hashed visitor ID, optional anonymous session ID, event name, page path, small non-sensitive JSON metadata, timestamp.
- `chat_question_log`: sanitized visitor question, answer status (`answered`, `unanswered`, `error`), selected source IDs, created timestamp.

Questions and lead details are never sent to analytics providers. Question text is kept for no more than 90 days, and lead records are retained until an administrator deletes or closes them according to company policy. The admin dashboard never displays visitor IP addresses or raw authentication tokens.

## Public Experience

### Content

News and download pages render published D1 records. The existing visual design, legacy URLs, and public navigation are preserved. Unpublished records are invisible to visitors and chatbot retrieval.

### Chat lead capture

After a successful chatbot answer, the widget presents two choices: **索取報價** and **聯絡專員**. Selecting either opens a compact form. Required fields are name, work email, and request details; company, phone, and product/topic are optional but encouraged. The form explains that submitted contact details are used to respond to the request.

On successful submission, the site stores the lead, records an `inquiry_submitted` event, and sends a concise notification to `hungyu@gmail.com`. The visitor sees a confirmation without revealing internal routing details. If Resend is unavailable, the lead remains stored, the visitor receives an honest acknowledgement that follow-up may be delayed, and the failure is recorded for administrators.

### Chatbot retrieval

The chatbot retrieves only published `chat_knowledge`, approved news, and relevant public download records. Each answer continues to show source links. If no source is relevant, it says the public website does not provide the detail and offers the two lead-capture actions.

## Administration Experience

The `/admin` dashboard has these sections:

- **Overview:** selected date range, unique visitors, page views, download clicks, chat questions, chat answer rate, leads, and lead conversion rate.
- **News:** draft, edit, publish, unpublish, and preview news while preserving the legacy public ID.
- **Downloads:** manage title, category, description, link, and publication state.
- **Chat knowledge:** add, edit, publish, unpublish, tag, and link a source record; published changes become searchable by the chatbot.
- **Leads:** filter by status and request type, view supplied details, change status, and record a follow-up note.
- **Chat gaps:** review sanitized unanswered or failed questions, then create a knowledge entry from one when appropriate.
- **Administrators:** show the authorised email list and allow an administrator to add, disable, or remove future users; the active administrator cannot remove their own final administrator account.

## Event and Metric Definitions

- **Unique visitors:** distinct hashed visitor IDs observed in the selected period.
- **Page views:** `page_view` events, excluding admin paths and local development origins.
- **Download clicks:** `download_click` events on published download records.
- **Chat questions:** accepted public chatbot requests after rate limiting.
- **Answer rate:** answered chatbot questions divided by accepted chatbot questions, excluding technical errors from the numerator.
- **Unanswered questions:** chatbot requests for which no published retrieval source was found.
- **Leads:** successfully persisted quote or specialist requests.
- **Lead conversion rate:** leads divided by unique visitors in the selected period.

## API Boundaries and Validation

- Public APIs accept only the minimum fields for visitor statistics, analytics events, chat questions, and lead submission.
- Admin APIs require a valid administrator session and validate role for each action.
- All input is length-limited, type-checked, normalised, and HTML-escaped on output.
- State-changing requests use same-origin validation and rate limiting.
- Lead notification email is rendered server-side using escaped values; it does not include visitor chat history by default.
- Download URLs must be `https:` URLs or application-local paths; JavaScript and data URLs are rejected.

## Error Handling

- Login requests always return a neutral confirmation; delivery or configuration failures are logged server-side and shown to the administrator only after login.
- Content changes fail without partial publication: the old published record remains available until a valid replacement succeeds.
- Failed Resend delivery does not discard a stored lead or login audit event.
- Dashboard queries show an explicit empty state and never fabricate metrics when D1 is unavailable.
- Public chat continues to offer a fallback contact path when Groq or D1 is unavailable.

## Validation Plan

1. Migration tests seed legacy news and retrieval content and preserve public legacy URLs.
2. Authentication tests cover allowlisted and blocked addresses, expired and reused codes, rate limits, session expiry, and unauthorised admin requests.
3. Content tests verify drafts remain private and published updates appear in public news, downloads, and chatbot source retrieval.
4. Lead tests verify form validation, D1 persistence, notification delivery request construction, a recorded conversion event, and graceful email-service failure.
5. Analytics tests verify event deduplication rules, date filtering, metric formulas, and exclusion of admin/local traffic.
6. End-to-end checks cover login, publish a knowledge entry, ask the chatbot a matching question, submit a quote request, and observe the lead plus dashboard metrics.
7. Security checks verify no Resend secret, session token, raw IP, or private lead data is rendered in public responses or Git.

## Acceptance Criteria

- `hungyu@gmail.com` can sign in with a valid one-time code and no other email can access `/admin`.
- An administrator can publish and unpublish a news entry, download entry, and chatbot knowledge entry without a code deployment.
- A newly published knowledge entry is used by the public chatbot and linked as a source.
- A visitor can submit a quote or specialist request from the chat widget; the lead is stored and a notification is sent to `hungyu@gmail.com` when Resend is configured.
- The dashboard reports the defined metrics over a chosen date range and exposes unanswered questions for content improvement.
- Existing public pages, legacy news links, visitor counting, chatbot rate limiting, and the current public styling continue to work.
