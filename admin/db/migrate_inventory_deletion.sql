-- NOX Control — migración independiente para eliminación de inventario
-- Compatible con MySQL 8.0+ y phpMyAdmin.
--
-- Use este archivo cuando la base de datos de NOX Control ya existe.
-- Agrega la marca de eliminación lógica a artículos y productos y, en bases
-- anteriores, la columna de inventario reservado requerida por esta operación.
-- No elimina ni modifica inventario, compras, ventas, cuentas o auditorías.
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
