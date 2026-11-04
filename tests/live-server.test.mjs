// The site in live mode (NODE_ENV=production), as extra copies beside the test server: what its log says about missing
// settings, a second copy picking up a settings change made elsewhere, a clean stop, and stopping when it can't start.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { suite, part, check, db, ROOT, restoreLater, stamp } from './lib/index.mjs';

const PORT = 3003;
const BASE3 = `http://localhost:${PORT}`;
const LIVE = {
  NODE_ENV: 'production',
  PORT: String(PORT),
  SESSION_SECRET: 'zz-test-only-'.padEnd(48, 'x'),
  TRUST_PROXY: '', SESSION_COOKIE_SECURE: '', SITE_URL: '', CLOUDINARY_CLOUD_NAME: '', SMTP_USER: '', SMTP_PASS: '',
  MAIL_TEST_DIR: path.join(ROOT, 'tests', 'output', 'mail'),
};

function startCopy(extra = {}) {
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, ...LIVE, ...extra }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const copy = { child, log: '', ended: null };
  child.stdout.on('data', (d) => { copy.log += d; });
  child.stderr.on('data', (d) => { copy.log += d; });
  copy.ended = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return copy;
}
const within = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('still running'), ms))]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(copy) {
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${BASE3}/health`)).ok) return true; } catch { /* not yet */ }
    await sleep(200);
  }
  throw new Error(`the copy did not start: ${copy.log.slice(-500)}`);
}
const stopCopy = async (copy) => { copy.child.send('shutdown'); return within(copy.ended, 15000); };
const footerAddress = async () => (await (await fetch(`${BASE3}/`)).text());

await suite(async (b) => {
  const settings = (await restoreLater('sitesettings', {}))[0];

  await part(b, 'missing live settings are named in the log, and a second copy follows a settings change', async () => {
    const copy = startCopy({ SETTINGS_CACHE_SECONDS: '1' });
    try {
      await ready(copy);
      for (const key of ['TRUST_PROXY', 'SESSION_COOKIE_SECURE', 'SITE_URL', 'SMTP_USER']) check(`the log names ${key}`, copy.log.includes(key), copy.log.slice(0, 600));

      const marker = `ZZ address ${stamp}`;
      check('the second copy shows the current address first', !(await footerAddress()).includes(marker));
      await (await db()).collection('sitesettings').updateOne({ _id: settings._id }, { $set: { 'contactInfo.address': marker } });
      await sleep(1500);
      check('a change made elsewhere shows on this copy by itself', (await footerAddress()).includes(marker));
      await (await db()).collection('sitesettings').updateOne({ _id: settings._id }, { $set: { contactInfo: settings.contactInfo } });
      await sleep(1500);
      check('… and so does putting it back', !(await footerAddress()).includes(marker));

      const code = await stopCopy(copy);
      check('a stop message ends the copy cleanly (exit 0)', code === 0, { code, log: copy.log.slice(-300) });
      let answered = false;
      try { await fetch(`${BASE3}/health`); answered = true; } catch { /* port closed */ }
      check('… and the port is free again', !answered);
    } finally {
      copy.child.kill();
    }
  });

  await part(b, 'no warnings with the live settings in place', async () => {
    const copy = startCopy({ TRUST_PROXY: '1', SESSION_COOKIE_SECURE: 'true', SITE_URL: BASE3, CLOUDINARY_CLOUD_NAME: 'zz-test', CLOUDINARY_API_KEY: '', SMTP_USER: 'zz', SMTP_PASS: 'zz' });
    try {
      await ready(copy);
      check('the log has no setting warnings', !copy.log.includes('Live server setting:'), copy.log.slice(0, 600));
      await stopCopy(copy);
    } finally {
      copy.child.kill();
    }
  });

  await part(b, 'stops instead of staying up without a site', async () => {
    let copy = startCopy({ PORT: new URL(process.env.TEST_BASE || 'http://localhost:3001').port });
    let code = await within(copy.ended, 20000);
    check('the port is taken: stops with 1', code === 1, { code, log: copy.log.slice(-300) });
    copy.child.kill();

    copy = startCopy({ MONGO_URI: 'mongodb://127.0.0.1:27999/zz-nothing-here' });
    code = await within(copy.ended, 20000);
    check('the database is unreachable: stops with 1', code === 1, { code, log: copy.log.slice(-300) });
    copy.child.kill();
  });
});
