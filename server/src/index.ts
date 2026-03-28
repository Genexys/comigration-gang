import express from "express";
import cors from "cors";
import helmet from "helmet";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { pinsRouter } from "./routes/pins.js";
import { adminRouter } from "./routes/admin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/comigration";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "challenges.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "*.cartocdn.com", "*.openstreetmap.org"],
      connectSrc: ["'self'", "challenges.cloudflare.com"],
      frameSrc: ["challenges.cloudflare.com"],
    },
  },
}));
app.use(cors({
  origin: ALLOWED_ORIGIN.split(",").map(o => o.trim()),
  methods: ["GET", "POST", "DELETE"],
}));
app.use(express.json({ limit: "10kb" }));

async function start() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db();
  app.locals.db = db;

  // TTL index: auto-delete banned_ips after 1 year
  await db.collection("banned_ips").createIndex(
    { bannedAt: 1 },
    { expireAfterSeconds: 365 * 24 * 60 * 60, background: true }
  );

  // Anonymize IPs in pins older than 90 days (run at startup)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const anonResult = await db.collection("pins").updateMany(
    { createdAt: { $lt: ninetyDaysAgo }, ip: { $exists: true } },
    { $unset: { ip: "" } }
  );
  if (anonResult.modifiedCount > 0) {
    console.log(`Anonymized IPs for ${anonResult.modifiedCount} old pins`);
  }

  app.use("/api/pins", pinsRouter);
  app.use("/api/admin", adminRouter);

  // Serve client static build in production
  const clientDist = join(__dirname, "../../client/dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(join(clientDist, "index.html"));
    });
    console.log("Serving static client from", clientDist);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
