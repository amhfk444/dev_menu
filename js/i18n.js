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
      patterns.push({ re, names, en, strict });
    }
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
  function textNode(n) {
    const v = n.nodeValue;
    if (!v || !AR.test(v) || skip(n.parentElement)) return;
    const out = tr(v);
    if (out !== v) {
      const lead = v.match(/^\s*/)[0], tail = v.match(/\s*$/)[0];
      n.nodeValue = lead + out + tail;
    }
  }
  function element(el) {
    if (skip(el)) return;
    for (const a of ATTRS) { const v = el.getAttribute(a); if (v && AR.test(v)) { const o = tr(v); if (o !== v) el.setAttribute(a, o); } }
    if ((el.tagName === 'INPUT' && /^(button|submit)$/i.test(el.type)) && AR.test(el.value)) el.value = tr(el.value);
  }
  function walk(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1) return;
    element(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) n.nodeType === 3 ? textNode(n) : element(n);
  }

  function toggle() {
    try { localStorage.setItem(KEY, lang === 'en' ? 'ar' : 'en'); } catch {}
    const u = new URL(location.href); u.searchParams.delete('lang');
    location.replace(u.toString());
  }
  function button() {
    const label = lang === 'en' ? 'عربي' : 'English';
    const spots = document.querySelectorAll('[data-lang-toggle]');
    spots.forEach(b => { b.textContent = label; b.setAttribute('data-no-i18n', ''); b.setAttribute('lang', lang === 'en' ? 'ar' : 'en'); b.onclick = (e) => { e.preventDefault(); toggle(); }; });
    if (spots.length || (script && script.dataset.toggle === 'none')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('data-no-i18n', ''); b.setAttribute('lang', lang === 'en' ? 'ar' : 'en');
    b.className = 'dm-lang-btn'; b.onclick = toggle;
    const st = document.createElement('style');
    st.textContent = '.dm-lang-btn{position:fixed;top:12px;inset-inline-end:12px;z-index:90;font:700 12px/1 "IBM Plex Sans Arabic",system-ui,sans-serif;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.92);color:#22362a;border:1px solid rgba(34,54,42,.15);box-shadow:0 6px 16px -10px rgba(0,0,0,.4)}';
    document.head.appendChild(st); document.body.appendChild(b);
  }

  window.DMi18n = { lang, t, toggle, add };
  if (lang !== 'en') { document.addEventListener('DOMContentLoaded', button); return; }

  // English: الاتجاه من اليسار، ونخفي الصفحة لين يوصل القاموس (بحد أقصى ثانية ونص) عشان ما يطلع العربي ويختفي
  const html = document.documentElement;
  html.lang = 'en'; html.dir = 'ltr'; html.classList.add('lang-en');
  const hide = document.createElement('style');
  hide.textContent = 'body{visibility:hidden}';
  document.head.appendChild(hide);
  const show = () => hide.remove();
  setTimeout(show, 1500);

  // التواريخ والأوقات: الصفحات تطلبها بالعربي (ar-SA)، نخليها إنجليزي
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const orig = Date.prototype[fn];
    Date.prototype[fn] = function (loc, opts) { return orig.call(this, typeof loc === 'string' && /^ar/i.test(loc) ? 'en-GB' : loc, opts); };
  }
  const nf = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, opts) { return nf.call(this, typeof loc === 'string' && /^ar/i.test(loc) ? 'en-US' : loc, opts); };
  // رسائل المتصفح (alert / confirm / prompt) تترجم بعد
  const [A, C, P] = [window.alert, window.confirm, window.prompt];
  window.alert = (m) => A.call(window, t(String(m ?? '')));
  window.confirm = (m) => C.call(window, t(String(m ?? '')));
  window.prompt = (m, d) => P.call(window, t(String(m ?? '')), d);

  const ver = (script && script.src.split('?')[1]) || '';
  const loaded = Promise.all(dicts.map(d => fetch(`/js/i18n/${d}.json${ver ? '?' + ver : ''}`).then(r => r.ok ? r.json() : {}).catch(() => ({}))))
    .then(list => list.forEach(add));
  const ready = new Promise(r => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r());
  Promise.all([loaded, ready]).then(() => {
    document.title = tr(document.title);
    walk(document.body);
    button();
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') element(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    // عنوان الصفحة (الصفحات تغيّره بعد ما يوصل اسم المحل)
    const title = document.querySelector('title');
    if (title) new MutationObserver(() => { const o = tr(document.title); if (o !== document.title) document.title = o; }).observe(title, { childList: true, characterData: true, subtree: true });
    show();
  });
})();
