// Watch-only videos (no download / speed / picture-in-picture / casting / right-click, direct file opening refused)
// and the "Sắp ra mắt" overlay on robot cards, readable in light and dark.
import { suite, part, check, BASE } from './lib/index.mjs';

await suite(async (b) => {
  const { ev, nav, sleep, shot } = b;
  const setTheme = (v) => b.setCookie('theme', v);

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
