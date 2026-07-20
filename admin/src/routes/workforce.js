import { Router } from "express";
import { z } from "zod";
import { allowRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { audit, pool, withTransaction } from "../db.js";

const router = Router();
const employeeSchema = z.object({
  userId: z.number().int().positive().nullable().optional(),
  code: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(3).max(160),
  position: z.string().trim().min(2).max(100),
  payType: z.enum(["hourly", "monthly"]),
  hourlyRate: z.number().min(0).default(0),
  monthlySalary: z.number().min(0).default(0),
  overtimeMultiplier: z.number().min(1).max(5).default(1.5),
  hiredOn: z.string().date().nullable().optional()
});

router.get("/employees", allowRoles("admin", "supervisor"), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT e.id, e.user_id AS userId, e.employee_code AS code, e.full_name AS fullName,
              e.position_name AS position, e.pay_type AS payType, e.hourly_rate AS hourlyRate,
              e.monthly_salary AS monthlySalary, e.overtime_multiplier AS overtimeMultiplier,
              e.hired_on AS hiredOn, e.status, u.role
       FROM employees e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.full_name`
    );
    res.json({ employees: rows });
  } catch (error) { next(error); }
});

router.post("/employees", allowRoles("admin"), validate(employeeSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const [result] = await pool.execute(
      `INSERT INTO employees
         (user_id, employee_code, full_name, position_name, pay_type, hourly_rate, monthly_salary, overtime_multiplier, hired_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.userId || null, body.code, body.fullName, body.position, body.payType, body.hourlyRate,
        body.monthlySalary, body.overtimeMultiplier, body.hiredOn || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "El código o usuario ya está asignado." });
    next(error);
  }
});

router.get("/clock", async (req, res, next) => {
  try {
    const [employees] = await pool.execute("SELECT id FROM employees WHERE user_id = ? AND status = 'active'", [req.user.id]);
    if (!employees[0]) return res.json({ employee: null, openEntry: null });
    const [entries] = await pool.execute(
      `SELECT id, clock_in AS clockIn, clock_out AS clockOut, break_minutes AS breakMinutes, status
       FROM time_entries WHERE employee_id = ? AND status = 'open' ORDER BY clock_in DESC LIMIT 1`, [employees[0].id]
    );
    res.json({ employee: { id: employees[0].id }, openEntry: entries[0] || null });
  } catch (error) { next(error); }
});

router.post("/clock/in", async (req, res, next) => {
  try {
    const id = await withTransaction(async (connection) => {
      const [employees] = await connection.execute("SELECT id FROM employees WHERE user_id = ? AND status = 'active' FOR UPDATE", [req.user.id]);
      if (!employees[0]) { const error = new Error("Su usuario no está vinculado a un empleado activo."); error.status = 409; throw error; }
      const [open] = await connection.execute("SELECT id FROM time_entries WHERE employee_id = ? AND status = 'open' FOR UPDATE", [employees[0].id]);
      if (open[0]) { const error = new Error("Ya tiene una jornada abierta."); error.status = 409; throw error; }
      const [result] = await connection.execute("INSERT INTO time_entries (employee_id, clock_in) VALUES (?, NOW())", [employees[0].id]);
      await audit(connection, { userId: req.user.id, action: "clock_in", entity: "time_entry", entityId: result.insertId, ip: req.ip });
      return result.insertId;
    });
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

router.post("/clock/out", validate(z.object({ breakMinutes: z.number().int().min(0).max(720).default(0), notes: z.string().trim().max(300).optional() })), async (req, res, next) => {
  try {
    await withTransaction(async (connection) => {
      const [employees] = await connection.execute("SELECT id FROM employees WHERE user_id = ? AND status = 'active'", [req.user.id]);
      if (!employees[0]) { const error = new Error("Empleado no encontrado."); error.status = 404; throw error; }
      const [entries] = await connection.execute(
        "SELECT id FROM time_entries WHERE employee_id = ? AND status = 'open' ORDER BY clock_in DESC LIMIT 1 FOR UPDATE", [employees[0].id]
      );
      if (!entries[0]) { const error = new Error("No tiene una jornada abierta."); error.status = 409; throw error; }
      await connection.execute(
        `UPDATE time_entries SET clock_out = NOW(), break_minutes = ?, notes = ?, status = 'submitted' WHERE id = ?`,
        [req.validated.breakMinutes, req.validated.notes || null, entries[0].id]
      );
      await audit(connection, { userId: req.user.id, action: "clock_out", entity: "time_entry", entityId: entries[0].id, ip: req.ip });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/hours", async (req, res, next) => {
  try {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start || "")) ? req.query.start : new Date().toISOString().slice(0, 8) + "01";
    const end = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.end || "")) ? req.query.end : new Date().toISOString().slice(0, 10);
    const ownOnly = req.user.role === "cashier";
    const [rows] = await pool.execute(
      `SELECT t.id, e.id AS employeeId, e.full_name AS employeeName, t.clock_in AS clockIn, t.clock_out AS clockOut,
              t.break_minutes AS breakMinutes, t.status,
              CASE WHEN t.clock_out IS NULL THEN NULL
                   ELSE ROUND(GREATEST(TIMESTAMPDIFF(MINUTE, t.clock_in, t.clock_out) - t.break_minutes, 0) / 60, 2) END AS hours
       FROM time_entries t JOIN employees e ON e.id = t.employee_id
       WHERE t.clock_in >= ? AND t.clock_in < DATE_ADD(?, INTERVAL 1 DAY)
         ${ownOnly ? "AND e.user_id = ?" : ""}
       ORDER BY t.clock_in DESC`, ownOnly ? [start, end, req.user.id] : [start, end]
    );
    res.json({ entries: rows });
  } catch (error) { next(error); }
});

router.post("/hours/:id/approve", allowRoles("admin", "supervisor"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [result] = await pool.execute(
      `UPDATE time_entries SET status = 'approved', approved_by = ?, approved_at = NOW()
       WHERE id = ? AND status = 'submitted'`, [req.user.id, id]
    );
    if (!result.affectedRows) return res.status(409).json({ error: "La marcación no está pendiente de aprobación." });
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
