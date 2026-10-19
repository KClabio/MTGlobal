#!/usr/bin/env node
// Publishes the next version: every commit is a version (v1.0.0 was the first, each later one adds 0.0.1).
//
//   1. Write the changes under "## [Unreleased]" at the top of CHANGELOG.md (Added / Changed / Fixed / Removed).
//   2. git add <the changed files>
//   3. npm run release -- -m "<commit message>" [--session <Claude-Session url>] [--dry-run]
//
// The script names the Unreleased section (version + today's date), adds the previous version's commit id to its
// heading, sets package.json "version", commits (with the Co-Authored-By trailer), tags vX.Y.Z, pushes main + the tag
// and creates the GitHub Release. Each release shows the whole changelog from its version back to 1.0.0.
// --dry-run prints all of that and changes nothing.  --notes-only <version> prints one release's notes.
// Screenshots (from 1.0.10 on): docs/screenshots/<version>/*.jpg, linked in the changelog by relative path
// (`![…](docs/screenshots/…)`); they must be staged, and the release notes point them at that version's tag.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const PACKAGE = path.join(ROOT, 'package.json');
const TRAILER = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';

// trimEnd, not trim: `git status --porcelain` lines start with a meaningful space
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trimEnd();
const git = (...args) => run('git', args);
const fail = (msg) => { console.error(`release: ${msg}`); process.exit(1); };

function parseArgs(argv) {
  const opts = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-m' || a === '--message') opts.message = argv[++i];
    else if (a === '--session') opts.session = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--notes-only') opts.notesOnly = (argv[++i] || '').replace(/^v/, '');
    else fail(`unknown option ${a}`);
  }
  return opts;
}

