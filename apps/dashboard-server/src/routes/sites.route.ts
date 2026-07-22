import { Router } from "express";
import { CreateSiteSchema, prisma, getLogger } from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";
import { requireAuth } from "../middleware/auth.middleware";

export const sitesRouter = Router();

const logger = getLogger("dashboard-server");
const tracer = trace.getTracer("dashboard-server");

sitesRouter.use(requireAuth);

sitesRouter.get("/sites", async (req, res, next) => {
  const userId = req.user!.userId;
  logger.info("Fetching sites list for user", { userId });

  try {
    const sites = await tracer.startActiveSpan("prisma.site.findMany", async (span) => {
      span.setAttribute("user.id", userId);
      try {
        const result = await prisma.site.findMany({
          where: { ownerId: userId },
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
        span.setAttribute("site.count", result.length);
        return result;
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched sites", { userId, count: sites.length });
    res.json({ sites });
  } catch (err) {
    logger.error("Failed to fetch sites for user", { userId, error: err });
    next(err);
  }
});

sitesRouter.post("/sites", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const input = CreateSiteSchema.parse(req.body);
    const name = input.name!;
    const domain = input.domain!;

    logger.info("Creating new site", { userId, domain, name });

    const site = await tracer.startActiveSpan("prisma.site.create", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.domain", domain);
      try {
        const result = await prisma.site.create({
          data: { name, domain, owner: { connect: { id: userId } } },
          select: { id: true, name: true, domain: true, publicKey: true, isActive: true },
        });
        span.setAttribute("site.id", result.id);
        return result;
      } finally {
        span.end();
      }
    });

    logger.info("Site created successfully", { userId, siteId: site.id, domain });
    res.status(201).json({ site });
  } catch (err) {
    logger.error("Failed to create site", { userId, body: req.body, error: err });
    next(err);
  }
});

sitesRouter.delete("/sites/:siteId", async (req, res, next) => {
  const userId = req.user!.userId;
  const { siteId } = req.params;

  logger.info("Initiating site deletion request", { userId, siteId });

  try {
    const site = await prisma.site.findUnique({ where: { id: siteId } });

    if (!site || site.ownerId !== userId) {
      logger.warn("Site deletion failed: site not found or access denied", { userId, siteId });
      res.status(404).json({ error: "site_not_found" });
      return;
    }

    await tracer.startActiveSpan("prisma.site.delete", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", siteId);
      try {
        await prisma.site.delete({ where: { id: site.id } });
      } finally {
        span.end();
      }
    });

    logger.info("Site deleted successfully", { userId, siteId });
    res.status(204).end();
  } catch (err) {
    logger.error("Failed to delete site", { userId, siteId, error: err });
    next(err);
  }
});