import { Router } from "express";
import { AnalyticsQuerySchema, queryPipe, getLogger } from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";
import { requireAuth } from "../middleware/auth.middleware";
import { assertSiteOwnership } from "../services/site-access.service";
import { withCache } from "../services/cache.service";

export const analyticsRouter = Router();

const logger = getLogger("dashboard-server");
const tracer = trace.getTracer("dashboard-server");

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
  const userId = req.user!.userId;

  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    logger.info("Fetching overview analytics metrics", { userId, siteId: query.siteId });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", query.siteId);
      try {
        return await assertSiteOwnership(query.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      logger.warn("Unauthorized access to overview metrics", { userId, siteId: query.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `overview:${JSON.stringify(query)}`;
    const data = await tracer.startActiveSpan("tinybird.queryPipe.overview_metrics", async (span) => {
      span.setAttribute("site.id", query.siteId);
      try {
        return await withCache(cacheKey, 30_000, () =>
          queryPipe("overview_metrics", {
            site_id: query.siteId,
            date_from: formatTinybirdDate(query.from),
            date_to: formatTinybirdDate(query.to),
          })
        );
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched overview analytics", { userId, siteId: query.siteId });
    res.json({ data });
  } catch (err) {
    logger.error("Failed to fetch overview analytics", { userId, error: err });
    next(err);
  }
});

analyticsRouter.get("/analytics/pageviews", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    logger.info("Fetching pageviews analytics", { userId, siteId: query.siteId, granularity: query.granularity });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", query.siteId);
      try {
        return await assertSiteOwnership(query.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      logger.warn("Unauthorized access to pageviews metrics", { userId, siteId: query.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `pageviews:${JSON.stringify(query)}`;
    const data = await tracer.startActiveSpan("tinybird.queryPipe.pageviews_by_granularity", async (span) => {
      span.setAttribute("site.id", query.siteId);
      span.setAttribute("analytics.granularity", query.granularity ?? "day");
      try {
        return await withCache(cacheKey, 30_000, () =>
          queryPipe("pageviews_by_granularity", {
            site_id: query.siteId,
            date_from: formatTinybirdDate(query.from),
            date_to: formatTinybirdDate(query.to),
            granularity: query.granularity,
          })
        );
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched pageviews analytics", { userId, siteId: query.siteId });
    res.json({ data });
  } catch (err) {
    logger.error("Failed to fetch pageviews analytics", { userId, error: err });
    next(err);
  }
});

analyticsRouter.get("/analytics/top-pages", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    logger.info("Fetching top pages analytics", { userId, siteId: query.siteId });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", query.siteId);
      try {
        return await assertSiteOwnership(query.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      logger.warn("Unauthorized access to top pages metrics", { userId, siteId: query.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `top-pages:${JSON.stringify(query)}`;
    const data = await tracer.startActiveSpan("tinybird.queryPipe.top_pages", async (span) => {
      span.setAttribute("site.id", query.siteId);
      try {
        return await withCache(cacheKey, 30_000, () =>
          queryPipe("top_pages", {
            site_id: query.siteId,
            date_from: formatTinybirdDate(query.from),
            date_to: formatTinybirdDate(query.to),
          })
        );
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched top pages analytics", { userId, siteId: query.siteId });
    res.json({ data });
  } catch (err) {
    logger.error("Failed to fetch top pages analytics", { userId, error: err });
    next(err);
  }
});

analyticsRouter.get("/analytics/referrers", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    logger.info("Fetching top referrers analytics", { userId, siteId: query.siteId });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", query.siteId);
      try {
        return await assertSiteOwnership(query.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      logger.warn("Unauthorized access to referrers metrics", { userId, siteId: query.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `referrers:${JSON.stringify(query)}`;
    const data = await tracer.startActiveSpan("tinybird.queryPipe.top_referrers", async (span) => {
      span.setAttribute("site.id", query.siteId);
      try {
        return await withCache(cacheKey, 30_000, () =>
          queryPipe("top_referrers", {
            site_id: query.siteId,
            date_from: formatTinybirdDate(query.from),
            date_to: formatTinybirdDate(query.to),
          })
        );
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched referrers analytics", { userId, siteId: query.siteId });
    res.json({ data });
  } catch (err) {
    logger.error("Failed to fetch referrers analytics", { userId, error: err });
    next(err);
  }
});

analyticsRouter.get("/analytics/geo", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    logger.info("Fetching geo analytics", { userId, siteId: query.siteId });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", query.siteId);
      try {
        return await assertSiteOwnership(query.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      logger.warn("Unauthorized access to geo metrics", { userId, siteId: query.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `geo:${JSON.stringify(query)}`;
    const data = await tracer.startActiveSpan("tinybird.queryPipe.visitors_by_country", async (span) => {
      span.setAttribute("site.id", query.siteId);
      try {
        return await withCache(cacheKey, 30_000, () =>
          queryPipe("visitors_by_country", {
            site_id: query.siteId,
            date_from: formatTinybirdDate(query.from),
            date_to: formatTinybirdDate(query.to),
          })
        );
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched geo analytics", { userId, siteId: query.siteId });
    res.json({ data });
  } catch (err) {
    logger.error("Failed to fetch geo analytics", { userId, error: err });
    next(err);
  }
});

analyticsRouter.get("/analytics/clicks", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const query = AnalyticsQuerySchema.parse(req.query);
    logger.info("Fetching clicks analytics", { userId, siteId: query.siteId });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", query.siteId);
      try {
        return await assertSiteOwnership(query.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      logger.warn("Unauthorized access to clicks metrics", { userId, siteId: query.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const cacheKey = `clicks:${JSON.stringify(query)}`;
    const data = await tracer.startActiveSpan("tinybird.queryPipe.clicks", async (span) => {
      span.setAttribute("site.id", query.siteId);
      try {
        return await withCache(cacheKey, 30_000, () =>
          queryPipe("clicks", {
            site_id: query.siteId,
            date_from: formatTinybirdDate(query.from),
            date_to: formatTinybirdDate(query.to),
          })
        );
      } finally {
        span.end();
      }
    });

    logger.info("Successfully fetched clicks analytics", { userId, siteId: query.siteId });
    res.json({ data });
  } catch (err) {
    logger.error("Failed to fetch clicks analytics", { userId, error: err });
    next(err);
  }
});