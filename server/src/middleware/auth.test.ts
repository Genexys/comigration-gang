import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import { adminAuth } from "./auth.js";
import type { AppEnv } from "../types.js";

function makeApp(password?: string) {
  if (password !== undefined) {
    process.env.ADMIN_PASSWORD = password;
  } else {
    delete process.env.ADMIN_PASSWORD;
  }
  const app = new Hono<AppEnv>();
  app.use("/*", async (c, next) => {
    c.set("clientIp", "127.0.0.1");
    await next();
  });
  app.use("/protected", adminAuth);
  app.get("/protected", (c) => c.json({ ok: true }));
  return app;
}

describe("adminAuth middleware", () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it("returns 500 when ADMIN_PASSWORD is not set", async () => {
    const res = await makeApp(undefined).request("/protected");
    expect(res.status).toBe(500);
  });

  it("returns 401 without Authorization header", async () => {
    const res = await makeApp("secret123").request("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong password", async () => {
    const res = await makeApp("secret123").request("/protected", {
      headers: { Authorization: "Bearer wrongpassword" },
    });
    expect(res.status).toBe(401);
  });

  it("passes through with correct Bearer token", async () => {
    const res = await makeApp("secret123").request("/protected", {
      headers: { Authorization: "Bearer secret123" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 401 for Basic auth instead of Bearer", async () => {
    const res = await makeApp("secret123").request("/protected", {
      headers: { Authorization: "Basic secret123" },
    });
    expect(res.status).toBe(401);
  });
});
