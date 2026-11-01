// 43 · Search engines, page by page (VI and EN): title, description, one main heading, canonical address, the
// Vietnamese/English pair (hreflang), link previews, and structured data (schema.org JSON-LD) that Google reads for
// the company card and breadcrumbs. Lighthouse SEO + best practices are in use case 1 (npm run qa -- --only 1).
import { readFileSync } from 'node:fs';
import { Client } from '../lib/http.mjs';
import { PROGRESS } from '../lib/infra.mjs';

const publicPages = () => JSON.parse(readFileSync(PROGRESS, 'utf8')).steps[0].results.pages.list.filter((p) => !/^\/(dang-nhap|dang-ky|dang-xuat)/.test(p));
const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const meta = (html, attr, name) => decode((html.match(new RegExp(`<meta[^>]+${attr}="${name}"[^>]*content="([^"]*)"`, 'i')) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*${attr}="${name}"`, 'i')) || [])[1]);

function inspect(html) {
  const title = decode((html.match(/<title>([^<]*)<\/title>/i) || [])[1]).trim();
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => { try { return JSON.parse(m[1]); } catch { return { invalid: true }; } });
  const types = jsonLd.flatMap((j) => (Array.isArray(j) ? j : j['@graph'] || [j]).map((x) => x['@type'] || (x.invalid ? 'INVALID' : '?')));
  return {
    title,
    description: meta(html, 'name', 'description'),
    h1: (html.match(/<h1[\s>]/gi) || []).length,
    canonical: (html.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1] || '',
    hreflang: [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)"/gi)].map((m) => m[1]).sort().join(','),
    ogImage: meta(html, 'property', 'og:image'),
    ogTitle: meta(html, 'property', 'og:title'),
    noindex: /<meta name="robots" content="[^"]*noindex/i.test(html),
    jsonLd: types,
  };
}

export const scenarios = [
  {
    id: 43,
    name: 'Search engines page by page (VI + EN): titles, descriptions, headings, hreflang, previews, structured data',
    types: ['SEO', 'Structured Data'],
    async run(ctx) {
      const pages = publicPages();
      const vi = new Client();
      const en = new Client(); en.cookies.set('lang', 'en');
      const rows = [];
      for (const p of pages) {
        for (const [lang, c] of [['vi', vi], ['en', en]]) {
          const r = await c.get(p);
          if (r.status !== 200 || !/text\/html/.test(r.headers.get('content-type') || '')) continue;
          rows.push({ page: p, lang, ...inspect(r.text) });
        }
      }
      const indexed = rows.filter((r) => !r.noindex);
      const problems = {
        titleMissingOrLong: indexed.filter((r) => !r.title || r.title.length > 65).map((r) => `${r.lang} ${r.page} (${r.title.length})`),
        descriptionMissingOrOdd: indexed.filter((r) => !r.description || r.description.length < 50 || r.description.length > 170).map((r) => `${r.lang} ${r.page} (${r.description.length})`),
        h1NotOne: indexed.filter((r) => r.h1 !== 1).map((r) => `${r.lang} ${r.page} (${r.h1})`),
        noCanonical: indexed.filter((r) => !r.canonical).map((r) => `${r.lang} ${r.page}`),
        noHreflangPair: indexed.filter((r) => !/en/.test(r.hreflang) || !/vi/.test(r.hreflang)).map((r) => `${r.lang} ${r.page}`),
        noPreview: indexed.filter((r) => !r.ogImage || !r.ogTitle).map((r) => `${r.lang} ${r.page}`),
        invalidJsonLd: rows.filter((r) => r.jsonLd.includes('INVALID')).map((r) => `${r.lang} ${r.page}`),
      };
      // Same title on different pages (per language)
      const seen = new Map();
      for (const r of indexed) { const k = `${r.lang}|${r.title}`; seen.set(k, [...(seen.get(k) || []), r.page]); }
      problems.duplicateTitles = [...seen].filter(([, v]) => v.length > 1).map(([k, v]) => `${k.split('|')[0]} "${k.split('|')[1]}": ${v.join(', ')}`);
      const home = rows.find((r) => r.page === '/' && r.lang === 'vi');
      const structured = {
        homeOrganization: !!home && home.jsonLd.some((t) => /Organization|LocalBusiness|Corporation/.test(t)),
        pagesWithBreadcrumbs: indexed.filter((r) => r.jsonLd.includes('BreadcrumbList')).length,
        pagesWithAnyJsonLd: indexed.filter((r) => r.jsonLd.length).length,
      };
      ctx.result('seo', { pages: rows.length, indexed: indexed.length, problems, structured });
      ctx.log(`${rows.length} pages · ${Object.entries(problems).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.length}`).join(', ') || 'no page problems'} · structured: ${JSON.stringify(structured)}`);
      if (!structured.homeOrganization) ctx.finding({ severity: 'low', title: 'No structured data for Google (company card, breadcrumbs)', detail: `None of the ${indexed.length} indexed pages has schema.org data (JSON-LD). Google then can't show the company's name, logo, address and phone as a card, or the page path ("Trang chủ › Giải pháp › STEM Lab") in results.`, fix: 'Add JSON-LD: Organization (name, logo, address, phone, from Thông tin công ty) on Trang chủ, BreadcrumbList on inner pages; check with Google\'s Rich Results Test after launch.' });
      for (const [key, list] of Object.entries(problems)) {
        if (!list.length || key === 'invalidJsonLd') continue;
        const words = { titleMissingOrLong: 'titles missing or over 65 characters (cut off in Google)', descriptionMissingOrOdd: 'descriptions missing, under 50 or over 170 characters', h1NotOne: 'pages without exactly one main heading (h1)', noCanonical: 'pages without a canonical address', noHreflangPair: 'pages without their Vietnamese/English pair', noPreview: 'pages without a link-preview picture or title', duplicateTitles: 'the same title on different pages' };
        ctx.finding({ severity: 'low', title: `SEO: ${words[key]}`, detail: `${list.length}: ${list.slice(0, 8).join('; ')}${list.length > 8 ? ' …' : ''}`, fix: 'Adjust the page titles/descriptions (lib/seo.js or the page\'s banner text in the admin).' });
      }
      if (problems.invalidJsonLd.length) ctx.finding({ severity: 'medium', title: 'Structured data that does not parse', detail: problems.invalidJsonLd.join('; '), fix: 'Fix the JSON-LD block.' });
    },
  },
];
