import "dotenv/config";
import { z } from "zod";

const senderSchema = z.object({
  email: z.string().email(),
  user: z.string().min(1),
  pass: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
});

const rawEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().nonnegative().default(2000),
  DEFAULT_MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive().default(200),

  ETHEREAL_SENDERS: z.string().default("[]"),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
});

function parseEnv() {
  const result = rawEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  let senders: z.infer<typeof senderSchema>[] = [];
  try {
    const parsedJson = JSON.parse(result.data.ETHEREAL_SENDERS);
    senders = z.array(senderSchema).parse(parsedJson);
  } catch (e) {
    console.error("ETHEREAL_SENDERS is not valid JSON matching the expected sender shape.");
    console.error(`  ${(e as Error).message}`);
    process.exit(1);
  }

  return { ...result.data, senders };
}

const parsed = parseEnv();

export type SenderConfig = z.infer<typeof senderSchema>;

export const env = {
  port: parsed.PORT,
  frontendOrigin: parsed.FRONTEND_ORIGIN,

  databaseUrl: parsed.DATABASE_URL,

  redisHost: parsed.REDIS_HOST,
  redisPort: parsed.REDIS_PORT,
  redisPassword: parsed.REDIS_PASSWORD,

  workerConcurrency: parsed.WORKER_CONCURRENCY,
  minDelayBetweenEmailsMs: parsed.MIN_DELAY_BETWEEN_EMAILS_MS,
  defaultMaxEmailsPerHour: parsed.DEFAULT_MAX_EMAILS_PER_HOUR,

  senders: parsed.senders,

  googleClientId: parsed.GOOGLE_CLIENT_ID,
};
