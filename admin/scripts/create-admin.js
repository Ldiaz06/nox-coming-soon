import "dotenv/config";
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const email = String(process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
const password = String(process.env.INITIAL_ADMIN_PASSWORD || "");
const fullName = String(process.env.INITIAL_ADMIN_NAME || "Administrador NOX").trim();

if (!email || !email.includes("@")) throw new Error("INITIAL_ADMIN_EMAIL no es válido.");
if (password.length < 12) throw new Error("INITIAL_ADMIN_PASSWORD debe tener al menos 12 caracteres.");

const passwordHash = await bcrypt.hash(password, 12);
await pool.execute(
  `INSERT INTO users (email, password_hash, full_name, role, status)
   VALUES (?, ?, ?, 'admin', 'active')
   ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role = 'admin', status = 'active'`,
  [email, passwordHash, fullName]
);

console.log(`Administrador creado o actualizado: ${email}`);
await pool.end();
