import { Router } from "express";
import crypto from "crypto";
import {
  OtpRegisterSchema,
  VerifyOtpSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  prisma,
  hashPassword,
  signToken,
} from "@sitepulse/shared";
import { sendOtpEmail, sendPasswordResetEmail } from "../services/email.util";
import {
  pendingRegistrations,
  resetTokens,
} from "../services/temp-store.service";

export const apiAuthRouter = Router();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ------------------------------------------------------------
// POST /api/auth/register
// Accepts name, email, password. Generates 6-digit OTP, hashes
// password, stores temporarily, and emails the OTP via AWS SES.
// ------------------------------------------------------------

apiAuthRouter.post("/api/auth/register", async (req, res, next) => {
  try {
    const input = OtpRegisterSchema.parse(req.body);

    // Check if email is already permanently registered
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    // Prevent OTP spam — reject if a pending OTP already exists
    if (pendingRegistrations.has(input.email)) {
      res.status(429).json({
        error: "otp_already_sent",
        message:
          "A verification code was already sent. Please wait for it to expire before requesting a new one.",
      });
      return;
    }

    // Hash password and generate 6-digit OTP
    const passwordHash = await hashPassword(input.password);
    const otp = crypto.randomInt(100_000, 1_000_000).toString();

    // Store pending registration (auto-expires after OTP_TTL_MS)
    pendingRegistrations.set(
      input.email,
      {
        name: input.name,
        email: input.email,
        passwordHash,
        otp,
      },
      OTP_TTL_MS
    );

    // Send OTP email
    await sendOtpEmail(input.email, otp);

    res.status(201).json({ message: "otp_sent" });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// POST /api/auth/verify-otp
// Accepts email and OTP. If valid & not expired, persists the
// user to the database and returns a JWT.
// ------------------------------------------------------------

apiAuthRouter.post("/api/auth/verify-otp", async (req, res, next) => {
  try {
    const input = VerifyOtpSchema.parse(req.body);

    // Look up pending registration
    const pending = pendingRegistrations.get(input.email);
    if (!pending) {
      res.status(400).json({
        error: "otp_expired_or_invalid",
        message:
          "No pending registration found for this email. The OTP may have expired.",
      });
      return;
    }

    // Validate OTP (timing-safe comparison to prevent timing attacks)
    const otpBuffer = Buffer.from(input.otp);
    const storedBuffer = Buffer.from(pending.otp);
    if (
      otpBuffer.length !== storedBuffer.length ||
      !crypto.timingSafeEqual(otpBuffer, storedBuffer)
    ) {
      res.status(401).json({ error: "invalid_otp" });
      return;
    }

    // Persist user to the database
    const user = await prisma.user.create({
      data: {
        email: pending.email,
        passwordHash: pending.passwordHash,
        name: pending.name,
      },
      select: { id: true, email: true, name: true },
    });

    // Clean up temp store
    pendingRegistrations.delete(input.email);

    // Issue JWT
    const token = signToken({ userId: user.id, email: user.email });

    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// POST /api/auth/forgot-password
// Accepts email. If user exists, generates a secure reset token
// and emails a link via AWS SES. Always returns 200 to prevent
// email enumeration.
// ------------------------------------------------------------

apiAuthRouter.post("/api/auth/forgot-password", async (req, res, next) => {
  try {
    const input = ForgotPasswordSchema.parse(req.body);

    // Always return 200 regardless of whether the email exists
    // to prevent email enumeration attacks.
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (user) {
      // Generate a cryptographically secure reset token
      const token = crypto.randomBytes(48).toString("hex");

      // Store token → email mapping (auto-expires after RESET_TOKEN_TTL_MS)
      resetTokens.set(token, { email: user.email }, RESET_TOKEN_TTL_MS);

      // Build reset link
      const frontendUrl =
        process.env.FRONTEND_URL ?? "https://yourdomain.com";
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;

      // Send email (fire-and-forget pattern: log errors but don't fail the request)
      await sendPasswordResetEmail(user.email, resetLink);
    }

    res.status(200).json({ message: "reset_email_sent" });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------
// POST /api/auth/reset-password
// Accepts token and new password. Validates the token, hashes
// the new password, updates the DB, and destroys the token.
// ------------------------------------------------------------

apiAuthRouter.post("/api/auth/reset-password", async (req, res, next) => {
  try {
    const input = ResetPasswordSchema.parse(req.body);

    // Look up reset token
    const tokenEntry = resetTokens.get(input.token);
    if (!tokenEntry) {
      res.status(400).json({
        error: "token_expired_or_invalid",
        message:
          "This reset link is invalid or has expired. Please request a new one.",
      });
      return;
    }

    // Hash new password
    const passwordHash = await hashPassword(input.password);

    // Update user record in the database
    await prisma.user.update({
      where: { email: tokenEntry.email },
      data: { passwordHash },
    });

    // Destroy the token immediately (single use)
    resetTokens.delete(input.token);

    res.status(200).json({ message: "password_reset_success" });
  } catch (err) {
    next(err);
  }
});
