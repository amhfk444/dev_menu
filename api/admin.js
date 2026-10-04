// =====================================================================
// DEV MENU — API المدير العام (السوبر أدمن)
// كل طلب يتحقق من إن البريد موجود في جدول super_admins قبل أي شي
// =====================================================================
const crypto = require('crypto');
const {
  handler, rest, rpc, q, storage, storagePathFromUrl, BUCKET,
  ApiError, getUser, isSuperAdmin, str, int, readBody, waNumber, SLUG_RE, RESERVED_SLUGS
} = require('./_lib/core');

const { sendMail, mailConfigured } = require('./_lib/mail');
const { PLAN_PRICE, invoiceNumber, invoiceEmail, branchProration } = require('./_lib/invoice');

// يرسل الفاتورة لبريد صاحب الحساب (المتجر الرئيسي). ما يوقف العملية لو فشل
async function sendInvoice(main, invoice) {
  if (!main.email) return { sent: false, reason: 'NO_EMAIL' };
  if (!mailConfigured()) return { sent: false, reason: 'MAIL_NOT_CONFIGURED' };
  const number = invoiceNumber(main.id);
  const mail = invoiceEmail({ ...invoice, store: main, number });
  const sent = await sendMail({ to: main.email, subject: mail.subject, html: mail.html, text: mail.text });
  return { sent, reason: sent ? null : 'SEND_FAILED', to: main.email, number, total: mail.total };
}

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// رابط متاح؟ (ما يستخدمه متجر حالياً ولا سابقاً)
async function slugFree(slug) {
  if (!SLUG_RE.test(slug) || slug.includes('--') || RESERVED_SLUGS.has(slug)) return false;
  const taken = await rest(`clients?or=${q(`(client_slug.eq.${slug},old_slugs.cs.{${slug}})`)}&select=id&limit=1`);
  return taken.length === 0;
}

// الحساب = المتجر الرئيسي وفروعه باشتراك واحد: الفروع تاخذ حالة اشتراك المتجر الرئيسي
const SUBSCRIPTION_FIELDS = 'subscription_status,subscription_end_date,trial_ends_at';
async function syncBranchSubscriptions(parentId) {
  const parent = (await rest(`clients?id=eq.${parentId}&select=${SUBSCRIPTION_FIELDS}`))[0];
  if (!parent) return;
  try { await rest(`clients?parent_id=eq.${parentId}`, { method: 'PATCH', body: parent }); } catch {}
}

