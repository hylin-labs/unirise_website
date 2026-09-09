# Unirise Bilingual Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete Traditional Chinese and English version of every current public Unirise page, with English under `/en/...`, immediately-public Groq drafts that administrators can review, and locale-aware chat, analytics, and SEO.

**Architecture:** Keep Chinese as the canonical source in the existing D1 content tables. Add a generic, versioned translation layer for English and a managed `public_content` source for text that is currently embedded in React modules. Reuse one locale-aware page implementation per route and mount thin `/en` route wrappers rather than forked pages. Translation jobs persist every item and result so they can resume safely after an edge/API failure.

**Tech Stack:** React 19, Vinext/Next App Router, Cloudflare Workers + D1, TypeScript, Vitest, Groq Chat Completions, Sites deployment pipeline.

**Spec:** `docs/superpowers/specs/2026-09-09-bilingual-site-design.md`

## Global Constraints

- Traditional Chinese stays at every existing URL and remains the source of truth; do not redirect a direct Chinese or English shared link.
- Every public Chinese route gets an equivalent `/en` route, including `catalog` query parameters, news/download IDs, inquiry `product`, and home anchors.
- English AI output starts as `needs_review` and is public immediately. A reviewed `published` record is also public; `draft` is not public.
- Never overwrite a human-edited English payload. A later Chinese source edit must instead mark the English counterpart outdated (`needs_review`).
- Preserve literal brand/model names, identifiers, measurements, phone numbers, emails, URLs, asset URLs, query IDs, and video/download links during translation.
- Maintain all current privacy controls, HMAC identifiers, rate limits, 90-day question retention, authenticated admin access, and audit records.
- Do not include API keys or other secrets in source, fixtures, screenshots, logs, or commits.
- Do not redesign the English product/solution entry or English download/quote conversion in this phase; localize the current workflow only.

---

## File and Route Map

| Area | Current implementation | Planned responsibility |
| --- | --- | --- |
| Public home and chrome | `app/page.tsx`, `app/original-shell.tsx` | Shared locale-aware home/header/footer; language selector and preserved menu hierarchy. |
| Inner public routes | `app/catalog/page.tsx`, `app/news/page.tsx`, `app/downloads/page.tsx`, `app/contact/page.tsx`, `app/inquiry/page.tsx` | One locale-aware implementation per route plus matching `app/en/**/page.tsx` wrappers. |
| Chinese source content | `managed_news`, `managed_downloads`, `chat_knowledge`, embedded page modules | Existing tables remain Chinese; new `public_content` stores currently embedded Chinese public payloads. |
| English content and jobs | none | `content_translations`, `translation_jobs`, and `translation_job_items` in D1; repository and Groq service under `lib/`. |
| Administrator UI | `components/admin-dashboard.tsx` | New translation view/component and protected `/api/admin/translations` API. |
| Chat and leads | `components/support-chat.tsx`, `app/api/chat/route.ts`, `lib/lead-service.ts` | Locale passed end-to-end, same-locale retrieval/source links, and locale-safe analytics. |
| SEO and observability | `app/layout.tsx`, `lib/analytics.ts` | Locale metadata, canonical/hreflang/sitemap, and locale-aware dashboard aggregates. |

## Tasks

### Task 1: Establish the locale contract and exact path conversion rules

**Files:**
- Create: `lib/locales.ts`
- Create: `lib/localized-route.ts`
- Create: `components/language-switcher.tsx`
- Modify: `app/layout.tsx`
- Create: `tests/locale-routing.test.ts`

- [ ] **Step 1: Write failing locale-routing tests.** Cover `zh-TW` and `en`; `/` ↔ `/en`; each current public route; query preservation for `/catalog`, `/news`, `/downloads`, and `/inquiry`; hash preservation for `#news`, `#brands`, `#contact`; and rejection/fallback of an unsafe path such as `//attacker.example`.

- [ ] **Step 2: Add locale primitives.** In `lib/locales.ts`, export the closed `Locale = 'zh-TW' | 'en'` type, `DEFAULT_LOCALE`, public labels, a cookie name, and parsers that reject unknown locale input. In `lib/localized-route.ts`, implement `localeFromPathname`, `localizedPath`, `alternateLocalePath`, and `publicPathWithoutLocale`; accept only the six public route bases (`/`, `/catalog`, `/news`, `/downloads`, `/contact`, `/inquiry`) and preserve a caller-supplied search string/hash verbatim after validating the path.

