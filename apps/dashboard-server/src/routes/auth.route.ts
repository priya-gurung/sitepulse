import { Router } from "express";
import {
  RegisterSchema,
  LoginSchema,
  prisma,
  hashPassword,
  verifyPassword,
  signToken,
} from "@sitepulse/shared";

export const authRouter = Router();

authRouter.post("/auth/register", async (req, res, next) => {
  try {
    const input = RegisterSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      res.status(409).json({ error: "email_already_registered" });
      return;
    }

    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, name: input.name },
      select: { id: true, email: true, name: true },
    });

    const token = signToken({ userId: user.id, email: user.email });
    res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const input = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email });
    res.status(200).json({
      user: { id: user.id, email: user.email, name: user.name },
      token,
    });
  } catch (err) {
    next(err);
  }
});
