// =====================================================================
// DEV MENU — بطاقات Apple Wallet من سيرفرنا (بدون WalletWallet)
//   نوقّع البطاقة بشهادة Pass Type ID من حساب مطوّر آبل، ونستقبل تسجيل الأجهزة (api/passkit)،
//   ولما يتغير محتواها نرسل تنبيه لآبل مباشرة (APNs) فيجيب الجوال النسخة الجديدة.
//   المتغيرات في Vercel:
//     APPLE_PASS_TYPE_ID   مثل pass.digital.devmenu.card
//     APPLE_TEAM_ID        رقم الفريق في حساب المطوّر
//     APPLE_PASS_CERT      شهادة Pass Type ID بصيغة PEM (base64)
//     APPLE_PASS_KEY       المفتاح الخاص بصيغة PEM (base64)
//   المحتوى نفس شكل WalletWallet (passBody / pagerBody في wallet.js)، وهنا نحوله لـ pass.json
// =====================================================================
const crypto = require('crypto');
const http2 = require('http2');
const forge = require('node-forge');
const sharp = require('sharp');
const { rest, q, SITE } = require('./core');

const PASS_TYPE = process.env.APPLE_PASS_TYPE_ID || '';
const TEAM = process.env.APPLE_TEAM_ID || '';
const pem = (v) => { v = String(v || '').trim(); return v.startsWith('-----') ? v : Buffer.from(v, 'base64').toString('utf8'); };
const CERT = pem(process.env.APPLE_PASS_CERT), KEY = pem(process.env.APPLE_PASS_KEY);
const configured = () => !!(PASS_TYPE && TEAM && CERT && KEY);
// بطاقاتنا تبدأ بـ dm- عشان نفرقها عن بطاقات WalletWallet القديمة (نفس عمود wallet_serial)
const PREFIX = 'dm-';
const ours = (serial) => String(serial || '').startsWith(PREFIX);
const API = `${SITE}/api/passkit`;

// ─── شهادة آبل الوسيطة (WWDR G4): عامة، نجيبها مرة وحدة لكل تشغيل ───
let wwdr = null;
async function wwdrCert() {
  if (wwdr) return wwdr;
  const r = await fetch('https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer', { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`wwdr ${r.status}`);
  const der = Buffer.from(await r.arrayBuffer()).toString('binary');
  return (wwdr = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der)));
}

