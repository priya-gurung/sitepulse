import { Router } from "express";
import { AnalyticsQuerySchema, queryPipe } from "@sitepulse/shared";
import { requireAuth } from "../middleware/auth.middleware";
import { assertSiteOwnership } from "../services/site-access.service";
import { withCache } from "../services/cache.service";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

/**
 * All routes below read exclusively from Tinybird Pipes. None of them
 * touch Postgres for analytical data, and none of them touch Kafka or
 * the ingestion pipeline in any way — per architecture rules.
 */
function formatTinybirdDate(date?: string) {
  const targetDate = date ? new Date(date) : new Date();
  return targetDate
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
}

analyticsRouter.get("/analytics/overview", async (req, res, next) => {
  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    const authorized = await assertSiteOwnership(query.siteId, req.user!.userId);
    if (!authorized) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `overview:${JSON.stringify(query)}`;
    const data = await withCache(cacheKey, 30_000, () =>
      queryPipe("overview_metrics", {
        site_id: query.siteId,
        date_from: formatTinybirdDate(query.from),
        date_to: formatTinybirdDate(query.to),
      })
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/analytics/pageviews", async (req, res, next) => {
  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    const authorized = await assertSiteOwnership(query.siteId, req.user!.userId);
    if (!authorized) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `pageviews:${JSON.stringify(query)}`;
    const data = await withCache(cacheKey, 30_000, () =>
      queryPipe("pageviews_by_granularity", {
        site_id: query.siteId,
        date_from: formatTinybirdDate(query.from),
        date_to: formatTinybirdDate(query.to),
        granularity: query.granularity,
      })
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/analytics/top-pages", async (req, res, next) => {
  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    const authorized = await assertSiteOwnership(query.siteId, req.user!.userId);
    if (!authorized) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `top-pages:${JSON.stringify(query)}`;
    const data = await withCache(cacheKey, 30_000, () =>
      queryPipe("top_pages", {
        site_id: query.siteId,
        date_from: formatTinybirdDate(query.from),
        date_to: formatTinybirdDate(query.to),
      })
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/analytics/referrers", async (req, res, next) => {
  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    const authorized = await assertSiteOwnership(query.siteId, req.user!.userId);
    if (!authorized) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `referrers:${JSON.stringify(query)}`;
    const data = await withCache(cacheKey, 30_000, () =>
      queryPipe("top_referrers", {
        site_id: query.siteId,
        date_from: formatTinybirdDate(query.from),
        date_to: formatTinybirdDate(query.to),
      })
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/analytics/geo", async (req, res, next) => {
  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    const authorized = await assertSiteOwnership(query.siteId, req.user!.userId);
    if (!authorized) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `geo:${JSON.stringify(query)}`;
    const data = await withCache(cacheKey, 30_000, () =>
      queryPipe("visitors_by_country", {
        site_id: query.siteId,
        date_from: formatTinybirdDate(query.from),
        date_to: formatTinybirdDate(query.to),
      })
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

analyticsRouter.get("/analytics/clicks", async (req, res, next) => {
  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    const authorized = await assertSiteOwnership(query.siteId, req.user!.userId);
    if (!authorized) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `clicks:${JSON.stringify(query)}`;
    const data = await withCache(cacheKey, 30_000, () =>
      queryPipe("clicks", {
        site_id: query.siteId,
        date_from: formatTinybirdDate(query.from),
        date_to: formatTinybirdDate(query.to),
      })
    );

    res.json({ data });
  } catch (err) {
    next(err);
  }
});