module.exports = handler(['GET', 'POST'], async (req) => {
  const user = await getUser(req);
  if (!(await isSuperAdmin(user.email))) throw new ApiError(403, 'هذه الصفحة للمدير العام فقط', 'FORBIDDEN');

  const action = req.query.action;

  if (action === 'check') return { ok: true, email: user.email };

  if (action === 'list' && req.method === 'GET') {
    return { clients: await rest('clients?select=*&order=id.desc') };
  }

  if (req.method !== 'POST') throw new ApiError(404, 'Unknown action');
  const b = readBody(req);

  // ─── منيو جاهز لعميل محتمل: متجر بدون صاحب (بدون بريد) يجهّزه المدير العام ويرسل رابطه ───
  // ما أحد يقدر يدخل لوحته غير المدير العام، لين يُنقل لبريد صاحب المطعم بـ "transfer"
  if (action === 'prospect-create') {
    const name = str(b.name, 80, 'اسم المطعم');
    if (!name) throw new ApiError(400, 'اكتب اسم المطعم');
    let phone = '';
    try { phone = waNumber(b.phone); } catch { throw new ApiError(400, 'رقم الجوال غير صحيح'); }
    const slugWanted = String(b.slug || '').trim().toLowerCase();
    if (slugWanted && !(await slugFree(slugWanted))) throw new ApiError(400, 'الرابط غير صالح أو مستخدم', 'SLUG_TAKEN');
    // نستخدم نفس دالة التسجيل ببريد مؤقت ما يستقبل رسائل (.invalid)، وبعدها نشيله
    const temp = `prospect-${crypto.randomBytes(6).toString('hex')}@prospect.invalid`;
    const slug = await rpc('server_register_client', { p_email: temp, p_name: name, p_phone: phone, p_type: 'restaurant' });
    const row = (await rest(`clients?email=eq.${q(temp)}&select=id&limit=1`))[0];
    if (!row) throw new ApiError(500, 'تعذر إنشاء المتجر');
    // فترة تجربة أطول (30 يوم) عشان يبقى رابط العرض شغال لين يرد العميل
    const extra = { trial_ends_at: new Date(Date.now() + 30 * 86400e3).toISOString() };
    if (slugWanted && slugWanted !== slug) extra.client_slug = slugWanted;
    await rest(`clients?id=eq.${row.id}`, { method: 'PATCH', body: extra });
    try { await rest(`clients?id=eq.${row.id}`, { method: 'PATCH', body: { email: null } }); } catch {}   // لو العمود ما يقبل فاضي يبقى البريد المؤقت
    return { client: (await rest(`clients?id=eq.${row.id}&select=*`))[0] };
  }

  const id = int(b.id);
  if (!Number.isInteger(id)) throw new ApiError(400, 'معرف المتجر غير صحيح');
  const patch = async (payload) => {
    const rows = await rest(`clients?id=eq.${id}`, { method: 'PATCH', body: payload, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'المتجر غير موجود');
    return { client: rows[0] };
  };

  if (action === 'activate') {
    if (!['month', 'year'].includes(b.period)) throw new ApiError(400, 'مدة غير صحيحة');
    const target = (await rest(`clients?id=eq.${id}&select=id,parent_id`))[0];
    if (!target) throw new ApiError(404, 'المتجر غير موجود');
    if (target.parent_id) throw new ApiError(400, 'اشتراك الفرع تابع للمتجر الرئيسي، جدّد من بطاقة المتجر الرئيسي', 'BRANCH_FOLLOWS_PARENT');
    await rpc('server_activate', { p_client_id: id, p_period: b.period });
    await syncBranchSubscriptions(id);
    // فاتورة مدفوعة: المتجر + كل فرع
    const main = (await rest(`clients?id=eq.${id}&select=id,name,email,subscription_end_date`))[0];
    let branches = [];
    try { branches = await rest(`clients?parent_id=eq.${id}&select=name,client_slug&order=id.asc`); } catch {}
    const invoice = await sendInvoice(main, {
      status: 'paid', validUntil: main.subscription_end_date,
      lines: [
        { label: `الباقة السنوية — ${main.name}`, detail: 'كل المزايا لمدة سنة', amount: PLAN_PRICE.year },
        ...branches.map(br => ({ label: `فرع — ${br.name || br.client_slug}`, detail: 'ضمن نفس الاشتراك لمدة سنة', amount: PLAN_PRICE.branch }))
      ]
    });
    return { ok: true, invoice };
  }
  // إيقاف/تشغيل المتجر الرئيسي يشمل فروعه، والفرع يقدر ينوقف لحاله
  if (action === 'set-active') {
    const out = await patch({ is_active: b.active === true });
    if (!out.client.parent_id) { try { await rest(`clients?parent_id=eq.${id}`, { method: 'PATCH', body: { is_active: b.active === true } }); } catch {} }
    return out;
  }
  if (action === 'rename') {
    const name = str(b.name, 80, 'الاسم');
    if (!name) throw new ApiError(400, 'اكتب الاسم');
    return patch({ name });
  }
  // ─── نقل المتجر لصاحب المطعم: يدخل ببريده (رمز تحقق أو Google) ويلقى المنيو جاهز ───
  if (action === 'transfer') {
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new ApiError(400, 'البريد غير صحيح');
    const target = (await rest(`clients?id=eq.${id}&select=id,name,client_slug,parent_id,subscription_status`))[0];
    if (!target) throw new ApiError(404, 'المتجر غير موجود');
    if (target.parent_id) throw new ApiError(400, 'الفرع يتبع صاحب المتجر الرئيسي، انقل المتجر الرئيسي');
    const taken = await rest(`clients?email=eq.${q(email)}&id=neq.${id}&select=id&limit=1`);
    if (taken.length) throw new ApiError(409, 'هذا البريد مرتبط بمتجر ثاني', 'EMAIL_TAKEN');
    const body = { email };
    // التجربة المجانية (7 أيام) تبدأ من يوم استلامه للمتجر
    if (target.subscription_status === 'trial') body.trial_ends_at = new Date(Date.now() + 7 * 86400e3).toISOString();
    const out = await patch(body);
    let mailed = false;
    if (mailConfigured()) {
      const url = `https://${target.client_slug}.devmenu.digital/`;
      mailed = await sendMail({
        to: email, fromName: 'DEV MENU',
        subject: `منيو ${target.name} جاهز على DEV MENU`,
        text: `مرحباً،\n\nجهّزنا منيو "${target.name}" الرقمي على DEV MENU:\n${url}\n\nلإدارته (تعديل الأسعار والأطباق): ادخل على https://www.devmenu.digital/login.html بهذا البريد (${email}).\nتجربتك المجانية 7 أيام.\n\nفريق DEV MENU`,
        html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#1b3022">
          <h2 style="margin:0 0 10px">منيو ${escHtml(target.name)} جاهز</h2>
          <p>جهّزنا منيو مطعمك الرقمي على DEV MENU: <a href="${url}">${url}</a></p>
          <p>لإدارته (تعديل الأسعار والأطباق والصور) ادخل على <a href="https://www.devmenu.digital/login.html">صفحة الدخول</a> بهذا البريد: <b dir="ltr">${escHtml(email)}</b></p>
          <p>تجربتك المجانية 7 أيام.</p><p style="color:#6b7280">فريق DEV MENU</p></div>`
      }).catch(() => false);
    }
    return { ...out, mailed };
  }
  if (action === 'notify') return patch({ admin_notification: str(b.message, 300, 'الإشعار') || null });
  if (action === 'featured') return patch({ is_featured: b.featured === true });
  // إضافة قائمة الانتظار المدفوعة (يفعّلها المدير العام بعد الدفع)
  if (action === 'waitlist-addon') return patch({ waitlist_enabled: b.enabled === true });

  // ─── إضافة فرع: نسخة من المنيو يديرها صاحب المتجر الرئيسي من لوحته ───
  if (action === 'branch-create') {
    const parent = (await rest(`clients?id=eq.${id}&select=id,client_slug,parent_id`))[0];
    if (!parent) throw new ApiError(404, 'المتجر غير موجود');
    if (parent.parent_id) throw new ApiError(400, 'هذا فرع، أضف الفرع للمتجر الرئيسي');
    const name = str(b.name, 80, 'اسم الفرع');
    if (!name) throw new ApiError(400, 'اكتب اسم الفرع');
    let slug = String(b.slug || '').trim().toLowerCase();
    if (slug) {
      if (!(await slugFree(slug))) throw new ApiError(400, 'رابط الفرع غير صالح أو مستخدم', 'SLUG_TAKEN');
    } else {
      // تلقائي: رابط الرئيسي + رقم (duja-2، duja-3...)
      const base = parent.client_slug.replace(/_/g, '-').slice(0, 26).replace(/-+$/, '');
      for (let n = 2; n < 100 && !slug; n++) if (await slugFree(`${base}-${n}`)) slug = `${base}-${n}`;
      if (!slug) throw new ApiError(400, 'تعذر اختيار رابط للفرع، اكتبه يدوياً');
    }
    const newId = int(await rpc('server_create_branch', { p_parent_id: id, p_name: name, p_slug: slug }));
    // منيو فارغ: الفرع ياخذ الهوية والإعدادات بس، بدون الأقسام والأطباق
    if (b.empty_menu === true) {
      await rest(`products?client_id=eq.${newId}`, { method: 'DELETE' });
      await rest(`categories?client_id=eq.${newId}`, { method: 'DELETE' });
    }
    await syncBranchSubscriptions(id);
    const client = (await rest(`clients?id=eq.${newId}&select=*`))[0];
    // فرع في نص الاشتراك: فاتورة مستحقة عن الأيام الباقية لين تجديد الحساب
    const main = (await rest(`clients?id=eq.${id}&select=id,name,email,subscription_status,subscription_end_date`))[0];
    const pr = branchProration(main);
    let invoice = null;
    if (pr && pr.amount > 0) {
      invoice = await sendInvoice(main, {
        status: 'due', validUntil: pr.end,
        lines: [{ label: `فرع جديد — ${client.name}`, detail: `${pr.days} يوم لين تجديد الحساب`, amount: pr.amount }],
        note: `بعد تاريخ التجديد يتجدد الفرع مع الحساب بـ ${PLAN_PRICE.branch} ر.س سنوياً. للدفع تواصل معنا عبر واتساب.`
      });
    }
    return { client, invoice };
  }

  if (action === 'summary') {
    const [products, categories] = await Promise.all([
      rest(`products?client_id=eq.${id}&select=id`),
      rest(`categories?client_id=eq.${id}&select=id`)
    ]);
    return { products: products.length, categories: categories.length };
  }

  if (action === 'delete') {
    const client = (await rest(`clients?id=eq.${id}&select=logo_url,bg_image_url,bg_video_url`))[0];
    if (!client) throw new ApiError(404, 'المتجر غير موجود');
    let branches = [];
    try { branches = await rest(`clients?parent_id=eq.${id}&select=id&limit=1`); } catch {}
    if (branches.length) throw new ApiError(400, 'المتجر له فروع، احذف الفروع أولاً', 'HAS_BRANCHES');
    // 1) نجمع مسارات الملفات قبل حذف البيانات
    const products = await rest(`products?client_id=eq.${id}&select=image_url`);
    const paths = new Set();
    // ملفات هذا المتجر فقط: الفرع يستخدم صور المتجر الرئيسي، فما نحذفها معه
    [client.logo_url, client.bg_image_url, client.bg_video_url, ...products.map(p => p.image_url)]
      .forEach(u => { const p = storagePathFromUrl(u); if (p && p.startsWith(`${id}/`)) paths.add(p); });
    try {
      const listed = await storage(`object/list/${BUCKET}`, { body: { prefix: `${id}/`, limit: 1000 } });
      (listed || []).forEach(f => { if (f && f.id && f.name) paths.add(`${id}/${f.name}`); });
    } catch (e) { console.warn('storage list failed', e.message); }

    // 2) حذف البيانات وحساب الدخول
    await rpc('server_delete_client', { p_client_id: id });

    // 3) حذف الملفات
    if (paths.size) {
      try { await storage(`object/${BUCKET}`, { method: 'DELETE', body: { prefixes: [...paths] } }); }
      catch (e) { console.warn('storage delete failed', e.message); }
    }
    return { ok: true, files: paths.size };
  }

  throw new ApiError(404, 'Unknown action');
});
