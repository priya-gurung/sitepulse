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
  getLogger,
} from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";
import { sendOtpEmail as sesSendOtp, sendPasswordResetEmail as sesSendReset } from "../services/email.util";
import { sendOtpEmail as smtpSendOtp, sendPasswordResetEmail as smtpSendReset } from "../services/smtp-email.util";
import {
  pendingRegistrations,
  resetTokens,
} from "../services/temp-store.service";

const logger = getLogger("dashboard-server");
const tracer = trace.getTracer("dashboard-server");

// Pick email provider based on EMAIL_PROVIDER env var ("ses" | "smtp", defaults to "smtp")
const provider = (process.env.EMAIL_PROVIDER ?? "smtp").toLowerCase();
const sendOtpEmail = provider === "smtp" ? smtpSendOtp : sesSendOtp;
const sendPasswordResetEmail = provider === "smtp" ? smtpSendReset : sesSendReset;

export const apiAuthRouter = Router();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// ------------------------------------------------------------
// POST /api/auth/register
// Accepts name, email, password. Generates 6-digit OTP, hashes
// password, stores temporarily, and emails the OTP via AWS SES / SMTP.
// ------------------------------------------------------------

apiAuthRouter.post("/api/auth/register", async (req, res, next) => {
  try {
    const input = OtpRegisterSchema.parse(req.body);
    logger.info("Processing OTP registration request", { email: input.email, provider });

    // Check if email is already permanently registered
    const existing = await tracer.startActiveSpan("prisma.user.findUnique", async (span) => {
      span.setAttribute("user.email", input.email);
      try {
        return await prisma.user.findUnique({ where: { email: input.email } });
      } finally {
        span.end();
      }
    });

    if (existing) {
      logger.warn("OTP registration rejected: email already registered", { email: input.email });
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    // Prevent OTP spam — reject if a pending OTP already exists
    if (pendingRegistrations.has(input.email)) {
      logger.warn("OTP registration rate-limited: pending OTP already active", { email: input.email });
      res.status(429).json({
        error: "otp_already_sent",
        message:
          "A verification code was already sent. Please wait for it to expire before requesting a new one.",
      });
      return;
    }

    // Hash password and generate 6-digit OTP
    const passwordHash = await tracer.startActiveSpan("auth.hashPassword", async (span) => {
      try {
        return await hashPassword(input.password);
      } finally {
        span.end();
      }
    });

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
    await tracer.startActiveSpan("email.sendOtp", async (span) => {
      span.setAttribute("email.provider", provider);
      span.setAttribute("user.email", input.email);
      try {
        await sendOtpEmail(input.email, otp);
      } finally {
        span.end();
      }
    });

    logger.info("OTP generated and sent successfully", { email: input.email, provider });
    res.status(201).json({ message: "otp_sent" });
  } catch (err) {
    logger.error("Failed to process OTP registration", { error: err });
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
    logger.info("Processing OTP verification attempt", { email: input.email });

    // Look up pending registration
    const pending = pendingRegistrations.get(input.email);
    if (!pending) {
      logger.warn("OTP verification failed: no pending registration found or expired", { email: input.email });
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
      logger.warn("OTP verification failed: invalid OTP provided", { email: input.email });
      res.status(401).json({ error: "invalid_otp" });
      return;
    }

    // Persist user to the database
    const user = await tracer.startActiveSpan("prisma.user.create", async (span) => {
      span.setAttribute("user.email", pending.email);
      try {
        const createdUser = await prisma.user.create({
          data: {
            email: pending.email,
            passwordHash: pending.passwordHash,
            name: pending.name,
          },
          select: { id: true, email: true, name: true },
        });
        span.setAttribute("user.id", createdUser.id);
        return createdUser;
      } finally {
        span.end();
      }
    });

    // Clean up temp store
    pendingRegistrations.delete(input.email);

    // Issue JWT
    const token = signToken({ userId: user.id, email: user.email });
    logger.info("OTP verified successfully and user account created", { userId: user.id, email: user.email });

    res.status(201).json({ user, token });
  } catch (err) {
    logger.error("Failed during OTP verification process", { error: err });
    next(err);
  }
});

// ------------------------------------------------------------
// POST /api/auth/forgot-password
// Accepts email. If user exists, generates a secure reset token
// and emails a link. Always returns 200 to prevent email enumeration.
// ------------------------------------------------------------

apiAuthRouter.post("/api/auth/forgot-password", async (req, res, next) => {
  try {
    const input = ForgotPasswordSchema.parse(req.body);
    logger.info("Processing forgot password request", { email: input.email });

    const user = await tracer.startActiveSpan("prisma.user.findUnique", async (span) => {
      span.setAttribute("user.email", input.email);
      try {
        return await prisma.user.findUnique({ where: { email: input.email } });
      } finally {
        span.end();
      }
    });

    if (user) {
      // Generate a cryptographically secure reset token
      const token = crypto.randomBytes(48).toString("hex");

      // Store token → email mapping (auto-expires after RESET_TOKEN_TTL_MS)
      resetTokens.set(token, { email: user.email }, RESET_TOKEN_TTL_MS);

      // Build reset link
      const frontendUrl = process.env.FRONTEND_URL ?? "https://yourdomain.com";
      const resetLink = `${frontendUrl}/reset-password?token=${token}`;

      // Send email
      await tracer.startActiveSpan("email.sendPasswordReset", async (span) => {
        span.setAttribute("email.provider", provider);
        span.setAttribute("user.email", user.email);
        try {
          await sendPasswordResetEmail(user.email, resetLink);
        } finally {
          span.end();
        }
      });

      logger.info("Password reset email sent successfully", { userId: user.id, email: user.email, provider });
    } else {
      logger.info("Forgot password request completed for non-existent email (enumeration safety)", { email: input.email });
    }

    res.status(200).json({ message: "reset_email_sent" });
  } catch (err) {
    logger.error("Failed during forgot password flow", { error: err });
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
    logger.info("Processing password reset execution request");

    // Look up reset token
    const tokenEntry = resetTokens.get(input.token);
    if (!tokenEntry) {
      logger.warn("Password reset failed: token expired or invalid");
      res.status(400).json({
        error: "token_expired_or_invalid",
        message:
          "This reset link is invalid or has expired. Please request a new one.",
      });
      return;
    }

    // Hash new password
    const passwordHash = await tracer.startActiveSpan("auth.hashPassword", async (span) => {
      try {
        return await hashPassword(input.password);
      } finally {
        span.end();
      }
    });

    // Update user record in the database
    await tracer.startActiveSpan("prisma.user.updatePassword", async (span) => {
      span.setAttribute("user.email", tokenEntry.email);
      try {
        await prisma.user.update({
          where: { email: tokenEntry.email },
          data: { passwordHash },
        });
      } finally {
        span.end();
      }
    });

    // Destroy the token immediately (single use)
    resetTokens.delete(input.token);

    logger.info("Password reset executed successfully", { email: tokenEntry.email });
    res.status(200).json({ message: "password_reset_success" });
  } catch (err) {
    logger.error("Failed to reset password", { error: err });
    next(err);
  }
});