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
| `lib/` | logic: `solution-pages.js` (default Giải pháp pages), `dashboard.js`, `home-domains.js`, `project-levels.js`, `i18n.js`, `text.js`, `validators.js`, … |
| `models/` | mongoose models (Article, Partner, Product, Project, QuoteRequest, Service, SiteSettings, SolutionPage, User) |
| `locales/vi.json`, `locales/en.json` | every UI text, in both languages; add new keys to both |
| `public/js/` | `main.js` (website), `admin.js` (admin), `theme.js` |
| `scripts/` | `seed.js`, `make-admin.js`, `release.js`, data scripts |
| `tests/` | browser tests (see below) |

### CSS (`public/css/`)
| File | Holds |
|---|---|
| `theme.css` | colour and size tokens (light + dark) |
| `base.css` | reset, `.container`, buttons, `.sr-only`, the `--anim` speed token |
| `layout.css` | header and menus, page banner, sections, footer, theme switch, phone menu drawer |
| `components.css` | card grids, partner tiles + partner page, timeline, forms + password eye, galleries, prose text, profile, tables/tags, key-fact tiles, coming soon |
| `home.css` | home hero, pillar cards, "Lĩnh vực hoạt động" slider |
| `pages.css` | Giải pháp pages (jump menu, folds, tabs, process trail, "Khám phá thêm", CTA band), Dịch vụ, STEM equipment, projects/news search |
| `admin.css` | the whole admin area, dashboard charts included (loaded by `views/admin/partials/head.ejs` only) |

Each file ends with its own `@media` rules. Grep for a selector first, then read only that part of the file.

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
  | `home` | home "Lĩnh vực hoạt động" slider (wheel, drag, arrows), "← Về trang chủ" and "← Quay lại" links |
  | `nav` | header dropdowns, keyboard, account menu, phone drawer; theme switches, admin toasts, dark-mode contrast |
  | `solutions` | Giải pháp menu, pages, assets, /giai-phap landing, STEM Lab page, "Khám phá thêm", equipment tabs + search, process trails |
  | `projects-news` | project school levels + searches, news search |
  | `partners` | partner strips, partner pages, partner admin, tile rows + hover |
  | `services` | request forms (contact, robot pages), thank-you card, changing a sent request, Dịch vụ landing |
  | `media` | watch-only videos, "Sắp ra mắt" overlay |
  | `accounts` | password eye, profile page, role badge, avatar size, "Xóa ảnh", sign-up checks, login notice |
  | `google` | "Đăng nhập bằng Google" (fake Google on :3002): new account, sync at each login, joining an email account, cancel / forged return, photo delete, first password |
  | `dashboard` | dashboard numbers, charts, animations, hover |
  | `admin-lists` | permissions, notifications, drag order, list search, filter chips, request delete, delete dialog, admin menu scroll, users by role |
  | `admin-editor` | admin sidebar, Giải pháp page editor, Cài đặt chung, Thông tin công ty, plain-text content |
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

## Commits and releases
- **Commit only when the owner asks.** Each commit is a version: the first was 1.0.0, and each later one adds 0.0.1 (one tag + GitHub Release per commit).
- Routine:
  1. Add a `## [Unreleased]` section at the top of `CHANGELOG.md` (under the intro and `---`). Use `### Added` / `### Changed` / `### Fixed` / `### Removed`, in plain words for business readers.
  2. Stage the changed files with `git add <files>`, never `git add -A`.
  3. Run `npm run release -- -m "<two plain sentences>" --session <Claude-Session url>`. Try `--dry-run` first.
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