- [ ] **Step 3: Build an accessible language switcher.** `LanguageSwitcher` must render real links, not a route-changing form; it derives the current pathname/search/hash in the browser, sets the `unirise_locale` cookie with `SameSite=Lax; Path=/; Max-Age=31536000`, and navigates to the corresponding localized path. It must never auto-redirect a visitor merely because the cookie differs from a direct URL.

- [ ] **Step 4: Set baseline document metadata safely.** Move the root title/description into a locale-neutral site metadata helper/import location that later tasks can override per route. Keep the root default `lang="zh-Hant"`; add a small client-side locale document attribute component only if Vinext cannot set the nested English document language server-side. Do not change existing Chinese title/description yet.

- [ ] **Step 5: Run focused tests.** Run `npm test -- locale-routing.test.ts` and verify no current route is reinterpreted as an external URL.

### Task 2: Persist canonical public content, English translations, and resumable translation jobs

**Files:**
- Create: `drizzle/0003_add_bilingual_content.sql`
- Modify: `db/schema.ts`
- Create: `lib/public-content.ts`
- Create: `lib/translation-types.ts`
- Create: `lib/translation-repository.ts`
- Modify: `lib/seed-content.ts`
- Modify: `lib/runtime-initialization.ts`
- Create: `tests/translation-repository.test.ts`

- [ ] **Step 1: Write failing repository tests.** Model Chinese source seeding, an English `needs_review` record being public, a `draft` record remaining private, source-version invalidation after Chinese edit, protection of human-edited English, job item failure/retry, and idempotent first-request initialization.

- [ ] **Step 2: Add the migration.** Create `public_content` with `id`, `payload_json`, `source_version`, status, timestamps, and unique stable IDs. Create `content_translations` with `resource_type` (`news`, `download`, `knowledge`, `public_content`), `resource_id`, `locale`, `payload_json`, `status` (`draft`, `needs_review`, `published`), `source_version`, `origin` (`ai`, `human`), `failure_reason`, reviewer fields, timestamps, and a unique `(resource_type, resource_id, locale)` constraint. Create `translation_jobs` and `translation_job_items` so a requested batch, each source version, each attempt/state, and each failure remain durable. Add supporting source/status and job-state indexes. Add `source_version INTEGER NOT NULL DEFAULT 1` to each existing Chinese content table. Add `locale TEXT NOT NULL DEFAULT 'zh-TW'` to `site_events`, `chat_question_log`, and `chat_leads`, then add date/locale indexes used by dashboard aggregates.

- [ ] **Step 3: Define strict payload shapes and stable source IDs.** In `lib/translation-types.ts`, define discriminated, validated payloads for news, downloads, knowledge, home, catalog, contact, inquiry, and shared chrome. Payload validation must reject unknown resource types, unbounded text, non-local/non-HTTPS links, malformed arrays, and source/version mismatches. Keep non-translatable literal fields (asset URLs, model IDs, email/telephone URLs, legacy IDs) outside translated prose fields or mark them immutable in the validator.

- [ ] **Step 4: Move embedded Chinese public copy into canonical managed records.** In `lib/public-content.ts`, define the initial Chinese payloads extracted from `app/page.tsx`, `app/original-shell.tsx`, `app/catalog/page.tsx`, `app/contact/page.tsx`, and `app/inquiry/page.tsx`. Include nav/submenu labels, home intro and feature labels, catalog title/notes maps, contact labels, inquiry labels/help/validation copy, and common footer/chat chrome. Seed them with `INSERT OR IGNORE` in `seedLegacyContent`; do not overwrite an administrator-edited record when an isolate starts.

- [ ] **Step 5: Implement source and translation repository operations.** Add read APIs that return Chinese canonical payloads and public English payloads (`needs_review` or `published`), with a controlled Chinese fallback and an explicit `missing` marker. Add atomic write operations that increment a Chinese source version, mark an existing English translation outdated without changing its human payload, persist human edits/review/publication, and append audit records. Add job creation, deterministic source enumeration, item claim/update, and retry operations that are safe if an action is repeated.

- [ ] **Step 6: Keep runtime initialization idempotent.** Make `ensureInitialContent` invoke the expanded seed once per D1 binding as it does today, propagate actual seed errors, and retain the retry-on-error behavior.

- [ ] **Step 7: Run focused tests.** Run `npm test -- translation-repository.test.ts content-repository.test.ts`.