/** CHANGELOG.md -> { head, sections: [{ version, heading, body }] } (newest first; version 'Unreleased' allowed). */
function parseChangelog(text) {
  const parts = text.replace(/\r\n/g, '\n').split(/^(?=## \[)/m);
  const head = parts.shift();
  const sections = parts.map((part) => {
    const nl = part.indexOf('\n');
    const heading = part.slice(0, nl === -1 ? undefined : nl);
    return { version: heading.match(/^## \[([^\]]+)\]/)[1], heading, body: nl === -1 ? '' : part.slice(nl + 1) };
  });
  return { head, sections };
}
const joinChangelog = ({ head, sections }) => head + sections.map((s) => `${s.heading}\n${s.body}`).join('');
const shortHash = (ref) => { try { return git('rev-parse', '--short', `${ref}^{commit}`); } catch { return null; } };
const withHash = (heading, hash) => (hash && !/·\s*`[0-9a-f]+`\s*$/.test(heading) ? `${heading} · \`${hash}\`` : heading);

function repoUrl() {
  const url = git('remote', 'get-url', 'origin');
  return url.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
}

// Relative picture links in the changelog (`![alt](docs/…)`); a Release page can't follow them, so they are rewritten
const RELATIVE_IMAGE = /(!\[[^\]]*\]\()(?![a-z][a-z0-9+.-]*:|\/|#)([^)\s]+)\)/gi;
const imagePaths = (text) => [...text.matchAll(RELATIVE_IMAGE)].map((m) => m[2]);
/** Points the section's relative pictures at the copy in that version's tag (the files never change afterwards). */
const absoluteImages = (body, version) => body.replace(RELATIVE_IMAGE, (_, open, file) =>
  `${open}${repoUrl().replace('https://github.com/', 'https://raw.githubusercontent.com/')}/v${version}/${file})`);

/** Release body for `version`: that version and every older one, newest first; headings carry their commit ids. */
function releaseNotes(sections, version, hashFor) {
  const from = sections.findIndex((s) => s.version === version);
  if (from === -1) fail(`version ${version} is not in CHANGELOG.md`);
  const body = sections.slice(from).map((s) => `${withHash(s.heading, hashFor(s.version))}\n${absoluteImages(s.body, s.version).replace(/\n+$/, '')}\n`).join('\n');
  return `Full changelog up to **v${version}** (newest first).\n\n${body}\n---\n**Source:** [CHANGELOG.md](${repoUrl()}/blob/main/CHANGELOG.md)\n`;
}

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const changelog = parseChangelog(fs.readFileSync(CHANGELOG, 'utf8'));

  if (opts.notesOnly) {
    process.stdout.write(releaseNotes(changelog.sections.filter((s) => s.version !== 'Unreleased'), opts.notesOnly, (v) => shortHash(`v${v}`)));
    return;
  }
  if (!opts.message) fail('missing -m "<commit message>"');

  // ---- Checks ----
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch !== 'main') fail(`on branch ${branch}; releases are made from main`);
  git('fetch', 'origin', '--tags', '--quiet');
  const behind = +git('rev-list', '--count', 'HEAD..origin/main');
  const ahead = +git('rev-list', '--count', 'origin/main..HEAD');
  if (behind || ahead) fail(`main is ${behind} behind / ${ahead} ahead of origin/main; sync it first`);
  try { run('gh', ['auth', 'status']); } catch { fail('GitHub CLI is not logged in (gh auth login)'); }
  const unreleased = changelog.sections[0];
  if (!unreleased || unreleased.version !== 'Unreleased' || !unreleased.body.trim()) fail('add the changes under "## [Unreleased]" at the top of CHANGELOG.md first');
  for (const file of imagePaths(unreleased.body)) {
    if (!fs.existsSync(path.join(ROOT, file))) fail(`screenshot ${file} (linked in CHANGELOG.md) does not exist`);
    if (!git('ls-files', '--', file)) fail(`screenshot ${file} is not staged (git add ${file})`);
  }

  // ---- Next version ----
  const last = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n')[0];
  const m = last.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) fail(`cannot read the latest version tag (${last || 'none'})`);
  const prev = `${m[1]}.${m[2]}.${m[3]}`;
  const version = `${m[1]}.${m[2]}.${+m[3] + 1}`;
  const tag = `v${version}`;

  // ---- New file contents ----
  unreleased.version = version;
  unreleased.heading = `## [${version}] - ${today()}`;
  const prevSection = changelog.sections.find((s) => s.version === prev);
  if (prevSection) prevSection.heading = withHash(prevSection.heading, shortHash(`v${prev}`));
  const newChangelog = joinChangelog(changelog);
  const pkgText = fs.readFileSync(PACKAGE, 'utf8');
  const newPkg = pkgText.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  const message = `${opts.message.trim()}\n\n${TRAILER}${opts.session ? `\nClaude-Session: ${opts.session}` : ''}\n`;

  const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
  const committed = [...new Set([...staged, 'CHANGELOG.md', 'package.json'])].sort();
  const left = git('status', '--porcelain').split('\n').filter(Boolean)
    .filter((l) => l[1] !== ' ' || l[0] === '?') // unstaged or untracked
    .map((l) => l.slice(3)).filter((f) => !['CHANGELOG.md', 'package.json'].includes(f));

  console.log(`Release ${tag} (previous: v${prev})`);
  console.log(`Commit includes: ${committed.join(', ')}`);
  if (left.length) console.log(`Not included (not staged): ${left.join(', ')}`);

  if (opts.dryRun) {
    const notes = releaseNotes(changelog.sections, version, (v) => (v === version ? 'NEWHASH' : shortHash(`v${v}`)));
    console.log(`\n--- commit message ---\n${message}\n--- release notes (${tag}) ---\n${notes}\n(dry run: nothing was changed)`);
    return;
  }

  // ---- Publish ----
  fs.writeFileSync(CHANGELOG, newChangelog);
  fs.writeFileSync(PACKAGE, newPkg);
  git('add', 'CHANGELOG.md', 'package.json');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtg-release-'));
  const msgFile = path.join(tmp, 'message.txt');
  fs.writeFileSync(msgFile, message);
  git('commit', '-F', msgFile);
  const hash = git('rev-parse', '--short', 'HEAD');
  console.log(`✓ committed ${hash}`);
  git('tag', tag);
  console.log(`✓ tagged ${tag}`);
  try {
    run('git', ['push', 'origin', 'main', `refs/tags/${tag}`]);
  } catch (e) {
    fail(`push failed (the commit and tag exist locally; fix it, then: git push origin main ${tag} and create the release with --notes-only ${version}):\n${e.stderr || e.message}`);
  }
  console.log('✓ pushed main + tag');
  const notesFile = path.join(tmp, 'notes.md');
  fs.writeFileSync(notesFile, releaseNotes(changelog.sections, version, (v) => (v === version ? hash : shortHash(`v${v}`))));
  const url = run('gh', ['release', 'create', tag, '--title', tag, '--notes-file', notesFile, '--latest']);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ release ${url}`);
}

main();
