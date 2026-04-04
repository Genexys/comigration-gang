import { timingSafeEqual } from "crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Pad to same length to avoid leaking length via timing
  const maxLen = Math.max(bufA.length, bufB.length);
  const padA = Buffer.alloc(maxLen);
  const padB = Buffer.alloc(maxLen);
  bufA.copy(padA);
  bufB.copy(padB);
  return bufA.length === bufB.length && timingSafeEqual(padA, padB);
}

export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return c.json({ error: "Admin password not configured" }, 500);
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader || !safeCompare(authHeader, `Bearer ${adminPass}`)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
