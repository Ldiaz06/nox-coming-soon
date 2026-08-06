-- NOX Control — portal público de promotores
-- Compatible con MySQL 8.0+ y phpMyAdmin.
-- Puede ejecutarse más de una vez y no cambia códigos QR existentes.

SET NAMES utf8mb4;
SET time_zone = '-05:00';

USE `noxpana_noxpa`;

SET @nox_promoter_hash_column = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guest_lists'
      AND column_name = 'promoter_code_hash'
  ),
  'SELECT 1',
  'ALTER TABLE event_guest_lists ADD COLUMN promoter_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER name'
);
PREPARE nox_promoter_hash_migration FROM @nox_promoter_hash_column;
EXECUTE nox_promoter_hash_migration;
DEALLOCATE PREPARE nox_promoter_hash_migration;

SET @nox_promoter_hint_column = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guest_lists'
      AND column_name = 'promoter_code_hint'
  ),
  'SELECT 1',
  'ALTER TABLE event_guest_lists ADD COLUMN promoter_code_hint VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER promoter_code_hash'
);
PREPARE nox_promoter_hint_migration FROM @nox_promoter_hint_column;
EXECUTE nox_promoter_hint_migration;
DEALLOCATE PREPARE nox_promoter_hint_migration;

SET @nox_promoter_enabled_column = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guest_lists'
      AND column_name = 'promoter_code_enabled'
  ),
  'SELECT 1',
  'ALTER TABLE event_guest_lists ADD COLUMN promoter_code_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER promoter_code_hint'
);
PREPARE nox_promoter_enabled_migration FROM @nox_promoter_enabled_column;
EXECUTE nox_promoter_enabled_migration;
DEALLOCATE PREPARE nox_promoter_enabled_migration;

SET @nox_promoter_created_column = IF(
  EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guest_lists'
      AND column_name = 'promoter_code_created_at'
  ),
  'SELECT 1',
  'ALTER TABLE event_guest_lists ADD COLUMN promoter_code_created_at DATETIME NULL AFTER promoter_code_enabled'
);
PREPARE nox_promoter_created_migration FROM @nox_promoter_created_column;
EXECUTE nox_promoter_created_migration;
DEALLOCATE PREPARE nox_promoter_created_migration;

SET @nox_promoter_code_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guest_lists'
      AND index_name = 'event_guest_lists_promoter_code_uq'
  ),
  'SELECT 1',
  'ALTER TABLE event_guest_lists ADD UNIQUE KEY event_guest_lists_promoter_code_uq (promoter_code_hash)'
);
PREPARE nox_promoter_index_migration FROM @nox_promoter_code_index;
EXECUTE nox_promoter_index_migration;
DEALLOCATE PREPARE nox_promoter_index_migration;
