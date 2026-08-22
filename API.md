# API Reference

Base URL: `http://localhost:4000` (dev) — every route below except
`/health` requires `Authorization: Bearer <google-id-token>`.

---

### `GET /health`
No auth. Liveness check.

```json
{ "ok": true }
```

---

### `GET /api/senders`
Lists the sender addresses configured via `ETHEREAL_SENDERS`.

```json
{ "senders": ["sender1@ethereal.email", "sender2@ethereal.email"] }
```

---

### `POST /api/leads/upload`
`multipart/form-data`, field name `file` — a CSV or TXT file. Returns every
email address found in it (deduplicated, lowercased).

```json
{ "count": 2, "emails": ["alice@example.com", "bob@example.com"] }
```

---

### `POST /api/batches`
Creates a batch and schedules one email per recipient.

Request body:
```json
{
  "subject": "Quick question",
  "body": "<p>Hi there</p>",
  "senderEmail": "sender1@ethereal.email",
  "recipients": ["alice@example.com", "bob@example.com"],
  "startTime": "2026-08-21T10:00:00.000Z",
  "delayMs": 2000,
  "hourlyLimit": 200
}
```

- `senderEmail` must be one of the addresses returned by `GET /api/senders`.
- `recipients` must be a non-empty array of valid emails.
- `startTime` is an ISO-8601 datetime; each subsequent recipient is spaced
  `delayMs` after the previous one.

Response (`201`):
```json
{ "batchId": "b1f0...", "scheduled": 2 }
```

Validation errors return `400` with a Zod-shaped `error` field.

---

### `GET /api/emails/scheduled`
Returns up to 500 of the caller's own not-yet-sent rows
(`SCHEDULED` / `QUEUED` / `PROCESSING` / `RESCHEDULED`), oldest scheduled
time first.

```json
{ "items": [ { "id": "...", "recipient": "...", "subject": "...", "scheduledAt": "...", "status": "QUEUED", ... } ] }
```

---

### `GET /api/emails/sent`
Returns up to 500 of the caller's own terminal rows (`SENT` / `FAILED`),
most recently sent first.

```json
{ "items": [ { "id": "...", "recipient": "...", "subject": "...", "sentAt": "...", "status": "SENT", ... } ] }
```

---

## Error shape

Every non-2xx response is:
```json
{ "error": "message" }
```
or, for Zod validation failures:
```json
{ "error": { "fieldErrors": { "recipients": ["..."] }, "formErrors": [] } }
```

## Rate limits

- **Per-IP API limit**: 120 requests/minute on `/api/*` (protects the
  service itself — see `app.ts`).
- **Per-sender email send limit**: configurable via `hourlyLimit` per
  batch, enforced inside the worker (see README §3, "Hourly rate
  limiting"). Unrelated to the HTTP rate limit above.
