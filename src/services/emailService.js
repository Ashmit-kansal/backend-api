const sgMail = require('@sendgrid/mail');
require('dotenv').config();

// Configure SendGrid
const sendGridApiKey = process.env.MANGA_READER_EMAIL;
if (sendGridApiKey) {
  sgMail.setApiKey(sendGridApiKey);
} else {
  console.warn('SendGrid API key not found. Email functionality will be disabled.');
}

const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  try {
    // Check if SendGrid is configured
    if (!sendGridApiKey) {
      console.log(`[EMAIL SIMULATION] OTP email would be sent to ${email} with OTP: ${otp} for ${purpose}`);
      console.log(`[DEBUG] SendGrid API key not found. Please check your .env file.`);
      return true; // Return true for development/testing
    }

    console.log(`[DEBUG] Attempting to send OTP email to ${email} with OTP: ${otp}`);

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

    const fromEmail = process.env.FROM_EMAIL || 'noreply@mangareader.com';
    
    const msg = {
      to: email,
      from: fromEmail,
      subject: subject,
      html: htmlContent,
    };

    console.log(`[DEBUG] Sending email with config:`, {
      to: email,
      from: fromEmail,
      subject: subject,
      hasApiKey: !!sendGridApiKey
    });

    await sgMail.send(msg);
    console.log(`✅ OTP email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    
    // For development, log the OTP instead of failing
    if (process.env.NODE_ENV === 'development' || !sendGridApiKey) {
      console.log(`[DEV MODE] OTP for ${email}: ${otp} (purpose: ${purpose})`);
      console.log(`[DEV MODE] In production, this would be sent via email`);
      return true;
    }
    
    throw new Error('Failed to send OTP email');
  }
};

const sendWelcomeEmail = async (email, username) => {
  try {
    // Check if SendGrid is configured
    if (!sendGridApiKey) {
      console.log(`[EMAIL SIMULATION] Welcome email would be sent to ${email} for user ${username}`);
      return true;
    }

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

    const fromEmail = process.env.FROM_EMAIL || 'noreply@mangareader.com';
    
    const msg = {
      to: email,
      from: fromEmail,
      subject: 'Welcome to Manga Reader!',
      html: htmlContent,
    };

    await sgMail.send(msg);
    console.log(`✅ Welcome email sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    
    if (process.env.NODE_ENV === 'development' || !sendGridApiKey) {
      console.log(`[DEV MODE] Welcome email for ${email} would be sent in production`);
      return true;
    }
    
    throw new Error('Failed to send welcome email');
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail
};
