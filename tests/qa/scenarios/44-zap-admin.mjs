// 44 · OWASP ZAP logged in as the owner: spider, passive and active scan of the admin pages, on the QA copy only.
// A scan like this posts made-up values into every form, so:
//  - it runs last, and it stays away from what would end its own login or remove accounts or content (excludePaths);
//  - the QA database's collections are saved first and put back afterwards, with the saved copies inside the same
//    database, so an interrupted run is put right by the next one;
//  - public/uploads is shared with the development site (the QA copy has its own database, not its own disk), so the
//    folder is copied first; afterwards anything missing comes back, anything new goes, and a difference fails the step.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { QA_DIR, ROOT, BASE, QA_PASSWORD } from '../lib/infra.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { Client } from '../lib/http.mjs';
import { ZAP_CANDIDATES, readAlerts, runZap } from './38-zap.mjs';

const OUT = path.join(QA_DIR, 'zap-admin');
const UPLOADS = path.join(ROOT, 'public', 'uploads');
const UPLOADS_COPY = path.join(OUT, 'uploads-copy');
const SAVED = ['articles', 'helpitems', 'partners', 'products', 'projects', 'quoterequests', 'services', 'sitesettings', 'solutionpages', 'users'];
const backupName = (name) => `zapbak_${name}`;

function plan({ sid, minutes }) {
  const esc = (s) => `'${BASE.replace(/\./g, '\\.')}${s}'`;
  const dir = OUT.replace(/\\/g, '/');
  return `env:
  contexts:
    - name: mtg-admin
      urls: ['${BASE}/admin']
      includePaths: [${esc('/admin.*')}]
      excludePaths: [${esc('/admin/.*/xoa.*')}, ${esc('/admin/nguoi-dung/.+')}, ${esc('/dang-xuat.*')}, ${esc('/uploads/.*')}]
  parameters:
    failOnError: false
    progressToStdout: true
jobs:
  - type: replacer
    rules:
      - description: Owner login
        matchType: req_header
        matchString: Cookie
        matchRegex: false
        replacementString: "connect.sid=${sid}"
  - type: passiveScan-config
    parameters:
      maxAlertsPerRule: 10
  - type: spider
    parameters:
      context: mtg-admin
      maxDuration: 5
  - type: passiveScan-wait
    parameters:
      maxDuration: 10
  - type: activeScan
    parameters:
      context: mtg-admin
      maxScanDurationInMins: ${minutes}
      maxRuleDurationInMins: 5
  - type: passiveScan-wait
    parameters:
      maxDuration: 5
  - type: report
    parameters:
      template: traditional-json
      reportDir: "${dir}"
      reportFile: zap-admin-report
`;
}

/** Every file under a folder, as paths relative to it */
function filesIn(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? filesIn(p, base) : [path.relative(base, p)];
  });
}

async function saveCollections(db) {
  for (const name of SAVED) await db.collection(name).aggregate([{ $out: backupName(name) }]).toArray();
}

async function restoreCollections(db) {
  const present = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const name of SAVED) {
    if (!present.has(backupName(name))) continue;
    await db.collection(backupName(name)).aggregate([{ $out: name }]).toArray();
    await db.collection(backupName(name)).drop();
  }
}

/** Puts public/uploads back as it was; → how many files came back and how many were removed */
function restoreUploads() {
  if (!existsSync(UPLOADS_COPY)) return { returned: 0, removed: 0 };
  const before = new Set(filesIn(UPLOADS_COPY));
  const now = new Set(filesIn(UPLOADS));
  let returned = 0;
  let removed = 0;
  for (const f of before) {
    if (!now.has(f)) { cpSync(path.join(UPLOADS_COPY, f), path.join(UPLOADS, f)); returned += 1; }
  }
  for (const f of now) {
    if (!before.has(f)) { rmSync(path.join(UPLOADS, f), { force: true }); removed += 1; }
  }
  return { returned, removed };
}

