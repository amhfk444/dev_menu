// =====================================================================
// DEV MENU — بطاقة الولاء في المحفظة (Apple Wallet + Google Wallet) عبر WalletWallet
//   https://www.walletwallet.dev — توقّع البطاقة بشهادتها، فما نحتاج حساب مطوّر آبل
//   المتغير في Vercel: WALLET_API_KEY
// نرسل أقل بيانات ممكنة: اسم المحل وعدد الأختام (بدون أي بيانات عن الزبون)
// =====================================================================
const { tr } = require('./i18n');
const { ApiError } = require('./core');
const { stampStrip } = require('./strip');

const BASE = 'https://api.walletwallet.dev/api/passes';
const KEY = process.env.WALLET_API_KEY || '';
const configured = () => !!KEY;

async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('WALLET', method, path, r.status, JSON.stringify(d).slice(0, 300));
    const e = new Error(d.message || d.error || `wallet ${r.status}`); e.status = r.status; throw e;
  }
  return d;
}

// محتوى البطاقة. full = مزايا الباقة المدفوعة (الشعار، الموقع على شاشة القفل)
function passBody({ store, settings, card, url, restoreUrl, lat, lng, notice, strip, nearText }, full = true) {
  const n = settings.needed, s = Math.min(card.stamps, n);
  const L = (t) => tr(card.lang, t);   // لغة الزبون (آخر لغة فتح فيها بطاقته)
  const body = {
    logoText: String(store.name || 'DEV MENU').slice(0, 40),
    organizationName: String(store.name || 'DEV MENU').slice(0, 64),
    description: L(`بطاقة الولاء: ${store.name || ''}`).slice(0, 120),
    colorPreset: 'green',
    // العدد فوق (يبان حتى والبطاقة بين البطاقات)، والأختام نفسها في الصورة العريضة
    headerFields: [{ label: L('الأختام'), value: `${s} / ${n}`, changeMessage: L('صار عندك %@ ختم') }],
    // المكافأة وحامل البطاقة بس (عدد الأختام فوق، والأختام نفسها في الصورة)
    secondaryFields: [{ label: L(s >= n ? 'مكافأتك جاهزة' : 'المكافأة'), value: (card.lang === 'en' && settings.reward_en) || settings.reward }, ...(card.name ? [{ label: L('صاحب البطاقة'), value: String(card.name).slice(0, 40) }] : [])],
    backFields: [
      { label: L('رقم العضوية'), value: `#${card.member_no || ''}` },
      { label: L('زياراتك'), value: String(card.visits || 0) },
      { label: L('طريقة الختم'), value: L('بعد ما تدفع، اعرض الكود اللي في البطاقة للكاشير، أو امسح كود الختم اللي يطلعه لك.') },
      { label: L('افتح بطاقتك'), value: restoreUrl || url }
    ],
    // كود العضوية: الكاشير يصوّره من المحفظة ويختم
    ...(card.client_id ? { barcodeValue: require('./loyalty-stamp').memberQr(card), barcodeFormat: 'QR', barcodeAltText: L(`رقم العضوية #${card.member_no || ''}`) } : {}),
    sharingProhibited: true,
    // رسالة المحل: لما تتغير تطلع إشعار على الجوال (لازم تكون موجودة من أول مرة، عشان كذا مسافة لو ما فيه رسالة)
    // رسالة فاضية تمسح خانة الإشعار من البطاقة، والتحديث اللي يرجّعها ما يطلع إشعار (فتضيع أول رسالة بعدها).
    // فبدون رسالة ما نرسل الخانة أصلاً، والبطاقة تحتفظ برسالتها الحالية
    ...(String(notice || '').trim() ? { notification: String(notice).slice(0, 250) } : {})
  };
  if (full) {
    // لون المحل بدل اللون الجاهز (ما نرسل الاثنين، عشان الجاهز ما يغطي عليه)
    if (settings.design && settings.design.color) { body.color = settings.design.color; delete body.colorPreset; }
    // شعار البطاقة الخاص لو حطه صاحب المحل، وإلا شعار المنيو
    const logo = (settings.design && settings.design.logo) || store.logo_url;
    if (logo && /^https:\/\//.test(logo)) body.logoURL = logo;
    // صورة الأختام بنفس شكل بطاقة DEV MENU
    if (strip) body.stripURL = strip;
    if (Number.isFinite(lat) && Number.isFinite(lng)) body.locations = [{ latitude: lat, longitude: lng, relevantText: String(nearText || L(`أنت قريب من ${store.name}، خذ ختمك`)).slice(0, 80) }];
  }
  return body;
}

// بطاقة جديدة. لو الباقة المجانية رفضت المزايا المدفوعة نعيد بدونها
async function createPass(ctx) {
  if (!configured()) throw new ApiError(503, 'إضافة البطاقة للمحفظة مو متاحة حالياً', 'WALLET_OFF');
  if (!String(ctx.notice || '').trim()) ctx = { ...ctx, notice: firstNotice(ctx.store, ctx.card && ctx.card.lang) };
  ctx = { ...ctx, strip: await stampStrip(ctx.settings, ctx.card) };
  try { return await call('POST', '', passBody(ctx, true)); }
  catch (e) {
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      try { return await call('POST', '', passBody(ctx, false)); } catch (e2) { e = e2; }
    }
    if (e.status === 429) throw new ApiError(503, 'المحفظة مشغولة الحين، جرّب بعد شوي', 'WALLET_LIMIT');
    throw new ApiError(502, 'تعذر تجهيز البطاقة للمحفظة، جرّب بعد شوي', 'WALLET_FAILED');
  }
}

