// =====================================================================
// DEV MENU — إرسال البريد من الخادم (Gmail SMTP أو أي مزود SMTP)
// المتغيرات في Vercel: SMTP_USER و SMTP_PASS (واختيارياً SMTP_HOST و SMTP_PORT)
// =====================================================================
let transporter = null;

function getTransport() {
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port, secure: port === 465,
      auth: { user, pass }
    });
  }
  return transporter;
}

const mailConfigured = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

// يرجّع true إذا انرسل، و false إذا فشل (ما يوقف العملية الأساسية)
async function sendMail({ to, subject, html, text, fromName = 'DEV MENU' }) {
  const t = getTransport();
  if (!t || !to) return false;
  try {
    await t.sendMail({
      from: `"${String(fromName).replace(/["<>]/g, '').slice(0, 60)}" <${process.env.SMTP_USER}>`,
      to, subject, html, text
    });
    return true;
  } catch (e) {
    console.error('[mail] failed:', e.message);
    return false;
  }
}

module.exports = { sendMail, mailConfigured };
