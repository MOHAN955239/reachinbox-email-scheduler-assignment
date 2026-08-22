import { redisConnection } from "./connection";

/**
 * Hourly send-rate limiter, backed by Redis INCR counters keyed by
 * `sender + hour-window`. This is intentionally NOT in-memory: multiple
 * worker processes (or multiple instances of the same process) all hit the
 * same Redis counter, so the cap is enforced correctly regardless of how
 * many workers are running.
 *
 * We use a Lua script so "increment and read" happens atomically — two
 * workers racing to send the last allowed email in a window can't both
 * succeed.
 */

const LUA_TRY_CONSUME = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

local current = redis.call("GET", key)
if current == false then
  redis.call("SET", key, 1, "EX", ttl)
  return 1
end

current = tonumber(current)
if current < limit then
  redis.call("INCR", key)
  return 1
end

return 0
`;

function hourWindowKey(sender: string, date: Date): string {
  // e.g. ratelimit:sender1@ethereal.email:2026-08-21T14
  const bucket = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `ratelimit:${sender}:${bucket}`;
}

/** Returns true if the send was "admitted" under the cap (and counted). */
export async function tryConsumeQuota(sender: string, limit: number): Promise<boolean> {
  const key = hourWindowKey(sender, new Date());
  // Key expires after the hour window passes; small buffer so a slow eval
  // doesn't drop the key mid-window.
  const result = await redisConnection.eval(LUA_TRY_CONSUME, 1, key, limit, 3700);
  return result === 1;
}

/** Milliseconds until the next hour boundary, i.e. the next open window. */
export function msUntilNextHourWindow(): number {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime() - now.getTime();
}
