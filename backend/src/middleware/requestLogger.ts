import { Request, Response, NextFunction } from "express";

/**
 * Deliberately dependency-free (no morgan) — this is a small enough surface
 * that pulling in a logging library isn't worth it, and it keeps the
 * request/response line format easy to grep in container logs.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}
