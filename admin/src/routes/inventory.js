import { Router } from "express";
import { z } from "zod";
import { allowRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { audit, pool, withTransaction } from "../db.js";

const router = Router();
const managers = allowRoles("admin", "supervisor");
const units = ["unit", "bottle", "ml", "liter", "gram", "kg", "portion"];

const itemSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(100),
  unit: z.enum(units),
  currentStock: z.number().min(0).default(0),
  minimumStock: z.number().min(0).default(0),
  averageCost: z.number().min(0).default(0)
});

const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(120).nullable().optional(),
  name: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(100),
  salePrice: z.number().min(0),
  taxRate: z.number().min(0).max(1).default(0),
  recipe: z.array(z.object({ itemId: z.number().int().positive(), quantity: z.number().positive() })).min(1)
});

const movementSchema = z.object({
  itemId: z.number().int().positive(),
  type: z.enum(["waste", "adjustment", "count"]),
  quantity: z.number(),
  notes: z.string().trim().max(500).optional()
}).refine((body) => body.type === "count" || body.quantity !== 0, { message: "La cantidad no puede ser cero.", path: ["quantity"] });

const purchaseSchema = z.object({
  supplierId: z.number().int().positive().nullable().optional(),
  invoiceNumber: z.string().trim().max(100).nullable().optional(),
  purchasedAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({ itemId: z.number().int().positive(), quantity: z.number().positive(), unitCost: z.number().min(0) })).min(1)
});

