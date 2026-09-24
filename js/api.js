// =====================================================================
// DEV MENU — عميل الواجهة
// • تسجيل الدخول: مع Supabase Auth مباشرة (رمز التحقق بالبريد فقط)
// • كل البيانات: عبر خادمنا /api/... — المتصفح ما يلمس قاعدة البيانات
// =====================================================================
(function () {
  // مفتاح Supabase العام هنا لتسجيل الدخول فقط، وما يعطي أي صلاحية على البيانات
  const AUTH_URL = 'https://czdoamcgxgkicrbufpcn.supabase.co/auth/v1';
  const AUTH_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6ZG9hbWNneGdraWNyYnVmcGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTA5MzAsImV4cCI6MjEwNTU4NjkzMH0.45zKx4ljXJ27SS-ukc62qiu52movhDgSoC9OEnK9NHk';
  const STORE_KEY = 'dm_session';

  const loadSession = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; } };
  const saveSession = (s) => { try { s ? localStorage.setItem(STORE_KEY, JSON.stringify(s)) : localStorage.removeItem(STORE_KEY); } catch {} };
  const toSession = (d) => ({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    email: ((d.user && d.user.email) || '').toLowerCase()
  });
  const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

  // ─── Supabase Auth ───
  async function auth(path, body, token) {
    const headers = { 'Content-Type': 'application/json', apikey: AUTH_KEY };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try { res = await fetch(`${AUTH_URL}/${path}`, { method: 'POST', headers, body: JSON.stringify(body || {}) }); }
    catch { throw fail('تعذر الاتصال، تحقق من الإنترنت', 0); }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const raw = (data && (data.msg || data.error_description || data.message || data.error)) || '';
      if (res.status === 429 || /rate limit|security purposes/i.test(raw)) throw fail('طلبت رموزاً كثيرة، انتظر دقيقة ثم حاول مرة أخرى', 429, 'RATE_LIMIT');
      throw fail(raw || 'تعذر إكمال العملية', res.status);
    }
    return data;
  }

  let refreshing = null;
  function refresh() {
    const s = loadSession();
    if (!s || !s.refresh_token) return Promise.resolve(null);
    if (!refreshing) {
      refreshing = auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
        .then(d => { const ns = toSession(d); if (!ns.email) ns.email = s.email; saveSession(ns); return ns; })
        .catch(e => { if (e.status && e.status < 500) saveSession(null); return null; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function accessToken() {
    let s = loadSession();
    if (!s) return null;
    if (!s.expires_at || s.expires_at - 60 < Date.now() / 1000) s = await refresh();
    return s && s.access_token;
  }

  // ─── خادمنا ───
  async function request(path, { method = 'GET', body, auth: needAuth = false, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try { res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
    catch { throw fail('تعذر الاتصال بالخادم، تحقق من الإنترنت', 0); }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw fail((data && data.error) || 'حدث خطأ في الخادم', res.status, data && data.code);
    return data;
  }

  async function call(path, opts = {}) {
    if (!opts.auth) return request(path, opts);
    const t = await accessToken();
    if (!t) throw fail('انتهت الجلسة، سجّل دخولك مرة ثانية', 401, 'NO_SESSION');
    try {
      return await request(path, { ...opts, token: t });
    } catch (e) {
      if (e.status !== 401) throw e;
      const ns = await refresh();
      if (!ns) throw e;
      return request(path, { ...opts, token: ns.access_token });
    }
  }

  // رفع ملف برابط موقّع من الخادم، مع نسبة التقدم وإعادة المحاولة
  function putFile(url, file, onProgress, attempt = 1) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('apikey', AUTH_KEY);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = 'فشل رفع الملف';
        try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
        reject(fail(msg, xhr.status));
      };
      xhr.onerror = () => {
        if (attempt < 3) return setTimeout(() => putFile(url, file, onProgress, attempt + 1).then(resolve, reject), attempt * 1500);
        reject(fail('انقطع الاتصال أثناء الرفع. تأكد من الإنترنت وجرّب مرة ثانية', 0));
      };
      const fd = new FormData();
      fd.append('cacheControl', '3600');
      fd.append('', file);
      xhr.send(fd);
    });
  }

  window.DM = {
    session: loadSession,
    signedIn: () => !!loadSession(),
    sendOtp: (email) => auth('otp', { email, create_user: true }),
    async verifyOtp(email, token) {
      const d = await auth('verify', { type: 'email', email, token });
      if (!d || !d.access_token) throw fail('رمز التحقق غير صحيح أو منتهي الصلاحية', 400);
      const s = toSession(d);
      if (!s.email) s.email = email;
      saveSession(s);
      return s;
    },
    async logout() {
      const s = loadSession();
      saveSession(null);
      if (s) auth('logout', {}, s.access_token).catch(() => {});
    },
    get: (path, needAuth = false) => call(path, { auth: needAuth }),
    post: (path, body, needAuth = false) => call(path, { method: 'POST', body: body || {}, auth: needAuth }),
    putFile
  };
})();
