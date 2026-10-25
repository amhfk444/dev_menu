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
  const MAIN = ['restaurant', 'cafe', 'mixed'];
  const OTHERS = ['bakery', 'clinic', 'salon', 'carwash', 'laundry', 'retail', 'pharmacy', 'services', 'other'];
  const label = (store) => {
    if (!store) return '';
    if (store.business_type === 'other' && store.business_label) return store.business_label;
    return (SECTORS[store.business_type] || SECTORS.restaurant).name;
  };
  const api = { SECTORS, MAIN, OTHERS, KEYS: Object.keys(SECTORS), label };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DMSectors = api;
})(typeof window !== 'undefined' ? window : globalThis);
