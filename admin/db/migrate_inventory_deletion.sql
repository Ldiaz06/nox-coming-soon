-- NOX Control — migración independiente para eliminación de inventario
-- Compatible con MySQL 8.0+ y phpMyAdmin.
--
-- Use este archivo cuando la base de datos de NOX Control ya existe.
-- Solo agrega la marca de eliminación lógica a artículos y productos.
-- No elimina ni modifica inventario, compras, ventas, cuentas o auditorías.
-- Puede ejecutarse más de una vez sin duplicar columnas ni alterar datos.

SET NAMES utf8mb4;
SET time_zone = '-05:00';

USE `noxpana_noxpa`;

DROP PROCEDURE IF EXISTS nox_migrate_inventory_deletion;

DELIMITER $$

CREATE PROCEDURE nox_migrate_inventory_deletion()
BEGIN
  DECLARE column_exists INT DEFAULT 0;

  SELECT COUNT(*) INTO column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'inventory_items'
    AND column_name = 'deleted_at';

  IF column_exists = 0 THEN
    ALTER TABLE inventory_items
      ADD COLUMN deleted_at DATETIME NULL AFTER active;
  END IF;

  SELECT COUNT(*) INTO column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'products'
    AND column_name = 'deleted_at';

  IF column_exists = 0 THEN
    ALTER TABLE products
      ADD COLUMN deleted_at DATETIME NULL AFTER active;
  END IF;
END$$

DELIMITER ;

CALL nox_migrate_inventory_deletion();
DROP PROCEDURE IF EXISTS nox_migrate_inventory_deletion;
