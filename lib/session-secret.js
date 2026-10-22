// The secret that signs login cookies (SESSION_SECRET). There is no fallback written in the code: the repository is
// public, so a known secret would let anyone make a cookie that logs them in as any account.
//  - production (NODE_ENV=production): refuse to start when it is missing, still the .env.example placeholder,
//    or shorter than 32 characters;
//  - elsewhere, when missing: a random one for this run (logins end when the server restarts), with a warning.
const crypto = require('crypto');

const PLACEHOLDER = 'change-this-to-a-random-secret';
const MIN_LENGTH = 32;

/** env -> { secret } or { error } (production problem), plus { warning } when a random one was made */
function resolveSessionSecret(env = process.env) {
  const value = String(env.SESSION_SECRET || '').trim();
  if (env.NODE_ENV === 'production') {
    if (!value) return { error: 'SESSION_SECRET is missing. Set it to 32 or more random characters.' };
    if (value === PLACEHOLDER) return { error: 'SESSION_SECRET is still the example value from .env.example. Set it to 32 or more random characters.' };
    if (value.length < MIN_LENGTH) return { error: `SESSION_SECRET is too short (${value.length} characters). Use 32 or more random characters.` };
    return { secret: value };
  }
  if (value) return { secret: value };
  return { secret: crypto.randomBytes(32).toString('hex'), warning: 'SESSION_SECRET is not set: using a random one for this run (logins end when the server restarts).' };
}

module.exports = { resolveSessionSecret, PLACEHOLDER, MIN_LENGTH };
