import { Router, Request, Response } from "express";
import { ObjectId, Db, Collection } from "mongodb";
import { PinDoc } from "../models/Pin.js";
import { adminAuth } from "../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(adminAuth);

function pins(req: Request): Collection<PinDoc> {
  return (req.app.locals.db as Db).collection<PinDoc>("pins");
}

// GET /api/admin/pins — all pins WITH ip, pagination, search, date filter
adminRouter.get("/pins", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim() || "";
    const dateFilter = (req.query.date as string) || "all";

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
      pins(req).find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      pins(req).countDocuments(filter),
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

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("GET /api/admin/pins error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/admin/pins/:id
adminRouter.delete("/pins/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const result = await pins(req).deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Pin not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/pins error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/admin/pins/:id/ban-ip — ban the IP of a pin
adminRouter.post("/pins/:id/ban-ip", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }

    const db = req.app.locals.db as Db;
    const pin = await pins(req).findOne({ _id: new ObjectId(id) });
    if (!pin) {
      res.status(404).json({ error: "Pin not found" });
      return;
    }

    await db.collection("banned_ips").updateOne(
      { ip: pin.ip },
      { $set: { ip: pin.ip, bannedAt: new Date(), reason: `Banned via pin ${id}` } },
      { upsert: true }
    );

    // Delete all pins from this IP
    const deleteResult = await pins(req).deleteMany({ ip: pin.ip });

    res.json({ ok: true, ip: pin.ip, deletedPins: deleteResult.deletedCount });
  } catch (err) {
    console.error("POST /api/admin/ban-ip error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
