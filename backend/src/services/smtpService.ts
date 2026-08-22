import nodemailer, { Transporter } from "nodemailer";
import { env, SenderConfig } from "../config/env";

const transporterCache = new Map<string, Transporter>();

function findSenderConfig(senderEmail: string): SenderConfig {
  const cfg = env.senders.find((s) => s.email === senderEmail);
  if (!cfg) {
    throw new Error(
      `No SMTP config found for sender "${senderEmail}". Add it to ETHEREAL_SENDERS in .env`
    );
  }
  return cfg;
}

function getTransporter(senderEmail: string): Transporter {
  const cached = transporterCache.get(senderEmail);
  if (cached) return cached;

  const cfg = findSenderConfig(senderEmail);
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  transporterCache.set(senderEmail, transporter);
  return transporter;
}

export async function sendEmail(opts: {
  senderEmail: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ messageId: string; previewUrl: string | false }> {
  const transporter = getTransporter(opts.senderEmail);
  const info = await transporter.sendMail({
    from: opts.senderEmail,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
  };
}

export function listConfiguredSenders(): string[] {
  return env.senders.map((s) => s.email);
}
