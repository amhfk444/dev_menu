// =====================================================================
// DEV MENU — API المدير العام (السوبر أدمن)
// كل طلب يتحقق من إن البريد موجود في جدول super_admins قبل أي شي
// =====================================================================
const crypto = require('crypto');
const {
  handler, rest, rpc, q, storage, storagePathFromUrl, BUCKET,
  ApiError, getUser, isSuperAdmin, str, int, readBody, waNumber, SLUG_RE, RESERVED_SLUGS, SITE, storeLink
} = require('./_lib/core');
const { followParentFeatures } = require('./_lib/branch-features');
const { notifyOwner } = require('./_lib/owner-notify');

const { sendMail, mailConfigured } = require('./_lib/mail');
const { PLAN_PRICE, invoiceNumber, invoiceEmail, branchProration, branchInvoiceLines } = require('./_lib/invoice');
const PLANS = require('./_lib/plans');
const SECTORS = require('./_lib/sectors');

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
const SUBSCRIPTION_FIELDS = 'subscription_status,subscription_end_date,trial_ends_at,subscription_plan';
async function syncBranchSubscriptions(parentId) {
  const parent = (await rest(`clients?id=eq.${parentId}&select=${SUBSCRIPTION_FIELDS}`))[0];
  if (!parent) return;
  try { await rest(`clients?parent_id=eq.${parentId}`, { method: 'PATCH', body: parent }); } catch {}
}