### Task 3: Make the existing content repository locale-aware without regressing Chinese behavior

**Files:**
- Modify: `lib/content-repository.ts`
- Modify: `lib/site-knowledge.ts`
- Modify: `tests/content-repository.test.ts`
- Modify: `tests/helpers/content-d1.ts`

- [ ] **Step 1: Extend existing tests first.** Add assertions that the no-locale APIs keep their exact Chinese output, English list/detail reads return only public English translation payloads, absent English uses the safe Chinese fallback while marked missing, and an outdated/human-edited record is not regenerated on a normal read.

- [ ] **Step 2: Add locale parameters and localized return types.** Keep current `listPublishedNews`, `findPublishedNewsByLegacyId`, `listPublishedDownloads`, and `retrievePublishedKnowledge` as Chinese-compatible entry points or wrappers. Add explicit `locale` variants that join/resolve `content_translations` without changing original IDs, images, video URLs, or publication status semantics.

- [ ] **Step 3: Localize knowledge retrieval correctly.** Update `retrieveSiteKnowledge` to require a locale and query the equivalent locale payload. Search terms should support English tokens and Chinese bigrams; return same-locale hrefs through `localizedPath`. A Chinese fallback may keep a page usable but must not be treated as English knowledge by the English chatbot.

- [ ] **Step 4: Update the D1 test double only for SQL it now supports.** Extend `ContentDatabase` for the precise translation joins/queries and job state mutations used by repository tests; do not make it a generic SQL emulator.

- [ ] **Step 5: Run content/retrieval tests.** Run `npm test -- content-repository.test.ts chat-retrieval.test.ts`.

### Task 4: Add the Groq translation service with literal protection and durable batch execution

**Files:**
- Create: `lib/groq-translation.ts`
- Create: `lib/translation-service.ts`
- Create: `tests/translation-service.test.ts`
- Modify: `.dev.vars.example`
- Modify: `README.md`

- [ ] **Step 1: Write failing translation-service tests.** Use a mocked fetcher to verify a valid structured English payload becomes `needs_review` and public; malformed/non-JSON Groq output is rejected; literal tokens restore exactly; a timeout/upstream failure records a retryable item failure; an already human-edited target is skipped; and one failed item does not cancel later queued items.

- [ ] **Step 2: Implement strict Groq translation requests.** Use the existing server-only `GROQ_API_KEY` and the existing Groq endpoint/model configuration; never expose it to the browser. Build a resource-specific system prompt requiring English-only JSON matching the payload schema. Replace protected literals with deterministic placeholders before sending and verify that every placeholder is restored exactly once after parsing. Set conservative request/time/token limits and return normalized error codes, not upstream error text.

- [ ] **Step 3: Implement one-item-at-a-time job processing.** `translation-service.ts` claims the next pending job item, fetches its current canonical source, skips stale/human-protected work, calls Groq, validates/persists the result atomically, and records success/failure counters. A request must process a bounded amount of work so it fits Worker execution; the UI can continue processing/polling until a job is complete. Retrying creates a new attempt for only the selected failed/outdated item.

- [ ] **Step 4: Document configuration and operational limits.** Clarify in `.dev.vars.example` and `README.md` that the existing `GROQ_API_KEY` powers chat and server-side English drafts, translation is initiated by an administrator, and a failed job is retried from `/admin`; do not add a second client-visible credential.

- [ ] **Step 5: Run focused tests.** Run `npm test -- translation-service.test.ts translation-repository.test.ts`.

### Task 5: Expose protected translation management in the existing administrator dashboard

**Files:**
- Create: `app/api/admin/translations/route.ts`
- Create: `components/translation-manager.tsx`
- Create: `components/translation-manager.module.css`
- Modify: `components/admin-dashboard.tsx`
- Modify: `components/admin-dashboard.module.css`
- Modify: `lib/analytics.ts`
- Create: `tests/translation-admin.test.ts`

- [ ] **Step 1: Write failing API and UI-state tests.** Cover unauthenticated rejection, admin-only access, list filtering, start/resume batch, single translation, retry after failure, English text edit, review, publish/unpublish, optimistic conflict, and audit action generation. Assert an `ai`/`needs_review` record is presented as public-but-unreviewed, not as published/reviewed.

- [ ] **Step 2: Implement the protected API.** Follow the existing `create*AdminHandler` pattern and current session lookup. `GET` returns pagination/filterable translation resources and jobs; `POST` starts a batch or processes one bounded next item; `PATCH` edits/reviews/publishes/unpublishes/retries a specific translation. Validate all payloads server-side and return only generic error codes. Require an authenticated enabled administrator for every operation and record each mutation in `admin_audit_log`.

