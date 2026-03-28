import { Request, Response, NextFunction } from "express";
import { Db } from "mongodb";

const MAX_PINS_PER_DAY = 3;

export function pinRateLimit(req: Request, res: Response, next: NextFunction) {
  const db = req.app.locals.db as Db;
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  db.collection("pins")
    .countDocuments({ ip, createdAt: { $gte: oneDayAgo } })
    .then((count) => {
      if (count >= MAX_PINS_PER_DAY) {
        res.status(429).json({
          error: `Максимум ${MAX_PINS_PER_DAY} пина в сутки. Попробуй завтра!`,
        });
        return;
      }
      next();
    })
    .catch((err) => {
      console.error("Rate limit check failed:", err);
      next();
    });
}
