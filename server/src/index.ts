import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
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

  // Security headers (Helmet equivalent)
  app.use(
    "/*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "challenges.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
        fontSrc: ["'self'", "fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "*.cartocdn.com", "*.openstreetmap.org"],
        connectSrc: ["'self'", "challenges.cloudflare.com"],
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
    })
  );

  // API routes
  app.route("/api/pins", pinsRouter);
  app.route("/api/admin", adminRouter);

  // Serve client static build in production
  const clientDist = join(__dirname, "../../client/dist");
  if (existsSync(clientDist)) {
    const relRoot = relative(process.cwd(), clientDist);
    app.use("/*", serveStatic({ root: relRoot }));
    app.get("/*", (c) => {
      const html = readFileSync(join(clientDist, "index.html"), "utf-8");
      return c.html(html);
    });
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