// تحديث البطاقة في المحفظة (التحديث من مزايا الباقة المدفوعة، ولو فشل ما يوقف الختم)
// يرجّع null لو نجح، أو سبب الفشل (ينحفظ مع البطاقة عشان نعرف وش صار، والنجاح يبدأ بـ ok)
async function updatePass(serial, ctx) {
  if (!configured() || !serial) return 'not configured';
  ctx = { ...ctx, strip: await stampStrip(ctx.settings, ctx.card) };
  try {
    const r = await call('PUT', `/${encodeURIComponent(serial)}`, passBody(ctx, true));
    // نسجل رد الخدمة: كم جهاز وصله التحديث، وهل المحتوى تغيّر
    return `ok devices=${r.notifiedDevices ?? '?'} unchanged=${r.unchanged ?? '?'} strip=${ctx.strip ? Math.round(ctx.strip.length / 1024) + 'KB' : 'none ' + (stampStrip.lastError || '')} at=${new Date().toISOString().slice(0, 19)}`;
  }
  catch (e) {
    const first = `${e.status || ''} ${e.message || ''}`.trim();
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 404 && e.status !== 429) {
      try { await call('PUT', `/${encodeURIComponent(serial)}`, passBody(ctx, false)); return `partial: ${first}`.slice(0, 300); }
      catch (e2) { return `${e2.status || ''} ${e2.message || ''}`.trim().slice(0, 300); }
    }
    return first.slice(0, 300);
  }
}

// رابط صفحة البطاقة، ورابط الاسترجاع (فيه رقم البطاقة السري، يطلع على ظهر بطاقة المحفظة بس)
const cardUrl = (slug) => require('./core').storeLink(slug, 'loyalty');
function buildCtx({ store, settings, card, lat, lng, notice, nearText }) {
  const url = cardUrl(store.client_slug);
  return { store, settings, card, url, restoreUrl: `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(card.token)}`, lat, lng, notice, nearText };
}

// إلغاء البطاقة من المحفظة (لما يُحذف العضو): آبل تطفيها وتشيل كودها وتنقلها للبطاقات المنتهية، وقوقل تنهيها
async function revokePass(serial) {
  if (!configured() || !serial) return 'off';
  try { const r = await call('DELETE', `/${encodeURIComponent(serial)}`); return r.deleted ? 'revoked' : 'unknown'; }
  catch (e) { return e.status === 404 ? 'gone' : `error ${e.status || ''}`.trim(); }
}

