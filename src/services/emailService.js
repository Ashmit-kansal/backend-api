const nodemailer = require('nodemailer');
require('dotenv').config();

// Provider selection simplified: smtp | mock (default smtp if SMTP vars exist)
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || '').toLowerCase();

// ===================== SMTP (Zoho) SETUP =====================
// Expected env vars for Zoho:
// SMTP_HOST=smtp.zoho.in (or smtp.zoho.com)
// SMTP_PORT=465 (SSL) or 587 (STARTTLS)
// SMTP_SECURE=true when 465 else false
// SMTP_USER=your@domain.com
// SMTP_PASS=app_password (NOT your main account password)
let smtpTransport = null;
if (EMAIL_PROVIDER === 'smtp' || EMAIL_PROVIDER === '' ) {
  let { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  const originalUser = SMTP_USER || '';
  const originalPass = SMTP_PASS || '';
  if (SMTP_USER) SMTP_USER = SMTP_USER.trim();
  if (SMTP_PASS) SMTP_PASS = SMTP_PASS.trim();
  if (originalUser !== SMTP_USER || originalPass !== SMTP_PASS) {
    console.warn('[Email] Trimmed whitespace from SMTP_USER or SMTP_PASS');
  }
  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_SECURE === 'true' || SMTP_PORT === '465',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { rejectUnauthorized: true }
    });
  } else if (EMAIL_PROVIDER === 'smtp') {
    console.warn('[Email] SMTP provider selected but required SMTP_* env vars are missing. Falling back to mock mode.');
  }
}

// ===================== MOCK MODE =====================
const isMock = (EMAIL_PROVIDER === 'mock') || (EMAIL_PROVIDER !== 'smtp' && !smtpTransport);

function logProviderConfig() {
  console.log('[Email] Provider init:', {
    providerRequested: EMAIL_PROVIDER || '(auto)',
    usingProvider: isMock ? 'mock' : 'smtp',
    hasSmtpTransport: !!smtpTransport
  });
}
logProviderConfig();
// ===================== CORE SENDER (Provider Agnostic) =====================
async function sendViaProvider({ to, subject, html }) {
  if (isMock) {
    console.log('[Email MOCK] Would send to', to, 'subject:', subject);
    return true;
  }
  if (!isMock) {
    if (!smtpTransport) {
      console.warn('[Email] SMTP transport unavailable. Falling back to mock.');
      return true;
    }
    try {
      await smtpTransport.sendMail({
        from: process.env.FROM_EMAIL || process.env.SMTP_USER,
        to,
        subject,
        html
      });
    } catch (err) {
      if (err && err.code === 'EAUTH') {
        console.error('[Email] Authentication failed. Check SMTP_USER/SMTP_PASS, app password, host/port, or region.');
      }
      throw err;
    }
    return true;
  }
  return true;
}

// ===================== PUBLIC API =====================
const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  try {
    const subject = purpose === 'verification' 
      ? 'Email Verification - Manga Reader' 
      : 'Password Reset - Manga Reader';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0;">Manga Reader</h1>
            <p style="color: #666; margin: 10px 0 0 0;">${purpose === 'verification' ? 'Email Verification' : 'Password Reset'}</p>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">
              ${purpose === 'verification' ? 'Verify Your Email Address' : 'Reset Your Password'}
            </h2>
            <p style="color: #555; margin: 0 0 15px 0; line-height: 1.6;">
              ${purpose === 'verification' 
                ? 'Thank you for signing up! Please use the following OTP to verify your email address:' 
                : 'You requested a password reset. Please use the following OTP to reset your password:'}
            </p>
            <div style="background-color: #007bff; color: white; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
              ${otp}
            </div>
            <p style="color: #666; margin: 15px 0 0 0; font-size: 14px;">
              This OTP will expire in 10 minutes. If you didn't request this, please ignore this email.
            </p>
          </div>
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              © 2024 Manga Reader. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;
    await sendViaProvider({ to: email, subject, html: htmlContent });
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    if (process.env.NODE_ENV === 'development' || isMock) {
      console.log(`[DEV MODE] In production, this would be sent via email`);
      return true;
    }
    throw new Error('Failed to send OTP email');
  }
};
const sendWelcomeEmail = async (email, username) => {
  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0;">Welcome to Manga Reader!</h1>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin: 0 0 15px 0; font-size: 18px;">Hello ${username}!</h2>
            <p style="color: #555; margin: 0 0 15px 0; line-height: 1.6;">
              Welcome to Manga Reader! Your account has been successfully created and verified.
            </p>
            <p style="color: #555; margin: 0 0 15px 0; line-height: 1.6;">
              You can now start exploring manga, bookmarking your favorites, and tracking your reading progress.
            </p>
          </div>
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <p style="color: #999; margin: 0; font-size: 12px;">
              © 2024 Manga Reader. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    `;
    await sendViaProvider({ to: email, subject: 'Welcome to Manga Reader!', html: htmlContent });
    return true;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    if (process.env.NODE_ENV === 'development' || isMock) {
      return true;
    }
    throw new Error('Failed to send welcome email');
  }
};
module.exports = {
  sendOTPEmail,
  sendWelcomeEmail
};
