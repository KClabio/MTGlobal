// Test data in the dev database (MONGO_URI from .env). Everything a test adds is removed by cleanup():
// temp users (zztest-…@example.com) with their sessions, records registered with removeLater(),
// and documents saved with restoreLater() are put back as they were.
import 'dotenv/config';
import mongoose from 'mongoose';
import { BASE } from './browser.mjs';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db';
const STAMP = Date.now();
const users = [];
const removals = []; // [collection, filter]
const restores = []; // [collection, docs]

export async function db() {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGO_URI);
  return mongoose.connection.db;
}

/** Registers a user through the site and returns { email, password, sid, id }. role: 'admin' | 'owner' | 'customer'. */
export async function createUser(tag, role = 'admin') {
  const email = `zztest-${tag}-${STAMP}@example.com`;
  const password = 'secret1';
  const res = await fetch(BASE + '/dang-ky', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ name: `ZZ ${tag}`, email, password, confirmPassword: password }) });
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
  if (!cookie) throw new Error(`register failed for ${email} (HTTP ${res.status})`);
  const d = await db();
  const user = await d.collection('users').findOne({ email });
  users.push(user._id);
  if (role !== 'customer') await d.collection('users').updateOne({ _id: user._id }, { $set: { role } });
  return { email, password, id: user._id, sid: cookie.split(';')[0].slice('connect.sid='.length) };
}

/** Deletes the matching records at cleanup (e.g. removeLater('quoterequests', { name: /^ZZ / })). */
export function removeLater(collection, filter) { removals.push([collection, filter]); }

/** Saves the matching documents now and writes them back at cleanup. */
export async function restoreLater(collection, filter) {
  const docs = await (await db()).collection(collection).find(filter).toArray();
  restores.push([collection, docs]);
  return docs;
}

export async function cleanup() {
  if (mongoose.connection.readyState !== 1) return;
  const d = mongoose.connection.db;
  for (const [collection, docs] of restores.reverse()) {
    for (const doc of docs) await d.collection(collection).replaceOne({ _id: doc._id }, doc);
  }
  for (const [collection, filter] of removals) await d.collection(collection).deleteMany(filter);
  // also accounts a test registered itself with this run's stamp (zztest-<tag>-<stamp>@example.com)
  for (const u of await d.collection('users').find({ email: new RegExp(`^zztest-.*-${STAMP}@example\\.com$`) }).toArray()) {
    if (!users.some((id) => String(id) === String(u._id))) users.push(u._id);
  }
  for (const id of users) {
    await d.collection('sessions').deleteMany({ session: { $regex: String(id) } });
    await d.collection('users').deleteOne({ _id: id });
  }
  await mongoose.disconnect();
}

export const stamp = STAMP;
