import { Request, Response, NextFunction } from "express";

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass) {
    res.status(500).json({ error: "Admin password not configured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${adminPass}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
