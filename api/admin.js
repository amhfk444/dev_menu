// =====================================================================
// DEV MENU — API المدير العام (السوبر أدمن)
// كل طلب يتحقق من إن البريد موجود في جدول super_admins قبل أي شي
// =====================================================================
const {
  handler, rest, rpc, q, storage, storagePathFromUrl, BUCKET,
  ApiError, getUser, isSuperAdmin, str, int, readBody
} = require('./_lib/core');

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
  if (action === 'notify') return patch({ admin_notification: str(b.message, 300, 'الإشعار') || null });
  if (action === 'featured') return patch({ is_featured: b.featured === true });

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
    // 1) نجمع مسارات الملفات قبل حذف البيانات
    const products = await rest(`products?client_id=eq.${id}&select=image_url`);
    const paths = new Set();
    [client.logo_url, client.bg_image_url, client.bg_video_url, ...products.map(p => p.image_url)]
      .forEach(u => { const p = storagePathFromUrl(u); if (p) paths.add(p); });
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
