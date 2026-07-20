import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { allowRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { audit, pool, withTransaction } from "../db.js";

const router = Router();
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const saleSchema = z.object({
  cashSessionId: z.number().int().positive(),
  discount: z.number().min(0).default(0),
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive().max(100) })).min(1).max(100),
  payments: z.array(z.object({
    method: z.enum(["cash", "card", "yappy"]),
    amount: z.number().positive(),
    reference: z.string().trim().max(120).nullable().optional()
  })).min(1).max(3)
});

router.get("/products", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.sku, p.barcode, p.name, p.category, p.sale_price AS salePrice, p.tax_rate AS taxRate,
              COALESCE(MIN(i.current_stock / NULLIF(r.quantity, 0)), 999999) AS available
       FROM products p
       LEFT JOIN product_recipes r ON r.product_id = p.id
       LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
       WHERE p.active = TRUE
       GROUP BY p.id
       ORDER BY p.category, p.name`
    );
    res.json({ products: rows.map((row) => ({ ...row, available: Math.max(0, Math.floor(row.available)) })) });
  } catch (error) { next(error); }
});

router.post("/sales", validate(saleSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const result = await withTransaction(async (connection) => {
      const [sessionRows] = await connection.execute(
        `SELECT id, opened_by FROM cash_sessions WHERE id = ? AND status = 'open' FOR UPDATE`,
        [body.cashSessionId]
      );
      const session = sessionRows[0];
      if (!session) { const error = new Error("La caja no está abierta."); error.status = 409; throw error; }
      if (req.user.role === "cashier" && session.opened_by !== req.user.id) {
        const error = new Error("Solo puede vender en su propia caja."); error.status = 403; throw error;
      }

      const requested = new Map();
      for (const line of body.items) requested.set(line.productId, (requested.get(line.productId) || 0) + line.quantity);
      const productIds = [...requested.keys()];
      const productPlaceholders = productIds.map(() => "?").join(",");
      const [productRows] = await connection.query(
        `SELECT id, name, sale_price, tax_rate FROM products
         WHERE active = TRUE AND id IN (${productPlaceholders}) FOR UPDATE`,
        productIds
      );
      if (productRows.length !== productIds.length) {
        const error = new Error("Uno o más productos no están disponibles."); error.status = 409; throw error;
      }
      const products = new Map(productRows.map((product) => [product.id, product]));

      const [recipeRows] = await connection.query(
        `SELECT r.product_id, r.inventory_item_id, r.quantity, i.name AS item_name,
                i.current_stock, i.average_cost
         FROM product_recipes r
         JOIN inventory_items i ON i.id = r.inventory_item_id
         WHERE r.product_id IN (${productPlaceholders})
         ORDER BY r.inventory_item_id FOR UPDATE`,
        productIds
      );
      const recipes = new Map();
      const requirements = new Map();
      for (const component of recipeRows) {
        if (!recipes.has(component.product_id)) recipes.set(component.product_id, []);
        recipes.get(component.product_id).push(component);
        const needed = component.quantity * requested.get(component.product_id);
        requirements.set(component.inventory_item_id, (requirements.get(component.inventory_item_id) || 0) + needed);
      }
      for (const productId of productIds) {
        if (!recipes.has(productId)) {
          const error = new Error(`El producto ${products.get(productId).name} no tiene receta de inventario.`); error.status = 409; throw error;
        }
      }
      const itemState = new Map(recipeRows.map((row) => [row.inventory_item_id, row]));
      for (const [itemId, needed] of requirements) {
        const item = itemState.get(itemId);
        if (item.current_stock < needed) {
          const error = new Error(`Inventario insuficiente: ${item.item_name}.`); error.status = 409; throw error;
        }
      }

      let subtotal = 0;
      let tax = 0;
      const calculatedLines = [];
      for (const [productId, quantity] of requested) {
        const product = products.get(productId);
        const lineSubtotal = money(product.sale_price * quantity);
        const lineTax = money(lineSubtotal * product.tax_rate);
        const unitCost = recipes.get(productId).reduce((sum, item) => sum + item.quantity * item.average_cost, 0);
        subtotal = money(subtotal + lineSubtotal);
        tax = money(tax + lineTax);
        calculatedLines.push({ productId, product, quantity, unitCost, tax: lineTax, total: money(lineSubtotal + lineTax) });
      }
      if (body.discount > subtotal + tax) {
        const error = new Error("El descuento supera el total de la venta."); error.status = 400; throw error;
      }
      const total = money(subtotal + tax - body.discount);
      const paymentTotal = money(body.payments.reduce((sum, payment) => sum + payment.amount, 0));
      if (Math.abs(paymentTotal - total) > 0.009) {
        const error = new Error("Los pagos deben coincidir exactamente con el total."); error.status = 400; throw error;
      }

      const receipt = `NOX-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [sale] = await connection.execute(
        `INSERT INTO sales (receipt_number, cash_session_id, cashier_id, subtotal, tax, discount, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [receipt, body.cashSessionId, req.user.id, subtotal, tax, body.discount, total]
      );
      for (const line of calculatedLines) {
        await connection.execute(
          `INSERT INTO sale_items
             (sale_id, product_id, product_name, quantity, unit_price, unit_cost, tax_amount, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [sale.insertId, line.productId, line.product.name, line.quantity, line.product.sale_price,
            line.unitCost, line.tax, line.total]
        );
      }
      for (const payment of body.payments) {
        await connection.execute(
          "INSERT INTO payments (sale_id, method, amount, reference_number) VALUES (?, ?, ?, ?)",
          [sale.insertId, payment.method, payment.amount, payment.reference || null]
        );
      }
      for (const [itemId, needed] of requirements) {
        const item = itemState.get(itemId);
        await connection.execute("UPDATE inventory_items SET current_stock = current_stock - ? WHERE id = ?", [needed, itemId]);
        await connection.execute(
          `INSERT INTO inventory_movements
             (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
           VALUES (?, 'sale', ?, ?, 'sale', ?, ?)`,
          [itemId, -needed, item.average_cost, sale.insertId, req.user.id]
        );
      }
      await audit(connection, { userId: req.user.id, action: "complete", entity: "sale", entityId: sale.insertId, after: { receipt, total }, ip: req.ip });
      return { id: sale.insertId, receipt, subtotal, tax, discount: body.discount, total };
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.post("/sales/:id/void", allowRoles("admin", "supervisor"), validate(z.object({ reason: z.string().trim().min(4).max(300) })), async (req, res, next) => {
  try {
    const saleId = Number(req.params.id);
    await withTransaction(async (connection) => {
      const [sales] = await connection.execute("SELECT * FROM sales WHERE id = ? FOR UPDATE", [saleId]);
      const sale = sales[0];
      if (!sale) { const error = new Error("Venta no encontrada."); error.status = 404; throw error; }
      if (sale.status !== "completed") { const error = new Error("La venta ya fue anulada."); error.status = 409; throw error; }
      const [movements] = await connection.execute(
        `SELECT inventory_item_id, quantity, unit_cost FROM inventory_movements
         WHERE reference_type = 'sale' AND reference_id = ? AND movement_type = 'sale' FOR UPDATE`, [saleId]
      );
      for (const movement of movements) {
        const restored = Math.abs(movement.quantity);
        await connection.execute("UPDATE inventory_items SET current_stock = current_stock + ? WHERE id = ?", [restored, movement.inventory_item_id]);
        await connection.execute(
          `INSERT INTO inventory_movements
             (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
           VALUES (?, 'void', ?, ?, 'sale', ?, ?, ?)`,
          [movement.inventory_item_id, restored, movement.unit_cost, saleId, req.validated.reason, req.user.id]
        );
      }
      await connection.execute(
        `UPDATE sales SET status = 'voided', void_reason = ?, voided_at = NOW(), voided_by = ? WHERE id = ?`,
        [req.validated.reason, req.user.id, saleId]
      );
      await audit(connection, { userId: req.user.id, action: "void", entity: "sale", entityId: saleId, before: { status: sale.status }, after: { status: "voided", reason: req.validated.reason }, ip: req.ip });
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/sales", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const ownOnly = req.user.role === "cashier";
    const [rows] = await pool.query(
      `SELECT s.id, s.receipt_number AS receipt, s.total, s.status, s.created_at AS createdAt,
              u.full_name AS cashier
       FROM sales s JOIN users u ON u.id = s.cashier_id
       ${ownOnly ? "WHERE s.cashier_id = ?" : ""}
       ORDER BY s.created_at DESC LIMIT ?`, ownOnly ? [req.user.id, limit] : [limit]
    );
    res.json({ sales: rows });
  } catch (error) { next(error); }
});

export default router;
