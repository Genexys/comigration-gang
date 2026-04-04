import { timingSafeEqual } from "crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const maxLen = Math.max(bufA.length, bufB.length);
  const padA = Buffer.alloc(maxLen);
  const padB = Buffer.alloc(maxLen);
  bufA.copy(padA);
  bufB.copy(padB);
  return bufA.length === bufB.length && timingSafeEqual(padA, padB);
}

// Brute-force lockout: track failed attempts per IP
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILED = 5;
const LOCKOUT_MS = 15 * 60_000; // 15 min lockout after 5 failures

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of failedAttempts) {
    if (now > val.lockedUntil) failedAttempts.delete(key);
  }
}, 5 * 60_000).unref();

export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return c.json({ error: "Admin password not configured" }, 500);
  }

  const ip = c.get("clientIp");

  // Check lockout
  const record = failedAttempts.get(ip);
  if (record && record.count >= MAX_FAILED && Date.now() < record.lockedUntil) {
    return c.json({ error: "Too many failed attempts. Try again later." }, 429);
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader || !safeCompare(authHeader, `Bearer ${adminPass}`)) {
    // Track failed attempt
    const entry = failedAttempts.get(ip) || { count: 0, lockedUntil: 0 };
    entry.count++;
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    failedAttempts.set(ip, entry);
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Successful auth — clear failed attempts
  failedAttempts.delete(ip);
  await next();
};
