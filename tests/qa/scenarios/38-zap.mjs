// 38 · OWASP ZAP (the standard free security scanner), run headless from the Windows app with its Automation
// Framework against the QA copy only (:3001, own database):
//  - spider over the public site, then a passive scan (headers, cookies, information leaks…);
//  - a customer's own pages fetched with that customer's login, passive scan only;
//  - an active scan (injection, XSS, path traversal… attempts) of the public pages. Admin pages are left out of
//    the active scan: it would fill the QA copy's admin with junk without testing more code paths than the
//    public forms already do (admin input is covered by use cases 22 and 33).
// Install: winget install EclipseAdoptium.Temurin.17.JRE && winget install ZAP.ZAP
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from '../lib/http.mjs';
import { QA_ACCOUNTS } from '../lib/data.mjs';
import { QA_PASSWORD, QA_DIR, BASE, QA_MONGO, QA_DB } from '../lib/infra.mjs';

export const ZAP_CANDIDATES = [
  process.env.ZAP_BAT,
  'C:\\Program Files\\ZAP\\Zed Attack Proxy\\zap.bat',
  'C:\\Program Files (x86)\\ZAP\\Zed Attack Proxy\\zap.bat',
  'C:\\Program Files\\OWASP\\Zed Attack Proxy\\zap.bat',
].filter(Boolean);
const RISK = { 3: 'high', 2: 'medium', 1: 'low', 0: 'info' };

/**
 * Runs ZAP and waits for it without stopping this program (also used by 44-zap-admin.mjs). This program reads the
 * site's log through a pipe, and on Windows a program writing to a full pipe waits: if nobody reads for a while, the
 * site itself stops answering after about 64 KB of log. So never spawnSync here.
 */
export function runZap(zap, home, planFile) {
  return new Promise((resolve) => {
    const child = spawn('cmd.exe', ['/c', zap, '-cmd', '-dir', home, '-autorun', planFile], { cwd: path.dirname(zap), windowsHide: true, timeout: 90 * 60 * 1000 });
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => chunks.push(c));
    child.on('error', (err) => { chunks.push(Buffer.from(String(err))); });
    child.on('close', (status) => resolve({ status, output: Buffer.concat(chunks).toString('utf8') }));
  });
}

/** ZAP's JSON report → one plain record per alert (also used by 44-zap-admin.mjs) */
export function readAlerts(reportFile) {
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  return (report.site || []).flatMap((s) => s.alerts || []).map((a) => ({
    name: a.name, risk: RISK[a.riskcode] || 'info', confidence: a.confidence, count: Number(a.count) || (a.instances || []).length,
    cwe: a.cweid, urls: [...new Set((a.instances || []).map((i) => String(i.uri || '').replace(BASE, '')))].slice(0, 6),
    solution: String(a.solution || '').replace(/<[^>]+>/g, '').slice(0, 300),
  }));
}

function plan({ outDir, sid, minutes }) {
  // ZAP reads these as regular expressions; in YAML single quotes a backslash is kept as it is (only the dots need one)
  const esc = (s) => `'${BASE.replace(/\./g, '\\.')}${s}'`;
  return `env:
  contexts:
    - name: mtg-qa
      urls: ['${BASE}']
      includePaths: [${esc('.*')}]
      excludePaths: [${esc('/dang-xuat.*')}, ${esc('/admin.*')}, ${esc('/uploads/.*')}, ${esc('/dang-nhap/google.*')}]
  parameters:
    failOnError: false
    progressToStdout: true
jobs:
  - type: passiveScan-config
    parameters:
      maxAlertsPerRule: 10
  - type: spider
    parameters:
      context: mtg-qa
      maxDuration: 5
  - type: requestor
    requests:
      - url: "${BASE}/tai-khoan"
        method: GET
        headers: ["Cookie: connect.sid=${sid}"]
      - url: "${BASE}/ho-so"
        method: GET
        headers: ["Cookie: connect.sid=${sid}"]
  - type: passiveScan-wait
    parameters:
      maxDuration: 10
  - type: activeScan
    parameters:
      context: mtg-qa
      maxScanDurationInMins: ${minutes}
      maxRuleDurationInMins: 5
  - type: passiveScan-wait
    parameters:
      maxDuration: 5
  - type: report
    parameters:
      template: traditional-json
      reportDir: "${outDir.replace(/\\/g, '/')}"
      reportFile: zap-report
  - type: report
    parameters:
      template: traditional-html
      reportDir: "${outDir.replace(/\\/g, '/')}"
      reportFile: zap-report
`;
}

export const scenarios = [
  {
    id: 38,
    name: 'OWASP ZAP scan: spider + passive scan, customer pages (passive), active scan of the public pages',
    types: ['Security', 'OWASP ZAP', 'Penetration'],
    async run(ctx) {
      const zap = ZAP_CANDIDATES.find((p) => existsSync(p));
      if (!zap) throw new Error('ZAP is not installed (winget install ZAP.ZAP), or set ZAP_BAT to zap.bat');
      const outDir = path.join(QA_DIR, 'zap');
      mkdirSync(outDir, { recursive: true });
      const cust = new Client(); await cust.login(QA_ACCOUNTS.customer(10), QA_PASSWORD);
      const planFile = path.join(outDir, 'plan.yaml');
      writeFileSync(planFile, plan({ outDir, sid: cust.cookies.get('connect.sid'), minutes: process.env.QA_FAST ? 2 : 40 }));
      ctx.log('ZAP running (spider, passive, active up to 40 min)…');
      const r = await runZap(zap, path.join(outDir, 'home'), planFile);
      writeFileSync(path.join(outDir, 'zap-output.txt'), r.output);
      const reportFile = path.join(outDir, 'zap-report.json');
      if (!existsSync(reportFile)) throw new Error(`ZAP wrote no report (exit ${r.status}); see tests/output/qa/zap/zap-output.txt`);
      const alerts = readAlerts(reportFile);
      const byRisk = (r2) => alerts.filter((a) => a.risk === r2);
      ctx.result('zap', { exit: r.status, alerts, counts: { high: byRisk('high').length, medium: byRisk('medium').length, low: byRisk('low').length, info: byRisk('info').length } });
      ctx.log(`alerts: ${byRisk('high').length} high, ${byRisk('medium').length} medium, ${byRisk('low').length} low, ${byRisk('info').length} info`);
      for (const a of alerts.filter((x) => x.risk === 'high' || x.risk === 'medium')) {
        ctx.finding({ severity: a.risk, title: `ZAP: ${a.name}`, detail: `${a.count} place(s), confidence ${a.confidence}, CWE-${a.cwe}. E.g. ${a.urls.join(', ')}`, fix: a.solution || 'See the ZAP report (tests/output/qa/zap/zap-report.html).' });
      }
      if (byRisk('low').length) ctx.finding({ severity: 'low', title: `ZAP: ${byRisk('low').length} low-risk notes`, detail: byRisk('low').map((a) => `${a.name} (${a.count})`).join('; '), fix: 'Each is checked in the report: fixed when cheap, otherwise explained.' });
    },
    async cleanup() {
      // The active scan sends many wrong logins: clear the QA copy's login limits so the next use cases can log in
      const { MongoClient } = await import('mongodb');
      const m = new MongoClient(QA_MONGO); await m.connect();
      await m.db(QA_DB).collection('loginthrottles').deleteMany({});
      await m.close();
    },
  },
];
