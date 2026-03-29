import { Hono } from "hono";
import { ObjectId, type Db, type Collection } from "mongodb";
import { PinDoc } from "../models/Pin.js";
import { adminAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const adminRouter = new Hono<AppEnv>();
adminRouter.use("/*", adminAuth);

function pins(db: Db): Collection<PinDoc> {
  return db.collection<PinDoc>("pins");
}

// GET /api/admin/pins — all pins WITH ip, pagination, search, date filter
adminRouter.get("/pins", async (c) => {
  try {
    const db = c.get("db");
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 50));
    const skip = (page - 1) * limit;
    const search = c.req.query("search")?.trim() || "";
    const dateFilter = c.req.query("date") || "all";

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.nickname = { $regex: search, $options: "i" };
    }

    if (dateFilter === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      filter.createdAt = { $gte: start };
    } else if (dateFilter === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      filter.createdAt = { $gte: weekAgo };
    }

    const [docs, total] = await Promise.all([
      pins(db).find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      pins(db).countDocuments(filter),
    ]);

    const items = docs.map((doc) => ({
      _id: doc._id!.toString(),
      nickname: doc.nickname,
      city: doc.city,
      country: doc.country,
      lat: doc.lat,
      lng: doc.lng,
      comment: doc.comment,
      ip: doc.ip,
      createdAt: doc.createdAt.toISOString(),
    }));

    return c.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("GET /api/admin/pins error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/admin/pins/:id
adminRouter.delete("/pins/:id", async (c) => {
  try {
    const db = c.get("db");
    const id = c.req.param("id");

    if (!ObjectId.isValid(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const result = await pins(db).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return c.json({ error: "Pin not found" }, 404);
    }

    return c.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/pins error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/admin/pins/:id/ban-ip
adminRouter.post("/pins/:id/ban-ip", async (c) => {
  try {
    const db = c.get("db");
    const id = c.req.param("id");

    if (!ObjectId.isValid(id)) {
      return c.json({ error: "Invalid ID" }, 400);
    }

    const pin = await pins(db).findOne({ _id: new ObjectId(id) });
    if (!pin) {
      return c.json({ error: "Pin not found" }, 404);
    }

    await db.collection("banned_ips").updateOne(
      { ip: pin.ip },
      { $set: { ip: pin.ip, bannedAt: new Date(), reason: `Banned via pin ${id}` } },
      { upsert: true }
    );

    const deleteResult = await pins(db).deleteMany({ ip: pin.ip });

    return c.json({ ok: true, ip: pin.ip, deletedPins: deleteResult.deletedCount });
  } catch (err) {
    console.error("POST /api/admin/ban-ip error:", err);
    return c.json({ error: "Internal server error" }, 500);
  }
});
