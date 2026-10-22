// Made-up accounts and requests for the QA database (no real personal data)
import { Client } from './http.mjs';
import { QA_PASSWORD } from './infra.mjs';

export const QA_ACCOUNTS = {
  owner: 'qa-owner@example.com',
  admin: 'qa-admin@example.com',
  customer: (i) => `qa-customer-${i}@example.com`,
};
export const CUSTOMERS = 80;

async function register(name, email) {
  const r = await new Client().post('/dang-ky', { name, email, password: QA_PASSWORD, confirmPassword: QA_PASSWORD });
  if (r.status !== 303 && !/đã được đăng ký|already registered/i.test(r.text)) throw new Error(`sign-up failed for ${email}: HTTP ${r.status}`);
}

export async function makeAccounts(infra) {
  const db = await infra.db();
  await register('QA Owner', QA_ACCOUNTS.owner);
  await register('QA Admin', QA_ACCOUNTS.admin);
  for (let i = 1; i <= CUSTOMERS; i++) await register(`Khách hàng QA ${i}`, QA_ACCOUNTS.customer(i));
  await db.collection('users').updateOne({ email: QA_ACCOUNTS.owner }, { $set: { role: 'owner' } });
  await db.collection('users').updateOne({ email: QA_ACCOUNTS.admin }, { $set: { role: 'admin' } });
}

const AREAS = ['giai-phap-stem-lab', 'thiet-bi-stem', 'workshop-stem', 'dao-tao-stem', 'tap-huan-stem', 'san-pham-robot', 'tu-van-du-hoc', 'phan-phoi-san-pham', 'khac'];
const STATUSES = ['moi', 'da_lien_he', 'hoan_tat'];

/** 400 requests over the last 12 months, so the dashboard and lists have realistic amounts to show */
export async function makeRequests(infra) {
  const db = await infra.db();
  const users = await db.collection('users').find({ role: 'customer' }).project({ _id: 1, name: 1, email: 1 }).toArray();
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const docs = [];
  for (let i = 0; i < 400; i++) {
    const u = users[Math.floor(rnd() * users.length)];
    const at = new Date(Date.now() - Math.floor(rnd() * 365) * 86400000);
    docs.push({
      name: u.name, email: u.email, phone: '0900000' + String(100 + i).slice(-3), schoolOrCompany: `Trường QA ${1 + (i % 25)}`,
      message: `Yêu cầu thử nghiệm số ${i + 1}: cần tư vấn phòng STEM cho ${20 + (i % 30)} học sinh.`,
      interestedIn: AREAS[Math.floor(rnd() * AREAS.length)], status: STATUSES[Math.floor(rnd() * 3)],
      user: u._id, editedAt: null, details: [], createdAt: at, updatedAt: at, __v: 0,
    });
  }
  await db.collection('quoterequests').insertMany(docs);
}
