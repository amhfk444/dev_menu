#!/usr/bin/env node
// =====================================================================
// DEV MENU — شهادة بطاقات Apple Wallet (بدون Keychain ولا برامج إضافية)
//
//   1) node tools/apple-pass-cert.js csr
//        يسوي مفتاح خاص + طلب شهادة (CSR) في مجلد .apple (ما ينرفع لـ GitHub)
//        ترفع .apple/pass.csr في developer.apple.com ← Certificates ← Pass Type ID Certificate
//   2) node tools/apple-pass-cert.js env ~/Downloads/pass.cer
//        يحول الشهادة اللي نزلتها من آبل، ويكتب القيم في .apple/vercel-env.txt
//        تنسخها بنفسك لـ Vercel (APPLE_PASS_CERT و APPLE_PASS_KEY)
//
// المفتاح الخاص سري: لا ترسله لأحد ولا تنسخه لمكان ثاني غير Vercel
// =====================================================================
const fs = require('fs'), path = require('path');
const forge = require('node-forge');

const DIR = path.join(__dirname, '..', '.apple');
const [cmd, file] = process.argv.slice(2);
fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });

if (cmd === 'csr') {
  const keyFile = path.join(DIR, 'pass.key.pem');
  if (fs.existsSync(keyFile)) { console.log('المفتاح موجود من قبل (.apple/pass.key.pem). احذفه بنفسك لو تبي مفتاح جديد.'); process.exit(1); }
  console.log('جاري إنشاء المفتاح...');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([{ name: 'commonName', value: 'DEV MENU Pass' }, { name: 'countryName', value: 'SA' }]);
  csr.sign(keys.privateKey, forge.md.sha256.create());
  fs.writeFileSync(keyFile, forge.pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });
  fs.writeFileSync(path.join(DIR, 'pass.csr'), forge.pki.certificationRequestToPem(csr));
  console.log('تم. ارفع هذا الملف في موقع آبل:', path.join(DIR, 'pass.csr'));
} else if (cmd === 'env' && file) {
  const raw = fs.readFileSync(file.replace(/^~/, process.env.HOME));
  const cert = raw.toString('utf8').includes('BEGIN CERTIFICATE')
    ? forge.pki.certificateFromPem(raw.toString('utf8'))
    : forge.pki.certificateFromAsn1(forge.asn1.fromDer(raw.toString('binary')));
  const key = fs.readFileSync(path.join(DIR, 'pass.key.pem'), 'utf8');
  if (!cert.publicKey.n.equals(forge.pki.privateKeyFromPem(key).n)) {
    console.log('الشهادة ما تطابق المفتاح في .apple. تأكد إنك رفعت pass.csr اللي انسوى من هالجهاز.'); process.exit(1);
  }
  const uid = (cert.subject.getField({ type: '0.9.2342.19200300.100.1.1' }) || {}).value || '';
  const team = (cert.subject.getField('OU') || {}).value || '';
  const b64 = (s) => Buffer.from(s).toString('base64');
  const out = [
    `APPLE_PASS_TYPE_ID=${uid}`,
    `APPLE_TEAM_ID=${team}`,
    `APPLE_PASS_CERT=${b64(forge.pki.certificateToPem(cert))}`,
    `APPLE_PASS_KEY=${b64(key)}`
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(DIR, 'vercel-env.txt'), out, { mode: 0o600 });
  console.log(`تم. Pass Type ID: ${uid}  |  Team: ${team}  |  تنتهي: ${cert.validity.notAfter.toISOString().slice(0, 10)}`);
  console.log('القيم في', path.join(DIR, 'vercel-env.txt'), '— انسخها لـ Vercel بنفسك');
} else {
  console.log('الاستخدام:\n  node tools/apple-pass-cert.js csr\n  node tools/apple-pass-cert.js env ~/Downloads/pass.cer');
}
