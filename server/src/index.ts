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
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/comigration";
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

  // Anonymize IPs in pins older than 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const anonResult = await db.collection("pins").updateMany(
    { createdAt: { $lt: ninetyDaysAgo }, ip: { $exists: true } },
    { $unset: { ip: "" } }
  );
  if (anonResult.modifiedCount > 0) {
    console.log(`Anonymized IPs for ${anonResult.modifiedCount} old pins`);
  }

  const app = new Hono<AppEnv>();

  // Inject db into every request context
  app.use("/*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  // Body size limit
  app.use("/api/*", bodyLimit({ maxSize: 16 * 1024 })); // 16KB max

  // Security headers (Helmet equivalent)
  app.use(
    "/*",
    secureHeaders({
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "challenges.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
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
