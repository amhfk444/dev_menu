// =====================================================================
// DEV MENU — اتصال صوتي بالزبون (Twilio + صوت Amazon Polly الخليجي "هالة")
//   المتغيرات في Vercel: TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN و TWILIO_FROM (رقم Twilio بالصيغة الدولية)
//   الحساب التجريبي ما يتصل إلا على الأرقام المؤكدة فيه، ولازم السعودية مفعّلة في Voice → Geo Permissions
// =====================================================================
const SID = process.env.TWILIO_ACCOUNT_SID || '';
const TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const FROM = process.env.TWILIO_FROM || '';
const configured = () => !!(SID && TOKEN && FROM);

const xml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// جوال سعودي بالصيغة الدولية: 05xxxxxxxx أو 5xxxxxxxx أو 9665xxxxxxxx → +9665xxxxxxxx
function saPhone(v) {
  let d = String(v || '').replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) & 15)).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('05')) d = '966' + d.slice(1);
  else if (d.startsWith('5') && d.length === 9) d = '966' + d;
  return /^9665\d{8}$/.test(d) ? `+${d}` : null;
}

// يتصل ويقول الجملة مرتين (لو ما سمع أول مرة). يرجّع { ok, sid } أو { ok: false, error }
async function sayCall(to, text) {
  if (!configured()) return { ok: false, error: 'voice not configured' };
  const phone = saPhone(to);
  if (!phone) return { ok: false, error: 'bad phone' };
  const say = `<Say voice="Polly.Hala-Neural" language="ar-AE">${xml(text)}</Say>`;
  const twiml = `<Response>${say}<Pause length="1"/>${say}</Response>`;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${SID}:${TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, From: FROM, Twiml: twiml, Timeout: '25' })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('VOICE', r.status, d.code, d.message); return { ok: false, error: `${r.status} ${d.code || ''} ${d.message || ''}`.trim() }; }
  return { ok: true, sid: d.sid };
}

module.exports = { configured, sayCall, saPhone };
