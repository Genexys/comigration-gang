import { Router, Request, Response } from "express";
import { Db, Collection } from "mongodb";
import { PinDoc, toPublic } from "../models/Pin.js";
import { pinRateLimit } from "../middleware/rateLimit.js";

export const pinsRouter = Router();

function pins(req: Request): Collection<PinDoc> {
  return (req.app.locals.db as Db).collection<PinDoc>("pins");
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// ~1km in degrees (approx)
const DEDUP_RADIUS_DEG = 0.009;

// Simple in-memory cache for GET /api/pins
let cachedPins: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

export function invalidatePinsCache() {
  cachedPins = null;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret || secret === "disabled") return true; // skip if not configured

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    console.error("Turnstile verification failed");
    return false;
  }
}

// GET /api/pins — all pins (without ip)
pinsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (cachedPins && now - cacheTime < CACHE_TTL) {
      res.setHeader("Content-Type", "application/json");
      res.send(cachedPins);
      return;
    }

    const docs = await pins(req).find().sort({ createdAt: -1 }).toArray();
    const publicPins = docs.map(toPublic);
    cachedPins = JSON.stringify(publicPins);
    cacheTime = now;

    res.setHeader("Content-Type", "application/json");
    res.send(cachedPins);
  } catch (err) {
    console.error("GET /api/pins error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/pins — create pin
pinsRouter.post("/", pinRateLimit, async (req: Request, res: Response) => {
  try {
    const { nickname, city, country, lat, lng, comment, turnstileToken } = req.body;

    // Validation
    if (typeof nickname !== "string" || nickname.trim().length < 2 || nickname.trim().length > 30) {
      res.status(400).json({ error: "nickname must be 2-30 characters" });
      return;
    }
    if (typeof city !== "string" || city.trim().length === 0) {
      res.status(400).json({ error: "city is required" });
      return;
    }
    if (typeof lat !== "number" || lat < -90 || lat > 90) {
      res.status(400).json({ error: "lat must be between -90 and 90" });
      return;
    }
    if (typeof lng !== "number" || lng < -180 || lng > 180) {
      res.status(400).json({ error: "lng must be between -180 and 180" });
      return;
    }

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    const db = req.app.locals.db as Db;

    // Check IP ban — log attempts
    const banned = await db.collection("banned_ips").findOne({ ip });
    if (banned) {
      console.warn(`[SECURITY] Banned IP attempted to post: ${ip}`);
      res.status(403).json({ error: "Доступ заблокирован" });
      return;
    }

    // Turnstile verification
    if (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SECRET !== "disabled") {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        res.status(400).json({ error: "Captcha required" });
        return;
      }
      const valid = await verifyTurnstile(turnstileToken);
      if (!valid) {
        console.warn(`[SECURITY] Turnstile failed for IP: ${ip}`);
        res.status(400).json({ error: "Captcha verification failed" });
        return;
      }
    }

    // Deduplication: same IP, pin within ~1km in the last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nearby = await pins(req).findOne({
      ip,
      createdAt: { $gte: oneDayAgo },
      lat: { $gte: lat - DEDUP_RADIUS_DEG, $lte: lat + DEDUP_RADIUS_DEG },
      lng: { $gte: lng - DEDUP_RADIUS_DEG, $lte: lng + DEDUP_RADIUS_DEG },
    });
    if (nearby) {
      res.status(409).json({ error: "Ты уже поставил пин в этом месте" });
      return;
    }

    // Sanitize
    const cleanNick = stripHtml(nickname).slice(0, 30);
    const cleanComment = typeof comment === "string" ? stripHtml(comment).slice(0, 200) : "";

    const doc: PinDoc = {
      nickname: cleanNick,
      city: stripHtml(city),
      country: typeof country === "string" ? stripHtml(country) : undefined,
      lat,
      lng,
      comment: cleanComment,
      createdAt: new Date(),
      ip,
    };

    const result = await pins(req).insertOne(doc);
    doc._id = result.insertedId;

    cachedPins = null;

    res.status(201).json(toPublic(doc));
  } catch (err) {
    console.error("POST /api/pins error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
