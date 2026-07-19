import { Router } from "express";
import { siteCacheHealth } from "../lib/site-cache";

export const healthRouter = Router();

healthRouter.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "ingestion-server",
    siteCache: siteCacheHealth(),
    uptimeSeconds: process.uptime(),
  });
});
