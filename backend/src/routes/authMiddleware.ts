import { Request, Response, NextFunction } from "express";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";

const client = new OAuth2Client(env.googleClientId);

export interface AuthedRequest extends Request {
  user?: { email: string; name: string; picture?: string };
}

/**
 * The Next.js frontend signs in with NextAuth's Google provider and forwards
 * the raw Google ID token on every API call as `Authorization: Bearer <token>`.
 * We verify it here rather than trusting a self-issued session cookie, so
 * the backend has no shared-secret coupling to the frontend's auth setup.
 */
export async function requireGoogleAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization bearer token" });
  }
  const token = header.slice("Bearer ".length);

  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: env.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(401).json({ error: "Invalid token payload" });
    }
    req.user = { email: payload.email, name: payload.name ?? payload.email, picture: payload.picture };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired Google token" });
  }
}
