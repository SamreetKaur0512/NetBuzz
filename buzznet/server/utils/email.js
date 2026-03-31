const https       = require("https");
const nodemailer  = require("nodemailer");

// ── Brevo transporter (OTP + password reset) ───────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.BREVO_API_KEY;

  const body = JSON.stringify({
    sender:      { name: "BuzzNet", email: process.env.EMAIL_USER || "netbuzz705@gmail.com" },
    to:          [{ email: to }],
    subject,
    htmlContent: html,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.brevo.com",
        path:     "/v3/smtp/email",
        method:   "POST",
        headers:  {
          "api-key":        apiKey,
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
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

// ── Gmail transporter (notification emails) ────────────────────────────────────
const gmailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmailViaGmail = async ({ to, subject, html }) => {
  await gmailTransporter.sendMail({
    from: `"BuzzNet" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

// ── OTP Email (Brevo) ──────────────────────────────────────────────────────────
const sendOtpEmail = async (email, otp, username) => {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f4f6fb; padding: 32px 24px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; font-style: italic; font-weight: 700; color: #F7A325; letter-spacing: -1px;">BuzzNet.</span>
      </div>
      <div style="background: #fff; border-radius: 14px; padding: 32px;">
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
  await sendEmail({ to: email, subject: `${otp} is your BuzzNet verification code`, html });
};

// ── Password Reset Email (Brevo) ───────────────────────────────────────────────
const sendPasswordResetEmail = async (email, otp, username) => {
  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #f4f6fb; padding: 32px 24px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; font-style: italic; font-weight: 700; color: #F7A325; letter-spacing: -1px;">BuzzNet.</span>
      </div>
      <div style="background: #fff; border-radius: 14px; padding: 32px;">
        <h2 style="margin: 0 0 8px; font-size: 22px; color: #1a1d2e;">Reset your password</h2>
        <p style="color: #5a6180; margin: 0 0 28px; font-size: 15px;">
          Hi ${username || "there"}, use this code to reset your BuzzNet password:
        </p>
        <div style="text-align: center; margin: 0 0 28px;">
          <span style="display: inline-block; font-size: 42px; font-weight: 900; letter-spacing: 10px; color: #1a1d2e; background: #f4f6fb; padding: 16px 28px; border-radius: 12px; border: 2px solid #FF4757;">
            ${otp}
          </span>
        </div>
        <p style="color: #9aa0b8; font-size: 13px; margin: 0; text-align: center;">
          This code expires in <strong>10 minutes</strong>.<br/>
          If you didn't request a password reset, ignore this email.
        </p>
      </div>
    </div>
  `;
  await sendEmail({ to: email, subject: `${otp} is your BuzzNet password reset code`, html });
};

// ── Notification Email (Gmail via nodemailer) ──────────────────────────────────
const sendNotificationEmail = async (email, username, type, fromUsername) => {
  const subjects = {
    newMessage:      `${fromUsername} sent you a message on BuzzNet`,
    followRequest:   `${fromUsername} sent you a follow request on BuzzNet`,
    followAccepted:  `${fromUsername} accepted your follow request on BuzzNet`,
    messageRequest:  `${fromUsername} sent you a message request on BuzzNet`,
    messageAccepted: `${fromUsername} accepted your message request on BuzzNet`,
    groupInvite:     `${fromUsername} invited you to a group on BuzzNet`,
  };
  const bodies = {
    newMessage:      `<p>${fromUsername} sent you a new message. Open BuzzNet to reply.</p>`,
    followRequest:   `<p>${fromUsername} wants to follow you. Open BuzzNet to accept or decline.</p>`,
    followAccepted:  `<p>Great news! ${fromUsername} accepted your follow request. You can now see their posts.</p>`,
    messageRequest:  `<p>${fromUsername} wants to message you. Open BuzzNet to accept or decline.</p>`,
    messageAccepted: `<p>Great news! ${fromUsername} accepted your message request. You can now chat!</p>`,
    groupInvite:     `<p>${fromUsername} invited you to join a group. Open BuzzNet to accept or decline.</p>`,
  };

  const html = `
    <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#f4f6fb;padding:32px 24px;border-radius:16px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:40px;font-style:italic;font-weight:700;color:#F7A325;">BuzzNet.</span>
      </div>
      <div style="background:#fff;border-radius:14px;padding:32px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#1a1d2e;">Hi ${username || 'there'} 👋</h2>
        ${bodies[type] || '<p>You have a new notification on BuzzNet.</p>'}
        <div style="text-align:center;margin-top:24px;">
          <a href="https://net-buzz.vercel.app" style="background:#F7A325;color:#1a1d2e;padding:12px 28px;border-radius:24px;font-weight:700;text-decoration:none;font-size:15px;">Open BuzzNet</a>
        </div>
        <p style="color:#9aa0b8;font-size:12px;margin-top:20px;text-align:center;">
          You're receiving this because you enabled email notifications.<br/>
          You can turn this off anytime in your BuzzNet profile settings.
        </p>
      </div>
    </div>`;

  await sendEmailViaGmail({ to: email, subject: subjects[type] || 'New notification on BuzzNet', html });
};

// ── Single export ──────────────────────────────────────────────────────────────
module.exports = { sendOtpEmail, sendPasswordResetEmail, sendNotificationEmail };





