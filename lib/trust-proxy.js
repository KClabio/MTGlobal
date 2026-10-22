// TRUST_PROXY from .env -> the value Express expects for app.set('trust proxy').
// Settings from .env are always text, and Express reads the text "1" as a network address, not as "1 proxy":
// behind the host's HTTPS the app then never sees that a visit is secure, and a Secure login cookie is never sent.
//   ''/missing -> undefined (not set) · "1", "2" -> number of proxies · "true"/"false" -> boolean
//   anything else ("loopback", "10.0.0.0/8, 127.0.0.1") -> kept as text, which Express understands
function parseTrustProxy(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

module.exports = { parseTrustProxy };
