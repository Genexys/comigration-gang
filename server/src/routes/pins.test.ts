import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { pinsRouter, invalidatePinsCache } from "./pins.js";

// ── MongoDB mock ──────────────────────────────────────────────────────────────
const mockPins: Record<string, unknown>[] = [];

const mockCollection = {
  find: vi.fn(() => ({
    sort: vi.fn().mockReturnThis(),
    toArray: vi.fn(async () => mockPins),
  })),
  findOne: vi.fn(async () => null),
  insertOne: vi.fn(async (doc: Record<string, unknown>) => {
    const id = { toString: () => "test-id-123" };
    doc._id = id;
    mockPins.push(doc);
    return { insertedId: id };
  }),
  countDocuments: vi.fn(async () => mockPins.length),
};

const mockDb = {
  collection: vi.fn(() => mockCollection),
};

// Helper to build the test app
function makeApp(env: Record<string, string> = {}) {
  Object.assign(process.env, { TURNSTILE_SECRET: "disabled", ...env });
  const app = express();
  app.use(express.json());
  app.locals.db = mockDb;
  app.use("/api/pins", pinsRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("GET /api/pins", () => {
  beforeEach(() => {
    mockPins.length = 0;
    vi.clearAllMocks();
    invalidatePinsCache(); // clear module-level cache between tests
    mockCollection.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn(async () => mockPins),
    });
  });

  it("returns 200 and an array", async () => {
    const app = makeApp();
    const res = await request(app).get("/api/pins");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("does not expose ip field", async () => {
    mockPins.push({
      _id: { toString: () => "abc" },
      nickname: "Тест",
      city: "Москва",
      lat: 55.7,
      lng: 37.6,
      createdAt: new Date(),
      ip: "1.2.3.4",
    });
    mockCollection.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn(async () => mockPins),
    });
    const app = makeApp();
    const res = await request(app).get("/api/pins");
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("ip");
  });
});

describe("POST /api/pins", () => {
  const validPin = {
    nickname: "Тестер",
    city: "Москва",
    lat: 55.75,
    lng: 37.61,
    comment: "Привет!",
  };

  beforeEach(() => {
    mockPins.length = 0;
    vi.clearAllMocks();
    invalidatePinsCache();
    mockCollection.findOne.mockResolvedValue(null); // not banned, no duplicate
    mockCollection.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn(async () => mockPins),
    });
  });

  it("creates a pin and returns 201", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send(validPin);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nickname: "Тестер", city: "Москва" });
  });

  it("does not return ip in response", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send(validPin);
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("ip");
  });

  it("rejects nickname shorter than 2 chars", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send({ ...validPin, nickname: "A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nickname/);
  });

  it("rejects nickname longer than 30 chars", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send({
      ...validPin,
      nickname: "A".repeat(31),
    });
    expect(res.status).toBe(400);
  });

  it("rejects invalid lat", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send({ ...validPin, lat: 999 });
    expect(res.status).toBe(400);
  });

  it("rejects invalid lng", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send({ ...validPin, lng: -999 });
    expect(res.status).toBe(400);
  });

  it("strips HTML from nickname", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/pins")
      .send({ ...validPin, nickname: "<script>alert(1)</script>Тест" });
    expect(res.status).toBe(201);
    expect(res.body.nickname).not.toContain("<script>");
    expect(res.body.nickname).toContain("Тест");
  });

  it("rejects banned IP", async () => {
    mockCollection.findOne.mockResolvedValueOnce({ ip: "5.5.5.5" }); // ban found
    const app = makeApp();
    const res = await request(app).post("/api/pins").send(validPin);
    expect(res.status).toBe(403);
  });

  it("rejects duplicate pin in same area within 24h", async () => {
    mockCollection.findOne
      .mockResolvedValueOnce(null) // not banned
      .mockResolvedValueOnce({ _id: "existing", lat: 55.75, lng: 37.61 }); // duplicate
    const app = makeApp();
    const res = await request(app).post("/api/pins").send(validPin);
    expect(res.status).toBe(409);
  });

  it("rejects profanity in nickname", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send({ ...validPin, nickname: "хуйня123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/недопустим/);
  });

  it("rejects profanity in comment", async () => {
    const app = makeApp();
    const res = await request(app).post("/api/pins").send({ ...validPin, comment: "всё пиздец" });
    expect(res.status).toBe(400);
  });

  it("truncates comment at 200 chars", async () => {
    const app = makeApp();
    const longComment = "А".repeat(300);
    const res = await request(app).post("/api/pins").send({ ...validPin, comment: longComment });
    expect(res.status).toBe(201);
    expect(res.body.comment.length).toBeLessThanOrEqual(200);
  });
});
