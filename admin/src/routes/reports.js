import { Router } from "express";
import { allowRoles } from "../middleware/auth.js";
import { pool } from "../db.js";

const router = Router();
router.use(allowRoles("admin", "supervisor"));

function toDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T12:00:00-05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) { return String(value).padStart(2, "0"); }
function sqlDate(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 00:00:00`; }

function periodRange(period, anchorValue) {
  const anchor = toDate(anchorValue) || new Date();
  let start;
  let end;
  if (period === "daily") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1);
  } else if (period === "fortnightly") {
    if (anchor.getDate() <= 15) {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      end = new Date(anchor.getFullYear(), anchor.getMonth(), 16);
    } else {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), 16);
      end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    }
  } else if (period === "monthly") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  } else {
    return null;
  }
  return { start: sqlDate(start), end: sqlDate(end) };
}

router.get("/summary", async (req, res, next) => {
  try {
    const period = String(req.query.period || "daily");
    const range = periodRange(period, String(req.query.anchor || ""));
    if (!range) return res.status(400).json({ error: "Período inválido." });
    const params = [range.start, range.end];
    const [[sales], [payments], [topProducts], [closures], [inventory], [trend]] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS grossSales,
                COALESCE(SUM(discount), 0) AS discounts, COALESCE(SUM(tax), 0) AS tax,
                COALESCE(SUM((SELECT SUM(si.unit_cost * si.quantity) FROM sale_items si WHERE si.sale_id = sales.id)), 0) AS cost
         FROM sales WHERE status = 'completed' AND created_at >= ? AND created_at < ?`, params),
      pool.execute(
        `SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
         GROUP BY p.method ORDER BY p.method`, params),
      pool.execute(
        `SELECT si.product_name AS name, SUM(si.quantity) AS quantity, SUM(si.line_total) AS total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
         GROUP BY si.product_id, si.product_name ORDER BY total DESC LIMIT 10`, params),
      pool.execute(
        `SELECT c.id, t.name AS terminal, u.full_name AS openedBy, c.expected_cash AS expectedCash,
                c.counted_cash AS countedCash, c.cash_difference AS difference, c.closed_at AS closedAt
         FROM cash_sessions c JOIN terminals t ON t.id = c.terminal_id JOIN users u ON u.id = c.opened_by
         WHERE c.status = 'closed' AND c.closed_at >= ? AND c.closed_at < ?
         ORDER BY c.closed_at DESC`, params),
      pool.query(
        `SELECT COUNT(*) AS itemCount, COALESCE(SUM(current_stock * average_cost), 0) AS inventoryValue,
                SUM(current_stock <= minimum_stock) AS lowStockCount
         FROM inventory_items WHERE active = TRUE`),
      pool.execute(
        `SELECT DATE(created_at) AS saleDate, SUM(total) AS total, COUNT(*) AS transactions
         FROM sales WHERE status = 'completed' AND created_at >= ? AND created_at < ?
         GROUP BY DATE(created_at) ORDER BY saleDate`, params)
    ]);
    const summary = sales[0] || {};
    summary.profit = Number(summary.grossSales || 0) - Number(summary.cost || 0);
    res.json({ period, range, summary, payments, topProducts, closures, inventory: inventory[0], trend });
  } catch (error) { next(error); }
});

router.get("/low-stock", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, sku, name, unit, current_stock AS currentStock, minimum_stock AS minimumStock
       FROM inventory_items WHERE active = TRUE AND current_stock <= minimum_stock
       ORDER BY (minimum_stock - current_stock) DESC, name`
    );
    res.json({ items: rows });
  } catch (error) { next(error); }
});

export default router;
