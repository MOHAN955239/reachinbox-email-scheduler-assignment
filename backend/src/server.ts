import "dotenv/config";
import { app } from "./app";
import { env } from "./config/env";
import { startReconciliationLoop } from "./queue/reconcile";
import { prisma } from "./db/prisma";

const server = app.listen(env.port, () => {
  console.log(`[api] Listening on http://localhost:${env.port}`);
  // Crash-safety net described in queue/reconcile.ts — cheap to run
  // alongside the API process since it only touches Postgres + Redis.
  startReconciliationLoop();
});

async function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  // Force-exit if connections don't drain in time.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

