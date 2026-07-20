import "./tracing"; // MUST be first — initializes OTel before other imports are patched

import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";

import { authRouter } from "./routes/auth.route";
import { apiAuthRouter } from "./routes/auth.controller";
import { sitesRouter } from "./routes/sites.route";
import { analyticsRouter } from "./routes/analytics.route";
import { askRouter } from "./routes/ask.route";
import { errorHandler } from "./middleware/error-handler";

const app = express();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = Number(process.env.DASHBOARD_PORT ?? 4002);
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.DASHBOARD_ALLOWED_ORIGIN?.split(",") ?? true,
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: "256kb" }));

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Looser than ingestion's limiter — this is authenticated, low-volume
// dashboard traffic, not public SDK traffic.
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", service: "dashboard-server" });
});

app.use(authRouter);
app.use(apiAuthRouter);
app.use(sitesRouter);
app.use(analyticsRouter);
app.use(askRouter);

// This server MUST NEVER accept SDK event traffic — no /collect route
// exists here by design.
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`[dashboard-server] listening on :${PORT}`);
});

function shutdown(signal: string) {
  console.log(`[dashboard-server] received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
