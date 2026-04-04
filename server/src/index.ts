import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { pinsRouter } from "./routes/pins.js";
import { adminRouter } from "./routes/admin.js";
import type { AppEnv } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MONGODB_URI = IS_PRODUCTION
  ? (process.env.MONGODB_URI ?? (() => { throw new Error("MONGODB_URI is required in production"); })())
  : (process.env.MONGODB_URI || "mongodb://localhost:27017/comigration");
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

async function start() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db();

  // TTL index: auto-delete banned_ips after 1 year
  await db.collection("banned_ips").createIndex(
    { bannedAt: 1 },
    { expireAfterSeconds: 365 * 24 * 60 * 60, background: true }
  );

  // Compound index for dedup query
  await db.collection("pins").createIndex(
    { ip: 1, createdAt: -1, lat: 1, lng: 1 },
    { background: true }
  );

  // Anonymize IPs in pins older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const anonResult = await db.collection("pins").updateMany(
    { createdAt: { $lt: thirtyDaysAgo }, ip: { $exists: true } },
    { $unset: { ip: "" } }
  );
  if (anonResult.modifiedCount > 0) {
    console.log(`Anonymized IPs for ${anonResult.modifiedCount} old pins`);
  }

  const app = new Hono<AppEnv>();

  // Inject db and client IP into every request context
  app.use("/*", async (c, next) => {
    c.set("db", db);
    // Centralized IP extraction: trust Railway/Cloudflare proxy headers
    const ip =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-real-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    c.set("clientIp", ip);
    await next();
  });

  // Body size limit
  app.use("/api/*", bodyLimit({ maxSize: 16 * 1024 })); // 16KB max

  // Security headers
  app.use(
    "/*",
    secureHeaders({
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
      },
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "challenges.cloudflare.com"],
        styleSrc: ["'self'", "fonts.googleapis.com"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "*.cartocdn.com", "*.openstreetmap.org"],
        connectSrc: ["'self'", "challenges.cloudflare.com", "nominatim.openstreetmap.org"],
        frameSrc: ["challenges.cloudflare.com"],
      },
    })
  );

  // CORS
  app.use(
    "/api/*",
    cors({
      origin: ALLOWED_ORIGIN.split(",").map((o) => o.trim()),
      allowMethods: ["GET", "POST", "DELETE"],
      maxAge: 86400,
    })
  );

  // Cache-Control headers for API responses
  app.use("/api/*", async (c, next) => {
    await next();
    if (c.req.method === "GET") {
      c.header("Cache-Control", "public, max-age=30");
    } else {
      c.header("Cache-Control", "no-store");
    }
  });

  // API routes
  app.route("/api/pins", pinsRouter);
  app.route("/api/admin", adminRouter);

  // Global API 404 handler
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  // Global error handler — prevent stack trace leaks
  app.onError((err, c) => {
    console.error("Unhandled error:", err.message);
    return c.json({ error: "Internal server error" }, 500);
  });

  // Serve client static build in production
  const clientDist = join(__dirname, "../../client/dist");
  if (existsSync(clientDist)) {
    const relRoot = relative(process.cwd(), clientDist);
    // Cache index.html in memory — avoid readFileSync on every 404
    const indexHtml = readFileSync(join(clientDist, "index.html"), "utf-8");
    app.use("/*", serveStatic({ root: relRoot }));
    app.get("/*", (c) => c.html(indexHtml));
    console.log("Serving static client from", clientDist);
  }

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
