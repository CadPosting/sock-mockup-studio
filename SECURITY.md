# Security

Sock Mockup Studio runs entirely in the browser. There's no backend, no login, no database and no analytics. It doesn't make network calls after the page has loaded, apart from fetching its own font files. Client logos and mockups never leave the machine unless someone saves or emails a file themselves.

That leaves two ways in for untrusted data, and they get the most attention below:

1. **Uploaded logos** (PNG, JPEG, SVG).
2. **Opened `.sockmockup.json` files**, which may come from someone else, or may have been edited by hand.

Last checked: 2026-10-16 (engineering plan, task 20, then again after an adversarial review found two bypasses in the first version of the SVG cleaner; both are fixed and covered by tests).

## Results

| Check | Result | Evidence |
|---|---|---|
| CSP and security headers served | Pass | `curl -I` on the preview; `e2e/security.spec.ts` "the live preview sends the security headers" |
| The whole app runs under the CSP with no violations | Pass | All e2e tests run against `vite preview`, which serves the same headers as Vercel. Any console error, CSP violation, HTTP error or blocked/failed request fails the test. |
| Malicious SVG logo (`<script>`, `onload`, `javascript:` iframe in `foreignObject`) never runs | Pass | `e2e/security.spec.ts`: upload, place on the sock, export PNG and PDF. No dialog, no global set, no CSP report, no failed request. The **stored** SVG is decoded and checked clean, so the test doesn't just rely on the image sandbox. |
| SVG cleaning keeps only known drawing elements and attributes | Pass | `tests/unit/sanitize.test.ts`, including the bypasses found in review: namespace-prefixed `script`/`set`/`style`, re-prefixed XLink `href`, upper-case elements, CSS escapes (`@im\70ort`, `u\72l(`), comments and CDATA |
| Restored drafts get the same validation and cleaning as opened files | Pass | `tests/unit/store.test.ts` |
| Renamed `.exe` rejected as a logo | Pass | `tests/unit/upload.test.ts`, `e2e/flows.spec.ts` |
| Tampered file: HTML in the title, specs or labels shows as plain text | Pass | `e2e/security.spec.ts`, `tests/unit/header.test.ts`, `tests/unit/render.test.ts` |
| Tampered file: HTML disguised as an SVG image is refused whole | Pass | `e2e/security.spec.ts`, `tests/unit/review-fixes.test.ts` |
| Tampered file: bad IDs, broken mirror links, fake base64, wrong image type, unknown fields | Rejected | `tests/unit/schema.test.ts`, `tests/unit/review-fixes*.test.ts` |
| No `innerHTML` or other HTML sinks with data | Pass | `grep` below finds nothing in `src/` |
| No secrets in the code; `.env*`, `docs/` and client fixtures not committed | Pass | `grep` and `git ls-files` below |
| Dependencies | 0 known vulnerabilities | `npm audit` (production and dev), see below |

## How each part is protected

### Uploaded logos (`src/io/upload.ts`)

- **The type comes from the file's own first bytes**, never from its name or what the browser claims. PNG must start `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`, and an SVG must be an XML document whose root is `<svg>`. Anything else gets "Only PNG, JPG or SVG logos."
- **10 MB maximum**, checked before the file is read.
- **SVGs are rebuilt from an allowlist** before they're stored (`sanitizeSvg`). The browser's XML parser reads the file; it doesn't run scripts or fetch outside entities, so XXE isn't possible. Then a brand-new SVG is built that contains only:
  - **known SVG drawing elements** (shapes, groups, text, gradients, patterns, clip paths, masks, filters, `<style>`), matched by namespace URI and local name, so prefix tricks and upper-case names can't get through. There's no script, animation, `foreignObject`, iframe, link or media element at all;
  - **known presentation attributes.** No `on…` handler can ever be copied;
  - **references** (`href`, `xlink:href`, CSS `url()`) only to an internal `#id` or an embedded `data:image/png|jpeg|gif|webp`. Any other `<image>` is dropped whole;
  - **CSS that's been decoded first.** Escapes and comments are resolved before checking, every at-rule (`@import`, `@font-face`…) is removed, and the result is written back as plain text.

  The root must be an `<svg>` in the SVG namespace, or the file is refused. Cleaning also stops a logo from "tainting" the export canvas, which would otherwise break PNG export.
