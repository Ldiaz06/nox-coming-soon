import { Router } from "express";
import { z } from "zod";
import { allowRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { audit, pool, withTransaction } from "../db.js";

const router = Router();
router.use(allowRoles("admin"));

const periodSchema = z.object({
  type: z.enum(["biweekly", "monthly"]),
  startsOn: z.string().date(),
  endsOn: z.string().date()
}).refine((body) => body.startsOn <= body.endsOn, { message: "Las fechas del período son inválidas." });

router.get("/periods", async (_req, res, next) => {
  try {
    const [periods] = await pool.query(
      `SELECT p.id, p.period_type AS type, p.starts_on AS startsOn, p.ends_on AS endsOn, p.status,
              p.approved_at AS approvedAt, p.paid_at AS paidAt,
              COALESCE(SUM(e.gross_pay), 0) AS grossTotal, COALESCE(SUM(e.net_pay), 0) AS netTotal
       FROM payroll_periods p LEFT JOIN payroll_entries e ON e.payroll_period_id = p.id
       GROUP BY p.id ORDER BY p.starts_on DESC`
    );
    res.json({ periods });
  } catch (error) { next(error); }
});

router.post("/periods", validate(periodSchema), async (req, res, next) => {
  try {
    const [result] = await pool.execute(
      `INSERT INTO payroll_periods (period_type, starts_on, ends_on, created_by) VALUES (?, ?, ?, ?)`,
      [req.validated.type, req.validated.startsOn, req.validated.endsOn, req.user.id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Ese período de planilla ya existe." });
    next(error);
  }
});

router.post("/periods/:id/calculate", async (req, res, next) => {
  try {
    const periodId = Number(req.params.id);
    const result = await withTransaction(async (connection) => {
      const [periods] = await connection.execute("SELECT * FROM payroll_periods WHERE id = ? FOR UPDATE", [periodId]);
      const period = periods[0];
      if (!period) { const error = new Error("Período no encontrado."); error.status = 404; throw error; }
      if (!["draft", "calculated"].includes(period.status)) { const error = new Error("La planilla aprobada o pagada no puede recalcularse."); error.status = 409; throw error; }
      await connection.execute("DELETE FROM payroll_entries WHERE payroll_period_id = ?", [periodId]);
      const [employees] = await connection.execute(
        `SELECT e.id, e.pay_type, e.hourly_rate, e.monthly_salary, e.overtime_multiplier,
                COALESCE(SUM(GREATEST(TIMESTAMPDIFF(MINUTE, t.clock_in, t.clock_out) - t.break_minutes, 0)) / 60, 0) AS total_hours
         FROM employees e
         LEFT JOIN time_entries t ON t.employee_id = e.id AND t.status = 'approved'
           AND t.clock_in >= ? AND t.clock_in < DATE_ADD(?, INTERVAL 1 DAY)
         WHERE e.status = 'active'
         GROUP BY e.id`, [period.starts_on, period.ends_on]
      );
      const regularLimit = period.period_type === "biweekly" ? 80 : 160;
      let grossTotal = 0;
      let netTotal = 0;
      for (const employee of employees) {
        const regularHours = Math.min(Number(employee.total_hours), regularLimit);
        const overtimeHours = Math.max(Number(employee.total_hours) - regularLimit, 0);
        const effectiveHourlyRate = employee.pay_type === "hourly" ? Number(employee.hourly_rate) : Number(employee.monthly_salary) / 208;
        const basePay = employee.pay_type === "hourly"
          ? regularHours * effectiveHourlyRate
          : Number(employee.monthly_salary) * (period.period_type === "biweekly" ? 0.5 : 1);
        const overtimePay = overtimeHours * effectiveHourlyRate * Number(employee.overtime_multiplier);
        const grossPay = Math.round((basePay + overtimePay) * 100) / 100;
        await connection.execute(
          `INSERT INTO payroll_entries
             (payroll_period_id, employee_id, regular_hours, overtime_hours, base_pay, overtime_pay, gross_pay, net_pay)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [periodId, employee.id, regularHours, overtimeHours, basePay, overtimePay, grossPay, grossPay]
        );
        grossTotal += grossPay;
        netTotal += grossPay;
      }
      await connection.execute("UPDATE payroll_periods SET status = 'calculated' WHERE id = ?", [periodId]);
      await audit(connection, { userId: req.user.id, action: "calculate", entity: "payroll_period", entityId: periodId, after: { employees: employees.length, grossTotal }, ip: req.ip });
      return { employees: employees.length, grossTotal, netTotal };
    });
    res.json(result);
  } catch (error) { next(error); }
});

router.get("/periods/:id/entries", async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT pe.id, pe.employee_id AS employeeId, e.full_name AS employeeName,
              pe.regular_hours AS regularHours, pe.overtime_hours AS overtimeHours,
              pe.base_pay AS basePay, pe.overtime_pay AS overtimePay, pe.bonuses,
              pe.deductions, pe.gross_pay AS grossPay, pe.net_pay AS netPay, pe.notes
       FROM payroll_entries pe JOIN employees e ON e.id = pe.employee_id
       WHERE pe.payroll_period_id = ? ORDER BY e.full_name`, [Number(req.params.id)]
    );
    res.json({ entries: rows });
  } catch (error) { next(error); }
});

router.patch("/entries/:id", validate(z.object({ bonuses: z.number().min(0), deductions: z.number().min(0), notes: z.string().trim().max(500).optional() })), async (req, res, next) => {
  try {
    const entryId = Number(req.params.id);
    await withTransaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT pe.*, pp.status FROM payroll_entries pe
         JOIN payroll_periods pp ON pp.id = pe.payroll_period_id WHERE pe.id = ? FOR UPDATE`, [entryId]
      );
      const entry = rows[0];
      if (!entry) { const error = new Error("Registro no encontrado."); error.status = 404; throw error; }
      if (entry.status !== "calculated") { const error = new Error("Solo puede ajustar una planilla calculada."); error.status = 409; throw error; }
      const gross = Number(entry.base_pay) + Number(entry.overtime_pay) + req.validated.bonuses;
      const net = Math.max(gross - req.validated.deductions, 0);
      await connection.execute(
        `UPDATE payroll_entries SET bonuses = ?, deductions = ?, gross_pay = ?, net_pay = ?, notes = ? WHERE id = ?`,
        [req.validated.bonuses, req.validated.deductions, gross, net, req.validated.notes || null, entryId]
      );
      await audit(connection, { userId: req.user.id, action: "adjust", entity: "payroll_entry", entityId: entryId, after: { bonuses: req.validated.bonuses, deductions: req.validated.deductions, net }, ip: req.ip });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post("/periods/:id/approve", async (req, res, next) => {
  try {
    const [result] = await pool.execute(
      `UPDATE payroll_periods SET status = 'approved', approved_by = ?, approved_at = NOW()
       WHERE id = ? AND status = 'calculated'`, [req.user.id, Number(req.params.id)]
    );
    if (!result.affectedRows) return res.status(409).json({ error: "La planilla debe estar calculada antes de aprobarse." });
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
