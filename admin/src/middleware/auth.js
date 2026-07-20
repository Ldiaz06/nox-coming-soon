import jwt from "jsonwebtoken";
import { pool } from "../db.js";

export async function requireAuth(req, res, next) {
  const token = req.cookies.nox_session;
  if (!token) return res.status(401).json({ error: "Debe iniciar sesión." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "nox-admin",
      audience: "nox-staff"
    });
    const [rows] = await pool.execute(
      `SELECT id, email, full_name, role, status
       FROM users WHERE id = ? LIMIT 1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "Sesión inválida." });
    }
    req.user = user;
    next();
  } catch {
    res.clearCookie("nox_session");
    return res.status(401).json({ error: "La sesión expiró." });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No tiene permiso para realizar esta acción." });
    }
    next();
  };
}