- **Logos are only ever drawn through `<image href="data:…">`.** Browsers don't run scripts in an image loaded that way. That would still hold if the cleaning ever missed something.
- **For the PDF only, SVG logos are drawn to a PNG first,** because the PDF library ignores an SVG's own styles. This happens in the browser, from the already cleaned image.

### Opened files (`src/model/schema.ts`, `src/editor/start-dialog.ts`)

- Parsed with `JSON.parse`, then validated in full by a zod schema. One bad field rejects the whole file, so a broken file can never half-load over the current mockup. The message is "This file isn't a Sock Mockup Studio file (or it's damaged)."
- Beyond the schema, `migrate()` also checks that:
  - IDs are unique plain tokens (`[A-Za-z0-9_-]`);
  - every mirror link pairs exactly one original with one copy;
  - every asset reference exists;
  - every embedded image is real base64 whose first bytes match its declared type.
- SVG logos inside an opened file get the same cleaning as uploads (`src/io/clean.ts`), and every embedded image must decode before the file is accepted.
- Size cap: 60 MB per file. Spec rows (40) and placements (100) are capped, and the editor enforces the same caps, so it can never produce a file it would later refuse.

### Text (spec lines, titles, labels, wordmarks, client name)

All user text reaches the page as text nodes (`textContent`) or SVG text, never as markup. The editor's DOM helper (`src/editor/dom.ts`) only creates elements and text nodes.

### Autosaved draft

The draft in IndexedDB goes through the same `migrate()` and SVG cleaning as an opened file. A damaged draft is reported and ignored, never loaded.

## Headers

Set in `vercel.json`. `vite.config.ts` reads the same file, so `vite preview` serves identical headers and every end-to-end run tests the real policy.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; img-src 'self' data: blob:;
  font-src 'self' data:; style-src 'self'; connect-src 'self'; object-src 'none';
  base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none';
  manifest-src 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), payment=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

Notes:
- There's no `'unsafe-inline'` or `'unsafe-eval'` anywhere. Styles the app sets from script use the CSSOM (`element.style`), which `style-src 'self'` allows. The `<style>` inside an exported SVG belongs to a separate image document, so the page's policy doesn't apply to it.
- `img-src data: blob:` is needed for embedded logos and for the export path (SVG → blob URL → canvas).
- No third-party scripts, styles or fonts are loaded, so there's nothing that needs SRI.

## Not applicable

There's no server, accounts, cookies, sessions, tokens, database, redirects or outbound requests. That rules out access control/BOLA, CSRF, SQL injection, SSRF, open redirects, JWT, OAuth, CORS, rate limiting and password storage. These need a fresh review if a backend is ever added (PRD v2 mentions a shared preset library).

## Dependencies

- `package-lock.json` is committed, so installs use exact, reviewed versions.
- New packages were checked before installing: publisher, licence, and publish date (nothing newer than two weeks).
- Runtime: `jspdf`, `svg2pdf.js` (loaded only on the first PDF export), `zod`, `idb-keyval`, and the `@fontsource` font files (OFL licence).
- On 2026-10-16, Vitest went from 3.2 to 4.1.11 to clear a critical `tinypool` and a moderate `@vitest/mocker` advisory. Both were development-only and never shipped to users. 4.1.12 was skipped because it was published the day before.

## Re-running the checks

```bash
npm test                     # unit tests (Vitest), including schema, upload and sanitizer tests
npx playwright test          # end-to-end in Chrome under the live CSP, including e2e/security.spec.ts
npm audit                    # expect: found 0 vulnerabilities
curl -sI http://localhost:4180/ | grep -iE "content-security|x-frame|nosniff|referrer|permissions"   # after: npm run build && npx vite preview --port 4180
grep -rnE "innerHTML|outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function" src   # expect: comments only
git ls-files | grep -Ei "\.env|fixtures/reference|^docs/"   # expect: nothing
```

## Reporting a problem

This is an internal hipSwan tool. Send security issues to Ramzan directly, not in a public issue.
