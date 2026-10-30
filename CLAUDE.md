# MTGlobal website: notes for Claude

The company website of Công ty TNHH Công nghệ Mễ Trì Global, in Vietnamese and English, with an admin area. The owner is not a developer: write to them in plain language.

## Stack
- Node.js (≥18; the tests need ≥22) with Express 5 and EJS templates.
- MongoDB through mongoose; sessions are stored in Mongo (connect-mongo).
- Uploads go through multer to `public/uploads/`, or to Cloudinary when `CLOUDINARY_*` is set.
- No front-end build step: plain CSS and JS in `public/`.

## Where things are
| Path | What |
|---|---|
| `server.js` | app setup, `app.locals` helpers, video guard, routes |
| `routes/` | `index.js` (public pages), `auth.js` (login/register/profile), `account.js` (`/tai-khoan`: my requests), `admin.js` (`/admin/*`) |
| `views/` | public pages; `views/partials/` (header, footer, cards, `solution-section.ejs`, …); `views/admin/` + `views/admin/partials/` |
| `lib/` | logic: `solution-pages.js` (default Giải pháp pages), `dashboard.js`, `home-domains.js`, `project-levels.js`, `help-topics.js` (Hỗ trợ page groups + starter questions), `i18n.js`, `text.js`, `validators.js`, `db-guard.js` (503 "tạm gián đoạn" page while MongoDB is down), `error-log.js` (server errors → Admin → Nhật ký lỗi + alert email through `mailer.js`), `request-mail.js` (new/changed request → staff list in Cài đặt chung + sender's confirmation), `request-throttle.js` (guests: 5 requests an hour; 3 confirmations a day per address), `page-views.js` (own visit counter → Tổng quan "Lượt xem trang"), `chat-links.js` (Zalo / Messenger button), … |
| `models/` | mongoose models (Article, ErrorLog, HelpItem, LoginThrottle, PageView, Partner, Product, Project, QuoteRequest, Service, SiteSettings, SolutionPage, User) |
| `locales/vi.json`, `locales/en.json` | every UI text, in both languages; add new keys to both |
| `public/js/` | `main.js` (website), `admin.js` (admin), `theme.js` |
| `scripts/` | `seed.js`, `make-admin.js`, `release.js`, `make-icons.js` (tab icon + `favicon.ico` from the logo), data scripts |
| `tests/` | browser tests (see below); the pre-launch test report: see "Real-world test campaign" |
| `.claude/skills/security-audit/` | Cloudflare's security-audit skill (MIT, copied from commit `c1c8a8c147`): guidance by default, a full audit only when asked; its results go to `~/security-audit-skill/`, never into the repo |

### CSS (`public/css/`)
| File | Holds |
|---|---|
| `theme.css` | colour and size tokens (light + dark) |
| `base.css` | reset, `.container`, buttons, `.sr-only`, the `--anim` speed token |
| `layout.css` | header and menus, page banner, sections, footer, theme switch, phone menu drawer |
| `components.css` | card grids, partner tiles + partner page, timeline, forms + password eye, galleries, prose text, profile, tables/tags, key-fact tiles, coming soon |
| `home.css` | home hero, pillar cards, "Lĩnh vực hoạt động" slider |
| `pages.css` | Giải pháp pages (jump menu, folds, tabs, process trail, "Khám phá thêm", CTA band), Dịch vụ, STEM equipment, projects/news search, Hỗ trợ page |
| `admin.css` | the whole admin area, dashboard charts included (loaded by `views/admin/partials/head.ejs` only) |

Each file ends with its own `@media` rules. Grep for a selector first, then read only that part of the file.
Pages load them as one file: `/css/site.css` (admin: `/css/admin-all.css`), joined by `lib/assets.js` in the order fonts, theme, base, layout, components, home, pages (+ admin). A new CSS file must be added to `SITE_CSS` there. The font (Be Vietnam Pro) is self-hosted in `public/fonts` (`fonts.css`).

### Speed helpers (views)
- Photos: `<%- picture(src, alt, { sizes, eager }) %>` (`lib/picture.js`) writes `srcset` with lighter copies (`?w=480…1600`, WebP, made by `lib/images.js` into `cache/images`, not in git). Use `eager: true` only for pictures on the first screen. One address at a width: `resized(src, 320)`.
- Style/script links: `<%= asset('/js/main.js') %>` adds a content fingerprint, so production can cache them for a year.
- Compression, cache rules and security headers (`lib/security-headers.js`, CSP with a per-page nonce: inline `<script nonce="<%= cspNonce %>">`) are set in `server.js`.

## Running
- `npm run dev` runs on **:3000**. This is the owner's server: never stop or restart it.
- For your own checks use **:3001**: start `PORT=3001 node server.js` in the background, and stop it when done (`netstat -ano | findstr :3001`, then `taskkill /PID <pid> /F`). `npm test` starts and stops it by itself.
- Database: `mongodb://localhost:27017/mtglobal_db` (`MONGO_URI` in `.env`).
- "Đăng nhập bằng Google" (`lib/google-auth.js`) needs `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env`; without them the button is hidden. `npm test` gives its server fake keys and `GOOGLE_OAUTH_TEST_URL` (the fake Google of `tests/lib/fake-google.mjs`, :3002).
- `.env`, `public/uploads/*` and `source-assets/` are not in git: never commit them or any secret.

## Tests
- `npm test` runs every `tests/*.test.mjs` in headless Chrome against :3001. It prints only failures, then one line: `N passed, M failed (… files, …s)`.
- `npm test -- dashboard nav` runs only the files whose names match. `--verbose` also shows passes. `--shots` saves screenshots to `tests/output/` (gitignored).
- A failing file is run once more; if it passes then, it is reported as "flaky".
- **Test files:**

  | File | Covers |
  |---|---|
  | `home` | home "Lĩnh vực hoạt động" slider (wheel, drag, arrows, read as a list), "← Về trang chủ" and "← Quay lại" links |
  | `nav` | header dropdowns, keyboard, account menu, phone drawer (Esc, Tab stays in the header, aria-expanded); theme switches, admin toasts, dark-mode contrast; tab icon (favicon) |
  | `solutions` | Giải pháp menu, pages, assets, /giai-phap landing, STEM Lab page, "Khám phá thêm", equipment tabs + search, process trails |
  | `projects-news` | project school levels + searches, news search |
  | `partners` | partner strips, partner pages, partner admin, tile rows + hover |
  | `services` | request forms (contact, robot pages), requests without an account (robot trap box, 5 an hour, login back to the form), thank-you card, changing a sent request, message limit + "too long" page (413), an empty POST answers 400 (not 500), Dịch vụ landing |
  | `mail` | request emails: Cài đặt chung → "Email thông báo", staff email (Reply-To the sender), sender's confirmation (VI/EN, no typed text, 3 a day), changed request, written to `tests/output/mail` |
  | `visits` | visit counter (what counts: browsers on public pages, not staff/robots/admin) and Tổng quan "Lượt xem trang" (total, day bars, top pages, pages that bring requests); takes its views off afterwards |
  | `chat` | Zalo / Messenger button: Thông tin công ty fields, menu (Enter, Esc, click outside), one-link button, footer + Liên hệ links, phone, drawer, dark, print |
  | `media` | watch-only videos, "Sắp ra mắt" overlay |
  | `help` | Hỗ trợ page (groups, search, topic tiles, `#q-…` links, phone width), links to it (footer, account menu, forms, Hồ sơ), Admin → Hỗ trợ (group tabs, add/edit/hide/order within a group/delete, search across groups) |
  | `accounts` | password eye, profile page, role badge, avatar size, "Xóa ảnh", sign-up checks, login notice |
  | `google` | "Đăng nhập bằng Google" (fake Google on :3002): new account, sync at each login, joining an email account, cancel / forged return, photo delete, first password |
  | `dashboard` | dashboard numbers, charts, animations, hover; random sample requests each run (`DASH_SEED=<n>` repeats one; a failure shows its seed) |
  | `admin-lists` | permissions, notifications, drag order, list search, filter chips, request delete, delete dialog, admin menu scroll + ☰ slide-in menu (≤960px), users by role, user list owners first + "Tìm theo" search/sort |
  | `admin-editor` | admin sidebar, Giải pháp page editor, Cài đặt chung, Thông tin công ty, plain-text content |
  | `a11y` | axe-core on one page of each kind (VI + EN, logged out and in) and /admin: heading levels in order, card pictures with `alt=""`, clean lists, no controls inside the pie pictures, spoken names that start with the visible text, named columns on the admin lists; keyboard focus ring on form fields, search boxes, partner logos, videos |
  | `errors` | error log: a failing page (`/__test/boom`, test server only) is saved once and counted, one alert email an hour (written to `tests/output/mail`), Admin → Nhật ký lỗi (badge, dashboard notice, Đã xem, Xoá), 403 for customers |
  | `print` | print layout (`b.printMedia()`), light + dark: no menu/buttons/footer links, black on white, Giải pháp pages whole (folds opened on `beforeprint`, every photo tab, full process trail) |
- Settings changed in a test must be put back through an admin save (see `restoreSettingsNow` in `admin-editor.test.mjs`): the server caches site settings.
- Tests use the dev database, but only with temporary data:
  - temp users `zztest-…@example.com` (`createUser`);
  - records named `ZZ …` (`removeLater`);
  - documents a test edits are saved first and put back afterwards (`restoreLater`).
- **A new test file** is `tests/<area>.test.mjs`:
  ```js
  import { suite, check, createUser } from './lib/index.mjs';
  await suite(async (b) => {            // b = the browser: nav, ev, clickAt, hover, viewport, shot, login, …
    await b.nav('/');
    check('home has a hero', await b.ev(`!!document.querySelector('.home-hero')`));
  });
  ```
- After a change, run the matching test file(s); run the full `npm test` before a release.
- The owner's PC has "reduced motion" on, so check animations with `b.reducedMotion()` too.

## Real-world test campaign (`npm run qa`)
**The report: always load it.** At the start of every session, open the artifact "MTGlobal Pre-launch Test Report" (https://claude.ai/artifact/4GqH7cV5oNUsiH7m8SqdrY) with the Artifact tool, `action: "read"`, so you know the open findings when the owner mentions one. The page is large: read the saved copy in parts. Search it for a finding's title, or for `"severity"` to list the findings. Never read it whole.
- It is built from `tests/output/qa/report/index.html` (`node tests/qa/build-report.mjs`). After a fix:
  - add an entry to `tests/output/qa/fixes.json` (title, id, severity, on, reason, consequence, how, evidence)
  - re-run the use case (`npm run qa -- --only <n>`)
  - rebuild, then republish to the **same** URL (Artifact publish with `url`)
- The artifact is private. Keep its content (security findings) out of git and out of README.

- `tests/qa/run.mjs` runs the scenarios in `tests/qa/scenarios/*.mjs` (smoke, load/stress/spike/endurance, forms, sessions, links, accessibility, browsers, print, page speed) against its own MongoDB on :27018 (`tests/output/qa/mongo-data`, content copied from the dev database, made-up accounts and requests) and its own site on :3001. It never touches :3000 or the dev data.
- Progress is saved in `tests/output/qa/progress.json` after every step: `--status`, `--resume`, `--only 26,29`, `--restart 29`, `--pause` (or Ctrl+C). `QA_FAST=1` shortens the long runs (for testing the checkpoints).
- `node tests/qa/build-report.mjs` turns the results into `tests/output/qa/report/index.html` (template `tests/qa/report.html`). Results and the report stay out of git (the repo is public; security findings).
- Don't run `npm test` and `npm run qa` at the same time (both use :3001).

## Commits and releases
- **Commit only when the owner asks.** Each commit is a version: the first was 1.0.0, and each later one adds 0.0.1 (one tag + GitHub Release per commit), unless the owner names a bigger version: then add `--version X.Y.Z` to the release command (1.1.0 = every security, critical and major fix from the pre-launch test).
- Routine:
  1. Add a `## [Unreleased]` section at the top of `CHANGELOG.md` (under the intro and `---`). Use `### Added` / `### Changed` / `### Fixed` / `### Removed`, in plain words for business readers.
  2. Screenshots (from 1.0.10 on): for visible changes, copy 1–3 small JPGs from `tests/output/` to `docs/screenshots/<next version>/` and link each under the item it shows, by relative path (`![…](docs/screenshots/1.0.10/x.jpg)`). The script makes them work on the Release page and stops if one isn't staged. The repo is public: no admin pages with real customer data.
  3. Stage the changed files with `git add <files>`, never `git add -A`.
  4. Run `npm run release -- -m "<two plain sentences>" --session <Claude-Session url>`. Try `--dry-run` first.
- The script dates the section, sets the version in `package.json`, and commits with this trailer:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <this session's url>
  ```
  It then tags `vX.Y.Z`, pushes `main` and the tag, and creates the GitHub Release. Each release's notes hold the whole changelog from that version down to 1.0.0.
- `node scripts/release.js --notes-only 1.0.7` prints one release's notes, so an older release can be rebuilt with `gh release edit`.
- Repo: https://github.com/KClabio/MTGlobal (public). Branch `main`.

## Habits that keep sessions short
- Grep before reading; read files in parts with offset and limit.
- Don't re-read a file you just edited.
- Prefer one test file over the whole suite while working.
- Take screenshots only when the owner needs to see a visual change.

## Learn by mistake
When a mistake or error turns up (a failing test, a crash, something the owner spots, a wrong assumption of mine):
1. Fix it, and add a test that would have caught it.
2. Add one line to "Lessons" below: what went wrong → what to do instead. Merge it with a similar line rather than adding a near-copy.
3. Before starting similar work, read the lessons and follow them.
4. Never describe a security weakness here (the repo is public): those go in the private QA report only.

### Lessons
- **Phone width with real data:** a new admin panel passed its test but was 421 px wide on a 390 px phone, because the test only had short page addresses. Test new panels and pages at 390 px with long, realistic data.
- **Test data left behind:** a run on 28 October left 8 `ZZTEST-forms-…` requests in the dev database. Every record a test makes must be covered by `removeLater` or `restoreLater`. After a run, check that no `ZZ` data is left.
- **Admin forms keep what they don't send:** a test's settings restore posted Thông tin công ty without the new Zalo/Messenger boxes and would have wiped them. When a form gains a field, its save keeps the stored value when the field isn't posted.
- **Compare saved objects with defaults:** a test comparing a whole saved object broke when the model gained a field. Compare with the new defaults filled in, or compare only the fields that matter.
- **Empty POST bodies:** in Express 5, `req.body` is undefined for a POST without data, and every form crashed. `server.js` now turns it into `{}`: keep that line.
- **Editing files from the shell:** Bash/Python heredocs turned `\n` and `\r` into real line breaks, and CRLF files got mixed endings. Edit with the Edit tool, or write the editing script with the Write tool, and keep the file's line endings.
- **sharp:** in one chain `trim()` runs before `extract()`. Crop first, then trim in a second step.
- **QA page lists:** the crawler picked up a font file as a "page" and the accessibility scan stopped. Page lists skip non-page files (`tests/qa/lib/pages.mjs` `SKIP`).
- **Postman MCP:** form fields (`urlencoded`) inside folders are dropped when a collection is saved. Use raw bodies with a `Content-Type: application/x-www-form-urlencoded` header.
- **"It doesn't show" may be missing data:** the chat button seemed broken, but its Zalo/Messenger boxes were empty in the admin. Check the saved settings before looking for a bug.
