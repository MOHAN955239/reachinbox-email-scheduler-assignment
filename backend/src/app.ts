import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { emailsRouter } from "./routes/emails";
import { requestLogger } from "./middleware/requestLogger";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(requestLogger);

// Generic API rate limit — protects the service itself from abuse/runaway
// clients. Separate from, and unrelated to, the per-sender *email send*
// rate limiting in queue/rateLimiter.ts, which governs outbound email
// throughput, not inbound HTTP traffic.
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", emailsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` });
});

// Centralized error handler. Every async route is wrapped in asyncHandler
// (middleware/asyncHandler.ts) since Express 4 doesn't forward rejected
// promises on its own — this is the single place an uncaught error from
// any controller ends up, so the client always gets a clean JSON error
// instead of a stack trace or a hung request.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "Internal server error" });
});
