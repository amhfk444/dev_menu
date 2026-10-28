// =====================================================================
// DEV MENU — اللغتين (عربي / English)
// العربي هو الأصل في الصفحات. لو اختار الزائر English نحمّل قاموس الصفحة ونترجم النصوص
// اللي تطلع (حتى اللي تنضاف بعدين من الجافاسكربت ورسائل الخادم) بدون ما نلمس كود الصفحات.
//   <script src="/js/i18n.js" data-dict="loyalty"></script>   (في <head> قبل أي شي)
//   زر التبديل: أي عنصر فيه data-lang-toggle، وإلا يطلع زر صغير في الزاوية
//   نص ما يترجم (اسم محل، رسالة كتبها صاحب المحل): ضعه داخل عنصر فيه data-no-i18n
// القاموس: النص العربي ← الإنجليزي. والنصوص اللي فيها أرقام أو أسماء: {n} مكان المتغير
// =====================================================================
(function () {
  const KEY = 'dm_lang';
  const script = document.currentScript;
  const dicts = ['common'].concat(((script && script.dataset.dict) || '').split(/[\s,]+/).filter(Boolean));
  let lang = 'ar';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ar' || q === 'en') localStorage.setItem(KEY, q);
    lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'ar';
  } catch {}

  const exact = new Map();
  const patterns = [];
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const AR = /[؀-ۿ]/;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function add(dict) {
    for (const [ar, en] of Object.entries(dict || {})) {
      const k = norm(ar);
      if (!k.includes('{')) { exact.set(k, en); continue; }
      // "~" في أول المفتاح: قالب صارم، ما يترجم إلا لو كل أجزائه انترجمت (مثل "الأحد والاثنين")
      const strict = k.startsWith('~'), body = strict ? k.slice(1) : k;
      const names = [];
      const re = new RegExp('^' + escRe(body).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return '(.+?)'; }) + '$');
      patterns.push({ re, names, en, strict, lit: body.replace(/\{\w+\}/g, '').length });
    }
    // الأطول نصاً أول: "ختم دبل {d} من {a} إلى {b}" قبل "{h} بالليل" عشان القصير ما يبلع الجملة كلها
    patterns.sort((a, b) => b.lit - a.lit);
  }
  // الترجمة: نفس النص بالضبط، وإلا قالب فيه متغيرات (والمتغيرات نفسها تترجم لو لها ترجمة)
  function tr(s) {
    if (lang !== 'en' || !s || !AR.test(s)) return s;
    const k = norm(s);
    if (exact.has(k)) return exact.get(k);
    for (const p of patterns) {
      const m = k.match(p.re);
      if (!m) continue;
      let miss = false;
      const out = p.en.replace(/\{(\w+)\}/g, (_, n) => { const v = m[p.names.indexOf(n) + 1]; if (v == null) return ''; const o = tr(v); if (o === v && AR.test(v)) miss = true; return o; });
      if (!(p.strict && miss)) return out;
    }
    return s;
  }
  function t(s, vars) {
    let out = tr(s);
    if (vars) out = out.replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
    return out;
  }

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tip'];
  const skip = (el) => el && el.closest && el.closest('[data-no-i18n], script, style, textarea, [contenteditable="true"]');
  // نحفظ العربي الأصلي لكل نص نترجمه، عشان نرجّعه لما يرجع الزائر للعربي بدون تحديث الصفحة
  const textOrig = new WeakMap(), attrOrig = new WeakMap();
  function textNode(n) {
    const v = n.nodeValue;
    if (!v || skip(n.parentElement)) return;
    if (lang === 'en') {
      if (!AR.test(v)) return;
      const out = tr(v);
      if (out === v) return;
      const en = v.match(/^\s*/)[0] + out + v.match(/\s*$/)[0];
      textOrig.set(n, { ar: v, en });
      n.nodeValue = en;
    } else {
      const o = textOrig.get(n);
      if (o && v === o.en) n.nodeValue = o.ar;
    }
  }
  function element(el) {
    if (el.closest('[data-no-i18n]')) return;   // خانات الكتابة: نترجم التلميح (placeholder) بس، مو اللي كتبه الزائر
    const saved = attrOrig.get(el) || {};
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v) continue;
      if (lang === 'en') {
        if (!AR.test(v)) continue;
        const o = tr(v);
        if (o !== v) { saved[a] = { ar: v, en: o }; el.setAttribute(a, o); }
      } else if (saved[a] && v === saved[a].en) el.setAttribute(a, saved[a].ar);
    }
    attrOrig.set(el, saved);
    if (el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type)) {
      if (lang === 'en' && AR.test(el.value)) { const o = tr(el.value); if (o !== el.value) { saved.value = { ar: el.value, en: o }; el.value = o; } }
      else if (lang !== 'en' && saved.value && el.value === saved.value.en) el.value = saved.value.ar;
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1) return;
    element(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) n.nodeType === 3 ? textNode(n) : element(n);
  }
  let titleAr = '';
  function title() {
    const cur = document.title;
    if (lang === 'en') { if (AR.test(cur)) { titleAr = cur; const o = tr(cur); if (o !== cur) document.title = o; } }
    else if (titleAr) { const ar = titleAr; titleAr = ''; document.title = ar; }
  }

  // القواميس: تنحمّل مرة وحدة، أول ما يحتاجها الزائر
  const ver = (script && script.src.split('?')[1]) || '';
  let loading = null;
  const loadDicts = () => loading || (loading = Promise.all(dicts.map(d => fetch(`/js/i18n/${d}.json${ver ? '?' + ver : ''}`).then(r => r.ok ? r.json() : {}).catch(() => ({}))))
    .then(list => list.forEach(add)));

  function applyDir() {
    const html = document.documentElement;
    html.lang = lang; html.dir = lang === 'en' ? 'ltr' : 'rtl';
    html.classList.toggle('lang-en', lang === 'en');
  }
  // تبديل اللغة على طول بدون تحديث الصفحة
  async function setLang(next) {
    next = next === 'en' ? 'en' : 'ar';
    if (next === lang) return;
    try { localStorage.setItem(KEY, next); } catch {}
    if (next === 'en') await loadDicts();
    lang = next;
    applyDir();
    title();
    walk(document.body);
    button();
    window.dispatchEvent(new CustomEvent('dm:lang', { detail: lang }));
  }
  const toggle = () => setLang(lang === 'en' ? 'ar' : 'en');
  function button() {
    const label = lang === 'en' ? 'عربي' : 'English';
    const spots = [...document.querySelectorAll('[data-lang-toggle]')];
    if (!spots.length && !(script && script.dataset.toggle === 'none')) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dm-lang-btn'; b.setAttribute('data-lang-toggle', '');
      const st = document.createElement('style');
      st.textContent = '.dm-lang-btn{position:fixed;top:12px;inset-inline-end:12px;z-index:90;font:700 12px/1 "IBM Plex Sans Arabic",system-ui,sans-serif;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.92);color:#22362a;border:1px solid rgba(34,54,42,.15);box-shadow:0 6px 16px -10px rgba(0,0,0,.4)}';
      document.head.appendChild(st); document.body.appendChild(b); spots.push(b);
    }
    spots.forEach(b => { b.textContent = label; b.setAttribute('data-no-i18n', ''); b.setAttribute('lang', lang === 'en' ? 'ar' : 'en'); b.onclick = (e) => { e.preventDefault(); toggle(); }; });
  }

  window.DMi18n = { get lang() { return lang; }, t, toggle, setLang, add };

  // التواريخ والأوقات: الصفحات تطلبها بالعربي (ar-SA)، وبالإنجليزي نخليها إنجليزي
  const enLoc = (loc, en) => lang === 'en' && typeof loc === 'string' && /^ar/i.test(loc) ? en : loc;
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const orig = Date.prototype[fn];
    Date.prototype[fn] = function (loc, opts) { return orig.call(this, enLoc(loc, 'en-GB'), opts); };
  }
  const nf = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, opts) { return nf.call(this, enLoc(loc, 'en-US'), opts); };
  // رسائل المتصفح (alert / confirm / prompt)
  const [A, C, P] = [window.alert, window.confirm, window.prompt];
  window.alert = (m) => A.call(window, t(String(m ?? '')));
  window.confirm = (m) => C.call(window, t(String(m ?? '')));
  window.prompt = (m, d) => P.call(window, t(String(m ?? '')), d);

  // أول تحميل بالإنجليزي: نخفي الصفحة لين يوصل القاموس (بحد أقصى ثانية ونص) عشان ما يطلع العربي ويختفي
  let show = () => {};
  if (lang === 'en') {
    applyDir();
    const hide = document.createElement('style');
    hide.textContent = 'body{visibility:hidden}';
    document.head.appendChild(hide);
    show = () => hide.remove();
    setTimeout(show, 1500);
  }
  const ready = new Promise(r => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r());
  Promise.all([lang === 'en' ? loadDicts() : null, ready]).then(() => {
    title();
    walk(document.body);
    button();
    // اللي ينضاف أو يتغير بعدين (رسائل، نوافذ، بيانات من الخادم) يترجم لحاله
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') element(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    // عنوان الصفحة (الصفحات تغيّره بعد ما يوصل اسم المحل)
    const titleEl = document.querySelector('title');
    if (titleEl) new MutationObserver(title).observe(titleEl, { childList: true, characterData: true, subtree: true });
    show();
  });
})();
