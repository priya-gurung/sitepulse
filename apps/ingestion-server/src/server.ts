import "./tracing"; // MUST be first — initializes OTel before other imports are patched

import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";

import { getLogger, disconnectProducer } from "@sitepulse/shared";

import { collectRouter } from "./routes/collect.route";
import { healthRouter } from "./routes/health.route";
import { errorHandler } from "./middleware/error-handler";
import { collectRateLimiter } from "./middleware/rate-limit";
import { startSiteCache } from "./lib/site-cache";

const logger = getLogger("ingestion-server");

const app = express();
const PORT = Number(process.env.INGESTION_PORT ?? 4001);

// Sits behind NGINX — trust exactly one hop so req.ip reflects the real client.
app.set("trust proxy", 1);

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "unsafe-none" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: true, // SDK is embedded on arbitrary customer websites
    methods: ["POST", "OPTIONS"],
    credentials: true,
    maxAge: 86_400,
  })
);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(compression());
app.use(express.text({ type: "text/plain", limit: "32kb" }));
app.use(express.json({ limit: "32kb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(healthRouter);
app.use(collectRateLimiter, collectRouter);

// Anything else on this server is a mistake by definition (see architecture
// notes: ingestion MUST NOT serve dashboard/report traffic).
app.use((req, res) => {
  logger.warn("Unmatched endpoint targeted on ingestion server", {
    path: req.path,
    method: req.method,
    ip: req.ip,
  });
  res.status(404).json({ error: "not_found" });
});

app.use(errorHandler);

const cacheInterval = startSiteCache();

const server = app.listen(PORT, () => {
  logger.info(`[ingestion-server] listening on :${PORT}`, { port: PORT });
});

function shutdown(signal: string) {
  logger.info(`[ingestion-server] received ${signal}, shutting down...`, { signal });
  clearInterval(cacheInterval);
  server.close(async () => {
    await disconnectProducer().catch((err) =>
      logger.error("[ingestion-server] error disconnecting Kafka producer", { error: err })
    );
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));