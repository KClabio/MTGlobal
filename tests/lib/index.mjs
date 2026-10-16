// Everything a test file needs: import { suite, check, ... } from './lib/index.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';
import { check, result } from './check.mjs';
import { cleanup } from './fixtures.mjs';

export { BASE, sleep, launch } from './browser.mjs';
export { check } from './check.mjs';
export { db, createUser, removeLater, restoreLater, stamp } from './fixtures.mjs';

/** The project folder, and require() for the app's own modules: appRequire('./lib/banners.js'). */
export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const appRequire = createRequire(ROOT);

/** One part of a file: starts from b.reset(); an exception fails this part only, and the next part still runs. */
export async function part(b, name, fn) {
  await b.reset();
  try {
    await fn();
  } catch (e) {
    check(`${name}: ran to the end`, false, (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
  }
}

/**
 * Runs one test file: opens Chrome, runs fn(browser), then checks for JavaScript errors, closes Chrome,
 * removes the test data and exits with the result. An exception fails the file with its message.
 */
export async function suite(fn, options) {
  let b;
  try {
    b = await launch(options);
    await fn(b);
    check('no JavaScript errors on the pages visited', b.jsErrors.length === 0, b.jsErrors);
  } catch (e) {
    check('test ran to the end', false, (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
  } finally {
    if (b) await b.close();
    try { await cleanup(); } catch (e) { check('test data removed', false, e.message); }
  }
  process.exit(result() ? 1 : 0);
}
