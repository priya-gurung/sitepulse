import nodemailer, { Transporter } from "nodemailer";

// ------------------------------------------------------------
// Nodemailer SMTP Email Utility
// Requires env vars: SMTP_HOST, SMTP_PORT, SMTP_USER,
// SMTP_PASS, SMTP_FROM_EMAIL
// ------------------------------------------------------------

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
      throw new Error(
        "SMTP configuration is incomplete. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS"
      );
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user, pass },
    });
  }
  return transporter;
}

function getFromEmail(): string {
  const from = process.env.SMTP_FROM_EMAIL;
  if (!from) throw new Error("SMTP_FROM_EMAIL is not configured");
  return from;
}

// ------------------------------------------------------------
// Send OTP verification email
// ------------------------------------------------------------

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transport = getTransporter();
  const from = getFromEmail();

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 8px; color: #111827; font-size: 22px;">Verify your email</h2>
      <p style="margin: 0 0 24px; color: #6b7280; font-size: 15px;">
        Use the code below to complete your SitePulse registration. It expires in <strong>5 minutes</strong>.
      </p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #111827;">${otp}</span>
      </div>
      <p style="margin: 0; color: #9ca3af; font-size: 13px;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await transport.sendMail({
      from,
      to,
      subject: `${otp} is your SitePulse verification code`,
      text: `Your SitePulse verification code is: ${otp}\n\nThis code expires in 5 minutes. If you didn't request this, ignore this email.`,
      html: htmlBody,
    });
    console.log(`[smtp-email.util] OTP email sent to ${to}`);
  } catch (err) {
    console.error(`[smtp-email.util] Failed to send OTP email to ${to}:`, err);
    throw new Error("Failed to send verification email");
  }
}

// ------------------------------------------------------------
// Send password reset email
// ------------------------------------------------------------

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<void> {
  const transport = getTransporter();
  const from = getFromEmail();

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 8px; color: #111827; font-size: 22px;">Reset your password</h2>
      <p style="margin: 0 0 24px; color: #6b7280; font-size: 15px;">
        Click the button below to set a new password. This link expires in <strong>15 minutes</strong>.
      </p>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${resetLink}"
           style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none;
                  padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600;">
          Reset Password
        </a>
      </div>
      <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="margin: 0 0 24px; color: #4f46e5; font-size: 13px; word-break: break-all;">
        ${resetLink}
      </p>
      <p style="margin: 0; color: #9ca3af; font-size: 13px;">
        If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    await transport.sendMail({
      from,
      to,
      subject: "Reset your SitePulse password",
      text: `Reset your SitePulse password by visiting:\n${resetLink}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email.`,
      html: htmlBody,
    });
    console.log(`[smtp-email.util] Password reset email sent to ${to}`);
  } catch (err) {
    console.error(
      `[smtp-email.util] Failed to send reset email to ${to}:`,
      err
    );
    throw new Error("Failed to send password reset email");
  }
}
