// =====================================================================
// DEV MENU — API صاحب المتجر: المنيو: الأقسام والأطباق والإضافات، الاستيراد والمنيو من صورة، الكوبونات، المناسبات
// pre: طلبات قبل حد الـ POST (القراءة وغيرها)، post: طلبات الحفظ (بعد ما يتحدد المتجر)
// كل دالة ترجع NEXT لو الطلب مو لها
// =====================================================================
/* eslint-disable no-unused-vars */
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./shared');
const NEXT = require('./next');

module.exports.pre = async function pre(action, req, b) {

  if (action === 'coupons' && req.method === 'GET') {
    const { store } = await context(req);
    return { coupons: await rest(`coupons?client_id=eq.${store.id}&select=*&order=id.desc`) };
  }
  return NEXT;
}

module.exports.post = async function post(action, req, b, env) {
  const { store, admin, here, sid, atBranch, notInPlan } = env;

  // ─── المناسبات: كل فرع له مناسباته، ونقدر ننسخ مناسبة لفروع ثانية ───
  // النسخة مستقلة (تتعدل في فرعها لحاله). النسخ مرة ثانية يستبدل النسخة السابقة من نفس المصدر
  if (action === 'occasions-save') {
    const family = await familyOf(store, 'id,occasions');
    const ids = family.map(f => f.id);
    const mine = cleanOccasions(b.occasions, sid, ids);
    await patchStore(sid, { occasions: mine });
    const newId = () => (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 12);
    const copiedTo = new Set();
    for (const c of (Array.isArray(b.copies) ? b.copies : []).slice(0, 20)) {
      const src = mine.find(o => o.id === c.id); if (!src) continue;
      for (const bid of [...new Set((Array.isArray(c.branch_ids) ? c.branch_ids : []).map(int))]) {
        const f = family.find(x => x.id === bid); if (!f || bid === sid) continue;
        const originId = src.origin || src.id;
        const list = (Array.isArray(f.occasions) ? f.occasions : []).filter(o => o.origin !== originId && o.id !== originId);
        if (list.length >= MAX_OCCASIONS) throw new ApiError(400, `الفرع وصل حد ${MAX_OCCASIONS} مناسبة`);
        f.occasions = [...list, { ...src, id: newId(), origin: originId }];
        copiedTo.add(bid);
      }
    }
    for (const bid of copiedTo) await patchStore(bid, { occasions: family.find(x => x.id === bid).occasions });
    return { occasions: mine, copied_to: [...copiedTo], family: await familyOf(store, 'id,name,client_slug,parent_id,occasions,branch_features') };
  }

  // ─── كوبونات الخصم ───
  if (action === 'coupon-save') {
    const id = b.id == null ? null : int(b.id);
    // خصم تلقائي: بدون كود، يظهر في المنيو على الأصناف مباشرة (نولّد له رمز داخلي)
    const auto = b.auto_apply === true;
    let code = String(b.code || '').trim().toUpperCase();
    if (auto && !/^AUTO-[A-Z0-9]{6}$/.test(code)) code = 'AUTO-' + Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new ApiError(400, 'رمز الكوبون من 3 إلى 20 حرف: حروف إنجليزية وأرقام وشرطة', 'BAD_CODE');
    if (!auto && code.startsWith('AUTO-')) throw new ApiError(400, 'الرموز اللي تبدأ بـ AUTO- محجوزة للخصم التلقائي', 'BAD_CODE');
    if (!['percent', 'fixed'].includes(b.type)) throw new ApiError(400, 'نوع الخصم غير صحيح');
    const value = round2(Number(b.value));
    if (!Number.isFinite(value) || value <= 0 || value > (b.type === 'percent' ? 100 : 100000)) {
      throw new ApiError(400, b.type === 'percent' ? 'نسبة الخصم من 1 إلى 100' : 'اكتب مبلغ خصم صحيح');
    }
    const scope = b.scope === 'selected' ? 'selected' : 'all';
    let category_keys = [], product_ids = [];
    if (scope === 'selected') {
      const [cats, prods] = await Promise.all([
        rest(`categories?client_id=eq.${sid}&select=key`),
        rest(`products?client_id=eq.${sid}&select=id`)
      ]);
      const catKeys = new Set(cats.map(c => c.key)), prodIds = new Set(prods.map(p => p.id));
      category_keys = [...new Set(Array.isArray(b.category_keys) ? b.category_keys : [])].filter(k => catKeys.has(k));
      product_ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(int))].filter(i => prodIds.has(i));
      if (!category_keys.length && !product_ids.length) throw new ApiError(400, 'اختر قسم أو صنف واحد على الأقل');
    }
    let min_order = null;
    if (b.min_order !== null && b.min_order !== undefined && b.min_order !== '') {
      min_order = round2(Number(b.min_order));
      if (!validPrice(min_order)) throw new ApiError(400, 'الحد الأدنى للطلب غير صحيح');
    }
    let max_uses = null;
    if (b.max_uses !== null && b.max_uses !== undefined && b.max_uses !== '') {
      max_uses = int(b.max_uses);
      if (!Number.isInteger(max_uses) || max_uses < 1 || max_uses > 1000000) throw new ApiError(400, 'عدد مرات الاستخدام غير صحيح');
    }
    const starts_at = riyadhDate(b.starts_at, false, 'تاريخ البداية');
    const ends_at = riyadhDate(b.ends_at, true, 'تاريخ النهاية');
    if (starts_at && ends_at && Date.parse(ends_at) < Date.parse(starts_at)) throw new ApiError(400, 'تاريخ النهاية قبل تاريخ البداية');
    if (auto) { min_order = null; max_uses = null; }
    const row = {
      code, type: b.type, value, scope, category_keys, product_ids, min_order, max_uses, starts_at, ends_at, is_active: b.is_active !== false,
      auto_apply: auto, show_in_menu: auto || b.show_in_menu === true
    };
    try {
      if (id) {
        const rows = await rest(`coupons?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: row, prefer: 'return=representation' });
        if (!rows.length) throw new ApiError(404, 'الكوبون غير موجود');
        return { coupon: rows[0] };
      }
      const count = await rest(`coupons?client_id=eq.${sid}&select=id`);
      if (count.length >= MAX_COUPONS) throw new ApiError(400, `الكوبونات حدها ${MAX_COUPONS}، احذف القديمة أولاً`);
      return { coupon: (await rest('coupons', { method: 'POST', body: { ...row, client_id: sid }, prefer: 'return=representation' }))[0] };
    } catch (e) {
      if (e.code === '23505') throw new ApiError(409, 'فيه كوبون بنفس الرمز', 'CODE_TAKEN');
      throw e;
    }
  }

  if (action === 'coupon-toggle') {
    const rows = await rest(`coupons?id=eq.${int(b.id)}&client_id=eq.${sid}`, { method: 'PATCH', body: { is_active: b.value === true }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الكوبون غير موجود');
    return { coupon: rows[0] };
  }

  if (action === 'coupon-delete') {
    const rows = await rest(`coupons?id=eq.${int(b.id)}&client_id=eq.${sid}`, { method: 'DELETE', prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الكوبون غير موجود');
    return { ok: true };
  }

  // ─── الأقسام ───
  if (action === 'category-add') {
    const name = str(b.name, 60, 'اسم القسم');
    const nameEn = str(b.name_en, 60, 'الاسم الإنجليزي');
    if (!name) throw new ApiError(400, 'اكتب اسم القسم');
    const cats = await rest(`categories?client_id=eq.${sid}&select=name,sort_order`);
    if (cats.some(c => c.name === name)) throw new ApiError(400, 'يوجد قسم بنفس الاسم');
    const row = {
      client_id: sid, name, name_en: nameEn || null,
      group_name: str(b.group_name, 40, 'الفئة الرئيسية') || null,
      key: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      sort_order: Math.max(0, ...cats.map(c => c.sort_order || 0)) + 1
    };
    return { category: (await rest('categories', { method: 'POST', body: row, prefer: 'return=representation' }))[0] };
  }

  // تعديل الفئة الرئيسية لقسم (فطور، غداء، عشاء...)
  if (action === 'category-group') {
    const id = int(b.id);
    const rows = await rest(`categories?id=eq.${id}&client_id=eq.${sid}`, {
      method: 'PATCH', body: { group_name: str(b.group_name, 40, 'الفئة الرئيسية') || null }, prefer: 'return=representation'
    });
    if (!rows.length) throw new ApiError(404, 'القسم غير موجود');
    return { category: rows[0] };
  }

  if (action === 'category-rename') {
    const id = int(b.id);
    const cat = (await rest(`categories?id=eq.${id}&client_id=eq.${sid}&select=id,name`))[0];
    if (!cat) throw new ApiError(404, 'القسم غير موجود');
    const name = str(b.name, 60, 'اسم القسم');
    if (!name) throw new ApiError(400, 'اكتب اسم القسم');
    const dup = await rest(`categories?client_id=eq.${sid}&name=eq.${q(name)}&id=neq.${id}&select=id&limit=1`);
    if (dup.length) throw new ApiError(400, 'يوجد قسم بنفس الاسم');
    const rows = await rest(`categories?id=eq.${id}&client_id=eq.${sid}`, {
      method: 'PATCH', body: { name, name_en: str(b.name_en, 60, 'الاسم الإنجليزي') || null }, prefer: 'return=representation'
    });
    const name_en = str(b.name_en, 60, 'الاسم الإنجليزي') || null;
    // أطباق قديمة مربوطة باسم القسم بدل مفتاحه: نحدّثها للاسم الجديد
    const renameIn = async (clientId) => {
      if (cat.name !== name) await rest(`products?client_id=eq.${clientId}&category=eq.${q(cat.name)}`, { method: 'PATCH', body: { category: name } });
    };
    await renameIn(sid);
    // نفس القسم (بنفس الاسم) في الفروع الثانية ياخذ الاسم الجديد
    if (cat.name !== name) {
      for (const f of (await familyOf(store)).filter(f => f.id !== sid)) {
        const taken = await rest(`categories?client_id=eq.${f.id}&name=eq.${q(name)}&select=id&limit=1`);
        if (taken.length) continue;
        const moved = await rest(`categories?client_id=eq.${f.id}&name=eq.${q(cat.name)}`, { method: 'PATCH', body: { name, name_en }, prefer: 'return=representation' });
        if (moved.length) await renameIn(f.id);
      }
    }
    return { category: rows[0] };
  }

  if (action === 'category-delete') {
    const id = int(b.id);
    const cat = (await rest(`categories?id=eq.${id}&client_id=eq.${sid}&select=key,name`))[0];
    if (!cat) throw new ApiError(404, 'القسم غير موجود');
    const used = await rest(`products?client_id=eq.${sid}&or=(category.eq.${q(cat.key)},category.eq.${q(cat.name)})&select=id&limit=1`);
    if (used.length) throw new ApiError(400, 'القسم فيه أطباق. انقلها لقسم آخر أو احذفها أولاً');
    await rest(`categories?id=eq.${id}&client_id=eq.${sid}`, { method: 'DELETE' });
    return { ok: true };
  }

  if (action === 'reorder') {
    const table = b.table;
    if (!['categories', 'products'].includes(table)) throw new ApiError(400, 'جدول غير صحيح');
    const ids = Array.isArray(b.ids) ? b.ids.map(int).filter(Number.isInteger).slice(0, 1000) : [];
    if (!ids.length) throw new ApiError(400, 'لا يوجد ترتيب');
    await rpc('server_reorder', { p_table: table, p_client_id: sid, p_ids: ids });
    return { ok: true };
  }

  // ─── الأطباق ───
  // ─── استيراد الأطباق من Excel/CSV: الأقسام الناقصة تنضاف بأسمائها، والأطباق تنضاف تحتها (بدون صور) ───
  // ─── المنيو من صورة: يقرأ صور المنيو الورقي ويرجّع الأطباق للمراجعة (ما يضيف شي لحاله) ───
  if (action === 'menu-from-photo' && req.method === 'POST') {
    const imgs = (Array.isArray(b.images) ? b.images : []).slice(0, 4).filter(im => im && /^image\/(jpeg|png|webp)$/.test(im.type) && typeof im.data === 'string' && im.data.length < 3_000_000);
    if (Array.isArray(b.images) && b.images.length && !imgs.length) throw new ApiError(400, 'صيغة الصورة أو حجمها غير مناسب، صوّر المنيو JPG أو PNG');
    if (PLANS.isFree(store)) throw new ApiError(403, 'المنيو من صورة متاح مع اشتراك المنيو', 'FREE_PLAN');
    if (!imgs.length) throw new ApiError(400, 'ارفع صورة المنيو');
    // 10 قراءات باليوم لكل محل
    const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    try {
      const row = (await rest(`menu_chat_devices?client_id=eq.${sid}&device=eq.menu-photo&day=eq.${day}&select=used`))[0];
      if (row && row.used >= 10) throw new ApiError(429, 'قرأت منيوهات كثير اليوم، كمّل بكرة', 'PHOTO_DAY');
      if (row) await rest(`menu_chat_devices?client_id=eq.${sid}&device=eq.menu-photo&day=eq.${day}`, { method: 'PATCH', body: { used: row.used + 1 } });
      else await rest('menu_chat_devices', { method: 'POST', body: { client_id: sid, device: 'menu-photo', day, used: 1 } });
    } catch (e) { if (e.code === 'PHOTO_DAY') throw e; }
    const { readMenuImages } = require('../ai');
    const items = await readMenuImages(imgs);
    if (!items.length) throw new ApiError(422, 'ما لقينا أطباق في الصورة، جرّب صورة أوضح للمنيو', 'NO_ITEMS');
    return { items };
  }

  if (action === 'products-import') {
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 500) : [];
    if (!rows.length) throw new ApiError(400, 'ما فيه أطباق في الملف');
    const cats = await rest(`categories?client_id=eq.${sid}&select=key,name,sort_order`);
    const byName = new Map(cats.map(c => [c.name.trim(), c]));
    let catOrder = Math.max(0, ...cats.map(c => c.sort_order || 0));
    const orders = {};
    const nextIn = async (key) => {
      if (orders[key] === undefined) orders[key] = Math.max(0, ...(await rest(`products?client_id=eq.${sid}&category=eq.${q(key)}&select=sort_order`)).map(x => x.sort_order || 0));
      return ++orders[key];
    };
    const out = [], skipped = [];
    let newCats = 0;
    for (const [i, r] of rows.entries()) {
      try {
        const name = str(r.name, 100, 'اسم الطبق');
        const catName = str(r.category, 60, 'القسم') || 'أطباق';
        const sizes = cleanSizes(r.sizes);   // من "المنيو من صورة"، وملف Excel ما يرسلها
        const price = sizes.length ? Math.min(...sizes.map(z => z.price)) : Number(String(r.price ?? '').replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660).replace(/[^\d.]/g, ''));
        if (!name) throw new ApiError(400, 'بدون اسم');
        if (!validPrice(price)) throw new ApiError(400, 'سعر غير صحيح');
        let cat = byName.get(catName);
        if (!cat) {
          cat = (await rest('categories', { method: 'POST', prefer: 'return=representation', body: { client_id: sid, name: catName, key: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), sort_order: ++catOrder } }))[0];
          byName.set(catName, cat); newCats++;
        }
        const cal = r.calories === '' || r.calories == null ? null : int(r.calories);
        const image = typeof r.image_url === 'string' && r.image_url && ownsMediaUrl(r.image_url, sid) ? r.image_url : '';
        out.push({ client_id: sid, name, price, category: cat.key, is_available: true, image_url: image, sizes,
          description: str(r.description, 500, 'الوصف') || '', name_en: str(r.name_en, 100, 'الاسم الإنجليزي') || null, description_en: str(r.description_en, 500, 'الوصف الإنجليزي') || null,
          ...(Number.isInteger(cal) && cal >= 0 && cal <= 10000 ? { calories: cal } : {}), sort_order: await nextIn(cat.key) });
      } catch (e) { skipped.push({ row: i + 2, reason: e.message }); }   // رقم الصف في الملف (الأول عناوين)
    }
    if (out.length) {
      // الصفوف بأعمدة مختلفة (السعرات اختيارية) تنضاف دفعة لكل شكل
      const withCal = out.filter(x => 'calories' in x), noCal = out.filter(x => !('calories' in x));
      if (withCal.length) await rest('products', { method: 'POST', body: withCal });
      if (noCal.length) await rest('products', { method: 'POST', body: noCal });
    }
    return { added: out.length, categories: newCats, skipped: skipped.slice(0, 20), skipped_count: skipped.length };
  }

  // ─── نسخ إضافات طبق لأطباق ثانية (يكتب إضافات البرجر مرة، وينسخها لكل البرجرات) ───
  if (action === 'extras-copy') {
    const from = int(b.from);
    const to = [...new Set((Array.isArray(b.to) ? b.to : []).map(int))].filter(x => Number.isInteger(x) && x !== from).slice(0, 300);
    if (!to.length) throw new ApiError(400, 'اختر الأطباق اللي تنسخ لها');
    const src = (await rest(`products?id=eq.${from}&client_id=eq.${sid}&select=extras`))[0];
    if (!src) throw new ApiError(404, 'الطبق غير موجود');
    const rows = await rest(`products?id=in.(${to.join(',')})&client_id=eq.${sid}`, { method: 'PATCH', body: { extras: src.extras || null }, prefer: 'return=representation' });
    return { copied: rows.length, ids: rows.map(r => r.id) };
  }

  if (action === 'product-save') {
    const id = b.id == null ? null : int(b.id);
    const name = str(b.name, 100, 'اسم الطبق');
    if (!name) throw new ApiError(400, 'اكتب اسم الطبق');
    // مع الأحجام: سعر الطبق = أقل سعر حجم (للترتيب وعرض "من ...")
    const sizes = cleanSizes(b.sizes);
    const price = sizes.length ? Math.min(...sizes.map(z => z.price)) : Number(b.price);
    if (!validPrice(price)) throw new ApiError(400, 'اكتب سعراً صحيحاً');
    const category = str(b.category, 80, 'القسم');
    const cats = await rest(`categories?client_id=eq.${sid}&select=key,name`);
    if (!cats.some(c => c.key === category || c.name === category)) throw new ApiError(400, 'القسم غير موجود');
    let calories = null;
    const sendCalories = Object.prototype.hasOwnProperty.call(b, 'calories') && store.show_calories !== false;
    if (sendCalories && b.calories !== null && b.calories !== '') {
      calories = int(b.calories);
      if (!Number.isInteger(calories) || calories < 0 || calories > 10000) throw new ApiError(400, 'عدد السعرات غير صحيح');
    }
    const payload = {
      name, price, category, sizes,
      description: str(b.description, 500, 'الوصف'),
      extra_info: str(b.extra_info, 200, 'معلومات إضافية') || null,
      note: str(b.note, 200, 'الملاحظة') || null,
      name_en: str(b.name_en, 100, 'الاسم الإنجليزي') || null,
      description_en: str(b.description_en, 500, 'الوصف الإنجليزي') || null,
      is_bestseller: b.is_bestseller === true,
      allergens: (Array.isArray(b.allergens) ? b.allergens : String(b.allergens || '').split(',')).filter(a => ALLERGENS.includes(a)).join(',') || null
    };
    // السعرات تتحدث فقط إذا كان المتجر مفعّلها (حتى ما تنمسح القيم المحفوظة)
    if (sendCalories) payload.calories = calories;
    if (b.extras !== undefined) { const ex = cleanExtras(b.extras); payload.extras = ex.length ? ex : null; }
    if (COFFEE_TYPES.includes(store.business_type)) payload.coffee = cleanCoffee(b.coffee);
    if (b.image_url !== undefined) {
      if (b.image_url && !ownsMediaUrl(b.image_url, sid)) throw new ApiError(400, 'الصورة غير تابعة لمتجرك');
      payload.image_url = b.image_url || '';
    }

    const nextOrder = async () => {
      const same = await rest(`products?client_id=eq.${sid}&category=eq.${q(category)}&select=sort_order`);
      return Math.max(0, ...same.map(x => x.sort_order || 0)) + 1;
    };

    const srcCat = cats.find(c => c.key === category || c.name === category);
    const srcCatFull = () => rest(`categories?client_id=eq.${sid}&key=eq.${q(srcCat.key)}&select=name,name_en,group_name`).then(r => r[0] || srcCat);

    if (id) {
      const old = (await rest(`products?id=eq.${id}&client_id=eq.${sid}&select=*`))[0];
      if (!old) throw new ApiError(404, 'الطبق غير موجود');
      if (old.category !== category) payload.sort_order = await nextOrder();
      const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: payload, prefer: 'return=representation' });

      // الطبق مربوط بنفس الطبق في الفروع الثانية: نحدّث الحقول المشتركة، والسعر يبقى لكل فرع
      let synced = 0;
      if (old.link_id) {
        const others = (await familyOf(store)).map(f => f.id).filter(x => x !== sid);
        const linked = others.length ? await rest(`products?link_id=eq.${q(old.link_id)}&client_id=in.(${others.join(',')})&select=id,client_id,category,sizes`) : [];
        const src = linked.length ? await srcCatFull() : null;
        for (const t of linked) {
          const patch = {};
          SHARED_PRODUCT_FIELDS.forEach(k => { if (Object.prototype.hasOwnProperty.call(payload, k)) patch[k] = payload[k]; });
          const tc = await categoryIn(t.client_id, src);
          if (t.category !== tc.key) { patch.category = tc.key; patch.sort_order = await nextOrderIn(t.client_id, tc.key); }
          // الأحجام: نفس الأسماء في كل الفروع، وسعر كل حجم يبقى حسب الفرع
          const theirs = new Map((Array.isArray(t.sizes) ? t.sizes : []).map(z => [z.name, z.price]));
          if (sizes.length) {
            patch.sizes = sizes.map(z => ({ ...z, price: theirs.has(z.name) ? theirs.get(z.name) : z.price }));
            patch.price = Math.min(...patch.sizes.map(z => z.price));
          } else if (theirs.size) patch.sizes = [];
          await rest(`products?id=eq.${t.id}`, { method: 'PATCH', body: patch });
          synced++;
        }
      }
      return { product: rows[0], synced };
    }
    const row = { ...payload, client_id: sid, is_available: true, image_url: payload.image_url || '', sort_order: await nextOrder() };
    const created = (await rest('products', { method: 'POST', body: row, prefer: 'return=representation' }))[0];

    // "أضف أيضاً في الفروع": نفس الطبق (مربوط بنفس link_id) تحت قسم بنفس الاسم في كل فرع مختار
    const also = [...new Set((Array.isArray(b.also_branch_ids) ? b.also_branch_ids : []).map(int))].filter(x => x !== sid);
    const copied = [];
    if (also.length) {
      const family = (await familyOf(store)).map(f => f.id);
      const src = await srcCatFull();
      for (const bid of also.filter(x => family.includes(x))) {
        const target = await categoryIn(bid, src);
        const copy = { ...row, client_id: bid, category: target.key, sort_order: await nextOrderIn(bid, target.key) };
        if (created.link_id) copy.link_id = created.link_id;
        await rest('products', { method: 'POST', body: copy });
        copied.push(bid);
      }
    }
    return { product: created, copied_to: copied };
  }

  // صورة الطبق بس (أداة القص): نفس الصورة في الطبق المربوط بالفروع الثانية
  if (action === 'product-image') {
    const id = int(b.id);
    if (!b.image_url || !ownsMediaUrl(b.image_url, sid)) throw new ApiError(400, 'الصورة غير تابعة لمتجرك');
    const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: { image_url: b.image_url }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الطبق غير موجود');
    if (rows[0].link_id) {
      const others = (await familyOf(store)).map(f => f.id).filter(x => x !== sid);
      if (others.length) await rest(`products?link_id=eq.${q(rows[0].link_id)}&client_id=in.(${others.join(',')})`, { method: 'PATCH', body: { image_url: b.image_url } });
    }
    return { product: rows[0] };
  }

  if (action === 'product-toggle') {
    const id = int(b.id);
    if (!['is_available', 'is_bestseller', 'is_hidden'].includes(b.field)) throw new ApiError(400, 'حقل غير صحيح');
    const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: { [b.field]: b.value === true }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الطبق غير موجود');
    return { product: rows[0] };
  }

  if (action === 'product-delete') {
    const id = int(b.id);
    const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'DELETE', prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الطبق غير موجود');
    return { ok: true };
  }
  return NEXT;
}
