import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";

const MAX_PINS_PER_DAY = 3;

export const pinRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = c.get("db");
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const count = await db
      .collection("pins")
      .countDocuments({ ip, createdAt: { $gte: oneDayAgo } });

    if (count >= MAX_PINS_PER_DAY) {
      return c.json(
        { error: `Максимум ${MAX_PINS_PER_DAY} пина в сутки. Попробуй завтра!` },
        429
      );
    }
  } catch (err) {
    console.error("Rate limit check failed:", err);
  }

  await next();
};
