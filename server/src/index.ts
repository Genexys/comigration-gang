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

app.use(helmet());
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
