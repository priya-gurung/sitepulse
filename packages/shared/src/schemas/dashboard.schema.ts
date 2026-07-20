import { z } from "zod";

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(120),
  domain: z.string().min(3).max(255),
});

export const AnalyticsQuerySchema = z.object({
  siteId: z.string(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
});

export const AskRequestSchema = z.object({
  siteId: z.string(),
  question: z.string().min(1, "question cannot be empty").max(2000),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

// ---- OTP-Verified Registration ----
export const OtpRegisterSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const VerifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
});

// ---- Forgot / Reset Password ----
export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type AnalyticsQueryInput = z.infer<typeof AnalyticsQuerySchema>;
export type AskRequestInput = z.infer<typeof AskRequestSchema>;
export type OtpRegisterInput = z.infer<typeof OtpRegisterSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
