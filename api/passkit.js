// =====================================================================
// DEV MENU — خدمة بطاقات Apple Wallet (webServiceURL في البطاقة)
//   آبل تنادي /api/passkit/v1/... (vercel.json يحولها هنا بـ ?p=)، حسب مواصفات PassKit Web Service:
//     POST   v1/devices/{device}/registrations/{passType}/{serial}   جهاز أضاف البطاقة (pushToken)
//     DELETE v1/devices/{device}/registrations/{passType}/{serial}   جهاز شالها
//     GET    v1/devices/{device}/registrations/{passType}            البطاقات اللي تغيّرت عنده
//     GET    v1/passes/{passType}/{serial}                           آخر نسخة من البطاقة
//     POST   v1/log                                                  أخطاء الجهاز
//   و ?dl={serial}&t={token}: تنزيل البطاقة أول مرة (زر "أضف للمحفظة")
// =====================================================================
const { rest, q } = require('./_lib/core');
const ap = require('./_lib/applepass');

const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json' });

async function passFile(res, row) {
  const buf = await ap.pkpass(row);
  send(res, 200, buf, { 'Content-Type': 'application/vnd.apple.pkpass', 'Content-Disposition': `attachment; filename="${row.serial}.pkpass"`,
    'Last-Modified': new Date(row.updated_at).toUTCString(), 'Cache-Control': 'no-store' });
}
const findPass = async (serial) => (await rest(`apple_passes?serial=eq.${q(serial)}&select=serial,auth_token,body,voided,updated_at`).catch(() => []))[0];
const authed = (req, row) => !!row && req.headers.authorization === `ApplePass ${row.auth_token}`;

module.exports = async (req, res) => {
  try {
    if (!ap.configured()) return json(res, 503, { error: 'apple wallet not configured' });
    const u = new URL(req.url, 'http://x');

    // تنزيل البطاقة لأول مرة
    if (u.searchParams.get('dl')) {
      const row = await findPass(u.searchParams.get('dl'));
      if (!row || row.auth_token !== u.searchParams.get('t')) return json(res, 404, { error: 'not found' });
      return passFile(res, row);
    }

    const parts = String(u.searchParams.get('p') || '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'v1') parts.shift();

    if (parts[0] === 'log' && req.method === 'POST') {
      console.log('PASSKIT LOG', JSON.stringify(req.body || {}).slice(0, 1000));
      return send(res, 200, '');
    }

    // آخر نسخة من البطاقة
    if (parts[0] === 'passes' && parts.length === 3 && req.method === 'GET') {
      if (parts[1] !== ap.PASS_TYPE) return send(res, 404, '');
      const row = await findPass(parts[2]);
      if (!authed(req, row)) return send(res, 401, '');
      const since = Date.parse(req.headers['if-modified-since'] || '');
      if (since && Math.floor(new Date(row.updated_at).getTime() / 1000) <= Math.floor(since / 1000)) return send(res, 304, '');
      return passFile(res, row);
    }

    if (parts[0] === 'devices' && parts[2] === 'registrations' && parts[3] === ap.PASS_TYPE) {
      const device = parts[1];

      // البطاقات اللي تغيّرت عند هالجهاز من آخر مرة سأل
      if (parts.length === 4 && req.method === 'GET') {
        const regs = await rest(`apple_pass_devices?device_id=eq.${q(device)}&select=serial`).catch(() => []);
        if (!regs.length) return send(res, 204, '');
        const since = Number(u.searchParams.get('passesUpdatedSince')) || 0;
        const rows = await rest(`apple_passes?serial=in.(${regs.map(r => `"${r.serial}"`).join(',')})&select=serial,updated_at`).catch(() => []);
        const changed = rows.filter(r => new Date(r.updated_at).getTime() > since);
        if (!changed.length) return send(res, 204, '');
        const last = Math.max(...changed.map(r => new Date(r.updated_at).getTime()));
        return json(res, 200, { serialNumbers: changed.map(r => r.serial), lastUpdated: String(last) });
      }

      if (parts.length === 5) {
        const serial = parts[4], row = await findPass(serial);
        if (!authed(req, row)) return send(res, 401, '');
        if (req.method === 'POST') {
          const token = String((req.body || {}).pushToken || '');
          if (!token) return send(res, 400, '');
          const had = (await rest(`apple_pass_devices?device_id=eq.${q(device)}&serial=eq.${q(serial)}&select=device_id`).catch(() => [])).length;
          await rest('apple_pass_devices', { method: 'POST', body: { device_id: device, serial, push_token: token }, prefer: 'resolution=merge-duplicates' });
          return send(res, had ? 200 : 201, '');
        }
        if (req.method === 'DELETE') {
          await rest(`apple_pass_devices?device_id=eq.${q(device)}&serial=eq.${q(serial)}`, { method: 'DELETE' }).catch(() => {});
          return send(res, 200, '');
        }
      }
    }
    return send(res, 404, '');
  } catch (e) {
    console.error('PASSKIT', e.message);
    return send(res, 500, '');
  }
};
