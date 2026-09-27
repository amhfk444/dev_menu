// =====================================================================
// DEV MENU — API المدير العام (السوبر أدمن)
// كل طلب يتحقق من إن البريد موجود في جدول super_admins قبل أي شي
// =====================================================================
const {
  handler, rest, rpc, q, storage, storagePathFromUrl, BUCKET,
  ApiError, getUser, isSuperAdmin, str, int, readBody, SLUG_RE, RESERVED_SLUGS
} = require('./_lib/core');

// رابط متاح؟ (ما يستخدمه متجر حالياً ولا سابقاً)
async function slugFree(slug) {
  if (!SLUG_RE.test(slug) || slug.includes('--') || RESERVED_SLUGS.has(slug)) return false;
  const taken = await rest(`clients?or=${q(`(client_slug.eq.${slug},old_slugs.cs.{${slug}})`)}&select=id&limit=1`);
  return taken.length === 0;
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
  const id = int(b.id);
  if (!Number.isInteger(id)) throw new ApiError(400, 'معرف المتجر غير صحيح');
  const patch = async (payload) => {
    const rows = await rest(`clients?id=eq.${id}`, { method: 'PATCH', body: payload, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'المتجر غير موجود');
    return { client: rows[0] };
  };

  if (action === 'activate') {
    if (!['month', 'year'].includes(b.period)) throw new ApiError(400, 'مدة غير صحيحة');
    await rpc('server_activate', { p_client_id: id, p_period: b.period });
    return { ok: true };
  }
  if (action === 'set-active') return patch({ is_active: b.active === true });
  if (action === 'rename') {
    const name = str(b.name, 80, 'الاسم');
    if (!name) throw new ApiError(400, 'اكتب الاسم');
    return patch({ name });
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
    return { client: (await rest(`clients?id=eq.${newId}&select=*`))[0] };
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
