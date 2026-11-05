// =====================================================================
// DEV MENU — أنواع المنشآت (التسجيل + لوحة التحكم + لوحة المشتركين + الخادم)
// =====================================================================
(function (root) {
  const SECTORS = {
    restaurant: { name: 'مطعم', icon: 'ph-fork-knife', food: true },
    cafe:       { name: 'مقهى', icon: 'ph-coffee', food: true },
    mixed:      { name: 'مطعم ومقهى', icon: 'ph-hamburger', food: true },
    bakery:     { name: 'مخبز وحلويات', icon: 'ph-bread', food: true },
    clinic:     { name: 'عيادة', icon: 'ph-first-aid-kit' },
    salon:      { name: 'صالون وحلاقة', icon: 'ph-scissors' },
    carwash:    { name: 'مغسلة سيارات', icon: 'ph-car' },
    laundry:    { name: 'مغسلة ملابس', icon: 'ph-t-shirt' },
    retail:     { name: 'متجر', icon: 'ph-shopping-bag' },
    pharmacy:   { name: 'صيدلية', icon: 'ph-pill' },
    services:   { name: 'مركز خدمة', icon: 'ph-buildings' },
    other:      { name: 'نشاط آخر', icon: 'ph-dots-three-circle' }
  };
  // ─── المصطلحات والرسائل حسب المجال (البيجر وقائمة الانتظار والإشعارات) ───
  const ORDER_T = {   // استلام طلب: مطاعم، مقاهي، مخابز، صيدليات، متاجر، مغسلة ملابس
    ready: 'طلبك جاهز!', readyBody: 'تفضّل استلمه', waiting: 'جاري تجهيز طلبك…', ringWhen: 'لما يجهز طلبك',
    tell: 'ورّ هذا الرقم للموظف مع طلبك', got: 'استلمت طلبي', game: 'العب لين يجهز طلبك',
    deskWait: 'قيد التجهيز', deskReady: 'جاهز، بانتظار الاستلام', deskCall: 'جاهز', deskDone: 'استلم',
    wlReady: 'طاولتك جاهزة!', wlReadyLine: 'طاولتك جاهزة الآن', wlWhen: 'أول ما تجهز طاولتك'
  };
  const TURN_T = {    // دور: عيادات، صالونات، مراكز خدمة
    ready: 'جاء دورك!', readyBody: 'تفضّل للموظف', waiting: 'انتظر دورك…', ringWhen: 'لما يجي دورك',
    tell: 'ورّ هذا الرقم للموظف', got: 'تمام، وصلت', game: 'العب لين يجي دورك',
    deskWait: 'بالانتظار', deskReady: 'تم النداء، بانتظار الحضور', deskCall: 'نادِ', deskDone: 'حضر',
    wlReady: 'جاء دورك!', wlReadyLine: 'جاء دورك الآن', wlWhen: 'أول ما يجي دورك'
  };
  const TERMS = {
    restaurant: ORDER_T, cafe: ORDER_T, mixed: ORDER_T, bakery: ORDER_T, pharmacy: ORDER_T, retail: ORDER_T,
    laundry: { ...ORDER_T, ready: 'غسيلك جاهز!', wlReady: 'جاء دورك!', wlReadyLine: 'جاء دورك الآن', wlWhen: 'أول ما يجي دورك' },
    carwash: { ...ORDER_T, ready: 'سيارتك جاهزة!', readyBody: 'تفضّل استلمها', waiting: 'جاري العمل على سيارتك…', ringWhen: 'لما تجهز سيارتك',
      tell: 'ورّ هذا الرقم للموظف', got: 'استلمت سيارتي', game: 'العب لين تجهز سيارتك', wlReady: 'جاء دورك!', wlReadyLine: 'جاء دورك الآن', wlWhen: 'أول ما يجي دورك' },
    clinic: { ...TURN_T, readyBody: 'تفضّل للدخول' },
    salon: TURN_T, services: TURN_T, other: TURN_T
  };
  const terms = (store) => TERMS[(store && store.business_type) || 'restaurant'] || ORDER_T;
  const MAIN = ['restaurant', 'cafe', 'mixed'];
  const OTHERS = ['bakery', 'clinic', 'salon', 'carwash', 'laundry', 'retail', 'pharmacy', 'services', 'other'];
  const label = (store) => {
    if (!store) return '';
    if (store.business_type === 'other' && store.business_label) return store.business_label;
    return (SECTORS[store.business_type] || SECTORS.restaurant).name;
  };
  // ─── مصطلحات الأصناف: المطاعم والمقاهي والمخابز «طبق/أطباق»، وباقي الأنشطة «منتج/منتجات» ───
  const isFood = (store) => !!(SECTORS[(store && store.business_type) || 'restaurant'] || SECTORS.restaurant).food;
  // يستبدل «طبق» بكل أشكالها (الطبق، أطباقك، للطبق...) بدون ما يلمس كلمات ثانية مثل «طبقة» و«تطبيق»
  const DISH_RE = /(^|[^\u0621-\u064A])(وال|بال|لل|فال|كال|ال|و|ب|ل|ف)?(أطباق|طبق)(كم|ها|ك)?(?=[^\u0621-\u064A]|$)/g;
  const DISH_EN = /\b(dish)(es)?\b/gi;
  function localize(text, store) {
    if (!text || isFood(store)) return text;
    return String(text).replace(DISH_RE, (m, a, pre, stem, suf) => `${a}${pre || ''}${stem === 'أطباق' ? 'منتجات' : 'منتج'}${suf || ''}`)
      .replace(DISH_EN, (m, d, es) => (d[0] === 'D' ? 'Item' : 'item') + (es ? 's' : ''));
  }
  // يطبّق المصطلحات على صفحة كاملة (النصوص والـ placeholder والعناوين)، ويتابع اللي ينضاف بعدين
  function localizeDom(root, store, watch) {
    if (isFood(store) || !root) return;
    const fix = (node) => {
      if (node.nodeType === 3) { const t = localize(node.nodeValue, store); if (t !== node.nodeValue) node.nodeValue = t; return; }
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName)) return;
      for (const at of ['placeholder', 'title', 'aria-label']) { const v = node.getAttribute(at); if (v) { const t = localize(v, store); if (t !== v) node.setAttribute(at, t); } }
      for (const c of node.childNodes) fix(c);
    };
    fix(root);
    if (watch && typeof MutationObserver !== 'undefined') new MutationObserver(ms => ms.forEach(m => {
      if (m.type === 'characterData') fix(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v) { const t = localize(v, store); if (t !== v) m.target.setAttribute(m.attributeName, t); } }
      else m.addedNodes.forEach(fix);
    })).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  }

  const api = { SECTORS, MAIN, OTHERS, KEYS: Object.keys(SECTORS), label, terms, TERMS, isFood, localize, localizeDom };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DMSectors = api;
})(typeof window !== 'undefined' ? window : globalThis);
