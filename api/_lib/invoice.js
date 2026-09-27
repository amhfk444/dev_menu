// =====================================================================
// DEV MENU — فواتير الاشتراك بالبريد
// الأسعار نفسها في لوحة المشتركين ولوحة صاحب المتجر
// =====================================================================
const PLAN_PRICE = { year: 349, branch: 199 };
const SUPPORT_WA = '966561161448';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const riyadhDate = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric' });
const sar = (n) => `${Number(n).toLocaleString('en-US')} ر.س`;

// رقم فاتورة مقروء: DM-<رقم المتجر>-<التاريخ>-<4 أحرف>
function invoiceNumber(storeId) {
  const d = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  return `DM-${storeId}-${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// الأيام الباقية لين تجديد الحساب، والمبلغ النسبي لفرع جديد
function branchProration(parent, now = Date.now()) {
  const end = parent.subscription_status === 'active' ? Date.parse(parent.subscription_end_date) : NaN;
  if (parent.subscription_status === 'trial' || !(end > now)) return null;
  const days = Math.ceil((end - now) / 86400000);
  return { days, amount: Math.round(PLAN_PRICE.branch * days / 365), end: parent.subscription_end_date };
}

// paid = فاتورة مدفوعة (تفعيل/تجديد)، due = مستحقة الدفع (فرع في نص الاشتراك)
function invoiceEmail({ store, lines, status = 'paid', validUntil, note = '', number }) {
  const total = lines.reduce((n, l) => n + Number(l.amount), 0);
  const paid = status === 'paid';
  const badge = paid ? ['مدفوعة', '#15803d', 'rgba(21,128,61,.1)'] : ['مستحقة الدفع', '#b45309', 'rgba(180,83,9,.1)'];
  const today = riyadhDate(Date.now());
  const rows = lines.map(l => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee4d8;font-size:13px;line-height:1.6">${esc(l.label)}${l.detail ? `<div style="font-size:11px;color:#7a847c">${esc(l.detail)}</div>` : ''}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eee4d8;font-size:13px;font-weight:bold;text-align:left;white-space:nowrap" dir="ltr">${esc(sar(l.amount))}</td>
      </tr>`).join('');
  const html = `
<div dir="rtl" style="background:#efe5dc;padding:28px 12px;font-family:Tahoma,Arial,sans-serif;color:#22362a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#faf6f1;border-radius:20px;border:1px solid #e0d6c8;overflow:hidden">
    <tr><td style="background:#384f3d;padding:22px 26px;color:#faf6f1">
      <table role="presentation" width="100%"><tr>
        <td><div style="font-size:22px;font-weight:bold;letter-spacing:1px" dir="ltr">DEV MENU</div><div style="font-size:11px;opacity:.75">منصة المنيو الرقمي</div></td>
        <td style="text-align:left"><div style="font-size:16px;font-weight:bold">فاتورة اشتراك</div><div style="font-size:11px;opacity:.75" dir="ltr">${esc(number)}</div></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:22px 26px 6px">
      <table role="presentation" width="100%" style="font-size:12px;line-height:1.9">
        <tr><td style="color:#7a847c">العميل</td><td style="font-weight:bold">${esc(store.name)}</td></tr>
        ${store.email ? `<tr><td style="color:#7a847c">البريد</td><td dir="ltr" style="text-align:right">${esc(store.email)}</td></tr>` : ''}
        <tr><td style="color:#7a847c">تاريخ الفاتورة</td><td>${esc(today)}</td></tr>
        ${validUntil ? `<tr><td style="color:#7a847c">الاشتراك ساري حتى</td><td style="font-weight:bold">${esc(riyadhDate(validUntil))}</td></tr>` : ''}
        <tr><td style="color:#7a847c">الحالة</td><td><span style="display:inline-block;font-size:11px;font-weight:bold;color:${badge[1]};background:${badge[2]};padding:2px 10px;border-radius:999px">${badge[0]}</span></td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:10px 26px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:11px;color:#7a847c;padding-bottom:6px;border-bottom:2px solid #384f3d">البند</td><td style="font-size:11px;color:#7a847c;padding-bottom:6px;border-bottom:2px solid #384f3d;text-align:left">المبلغ</td></tr>
        ${rows}
        <tr><td style="padding:14px 0 0;font-size:15px;font-weight:bold">${paid ? 'المجموع المدفوع' : 'المبلغ المستحق'}</td>
            <td style="padding:14px 0 0;font-size:18px;font-weight:bold;color:#384f3d;text-align:left;white-space:nowrap" dir="ltr">${esc(sar(total))}</td></tr>
      </table>
    </td></tr>
    ${note ? `<tr><td style="padding:12px 26px 0"><div style="font-size:12px;line-height:1.8;background:rgba(56,79,61,.06);border:1px solid rgba(56,79,61,.12);border-radius:12px;padding:10px 12px">${esc(note)}</div></td></tr>` : ''}
    <tr><td style="padding:18px 26px 24px;text-align:center">
      <a href="https://wa.me/${SUPPORT_WA}" style="display:inline-block;background:#22362a;color:#faf6f1;text-decoration:none;font-weight:bold;font-size:12px;padding:11px 20px;border-radius:12px">تواصل معنا عبر واتساب</a>
      <div style="font-size:11px;color:#8a8f86;margin-top:14px;line-height:1.8">شكراً لاختيارك DEV MENU · المبالغ بالريال السعودي<br><span dir="ltr">app.devmenu.digital</span></div>
    </td></tr>
  </table>
</div>`;
  const subject = `${paid ? 'فاتورة اشتراك' : 'فاتورة مستحقة'} DEV MENU — ${store.name} — ${sar(total)}`;
  const text = [
    `فاتورة اشتراك DEV MENU (${number})`, `العميل: ${store.name}`, `التاريخ: ${today}`,
    ...lines.map(l => `- ${l.label}${l.detail ? ` (${l.detail})` : ''}: ${sar(l.amount)}`),
    `${paid ? 'المجموع المدفوع' : 'المبلغ المستحق'}: ${sar(total)}`,
    ...(validUntil ? [`الاشتراك ساري حتى: ${riyadhDate(validUntil)}`] : []),
    ...(note ? [note] : []), `للتواصل: https://wa.me/${SUPPORT_WA}`
  ].join('\n');
  return { subject, html, text, total };
}

module.exports = { PLAN_PRICE, invoiceNumber, invoiceEmail, branchProration };
