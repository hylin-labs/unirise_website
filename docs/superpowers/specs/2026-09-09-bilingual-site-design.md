# Unirise Bilingual Website Design

## Goal

Add complete Traditional Chinese and English support to every existing public
Unirise page. Traditional Chinese remains the default. English is generated
from the current Chinese content with Groq, published immediately as an AI
draft, and remains editable in the existing administrator experience.

## Scope

Included:

- A Traditional Chinese and English version of every existing public route.
- English routes under `/en/...`, including matching legacy query parameters,
  news IDs, download IDs, and anchors.
- Localized navigation, common interface copy, forms, validation messages, chat
  messages, page metadata, sitemap entries, and language selectors.
- Managed bilingual records for news, downloads, chatbot knowledge, and public
  content that is currently embedded in page source.
- A private translation-management view for batch translation, translation
  status, review, retry, publish, and source-version visibility.
- Groq-generated English drafts that are immediately publicly available.
- Locale-specific chatbot retrieval, analytics, and SEO.

Explicitly deferred:

- A redesigned English product or solution entry point.
- English download and quote-conversion redesign.
- Additional languages.

## Language and Routing

- Existing Chinese URLs stay unchanged and remain canonical for `zh-TW`.
- Every public route has an English equivalent using `/en` as its prefix. For
  example, `/news?id=3944` maps to `/en/news?id=3944`.
- Language switching sends a visitor to the equivalent route in the selected
  locale. The Chinese version is used when an English counterpart cannot be
  resolved safely; no route presents a blank page or broken language link.
- The current locale is persisted for future navigation without auto-redirecting
  a visitor away from a direct shared link.
- Each localized page supplies its own title, description, canonical URL, and
  reciprocal `hreflang` links. The sitemap includes both locales.

## Content Model

Static UI strings live in versioned Chinese and English locale dictionaries.
Managed and public page content uses locale-aware records rather than duplicate
page implementations. A translation record contains:

- its source resource and locale;
- a structured content payload;
- `draft`, `needs_review`, or `published` state;
- the source-content version and translation timestamp; and
- optional reviewer and review timestamp.

The initial migration preserves the Chinese source as the authority. A Groq
batch produces English records, marks them `needs_review`, and publishes them
immediately. Future Chinese updates do not overwrite edited English content;
they instead mark the related English record `needs_review` with its outdated
source version.

Technical names, brand names, model identifiers, measurements, phone numbers,
email addresses, URLs, and download links remain literal. Only reader-facing
Chinese prose is translated.

## Administrator Workflow

The existing allowlisted, email-code administrator login remains unchanged.
The private translation-management area provides:

1. A resource list with Chinese source, English state, source-version status,
   most recent translation time, and failure reason where applicable.
2. A batch action that translates all untranslated or outdated public content,
   persists progress, and can safely resume after a failure.
3. Single-item translation, retranslation, preview, English editing, and
   publish/unpublish actions.
4. Clear distinction between AI-generated public drafts and reviewed English.

English drafts are deliberately public immediately, per the approved product
decision. Administrators retain complete edit, publication, and retry control.

## Chatbot and Analytics

- Chinese chat retrieves only published Chinese knowledge. English chat retrieves
  only published English knowledge and answers in English.
- The chat UI uses the selected locale and keeps source links in the same
  locale where a counterpart exists.
- Analytics records the locale using non-sensitive metadata. The dashboard can
  compare visits, chat questions, unanswered questions, downloads, leads, and
  conversion by locale.
- Existing privacy controls, HMAC visitor identifiers, request limits, and the
  90-day chat-question retention rule apply unchanged to both locales.

## Failure Handling

- A failed Groq translation records a safe failure state and preserves the
  Chinese source; an administrator may retry it.
- Translation never blocks the existing Chinese route or its content.
- A missing English content item uses a controlled Chinese fallback only when
  needed to keep the matching shared route usable; it is flagged in the admin
  translation list for completion.
- English records cannot silently replace human-edited English when the Chinese
  source changes.

## Validation

- Route coverage tests enumerate every existing public Chinese route and its
  English counterpart, including news/download query IDs and anchors.
- Unit and integration tests cover locale routing, persistent language choice,
  translation state transitions, source-version invalidation, batch resume,
  human-edit preservation, and safe retry.
- Chat tests verify locale-specific retrieval and source links.
- SEO tests verify localized metadata, canonical URLs, `hreflang`, and sitemap
  coverage.
- Administrator tests verify protected translation actions and public behavior
  for immediately published AI drafts.
- Build, full lint, full test suite, and bilingual local Worker smoke checks
  must pass before release.

## Acceptance Criteria

The phase is complete when every current public Chinese page has a usable
English `/en/...` equivalent; language switching works across every route;
English AI drafts are publicly visible and editable by the administrator;
English chat retrieves English sources; localized SEO is emitted; and no
existing Chinese route, legacy link, or current privacy control regresses.