- [ ] **Step 3: Add a dedicated translation view.** Add a `translations` navigation item to `AdminDashboard`, but keep Overview, Content, Leads, and Gaps unchanged. `TranslationManager` shows resource name/type, Chinese source excerpt, English state, source-version state, origin, last translated/reviewed times, and failure reason. It offers batch translate/resume, single translate/retry, English edit and preview, review, and publish/unpublish. Continue a running batch with bounded repeated requests; it must expose progress and allow a safe page reload/resume.

- [ ] **Step 4: Extend the dashboard snapshot intentionally.** Add only translation summary counts and any fields the component genuinely needs to `DashboardSnapshot`; keep analytics date-range data and content CRUD response contracts backward compatible.

- [ ] **Step 5: Run focused tests.** Run `npm test -- translation-admin.test.ts admin-auth.test.ts content-repository.test.ts`.

### Task 6: Refactor shared public chrome and home content into one locale-aware implementation

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/original-shell.tsx`
- Create: `components/public-home.tsx`
- Create: `app/en/page.tsx`
- Modify: `components/support-chat.tsx`
- Modify: `app/globals.css` and/or `app/fidelity.css` only if the language selector needs isolated styling
- Create: `tests/public-home-locale.test.tsx`

- [ ] **Step 1: Write rendering/link tests.** Render both locales and assert menu structure/count, alternate links, translated shared labels, homepage feature labels, agency/news links, footer/contact links, language selector destination, and passed locale to chat. Test that current Chinese URLs and CSS class names remain unchanged.

- [ ] **Step 2: Split data loading from client interactions.** Keep slide, mobile-menu, and carousel state client-side in `PublicHome`; let the route-level entry obtain localized public payloads and published news. Remove the current duplicated hard-coded menu/home content from React modules in favor of validated managed payloads, retaining image dimensions, asset URLs, layout classes, animation timing, and original links.

- [ ] **Step 3: Localize header/footer without creating a second UI.** Make `OriginalHeader` and `OriginalFooter` accept `locale` plus resolved chrome payload. Generate every internal href with `localizedPath`, preserve external social/map links, retain current mobile disclosure semantics, and place `LanguageSwitcher` in the existing language area. The selector must preserve the current query/hash and must not alter the current Chinese header layout beyond its text.

- [ ] **Step 4: Mount the English home route.** `app/en/page.tsx` invokes the same home implementation with `locale="en"`; `/` invokes it with `zh-TW`. Set page-level English title/description and language metadata in the wrapper/helper, not by duplicating the JSX.

- [ ] **Step 5: Localize chatbot chrome and lead capture text.** Give `SupportChat` a locale prop. Translate its welcome message, suggestions, errors, source label, privacy notice, lead buttons/form, validation/status text, and ARIA labels from the shared dictionary; include locale in chat/lead requests in later tasks.

- [ ] **Step 6: Run focused tests.** Run `npm test -- public-home-locale.test.tsx locale-routing.test.ts`.

### Task 7: Implement every English inner route using shared localized page modules

**Files:**
- Create: `components/public-inner-page.tsx`
- Modify: `app/catalog/page.tsx`
- Create: `app/en/catalog/page.tsx`
- Modify: `app/news/page.tsx`
- Create: `app/en/news/page.tsx`
- Modify: `app/downloads/page.tsx`
- Create: `app/en/downloads/page.tsx`
- Modify: `app/contact/page.tsx`
- Create: `app/en/contact/page.tsx`
- Modify: `app/inquiry/page.tsx`
- Create: `app/en/inquiry/page.tsx`
- Create: `tests/public-route-coverage.test.tsx`

- [ ] **Step 1: Write the exhaustive route matrix test before implementation.** Enumerate `/`, `/catalog?type=industry&id=73`, `/catalog?type=brand&id=127`, `/news`, `/news?id=3944`, `/downloads`, `/downloads?id=3853`, `/contact`, and `/inquiry?product=...`, then assert their `/en` equivalents render the matching resource rather than a blank/error page. Include `#news`, `#brands`, and `#contact` mapping on home.

