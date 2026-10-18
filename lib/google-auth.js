// "Đăng nhập bằng Google" (OAuth 2.0 / OpenID Connect, authorization-code flow) with Node's own fetch: no extra package.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (README: "Đăng nhập bằng Google"); without them the button is hidden.
// GOOGLE_OAUTH_TEST_URL (tests only) points all three Google addresses at the fake server in tests/lib/fake-google.mjs.
const TEST_BASE = process.env.GOOGLE_OAUTH_TEST_URL;
const AUTH_URL = TEST_BASE ? `${TEST_BASE}/auth` : 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = TEST_BASE ? `${TEST_BASE}/token` : 'https://oauth2.googleapis.com/token';
const USERINFO_URL = TEST_BASE ? `${TEST_BASE}/userinfo` : 'https://openidconnect.googleapis.com/v1/userinfo';
const CALLBACK_PATH = '/dang-nhap/google/callback';

const isConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// The address Google sends the visitor back to; it must be listed under "Authorised redirect URIs" in Google Cloud
function redirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URL || `${req.protocol}://${req.get('host')}${CALLBACK_PATH}`;
}

function authUrl(redirect, state) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account', // a shared computer can pick which Google account
  });
  return `${AUTH_URL}?${params}`;
}

// Google photos come at 96 px ("=s96-c"); ask for 256 px so the profile picture stays sharp
const largerPicture = (url) => (url ? url.replace(/=s\d+(-c)?$/, '=s256-c') : null);

// code (from Google's redirect) → { googleId, email, emailVerified, name, picture }; throws when Google refuses or doesn't answer
async function fetchProfile(code, redirect) {
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10000),
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) throw new Error(`Google token: HTTP ${tokenRes.status} ${token.error || ''}`);

  const infoRes = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(10000) });
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok || !info.sub || !info.email) throw new Error(`Google userinfo: HTTP ${infoRes.status}`);
  return {
    googleId: String(info.sub),
    email: String(info.email).toLowerCase().trim(),
    emailVerified: info.email_verified === true || info.email_verified === 'true',
    name: String(info.name || '').trim() || String(info.email).split('@')[0],
    picture: largerPicture(info.picture || null),
  };
}

module.exports = { isConfigured, redirectUri, authUrl, fetchProfile, CALLBACK_PATH };
