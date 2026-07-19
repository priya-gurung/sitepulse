import { Router } from "express";
import {
  AskRequestSchema,
  askAgent,
  aiAgentRequestCounter,
} from "@sitepulse/shared";
import { requireAuth } from "../middleware/auth.middleware";
import { askRateLimiter } from "../middleware/ask-rate-limit";
import { assertSiteOwnership } from "../services/site-access.service";

export const askRouter = Router();

/**
 * POST /ask
 *
 * 1. requireAuth      -> must have a valid JWT (401 otherwise).
 * 2. assertSiteOwnership -> the JWT's user must own the requested siteId
 *    (403 otherwise) — without this, any authenticated user could ask
 *    questions about someone else's site data.
 * 3. Only once both pass do we forward the question to the FastAPI /ask
 *    endpoint. The dashboard server is the only service that talks to
 *    the AI microservice; ingestion and the worker never do.
 */
askRouter.use(requireAuth, askRateLimiter);

askRouter.post("/ask", async (req, res, next) => {
  try {
    const input = AskRequestSchema.parse(req.body);

    const authorized = await assertSiteOwnership(input.siteId, req.user!.userId);
    if (!authorized) {
      aiAgentRequestCounter.add(1, { outcome: "forbidden" });
      res.status(403).json({ error: "forbidden" });
      return;
    }

    let result;
    try {
      result = await askAgent({
        siteId: input.siteId,
        question: input.question,
        startDate: input.from,
        endDate: input.to,
      });
    } catch (err) {
      aiAgentRequestCounter.add(1, { outcome: "upstream_error" });
      console.error("[dashboard-server] AI agent call failed:", err);
      res.status(502).json({ error: "ai_service_unavailable" });
      return;
    }

    aiAgentRequestCounter.add(1, { outcome: "success" });
    res.status(200).json(result);
  } catch (err) {
    aiAgentRequestCounter.add(1, { outcome: "error" });
    next(err);
  }
});