// ─── الألوان: WalletWallet تاخذ hex، وآبل تبي rgb() ───
const PRESETS = { green: '#233d2c', dark: '#141414' };
function rgb(hex) {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : [35, 61, 44];
}
const css = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`;
const light = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) > 170;

// ─── المحتوى (شكل WalletWallet) → pass.json ───
function passJson(serial, token, b, voided) {
  const bg = rgb(b.color || PRESETS[b.colorPreset] || PRESETS.green);
  const fg = light(bg) ? [27, 27, 27] : [255, 255, 255];
  const fields = (arr, k) => (arr || []).map((f, i) => ({ key: `${k}${i}`, label: f.label || '', value: String(f.value ?? ''), ...(f.changeMessage ? { changeMessage: f.changeMessage } : {}) }));
  // رسالة المحل: خانة في ظهر البطاقة، ولما يتغير نصها الآيفون يطلعه إشعار (%@ = النص نفسه)
  const back = fields(b.backFields, 'b');
  if (b.notification) back.unshift({ key: 'notice', label: 'آخر إشعار', value: String(b.notification), changeMessage: '%@' });
  const p = {
    formatVersion: 1, passTypeIdentifier: PASS_TYPE, teamIdentifier: TEAM, serialNumber: serial,
    authenticationToken: token, webServiceURL: API,
    organizationName: b.organizationName || 'DEV MENU', description: b.description || 'DEV MENU',
    logoText: b.logoText || undefined,
    backgroundColor: css(bg), foregroundColor: css(fg), labelColor: css(light(bg) ? [85, 85, 85] : [220, 220, 220]),
    sharingProhibited: !!b.sharingProhibited,
    storeCard: { headerFields: fields(b.headerFields, 'h'), primaryFields: fields(b.primaryFields, 'p'), secondaryFields: fields(b.secondaryFields, 's'), auxiliaryFields: fields(b.auxiliaryFields, 'a'), backFields: back }
  };
  if (b.barcodeValue) p.barcodes = [{ format: 'PKBarcodeFormatQR', message: String(b.barcodeValue), messageEncoding: 'iso-8859-1', ...(b.barcodeAltText ? { altText: b.barcodeAltText } : {}) }];
  if (Array.isArray(b.locations) && b.locations.length) p.locations = b.locations.slice(0, 10);
  if (voided) p.voided = true;
  return p;
}

// ─── الصور: data: أو https، ونصغرها لمقاسات آبل ───
async function load(src) {
  if (!src) return null;
  if (src.startsWith('data:')) return Buffer.from(src.split(',')[1] || '', 'base64');
  try { const r = await fetch(src, { signal: AbortSignal.timeout(8000) }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; }
}
const fit = (buf, w, h, mode = 'inside') => sharp(buf).resize(w, h, { fit: mode, withoutEnlargement: false }).png().toBuffer();
async function images(b) {
  const files = {};
  const icon = (await load(b.iconURL || b.logoURL)) || (await load(`${SITE}/images/icon-512.png`));
  if (icon) Object.assign(files, { 'icon.png': await fit(icon, 29, 29, 'cover'), 'icon@2x.png': await fit(icon, 58, 58, 'cover'), 'icon@3x.png': await fit(icon, 87, 87, 'cover') });
  const logo = await load(b.logoURL);
  if (logo) Object.assign(files, { 'logo.png': await fit(logo, 160, 50), 'logo@2x.png': await fit(logo, 320, 100), 'logo@3x.png': await fit(logo, 480, 150) });
  const strip = await load(b.stripURL);
  if (strip) Object.assign(files, { 'strip.png': await fit(strip, 375, 144, 'cover'), 'strip@2x.png': await fit(strip, 750, 288, 'cover'), 'strip@3x.png': await fit(strip, 1125, 432, 'cover') });
  return files;
}

// ─── التوقيع (PKCS#7 منفصل على manifest.json) ───
async function sign(manifest) {
  const cert = forge.pki.certificateFromPem(CERT), key = forge.pki.privateKeyFromPem(KEY);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(cert); p7.addCertificate(await wwdrCert());
  p7.addSigner({ key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

// ─── ملف zip بدون ضغط (يكفي لـ pkpass) ───
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const parts = [], dir = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, data);
    const d = Buffer.alloc(46); d.writeUInt32LE(0x02014b50, 0); d.writeUInt16LE(20, 4); d.writeUInt16LE(20, 6); d.writeUInt32LE(crc, 16); d.writeUInt32LE(data.length, 20); d.writeUInt32LE(data.length, 24); d.writeUInt16LE(n.length, 28); d.writeUInt32LE(off, 42);
    dir.push(d, n); off += 30 + n.length + data.length;
  }
  const size = dir.reduce((s, b) => s + b.length, 0), count = Object.keys(files).length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, ...dir, end]);
}

// ملف البطاقة كامل (pkpass) من آخر نسخة محفوظة
async function pkpass(row) {
  const files = { 'pass.json': Buffer.from(JSON.stringify(passJson(row.serial, row.auth_token, row.body, row.voided))), ...(await images(row.body)) };
  const manifest = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, crypto.createHash('sha1').update(v).digest('hex')]))));
  return zip({ ...files, 'manifest.json': manifest, signature: await sign(manifest) });
}

// ─── تنبيه الأجهزة (APNs): رسالة فاضية، والجوال يسأل سيرفرنا عن الجديد ───
function push(tokens) {
  if (!tokens.length) return Promise.resolve({ ok: 0, gone: [] });
  return new Promise((done) => {
    const s = http2.connect('https://api.push.apple.com', { cert: CERT, key: KEY });
    let left = tokens.length, ok = 0; const gone = [];
    const finish = () => { if (--left === 0) { s.close(); done({ ok, gone }); } };
    s.on('error', (e) => { console.error('APNS', e.message); left = 1; finish(); });
    for (const t of tokens) {
      const r = s.request({ ':method': 'POST', ':path': `/3/device/${t}`, 'apns-topic': PASS_TYPE, 'content-type': 'application/json' });
      r.on('response', (h) => { const st = h[':status']; if (st === 200) ok++; else if (st === 410 || st === 400) gone.push(t); if (st !== 200) console.error('APNS', st, t.slice(0, 8)); });
      r.on('end', finish); r.on('error', finish);
      r.setTimeout(10000, () => r.close());
      r.end('{}'); r.resume();
    }
  });
}
async function notify(serial) {
  const devs = await rest(`apple_pass_devices?serial=eq.${q(serial)}&select=device_id,push_token`).catch(() => []);
  const r = await push([...new Set(devs.map(d => d.push_token))]);
  // رمز ما عاد صالح (الجهاز شال البطاقة أو انمسح): نشيله
  for (const t of r.gone) await rest(`apple_pass_devices?push_token=eq.${q(t)}`, { method: 'DELETE' }).catch(() => {});
  return r.ok;
}

// ─── نفس ردود WalletWallet عشان wallet.js يكمل بدون تغيير ───
async function create(body) {
  const serial = PREFIX + crypto.randomUUID(), token = crypto.randomBytes(24).toString('hex');
  await rest('apple_passes', { method: 'POST', body: { serial, auth_token: token, body } });
  return { serialNumber: serial, shareUrl: `${API}?dl=${encodeURIComponent(serial)}&t=${token}` };
}
async function update(serial, body) {
  const row = (await rest(`apple_passes?serial=eq.${q(serial)}&select=body,voided`))[0];
  if (!row) { const e = new Error('pass not found'); e.status = 404; throw e; }
  if (row.voided) { const e = new Error('pass voided'); e.status = 404; throw e; }
  // بدون رسالة: البطاقة تحتفظ برسالتها الحالية (نفس سلوك WalletWallet)
  if (!body.notification && row.body.notification) body = { ...body, notification: row.body.notification };
  if (JSON.stringify(row.body) === JSON.stringify(body)) return { notifiedDevices: 0, unchanged: true };
  await rest(`apple_passes?serial=eq.${q(serial)}`, { method: 'PATCH', body: { body, updated_at: new Date().toISOString() } });
  return { notifiedDevices: await notify(serial), unchanged: false };
}
async function revoke(serial) {
  await rest(`apple_passes?serial=eq.${q(serial)}`, { method: 'PATCH', body: { voided: true, updated_at: new Date().toISOString() } });
  await notify(serial);
  return { deleted: true };
}

module.exports = { configured, ours, create, update, revoke, pkpass, PASS_TYPE };
