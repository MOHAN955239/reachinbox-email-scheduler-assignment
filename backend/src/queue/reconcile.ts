import "dotenv/config";
import { prisma } from "../db/prisma";
import { emailQueue, enqueueEmailJob } from "./emailQueue";

/**
 * Reconciliation pass. NOT a cron-based scheduler — it doesn't decide *when*
 * emails go out (BullMQ delayed jobs already do that, durably, inside
 * Redis). This only closes a narrow crash window: a DB row could have been
 * created and then the process died before the corresponding BullMQ job
 * was confirmed added (bullJobId saved), or Redis data could have been
 * lost independently of Postgres. Without this, that row would sit
 * "SCHEDULED" forever with nothing tracking it.
 *
 * Safe to run any number of times: enqueueEmailJob uses the row's own id as
 * the BullMQ jobId, so BullMQ de-dupes automatically, and we additionally
 * skip anything already SENT/PROCESSING/QUEUED with a confirmed live job.
 */
export async function reconcile() {
  const candidates = await prisma.emailJob.findMany({
    where: { status: { in: ["SCHEDULED", "RESCHEDULED"] } },
  });

  let requeued = 0;
  for (const row of candidates) {
    if (row.bullJobId) {
      const existing = await emailQueue.getJob(row.bullJobId);
      if (existing) {
        const state = await existing.getState();
        if (state !== "failed" && state !== "unknown") continue; // still tracked
      }
    }

    const batch = await prisma.batch.findUnique({ where: { id: row.batchId } });
    if (!batch) continue;

    await enqueueEmailJob(
      {
        id: row.id,
        senderEmail: row.senderEmail,
        recipient: row.recipient,
        subject: row.subject,
        body: row.body,
        scheduledAt: row.scheduledAt,
      },
      batch.hourlyLimit
    );
    requeued++;
  }

  if (requeued > 0) {
    console.log(`[reconcile] Re-enqueued ${requeued} email job(s) that had fallen out of the queue.`);
  }
  return requeued;
}

export function startReconciliationLoop(intervalMs = 5 * 60 * 1000) {
  reconcile().catch((e) => console.error("[reconcile] initial pass failed:", e));
  setInterval(() => {
    reconcile().catch((e) => console.error("[reconcile] pass failed:", e));
  }, intervalMs);
}

// Allow `npm run reconcile` as a one-off manual run.
if (require.main === module) {
  reconcile()
    .then((n) => {
      console.log(`Reconciled ${n} job(s).`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
