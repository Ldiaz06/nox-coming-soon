-- NOOX Control — migración independiente para eliminación de inventario
-- Compatible con MySQL 8.0+ y phpMyAdmin.
--
-- Use este archivo cuando la base de datos de NOOX Control ya existe.
-- Agrega la marca de eliminación lógica a artículos y productos y, en bases
-- anteriores, la columna de inventario reservado requerida por esta operación.
-- No cambia la existencia física ni elimina compras, ventas, cuentas o
-- auditorías; solo reconstruye la cantidad reservada por cuentas abiertas.
-- Puede ejecutarse más de una vez sin duplicar columnas ni alterar datos.

SET NAMES utf8mb4;
SET time_zone = '-05:00';

USE `noxpana_noxpa`;

-- Se usan sentencias preparadas en lugar de procedimientos para que la
-- importación funcione igual desde phpMyAdmin y desde la terminal.
SET @nox_add_inventory_reserved_stock = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'inventory_items'
      AND column_name = 'reserved_stock'
  ),
  'SELECT 1',
  'ALTER TABLE inventory_items ADD COLUMN reserved_stock DECIMAL(14,4) NOT NULL DEFAULT 0 AFTER current_stock'
);

PREPARE nox_inventory_reservation_migration
FROM @nox_add_inventory_reserved_stock;
EXECUTE nox_inventory_reservation_migration;
DEALLOCATE PREPARE nox_inventory_reservation_migration;

-- Reconstruir las reservas reales en instalaciones que ya tenían cuentas
-- abiertas antes de agregar la columna. Esto también corrige cualquier valor
-- heredado que hubiera quedado desincronizado.
UPDATE inventory_items
SET reserved_stock = 0;

UPDATE inventory_items inventory
JOIN (
  SELECT recipe.inventory_item_id,
         SUM(recipe.quantity * tab_item.quantity) AS reserved_quantity
  FROM customer_tabs tab
  JOIN customer_tab_items tab_item ON tab_item.tab_id = tab.id
  JOIN product_recipes recipe ON recipe.product_id = tab_item.product_id
  WHERE tab.status = 'open'
  GROUP BY recipe.inventory_item_id
) reservations ON reservations.inventory_item_id = inventory.id
SET inventory.reserved_stock = GREATEST(0, reservations.reserved_quantity);

SET @nox_add_inventory_deleted_at = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'inventory_items'
      AND column_name = 'deleted_at'
  ),
  'SELECT 1',
  'ALTER TABLE inventory_items ADD COLUMN deleted_at DATETIME NULL AFTER active'
);

PREPARE nox_inventory_migration_statement
FROM @nox_add_inventory_deleted_at;
EXECUTE nox_inventory_migration_statement;
DEALLOCATE PREPARE nox_inventory_migration_statement;

SET @nox_add_product_deleted_at = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'products'
      AND column_name = 'deleted_at'
  ),
  'SELECT 1',
  'ALTER TABLE products ADD COLUMN deleted_at DATETIME NULL AFTER active'
);

PREPARE nox_product_migration_statement
FROM @nox_add_product_deleted_at;
EXECUTE nox_product_migration_statement;
DEALLOCATE PREPARE nox_product_migration_statement;
