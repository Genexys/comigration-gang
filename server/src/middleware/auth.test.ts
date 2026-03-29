import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { adminAuth } from "./auth.js";

function makeApp(password?: string) {
  if (password !== undefined) {
    process.env.ADMIN_PASSWORD = password;
  } else {
    delete process.env.ADMIN_PASSWORD;
  }
  const app = express();
  app.get("/protected", adminAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("adminAuth middleware", () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it("returns 500 when ADMIN_PASSWORD is not set", async () => {
    const app = makeApp(undefined);
    const res = await request(app).get("/protected");
    expect(res.status).toBe(500);
  });

  it("returns 401 without Authorization header", async () => {
    const app = makeApp("secret123");
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong password", async () => {
    const app = makeApp("secret123");
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer wrongpassword");
    expect(res.status).toBe(401);
  });

  it("passes through with correct Bearer token", async () => {
    const app = makeApp("secret123");
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer secret123");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 401 for Basic auth instead of Bearer", async () => {
    const app = makeApp("secret123");
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Basic secret123");
    expect(res.status).toBe(401);
  });
});
