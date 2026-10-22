// The campaign's own environment, apart from the owner's site and data:
//  - MongoDB on :27018 (data in tests/output/qa/mongo-data), database mtglobal_qa;
//  - the site on :3001 using it (optionally as a "small server": 1 CPU core, 512 MB of memory);
//  - the content (pages, products, projects, news, partners, services, settings) copied once from the dev
//    database, which is only read; users and requests are made up for the tests (no real personal data).
import { spawn, execFileSync, execFile } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const QA_DIR = path.join(ROOT, 'tests', 'output', 'qa');
export const PROGRESS = path.join(QA_DIR, 'progress.json');
export const PAUSE_FILE = path.join(QA_DIR, 'PAUSE');
const MONGO_DATA = path.join(QA_DIR, 'mongo-data');
const MONGOD = 'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe';
export const QA_MONGO = 'mongodb://127.0.0.1:27018';
export const QA_DB = 'mtglobal_qa';
const DEV_URI = 'mongodb://127.0.0.1:27017';
const DEV_DB = 'mtglobal_db';
export const PORT = 3001;
export const BASE = `http://localhost:${PORT}`;
export const QA_PASSWORD = 'qa-Secret-2026';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Process ids of the QA site and database, so a run that was killed can be cleaned up by the next one
const PIDS = path.join(QA_DIR, 'pids.json');
const readPids = () => { try { return JSON.parse(readFileSync(PIDS, 'utf8')); } catch { return {}; } };
const writePid = (k, pid) => { const p = readPids(); if (pid) p[k] = pid; else delete p[k]; writeFileSync(PIDS, JSON.stringify(p)); };
function killPid(pid) { try { execFileSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' }); } catch { /* not running */ } }

let mongod = null;
let server = null;
let serverSmall = false;
let client = null;

async function mongoUp() {
  const c = new MongoClient(QA_MONGO, { serverSelectionTimeoutMS: 800 });
  try { await c.connect(); await c.db('admin').command({ ping: 1 }); return true; } catch { return false; } finally { await c.close().catch(() => {}); }
}
async function siteUp() { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }

export const infra = {
  get small() { return serverSmall; },
  get serverPid() { return server && server.pid; },

  async db() {
    if (!client) { client = new MongoClient(QA_MONGO, { serverSelectionTimeoutMS: 3000 }); await client.connect(); }
    return client.db(QA_DB);
  },

  async startMongo() {
    if (await mongoUp()) return;
    mkdirSync(MONGO_DATA, { recursive: true });
    mongod = spawn(MONGOD, ['--port', '27018', '--bind_ip', '127.0.0.1', '--dbpath', MONGO_DATA, '--quiet'], { stdio: ['ignore', 'ignore', 'pipe'] });
    writePid('mongod', mongod.pid);
    for (let i = 0; i < 60; i++) { await sleep(250); if (await mongoUp()) return; }
    throw new Error('QA MongoDB did not start on :27018');
  },
  async stopMongo() {
    if (client) { await client.close().catch(() => {}); client = null; }
    const c = new MongoClient(QA_MONGO, { serverSelectionTimeoutMS: 1500 });
    try { await c.connect(); await c.db('admin').command({ shutdown: 1, force: true }); } catch { /* shutting down closes the socket */ } finally { await c.close().catch(() => {}); }
    for (let i = 0; i < 40 && (await mongoUp()); i++) await sleep(250);
    mongod = null; writePid('mongod', null);
  },

  /** The site on :3001 against the QA database. small: 1 CPU core and 512 MB, like a small cloud server. */
  async startServer({ small = false, env = {} } = {}) {
    if (await siteUp()) {
      if (server) return;
      throw new Error(`Port ${PORT} is already used by another server (npm test running?). Stop it first.`);
    }
    const log = createWriteStream(path.join(QA_DIR, 'server.log'), { flags: 'a' });
    const args = small ? ['--max-old-space-size=512', 'server.js'] : ['server.js'];
    server = spawn(process.execPath, args, {
      cwd: ROOT,
      env: {
        ...process.env, PORT: String(PORT), MONGO_URI: `${QA_MONGO}/${QA_DB}`, SESSION_SECRET: 'qa-session-secret',
        GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_OAUTH_TEST_URL: 'http://localhost:3002', GOOGLE_REDIRECT_URL: '',
        CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '', CLOUDINARY_URL: '', ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.pipe(log); server.stderr.pipe(log);
    writePid('server', server.pid);
    serverSmall = small;
    if (small) {
      // One CPU core for the whole process (Windows processor affinity)
      execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${server.pid}).ProcessorAffinity = 1`]);
    }
    for (let i = 0; i < 80; i++) { await sleep(250); if (await siteUp()) return; }
    throw new Error('QA site did not start on :3001 (see tests/output/qa/server.log)');
  },
  async stopServer() {
    if (!server) return;
    const s = server; server = null; writePid('server', null);
    s.kill();
    for (let i = 0; i < 40 && (await siteUp()); i++) await sleep(250);
    void s;
  },
  async restartServer(opts) { await this.stopServer(); await this.startServer(opts); },

  /** Memory (MB), CPU seconds and open handles of the site process (asynchronous: never blocks a load run).
   *  Memory is the process's own committed memory: the working set jumps around because Windows trims it. */
  stats() {
    if (!server) return Promise.resolve(null);
    const pid = server.pid;
    return new Promise((resolve) => {
      const cmd = `$p = Get-Process -Id ${pid}; "$($p.PrivateMemorySize64) $($p.TotalProcessorTime.TotalSeconds) $($p.Handles)"`;
      execFile('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }, (err, out) => {
        if (err) return resolve(null);
        const v = out.trim().split(' ');
        resolve({ memMB: Math.round(+v[0] / 1048576), cpuSec: +(+v[1]).toFixed(2), handles: +v[2] });
      });
    });
  },

  /** Copies the content once, and makes the test accounts and requests */
  async seed() {
    const db = await this.db();
    if (await db.collection('qa_meta').findOne({ _id: 'seeded' })) return false;
    const dev = new MongoClient(DEV_URI, { serverSelectionTimeoutMS: 3000 });
    await dev.connect();
    try {
      const src = dev.db(DEV_DB);
      for (const { name } of await src.listCollections().toArray()) {
        if (['sessions', 'users', 'quoterequests'].includes(name)) continue;
        const docs = await src.collection(name).find({}).toArray();
        await db.collection(name).deleteMany({});
        if (docs.length) await db.collection(name).insertMany(docs);
        // same indexes as the original
        for (const ix of await src.collection(name).indexes()) {
          if (ix.name === '_id_') continue;
          const { key, name: n, v, ns, ...opts } = ix; void v; void ns;
          await db.collection(name).createIndex(key, { name: n, ...opts }).catch(() => {});
        }
      }
    } finally { await dev.close(); }
    await db.collection('qa_meta').insertOne({ _id: 'seeded', at: new Date() });
    return true;
  },

  async start({ small = false } = {}) {
    // Left over from a run that was killed: its site server (its database is reused)
    const old = readPids();
    if (old.server) { killPid(old.server); writePid('server', null); await sleep(500); }
    // The campaign itself (simulated visitors) keeps off CPU core 0, which a "small server" run gets to itself
    try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${process.pid}).ProcessorAffinity = ${2 ** Math.min(32, (await import('node:os')).cpus().length) - 2}`]); } catch { /* keep all cores */ }
    await this.startMongo();
    await this.startServer({ small });
    await this.seed();
    const db = await this.db();
    if (!(await db.collection('qa_meta').findOne({ _id: 'accounts' }))) {
      // Accounts go through the real sign-up (passwords hashed by the site); roles set afterwards
      const { makeAccounts, makeRequests } = await import('./data.mjs');
      await makeAccounts(this);
      await makeRequests(this);
      await db.collection('qa_meta').insertOne({ _id: 'accounts', at: new Date() });
    }
  },
  async shutdown() {
    await this.stopServer();
    await this.stopMongo();
  },
};
