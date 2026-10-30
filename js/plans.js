// =====================================================================
// DEV MENU — الباقات والأسعار (مصدر واحد: الخادم + لوحة صاحب المحل + لوحة المشتركين)
//   صاحب المحل يختار المميزات اللي يحتاجها، والسعر يتحسب، ويختار شهري أو سنوي
//   بطاقة الولاء باقة مستقلة: يشترك فيها لحالها أو مع المنيو
//   الأسعار بالريال. السنوي تقريباً 10 شهور (شهرين ببلاش)
// =====================================================================
(function (root) {
  const FEATURES = {
    menu:     { name: 'المنيو الرقمي',  desc: 'المنيو بصوره وأسعاره، كود QR للطاولات، الطلب على الواتساب، الثيمات والإحصائيات', icon: 'ph-fork-knife', month: 39, year: 349 },
    pager:    { name: 'البيجر',          desc: 'جوال الزبون يرن لما يجهز طلبه، بدون أجهزة', icon: 'ph-bell', month: 49, year: 449 },
    notify:   { name: 'رسائل لزبائنك',  desc: 'إضافة للبيجر: ترسل إشعار لكل زبون حافظ بطاقة النداء، مثل عرض اليوم أو منتج جديد', icon: 'ph-megaphone', month: 19, year: 179, needs: 'pager' },
    waitlist: { name: 'قائمة الانتظار', desc: 'الزبون يسجل دوره ويجيه تنبيه لما يجي دوره', icon: 'ph-hourglass-medium', month: 29, year: 249 },
    loyalty:  { name: 'بطاقة الولاء',    desc: 'أختام ومكافآت ومحفظة الجوال ومساعد ذكي يكلم زبائنك', icon: 'ph-seal-check', month: 69, year: 649 }
  };
  const ORDER = ['menu', 'pager', 'notify', 'waitlist', 'loyalty'];
  const BRANCH = { month: 19, year: 199 };
  // الأسعار مبنية على السوق السعودي (2026-10): أرخص من المنافسين بـ 25% إلى 40% وفيها مميزات أكثر
  //   المنيو 39/349 (هلا أوردر 50/600)، البيجر 49/449 (بيجري 599 و699 بالهوية)، الولاء 69/649 (نقطتي 89/849)
  // خصومات الباقات: المنيو + البيجر = 73/648، ومعها الانتظار = 92/797، المنيو + الولاء = 98/908، والأربع كلها = 151/1356
  // (أي إضافة لازم ما تخلي السعر أرخص من باقة أصغر منها)
  const BUNDLES = [
    { keys: ['menu', 'pager'], name: 'خصم المنيو مع البيجر', month: 15, year: 150 },
    { keys: ['menu', 'pager', 'waitlist'], name: 'خصم الباقة الكاملة', month: 10, year: 100 },
    { keys: ['menu', 'loyalty'], name: 'خصم الولاء مع المنيو', month: 10, year: 90 }
  ];
  // المشتركين القدامى (قبل نظام المميزات) كانت باقتهم المنيو + البيجر + الانتظار
  const LEGACY = ['menu', 'pager', 'waitlist'];

  // الإضافة ما تشتغل بدون الأساس حقها (رسائل لزبائنك تحتاج البيجر)
  const clean = (list) => { const l = list || []; return ORDER.filter(k => l.includes(k) && (!FEATURES[k].needs || l.includes(FEATURES[k].needs))); };
  // تشغيل/إيقاف ميزة في الاختيار: الإضافة تجيب أساسها معها، وشيل الأساس يشيل إضافاته
  function toggle(list, key) {
    const s = new Set(list || []);
    if (s.has(key)) { s.delete(key); ORDER.forEach(k => { if (FEATURES[k].needs === key) s.delete(k); }); }
    else { s.add(key); if (FEATURES[key] && FEATURES[key].needs) s.add(FEATURES[key].needs); }
    return clean([...s]);
  }

  // تفاصيل السعر: { lines, discount, total }
  function price(features, period = 'year', branches = 0) {
    const f = clean(features), p = period === 'month' ? 'month' : 'year';
    const lines = f.map(k => ({ key: k, label: FEATURES[k].name, amount: FEATURES[k][p] }));
    if (branches > 0) lines.push({ key: 'branch', label: `${branches} ${branches === 1 ? 'فرع إضافي' : branches === 2 ? 'فرعين إضافيين' : 'فروع إضافية'}`, amount: BRANCH[p] * branches });
    const discounts = BUNDLES.filter(b => b.keys.every(k => f.includes(k))).map(b => ({ label: b.name, amount: b[p] }));
    const subtotal = lines.reduce((a, l) => a + l.amount, 0);
    const discount = discounts.reduce((a, d) => a + d.amount, 0);
    return { features: f, period: p, lines, discounts, subtotal, discount, total: Math.max(0, subtotal - discount) };
  }

  // المميزات المتاحة للمحل الحين: التجربة فيها كل شي، والمشترك حسب باقته
  function featuresOf(store) {
    if (!store) return [];
    // التجربة: الخدمات اللي اختارها عند التسجيل (المسجلين قبل نظام الاختيار: كل شي)
    // (اللي اختار البيجر يجرب معه "رسائل لزبائنك")
    if (store.subscription_status === 'trial') return Array.isArray(store.plan_features) && store.plan_features.length ? clean(store.plan_features.includes('pager') ? [...store.plan_features, 'notify'] : store.plan_features) : ORDER.slice();
    if (store.subscription_status === 'active') return Array.isArray(store.plan_features) && store.plan_features.length ? clean(store.plan_features) : LEGACY.slice();
    return [];
  }
  // الحساب شغال؟ موقوف من الإدارة، أو انتهت تجربته، أو انتهى اشتراكه (بعد مهلة 3 أيام) = كل المميزات تتوقف
  function live(store) {
    if (!store || store.is_active === false) return false;
    const now = Date.now(), t = (v) => (v ? Date.parse(v) : NaN);
    if (store.subscription_status === 'trial') return !(t(store.trial_ends_at) <= now);
    if (store.subscription_status === 'active') return !(t(store.subscription_end_date) + 3 * 864e5 <= now);
    return false;
  }
  const has = (store, key) => live(store) && featuresOf(store).includes(key);

  const api = { FEATURES, ORDER, BRANCH, BUNDLES, LEGACY, price, featuresOf, has, live, clean, toggle };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DMPlans = api;
})(typeof window !== 'undefined' ? window : globalThis);
