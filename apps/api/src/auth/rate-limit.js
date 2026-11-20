import { rateLimit } from "express-rate-limit";

export function authRateLimit(maxRequests, windowMs) {
  return rateLimit({
    windowMs,
    limit: maxRequests,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({ error: "Too many attempts. Please try again later." });
    },
  });
}
