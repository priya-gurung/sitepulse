import { Router } from "express";
import {
  AskRequestSchema,
  askAgent,
  aiAgentRequestCounter,
  getLogger,
} from "@sitepulse/shared";
import { trace } from "@opentelemetry/api";
import { requireAuth } from "../middleware/auth.middleware";
import { askRateLimiter } from "../middleware/ask-rate-limit";
import { assertSiteOwnership } from "../services/site-access.service";

export const askRouter = Router();

const logger = getLogger("dashboard-server");
const tracer = trace.getTracer("dashboard-server");

/**
 * POST /ask
 *
 * 1. requireAuth       -> must have a valid JWT (401 otherwise).
 * 2. assertSiteOwnership -> the JWT's user must own the requested siteId
 *    (403 otherwise) — without this, any authenticated user could ask
 *    questions about someone else's site data.
 * 3. Only once both pass do we forward the question to the FastAPI /ask
 *    endpoint. The dashboard server is the only service that talks to
 *    the AI microservice; ingestion and the worker never do.
 */
askRouter.use(requireAuth, askRateLimiter);

askRouter.post("/ask", async (req, res, next) => {
  const userId = req.user!.userId;

  try {
    const input = AskRequestSchema.parse(req.body);

    logger.info("Received AI question request", {
      userId,
      siteId: input.siteId,
      question: input.question,
      from: input.from,
      to: input.to,
    });

    const authorized = await tracer.startActiveSpan("site.assertOwnership", async (span) => {
      span.setAttribute("user.id", userId);
      span.setAttribute("site.id", input.siteId);
      try {
        return await assertSiteOwnership(input.siteId, userId);
      } finally {
        span.end();
      }
    });

    if (!authorized) {
      aiAgentRequestCounter.add(1, { outcome: "forbidden" });
      logger.warn("Unauthorized attempt to query site AI analytics", { userId, siteId: input.siteId });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    let result;
    try {
      result = await tracer.startActiveSpan("ai.askAgentProxy", async (span) => {
        span.setAttribute("user.id", userId);
        span.setAttribute("site.id", input.siteId);
        try {
          return await askAgent({
            siteId: input.siteId,
            question: input.question,
            startDate: input.from,
            endDate: input.to,
          });
        } finally {
          span.end();
        }
      });
    } catch (err) {
      aiAgentRequestCounter.add(1, { outcome: "upstream_error" });
      logger.error("AI agent upstream invocation failed", {
        userId,
        siteId: input.siteId,
        error: err,
      });
      res.status(502).json({ error: "ai_service_unavailable" });
      return;
    }

    aiAgentRequestCounter.add(1, { outcome: "success" });
    logger.info("Successfully returned AI agent response", {
      userId,
      siteId: input.siteId,
      toolsUsed: result?.toolsUsed ?? result?.tools_used,
    });

    res.status(200).json(result);
  } catch (err) {
    aiAgentRequestCounter.add(1, { outcome: "error" });
    logger.error("Validation or internal failure processing /ask request", { userId, error: err });
    next(err);
  }
});