const https = require("https");
const nodemailer = require("nodemailer");

// ── Brevo transporter (OTP + password reset) ───────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY is missing in env variables");

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

// ── Gmail helper (notification emails) ────────────────────────────────────
const sendEmailViaGmail = async ({ to, subject, html }) => {
  // Transporter inside function to ensure env vars are loaded
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

// ... Baki aapke sendOtpEmail, sendPasswordResetEmail aur sendNotificationEmail functions same rahenge ...

module.exports = { sendOtpEmail, sendPasswordResetEmail, sendNotificationEmail };