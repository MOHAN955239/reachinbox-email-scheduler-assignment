# ReachInbox Scheduler

A production-grade email job scheduler + dashboard: schedule cold-email
sends at scale, backed by BullMQ delayed jobs (no cron), with per-sender
hourly rate limiting, configurable worker concurrency, crash-safe
persistence, and a Next.js dashboard with real Google login.

```
reachinbox-scheduler/
├── backend/     Express + TypeScript API + BullMQ worker
├── frontend/    Next.js dashboard (Google OAuth via NextAuth)
└── docker-compose.yml   Redis + Postgres + backend + worker
```

## 1. Running it

### Fastest path (Docker for infra, Node locally)

```bash
# 1. Start Redis + Postgres only
docker compose up -d redis postgres

# 2. Backend
cd backend
cp .env.example .env        # fill in ETHEREAL_SENDERS + GOOGLE_CLIENT_ID (see below)
npm install
npx prisma migrate dev --name init
npm run dev                 # API on :4000
# in a second terminal:
npm run worker              # BullMQ worker process

# 3. Frontend
cd ../frontend
cp .env.example .env.local  # fill in Google OAuth + NEXTAUTH_SECRET
npm install
npm run dev                 # dashboard on :3000
```

### Fully dockerized

```bash
docker compose up --build
```
Fill in `backend/.env` and `frontend/.env.local` first — the compose file
passes each through via `env_file`. Postgres/Redis/the API all have
healthchecks, and `backend`/`worker` wait on `service_healthy` before
starting, so a cold `docker compose up` comes up in the right order
without manual retries.

### Restart-survival test (what the demo video shows)

1. Schedule a batch a few minutes out.
2. Stop the worker (`Ctrl+C`, or `docker compose stop worker`).
3. Confirm nothing sends while it's down.
4. Start the worker again — the same delayed jobs are still sitting in
   Redis (persisted via `--appendonly yes`), so sends resume at the
   correct time, and nothing is re-sent from scratch (see §3, Idempotency).

## 2. Ethereal Email setup

Ethereal is a fake SMTP catcher — nothing actually leaves their servers.

1. Go to https://ethereal.email/create and generate one or more test
   accounts (do this once per "sender" you want to simulate — the
   assignment requires supporting multiple senders).
2. Put them in `backend/.env` as `ETHEREAL_SENDERS`, e.g.:
   ```
   ETHEREAL_SENDERS=[{"email":"sender1@ethereal.email","user":"sender1@ethereal.email","pass":"abc123","host":"smtp.ethereal.email","port":587},{"email":"sender2@ethereal.email","user":"sender2@ethereal.email","pass":"def456","host":"smtp.ethereal.email","port":587}]
   ```
