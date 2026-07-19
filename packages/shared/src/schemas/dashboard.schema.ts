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

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type AnalyticsQueryInput = z.infer<typeof AnalyticsQuerySchema>;
export type AskRequestInput = z.infer<typeof AskRequestSchema>;
