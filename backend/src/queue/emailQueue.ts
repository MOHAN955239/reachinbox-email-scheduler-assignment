import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { prisma } from "../db/prisma";
import { env } from "../config/env";

export const QUEUE_NAME = "email-send";

export const emailQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600 * 24 * 7 }, // keep 7 days for the dashboard
    removeOnFail: false,
  },
});

export interface EmailJobPayload {
  emailJobId: string; // our DB row id — this IS the source of truth
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  hourlyLimit: number;
}

/**
 * Enqueues a single EmailJob row.
 *
 * Idempotency: we use the DB row's own id as the BullMQ jobId. BullMQ
 * de-dupes on jobId at the Redis level, so calling this twice for the same
 * row (e.g. from both the API and a reconciliation pass racing each other)
 * is a no-op the second time. We additionally check bullJobId on the row
 * itself before calling this, so a row already marked as queued is never
 * re-submitted.
 */
export async function enqueueEmailJob(row: {
  id: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
}, hourlyLimit: number) {
  const delay = Math.max(0, row.scheduledAt.getTime() - Date.now());

  const job = await emailQueue.add(
    "send-email",
    {
      emailJobId: row.id,
      senderEmail: row.senderEmail,
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      hourlyLimit,
    } satisfies EmailJobPayload,
    {
      jobId: row.id, // <-- idempotency key
      delay,
    }
  );

  await prisma.emailJob.update({
    where: { id: row.id },
    data: { status: "QUEUED", bullJobId: job.id },
  });

  return job;
}

export function minDelayLimiterOptions() {
  // BullMQ worker-level limiter: caps how many jobs a single worker can
  // *start* within a rolling window, giving us "minimum delay between
  // sends" for free without a custom setTimeout in the processor.
  return {
    max: 1,
    duration: env.minDelayBetweenEmailsMs,
  };
}
