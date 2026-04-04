import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { pinsRouter, invalidatePinsCache } from "./pins.js";
import type { AppEnv } from "../types.js";

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
  countDocuments: vi.fn(async () => 0),
};

const mockDb = {
  collection: vi.fn(() => mockCollection),
};

// Helper: builds a Hono app with injected mock db + pins routes
function makeApp(env: Record<string, string> = {}) {
  Object.assign(process.env, { TURNSTILE_SECRET: "disabled", ...env });

  const app = new Hono<AppEnv>();
  app.use("/*", async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.set("db", mockDb as any);
    c.set("clientIp", c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1");
    await next();
  });
  app.route("/api/pins", pinsRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("GET /api/pins", () => {
  beforeEach(() => {
    mockPins.length = 0;
    vi.clearAllMocks();
    invalidatePinsCache();
    mockCollection.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn(async () => mockPins),
    });
  });

  it("returns 200 and an array", async () => {
    const app = makeApp();
    const res = await app.request("/api/pins");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
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
    const res = await app.request("/api/pins");
    const body = await res.json();
    expect(body[0]).not.toHaveProperty("ip");
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

  function post(app: Hono, body: unknown, headers: Record<string, string> = {}) {
    return app.request("/api/pins", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockPins.length = 0;
    vi.clearAllMocks();
    invalidatePinsCache();
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.countDocuments.mockResolvedValue(0);
    mockCollection.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      toArray: vi.fn(async () => mockPins),
    });
  });

  it("creates a pin and returns 201", async () => {
    const app = makeApp();
    const res = await post(app, validPin);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ nickname: "Тестер", city: "Москва" });
  });

  it("does not return ip in response", async () => {
    const app = makeApp();
    const res = await post(app, validPin);
    const body = await res.json();
    expect(body).not.toHaveProperty("ip");
  });

  it("rejects nickname shorter than 2 chars", async () => {
    const res = await post(makeApp(), { ...validPin, nickname: "A" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/nickname/);
  });

  it("rejects nickname longer than 30 chars", async () => {
    const res = await post(makeApp(), { ...validPin, nickname: "A".repeat(31) });
    expect(res.status).toBe(400);
  });

  it("rejects invalid lat", async () => {
    const res = await post(makeApp(), { ...validPin, lat: 999 });
    expect(res.status).toBe(400);
  });

  it("rejects invalid lng", async () => {
    const res = await post(makeApp(), { ...validPin, lng: -999 });
    expect(res.status).toBe(400);
  });

  it("strips HTML from nickname", async () => {
    const res = await post(makeApp(), { ...validPin, nickname: "<script>alert(1)</script>Тест" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.nickname).not.toContain("<script>");
    expect(body.nickname).toContain("Тест");
  });

  it("rejects banned IP", async () => {
    mockCollection.findOne.mockResolvedValueOnce({ ip: "5.5.5.5" });
    const res = await post(makeApp(), validPin, { "x-forwarded-for": "5.5.5.5" });
    expect(res.status).toBe(403);
  });

  it("rejects duplicate pin in same area within 24h", async () => {
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ _id: "existing", lat: 55.75, lng: 37.61 });
    const res = await post(makeApp(), validPin);
    expect(res.status).toBe(409);
  });

  it("rejects profanity in nickname", async () => {
    const res = await post(makeApp(), { ...validPin, nickname: "хуйня123" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/недопустим/);
  });

  it("rejects profanity in comment", async () => {
    const res = await post(makeApp(), { ...validPin, comment: "всё пиздец" });
    expect(res.status).toBe(400);
  });

  it("truncates comment at 200 chars", async () => {
    const res = await post(makeApp(), { ...validPin, comment: "А".repeat(300) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.comment.length).toBeLessThanOrEqual(200);
  });

  it("enforces rate limit of 3 pins per day", async () => {
    mockCollection.countDocuments.mockResolvedValue(3);
    const res = await post(makeApp(), validPin);
    expect(res.status).toBe(429);
  });
});