export const scenarios = [
  {
    id: 44,
    name: 'OWASP ZAP logged in as the owner: spider, passive and active scan of the admin pages',
    types: ['Security', 'OWASP ZAP', 'Penetration'],
    async run(ctx) {
      const zap = ZAP_CANDIDATES.find((p) => existsSync(p));
      if (!zap) throw new Error('ZAP is not installed (winget install ZAP.ZAP), or set ZAP_BAT to zap.bat');
      mkdirSync(OUT, { recursive: true });
      const { infra } = await import('../lib/infra.mjs');
      const db = await infra.db();
      await restoreCollections(db); // left by an interrupted run
      restoreUploads();
      rmSync(UPLOADS_COPY, { recursive: true, force: true });
      cpSync(UPLOADS, UPLOADS_COPY, { recursive: true });
      await saveCollections(db);
      // One row per kind of error, each with a count: a kind already seen in an earlier step only raises its count
      const errorTotal = async () => (await db.collection('errorlogs').find({}).project({ count: 1 }).toArray()).reduce((sum, e) => sum + (e.count || 1), 0);
      const errorsBefore = await errorTotal();

      const owner = new Client();
      await owner.login(QA_ACCOUNTS.owner, QA_PASSWORD);
      const opened = (await owner.get('/admin')).status;
      if (opened !== 200) throw new Error(`the owner could not open /admin before the scan: HTTP ${opened}`);

      const planFile = path.join(OUT, 'plan.yaml');
      writeFileSync(planFile, plan({ sid: owner.cookies.get('connect.sid'), minutes: process.env.QA_FAST ? 2 : 40 }));
      ctx.log('ZAP running on the admin pages (spider, passive, active up to 40 min)…');
      const r = await runZap(zap, path.join(OUT, 'home'), planFile);
      writeFileSync(path.join(OUT, 'zap-output.txt'), r.output);
      const reportFile = path.join(OUT, 'zap-admin-report.json');
      if (!existsSync(reportFile)) throw new Error(`ZAP wrote no report (exit ${r.status}); see tests/output/qa/zap-admin/zap-output.txt`);

      const alerts = readAlerts(reportFile);
      const byRisk = (risk) => alerts.filter((a) => a.risk === risk);
      // The site must have survived the scan: a failed request here is a result, not a failed step
      const alive = (() => { try { process.kill(infra.serverPid, 0); return true; } catch { return false; } })();
      let stillIn = false;
      let afterScan = '';
      try {
        const after = await owner.get('/admin');
        stillIn = after.status === 200;
        afterScan = `HTTP ${after.status}${after.location ? ` to ${after.location}` : ''}`;
      } catch (e) {
        afterScan = `${e.message}: ${(e.cause && (e.cause.code || e.cause.message)) || 'no cause given'}`;
      }
      ctx.log(`after the scan: server process alive: ${alive}; /admin: ${afterScan}`);
      if (!alive) ctx.finding({ severity: 'high', title: 'ZAP admin scan: the site stopped during the scan', detail: `The server process ended. /admin afterwards: ${afterScan}. See tests/output/qa/server.log.`, fix: 'Find the request that ended it; a bad form value must never stop the site.' });
      const adminUrls = new Set(alerts.flatMap((a) => a.urls).filter((u) => u.startsWith('/admin')));
      const newErrors = await db.collection('errorlogs').find({}).sort({ lastAt: -1 }).limit(10).project({ message: 1, path: 1, count: 1 }).toArray();
      const errorsAfter = await errorTotal();
      ctx.result('zapAdmin', { exit: r.status, alerts, stillIn, alive, afterScan, adminUrlsInAlerts: adminUrls.size, serverErrors: errorsAfter - errorsBefore, errorSamples: errorsAfter > errorsBefore ? newErrors : [], counts: { high: byRisk('high').length, medium: byRisk('medium').length, low: byRisk('low').length, info: byRisk('info').length } });
      ctx.log(`alerts: ${byRisk('high').length} high, ${byRisk('medium').length} medium, ${byRisk('low').length} low, ${byRisk('info').length} info; admin addresses in alerts: ${adminUrls.size}; still logged in: ${stillIn}; new server errors: ${errorsAfter - errorsBefore}`);

      if (!stillIn) ctx.finding({ severity: 'low', title: 'ZAP admin scan: the owner was logged out during the scan', detail: 'The scan may have covered less than planned: read tests/output/qa/zap-admin/zap-output.txt.', fix: 'Find what ended the login and add it to excludePaths.' });
      for (const a of alerts.filter((x) => x.risk === 'high' || x.risk === 'medium')) {
        ctx.finding({ severity: a.risk, title: `ZAP admin: ${a.name}`, detail: `${a.count} place(s), confidence ${a.confidence}, CWE-${a.cwe}. E.g. ${a.urls.join(', ')}`, fix: a.solution || 'See tests/output/qa/zap-admin/zap-admin-report.json.' });
      }
      if (byRisk('low').length) ctx.finding({ severity: 'low', title: `ZAP admin: ${byRisk('low').length} low-risk notes`, detail: byRisk('low').map((a) => `${a.name} (${a.count})`).join('; '), fix: 'Each to be checked.' });
      if (errorsAfter > errorsBefore) ctx.finding({ severity: 'medium', title: `ZAP admin: ${errorsAfter - errorsBefore} server errors during the scan`, detail: newErrors.map((e) => `${e.path || ''}: ${String(e.message || '').slice(0, 120)} (${e.count}×)`).join('; '), fix: 'A form should answer bad values with a message, not a 500.' });
    },
    async cleanup(ctx) {
      const { infra } = await import('../lib/infra.mjs');
      const db = await infra.db();
      await restoreCollections(db);
      await db.collection('loginthrottles').deleteMany({});
      const { returned, removed } = restoreUploads();
      const same = filesIn(UPLOADS).length === filesIn(UPLOADS_COPY).length;
      ctx.log(`put back: ${returned} upload file(s) returned, ${removed} removed; folder as before: ${same}`);
      if (existsSync(UPLOADS_COPY) && !same) throw new Error('public/uploads is not as it was: see tests/output/qa/zap-admin/uploads-copy');
      rmSync(UPLOADS_COPY, { recursive: true, force: true });
    },
  },
];