3. `GET /api/senders` (used by the Compose modal's sender dropdown) just
   echoes the `email` field of each entry.
4. After a send, check the worker logs — every send logs Nodemailer's
   Ethereal preview URL, which opens the actual rendered email in a browser.

## 3. Architecture

### How scheduling works (no cron)
Every recipient in a Compose batch becomes one `EmailJob` row in Postgres
**and** one BullMQ *delayed* job in Redis (`emailQueue.add(..., { delay })`).
BullMQ computes the delay from `scheduledAt - now()` and holds the job in a
Redis-backed delayed set; it promotes the job to the wait queue exactly when
the delay elapses. There is no polling loop and no `node-cron`/OS cron
anywhere — the "when" is entirely owned by BullMQ/Redis.

### Idempotency
The Postgres row's own `id` is reused as the BullMQ `jobId`. BullMQ
de-dupes on `jobId` at the Redis level, so calling "enqueue" twice for the
same row (from the API, or from the reconciliation pass below racing it) is
a no-op the second time. The worker also checks `EmailJob.status === "SENT"`
before sending, as a second, DB-level guard against ever double-sending.

### Persistence across restarts
Two independent layers:
- **Redis persistence** — `docker-compose.yml` runs Redis with
  `--appendonly yes`, so the delayed-job set itself survives a container
  restart, not just a process restart.
- **Reconciliation pass** (`backend/src/queue/reconcile.ts`) — runs once on
  API startup and then every 5 minutes via `setInterval` (deliberately not
  a cron library — it doesn't schedule *sends*, it only re-attaches DB rows
  to the queue). It finds any `EmailJob` still `SCHEDULED`/`RESCHEDULED`
  whose BullMQ job is missing or dead (e.g. the process crashed between
  `INSERT` and `queue.add()`, or Redis data was lost independently of
  Postgres) and re-enqueues it under the same `jobId`. Because it's
  idempotent, running it redundantly is always safe.

Net effect: Postgres is the durable source of truth for *what* needs to be
sent and its current status; Redis/BullMQ is the durable source of truth
for *when* it fires next; the two are reconciled automatically if they ever
drift apart.

### Worker concurrency
`WORKER_CONCURRENCY` (env) is passed straight to `new Worker(..., {
concurrency })`. Each worker process runs up to that many jobs in parallel;
you can also run multiple worker processes/containers for horizontal
scaling — none of the correctness logic below assumes a single process.

### Minimum delay between sends
Implemented via BullMQ's built-in queue-wide `limiter: { max: 1, duration:
MIN_DELAY_BETWEEN_EMAILS_MS }` option on the `Worker`. This is enforced by
BullMQ in Redis, so it holds even across multiple worker processes sharing
the same queue — not just within one process. Default: 2000ms.

### Hourly rate limiting (per sender)
A Lua script (`backend/src/queue/rateLimiter.ts`) does an atomic
"read-count, and if under the cap, increment" against a Redis key
`ratelimit:<sender>:<YYYY-MM-DDTHH>` with a ~1hr TTL. Atomicity via Lua
means two workers racing for the last slot in a window can't both win —
critical since concurrency > 1 and multiple worker processes are both
explicitly supported. Trade-off: this is a fixed-hour window (resets on
the clock hour), not a rolling 60-minute window — simpler to reason about
and cheap to compute, at the cost of allowing a short burst right at a
window boundary.

**When the cap is hit:** the in-flight BullMQ job (same `jobId` — no
duplication) is moved to the next hour boundary with `job.moveToDelayed()`
and the DB row is marked `RESCHEDULED` with an updated `scheduledAt`. It is
never dropped or hard-failed. Because jobs are processed in roughly FIFO
order per queue and each capped job is pushed to the very next window,
relative order is preserved across the reschedule as closely as BullMQ's
scheduling allows.

**1000+ emails scheduled at once:** all 1000 `EmailJob` rows + BullMQ jobs
are created immediately (cheap, no sending happens at creation time). As
the worker pool pulls jobs, the rate limiter admits up to `hourlyLimit`
per sender per hour and pushes the rest one window at a time until they've
all drained — no manual batching logic needed on the API side.

### Auth
Google sign-in happens entirely in the frontend via NextAuth's Google
provider. The backend has no NextAuth dependency and never sees a NextAuth
session cookie — instead, the frontend forwards the raw Google **ID token**
on every API call (`Authorization: Bearer <id_token>`), and the backend
verifies it directly against Google using `google-auth-library`
(`GOOGLE_CLIENT_ID` must match on both sides). This keeps the two apps
loosely coupled and means the backend's auth would work identically behind
any other Google-token-issuing frontend.

## 4. Features implemented

**Backend**
- [x] Scheduling via BullMQ delayed jobs (no cron)
- [x] MySQL/Postgres persistence (Postgres + Prisma) for all batches/jobs
- [x] Ethereal SMTP sending, multiple configurable senders
- [x] Survives restarts: Redis AOF persistence + reconciliation pass
- [x] Idempotent sends: `jobId` = DB row id, DB-status guard in the worker
- [x] Configurable worker concurrency (`WORKER_CONCURRENCY`)
- [x] Configurable minimum delay between sends (BullMQ `limiter`)
- [x] Configurable, Redis-backed per-sender hourly rate limit, safe across
      multiple worker processes
- [x] Over-limit jobs rescheduled into the next hour window, never dropped
- [x] CSV/TXT lead upload + parsing endpoint

**Frontend**
- [x] Real Google OAuth login (NextAuth), redirect to dashboard
- [x] Header with name/email/avatar + logout
- [x] Scheduled Emails / Sent Emails tabs
- [x] Compose modal: subject, body, sender, CSV upload with detected
      count, start time, delay, hourly limit
- [x] Tables with loading and empty states for both tabs
- [x] TypeScript throughout, typed API responses/props, reusable
      components (`Header`, `StatusBadge`, `ScheduledTable`, `SentTable`,
      `ComposeModal`)

## 5. Code quality / robustness notes

- **Async error handling**: Express 4 doesn't forward rejected promises to
  the error middleware on its own, so every controller is wrapped in
  `middleware/asyncHandler.ts`. Combined with the centralized handler in
  `app.ts`, no route can hang or leak a raw stack trace on failure.
- **Graceful shutdown**: `server.ts` handles `SIGTERM`/`SIGINT`, stops
  accepting new connections, disconnects Prisma, and force-exits after 10s
  if anything hangs — matters when this runs in Docker/Kubernetes, which
  sends `SIGTERM` on every deploy/restart.
- **Request logging**: a small dependency-free middleware logs
  `METHOD path status Xms` for every request.
- **Sender validation**: `createBatch` rejects a `senderEmail` that isn't
  in `ETHEREAL_SENDERS` up front, instead of failing later inside the
  worker where it's harder to surface to the user.
- **Tests**: `backend/src/__tests__/parseLeads.test.ts` covers the CSV/TXT
  lead-parsing logic (one-per-line, CSV column, dedup/lowercasing, empty
  input) using Node's built-in test runner — `npm test` inside `backend/`.
- **Frontend DRY**: `components/ui/DataTable.tsx` is a single generic table
  (columns + rows + loading/empty state) that both `ScheduledTable` and
  `SentTable` configure rather than duplicating markup. `components/ui/`
  also has shared `Button`, `Field`/`Input`/`Textarea`/`Select` primitives
  used across the header, dashboard, and compose modal.
- **Toast-based error handling**: `components/ui/Toast.tsx` is a small
  context provider (mounted once in `Providers.tsx`) that any component
  calls via `useToast().showError(...)` / `showSuccess(...)` — used for
  dashboard load failures and batch scheduling results, per the
  "loading indicators / empty states / error handling" requirement.
- **Env validation**: `backend/src/config/env.ts` validates every env var
  (including the shape of each `ETHEREAL_SENDERS` entry) with Zod at
  startup and exits with a readable list of what's missing/malformed,
  instead of failing confusingly deep inside a request handler later.
- **API hardening**: `helmet()` for standard security headers, plus a
  120 req/min per-IP rate limit on `/api/*` — separate from, and unrelated
  to, the per-sender *email send* rate limiting described above.
- **Full Docker setup**: `frontend/Dockerfile` (multi-stage) joins
  `backend/Dockerfile` in `docker-compose.yml`, which now also declares
  healthchecks for Postgres/Redis/the API and has `backend`/`worker` wait
  on `service_healthy` rather than just container-start.
- **CI**: `.github/workflows/ci.yml` runs `prisma generate` + typecheck +
  `npm test` for the backend and a typecheck for the frontend on every
  push/PR.
- **API reference**: see [`API.md`](./API.md) for every endpoint, request/
  response shapes, and the two independent rate limits in play.

## 6. Assumptions, shortcuts, trade-offs

- No Figma link was included in the assignment doc provided, so the
  dashboard layout (header, tab bar, compose modal, tables) is an
  original implementation of the described requirements rather than a
  pixel-match to a design file. Swap in exact spacing/colors easily by
  editing `tailwind.config.ts` and the component classNames.
- Ownership scoping: `Batch.ownerEmail` / dashboard queries are scoped to
  the logged-in Google account, so each user only sees their own batches.
- Rate limiting uses fixed clock-hour windows rather than a sliding
  window, as noted above — a documented, deliberate simplification.
- Dashboard refresh is 10s polling rather than websockets/SSE, which is
  simpler and sufficient at the scale described here.
- `EmailJob.recipient` uniqueness isn't enforced across batches — sending
  the same address in two different batches is allowed by design (they're
  different campaigns); idempotency is per-row (per `EmailJob.id`), not
  per-recipient.
- Prisma's engine binaries couldn't be fetched in the sandbox this was
  built in (network policy blocks `binaries.prisma.sh`), so
  `npx prisma generate` / `migrate dev` haven't been run end-to-end here —
  they will work normally in a standard dev environment with internet
  access. Everything else was verified in-sandbox: `npm install` for both
  packages, `npx tsc --noEmit` passes clean on the frontend, and
  `npm test` (5/5) passes on the backend's pure-logic unit tests.