// ─── بطاقة النداء: بطاقة وحدة للزبون في المحل (اللي ما عنده ولاء)، بهوية المحل (لونه وشعاره) وبدون أختام ───
// كل رقم جديد يحدّثها: الرقم فوق، والحالة تحت الصورة. لما تتغير الحالة آبل تطلعها إشعار على شاشة القفل بشعار المحل.
// بعد الاستلام ترجع "بالعافية" (step = idle) وتنتظر الزيارة الجاية
async function pagerBody({ store, number, step, status, notice, url, lang }) {
  const L = (t) => tr(lang, t);
  const { pagerStrip, brandColor } = require('./strip');
  const { rest, googleReviewLink } = require('./core');
  const [color, x] = await Promise.all([brandColor(store),
    store.id ? rest(`clients?id=eq.${Number(store.id)}&select=google_review_url,location_url,loyalty_lat,loyalty_lng,pager_near_text`).then(r => r[0] || {}).catch(() => ({})) : {}]);
  const review = googleReviewLink(x);
  // بعد الاستلام: "بالعافية" ومعها طلب التقييم لو المحل حط رابطه
  if (step === 'idle' && review && notice === L('بالعافية! نتشرف بزيارتك')) notice = L('بالعافية! عجبك طلبك؟ قيّمنا في قوقل ⭐');
  const body = {
    logoText: String(store.name || 'DEV MENU').slice(0, 40),
    organizationName: String(store.name || 'DEV MENU').slice(0, 64),
    description: L(`بطاقة النداء: ${store.name || ''}`).slice(0, 120),
    color,
    headerFields: [{ label: L('رقمك'), value: number ? String(number) : '—' }],
    secondaryFields: [{ label: L('الحالة'), value: L(String(status)).slice(0, 40) }],   // الإشعار من حقل notification (فيه الوقت، فيطلع كل مرة)
    backFields: [
      { label: L('بطاقة النداء'), value: L('كل ما تاخذ رقم من البيجر تتحدث هالبطاقة برقمك، ويوصلك منها إشعار لما يجهز طلبك.') },
      { label: L('صفحة رقمك'), value: url },
      ...(review ? [{ label: L('قيّمنا في قوقل'), value: review }] : [])
    ],
    sharingProhibited: true,
    ...(String(notice || '').trim() ? { notification: String(notice).slice(0, 250) } : {})   // بدون رسالة: البطاقة تحتفظ برسالتها (شوف passBody)
  };
  const strip = await pagerStrip(color, step);
  if (strip) body.stripURL = strip;
  if (store.logo_url && /^https:\/\//.test(store.logo_url)) body.logoURL = body.iconURL = await require('./strip').smallLogo(store.logo_url);
  // موقع المحل: البطاقة تطلع على شاشة القفل لما يقرب منه، بنص صاحب المحل أو النص الافتراضي
  const lat = Number(x.loyalty_lat), lng = Number(x.loyalty_lng);
  const near = String(x.pager_near_text || '').trim() || L(`أنت قريب من ${store.name || 'المحل'}، تفضّل 👋`);
  if (x.loyalty_lat != null && Number.isFinite(lat) && Number.isFinite(lng)) body.locations = [{ latitude: lat, longitude: lng, relevantText: near.slice(0, 80) }];
  return body;
}
// البطاقة لازم تنولد وفيها خانة الإشعار، وإلا أول رسالة توصلها ما تطلع إشعار
const firstNotice = (store, lang) => tr(lang, `أهلاً بك في ${store.name || 'المحل'}`);
async function createPagerPass(ctx) {
  if (!configured()) throw new ApiError(503, 'المحفظة مو متاحة حالياً', 'WALLET_OFF');
  if (!String(ctx.notice || '').trim()) ctx = { ...ctx, notice: firstNotice(ctx.store, ctx.lang) };
  try { return await call('POST', '', await pagerBody(ctx)); }
  catch (e) {
    // الباقة المجانية ترفض الصور واللون: بطاقة بسيطة بدلها
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      const b = await pagerBody(ctx); ['logoURL', 'iconURL', 'stripURL', 'color'].forEach(k => delete b[k]); b.colorPreset = 'dark';
      try { return await call('POST', '', b); } catch {}
    }
    throw new ApiError(502, 'تعذر تجهيز رقمك للمحفظة، جرّب بعد شوي', 'WALLET_FAILED');
  }
}
// محتوى بطاقة النداء لكل خطوة: waiting (رقم جديد)، ready (جاهز)، idle (استلم)
// الإشعار فيه الوقت عشان يطلع حتى لو تكرر نفس الرقم في يوم ثاني
function pagerStep({ store, number, step, lang }) {
  const T = require('./sectors').terms(store), L = (t) => tr(lang, t);
  const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh' });
  const url = require('./core').storeLink(store.client_slug, 'pager');
  if (step === 'ready') return { store, number, step, lang, url, status: T.ready, notice: `${L(`🔔 ${T.ready} رقم ${number}. ${T.readyBody}`)} (${at})` };
  if (step === 'idle') return { store, number: null, step, lang, url, status: 'بالعافية! نتشرف بزيارتك', notice: L('بالعافية! نتشرف بزيارتك') };
  const waiting = T.waiting.replace('…', '');
  return { store, number, step: 'waiting', lang, url, status: waiting, notice: `${L(`رقمك ${number}: ${waiting}`)} (${at})` };
}
// silent: نحدّث البطاقة (الرقم والحالة) بدون إشعار: نخلي نص الإشعار مثل ما هو (الآيفون يطلع إشعار بس لما يتغير)
// ونحفظ آخر نص على البطاقة عشان نعرفه في التحديث الصامت الجاي
async function updatePagerPass(serial, ctx) {
  if (!configured() || !serial) return 'off';
  const { rest, q } = require('./core');
  try {
    const body = await pagerBody(ctx);
    if (ctx.silent) delete body.notification;   // بدون الخانة: الرسالة الحالية تبقى، فما يطلع إشعار
    const r = await call('PUT', `/${encodeURIComponent(serial)}`, body);
    if (body.notification) await rest(`pager_cards?wallet_serial=eq.${q(serial)}`, { method: 'PATCH', body: { last_notice: body.notification } }).catch(() => {});
    // الرد كامل (بدون القيم الطويلة): يكشف لو الخدمة ما غيّرت شي (unchanged) أو فيه وضع تجربة أو أي حقل ثاني
    const extra = Object.entries(r || {}).filter(([k]) => !['notifiedDevices', 'serialNumber', 'lastUpdated'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 40)}`).join(' ');
    return `ok devices=${r.notifiedDevices ?? '?'}${extra ? ' ' + extra : ''} at=${new Date().toISOString().slice(11, 19)}`;
  } catch (e) { return `${e.status || ''} ${e.message || ''}`.trim().slice(0, 200); }
}

// البطاقة موحدة لكل المحلات: استلم أو انلغى رقمه هنا، وعنده رقم شغّال اليوم على نفس البطاقة في محل ثاني؟
// لو فيه، البطاقة ترجع لرقمه هناك وحالته (بدون إشعار جديد)، وإلا "بالعافية"
async function endPagerPass(serial, ticketId, ctx) {
  if (!configured() || !serial) return 'off';
  const { rest, q } = require('./core'), { riyadhDayStart } = require('./waitlist');
  const t = (await rest(`pager_tickets?wallet_serial=eq.${q(serial)}&id=neq.${Number(ticketId) || 0}&status=in.(waiting,ready)&created_at=gte.${q(riyadhDayStart())}&select=client_id,number,status,lang&order=id.desc&limit=1`).catch(() => []))[0];
  const at = t && (await rest(`clients?id=eq.${t.client_id}&select=id,name,client_slug,logo_url,accent_color,business_type`).catch(() => []))[0];
  if (!at) return updatePagerPass(serial, ctx);
  const step = pagerStep({ store: at, number: t.number, step: t.status === 'ready' ? 'ready' : 'waiting', lang: t.lang || ctx.lang });
  return `back ${await updatePagerPass(serial, { ...step, silent: true })}`;
}

// الزبون حذف البطاقة من محفظته: آخر تحديث تغيّر محتواه وما وصل لأي جهاز
// (لو المحتوى ما تغيّر الخدمة ما ترسل لأحد، فـ devices=0 وقتها ما تعني شي)
const passRemoved = (err) => {
  const last = String(err || '').split('|').pop();
  // أو البطاقة نفسها انلغت عند شركة المحفظة (404): لازم يضيفها من جديد
  return (/devices=0\b/.test(last) && !/unchanged=true\b/.test(last)) || /\b404\b/.test(last);
};

module.exports = { passRemoved, configured, createPass, updatePass, revokePass, buildCtx, cardUrl, createPagerPass, updatePagerPass, endPagerPass, pagerStep };