- [ ] **Step 2: Share shell/breadcrumb/title primitives.** `PublicInnerPage` receives locale, canonical public path, title metadata, breadcrumb entries, and children; it uses `OriginalHeader`/`OriginalFooter`, localized `HOME` and inner titles, the unchanged sub-banner/asset dimensions, and reciprocal locale navigation. Do not change the original CSS layout.

- [ ] **Step 3: Localize catalog.** Replace the source-embedded catalog title/note maps with the managed `catalog` payload. Preserve each numeric `type`/`id`, existing image-selection mapping, product model names and numeric IDs, query-string behavior, and inquiry link; translate only reader-facing names/notes/buttons. The English product route remains the current catalog flow, not a redesigned product entry.

- [ ] **Step 4: Localize news and downloads from translated managed records.** Resolve translated title/lead/highlights/download title when public English exists; retain images, video URLs, legacy IDs, and download category behavior. Generate English links to `/en/news?id=...`, `/en/downloads?id=...`, and `/en/inquiry?product=...`. A missing English translation must show the controlled Chinese fallback and be discoverable in admin.

- [ ] **Step 5: Localize contact and inquiry.** Use managed page payloads for labels/help and current form behavior. Preserve `mailto:` and telephone targets, query product prefill, required fields, and original Chinese paths. English form copy is localised but does not introduce the deferred conversion redesign.

- [ ] **Step 6: Run route coverage tests.** Run `npm test -- public-route-coverage.test.tsx public-home-locale.test.tsx`.

### Task 8: Make chat, leads, and analytics locale-specific while preserving privacy guarantees

