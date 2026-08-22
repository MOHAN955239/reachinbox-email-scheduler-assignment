import { Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { enqueueEmailJob } from "../queue/emailQueue";
import { parseLeadsFile } from "../utils/parseLeads";
import { listConfiguredSenders } from "../services/smtpService";
import { env } from "../config/env";
import { AuthedRequest } from "../routes/authMiddleware";

export function getSenders(_req: AuthedRequest, res: Response) {
  res.json({ senders: listConfiguredSenders() });
}

export function uploadLeads(req: AuthedRequest, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded (field name: 'file')" });
  }
  const emails = parseLeadsFile(req.file.buffer);
  res.json({ count: emails.length, emails });
}

const composeSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  senderEmail: z.string().email(),
  recipients: z.array(z.string().email()).min(1),
  startTime: z.string().datetime(),
  delayMs: z.number().int().min(0).default(env.minDelayBetweenEmailsMs),
  hourlyLimit: z.number().int().min(1).default(env.defaultMaxEmailsPerHour),
});

/**
 * Creates a batch + one EmailJob row per recipient, spacing each
 * recipient's `scheduledAt` by `delayMs` starting at `startTime` so the
 * dashboard shows a distinct, ordered scheduled time per row even before
 * the hourly cap logic kicks in. Every row is enqueued into BullMQ as a
 * delayed job right away — delivery order under the hourly cap is then
 * enforced by the worker (see rateLimiter.ts).
 */
export async function createBatch(req: AuthedRequest, res: Response) {
  const parsed = composeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { subject, body, senderEmail, recipients, startTime, delayMs, hourlyLimit } = parsed.data;

  if (!listConfiguredSenders().includes(senderEmail)) {
    return res.status(400).json({
      error: `"${senderEmail}" is not a configured sender. Add it to ETHEREAL_SENDERS in the backend .env.`,
    });
  }

  const owner = req.user!.email;
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return res.status(400).json({ error: "startTime is not a valid date" });
  }

  const batch = await prisma.batch.create({
    data: {
      ownerEmail: owner,
      subject,
      body,
      startTime: start,
      delayMs,
      hourlyLimit,
      senderEmail,
      totalRecipients: recipients.length,
    },
  });

  const rows = [];
  for (let i = 0; i < recipients.length; i++) {
    const scheduledAt = new Date(start.getTime() + i * delayMs);
    rows.push({
      batchId: batch.id,
      senderEmail,
      recipient: recipients[i],
      subject,
      body,
      scheduledAt,
    });
  }

  await prisma.emailJob.createMany({ data: rows });
  const created = await prisma.emailJob.findMany({ where: { batchId: batch.id } });

  // Enqueue sequentially to preserve relative ordering in the queue.
  for (const row of created) {
    await enqueueEmailJob(row, hourlyLimit);
  }

  res.status(201).json({ batchId: batch.id, scheduled: created.length });
}

export async function listScheduled(req: AuthedRequest, res: Response) {
  const rows = await prisma.emailJob.findMany({
    where: {
      status: { in: ["SCHEDULED", "QUEUED", "PROCESSING", "RESCHEDULED"] },
      batch: { ownerEmail: req.user!.email },
    },
    orderBy: { scheduledAt: "asc" },
    take: 500,
  });
  res.json({ items: rows });
}

export async function listSent(req: AuthedRequest, res: Response) {
  const rows = await prisma.emailJob.findMany({
    where: {
      status: { in: ["SENT", "FAILED"] },
      batch: { ownerEmail: req.user!.email },
    },
    orderBy: { sentAt: "desc" },
    take: 500,
  });
  res.json({ items: rows });
}
