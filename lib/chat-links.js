// The Zalo and Messenger links of the chat button (partials/chat-button.ejs), from Admin → Thông tin công ty.
// Stored cleaned: Zalo as digits only, Messenger as the Facebook page name. An empty one shows no link.

/** '0912 345 678' or '+84 912…' → '0912345678' / '84912…'; '' when it can't be a phone number */
function cleanZalo(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 ? digits : '';
}

/** 'mtg.vn', 'm.me/mtg.vn', 'https://www.facebook.com/mtg.vn/' → 'mtg.vn'; '' when it isn't a page name */
function cleanMessenger(value) {
  let name = String(value || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  name = name.replace(/^(https?:\/\/)?(www\.|m\.|web\.)?(facebook\.com|fb\.com|m\.me|messenger\.com\/t)\//i, '');
  return /^[A-Za-z0-9.\-_]{2,80}$/.test(name) ? name : '';
}

/** [{ kind: 'zalo' | 'messenger', url }] for the filled ones */
function chatLinks(contact) {
  const info = contact || {};
  const links = [];
  const zalo = cleanZalo(info.zalo);
  if (zalo) links.push({ kind: 'zalo', url: `https://zalo.me/${zalo}` });
  const page = cleanMessenger(info.messenger);
  if (page) links.push({ kind: 'messenger', url: `https://m.me/${encodeURIComponent(page)}` });
  return links;
}

module.exports = { cleanZalo, cleanMessenger, chatLinks };
