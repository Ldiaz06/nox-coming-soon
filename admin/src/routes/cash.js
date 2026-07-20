import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { audit, pool, withTransaction } from "../db.js";

const router = Router();
const openSchema = z.object({ terminalId: z.number().int().positive(), openingAmount: z.number().min(0).max(100000) });
const closeSchema = z.object({ countedCash: z.number().min(0).max(100000), notes: z.string().trim().max(500).optional() });

router.get("/terminals", async (_req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, name, location_name AS locationName FROM terminals WHERE status = 'active' ORDER BY name");
    res.json({ terminals: rows });
  } catch (error) { next(error); }
});

router.get("/sessions", async (req, res, next) => {
  try {
    const ownOnly = req.user.role === "cashier";
    const [rows] = await pool.query(
      `SELECT c.id, c.terminal_id AS terminalId, t.name AS terminalName, c.opening_amount AS openingAmount,
              c.expected_cash AS expectedCash, c.counted_cash AS countedCash, c.cash_difference AS cashDifference,
              c.status, c.opened_at AS openedAt, c.closed_at AS closedAt, u.full_name AS openedBy
       FROM cash_sessions c JOIN terminals t ON t.id = c.terminal_id JOIN users u ON u.id = c.opened_by
       ${ownOnly ? "WHERE c.opened_by = ?" : ""}
       ORDER BY c.opened_at DESC LIMIT 100`, ownOnly ? [req.user.id] : []
    );
    res.json({ sessions: rows });
  } catch (error) { next(error); }
});

router.post("/sessions/open", validate(openSchema), async (req, res, next) => {
  try {
    const id = await withTransaction(async (connection) => {
      const [terminal] = await connection.execute("SELECT id FROM terminals WHERE id = ? AND status = 'active' FOR UPDATE", [req.validated.terminalId]);
      if (!terminal[0]) { const error = new Error("Terminal inválida."); error.status = 404; throw error; }
      const [existing] = await connection.execute(
        "SELECT id FROM cash_sessions WHERE terminal_id = ? AND status = 'open' FOR UPDATE", [req.validated.terminalId]
      );
      if (existing[0]) { const error = new Error("La terminal ya tiene una caja abierta."); error.status = 409; throw error; }
      const [own] = await connection.execute("SELECT id FROM cash_sessions WHERE opened_by = ? AND status = 'open' FOR UPDATE", [req.user.id]);
      if (own[0]) { const error = new Error("Ya tiene una caja abierta."); error.status = 409; throw error; }
      const [result] = await connection.execute(
        "INSERT INTO cash_sessions (terminal_id, opened_by, opening_amount) VALUES (?, ?, ?)",
        [req.validated.terminalId, req.user.id, req.validated.openingAmount]
      );
      await audit(connection, { userId: req.user.id, action: "open", entity: "cash_session", entityId: result.insertId, after: req.validated, ip: req.ip });
      return result.insertId;
    });
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

router.post("/sessions/:id/close", validate(closeSchema), async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const result = await withTransaction(async (connection) => {
      const [sessions] = await connection.execute("SELECT * FROM cash_sessions WHERE id = ? FOR UPDATE", [sessionId]);
      const session = sessions[0];
      if (!session) { const error = new Error("Caja no encontrada."); error.status = 404; throw error; }
      if (session.status !== "open") { const error = new Error("La caja ya está cerrada."); error.status = 409; throw error; }
      if (req.user.role === "cashier" && session.opened_by !== req.user.id) {
        const error = new Error("No puede cerrar la caja de otro usuario."); error.status = 403; throw error;
      }
      const [totals] = await connection.execute(
        `SELECT COALESCE(SUM(p.amount), 0) AS cashSales
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.cash_session_id = ? AND s.status = 'completed' AND p.method = 'cash'`, [sessionId]
      );
      const expected = Number(session.opening_amount) + Number(totals[0].cashSales);
      const difference = req.validated.countedCash - expected;
      await connection.execute(
        `UPDATE cash_sessions
         SET expected_cash = ?, counted_cash = ?, cash_difference = ?, notes = ?, closed_by = ?, closed_at = NOW(), status = 'closed'
         WHERE id = ?`,
        [expected, req.validated.countedCash, difference, req.validated.notes || null, req.user.id, sessionId]
      );
      await audit(connection, { userId: req.user.id, action: "close", entity: "cash_session", entityId: sessionId, after: { expected, counted: req.validated.countedCash, difference }, ip: req.ip });
      return { expectedCash: expected, countedCash: req.validated.countedCash, difference };
    });
    res.json(result);
  } catch (error) { next(error); }
});

export default router;
