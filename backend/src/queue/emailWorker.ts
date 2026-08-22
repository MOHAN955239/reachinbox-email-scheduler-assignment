import "dotenv/config";
import { DelayedError, Worker, Job } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAME, EmailJobPayload, minDelayLimiterOptions } from "./emailQueue";
import { tryConsumeQuota, msUntilNextHourWindow } from "./rateLimiter";
import { sendEmail } from "../services/smtpService";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

async function processor(job: Job<EmailJobPayload>, token?: string) {
  const { emailJobId, senderEmail, recipient, subject, body, hourlyLimit } = job.data;

  // --- Idempotency guard ---
  // If the DB already says this row was sent (e.g. we crashed right after
  // sending but before BullMQ marked the job complete, and it got retried),
  // do nothing. The DB row, not the queue, is the source of truth.
  const row = await prisma.emailJob.findUnique({ where: { id: emailJobId } });
  if (!row) {
    console.warn(`[worker] EmailJob ${emailJobId} no longer exists in DB, skipping.`);
    return;
  }
  if (row.status === "SENT") {
    console.log(`[worker] EmailJob ${emailJobId} already SENT, skipping duplicate.`);
    return;
  }

  // --- Hourly rate limit (per sender), safe across worker instances ---
  const admitted = await tryConsumeQuota(senderEmail, hourlyLimit);
  if (!admitted) {
    const delayMs = msUntilNextHourWindow() + 1000; // small buffer past the boundary
    console.log(
      `[worker] Hourly cap reached for ${senderEmail}. Rescheduling job ${job.id} in ${delayMs}ms.`
    );
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: "RESCHEDULED", scheduledAt: new Date(Date.now() + delayMs) },
    });
    // Same BullMQ job, same jobId -> no duplication, order preserved
    // relative to other jobs pushed into that same next window.
    if (token) {
      await job.moveToDelayed(Date.now() + delayMs, token);
      throw new DelayedError();
    } else {
      // Fallback (shouldn't happen with the standard Worker), re-add fresh.
      throw new Error("Missing lock token; cannot delay job safely");
    }
  }

  await prisma.emailJob.update({ where: { id: emailJobId }, data: { status: "PROCESSING" } });

  try {
    const result = await sendEmail({ senderEmail, to: recipient, subject, html: body });
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
    });
    console.log(`[worker] Sent ${emailJobId} -> ${recipient} (${result.previewUrl || result.messageId})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { attempts: { increment: 1 }, lastError: message },
    });
    throw err; // let BullMQ's attempts/backoff handle retrying
  }
}

export const emailWorker = new Worker<EmailJobPayload>(QUEUE_NAME, processor, {
  connection: redisConnection,
  concurrency: env.workerConcurrency,
  limiter: minDelayLimiterOptions(), // enforces the min delay between sends, queue-wide
});

emailWorker.on("failed", async (job, err) => {
  if (!job) return;
  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 1;
  console.error(`[worker] Job ${job.id} failed (attempt ${attemptsMade}/${maxAttempts}): ${err.message}`);

  if (attemptsMade >= maxAttempts) {
    await prisma.emailJob.update({
      where: { id: job.data.emailJobId },
      data: { status: "FAILED", lastError: err.message },
    }).catch(() => {});
  }
});

emailWorker.on("ready", () => {
  console.log(
    `[worker] Ready. concurrency=${env.workerConcurrency} minDelayMs=${env.minDelayBetweenEmailsMs}`
  );
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, closing gracefully...");
  await emailWorker.close();
  process.exit(0);
});
