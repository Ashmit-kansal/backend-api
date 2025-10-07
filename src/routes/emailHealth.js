const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

router.get('/email', async (req, res) => {
  try {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_PROVIDER } = process.env;
    if ((EMAIL_PROVIDER || 'smtp') !== 'smtp') {
      return res.json({ success: true, provider: EMAIL_PROVIDER || 'smtp', mode: 'not-smtp', message: 'Email provider is not smtp; health check skipped.' });
    }
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
      return res.status(400).json({ success: false, message: 'Missing SMTP env vars.' });
    }
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_PORT === '465',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: false }
    });

    const verified = await transport.verify();
    return res.json({ success: true, provider: 'smtp', verified });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;