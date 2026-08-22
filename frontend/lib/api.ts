import { EmailJobRow, ComposePayload } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function authedFetch(idToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchScheduled(idToken: string): Promise<EmailJobRow[]> {
  const data = await authedFetch(idToken, "/api/emails/scheduled");
  return data.items;
}

export async function fetchSent(idToken: string): Promise<EmailJobRow[]> {
  const data = await authedFetch(idToken, "/api/emails/sent");
  return data.items;
}

export async function fetchSenders(idToken: string): Promise<string[]> {
  const data = await authedFetch(idToken, "/api/senders");
  return data.senders;
}

export async function uploadLeadsFile(idToken: string, file: File): Promise<string[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/leads/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
    body: form,
  });
  if (!res.ok) throw new Error("Failed to parse leads file");
  const data = await res.json();
  return data.emails;
}

export async function createBatch(
  idToken: string,
  payload: ComposePayload
): Promise<{ batchId: string; scheduled: number }> {
  return authedFetch(idToken, "/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
