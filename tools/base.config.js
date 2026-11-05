// إعداد Tailwind المشترك لصفحات DEV MENU
// كل صفحة لها ملف إعداد صغير يمدّ هذا، والناتج في css/tw/<الصفحة>.css
// البناء: npm run build:css
module.exports = (page, extend = {}) => ({
  content: [`./${page}.html`, `./js/${page}/*.js`, './js/dialog.js', './js/api.js', './js/loyalty-card.js', './js/sectors.js', './js/theme.js', './js/occasions.js'],
  theme: { extend },
  plugins: []
});
