// npm test [-- <name> ...] [--verbose] [--shots] [--no-retry]
// Runs tests/*.test.mjs one after another against the test server on :3001 (started here if it isn't running,
// and stopped again at the end). Prints only failures and one summary line; exit code 1 when anything failed.
// A file that fails is run once more: if it passes then, it is reported as flaky.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PORT = 3001;
const BASE = `http://localhost:${PORT}`;
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const names = args.filter((a) => !a.startsWith('--'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort()
  .filter((f) => !names.length || names.some((n) => f.includes(n)));
if (!files.length) { console.log(`No test file matches: ${names.join(', ')}`); process.exit(1); }

const up = async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } };

let server = null;
let serverLog = '';
if (!(await up())) {
  // "Đăng nhập bằng Google" talks to the fake Google of tests/lib/fake-google.mjs (google.test.mjs starts it on :3002)
  const fakeGoogle = { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_OAUTH_TEST_URL: 'http://localhost:3002', GOOGLE_REDIRECT_URL: '' };
  server = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ...fakeGoogle }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  let ok = false;
  for (let i = 0; i < 80 && !ok; i++) { await sleep(250); ok = await up(); }
  if (!ok) { console.log(`Test server did not start on :${PORT}\n${serverLog.slice(-1500)}`); server.kill(); process.exit(1); }
}

const runFile = (file) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(HERE, file)], {
    cwd: ROOT,
    env: { ...process.env, TEST_BASE: BASE, TEST_VERBOSE: flags.has('--verbose') ? '1' : '', TEST_SHOTS: flags.has('--shots') ? '1' : '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const timer = setTimeout(() => { out += '\nFAIL  timed out after 5 minutes'; child.kill(); }, 5 * 60 * 1000);
  child.on('close', (code) => {
    clearTimeout(timer);
    const m = out.match(/^@@RESULT (\d+) (\d+)/m);
    const passed = m ? +m[1] : 0;
    const failed = m ? +m[2] : 1;
    resolve({ ok: code === 0 && !!m && failed === 0, passed, failed, out });
  });
});

const started = Date.now();
let passed = 0;
let failed = 0;
const flaky = [];
for (const file of files) {
  const name = file.replace(/\.test\.mjs$/, '');
  let r = await runFile(file);
  if (!r.ok && !flags.has('--no-retry')) {
    const again = await runFile(file);
    if (again.ok) {
      flaky.push(name);
      const first = r.out.split('\n').filter((l) => l.startsWith('FAIL'));
      console.log(`\n~ ${name} (failed once, passed on the retry)\n  ${first.join('\n  ')}`);
      r = again;
    }
  }
  passed += r.passed;
  failed += r.ok ? 0 : Math.max(r.failed, 1);
  if (flags.has('--verbose')) {
    console.log(`\n== ${name}\n${r.out.replace(/^@@RESULT.*\n?/m, '').trimEnd()}`);
  } else if (!r.ok) {
    const lines = r.out.split('\n').filter((l) => l.startsWith('FAIL'));
    const shown = lines.length ? lines : r.out.trim().split('\n').slice(-10); // crashed before any check: show the end of its output
    console.log(`\n✗ ${name}\n  ${shown.join('\n  ')}`);
  }
}

if (server) server.kill();
const secs = Math.round((Date.now() - started) / 1000);
console.log(`${failed ? '\n' : ''}${passed} passed, ${failed} failed${flaky.length ? `, ${flaky.length} flaky (${flaky.join(', ')})` : ''} (${files.length} files, ${secs}s)`);
process.exit(failed ? 1 : 0);
