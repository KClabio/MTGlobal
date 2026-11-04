// What the live server should have set. None of these stops the site, because each host differs, so they are written
// to the server's log at every start. The settings themselves are explained in .env.example.
function productionWarnings(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const blank = (key) => !String(env[key] || '').trim();
  const warnings = [];
  if (blank('TRUST_PROXY')) warnings.push('TRUST_PROXY is not set: behind the host\'s HTTPS proxy, visitors can\'t be told apart by address, and limits per address apply to everyone at once. Usually TRUST_PROXY=1.');
  if (env.SESSION_COOKIE_SECURE !== 'true') warnings.push('SESSION_COOKIE_SECURE is not true: the login cookie is not limited to HTTPS.');
  if (env.SESSION_COOKIE_SECURE === 'true' && blank('TRUST_PROXY')) warnings.push('SESSION_COOKIE_SECURE=true without TRUST_PROXY: behind a proxy no login cookie is sent, so logging in fails.');
  if (blank('SITE_URL')) warnings.push('SITE_URL is not set: sitemap.xml, robots.txt and page addresses for search engines use the address of each request.');
  if (blank('CLOUDINARY_CLOUD_NAME')) warnings.push('Cloudinary not configured: uploads will be stored on local disk and may be lost on redeploy.');
  if (blank('SMTP_USER') || blank('SMTP_PASS')) warnings.push('SMTP_USER / SMTP_PASS are not set: no emails are sent (new requests, confirmations, error alerts).');
  return warnings;
}

module.exports = { productionWarnings };
