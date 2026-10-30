// 22 · Admin editing and uploads — the active part: hostile file names and contents.
// Non-destructive probes against the local QA copy (localhost:3001) only. They confirm the site's existing
// defences hold; a finding is raised only if one actually fails. See also the passive file checks in scenario 18.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, ROOT } from '../lib/infra.mjs';

const PUBLIC = path.join(ROOT, 'public');
// A real JPEG the site ships, so the "valid image, hostile file name" case genuinely passes the image check
const REAL_JPG = path.join(PUBLIC, 'assets', 'giai-phap', 'workshop', 'hoc-sinh-lap-rap-1.jpg');

export const scenarios = [
  {
    id: 22,
    name: 'Admin editing and uploads: hostile file names and contents',
    types: ['File Upload', 'Security', 'Penetration'],
    async run(ctx) {
      const c = new Client();
      await c.login(QA_ACCOUNTS.customer(22), QA_PASSWORD);

      // Upload one file through the avatar route (same storage the admin image uploads use), with a chosen
      // file name and bytes, and read back where it was stored.
      const send = async (bytes, filename, type) => {
        const fd = new FormData();
        fd.set('name', 'Khách hàng QA 22');
        fd.set('avatar', new Blob([bytes], { type }), filename);
        const r = await c.post('/ho-so', fd);
        const db = await ctx.infra.db();
        const u = await db.collection('users').findOne({ email: QA_ACCOUNTS.customer(22) });
        return {
          status: r.status,
          message: (r.text.match(/class="form-alert error">\s*([^<]+)/) || [])[1]?.trim() || null,
          avatar: u.avatar || null,
        };
      };

      const realJpg = readFileSync(REAL_JPG);
      const out = {};

      // 1) A valid image, but with a path-traversal file name. The stored name must be a random one inside
      //    the uploads folder — the client file name must not steer where the file lands.
      out.traversalName = await send(realJpg, '../../../../evil-traversal.jpg', 'image/jpeg');
      const storedOk = /^\/uploads\/images\/[0-9a-f-]+\.jpg$/i.test(out.traversalName.avatar || '');
      if (out.traversalName.avatar) ctx.track('avatars', out.traversalName.avatar);
      // Nothing may have been written outside the uploads/images folder
      const escapeTargets = [
        path.join(ROOT, 'evil-traversal.jpg'),
        path.join(PUBLIC, 'evil-traversal.jpg'),
        path.join(PUBLIC, 'uploads', 'evil-traversal.jpg'),
      ];
      const escaped = escapeTargets.filter((p) => existsSync(p));
      const storedFileExists = out.traversalName.avatar
        ? existsSync(path.join(PUBLIC, out.traversalName.avatar.replace(/^\//, '')))
        : false;

      // 2) A valid image, but with a script-bearing file name. Again, the name is discarded for a random one.
      out.scriptName = await send(realJpg, '<script>alert(1)</script>.jpg', 'image/jpeg');
      if (out.scriptName.avatar) ctx.track('avatars', out.scriptName.avatar);
      const scriptNameStored = /^\/uploads\/images\/[0-9a-f-]+\.jpg$/i.test(out.scriptName.avatar || '');

      // 3) An HTML/script polyglot renamed as a .jpg (image mimetype). The magic-byte check must reject it,
      //    so a would-be script file never becomes a served upload.
      const before = out.scriptName.avatar;
      out.htmlPolyglot = await send(Buffer.from('<script>alert(document.cookie)</script>'), 'x.jpg', 'image/jpeg');
      const polyglotRejected = out.htmlPolyglot.status === 400 || out.htmlPolyglot.avatar === before;

      // 4) A stored upload must be served as an image, never as HTML (so it can't execute in the browser).
      let served = null;
      if (storedOk && out.scriptName.avatar) {
        const r = await c.get(out.scriptName.avatar);
        served = { status: r.status, contentType: r.headers.get('content-type') };
      }
      const servedAsImage = served ? /^image\//i.test(served.contentType || '') : true;

      ctx.result('uploadAttack', {
        traversalName: out.traversalName,
        storedUnderRandomName: storedOk,
        storedFileExists,
        wroteOutsideUploads: escaped.map((p) => path.relative(ROOT, p)),
        scriptName: out.scriptName,
        scriptNameStored,
        htmlPolyglot: out.htmlPolyglot,
        polyglotRejected,
        served,
      });

      if (!storedOk || !storedFileExists) ctx.finding({ severity: 'high', title: 'An uploaded file name can steer where the file is stored', detail: `A path-traversal file name produced avatar=${JSON.stringify(out.traversalName.avatar)} (expected /uploads/images/<random>.jpg).`, fix: 'Store uploads under a generated name and a fixed folder (already done in middleware/upload.js); investigate the regression.' });
      if (escaped.length) ctx.finding({ severity: 'critical', title: 'An upload escaped the uploads folder', detail: `Files written outside public/uploads/images: ${escaped.map((p) => path.relative(ROOT, p)).join(', ')}.`, fix: 'Never use the client file name in the stored path.' });
      if (!polyglotRejected) ctx.finding({ severity: 'critical', title: 'A script file renamed as an image was accepted', detail: `An HTML/script body with a .jpg name and image mimetype was stored (status ${out.htmlPolyglot.status}).`, fix: 'Keep the magic-byte image check (isRealImageFile) on every upload.' });
      if (!servedAsImage) ctx.finding({ severity: 'high', title: 'An uploaded file is served as HTML', detail: `A stored upload came back as ${served && served.contentType}.`, fix: 'Serve /uploads with an image content-type and X-Content-Type-Options: nosniff.' });
    },
    async cleanup(ctx) {
      const fs = await import('node:fs');
      for (const url of (ctx.state.temp && ctx.state.temp.avatars) || []) {
        if (/^\/uploads\/images\//.test(url)) { try { fs.unlinkSync(path.join(PUBLIC, url.replace(/^\//, ''))); } catch { /* already gone */ } }
      }
      await (await ctx.infra.db()).collection('users').updateOne({ email: QA_ACCOUNTS.customer(22) }, { $set: { avatar: '' } });
      if (ctx.state.temp) ctx.state.temp.avatars = [];
    },
  },
];
