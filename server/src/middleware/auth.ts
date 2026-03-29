import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

export const adminAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    return c.json({ error: "Admin password not configured" }, 500);
  }

  const authHeader = c.req.header("authorization");
  if (!authHeader || authHeader !== `Bearer ${adminPass}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
};
