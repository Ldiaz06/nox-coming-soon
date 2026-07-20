import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();
const loginSchema = z.object({
  email: z.string().email().max(190).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(200)
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/"
  };
}

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    const [rows] = await pool.execute(
      `SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    const user = rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid || user.status !== "active") {
      return res.status(401).json({ error: "Correo o contraseña incorrectos." });
    }

    const token = jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
      algorithm: "HS256",
      subject: String(user.id),
      issuer: "nox-admin",
      audience: "nox-staff",
      expiresIn: "8h"
    });
    await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
    res.cookie("nox_session", token, cookieOptions());
    res.json({ user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie("nox_session", { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.full_name,
      role: req.user.role
    }
  });
});

export default router;
