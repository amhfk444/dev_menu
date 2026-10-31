// =====================================================================
// DEV MENU — إشعار لصاحب المحل يطلع في جرس لوحة التحكم
//   ينحفظ على المتجر الرئيسي (الحساب كله)، ويطلع في لوحة كل فروعه
// =====================================================================
const { rest } = require('./core');
const { topic, poke } = require('./live');

// ids: رقم متجر أو قائمة أرقام (المتجر الرئيسي)
async function notifyOwner(ids, { kind = 'admin', title, body = '', link = null }) {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger))];
  if (!list.length || !title) return 0;
  const rows = list.map(client_id => ({ client_id, kind, title: String(title).slice(0, 120), body: String(body || '').slice(0, 1000) || null, link }));
  for (let i = 0; i < rows.length; i += 500) await rest('owner_notifications', { method: 'POST', body: rows.slice(i, i + 500) });
  // اللوحات المفتوحة (المتجر الرئيسي وفروعه) تجيب الإشعار على طول بدون تحديث الصفحة
  try {
    const branches = [];
    for (let i = 0; i < list.length; i += 200) branches.push(...await rest(`clients?parent_id=in.(${list.slice(i, i + 200).join(',')})&select=id`).catch(() => []));
    await poke([...list, ...branches.map(b => b.id)].map(id => topic('owner', id)), 'notify');
  } catch (e) { console.error('NOTIFY_LIVE', e.message); }
  return list.length;
}

module.exports = { notifyOwner };
