import { Router } from "express";
import {
  RegisterSchema,
  LoginSchema,
  prisma,
  hashPassword,
  verifyPassword,
  signToken,
  getLogger,
} from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";

export const authRouter = Router();

const logger = getLogger("dashboard-server");
const tracer = trace.getTracer("dashboard-server");

authRouter.post("/auth/register", async (req, res, next) => {
  try {
    const input = RegisterSchema.parse(req.body);
    logger.info("Processing user registration attempt", { email: input.email });

    const existing = await tracer.startActiveSpan("prisma.user.findUnique", async (span) => {
      span.setAttribute("user.email", input.email);
      try {
        return await prisma.user.findUnique({ where: { email: input.email } });
      } finally {
        span.end();
      }
    });

    if (existing) {
      logger.warn("Registration rejected: email already registered", { email: input.email });
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    const passwordHash = await tracer.startActiveSpan("auth.hashPassword", async (span) => {
      try {
        return await hashPassword(input.password);
      } finally {
        span.end();
      }
    });

    const user = await tracer.startActiveSpan("prisma.user.create", async (span) => {
      span.setAttribute("user.email", input.email);
      try {
        const createdUser = await prisma.user.create({
          data: { email: input.email, passwordHash, name: input.name },
          select: { id: true, email: true, name: true },
        });
        span.setAttribute("user.id", createdUser.id);
        return createdUser;
      } finally {
        span.end();
      }
    });

    const token = signToken({ userId: user.id, email: user.email });
    logger.info("User registered successfully", { userId: user.id, email: user.email });

    res.status(201).json({ user, token });
  } catch (err) {
    logger.error("User registration failed due to an error", { error: err });
    next(err);
  }
});

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const input = LoginSchema.parse(req.body);
    logger.info("Processing login attempt", { email: input.email });

    const user = await tracer.startActiveSpan("prisma.user.findUnique", async (span) => {
      span.setAttribute("user.email", input.email);
      try {
        return await prisma.user.findUnique({ where: { email: input.email } });
      } finally {
        span.end();
      }
    });

    if (!user) {
      logger.warn("Login failed: user not found", { email: input.email });
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const valid = await tracer.startActiveSpan("auth.verifyPassword", async (span) => {
      try {
        return await verifyPassword(input.password, user.passwordHash);
      } finally {
        span.end();
      }
    });

    if (!valid) {
      logger.warn("Login failed: invalid password provided", { email: input.email, userId: user.id });
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    logger.info("User logged in successfully", { userId: user.id, email: user.email });

    res.status(200).json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    logger.error("Login request failed due to an error", { error: err });
    next(err);
  }
});