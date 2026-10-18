// =====================================================================
// DEV MENU — رجوع صاحب المطعم من صفحة قوقل بعد ما يسمح بالربط
//   GET /api/google-callback?code=...&state=...
// نحفظ مفتاح التجديد مشفّر، ونختار فرعه في قوقل ماب تلقائياً لو عنده فرع واحد،
// وبعدها نرجّعه لصفحة "ردود التقييمات" في لوحته.
// =====================================================================
const { rest } = require('./_lib/core');
const { verifyState, exchangeCode, emailFromIdToken, encrypt, listLocations } = require('./_lib/google');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const back = (r, status) => {
    res.statusCode = 302;
    res.setHeader('Location', `https://www.devmenu.digital/admin.html${r || ''}${r ? '&' : '?'}google=${status}#reviews`);
    res.end();
  };
  const url = new URL(req.url, 'https://www.devmenu.digital');
  const state = verifyState(url.searchParams.get('state'));
  if (!state) return back('', 'expired');
  if (url.searchParams.get('error')) return back(state.r, 'denied');   // ضغط "إلغاء" في صفحة قوقل
  try {
    const tok = await exchangeCode(url.searchParams.get('code'));
    if (!tok.refresh_token) return back(state.r, 'error');
    const scopes = String(tok.scope || '');
    if (!scopes.includes('business.manage')) return back(state.r, 'scope');   // ما سمح بصلاحية إدارة النشاط
    const row = {
      client_id: state.c, google_email: emailFromIdToken(tok.id_token), refresh_token_enc: encrypt(tok.refresh_token),
      account_name: null, location_name: null, location_title: null, connected_at: new Date().toISOString(), last_sync_at: null, sync_error: null
    };
    await rest('google_connections?on_conflict=client_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates' });
    // فرع واحد ← نختاره مباشرة. أكثر من فرع ← يختار من لوحته. قوقل ما وافق بعد ← الربط محفوظ وننتظر
    let locations;
    try { locations = await listLocations(tok.access_token); }
    catch (e) { return back(state.r, e.code === 'GOOGLE_NOT_APPROVED' || e.code === 'GOOGLE_API_DISABLED' ? 'pending' : 'connected'); }
    if (locations.length === 1) {
      const l = locations[0];
      await rest(`google_connections?client_id=eq.${state.c}`, { method: 'PATCH', body: { account_name: l.account, location_name: l.location, location_title: l.title } });
      return back(state.r, 'connected');
    }
    return back(state.r, locations.length ? 'choose' : 'nolocation');
  } catch (e) {
    console.error('GOOGLE_CALLBACK', e.message);
    return back(state.r, 'error');
  }
};
