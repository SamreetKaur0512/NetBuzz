const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Registration / OTP verification email ─────────────────────────────────────
const sendOtpEmail = async (email, otp, username) => {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f4f6fb; padding: 32px 24px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; font-style: italic; font-weight: 700; color: #F7A325; letter-spacing: -1px;">BuzzNet.</span>
      </div>
      <div style="background: #fff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 20px rgba(30,35,64,0.08);">
        <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1d2e;">Verify your email</h2>
        <p style="color: #5a6180; margin: 0 0 28px; font-size: 15px;">
          Hi ${username || "there"}, use this code to complete your BuzzNet registration:
        </p>
        <div style="text-align: center; margin: 0 0 28px;">
          <span style="display: inline-block; font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #1a1d2e; background: #f4f6fb; padding: 16px 28px; border-radius: 12px; border: 2px solid #FFD700;">
            ${otp}
          </span>
        </div>
        <p style="color: #9aa0b8; font-size: 13px; margin: 0; text-align: center;">
          This code expires in <strong>10 minutes</strong>.<br/>
          If you didn't request this, ignore this email.
        </p>
      </div>
    </div>
  `;
  await transporter.sendMail({
    from:    `"BuzzNet" <${process.env.EMAIL_USER}>`,
    to:      email,
    subject: `${otp} is your BuzzNet verification code`,
    html,
  });
};

// ── Password reset email ───────────────────────────────────────────────────────
const sendPasswordResetEmail = async (email, otp, username) => {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f4f6fb; padding: 32px 24px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; font-style: italic; font-weight: 700; color: #F7A325; letter-spacing: -1px;">BuzzNet.</span>
      </div>
      <div style="background: #fff; border-radius: 14px; padding: 32px; box-shadow: 0 4px 20px rgba(30,35,64,0.08);">
        <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1d2e;">Reset your password</h2>
        <p style="color: #5a6180; margin: 0 0 28px; font-size: 15px;">
          Hi ${username || "there"}, use this code to reset your BuzzNet password:
        </p>
        <div style="text-align: center; margin: 0 0 28px;">
          <span style="display: inline-block; font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #1a1d2e; background: #f4f6fb; padding: 16px 28px; border-radius: 12px; border: 2px solid #FFD700;">
            ${otp}
          </span>
        </div>
        <p style="color: #9aa0b8; font-size: 13px; margin: 0; text-align: center;">
          This code expires in <strong>10 minutes</strong>.<br/>
          If you didn't request this, ignore this email — your password is safe.
        </p>
      </div>
    </div>
  `;
  await transporter.sendMail({
    from:    `"BuzzNet" <${process.env.EMAIL_USER}>`,
    to:      email,
    subject: `${otp} — Reset your BuzzNet password`,
    html,
  });
};

module.exports = { sendOtpEmail, sendPasswordResetEmail };