**Files:**
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/leads/route.ts`
- Modify: `lib/lead-service.ts`
- Modify: `lib/analytics.ts`
- Modify: `components/support-chat.tsx`
- Modify: `components/visitor-counter.tsx`
- Modify: `app/api/analytics/route.ts`
- Create: `tests/bilingual-chat-analytics.test.ts`
- Modify: `tests/chat-retrieval.test.ts`
- Modify: `tests/analytics.test.ts`
- Modify: `tests/lead-service.test.ts`

- [ ] **Step 1: Write failing locale-separation tests.** Verify an English request gets English-only prompt and sources, returned hrefs are `/en/...`, and Chinese content never leaks into an English answer merely because it matched. Verify invalid locale is rejected, no source produces the locale-appropriate fallback, and the existing origin/rate-limit/PII behavior remains intact. Verify `en` page view/chat/question/lead/download events are recorded and grouped separately from Chinese.

- [ ] **Step 2: Update the chat API contract.** Require a validated `locale` in the request body, select locale-specific system prompt/fallback, pass locale to retrieval, include `locale` in `/chat` analytics and question logs, and preserve the existing bounded history, origin validation, rate limit, and no-store responses. Do not use external knowledge.

- [ ] **Step 3: Update lead/analytics contracts safely.** Add a validated locale to lead context and event data, deriving it from the normalized source path rather than trusting arbitrary client text. Write that locale to the explicit migration columns on `site_events`, `chat_question_log`, and `chat_leads`; leave `safeMetadata` restricted to existing non-sensitive allowlisted fields. Update the dashboard snapshot to provide per-locale totals/rankings and unanswered question locale without retaining extra visitor data.

- [ ] **Step 4: Send locale from public components.** `SupportChat` and `VisitorCounter` call the unchanged endpoints with the current locale; `publicAnalyticsPath` keeps the locale prefix so individual top-page URLs remain interpretable. The visible visitor counter remains total-site unless the design explicitly chooses a locale split.

- [ ] **Step 5: Run focused privacy and behavior tests.** Run `npm test -- bilingual-chat-analytics.test.ts chat-retrieval.test.ts analytics.test.ts lead-service.test.ts`.

### Task 9: Emit localized SEO metadata and sitemap coverage

**Files:**
- Create: `lib/locale-seo.ts`
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `app/catalog/page.tsx`
- Modify: `app/news/page.tsx`
- Modify: `app/downloads/page.tsx`
- Modify: `app/contact/page.tsx`
- Modify: `app/inquiry/page.tsx`
- Create: `app/en/layout.tsx`
- Create: `app/sitemap.ts`
- Create: `tests/localized-seo.test.ts`

- [ ] **Step 1: Write SEO tests.** Assert Chinese and English page metadata supplies its matching title/description, canonical URL, and reciprocal `zh-Hant`/`en` alternates. Cover query detail pages (`news?id=3944`, `downloads?id=3853`, catalog representative IDs), assert no duplicate cross-locale canonical, and assert sitemap includes the complete public route matrix for both locales.

- [ ] **Step 2: Centralize metadata construction.** `locale-seo.ts` derives absolute URLs from one configured site origin, uses locale-aware titles/descriptions from content/dictionaries, returns canonical plus `languages` alternates, and sanitizes path/query input through `localizedPath`. Retain existing OpenGraph/Twitter imagery and provide localized alt/title text where supported.

- [ ] **Step 3: Add route metadata and document language.** Each route wrapper exports/generates metadata through the helper. Use `app/en/layout.tsx` and, if required by Vinext’s rendered markup, the locale document attribute component from Task 1 so English pages are announced as English without invalid nested `<html>` markup.

- [ ] **Step 4: Generate a deterministic sitemap.** List static pages and current published news/download detail URLs in both locales. Include only public content; preserve legacy query IDs. Do not include admin/API routes, draft-only records, or arbitrary user query strings.

- [ ] **Step 5: Run focused tests.** Run `npm test -- localized-seo.test.ts public-route-coverage.test.ts`.

### Task 10: Add release-grade bilingual smoke coverage and documentation

**Files:**
- Create: `scripts/smoke-bilingual-local-worker.mjs`
- Modify: `scripts/smoke-local-worker.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-09-bilingual-site-design.md` only if implementation reveals a required non-product decision
- Create: `tests/bilingual-release-contract.test.ts`

- [ ] **Step 1: Write the release contract test.** Make a single route inventory the source of truth for the Chinese/English coverage tests, sitemap assertions, and smoke script. Assert every listed path responds, all language selector hrefs are same-origin, local asset/image URLs retain their resolution/original paths, internal links avoid 404s, and key English/Chinese controls retain accessible labels.

- [ ] **Step 2: Implement an isolated Worker smoke script.** Follow `scripts/smoke-local-worker.mjs` conventions: use a temporary sentinel-only local `.dev.vars` only when safe, an isolated D1 state, ordered migrations including `0003`, a mocked/no-network translation path where necessary, and guaranteed cleanup. Smoke both locales, representative query routes, API rejection of malformed locale, a controlled missing-English fallback, and a successful English source-link response using a mocked Groq transport. It must not touch production D1 or secrets.

- [ ] **Step 3: Update operations documentation.** Add migration `0003`, translation job launch/resume/review instructions, English public-draft behavior, locale-aware test commands, and deployment prerequisites to `README.md`. State clearly that a verified Resend sender remains a separate pre-existing production prerequisite.

- [ ] **Step 4: Run the full required validation suite.** Run, in this order:
  1. `npm test`
  2. `npm run lint`
  3. `npm run build`
  4. `git diff --check`
  5. `npm run test:local-worker-smoke`
  6. `node scripts/smoke-bilingual-local-worker.mjs`

- [ ] **Step 5: Perform the final manual review.** With the local Worker, check desktop and mobile Chinese/English home navigation/submenus, carousel animation, each inner route family, language switching with query/hash, news/download details, contact/inquiry flow, chatbot source links, lead form, visitor counter, and the translation dashboard. Compare CSS class/layout/image intrinsic dimensions against the Chinese baseline and record any intentional locale text-wrap differences.

- [ ] **Step 6: Execute the controlled initial English draft run after release.** Only after the Sites deployment applies migration `0003`, sign in as the allowlisted administrator, start the `untranslated_or_outdated` batch, and continue it until every job item is terminal. Confirm every successful English item is publicly reachable as `needs_review`, record failed items for retry, and perform a non-sensitive Chinese/English production smoke test. Do not claim the English rollout complete if a queued or failed translation remains.

## Final Acceptance Checklist

- [ ] All six public route families, their current query variants, and home anchors work in Chinese and `/en` English.
- [ ] English content is Groq-generated from Chinese, visible immediately as `needs_review`, editable/reviewable by the administrator, and never overwrites human English.
- [ ] Translation batches survive a failed item, can resume/retry, and expose actionable status/audit history.
- [ ] English chatbot answers only from public English knowledge and returns English counterpart source links.
- [ ] Dashboard metrics and unanswered questions can be compared by locale without weakening existing privacy rules.
- [ ] Every page has locale-appropriate metadata/canonical/hreflang and sitemap inclusion.
- [ ] Existing Chinese behavior, images, routes, animations, and admin/analytics/lead controls pass regression tests.
- [ ] Full test, lint, build, diff, and both local Worker smoke suites pass before a Sites deployment is considered.
