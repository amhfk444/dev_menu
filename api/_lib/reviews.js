// =====================================================================
// DEV MENU — مزامنة تعليقات قوقل ماب: تعليق جديد ← رد من الذكاء الاصطناعي ← إشعار + إيميل لصاحب المطعم
// ما ينشر شي في قوقل إلا بعد موافقة صاحب المطعم (owner.js → review-approve)
// =====================================================================
const { rest, q } = require('./core');
const { accessToken, listReviews } = require('./google');
const { draftReviewReply } = require('./ai');
const { sendPush } = require('./push');
const { sendMail, mailConfigured } = require('./mail');

const MAX_PER_RUN = 5;          // حد الردود الجديدة لكل متجر في كل مزامنة (يحمي التكلفة)
const FIRST_SYNC_DAYS = 30;     // أول ربط: التعليقات بدون رد من آخر 30 يوم بس، مو كل التاريخ
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const dashboardUrl = (store) => `https://www.devmenu.digital/admin.html${store.parent_id ? `?branch=${store.id}` : ''}#reviews`;

// ─── مزامنة متجر واحد ───
async function syncStore(store, conn) {
  const patchConn = (body) => rest(`google_connections?client_id=eq.${store.id}`, { method: 'PATCH', body }).catch(() => {});
  if (!conn.account_name || !conn.location_name) return { added: 0, skipped: 'NO_LOCATION' };
  try {
    const token = await accessToken(conn.refresh_token_enc);
    const reviews = await listReviews(token, conn.account_name, conn.location_name);
    const known = await rest(`review_drafts?client_id=eq.${store.id}&source=eq.google&select=id,google_name,status&order=id.desc&limit=500`);
    const byName = new Map(known.map(k => [k.google_name, k]));

    // رد عليه صاحب المطعم من قوقل مباشرة ← نشيله من قائمة الانتظار
    const repliedElsewhere = reviews.filter(r => r.replied && byName.get(r.name) && byName.get(r.name).status === 'pending');
    for (const r of repliedElsewhere) {
      await rest(`review_drafts?id=eq.${byName.get(r.name).id}`, { method: 'PATCH', body: { status: 'dismissed', error: 'تم الرد عليه من قوقل مباشرة' } }).catch(() => {});
    }

    const since = conn.last_sync_at ? 0 : Date.now() - FIRST_SYNC_DAYS * 864e5;
    const fresh = reviews
      .filter(r => !r.replied && r.rating > 0 && !byName.has(r.name) && Date.parse(r.createTime) >= since)
      .slice(0, MAX_PER_RUN);

    const added = [];
    for (const r of fresh) {
      const review = r.comment || '(تقييم بالنجوم بدون تعليق مكتوب)';
      let reply;
      try { reply = await draftReviewReply({ storeName: store.name, businessType: store.business_type, review, rating: r.rating, reviewer: r.reviewer }); }
      catch (e) { console.error('REVIEW_DRAFT_FAILED', store.id, e.message); break; }
      const row = (await rest('review_drafts', {
        method: 'POST', prefer: 'return=representation',
        body: { client_id: store.id, source: 'google', google_name: r.name, reviewer: r.reviewer || null, rating: r.rating,
                review, reply, status: 'pending', reviewed_at: r.createTime || null, tone: 'friendly' }
      }).catch(() => []))[0];
      if (row) added.push(row);
    }
    await patchConn({ last_sync_at: new Date().toISOString(), sync_error: null });
    if (added.length) await notifyOwner(store, added);
    return { added: added.length };
  } catch (e) {
    await patchConn({ sync_error: e.message || 'تعذرت المزامنة' });
    throw e;
  }
}

// ─── إشعار على أجهزة صاحب المطعم + إيميل ───
async function notifyOwner(store, drafts) {
  const url = dashboardUrl(store);
  const first = drafts[0];
  const title = drafts.length === 1 ? `${stars(first.rating)} تعليق جديد في قوقل ماب` : `${drafts.length} تعليقات جديدة في قوقل ماب`;
  const body = drafts.length === 1
    ? `${first.reviewer || 'عميل'}: ${first.review.slice(0, 90)}\nالرد جاهز، وافق عليه بضغطة.`
    : 'الردود جاهزة، راجعها ووافق عليها.';

  let devices = [];
  try { devices = await rest(`owner_push?client_id=eq.${store.id}&select=id,sub`); } catch {}
  for (const d of devices) {
    const result = await sendPush(d.sub, { title, body, url, tag: `reviews-${store.id}` });
    if (result === 'gone') await rest(`owner_push?id=eq.${d.id}`, { method: 'DELETE' }).catch(() => {});
  }

  // الإيميل: بريد صاحب الحساب (الفرع ياخذ بريد المتجر الرئيسي)
  let email = store.email;
  if (!email && store.parent_id) email = ((await rest(`clients?id=eq.${store.parent_id}&select=email`).catch(() => []))[0] || {}).email;
  if (!email || /@prospect\.invalid$/.test(email) || !mailConfigured()) return;
  const items = drafts.map(d => `
    <div style="border:1px solid #e5ded2;border-radius:12px;padding:14px;margin:12px 0;background:#fff">
      <div style="color:#b8891b;font-size:15px">${stars(d.rating)}</div>
      <div style="font-weight:bold;margin:4px 0">${esc(d.reviewer || 'عميل')}</div>
      <div style="color:#4d5e52">${esc(d.review)}</div>
      <div style="border-right:3px solid #c9a227;padding-right:10px;margin-top:10px">
        <div style="font-size:12px;color:#6f7d72">الرد المقترح:</div>
        <div>${esc(d.reply)}</div>
      </div>
    </div>`).join('');
  await sendMail({
    to: email, fromName: 'DEV MENU',
    subject: drafts.length === 1 ? `تعليق جديد على ${store.name} — الرد جاهز` : `${drafts.length} تعليقات جديدة على ${store.name} — الردود جاهزة`,
    text: `${title}\n\n${drafts.map(d => `${stars(d.rating)} ${d.reviewer || 'عميل'}: ${d.review}\nالرد المقترح: ${d.reply}`).join('\n\n')}\n\nوافق أو عدّل من لوحة التحكم: ${url}`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#22362a;max-width:560px">
      <h2 style="margin:0 0 6px">${esc(title)}</h2>
      <p style="margin:0;color:#4d5e52">كتبنا لك رد على ${drafts.length === 1 ? 'التعليق' : 'كل تعليق'}. ما ينزل شي في قوقل إلا بعد موافقتك.</p>
      ${items}
      <a href="${url}" style="display:inline-block;background:#384f3d;color:#fbf8f3;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">راجع الردود ووافق عليها</a>
    </div>`
  }).catch(e => console.error('REVIEW_MAIL_FAILED', store.id, e.message));
}

module.exports = { syncStore };
