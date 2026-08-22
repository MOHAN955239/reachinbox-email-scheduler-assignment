const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Extracts unique, valid email addresses from an uploaded CSV/TXT buffer.
 * Deliberately permissive about the file's actual shape (comma-separated,
 * one-per-line, or a full CSV with an "email" column) — we just scan for
 * anything that looks like an email address.
 */
export function parseLeadsFile(buffer: Buffer): string[] {
  const text = buffer.toString("utf-8");
  const matches = text.match(EMAIL_RE) ?? [];
  const unique = Array.from(new Set(matches.map((e) => e.trim().toLowerCase())));
  return unique;
}
