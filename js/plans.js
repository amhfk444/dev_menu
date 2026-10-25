// =====================================================================
// DEV MENU — الباقات والأسعار (مصدر واحد: الخادم + لوحة صاحب المحل + لوحة المشتركين)
//   صاحب المحل يختار المميزات اللي يحتاجها، والسعر يتحسب، ويختار شهري أو سنوي
//   بطاقة الولاء باقة مستقلة: يشترك فيها لحالها أو مع المنيو
//   الأسعار بالريال. السنوي تقريباً 10 شهور (شهرين ببلاش)
// =====================================================================
(function (root) {
  const FEATURES = {
    menu:     { name: 'المنيو الرقمي',  desc: 'المنيو بصوره وأسعاره، كود QR للطاولات، الطلب على الواتساب، الثيمات والإحصائيات', icon: 'ph-fork-knife', month: 39, year: 349 },
    pager:    { name: 'البيجر',          desc: 'جوال الزبون يرن لما يجهز طلبه، بدون أجهزة', icon: 'ph-bell', month: 25, year: 249 },
    waitlist: { name: 'قائمة الانتظار', desc: 'الزبون يسجل دوره ويجيه تنبيه لما تجهز طاولته', icon: 'ph-hourglass-medium', month: 15, year: 129 },
    loyalty:  { name: 'بطاقة الولاء',    desc: 'أختام ومكافآت ومحفظة الجوال ومساعد ذكي يكلم زبائنك', icon: 'ph-seal-check', month: 49, year: 449 }
  };
  const ORDER = ['menu', 'pager', 'waitlist', 'loyalty'];
  const BRANCH = { month: 19, year: 199 };
  // خصومات الباقات: المنيو + البيجر + الانتظار = 59/499، ومعها الولاء = 99/899
  // (أي إضافة لازم ما تخلي السعر أغلى من الباقة الكاملة)
  const BUNDLES = [
    { keys: ['menu', 'pager'], name: 'خصم المنيو مع البيجر', month: 10, year: 128 },
    { keys: ['menu', 'pager', 'waitlist'], name: 'خصم باقة المطعم الكاملة', month: 10, year: 100 },
    { keys: ['menu', 'loyalty'], name: 'خصم الولاء مع المنيو', month: 9, year: 49 }
  ];
  // المشتركين القدامى (قبل نظام المميزات) كانت باقتهم المنيو + البيجر + الانتظار
  const LEGACY = ['menu', 'pager', 'waitlist'];

  const clean = (list) => ORDER.filter(k => (list || []).includes(k));

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
    if (store.subscription_status === 'trial') return ORDER.slice();
    if (store.subscription_status === 'active') return Array.isArray(store.plan_features) && store.plan_features.length ? clean(store.plan_features) : LEGACY.slice();
    return [];
  }
  const has = (store, key) => featuresOf(store).includes(key);

  const api = { FEATURES, ORDER, BRANCH, BUNDLES, LEGACY, price, featuresOf, has, clean };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DMPlans = api;
})(typeof window !== 'undefined' ? window : globalThis);
