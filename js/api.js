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

  // ─── الدخول بحساب Google (عبر Supabase Auth، بدون مكتبات إضافية) ───
  // يرجع رابط صفحة Google، وبعد الموافقة يرجع المستخدم لنفس الصفحة ومعه الجلسة في الرابط
  function googleUrl(redirectTo) {
    return `${AUTH_URL}/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  // يقرأ الجلسة من الرابط بعد الرجوع من Google ويحفظها، ثم ينظّف الرابط
  async function consumeOAuthRedirect() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(location.search);
    const clean = () => history.replaceState(null, '', location.pathname + (query.has('error') ? '' : location.search));
    const err = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error');
    if (err) { clean(); throw fail('تعذر الدخول بحساب Google: ' + err.replace(/\+/g, ' '), 400, 'OAUTH_ERROR'); }
    const access = hash.get('access_token');
    if (!access) return null;
    clean();
    let email = '';
    try {
      const r = await fetch(`${AUTH_URL}/user`, { headers: { apikey: AUTH_KEY, Authorization: `Bearer ${access}` } });
      const u = await r.json();
      email = (u && u.email ? u.email : '').toLowerCase();
    } catch {}
    const s = {
      access_token: access,
      refresh_token: hash.get('refresh_token'),
      expires_at: Number(hash.get('expires_at')) || Math.floor(Date.now() / 1000) + (Number(hash.get('expires_in')) || 3600),
      email
    };
    saveSession(s);
    return s;
  }

  // ─── روابط المتاجر المختصرة: duja.devmenu.digital ───
  // الصفحة تعرف المتجر من النطاق إذا ما فيه ?client= (middleware.js يوجّه النطاق للصفحة)
  function hostSlug() {
    const m = location.hostname.toLowerCase().match(/^([a-z0-9-]+)\.devmenu\.digital$/);
    return m && m[1] !== 'app' && m[1] !== 'www' ? m[1] : '';
  }
  // رابط صفحة من صفحات المتجر: مختصر على نطاق المتجر، وإلا بالصيغة العادية
  function storePage(page, slug) {
    if (hostSlug()) return { menu: '/', links: '/links', waitlist: '/waitlist', pager: '/pager' }[page];
    return `${page}.html?client=${encodeURIComponent(slug)}`;
  }

  // الرابط الكامل لصفحة متجر (للمشاركة و QR والمعاينة): النطاق المختصر duja.devmenu.digital،
  // والروابط القديمة اللي ما تصلح كاسم نطاق (مثل اللي فيها _) تبقى بالصيغة العادية
  function storeUrl(slug, page = 'menu', params = {}) {
    const s = String(slug || '').toLowerCase();
    const qs = new URLSearchParams(params).toString();
    if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s) && s !== 'app' && s !== 'www') {
      const path = { menu: '/', links: '/links', waitlist: '/waitlist', pager: '/pager' }[page] || '/';
      return `https://${s}.devmenu.digital${path}${qs ? `?${qs}` : ''}`;
    }
    return new URL(`${page}.html?client=${encodeURIComponent(s)}${qs ? `&${qs}` : ''}`, location.href).href;
  }

  // ─── أرقام الجوال الدولية: قائمة رموز الدول + التحويل للصيغة الدولية بدون + ───
  const COUNTRIES = [
    ['966', '🇸🇦'], ['971', '🇦🇪'], ['965', '🇰🇼'], ['974', '🇶🇦'], ['973', '🇧🇭'], ['968', '🇴🇲'],
    ['20', '🇪🇬'], ['962', '🇯🇴'], ['964', '🇮🇶'], ['961', '🇱🇧'], ['967', '🇾🇪'], ['963', '🇸🇾'],
    ['970', '🇵🇸'], ['249', '🇸🇩'], ['218', '🇱🇾'], ['216', '🇹🇳'], ['213', '🇩🇿'], ['212', '🇲🇦'],
    ['90', '🇹🇷'], ['92', '🇵🇰'], ['91', '🇮🇳'], ['44', '🇬🇧'], ['1', '🇺🇸']
  ];
  const countryOptions = (selected = '966') =>
    COUNTRIES.map(([c, f]) => `<option value="${c}"${c === selected ? ' selected' : ''}>${f} +${c}</option>`).join('');
  // رمز الدولة المختار + الرقم المحلي ← 9665xxxxxxxx / 971501234567. لو كُتب الرقم كامل بـ + أو 00 يُعتمد كما هو.
  // السعودي لازم جوال (9665 + 8 أرقام)، والباقي 11–15 رقم. يرجّع '' لو الرقم غير صالح.
  function intlPhone(raw, code = '966') {
    const text = String(raw || '').trim();
    let d = text.replace(/\D/g, '');
    if (!d) return '';
    if (text.startsWith('+')) {}
    else if (d.startsWith('00')) d = d.slice(2);
    else {
      d = d.replace(/^0+/, '');
      if (!(d.startsWith(code) && d.length > code.length + 7)) d = code + d;
    }
    const ok = d.startsWith('966') ? /^9665\d{8}$/.test(d) : /^[1-9]\d{10,14}$/.test(d);
    return ok ? d : '';
  }
  // العكس للتعبئة: 966501234567 ← { code: '966', local: '0501234567' }
  function splitPhone(intl) {
    const d = String(intl || '').replace(/\D/g, '');
    const hit = COUNTRIES.map(([c]) => c).sort((a, b) => b.length - a.length).find(c => d.startsWith(c) && d.length > c.length + 6);
    if (!hit) return { code: '966', local: d };
    const local = d.slice(hit.length);
    return { code: hit, local: hit === '966' ? `0${local}` : local };
  }

  // ─── عملة المتجر ───
  // [الرمز، الاسم، الاختصار العربي، رمز يُكتب يسار الرقم (اختياري)]
  const CURRENCIES = [
    ['SAR', 'ريال سعودي', 'ر.س', '⃁'], ['AED', 'درهم إماراتي', 'د.إ'], ['KWD', 'دينار كويتي', 'د.ك'],
    ['QAR', 'ريال قطري', 'ر.ق'], ['BHD', 'دينار بحريني', 'د.ب'], ['OMR', 'ريال عماني', 'ر.ع'],
    ['EGP', 'جنيه مصري', 'ج.م'], ['JOD', 'دينار أردني', 'د.أ'], ['IQD', 'دينار عراقي', 'د.ع'],
    ['LBP', 'ليرة لبنانية', 'ل.ل'], ['YER', 'ريال يمني', 'ر.ي'], ['SYP', 'ليرة سورية', 'ل.س'],
    ['MAD', 'درهم مغربي', 'د.م'], ['DZD', 'دينار جزائري', 'د.ج'], ['TND', 'دينار تونسي', 'د.ت'],
    ['LYD', 'دينار ليبي', 'د.ل'], ['SDG', 'جنيه سوداني', 'ج.س'], ['TRY', 'ليرة تركية', '₺', '₺'],
    ['PKR', 'روبية باكستانية', 'روبية', 'Rs'], ['INR', 'روبية هندية', '₹', '₹'], ['GBP', 'جنيه إسترليني', '£', '£'],
    ['USD', 'دولار أمريكي', '$', '$'], ['EUR', 'يورو', '€', '€']
  ];
  const currency = (code) => CURRENCIES.find(c => c[0] === code) || CURRENCIES[0];
  const currencyOptions = (selected = 'SAR') =>
    CURRENCIES.map(([c, name, ab]) => `<option value="${c}"${c === selected ? ' selected' : ''}>${name} (${ab})</option>`).join('');
  // السعر للعرض: "⃁ 25" أو "$ 25" (الرمز يسار)، أو "25 د.إ" بالعربي و "AED 25" بالإنجليزي
  function money(n, code = 'SAR', lang = 'ar') {
    const [c, , ab, sym] = currency(code);
    if (sym) return `⁦${sym} ${n}⁩`;
    return lang === 'ar' ? `⁧${n} ${ab}⁩` : `⁦${c} ${n}⁩`;
  }
  // اختصار العملة كنص عادي (رسائل واتساب والعناوين): ر.س / SAR
  const currencyText = (code = 'SAR', lang = 'ar') => { const [c, , ab] = currency(code); return lang === 'ar' ? ab : c; };
  // للخانات (السعر، المبلغ): الرمز إن وُجد وإلا الاختصار
  const currencySign = (code = 'SAR') => { const [, , ab, sym] = currency(code); return sym || ab; };

  // كل التبويبات تشترك في نفس الدخول: لو تغيّر الحساب من تبويب ثاني نعيد تحميل الصفحة،
  // حتى ما تنرسل تعديلات لوحة مفتوحة باسم حساب ثاني
  function watchAccount() {
    const startEmail = (loadSession() || {}).email || '';
    window.addEventListener('storage', (e) => {
      if (e.key !== STORE_KEY) return;
      if (((loadSession() || {}).email || '') !== startEmail) location.reload();
    });
  }

  window.DM = {
    watchAccount,
    countryOptions,
    CURRENCY_CODES: CURRENCIES.map(c => c[0]),
    currencyOptions,
    money,
    currencyText,
    currencySign,
    intlPhone,
    splitPhone,
    storeUrl,
    hostSlug,
    storePage,
    googleUrl,
    consumeOAuthRedirect,
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
