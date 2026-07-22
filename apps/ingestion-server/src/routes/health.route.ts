import { Router } from "express";
import { getLogger } from "@sitepulse/shared";
import { siteCacheHealth } from "../lib/site-cache";

export const healthRouter = Router();

const logger = getLogger("ingestion-server");

healthRouter.get("/healthz", (_req, res) => {
  const cacheStatus = siteCacheHealth();

  logger.info("Health check requested for ingestion-server", {
    siteCacheEntries: cacheStatus.entries,
    lastRefreshError: cacheStatus.lastRefreshError,
    uptimeSeconds: process.uptime(),
  });

  res.status(200).json({
    status: "ok",
    service: "ingestion-server",
    siteCache: cacheStatus,
    uptimeSeconds: process.uptime(),
  });
});