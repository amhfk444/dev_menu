// =====================================================================
// DEV MENU — روابط المتاجر المختصرة
//   duja.devmenu.digital            → المنيو
//   duja.devmenu.digital/links      → صفحة الروابط
//   duja.devmenu.digital/waitlist   → قائمة الانتظار
//   duja.devmenu.digital/pager      → البيجر الرقمي
//   duja.devmenu.digital/loyalty    → بطاقة الولاء
// الرابط في المتصفح يبقى مختصر (rewrite مو redirect)، والصفحة تعرف المتجر من النطاق.
// app و www وأي نطاق ثاني ما يتأثر.
// =====================================================================
import { rewrite } from '@vercel/functions/middleware';

const HOST_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.devmenu\.digital$/;
const NOT_STORES = new Set(['app', 'www', 'staging']);
const PAGES = {
  '/': 'menu.html', '/menu': 'menu.html',
  '/links': 'links.html',
  '/waitlist': 'waitlist.html',
  '/pager': 'pager.html',
  '/loyalty': 'loyalty.html'
};

const FILES = { '/menu.html': 'menu', '/links.html': 'links', '/waitlist.html': 'waitlist', '/pager.html': 'pager', '/loyalty.html': 'loyalty' };
// برامج معاينة الروابط (واتساب، تويتر، تيليجرام...): تاخذ صفحة فيها اسم المحل وشعاره بدل DEV MENU
const BOT_RE = /WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|Snapchat|Pinterest|vkShare|redditbot|Applebot|Google-PageRenderer|Embedly|Iframely/i;
const share = (url, slug, page) => rewrite(new URL(`/api/public?action=share&slug=${encodeURIComponent(slug)}&page=${page}`, url));

export const config = { matcher: ['/', '/menu', '/links', '/waitlist', '/pager', '/loyalty', '/menu.html', '/links.html', '/waitlist.html', '/pager.html', '/loyalty.html'] };

export default function middleware(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || url.hostname).toLowerCase().replace(/:\d+$/, '');
  const bot = BOT_RE.test(request.headers.get('user-agent') || '');
  const m = host.match(HOST_RE);
  const store = m && !NOT_STORES.has(m[1]) ? m[1] : '';
  // الرابط الطويل: app.devmenu.digital/menu.html?client=duja
  if (FILES[url.pathname]) {
    const slug = url.searchParams.get('client') || store;
    if (bot && slug) return share(url, slug, FILES[url.pathname]);
    return;
  }
  if (!store) return;
  const page = PAGES[url.pathname];
  if (!page) return;
  if (bot) return share(url, url.searchParams.get('client') || store, page.replace('.html', ''));
  const dest = new URL(`/${page}`, url);
  url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
  if (!dest.searchParams.has('client')) dest.searchParams.set('client', store);
  return rewrite(dest);
}
