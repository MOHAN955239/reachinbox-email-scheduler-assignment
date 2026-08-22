import { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Express 4 does not forward a rejected promise from an async handler to
 * the error middleware automatically — an uncaught rejection there just
 * hangs the request. Wrapping every async controller in this keeps
 * app.ts's centralized error handler as the single place that turns any
 * thrown error into a clean JSON response.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    // Promise.resolve() so this works whether fn is sync or async.
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