router.get("/items", managers, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, sku, name, category, unit, current_stock AS currentStock, minimum_stock AS minimumStock,
              average_cost AS averageCost, active, current_stock <= minimum_stock AS lowStock
       FROM inventory_items WHERE active = TRUE ORDER BY category, name`
    );
    res.json({ items: rows });
  } catch (error) { next(error); }
});

router.post("/items", managers, validate(itemSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const id = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO inventory_items (sku, name, category, unit, current_stock, minimum_stock, average_cost)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [body.sku, body.name, body.category, body.unit, body.currentStock, body.minimumStock, body.averageCost]
      );
      if (body.currentStock > 0) {
        await connection.execute(
          `INSERT INTO inventory_movements
             (inventory_item_id, movement_type, quantity, unit_cost, notes, created_by)
           VALUES (?, 'opening', ?, ?, 'Inventario inicial', ?)`,
          [result.insertId, body.currentStock, body.averageCost, req.user.id]
        );
      }
      await audit(connection, { userId: req.user.id, action: "create", entity: "inventory_item", entityId: result.insertId, after: body, ip: req.ip });
      return result.insertId;
    });
    res.status(201).json({ id });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "El SKU ya existe." });
    next(error);
  }
});

router.post("/products", managers, validate(productSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const id = await withTransaction(async (connection) => {
      const itemIds = [...new Set(body.recipe.map((item) => item.itemId))];
      const placeholders = itemIds.map(() => "?").join(",");
      const [validItems] = await connection.query(`SELECT id FROM inventory_items WHERE active = TRUE AND id IN (${placeholders})`, itemIds);
      if (validItems.length !== itemIds.length) {
        const error = new Error("La receta contiene artículos de inventario inválidos.");
        error.status = 400;
        throw error;
      }
      const [result] = await connection.execute(
        `INSERT INTO products (sku, barcode, name, category, sale_price, tax_rate) VALUES (?, ?, ?, ?, ?, ?)`,
        [body.sku, body.barcode || null, body.name, body.category, body.salePrice, body.taxRate]
      );
      for (const component of body.recipe) {
        await connection.execute(
          "INSERT INTO product_recipes (product_id, inventory_item_id, quantity) VALUES (?, ?, ?)",
          [result.insertId, component.itemId, component.quantity]
        );
      }
      await audit(connection, { userId: req.user.id, action: "create", entity: "product", entityId: result.insertId, after: body, ip: req.ip });
      return result.insertId;
    });
    res.status(201).json({ id });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "El SKU o código de barras ya existe." });
    next(error);
  }
});

router.post("/movements", managers, validate(movementSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const result = await withTransaction(async (connection) => {
      const [rows] = await connection.execute("SELECT id, current_stock FROM inventory_items WHERE id = ? AND active = TRUE FOR UPDATE", [body.itemId]);
      const item = rows[0];
      if (!item) {
        const error = new Error("Artículo no encontrado."); error.status = 404; throw error;
      }
      let delta = body.type === "count" ? body.quantity - item.current_stock : body.quantity;
      if (body.type === "waste") delta = -Math.abs(body.quantity);
      const newStock = Number(item.current_stock) + delta;
      if (newStock < 0) {
        const error = new Error("El movimiento dejaría el inventario en negativo."); error.status = 409; throw error;
      }
      await connection.execute("UPDATE inventory_items SET current_stock = ? WHERE id = ?", [newStock, body.itemId]);
      const [movement] = await connection.execute(
        `INSERT INTO inventory_movements (inventory_item_id, movement_type, quantity, notes, created_by)
         VALUES (?, ?, ?, ?, ?)`, [body.itemId, body.type, delta, body.notes || null, req.user.id]
      );
      await audit(connection, { userId: req.user.id, action: body.type, entity: "inventory_item", entityId: body.itemId, before: { stock: item.current_stock }, after: { stock: newStock }, ip: req.ip });
      return { id: movement.insertId, currentStock: newStock };
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

router.post("/purchases", managers, validate(purchaseSchema), async (req, res, next) => {
  try {
    const body = req.validated;
    const id = await withTransaction(async (connection) => {
      const total = body.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
      const [purchase] = await connection.execute(
        `INSERT INTO purchases (supplier_id, invoice_number, purchased_at, total, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [body.supplierId || null, body.invoiceNumber || null, new Date(body.purchasedAt), total, body.notes || null, req.user.id]
      );
      for (const line of body.items) {
        const [rows] = await connection.execute("SELECT current_stock, average_cost FROM inventory_items WHERE id = ? FOR UPDATE", [line.itemId]);
        const item = rows[0];
        if (!item) { const error = new Error("Artículo de compra inválido."); error.status = 400; throw error; }
        const oldValue = item.current_stock * item.average_cost;
        const newStock = item.current_stock + line.quantity;
        const newAverageCost = newStock > 0 ? (oldValue + line.quantity * line.unitCost) / newStock : line.unitCost;
        await connection.execute(
          "INSERT INTO purchase_items (purchase_id, inventory_item_id, quantity, unit_cost) VALUES (?, ?, ?, ?)",
          [purchase.insertId, line.itemId, line.quantity, line.unitCost]
        );
        await connection.execute("UPDATE inventory_items SET current_stock = ?, average_cost = ? WHERE id = ?", [newStock, newAverageCost, line.itemId]);
        await connection.execute(
          `INSERT INTO inventory_movements
             (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
           VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)`,
          [line.itemId, line.quantity, line.unitCost, purchase.insertId, req.user.id]
        );
      }
      await audit(connection, { userId: req.user.id, action: "receive", entity: "purchase", entityId: purchase.insertId, after: { total, items: body.items.length }, ip: req.ip });
      return purchase.insertId;
    });
    res.status(201).json({ id });
  } catch (error) { next(error); }
});

router.get("/movements", managers, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const [rows] = await pool.query(
      `SELECT m.id, i.name AS itemName, i.sku, m.movement_type AS type, m.quantity, m.unit_cost AS unitCost,
              m.notes, u.full_name AS createdBy, m.created_at AS createdAt
       FROM inventory_movements m
       JOIN inventory_items i ON i.id = m.inventory_item_id
       JOIN users u ON u.id = m.created_by
       ORDER BY m.created_at DESC LIMIT ?`, [limit]
    );
    res.json({ movements: rows });
  } catch (error) { next(error); }
});

export default router;
