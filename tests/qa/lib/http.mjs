// A tiny browser-like HTTP client: keeps cookies, follows nothing by itself, times every request.
import { createRequire } from 'node:module';
import { BASE, QA_TWO_STEP_SECRET } from './infra.mjs';

const twoFactor = createRequire(import.meta.url)('../../../lib/two-factor.js');
/** The made-up staff's two-step code right now (lib/two-factor.js) */
export const twoStepCode = () => twoFactor.codeFor(twoFactor.base32Decode(QA_TWO_STEP_SECRET), twoFactor.stepAt());

export class Client {
  constructor(base = BASE) { this.base = base; this.cookies = new Map(); }
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(pathname, { method = 'GET', body, headers = {}, redirect = 'manual', timeout = 30000 } = {}) {
    const h = { accept: 'text/html', ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    let payload = body;
    if (body && !(body instanceof FormData) && typeof body === 'object' && !(body instanceof URLSearchParams)) {
      // Like a real visitor, tick "Tôi đồng ý với Chính sách bảo mật" on sign-up and request forms (unless a scenario sets it)
      const consentForm = method === 'POST' && /^\/(dang-ky|lien-he|san-pham\/[^/]+\/yeu-cau|dich-vu\/[^/]+\/yeu-cau|tai-khoan\/yeu-cau\/[^/]+\/sua)(\?|$)/.test(pathname);
      payload = new URLSearchParams(consentForm ? { agreePrivacy: '1', ...body } : body);
    }
    const t0 = performance.now();
    const res = await fetch(this.base + pathname, { method, body: payload, headers: h, redirect, signal: AbortSignal.timeout(timeout) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i); const v = pair.slice(i + 1);
      if (/expires=Thu, 01 Jan 1970/i.test(c) || v === '') this.cookies.delete(k); else this.cookies.set(k, v);
    }
    const text = await res.text();
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, text, ms: performance.now() - t0 };
  }
  get(p, o) { return this.req(p, o); }
  post(p, body, o = {}) { return this.req(p, { ...o, method: 'POST', body }); }
  async login(email, password) {
    let r = await this.post('/dang-nhap', { email, password });
    if (r.status !== 303) throw new Error(`login failed for ${email}: HTTP ${r.status}`);
    // Staff: the two-step code page next (the made-up staff have the fixed key QA_TWO_STEP_SECRET)
    if (r.location === '/dang-nhap/xac-minh') {
      r = await this.post('/dang-nhap/xac-minh', { code: twoStepCode() });
      if (r.status !== 303) throw new Error(`two-step code refused for ${email}: HTTP ${r.status}`);
    }
    await this.get('/'); // uses up the one-time "Đăng nhập thành công" notice
    return r;
  }
}
