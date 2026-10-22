// Finds the site's public pages by following links from Trang chủ (like a search engine would)
import { Client } from './http.mjs';

const SKIP = /^\/(admin|dang-xuat|uploads|assets|images|css|js|vendor)(\/|$)|\.(jpe?g|png|webp|gif|svg|mp4|webm|pdf|zip|ico)$/i;

export function linksIn(html) {
  const out = new Set();
  for (const m of html.matchAll(/\shref="([^"#]*)(#[^"]*)?"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (href.startsWith('/') && !href.startsWith('//')) out.add(href);
  }
  return [...out];
}

/** Public HTML pages reachable from '/', up to `max` (query strings dropped except ?lang/ ?from) */
export async function crawl(max = 400, client = new Client()) {
  const seen = new Set(['/']);
  const queue = ['/'];
  const pages = [];
  while (queue.length && pages.length < max) {
    const p = queue.shift();
    const r = await client.get(p);
    pages.push({ path: p, status: r.status, ms: r.ms, bytes: r.text.length });
    if (r.status !== 200 || !/text\/html/.test(r.headers.get('content-type') || '')) continue;
    for (const href of linksIn(r.text)) {
      const clean = href.split('?')[0];
      if (SKIP.test(clean) || seen.has(clean)) continue;
      seen.add(clean);
      queue.push(clean);
    }
  }
  return pages;
}
