// Watch-only videos (no download / speed / picture-in-picture / casting / right-click, direct file opening refused)
// and the "Sắp ra mắt" overlay on robot cards, readable in light and dark.
import { suite, part, check, BASE } from './lib/index.mjs';

await suite(async (b) => {
  const { ev, nav, sleep, shot } = b;
  const setTheme = (v) => b.setCookie('theme', v);

  await part(b, 'speed: compression, one style file, own font, lighter photos', async () => {
    const get = async (p, headers = {}) => { const r = await fetch(BASE + p, { headers }); const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, h: Object.fromEntries(r.headers), bytes: buf.length, buf, text: buf.toString('utf8') }; };
    // Node's fetch decompresses by itself: ask with a raw request to see what goes over the network
    const raw = (p, enc) => new Promise((resolve) => { import('node:http').then(({ default: http }) => { http.get(BASE + p, { headers: { 'accept-encoding': enc } }, (res) => { let n = 0; res.on('data', (c) => { n += c.length; }); res.on('end', () => resolve({ enc: res.headers['content-encoding'] || null, bytes: n, type: res.headers['content-type'] })); }); }); });
    const home = await get('/');
    const css = (home.text.match(/href="(\/css\/site\.css\?v=[0-9a-f]{10})"/) || [])[1];
    check('pages link one style file with a fingerprint (/css/site.css?v=…), no Google Fonts', !!css && !home.text.includes('fonts.googleapis.com') && !/href="\/css\/(base|layout|theme)\.css"/.test(home.text), css);
    const plainCss = await raw(css, 'identity'); const brCss = await raw(css, 'br'); const gzHtml = await raw('/', 'gzip');
    check('the style file comes compressed (Brotli), several times smaller', brCss.enc === 'br' && brCss.bytes < plainCss.bytes / 3, { plain: plainCss.bytes, br: brCss.bytes });
    check('pages come compressed too (gzip for browsers without Brotli)', gzHtml.enc === 'gzip' && /text\/html/.test(gzHtml.type), gzHtml);
    const jpg = await raw('/assets/giai-phap/workshop/hoc-sinh-lap-rap-2.jpg', 'gzip, br');
    check('photos are not compressed a second time', jpg.enc === null && /image\/jpeg/.test(jpg.type), jpg);
    const font = await get('/fonts/be-vietnam-pro-400-vietnamese.woff2');
    check('the font is served by the site (woff2, with its licence)', font.status === 200 && /font\/woff2/.test(font.h['content-type']) && (await get('/fonts/OFL.txt')).text.includes('SIL Open Font License'));

    // Lighter copies of photos: right width, WebP when accepted, the original untouched
    const P = '/assets/giai-phap/workshop/hoc-sinh-lap-rap-2.jpg';
    const original = await get(P);
    const webp = await get(`${P}?w=480`, { accept: 'image/avif,image/webp,*/*' });
    const sharp = (await import('sharp')).default;
    const meta = await sharp(webp.buf).metadata();
    check('?w=480 gives a WebP copy 480 px wide, much smaller than the original', webp.status === 200 && webp.h['content-type'] === 'image/webp' && meta.format === 'webp' && meta.width === 480 && webp.bytes < original.bytes / 3 && /Accept/.test(webp.h.vary || ''), { orig: original.bytes, copy: webp.bytes, meta: { f: meta.format, w: meta.width } });
    const jpeg = await get(`${P}?w=480`, { accept: 'image/jpeg,*/*' });
    check('… a browser without WebP gets a JPEG copy', jpeg.h['content-type'] === 'image/jpeg' && (await sharp(jpeg.buf).metadata()).width === 480);
    check('… never wider than the original (1600 asked for a smaller photo)', ((await sharp((await get(`${P}?w=1600`, { accept: 'image/webp' })).buf).metadata()).width) <= (await sharp(original.buf).metadata()).width);
    check('… other widths give the original; paths outside the photos are refused', (await get(`${P}?w=999`)).bytes === original.bytes && (await get('/assets/..%2f..%2fserver.js?w=480')).status === 404);
    check('… the original file is unchanged', (await get(P)).bytes === original.bytes);

    // The pages use them: the browser picks a small copy on a phone
    for (const p of ['/', '/giai-phap/du-an', '/giai-phap/thiet-bi']) {
      const html = (await get(p)).text;
      check(`${p}: photos have srcset (480–1600) and lazy loading`, /srcset="[^"]*\?w=480 480w/.test(html) && /loading="lazy"/.test(html));
    }
    await b.viewport(390, 844);
    await nav('/giai-phap/du-an', 600);
    await ev(`window.scrollTo(0, 400)`); await sleep(500);
    const used = await ev(`[...document.querySelectorAll('img[srcset]')].filter((i) => i.complete && i.currentSrc).slice(0, 4).map((i) => i.currentSrc.replace(location.origin, ''))`);
    check('phone width: the browser loads 480/800 px copies, not the originals or 1600', used.length > 0 && used.every((u) => /\?w=(480|800|1200)$/.test(u)), used);

    // Only the main picture loads first; the others don't share a slow connection with it
    for (const p of ['/giai-phap/du-an', '/giai-phap/thiet-bi', '/san-pham']) {
      const html = (await get(p)).text;
      const n = (html.match(/fetchpriority="high"/g) || []).length;
      const photos = (html.match(/class="card-media"[\s\S]{0,400}?<img /g) || []).length; // robots without photos have none
      check(`${p}: only the first card photo loads at once (one fetchpriority="high")`, n === Math.min(1, photos), { n, photos });
    }
    const logo = ((await get('/')).text.match(/class="logo-img" src="([^"]*)"/) || [])[1];
    check('the logo is sent as a light 480 px copy (an SVG logo stays as it is)', !logo || /\?w=480$/.test(logo) || /\.svg$/i.test(logo), logo);

    // Thiết bị: the search, the tabs and only Phần I are in place before main.js runs, so the list doesn't jump
    await nav('/giai-phap/thiet-bi', 600);
    const shift = await ev(`new Promise((r) => { let s = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) s += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => r(Math.round(s * 1000) / 1000), 300); })`);
    check('Thiết bị on a phone: the page does not jump while loading (layout shift under 0.05)', shift < 0.05, shift);
    const before = await ev(`(() => { const t = document.querySelector('[data-equip-tools]'); t.classList.remove('is-ready'); t.hidden = true;
      const panels = [...document.querySelectorAll('[data-panel]')]; panels.forEach((p) => { p.hidden = false; });
      const r = { tools: getComputedStyle(t).display !== 'none', shown: panels.filter((p) => getComputedStyle(p).display !== 'none').map((p) => p.dataset.panel) };
      return r; })()`);
    check('… before the page script runs: tools shown and only the first Phần', before.tools && before.shown.length === 1 && before.shown[0] === 'phan-1', before);
    await b.viewport(1280, 900);
  });

  await part(b, 'watch-only videos', async () => {
    await nav('/san-pham/robot-leo-cau-thang', 400);
    const vids = await ev(`[...document.querySelectorAll('video')].map((v) => ({ list: v.getAttribute('controlslist'), pip: v.disablePictureInPicture, remote: v.disableRemotePlayback, controls: v.controls }))`);
    check('robot page videos: controls kept; download, speed, picture-in-picture and casting removed', vids.length === 3 && vids.every((v) => v.controls && v.list === 'nodownload noplaybackrate noremoteplayback' && v.pip && v.remote), vids);
    const ctx = await ev(`(() => { const v = document.querySelector('video'); const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); v.dispatchEvent(e); const d = document.createElement('div'); document.body.appendChild(d); const e2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); d.dispatchEvent(e2); d.remove(); return { video: e.defaultPrevented, elsewhere: e2.defaultPrevented }; })()`);
    check('right-click is blocked on videos only', ctx.video && !ctx.elsewhere, ctx);
    const play = await ev(`(async () => { const v = document.querySelector('video'); v.muted = true; v.scrollIntoView({ block: 'center' }); await v.play(); await new Promise((r) => setTimeout(r, 1200)); const t = v.currentTime; v.pause(); return { t, err: v.error && v.error.code }; })()`);
    check('the video still plays on the page', play.t > 0.3 && !play.err, play);
    const src = await ev(`document.querySelector('video source').getAttribute('src')`);
    const asPage = await fetch(BASE + src, { headers: { 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate' } });
    const asVideo = await fetch(BASE + src, { headers: { 'Sec-Fetch-Dest': 'video', Range: 'bytes=0-99' } });
    check('opening the video file directly as a page is refused (403); the player\'s own requests work (206)', asPage.status === 403 && asVideo.status === 206, { page: asPage.status, video: asVideo.status });
    await nav(src, 200).catch(() => {});
    check('in the browser, typing the video address shows the refusal', (await ev('document.body.innerText')).includes('Video chỉ xem được trên website'));
    for (const url of ['/giai-phap/workshop', '/giai-phap/dao-tao']) {
      await nav(url, 300);
      check(`${url}: its videos are watch-only too`, await ev(`[...document.querySelectorAll('video')].length > 0 && [...document.querySelectorAll('video')].every((v) => v.getAttribute('controlslist') === 'nodownload noplaybackrate noremoteplayback' && v.disablePictureInPicture)`));
    }
  });

  await part(b, '"Sắp ra mắt" overlay', async () => {
    const lum = (rgb) => { const [r, g, bl] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const blend = (top, a, bottom) => top.map((c, i) => c * a + bottom[i] * (1 - a));
    const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    for (const theme of ['light', 'dark']) {
      await setTheme(theme); await nav('/', 300);
      await ev(`document.querySelector('.coming-soon-overlay').scrollIntoView({ block: 'center' })`); await sleep(200);
      const c = await ev(`(() => { const o = document.querySelector('.coming-soon-overlay'); const b = o.querySelector('.coming-soon-badge'); const m = o.parentElement;
        return { n: document.querySelectorAll('.coming-soon-overlay').length, card: getComputedStyle(m).backgroundColor, veil: getComputedStyle(o).backgroundImage !== 'none' ? getComputedStyle(o).backgroundImage : getComputedStyle(o).backgroundColor, badgeBg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color, text: b.textContent.trim() }; })()`);
      const card = parse(c.card).slice(0, 3);
      const veilStops = [...c.veil.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => m[1].split(',').map(Number));
      const veil = veilStops.reduce((acc, v) => acc.map((x, i) => x + v[i] / veilStops.length), [0, 0, 0, 0]);
      const veiled = blend(veil.slice(0, 3), veil[3] ?? 1, card);
      const bp = parse(c.badgeBg); const badge = blend(bp.slice(0, 3), bp[3] ?? 1, veiled);
      const text = parse(c.color).slice(0, 3);
      const ratio = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
      const veilVsCard = ratio(veiled, card); const textVsBadge = ratio(text, badge);
      check(`"Sắp ra mắt" (${theme}): veil clearly differs from the card (≥1.25:1), badge text readable (≥4.5:1)`, c.n === 3 && veilVsCard >= 1.25 && textVsBadge >= 4.5, { c, veilVsCard: +veilVsCard.toFixed(2), textVsBadge: +textVsBadge.toFixed(2) });
      await ev(`document.querySelector('.coming-soon-overlay').closest('.card-grid').scrollIntoView({ block: 'center' })`); await sleep(200);
      await shot(`coming-soon-${theme}`);
    }
  });
});
