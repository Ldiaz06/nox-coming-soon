import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pool } from "./src/db.js";
import authRouter from "./src/routes/auth.js";
import usersRouter from "./src/routes/users.js";
import inventoryRouter from "./src/routes/inventory.js";
import posRouter from "./src/routes/pos.js";
import cashRouter from "./src/routes/cash.js";
import reportsRouter from "./src/routes/reports.js";
import workforceRouter from "./src/routes/workforce.js";
import payrollRouter from "./src/routes/payroll.js";
import { requireAuth } from "./src/middleware/auth.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 48) {
  throw new Error("JWT_SECRET debe tener al menos 48 caracteres.");
}

const app = express();
const port = Number(process.env.PORT || 3000);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dirname, "public");

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "250kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && process.env.APP_ORIGIN && origin !== process.env.APP_ORIGIN) {
    return res.status(403).json({ error: "Origen no permitido." });
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/inventory", requireAuth, inventoryRouter);
app.use("/api/pos", requireAuth, posRouter);
app.use("/api/cash", requireAuth, cashRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/workforce", requireAuth, workforceRouter);
app.use("/api/payroll", requireAuth, payrollRouter);

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "nox-admin" });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

app.use(express.static(publicDir, { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  res.status(status).json({ error: status === 500 ? "Ocurrió un error interno." : error.message });
});

app.listen(port, () => {
  console.log(`NOX Admin disponible en ${process.env.APP_ORIGIN || `http://localhost:${port}`}`);
});
