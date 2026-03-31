const https = require("https");
const nodemailer = require("nodemailer");

// ── 1. Brevo Helper (Direct API for OTP/Reset) ──────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is missing in environment variables");

  const body = JSON.stringify({
    sender: { name: "BuzzNet", email: process.env.EMAIL_USER || "netbuzz705@gmail.com" },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.brevo.com",
        path: "/v3/smtp/email",
        method: "POST",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Brevo error ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
};

// ── 2. Gmail Helper (Nodemailer for Notifications) ──────────────────────────
const sendEmailViaGmail = async ({ to, subject, html }) => {
  const gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await gmailTransporter.sendMail({
    from: `"BuzzNet Notifications" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ── 3. OTP Email Function ───────────────────────────────────────────────────
const sendOtpEmail = async (email, otp, username) => {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f4f6fb; padding: 32px 24px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; font-style: italic; font-weight: 700; color: #F7A325;">BuzzNet.</span>
      </div>
      <div style="background: #fff; border-radius: 14px; padding: 32px;">
        <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1d2e;">Verify your email</h2>
        <p style="color: #5a6180; margin: 0 0 28px; font-size: 15px;">Hi ${username || "there"}, use this code to complete registration:</p>
        <div style="text-align: center; margin: 0 0 28px;">
          <span style="display: inline-block; font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #1a1d2e; background: #f4f6fb; padding: 16px 28px; border-radius: 12px; border: 2px solid #FFD700;">${otp}</span>
        </div>
      </div>
    </div>`;
  await sendEmail({ to: email, subject: `${otp} is your verification code`, html });
};

// ── 4. Password Reset Email Function ─────────────────────────────────────────
const sendPasswordResetEmail = async (email, otp, username) => {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f4f6fb; padding: 32px 24px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; font-style: italic; font-weight: 700; color: #F7A325;">BuzzNet.</span>
      </div>
      <div style="background: #fff; border-radius: 14px; padding: 32px;">
        <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1d2e;">Reset Password</h2>
        <p style="color: #5a6180; margin: 0 0 28px; font-size: 15px;">Hi ${username || "there"}, use this code to reset your password:</p>
        <div style="text-align: center; margin: 0 0 28px;">
          <span style="display: inline-block; font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #1a1d2e; background: #f4f6fb; padding: 16px 28px; border-radius: 12px; border: 2px solid #FF4757;">${otp}</span>
        </div>
      </div>
    </div>`;
  await sendEmail({ to: email, subject: `${otp} is your reset code`, html });
};

// ── 5. Notification Email Function ──────────────────────────────────────────
const sendNotificationEmail = async (email, username, type, fromUsername) => {
  const subjects = {
    newMessage: `${fromUsername} sent you a message`,
    followRequest: `${fromUsername} sent a follow request`,
    followAccepted: `${fromUsername} accepted your request`,
  };
  const bodies = {
    newMessage: `<p>${fromUsername} sent you a new message.</p>`,
    followRequest: `<p>${fromUsername} wants to follow you.</p>`,
    followAccepted: `<p>${fromUsername} accepted your follow request.</p>`,
  };

  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Hi ${username || 'there'} 👋</h2>
      ${bodies[type] || '<p>New notification on BuzzNet.</p>'}
      <a href="https://net-buzz.vercel.app">Open BuzzNet</a>
    </div>`;

  await sendEmailViaGmail({ to: email, subject: subjects[type] || 'New notification', html });
};

// ── 6. Exports ──────────────────────────────────────────────────────────────
module.exports = { 
  sendOtpEmail, 
  sendPasswordResetEmail, 
  sendNotificationEmail 
};