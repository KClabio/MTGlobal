// npm run qa [-- --only 26,29] [--resume] [--status] [--pause] [--small] [--restart <ids>]
// The real-world test campaign (tests/qa/scenarios/*.mjs). Each scenario is one step, saved to
// tests/output/qa/progress.json after every step and inside long steps, so an interrupted run continues where it
// stopped:
//   --status       what is done and what is left
//   --resume       continue from the first unfinished step (also the default when a progress file exists)
//   --only 26,29   run just these scenarios (finished ones are run again)
//   --pause        ask a running campaign to stop after its current breakpoint (Ctrl+C does the same)
//   --restart 26   forget a scenario's saved progress and run it from the beginning
// The campaign never touches the owner's :3000 server or database: it runs its own MongoDB (:27018, data in
// tests/output/qa/mongo-data) with a copy of the site content, and its own site server on :3001.
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { QA_DIR, PROGRESS, PAUSE_FILE, infra } from './lib/infra.mjs';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const listArg = (f) => { const i = args.indexOf(f); return i === -1 ? null : String(args[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean); };
mkdirSync(QA_DIR, { recursive: true });

if (flag('--pause')) {
  writeFileSync(PAUSE_FILE, new Date().toISOString());
  console.log('Pause requested: the running campaign stops at its next breakpoint and saves its progress.');
  process.exit(0);
}

// Every scenario module exports `scenarios`: [{ id, name, types, run(ctx), cleanup?(ctx) }]
const SC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scenarios');
const all = [];
for (const f of readdirSync(SC_DIR).filter((f) => f.endsWith('.mjs')).sort()) {
  const mod = await import(pathToFileURL(path.join(SC_DIR, f)).href);
  all.push(...mod.scenarios);
}
all.sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));

const load = () => (existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : { started: new Date().toISOString(), steps: {} });
const progress = load();
const save = () => writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
for (const s of all) progress.steps[s.id] ||= { name: s.name, types: s.types, status: 'waiting', state: {}, results: {}, findings: [] };
for (const id of listArg('--restart') || []) if (progress.steps[id]) progress.steps[id] = { name: progress.steps[id].name, types: progress.steps[id].types, status: 'waiting', state: {}, results: {}, findings: [] };
save();

if (flag('--status')) {
  const counts = {};
  for (const s of all) {
    const st = progress.steps[s.id];
    counts[st.status] = (counts[st.status] || 0) + 1;
    const f = st.findings.length ? ` · ${st.findings.length} finding(s)` : '';
    const at = st.state && st.state.breakpoint ? ` · stopped at: ${st.state.breakpoint}` : '';
    console.log(`${String(s.id).padStart(3)}  ${st.status.padEnd(8)} ${s.name}${f}${at}`);
  }
  console.log('\n' + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));
  process.exit(0);
}

// Stop requests: Ctrl+C or --pause. Steps check ctx.stopRequested() at their breakpoints; a second Ctrl+C forces it.
let stop = false;
let ctrlC = 0;
process.on('SIGINT', () => {
  ctrlC++;
  if (ctrlC > 1) { console.log('\nForced stop: the step that was running will be cleaned and redone on resume.'); infra.shutdown().finally(() => process.exit(130)); return; }
  stop = true;
  console.log('\nStopping at the next breakpoint (Ctrl+C again to force)…');
});
if (existsSync(PAUSE_FILE)) unlinkSync(PAUSE_FILE);
const stopRequested = () => stop || existsSync(PAUSE_FILE);

const only = listArg('--only');
const queue = all.filter((s) => (only ? only.includes(String(s.id)) : progress.steps[s.id].status !== 'done' && progress.steps[s.id].status !== 'skipped'));
if (!queue.length) { console.log('Nothing left to run (npm run qa -- --status).'); process.exit(0); }

await infra.start({ small: flag('--small') });
let interrupted = false;
for (const s of queue) {
  if (stopRequested()) { interrupted = true; break; }
  const st = progress.steps[s.id];
  // A step that was running when the campaign was cut off: remove what it left behind, then redo it from its checkpoint
  if (st.status === 'running' && s.cleanup) {
    console.log(`[${s.id}] cleaning up after the interrupted run…`);
    try { await s.cleanup(makeCtx(s, st)); } catch (e) { console.log(`[${s.id}] cleanup: ${e.message}`); }
  }
  // --only on a finished step runs it again from the start; an unfinished one continues from its checkpoint
  if (only && (st.status === 'done' || st.status === 'failed')) { st.results = {}; st.findings = []; st.state = {}; }
  st.status = 'running';
  st.startedAt ||= new Date().toISOString();
  save();
  console.log(`[${s.id}] ${s.name}`);
  try {
    const outcome = await s.run(makeCtx(s, st));
    if (outcome === 'paused') { interrupted = true; console.log(`[${s.id}] paused at: ${st.state.breakpoint || 'start'}`); save(); break; }
    if (s.cleanup) await s.cleanup(makeCtx(s, st));
    st.status = 'done';
    st.endedAt = new Date().toISOString();
    st.state = { ...st.state, breakpoint: null };
  } catch (e) {
    st.status = 'failed';
    st.error = (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
    console.log(`[${s.id}] failed: ${st.error}`);
    if (s.cleanup) { try { await s.cleanup(makeCtx(s, st)); } catch { /* reported above */ } }
  }
  save();
  const f = st.findings.length ? ` (${st.findings.length} finding(s))` : '';
  console.log(`[${s.id}] ${st.status}${f}`);
}
await infra.shutdown();
if (existsSync(PAUSE_FILE)) unlinkSync(PAUSE_FILE);
console.log(interrupted ? '\nPaused. Continue with: npm run qa -- --resume' : '\nFinished. See: npm run qa -- --status');
process.exit(0);

function makeCtx(s, st) {
  return {
    id: s.id,
    infra,
    state: st.state,
    results: st.results,
    stopRequested,
    /** A breakpoint: saves `patch` into the step's state; returns true when the step should stop now. */
    checkpoint(label, patch = {}) {
      Object.assign(st.state, patch, { breakpoint: label, savedAt: new Date().toISOString() });
      save();
      return stopRequested();
    },
    result(key, value) { st.results[key] = value; save(); },
    finding(f) {
      // Same title twice (a redone step) is kept once
      const i = st.findings.findIndex((x) => x.title === f.title);
      if (i === -1) st.findings.push(f); else st.findings[i] = f;
      save();
    },
    /** Temporary data this step created, removed by its cleanup() (also after a crash) */
    track(kind, value) { (st.state.temp ||= {})[kind] ||= []; st.state.temp[kind].push(value); save(); },
    log: (...a) => console.log(`[${s.id}]`, ...a),
  };
}
