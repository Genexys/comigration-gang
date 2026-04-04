import { Hono } from "hono";
import type { Db, Collection } from "mongodb";
import { PinDoc, toPublic } from "../models/Pin.js";
import { pinRateLimit } from "../middleware/rateLimit.js";
import { containsProfanity } from "../utils/profanity.js";
import type { AppEnv } from "../types.js";

export const pinsRouter = new Hono<AppEnv>();

function pins(db: Db): Collection<PinDoc> {
  return db.collection<PinDoc>("pins");
}

function stripHtml(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (!secret || secret === "disabled") return true;

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
pinsRouter.get("/", async (c) => {
  try {
    const now = Date.now();
    if (cachedPins && now - cacheTime < CACHE_TTL) {
      return c.body(cachedPins, 200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" });
    }

    const db = c.get("db");
    const docs = await pins(db).find().sort({ createdAt: -1 }).toArray();
    const publicPins = docs.map(toPublic);
    cachedPins = JSON.stringify(publicPins);
    cacheTime = now;

    return c.body(cachedPins, 200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" });
  } catch (err) {
    console.error("GET /api/pins error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/pins — create pin
pinsRouter.post("/", pinRateLimit, async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);

    const { nickname, city, country, lat, lng, comment, turnstileToken } = body;

    // Validation
    if (typeof nickname !== "string" || nickname.trim().length < 2 || nickname.trim().length > 30) {
      return c.json({ error: "nickname must be 2-30 characters" }, 400);
    }
    if (typeof city !== "string" || city.trim().length === 0) {
      return c.json({ error: "city is required" }, 400);
    }
    if (typeof lat !== "number" || lat < -90 || lat > 90) {
      return c.json({ error: "lat must be between -90 and 90" }, 400);
    }
    if (typeof lng !== "number" || lng < -180 || lng > 180) {
      return c.json({ error: "lng must be between -180 and 180" }, 400);
    }
    if (typeof nickname === "string" && nickname.length > 200) {
      return c.json({ error: "Nickname too long" }, 400);
    }
    if (typeof comment === "string" && comment.length > 2000) {
      return c.json({ error: "Comment too long" }, 400);
    }
    if (typeof country === "string" && country.length > 100) {
      return c.json({ error: "Country too long" }, 400);
    }

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const db = c.get("db");

    // Check IP ban
    const banned = await db.collection("banned_ips").findOne({ ip });
    if (banned) {
      console.warn(`[SECURITY] Banned IP attempted to post: ${ip}`);
      return c.json({ error: "Доступ заблокирован" }, 403);
    }

    // Turnstile verification
    if (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SECRET !== "disabled") {
      if (!turnstileToken || typeof turnstileToken !== "string") {
        return c.json({ error: "Captcha required" }, 400);
      }
      const valid = await verifyTurnstile(turnstileToken);
      if (!valid) {
        console.warn(`[SECURITY] Turnstile failed for IP: ${ip}`);
        return c.json({ error: "Captcha verification failed" }, 400);
      }
    }

    // Deduplication: same IP, pin within ~1km in the last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nearby = await pins(db).findOne({
      ip,
      createdAt: { $gte: oneDayAgo },
      lat: { $gte: lat - DEDUP_RADIUS_DEG, $lte: lat + DEDUP_RADIUS_DEG },
      lng: { $gte: lng - DEDUP_RADIUS_DEG, $lte: lng + DEDUP_RADIUS_DEG },
    });
    if (nearby) {
      return c.json({ error: "Ты уже поставил пин в этом месте" }, 409);
    }

    // Sanitize
    const cleanNick = stripHtml(nickname).slice(0, 30);
    const cleanComment = typeof comment === "string" ? stripHtml(comment).slice(0, 200) : "";

    // Profanity filter
    if (containsProfanity(cleanNick) || containsProfanity(cleanComment)) {
      return c.json({ error: "Содержит недопустимые слова" }, 400);
    }

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

    const result = await pins(db).insertOne(doc);
    doc._id = result.insertedId;

    cachedPins = null;

    return c.json(toPublic(doc), 201);
  } catch (err) {
    console.error("POST /api/pins error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});
