// =====================================================================
// DEV MENU — روابط المتاجر المختصرة
//   duja.devmenu.digital            → المنيو
//   duja.devmenu.digital/links      → صفحة الروابط
//   duja.devmenu.digital/waitlist   → قائمة الانتظار
// الرابط في المتصفح يبقى مختصر (rewrite مو redirect)، والصفحة تعرف المتجر من النطاق.
// app و www وأي نطاق ثاني ما يتأثر.
// =====================================================================
import { rewrite } from '@vercel/functions/middleware';

const HOST_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.devmenu\.digital$/;
const NOT_STORES = new Set(['app', 'www']);
const PAGES = {
  '/': 'menu.html', '/menu': 'menu.html',
  '/links': 'links.html',
  '/waitlist': 'waitlist.html'
};

export const config = { matcher: ['/', '/menu', '/links', '/waitlist'] };

export default function middleware(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || url.hostname).toLowerCase().replace(/:\d+$/, '');
  const m = host.match(HOST_RE);
  if (!m || NOT_STORES.has(m[1])) return;
  const page = PAGES[url.pathname];
  if (!page) return;
  const dest = new URL(`/${page}`, url);
  url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
  if (!dest.searchParams.has('client')) dest.searchParams.set('client', m[1]);
  return rewrite(dest);
}
