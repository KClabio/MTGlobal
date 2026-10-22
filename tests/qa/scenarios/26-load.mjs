// 26–32 · Load, stress, spike, endurance, simultaneous forms, uploads under load, database outage.
// QA_FAST=1 shortens every run (used to test the checkpoints); real runs use the durations in the plan.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runUsers, summarize, makeFlows, LOAD_MARK } from '../lib/load.mjs';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, ROOT, PROGRESS } from '../lib/infra.mjs';

const FAST = process.env.QA_FAST === '1';
const sec = (n) => (FAST ? Math.max(5, Math.round(n / 30)) : n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function publicPages() {
  const p = JSON.parse(readFileSync(PROGRESS, 'utf8'));
  const list = p.steps[0] && p.steps[0].results.pages && p.steps[0].results.pages.list;
  if (!list) throw new Error('Run scenario 0 (smoke) first: it finds the pages the visitors use.');
  return list;
}

/** Runs users with a stats sampler; returns the summary plus server memory/CPU over the run */
async function measured(ctx, opts) {
  const samples = [];
  const timer = setInterval(async () => { const s = await ctx.infra.stats(); if (s) samples.push({ t: Date.now(), ...s }); }, 5000);
  const first = await ctx.infra.stats();
  const t0 = Date.now();
  const records = await runUsers({ ...opts, shouldStop: ctx.stopRequested });
  clearInterval(timer);
  const last = await ctx.infra.stats();
  const seconds = (Date.now() - t0) / 1000;
  const s = summarize(records, seconds);
  s.server = first && last ? { memStartMB: first.memMB, memPeakMB: Math.max(first.memMB, ...samples.map((x) => x.memMB), last.memMB), memEndMB: last.memMB, cpuPercentOfOneCore: Math.round((100 * (last.cpuSec - first.cpuSec)) / seconds) } : null;
  s.seconds = Math.round(seconds);
  s.complete = !ctx.stopRequested();
  return { summary: s, records };
}

async function removeLoadRequests(ctx) {
  await (await ctx.infra.db()).collection('quoterequests').deleteMany({ message: { $regex: LOAD_MARK.replace(/[[\]]/g, '\\$&') } });
}

/** Per-10-second view of a run, for the spike and outage timelines */
function timeline(records, t0, step = 10000) {
  const buckets = new Map();
  for (const r of records) {
    const k = Math.floor((r.t - t0) / step);
    const b = buckets.get(k) || { ms: [], errors: 0 };
    if (r.kind === 'page') b.ms.push(r.ms);
    if (r.error || r.status >= 500) b.errors++;
    buckets.set(k, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([k, b]) => {
    const ms = b.ms.sort((x, y) => x - y);
    return { at: `${(k * step) / 1000}s`, pages: ms.length, p95: Math.round(ms[Math.floor(ms.length * 0.95)] || 0), errors: b.errors };
  });
}

export const scenarios = [
  {
    id: 26,
    name: 'Normal busy day: 20, 30, 50 people at once (small and strong server)',
    types: ['Load', 'Performance', 'Scalability'],
    async run(ctx) {
      const flows = makeFlows(publicPages());
      const stages = ctx.state.stages || {};
      for (const small of [true, false]) {
        for (const users of [20, 30, 50]) {
          const key = `${small ? 'small' : 'strong'}-${users}`;
          if (stages[key]) continue; // finished before an interruption
          await ctx.infra.restartServer({ small });
          ctx.log(`${key}: ${users} people for ${sec(600)} s…`);
          const { summary } = await measured(ctx, { users, seconds: sec(600), rampSec: sec(30), flows });
          await removeLoadRequests(ctx);
          if (!summary.complete) { ctx.checkpoint(`${key} (interrupted, will be redone)`, { stages }); return 'paused'; }
          stages[key] = summary;
          ctx.result(key, summary);
          ctx.log(`${key}: page p50 ${summary.pageMs.p50} ms, p95 ${summary.pageMs.p95} ms, errors ${summary.errors}, ${summary.pagesPerSecond} pages/s, CPU ${summary.server && summary.server.cpuPercentOfOneCore}%`);
          if (ctx.checkpoint(`${key} done`, { stages })) return 'paused';
        }
      }
      const worst = stages['small-50'];
      if (worst && (worst.pageMs.p95 > 1000 || worst.errors)) {
        ctx.finding({ severity: 'high', title: '50 people at once is too slow on a small server', detail: `p95 page time ${worst.pageMs.p95} ms, ${worst.errors} errors`, fix: 'See the speed and capacity items in the report.' });
      }
      await ctx.infra.restartServer({ small: false });
    },
    cleanup: removeLoadRequests,
  },
  {
    id: 27,
    name: 'Breaking point: 50 → 800 people, little waiting (stress)',
    types: ['Stress', 'Scalability'],
    async run(ctx) {
      const flows = makeFlows(publicPages());
      const st = ctx.state.stress || {};
      for (const small of [true, false]) {
        const mode = small ? 'small' : 'strong';
        st[mode] ||= { steps: {} };
        if (st[mode].done) continue;
        await ctx.infra.restartServer({ small });
        for (const users of [50, 100, 200, 400, 800]) {
          if (st[mode].steps[users]) { if (st[mode].steps[users].broke) break; continue; }
          ctx.log(`${mode}: ${users} people, 0.5–1.5 s between pages, ${sec(90)} s…`);
          const { summary } = await measured(ctx, { users, seconds: sec(90), rampSec: sec(15), think: [500, 1500], flows });
          await removeLoadRequests(ctx);
          if (!summary.complete) { ctx.checkpoint(`${mode}-${users} (interrupted, will be redone)`, { stress: st }); return 'paused'; }
          summary.broke = summary.pageMs.p95 > 3000 || summary.errorRate > 2;
          st[mode].steps[users] = summary;
          ctx.log(`${mode}-${users}: p95 ${summary.pageMs.p95} ms, errors ${summary.errorRate}%, ${summary.pagesPerSecond} pages/s, mem ${summary.server && summary.server.memPeakMB} MB${summary.broke ? '  ← limit reached' : ''}`);
          if (ctx.checkpoint(`${mode}-${users} done`, { stress: st })) return 'paused';
          if (summary.broke) break;
        }
        // Recovery: does it come back by itself once the crowd leaves?
        await sleep(5000);
        const { summary: after } = await measured(ctx, { users: 10, seconds: sec(60), rampSec: 5, flows });
        st[mode].recovery = after;
        st[mode].done = true;
        ctx.result(mode, st[mode]);
        if (ctx.checkpoint(`${mode} done`, { stress: st })) return 'paused';
      }
      await ctx.infra.restartServer({ small: false });
    },
    cleanup: removeLoadRequests,
  },
  {
    id: 28,
    name: 'Sudden rush: 0 → 200 people in 10 seconds (spike)',
    types: ['Spike', 'Performance'],
    async run(ctx) {
      const flows = makeFlows(publicPages());
      await ctx.infra.restartServer({ small: true });
      const t0 = Date.now();
      const records = [];
      const onRecord = (r) => records.push(r);
      ctx.log('10 people for a minute, then 200 more arrive within 10 s for a minute, then they leave…');
      await Promise.all([
        runUsers({ users: 10, seconds: sec(240), rampSec: 5, flows, onRecord, keep: false, shouldStop: ctx.stopRequested }),
        (async () => { await sleep(sec(60) * 1000); await runUsers({ users: 200, seconds: sec(60), rampSec: FAST ? 2 : 10, flows, onRecord, keep: false, shouldStop: ctx.stopRequested }); })(),
      ]);
      await removeLoadRequests(ctx);
      if (ctx.stopRequested()) { ctx.checkpoint('interrupted (the spike is redone as a whole)'); return 'paused'; }
      const tl = timeline(records, t0);
      const before = summarize(records.filter((r) => r.t - t0 < sec(60) * 1000), sec(60));
      const during = summarize(records.filter((r) => r.t - t0 >= sec(60) * 1000 && r.t - t0 < sec(120) * 1000), sec(60));
      const after = summarize(records.filter((r) => r.t - t0 >= sec(150) * 1000), sec(90));
      ctx.result('timeline', tl);
      ctx.result('before', before); ctx.result('during', during); ctx.result('after', after);
      ctx.log(`before p95 ${before.pageMs.p95} ms · during p95 ${during.pageMs.p95} ms, errors ${during.errors} · after p95 ${after.pageMs.p95} ms`);
      if (during.errors) ctx.finding({ severity: 'high', title: 'Errors during a sudden rush of 200 visitors', detail: `${during.errors} failed requests (${during.errorKinds.join(', ')})`, fix: 'See capacity items in the report.' });
      await ctx.infra.restartServer({ small: false });
    },
    cleanup: removeLoadRequests,
  },
  {
    id: 29,
    name: 'Long day: 30 people for 4 hours (endurance)',
    types: ['Endurance', 'Performance'],
    async run(ctx) {
      const flows = makeFlows(publicPages());
      const totalMin = FAST ? 3 : 240;
      const minutes = ctx.state.minutes || [];
      if (minutes.length >= totalMin) return;
      await ctx.infra.restartServer({ small: true });
      const db = await ctx.infra.db();
      if (minutes.length) minutes.push({ gap: true, at: new Date().toISOString(), note: 'resumed after an interruption (server restarted)' });
      let bucket = [];
      let minuteStart = Date.now();
      const done = () => minutes.filter((m) => !m.gap).length;
      const remaining = totalMin - done();
      ctx.log(`${remaining} minute(s) to go (${done()} done before)…`);
      let stopEarly = false;
      const ticker = setInterval(async () => {
        const recs = bucket; bucket = [];
        const s = summarize(recs, (Date.now() - minuteStart) / 1000); minuteStart = Date.now();
        const stats = await ctx.infra.stats();
        const sessions = await db.collection('sessions').countDocuments().catch(() => null);
        const conns = await db.admin().command({ serverStatus: 1 }).then((x) => x.connections.current).catch(() => null);
        minutes.push({ at: new Date().toISOString(), pages: s.pageViews, p50: s.pageMs.p50, p95: s.pageMs.p95, errors: s.errors, memMB: stats && stats.memMB, handles: stats && stats.handles, cpuSec: stats && stats.cpuSec, sessions, mongoConnections: conns });
        if (ctx.checkpoint(`minute ${done()} of ${totalMin}`, { minutes })) stopEarly = true;
        if (done() % 15 === 0) { ctx.log(`minute ${done()}: p95 ${s.pageMs.p95} ms, memory ${stats && stats.memMB} MB, sessions ${sessions}`); await removeLoadRequests(ctx); }
      }, 60000 / (FAST ? 6 : 1));
      await runUsers({ users: 30, seconds: (remaining * 60) / (FAST ? 6 : 1) + 2, rampSec: 20, flows, keep: false, onRecord: (r) => bucket.push(r), shouldStop: () => stopEarly || ctx.stopRequested() });
      clearInterval(ticker);
      await removeLoadRequests(ctx);
      if (done() < totalMin) return 'paused';
      const real = minutes.filter((m) => !m.gap);
      const firstHour = real.slice(5, 65); const lastHour = real.slice(-60);
      const avg = (a, k) => Math.round(a.reduce((s, m) => s + (m[k] || 0), 0) / Math.max(1, a.length));
      ctx.result('trend', { memFirstHourMB: avg(firstHour, 'memMB'), memLastHourMB: avg(lastHour, 'memMB'), p95FirstHour: avg(firstHour, 'p95'), p95LastHour: avg(lastHour, 'p95'), sessionsEnd: real[real.length - 1].sessions, errors: real.reduce((s, m) => s + m.errors, 0) });
      await ctx.infra.restartServer({ small: false });
    },
    cleanup: removeLoadRequests,
  },
  {
    id: 30,
    name: '50 requests sent at the same moment',
    types: ['Load', 'Database', 'Integration'],
    async run(ctx) {
      const db = await ctx.infra.db();
      const clients = [];
      for (let i = 1; i <= 50; i++) { const c = new Client(); await c.login(QA_ACCOUNTS.customer(i), QA_PASSWORD); clients.push(c); }
      const before = await db.collection('quoterequests').countDocuments();
      const t0 = Date.now();
      const res = await Promise.all(clients.map((c, i) => c.post('/lien-he', { name: `Khách hàng QA ${i + 1}`, email: QA_ACCOUNTS.customer(i + 1), phone: '0901234567', schoolOrCompany: 'Trường QA', message: `${LOAD_MARK} cùng lúc #${i + 1}`, interestedIn: 'thiet-bi-stem' }).catch((e) => ({ status: 0, error: e.message }))));
      const took = Date.now() - t0;
      const saved = await db.collection('quoterequests').find({ message: { $regex: 'cùng lúc #' } }).project({ message: 1, user: 1 }).toArray();
      const unique = new Set(saved.map((s) => s.message));
      const after = await db.collection('quoterequests').countDocuments();
      const r = { sent: 50, ok303: res.filter((x) => x.status === 303).length, saved: saved.length, unique: unique.size, countChange: after - before, totalMs: took, slowestMs: Math.round(Math.max(...res.map((x) => x.ms || 0))) };
      ctx.result('simultaneous', r);
      ctx.log(JSON.stringify(r));
      if (r.saved !== 50 || r.unique !== 50) ctx.finding({ severity: 'critical', title: 'Requests lost or doubled when many are sent at once', detail: JSON.stringify(r), fix: 'Investigate the save path.' });
      // the admin dashboard counts them all
      const a = new Client(); await a.login(QA_ACCOUNTS.admin, QA_PASSWORD);
      const dash = await a.get('/admin');
      ctx.result('dashboardAfter', { status: dash.status, ms: Math.round(dash.ms) });
    },
    cleanup: removeLoadRequests,
  },
  {
    id: 31,
    name: '10 people upload profile photos while 30 browse',
    types: ['Load', 'File Upload'],
    async run(ctx) {
      const flows = makeFlows(publicPages());
      await ctx.infra.restartServer({ small: true });
      const photo = readFileSync(path.join(ROOT, 'public', 'assets', 'giai-phap', 'workshop', 'hoc-sinh-lap-rap-2.jpg'));
      const uploads = [];
      const t0 = Date.now();
      const browsing = measured(ctx, { users: 30, seconds: sec(180), rampSec: 10, flows });
      await Promise.all(Array.from({ length: 10 }, async (_, i) => {
        const c = new Client(); await c.login(QA_ACCOUNTS.customer(60 + i), QA_PASSWORD);
        while (Date.now() - t0 < sec(170) * 1000 && !ctx.stopRequested()) {
          const fd = new FormData();
          fd.set('name', `Khách hàng QA ${60 + i}`);
          fd.set('avatar', new Blob([photo], { type: 'image/jpeg' }), 'anh.jpg');
          const r = await c.post('/ho-so', fd).catch((e) => ({ status: 0, ms: 0, error: e.message }));
          uploads.push({ status: r.status, ms: r.ms });
          await sleep(3000 + Math.random() * 4000);
        }
      }));
      const { summary } = await browsing;
      const ums = uploads.map((u) => u.ms).sort((a, b) => a - b);
      const up = { count: uploads.length, ok: uploads.filter((u) => u.status === 200).length, p50: Math.round(ums[Math.floor(ums.length / 2)] || 0), p95: Math.round(ums[Math.floor(ums.length * 0.95)] || 0) };
      ctx.result('uploads', up);
      ctx.result('browsing', summary);
      ctx.log(`uploads ${up.ok}/${up.count} ok, p95 ${up.p95} ms; browsing p95 ${summary.pageMs.p95} ms, errors ${summary.errors}`);
      await ctx.infra.restartServer({ small: false });
    },
    async cleanup(ctx) {
      await removeLoadRequests(ctx);
      // The site deletes a replaced photo itself; the last photo of each QA account is removed here
      const db = await ctx.infra.db();
      const users = await db.collection('users').find({ email: /^qa-customer-/, avatar: /^\/uploads\/images\// }).toArray();
      const fs = await import('node:fs');
      for (const u of users) {
        const file = path.join(ROOT, 'public', u.avatar);
        try { fs.unlinkSync(file); } catch { /* already gone */ }
        await db.collection('users').updateOne({ _id: u._id }, { $set: { avatar: '' } });
      }
    },
  },
  {
    id: 32,
    name: 'The database stops for 30 s during traffic, then comes back',
    types: ['Resilience', 'Error Message', 'Integration'],
    async run(ctx) {
      const flows = makeFlows(publicPages());
      await ctx.infra.restartServer({ small: false });
      const t0 = Date.now();
      const records = [];
      const health = [];
      let polling = true;
      const poll = (async () => {
        while (polling) {
          const t = Date.now();
          try { const r = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(5000) }); health.push({ t: t - t0, status: r.status }); } catch (e) { health.push({ t: t - t0, status: 0, error: e.name }); }
          await sleep(1000);
        }
      })();
      const users = runUsers({ users: 20, seconds: 120, rampSec: 5, think: [1000, 3000], flows, keep: false, onRecord: (r) => records.push(r), shouldStop: ctx.stopRequested });
      await sleep(30000);
      ctx.log('stopping the QA database…');
      const downAt = Date.now() - t0;
      await ctx.infra.stopMongo();
      await sleep(30000);
      ctx.log('starting it again…');
      await ctx.infra.startMongo();
      const upAt = Date.now() - t0;
      await users;
      polling = false; await poll;
      const firstOkAfter = health.find((h) => h.t > upAt && h.status === 200);
      const during = records.filter((r) => r.t - t0 > downAt + 2000 && r.t - t0 < upAt);
      const r = {
        downAt, upAt,
        healthDuring: [...new Set(health.filter((h) => h.t > downAt + 2000 && h.t < upAt).map((h) => h.status))],
        recoveredAfterMs: firstOkAfter ? firstOkAfter.t - upAt : null,
        duringPages: during.filter((x) => x.kind === 'page').length,
        duringStatuses: [...new Set(during.map((x) => x.status))],
        duringSlowestMs: Math.round(Math.max(0, ...during.map((x) => x.ms))),
        duringP95Ms: Math.round(during.map((x) => x.ms).sort((a, b) => a - b)[Math.floor(during.length * 0.95)] || 0),
        duringUnder1s: during.length ? Math.round((100 * during.filter((x) => x.ms < 1000).length) / during.length) : null,
        timeline: timeline(records, t0),
        serverAlive: (await fetch('http://localhost:3001/health').then((x) => x.status).catch(() => 0)) === 200,
      };
      ctx.result('outage', r);
      ctx.log(`health during: ${r.healthDuring}; slowest page during: ${r.duringSlowestMs} ms; recovered after ${r.recoveredAfterMs} ms; server alive: ${r.serverAlive}`);
      if (!r.serverAlive) ctx.finding({ severity: 'critical', title: 'The site does not come back after a database outage', detail: JSON.stringify(r).slice(0, 400), fix: 'Reconnect handling / process manager restart.' });
      if (r.duringSlowestMs > 15000) ctx.finding({ severity: 'medium', title: 'Pages hang while the database is down', detail: `the slowest page waited ${r.duringSlowestMs} ms before answering`, fix: 'Shorter database timeouts (serverSelectionTimeoutMS / bufferTimeoutMS) so visitors get the error page quickly.' });
    },
    async cleanup(ctx) { await ctx.infra.startMongo(); await removeLoadRequests(ctx); },
  },
];
