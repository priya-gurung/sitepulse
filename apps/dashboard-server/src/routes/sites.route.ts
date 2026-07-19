import { Router } from "express";
import { CreateSiteSchema, prisma } from "@sitepulse/shared";
import { requireAuth } from "../middleware/auth.middleware";

export const sitesRouter = Router();

sitesRouter.use(requireAuth);

sitesRouter.get("/sites", async (req, res, next) => {
  try {
    const sites = await prisma.site.findMany({
      where: { ownerId: req.user!.userId },
      select: {
        id: true,
        name: true,
        domain: true,
        publicKey: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ sites });
  } catch (err) {
    next(err);
  }
});

sitesRouter.post("/sites", async (req, res, next) => {
  try {
    const input = CreateSiteSchema.parse(req.body);
    const site = await prisma.site.create({
      data: { ...input, ownerId: req.user!.userId },
      select: { id: true, name: true, domain: true, publicKey: true, isActive: true },
    });
    res.status(201).json({ site });
  } catch (err) {
    next(err);
  }
});

sitesRouter.delete("/sites/:siteId", async (req, res, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId } });
    if (!site || site.ownerId !== req.user!.userId) {
      res.status(404).json({ error: "site_not_found" });
      return;
    }
    await prisma.site.delete({ where: { id: site.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
