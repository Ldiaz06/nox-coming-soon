-- NOX Control — productos de cerveza para el POS
-- Ejecutar después de schema.sql. Es idempotente y puede repetirse.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
USE noxpana_noxpa;

START TRANSACTION;

-- Garantiza los seis artículos físicos necesarios sin alterar existencias,
-- costos ni configuraciones ya registradas.
INSERT IGNORE INTO inventory_items
  (sku, name, category, unit, package_name, units_per_package,
   lead_time_days, safety_stock_days, target_stock_days,
   current_stock, minimum_stock, average_cost, active)
VALUES
  ('PA-BEER-BALBOA-355', 'Balboa 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-ATLAS-GOLDEN-355', 'Atlas Golden Light 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-PANAMA-355', 'Panamá Lager 355 ml', 'Cervezas nacionales', 'unit', 'Unidad base', 1, 3, 2, 14, 0, 0, 0, TRUE),
  ('PA-BEER-CORONA-355', 'Corona Extra 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-HEINEKEN-330', 'Heineken Original 330 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 4, 3, 18, 0, 0, 0, TRUE),
  ('PA-BEER-MODELO-355', 'Modelo Especial 355 ml', 'Cervezas importadas', 'unit', 'Unidad base', 1, 5, 3, 18, 0, 0, 0, TRUE);

INSERT INTO products
  (sku, barcode, name, category, sale_price, tax_rate, target_margin, image_path, active)
VALUES
  ('POS-BEER-BALBOA-355', NULL, 'Balboa 355 ml', 'Cervezas nacionales', 1.75, 0, 0.7000, '/assets/products/beer-balboa.webp', TRUE),
  ('POS-BEER-ATLAS-GOLDEN-355', NULL, 'Atlas Golden Light 355 ml', 'Cervezas nacionales', 1.50, 0, 0.7000, '/assets/products/beer-atlas-golden.webp', TRUE),
  ('POS-BEER-PANAMA-355', NULL, 'Panamá Lager 355 ml', 'Cervezas nacionales', 1.50, 0, 0.7000, '/assets/products/beer-panama-lager.webp', TRUE),
  ('POS-BEER-CORONA-355', NULL, 'Corona Extra 355 ml', 'Cervezas importadas', 5.00, 0, 0.7000, '/assets/products/beer-corona-extra.webp', TRUE),
  ('POS-BEER-HEINEKEN-330', NULL, 'Heineken Original 330 ml', 'Cervezas importadas', 5.00, 0, 0.7000, '/assets/products/beer-heineken.webp', TRUE),
  ('POS-BEER-MODELO-355', NULL, 'Modelo Especial 355 ml', 'Cervezas importadas', 5.00, 0, 0.7000, '/assets/products/beer-modelo-especial.webp', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  sale_price = VALUES(sale_price),
  image_path = VALUES(image_path),
  active = TRUE;

INSERT INTO product_recipes (product_id, inventory_item_id, quantity)
SELECT p.id, i.id, 1
FROM (
  SELECT 'POS-BEER-BALBOA-355' product_sku, 'PA-BEER-BALBOA-355' item_sku
  UNION ALL SELECT 'POS-BEER-ATLAS-GOLDEN-355', 'PA-BEER-ATLAS-GOLDEN-355'
  UNION ALL SELECT 'POS-BEER-PANAMA-355', 'PA-BEER-PANAMA-355'
  UNION ALL SELECT 'POS-BEER-CORONA-355', 'PA-BEER-CORONA-355'
  UNION ALL SELECT 'POS-BEER-HEINEKEN-330', 'PA-BEER-HEINEKEN-330'
  UNION ALL SELECT 'POS-BEER-MODELO-355', 'PA-BEER-MODELO-355'
) mapping
JOIN products p ON p.sku = mapping.product_sku
JOIN inventory_items i ON i.sku = mapping.item_sku
ON DUPLICATE KEY UPDATE quantity = VALUES(quantity);

COMMIT;

SELECT p.sku, p.name, p.category, p.sale_price, p.image_path,
       i.sku AS inventory_sku, r.quantity
FROM products p
JOIN product_recipes r ON r.product_id = p.id
JOIN inventory_items i ON i.id = r.inventory_item_id
WHERE p.sku LIKE 'POS-BEER-%'
ORDER BY p.category, p.name;
