// =====================================================================
// DEV MENU — API صاحب المتجر (يتطلب تسجيل دخول)
// كل طلب: نتحقق من الجلسة ← نحدد متجر المستخدم من بريده ← ننفذ
// المدير العام يقدر يدير أي متجر عبر ?client=slug
// =====================================================================
// الكود مقسّم حسب الميزة في api/_lib/owner/ (الحساب، المنيو، الطلبات، البيجر، الولاء، الانتظار)،
// وهذا الملف يوجّه الطلب: أول طلبات القراءة (pre)، وبعد حد الـ POST يتحدد المتجر وتنفّذ طلبات الحفظ (post)
// =====================================================================
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./_lib/owner/shared');
const NEXT = require('./_lib/owner/next');
// require ثابت لكل ملف (Vercel يجمع الملفات اللي يشوفها مكتوبة)
const FEATURES = [require('./_lib/owner/account'), require('./_lib/owner/waitlist'), require('./_lib/owner/orders'),
  require('./_lib/owner/menu'), require('./_lib/owner/pager'), require('./_lib/owner/loyalty')];

async function main(req) {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};
  for (const f of FEATURES) { const out = await f.pre(action, req, b); if (out !== NEXT) return out; }

  if (req.method !== 'POST') throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
  const { store, admin, here } = await context(req);
  const sid = store.id;
  req._sid = sid;
  // الفرع اللي صار فيه الختم أو الصرف: يختاره صاحب المحل من اللوحة (من فروعه بس)، وإلا الفرع المفتوح
  const atBranch = async () => {
    const want = Number(b.branch_id);
    if (!Number.isInteger(want) || want === here.id) return here.id;
    return (await familyIds(store)).includes(want) ? want : here.id;
  };
  // المميزات حسب باقة المحل
  if (['pager-update', 'pager-invoice', 'pager-ring', 'pager-eta', 'pager-addons-seen'].includes(action) && !PLANS.has(store, 'pager')) throw new ApiError(403, 'البيجر مو ضمن باقتك', 'ADDON_OFF');
  if (['pager-message', 'pager-message-push', 'pager-winback'].includes(action) && !PLANS.has(store, 'notify')) throw new ApiError(403, '"رسائل لزبائنك" مو ضمن باقتك. أضفها من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');
  if (['loyalty-stamp-code', 'loyalty-scan', 'loyalty-transfer', 'loyalty-give-stamp', 'loyalty-member-delete', 'loyalty-import', 'loyalty-redeem', 'loyalty-message', 'loyalty-message-push', 'loyalty-ai', 'loyalty-ai-run', 'loyalty-ai-preview'].includes(action) && !PLANS.has(store, 'loyalty')) throw new ApiError(403, 'بطاقة الولاء متوقفة: مو ضمن باقتك أو انتهى اشتراكك. جدّد من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');
  // خدمة مو ضمن باقة المشترك (في التجربة أو الاشتراك): نفس قفل اللوحة (featureLocked في admin.html)،
  // عشان محل البيجر بس ما يعدّل المنيو أو إعدادات الولاء من خارج اللوحة
  const notInPlan = (key) => ['active', 'trial'].includes(store.subscription_status) && !PLANS.has(store, key);
  if (MENU_ONLY.includes(action) && notInPlan('menu')) throw new ApiError(403, 'المنيو مو ضمن باقتك. أضفه من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');
  if (action === 'loyalty-settings' && notInPlan('loyalty')) throw new ApiError(403, 'بطاقة الولاء مو ضمن باقتك. أضفها من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');

  const env = { store, admin, here, sid, atBranch, notInPlan };
  for (const f of FEATURES) { const out = await f.post(action, req, b, env); if (out !== NEXT) return out; }

  throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
}


// أي تعديل يغيّر اللي يشوفه الزبون في المنيو ← تنبيه لحظي للمنيوهات المفتوحة
const MENU_ACTIONS = new Set([
  'update-store', 'occasions-save', 'branch-rename', 'coupon-save', 'coupon-toggle', 'coupon-delete', 'update-slug',
  'category-add', 'category-group', 'category-rename', 'category-delete', 'reorder',
  'product-save', 'product-toggle', 'product-delete', 'products-import', 'waitlist-settings', 'extras-copy'
]);

module.exports = handler(['GET', 'POST'], async (req) => {
  const out = await main(req);
  if (req.method === 'POST' && req._sid && MENU_ACTIONS.has(req.query.action)) await poke(topic('menu', req._sid));
  return out;
});

// 300: قراءة المنيو من صورة بالذكاء الاصطناعي تاخذ أكثر من دقيقة للمنيو الطويل
module.exports.config = { maxDuration: 300 };
