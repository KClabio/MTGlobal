// A stand-in for Google's login (tests only). tests/run.mjs starts the test server with GOOGLE_OAUTH_TEST_URL pointing here,
// so lib/google-auth.js talks to this server instead of Google:
//   /auth      → straight back to the site's callback with ?code=…&state=… (or ?error=access_denied after cancelNext())
//   /token     → an access token for that code
//   /userinfo  → the profile given to setNextProfile()
import http from 'node:http';

export const FAKE_GOOGLE_PORT = 3002;
const profiles = new Map(); // code / token → profile
let next = null;
let cancel = false;
let n = 0;

/** The Google account the next "Đăng nhập bằng Google" returns: { sub, email, name, picture?, email_verified? } */
export function setNextProfile(profile) { next = { email_verified: true, ...profile }; }
/** The next login is cancelled at "Google" (the visitor pressed Hủy) */
export function cancelNext() { cancel = true; }

export function startFakeGoogle() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${FAKE_GOOGLE_PORT}`);
    if (url.pathname === '/auth') {
      const back = new URL(url.searchParams.get('redirect_uri'));
      back.searchParams.set('state', url.searchParams.get('state') || '');
      if (cancel) { cancel = false; back.searchParams.set('error', 'access_denied'); }
      else { const code = `code-${++n}`; profiles.set(code, next); back.searchParams.set('code', code); }
      res.writeHead(302, { location: String(back) }).end();
    } else if (url.pathname === '/token' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const profile = profiles.get(params.get('code'));
        const ok = profile && params.get('client_id') === 'test-client' && params.get('client_secret') === 'test-secret';
        if (!ok) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'invalid_grant' }));
        const token = `token-${params.get('code')}`;
        profiles.set(token, profile);
        profiles.delete(params.get('code')); // a code works once, as at Google
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: token, token_type: 'Bearer' }));
      });
    } else if (url.pathname === '/userinfo') {
      const profile = profiles.get((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!profile) return res.writeHead(401).end();
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(profile));
    } else if (url.pathname.startsWith('/photo/')) { // the "Google photo": one green pixel, stretched by the page
      res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgHBtcs1RQAAAABJRU5ErkJggg==', 'base64'));
    } else {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(FAKE_GOOGLE_PORT, () => resolve(server));
  });
}
