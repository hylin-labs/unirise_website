# Design QA — Unirise reproduction

## Visual truth

- Source: `http://www.unirise.tw/index_tw.php` and linked original pages.
- Prototype: `http://localhost:3000/` and local routes under `/catalog`, `/news`, `/downloads`, `/inquiry`, and `/contact`.
- Desktop comparison viewport: 1280 × 720 in the Codex in-app browser.
- Mobile prototype viewport: 390 × 844. A same-viewport source capture could not be completed because the original-site tab remained at the desktop viewport in the in-app browser.

## Verified matches

- Desktop homepage geometry matches the measured source: 146 px header, 560 px hero at 1280 px wide, 580 px overview, 450 px service panels, and a total page height of 3503 px.
- Navigation widths, brand carousel cards, news-grid spacing, footer columns, icons, and copyright treatment were corrected against the source.
- Exact source assets are used for the logo, desktop and mobile hero images, overview graphic, four service images, homepage brand images, news images, subpage banner, footer artwork, and the representative FSCAN-4350G product image.
- Desktop hero and agency carousels advance. The mobile main menu and the industry, brand, and download submenu controls expand and expose their links.
- The representative news route embeds its source YouTube video. The download category, inquiry form, catalog route, contact route, social links, telephone, email, and map links are reachable.
- All 98 captured internal route variants returned HTTP 200 in the route audit. All 31 locally referenced source assets existed. Representative homepage, news, downloads, inquiry, and catalog checks produced no browser-console errors.
- The production build completed successfully for all six application routes.

## Remaining parity findings

### P1 — Product catalog source data is incomplete

The public source exposes many product-category and product-detail pages. Their menu names and local URLs are implemented, but most pages do not yet contain the exact original product lists, specifications, body copy, and product-specific photography. The source began returning HTTP 403 during bulk asset collection. The representative `brand&id=127` page now uses the exact original photograph and product title, but it does not establish parity for the rest of the catalog.

### P1 — Original downloadable files are unavailable locally

All four download categories are reachable, but the prototype currently routes users to the inquiry form instead of serving the original downloadable documents. Exact parity requires the original files or a CMS/site export.

### P2 — Inner-page templates are source-styled, not literal CMS mirrors

News, contact, inquiry, and download pages share the original header, sub-banner, breadcrumb, typography direction, colors, and footer. Their body layouts and some text remain reconstructed rather than byte-for-byte reproductions of the original CMS output.

### P2 — Mobile source comparison is incomplete

The prototype is responsive with no horizontal overflow and selects the exact 1200 × 600 mobile hero asset. The in-app browser did not apply the 390 × 844 override to the original-site tab, so a controlled source-versus-prototype mobile screenshot comparison remains outstanding.

## Required evidence to reach exact page-for-page parity

- Original CMS, FTP, or static-site export including product records, product-detail copy, documents, and all original-resolution media.
- A mobile source capture from a browser that can reliably apply the same viewport to both sites.

## Final result

blocked
