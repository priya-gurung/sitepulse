import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// ------------------------------------------------------------
// AWS SES Email Utility
// Requires env vars: AWS_REGION, AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL
// ------------------------------------------------------------

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (!sesClient) {
    const region = process.env.AWS_REGION;
    if (!region) throw new Error("AWS_REGION is not configured");

    sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return sesClient;
}

function getFromEmail(): string {
  const from = process.env.SES_FROM_EMAIL;
  if (!from) throw new Error("SES_FROM_EMAIL is not configured");
  return from;
}

// ------------------------------------------------------------
// Send OTP verification email
// ------------------------------------------------------------

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const client = getSesClient();
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

  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: `${otp} is your SitePulse verification code`, Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: {
          Data: `Your SitePulse verification code is: ${otp}\n\nThis code expires in 5 minutes. If you didn't request this, ignore this email.`,
          Charset: "UTF-8",
        },
      },
    },
  });

  try {
    await client.send(command);
    console.log(`[email.util] OTP email sent to ${to}`);
  } catch (err) {
    console.error(`[email.util] Failed to send OTP email to ${to}:`, err);
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
  const client = getSesClient();
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

  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: "Reset your SitePulse password", Charset: "UTF-8" },
      Body: {
        Html: { Data: htmlBody, Charset: "UTF-8" },
        Text: {
          Data: `Reset your SitePulse password by visiting:\n${resetLink}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email.`,
          Charset: "UTF-8",
        },
      },
    },
  });

  try {
    await client.send(command);
    console.log(`[email.util] Password reset email sent to ${to}`);
  } catch (err) {
    console.error(`[email.util] Failed to send reset email to ${to}:`, err);
    throw new Error("Failed to send password reset email");
  }
}
