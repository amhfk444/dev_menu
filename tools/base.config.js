// إعداد Tailwind المشترك لصفحات DEV MENU (ما عدا المنيو)
// كل صفحة لها ملف إعداد صغير يمدّ هذا، والناتج في css/tw/<الصفحة>.css
// البناء: npm run build:css
module.exports = (page, extend = {}) => ({
  content: [`./${page}.html`, './js/dialog.js', './js/api.js'],
  theme: { extend },
  plugins: []
});