// الفروع القديمة (بدون مميزات خاصة) تاخذ مميزات الحساب، والفرع اللي له مميزاته يبقى عليها
// والفرع اللي له مميزاته ياخذ معها مميزات الحساب كله (الولاء والرسائل)
module.exports = handler(['GET', 'POST'], async (req) => {
  const user = await getUser(req);
  if (!(await isSuperAdmin(user.email))) throw new ApiError(403, 'هذه الصفحة للمدير العام فقط', 'FORBIDDEN');

  const action = req.query.action;

  if (action === 'check') return { ok: true, email: user.email };

  if (action === 'list' && req.method === 'GET') {
    return { clients: await rest('clients?select=*&order=id.desc') };
  }

  // طلبات المشتركين (تجديد، باقة، تفعيل، تواصل)
  if (action === 'support' && req.method === 'GET') {
    const rows = await rest('support_requests?select=id,client_id,kind,body,meta,status,reply,created_at,handled_at&order=status.desc,id.desc&limit=200').catch(() => null);
    return { requests: rows || [], ready: !!rows };
  }

  if (req.method !== 'POST') throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
  const b = readBody(req);

  if (action === 'support-update') {
    const id = Number(b.id);
    if (!Number.isInteger(id)) throw new ApiError(400, 'الطلب غير صحيح');
    const body = { status: b.status === 'open' ? 'open' : 'done', handled_at: b.status === 'open' ? null : new Date().toISOString() };
    if (typeof b.reply === 'string') body.reply = b.reply.trim().slice(0, 1000) || null;
    const row = (await rest(`support_requests?id=eq.${id}`, { method: 'PATCH', prefer: 'return=representation', body }))[0];
    if (!row) throw new ApiError(404, 'الطلب غير موجود');
    // رد جديد: يوصل صاحب المحل إشعار في جرس لوحته
    if (body.reply) await notifyOwner(row.client_id, { kind: 'reply', title: 'ردّت الإدارة على طلبك', body: body.reply, link: '#account' }).catch(e => console.error('NOTIFY_REPLY', e.message));
    return { request: row };
  }

  // ─── منيو جاهز لعميل محتمل: متجر بدون صاحب (بدون بريد) يجهّزه المدير العام ويرسل رابطه ───
  // ما أحد يقدر يدخل لوحته غير المدير العام، لين يُنقل لبريد صاحب المطعم بـ "transfer"
  if (action === 'prospect-create') {
    const name = str(b.name, 80, 'اسم المنشأة');
    if (!name) throw new ApiError(400, 'اكتب اسم المنشأة');
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

  // نوع إشعار الإدارة: تنبيه، تذكير، معلومة، أو أخرى (عنوانه يكتبه المدير)
  const NOTICE_KINDS = { alert: 'تنبيه', reminder: 'تذكير', info: 'معلومة', admin: '' };
  const notice = () => {
    const kind = Object.prototype.hasOwnProperty.call(NOTICE_KINDS, b.kind) ? b.kind : 'admin';
    const title = str(b.title, 120, 'العنوان') || NOTICE_KINDS[kind] || 'إشعار من الإدارة';
    return { kind, title };
  };
  // إشعار لكل المشتركين (أو اللي في التجربة، أو المشتركين المدفوعين): يطلع في جرس لوحاتهم
  if (action === 'notify-all') {
    const message = str(b.message, 1000, 'الإشعار');
    if (!message) throw new ApiError(400, 'اكتب الإشعار');
    const who = ['trial', 'active'].includes(b.audience) ? `&subscription_status=eq.${b.audience}` : '';
    const stores = await rest(`clients?parent_id=is.null&is_active=is.true&email=not.is.null&email=not.like.*%40prospect.invalid${who}&select=id`);
    const sent = await notifyOwner(stores.map(c => c.id), { ...notice(), body: message });
    return { sent };
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
    // المميزات: اللي اختارها المدير العام، أو اللي طلبها صاحب المحل، أو باقته الحالية
    const cur = (await rest(`clients?id=eq.${id}&select=plan_features,requested_features`))[0] || {};
    const features = PLANS.clean(Array.isArray(b.features) && b.features.length ? b.features : (cur.requested_features && cur.requested_features.length ? cur.requested_features : (cur.plan_features && cur.plan_features.length ? cur.plan_features : PLANS.LEGACY)));
    if (!features.length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل');
    await rpc('server_activate', { p_client_id: id, p_period: b.period });
    // الباقة والمميزات المفعّلة، ونشيل طلب الاشتراك المعلّق
    await rest(`clients?id=eq.${id}`, { method: 'PATCH', body: { subscription_plan: b.period, plan_features: features, waitlist_enabled: features.includes('waitlist'), requested_plan: null, requested_features: null, plan_requested_at: null } })
      .catch(e => console.error('PLAN_SAVE', e.message));
    await followParentFeatures(id, features);
    await syncBranchSubscriptions(id);
    // فاتورة مدفوعة: المتجر + كل فرع
    const main = (await rest(`clients?id=eq.${id}&select=id,name,email,subscription_end_date`))[0];
    let branches = [];
    try { branches = await rest(`clients?parent_id=eq.${id}&select=name,client_slug,branch_features&order=id.asc`); } catch {}
    const yearly = b.period === 'year';
    const span = yearly ? 'سنة' : 'شهر';
    const pr = PLANS.price(features, b.period, branches);
    const invoice = await sendInvoice(main, {
      status: 'paid', validUntil: main.subscription_end_date,
      lines: [
        ...pr.lines.map(l => ({ label: l.label, detail: `${l.key === 'branch' ? (l.detail || l.branches.map(br => br.name || br.client_slug).join('، ')) : main.name} لمدة ${span}`, amount: l.amount })),
        ...pr.discounts.map(d => ({ label: d.label, detail: '', amount: -d.amount }))
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
      const url = storeLink(target.client_slug, 'menu');
      mailed = await sendMail({
        to: email, fromName: 'DEV MENU',
        subject: `منيو ${target.name} جاهز على DEV MENU`,
        text: `مرحباً،\n\nجهّزنا منيو "${target.name}" الرقمي على DEV MENU:\n${url}\n\nلإدارته (تعديل الأسعار والأطباق): ادخل على ${SITE}/login.html بهذا البريد (${email}).\nتجربتك المجانية 7 أيام.\n\nفريق DEV MENU`,
        html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#1b3022">
          <h2 style="margin:0 0 10px">منيو ${escHtml(target.name)} جاهز</h2>
          <p>جهّزنا منيو منشأتك الرقمي على DEV MENU: <a href="${url}">${url}</a></p>
          <p>لإدارته (تعديل الأسعار والأطباق والصور) ادخل على <a href="${SITE}/login.html">صفحة الدخول</a> بهذا البريد: <b dir="ltr">${escHtml(email)}</b></p>
          <p>تجربتك المجانية 7 أيام.</p><p style="color:#6b7280">فريق DEV MENU</p></div>`
      }).catch(() => false);
    }
    return { ...out, mailed };
  }
  // إشعار من الإدارة لمحل واحد: يطلع في جرس لوحته (للحساب كله)
  if (action === 'notify') {
    const message = str(b.message, 1000, 'الإشعار');
    if (!message) throw new ApiError(400, 'اكتب الإشعار');
    const target = (await rest(`clients?id=eq.${id}&select=id,parent_id`))[0];
    if (!target) throw new ApiError(404, 'المتجر غير موجود');
    await notifyOwner(target.parent_id || target.id, { ...notice(), body: message });
    return { ok: true };
  }
  if (action === 'featured') return patch({ is_featured: b.featured === true });
  // نوع نشاط المحل (المدير العام يعدّله)
  if (action === 'business-type') {
    if (!SECTORS.KEYS.includes(b.type)) throw new ApiError(400, 'نوع نشاط غير صحيح');
    return patch({ business_type: b.type, business_label: b.type === 'other' ? (str(b.label, 60, 'اسم النشاط') || null) : null });
  }
  // إضافة قائمة الانتظار المدفوعة (يفعّلها المدير العام بعد الدفع)
  if (action === 'waitlist-addon') return patch({ waitlist_enabled: b.enabled === true });
  // مميزات المحل (المدير العام يتحكم فيها مباشرة)
  if (action === 'features') {
    const features = PLANS.clean(b.features);
    // نوع الاشتراك (شهري / سنوي) يتغيّر هنا بدون تجديد ولا تغيير تاريخ الانتهاء
    const plan = ['month', 'year'].includes(b.period) ? { subscription_plan: b.period } : {};
    const target = (await rest(`clients?id=eq.${id}&select=parent_id`))[0];
    if (target && target.parent_id) {
      // الفرع: مميزاته الخاصة (يدفع ربط الفرع + سعرها)، ومعها مميزات الحساب كله
      const own = PLANS.ownBranch(features);
      const parent = (await rest(`clients?id=eq.${target.parent_id}&select=id,name,email,plan_features,subscription_status,subscription_plan,subscription_end_date`))[0] || {};
      const all = PLANS.branchFeatures(own, parent.plan_features || []);
      if (!all.length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل للفرع');
      const before = (await rest(`clients?id=eq.${id}&select=name,branch_features`))[0] || {};
      const out = await patch({ branch_features: own, plan_features: all, waitlist_enabled: all.includes('waitlist') });
      // في نص الاشتراك: فاتورة الفرق عن الأيام الباقية لين تجديد الحساب (لو زاد السعر)
      let invoice = null;
      const now = branchProration(parent, own), old = branchProration(parent, before.branch_features);
      const due = now && old ? now.amount - old.amount : 0;
      if (due > 0 && b.invoice !== false) {
        const added = own.filter(k => !(before.branch_features || []).includes(k)).map(k => PLANS.FEATURES[k].name).join(' + ');
        invoice = await sendInvoice(parent, {
          status: 'due', validUntil: now.end,
          lines: [{ label: `مميزات فرع ${before.name || ''}`.trim(), detail: `${added ? `إضافة ${added}، ` : ''}${now.days} يوم لين تجديد الحساب`, amount: due }],
          note: `بعد تاريخ التجديد يتجدد الفرع مع الحساب بـ ${now.renew}. للدفع تواصل معنا عبر واتساب.`
        });
      }
      // موافقة على طلب صاحب المحل: يتقفل الطلب ويطلع له الرد في لوحته
      const reqId = Number(b.request_id);
      if (Number.isInteger(reqId) && reqId > 0) {
        const reply = `تفعّلت مميزات فرع "${before.name || ''}": ${all.map(k => PLANS.FEATURES[k].name).join('، ')}.${invoice && invoice.sent ? ` وأرسلنا فاتورة الفرق على ${invoice.to}.` : ''}`;
        await rest(`support_requests?id=eq.${reqId}&client_id=eq.${parent.id}`, { method: 'PATCH', body: { status: 'done', reply, handled_at: new Date().toISOString() } }).catch(() => {});
        await notifyOwner(parent.id, { kind: 'branch', title: 'تفعّلت مميزات فرعك', body: reply, link: '#branches' }).catch(() => {});
      }
      return { ...out, invoice, due: due > 0 ? due : 0, renew: now ? now.renew : null };
    }
    const out = await patch({ plan_features: features, waitlist_enabled: features.includes('waitlist'), ...plan });
    if (!out.client.parent_id) await followParentFeatures(id, features);
    return out;
  }
  // إضافة ردود التقييمات بالذكاء الاصطناعي

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
    // مميزات الفرع: يختارها صاحب المحل ويدفع ربط الفرع + سعرها، ومعها مميزات الحساب كله (الولاء والرسائل)
    const features = PLANS.clean(PLANS.ownBranch(b.features));
    const parentFeats = ((await rest(`clients?id=eq.${id}&select=plan_features`))[0] || {}).plan_features || PLANS.LEGACY;
    const all = PLANS.branchFeatures(features, parentFeats);
    if (!all.length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل للفرع');
    const newId = int(await rpc('server_create_branch', { p_parent_id: id, p_name: name, p_slug: slug }));
    await rest(`clients?id=eq.${newId}`, { method: 'PATCH', body: { branch_features: features, plan_features: all, waitlist_enabled: all.includes('waitlist') } });
    // منيو فارغ: الفرع ياخذ الهوية والإعدادات بس، بدون الأقسام والأطباق
    if (b.empty_menu === true || !features.includes('menu')) {
      await rest(`products?client_id=eq.${newId}`, { method: 'DELETE' });
      await rest(`categories?client_id=eq.${newId}`, { method: 'DELETE' });
    }
    await syncBranchSubscriptions(id);
    const client = (await rest(`clients?id=eq.${newId}&select=*`))[0];
    // فرع في نص الاشتراك: فاتورة مستحقة عن الأيام الباقية لين تجديد الحساب
    const main = (await rest(`clients?id=eq.${id}&select=id,name,email,subscription_status,subscription_plan,subscription_end_date`))[0];
    // فاتورة وحدة مفصّلة: كل بند محسوب على الأيام الباقية، ومن التجديد الجاي يدخل الفرع بسعره الكامل في فاتورة الحساب
    const bill = branchInvoiceLines(main, features, client.name);
    let invoice = null;
    if (bill) {
      invoice = await sendInvoice(main, {
        status: 'due', validUntil: bill.pr.end, lines: bill.lines,
        note: `الفرع "${client.name}" تفعّل الحين، وهذي الفاتورة عن ${bill.pr.days} يوم الباقية لين تجديد حسابك. من تاريخ التجديد يتجدد الفرع مع الحساب في نفس الفاتورة بسعره الكامل: ${bill.pr.renew}. للدفع تواصل معنا عبر واتساب.`
      });
    }
    // موافقة على طلب صاحب المحل: يتقفل الطلب ويطلع له الرد في لوحته
    const reqId = Number(b.request_id);
    if (Number.isInteger(reqId) && reqId > 0) {
      const reply = `تمت إضافة فرع "${client.name}"، تلقاه في "فروعك" وتديره من نفس حسابك.${invoice && invoice.sent ? ` وأرسلنا الفاتورة على ${invoice.to}.` : ''}`;
      await rest(`support_requests?id=eq.${reqId}&client_id=eq.${id}`, { method: 'PATCH', body: { status: 'done', reply, handled_at: new Date().toISOString() } }).catch(() => {});
    }
    // إشعار في جرس لوحته: الفرع انضاف (وفاتورته لو فيه مبلغ)
    await notifyOwner(id, { kind: 'branch', title: 'تمت إضافة فرعك', body: `فرع "${client.name}" صار جاهز في "الفروع".${invoice && invoice.sent ? ` وأرسلنا الفاتورة على ${invoice.to}.` : ''}`, link: '#branches' }).catch(() => {});
    return { client, invoice, bill: bill ? { lines: bill.lines, total: bill.pr.amount, days: bill.pr.days, renew: bill.pr.renew } : null };
  }

  if (action === 'summary') {
    const [products, categories] = await Promise.all([
      rest(`products?client_id=eq.${id}&select=id`),
      rest(`categories?client_id=eq.${id}&select=id`)
    ]);
    return { products: products.length, categories: categories.length };
  }

  if (action === 'delete') {
    const client = (await rest(`clients?id=eq.${id}&select=logo_url,bg_image_url,bg_video_url,links_bg_image_url,links_bg_video_url`))[0];
    if (!client) throw new ApiError(404, 'المتجر غير موجود');
    let branches = [];
    try { branches = await rest(`clients?parent_id=eq.${id}&select=id&limit=1`); } catch {}
    if (branches.length) throw new ApiError(400, 'المتجر له فروع، احذف الفروع أولاً', 'HAS_BRANCHES');
    // 1) نجمع مسارات الملفات قبل حذف البيانات
    const products = await rest(`products?client_id=eq.${id}&select=image_url`);
    const paths = new Set();
    // ملفات هذا المتجر فقط: الفرع يستخدم صور المتجر الرئيسي، فما نحذفها معه
    [client.logo_url, client.bg_image_url, client.bg_video_url, client.links_bg_image_url, client.links_bg_video_url, ...products.map(p => p.image_url)]
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

  throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
});
