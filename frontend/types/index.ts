export type EmailStatus =
  | "SCHEDULED"
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "RESCHEDULED";

export interface EmailJobRow {
  id: string;
  batchId: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  status: EmailStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
}

export interface ComposePayload {
  subject: string;
  body: string;
  senderEmail: string;
  recipients: string[];
  startTime: string;
  delayMs: number;
  hourlyLimit: number;
}
