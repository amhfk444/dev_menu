// =====================================================================
// DEV MENU — إشعار لصاحب المحل يطلع في جرس لوحة التحكم
//   ينحفظ على المتجر الرئيسي (الحساب كله)، ويطلع في لوحة كل فروعه
// =====================================================================
const { rest } = require('./core');

// ids: رقم متجر أو قائمة أرقام (المتجر الرئيسي)
async function notifyOwner(ids, { kind = 'admin', title, body = '', link = null }) {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger))];
  if (!list.length || !title) return 0;
  const rows = list.map(client_id => ({ client_id, kind, title: String(title).slice(0, 120), body: String(body || '').slice(0, 1000) || null, link }));
  for (let i = 0; i < rows.length; i += 500) await rest('owner_notifications', { method: 'POST', body: rows.slice(i, i + 500) });
  return list.length;
}

module.exports = { notifyOwner };
