import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { allowRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { audit, pool, withTransaction } from "../db.js";

const router = Router();
router.use(allowRoles("admin"));

const createSchema = z.object({
  email: z.string().email().max(190).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(200),
  fullName: z.string().trim().min(3).max(160),
  role: z.enum(["admin", "supervisor", "cashier"]),
  employee: z.object({
    code: z.string().trim().min(1).max(40),
    position: z.string().trim().min(2).max(100),
    payType: z.enum(["hourly", "monthly"]),
    hourlyRate: z.number().min(0).default(0),
    monthlySalary: z.number().min(0).default(0),
    overtimeMultiplier: z.number().min(1).max(5).default(1.5)
  }).optional()
});

const updateSchema = z.object({
  fullName: z.string().trim().min(3).max(160).optional(),
  role: z.enum(["admin", "supervisor", "cashier"]).optional(),
  status: z.enum(["active", "inactive", "locked"]).optional(),
  password: z.string().min(12).max(200).optional()
}).refine((body) => Object.keys(body).length > 0, "Debe enviar al menos un cambio.");

router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.email, u.full_name AS fullName, u.role, u.status, u.last_login_at AS lastLoginAt,
              e.id AS employeeId, e.employee_code AS employeeCode, e.position_name AS positionName
       FROM users u LEFT JOIN employees e ON e.user_id = u.id
       ORDER BY u.full_name`
    );
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", validate(createSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const passwordHash = await bcrypt.hash(body.password, 12);
    const id = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
        [body.email, passwordHash, body.fullName, body.role]
      );
      if (body.employee) {
        await connection.execute(
          `INSERT INTO employees
             (user_id, employee_code, full_name, position_name, pay_type, hourly_rate, monthly_salary, overtime_multiplier)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [result.insertId, body.employee.code, body.fullName, body.employee.position, body.employee.payType,
            body.employee.hourlyRate, body.employee.monthlySalary, body.employee.overtimeMultiplier]
        );
      }
      await audit(connection, {
        userId: req.user.id,
        action: "create",
        entity: "user",
        entityId: result.insertId,
        after: { email: body.email, role: body.role },
        ip: req.ip
      });
      return result.insertId;
    });
    res.status(201).json({ id });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "El correo o código de empleado ya existe." });
    next(error);
  }
});

router.patch("/:id", validate(updateSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Usuario inválido." });
    if (id === req.user.id && req.validated.status && req.validated.status !== "active") {
      return res.status(400).json({ error: "No puede desactivar su propia cuenta." });
    }

    await withTransaction(async (connection) => {
      const [rows] = await connection.execute("SELECT id, full_name, role, status FROM users WHERE id = ? FOR UPDATE", [id]);
      if (!rows[0]) {
        const error = new Error("Usuario no encontrado.");
        error.status = 404;
        throw error;
      }
      const fields = [];
      const values = [];
      const mappings = { fullName: "full_name", role: "role", status: "status" };
      for (const [key, column] of Object.entries(mappings)) {
        if (req.validated[key] !== undefined) {
          fields.push(`${column} = ?`);
          values.push(req.validated[key]);
        }
      }
      if (req.validated.password) {
        fields.push("password_hash = ?");
        values.push(await bcrypt.hash(req.validated.password, 12));
      }
      values.push(id);
      await connection.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
      if (req.validated.fullName) {
        await connection.execute("UPDATE employees SET full_name = ? WHERE user_id = ?", [req.validated.fullName, id]);
      }
      await audit(connection, { userId: req.user.id, action: "update", entity: "user", entityId: id, before: rows[0], after: req.validated, ip: req.ip });
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
