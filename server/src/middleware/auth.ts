import { timingSafeEqual } from "crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
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
