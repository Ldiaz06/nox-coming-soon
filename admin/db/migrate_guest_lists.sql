-- NOOX Control — migración independiente de listas de invitados
-- Compatible con MySQL 8.0+ y phpMyAdmin.
--
-- Use este archivo cuando eventos e invitados ya existen. Agrega sublistas
-- para promotores o grupos sin cambiar tokens, QR, entradas ni contraseñas.
-- Los invitados existentes se asignan a "Lista general".
-- Puede ejecutarse más de una vez.

SET NAMES utf8mb4;
SET time_zone = '-05:00';

USE `noxpana_noxpa`;

CREATE TABLE IF NOT EXISTS event_guest_lists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  promoter_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  promoter_code_hint VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NULL,
  promoter_code_enabled TINYINT(1) NOT NULL DEFAULT 0,
  promoter_code_created_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY event_guest_lists_event_name_uq (event_id, name),
  UNIQUE KEY event_guest_lists_promoter_code_uq (promoter_code_hash),
  KEY event_guest_lists_event_idx (event_id, created_at),
  CONSTRAINT event_guest_lists_event_fk
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_guest_lists_creator_fk
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

SET @nox_add_guest_list_column = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guests'
      AND column_name = 'guest_list_id'
  ),
  'SELECT 1',
  'ALTER TABLE event_guests ADD COLUMN guest_list_id BIGINT UNSIGNED NULL AFTER event_id'
);

PREPARE nox_guest_list_column_migration FROM @nox_add_guest_list_column;
EXECUTE nox_guest_list_column_migration;
DEALLOCATE PREPARE nox_guest_list_column_migration;

SET @nox_add_guest_list_index = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guests'
      AND index_name = 'event_guests_list_idx'
  ),
  'SELECT 1',
  'ALTER TABLE event_guests ADD KEY event_guests_list_idx (guest_list_id, created_at)'
);

PREPARE nox_guest_list_index_migration FROM @nox_add_guest_list_index;
EXECUTE nox_guest_list_index_migration;
DEALLOCATE PREPARE nox_guest_list_index_migration;

SET @nox_add_guest_list_fk = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE()
      AND table_name = 'event_guests'
      AND column_name = 'guest_list_id'
      AND referenced_table_name = 'event_guest_lists'
      AND referenced_column_name = 'id'
  ),
  'SELECT 1',
  'ALTER TABLE event_guests ADD CONSTRAINT event_guests_list_fk FOREIGN KEY (guest_list_id) REFERENCES event_guest_lists(id) ON DELETE SET NULL'
);

PREPARE nox_guest_list_fk_migration FROM @nox_add_guest_list_fk;
EXECUTE nox_guest_list_fk_migration;
DEALLOCATE PREPARE nox_guest_list_fk_migration;

INSERT INTO event_guest_lists (event_id, name, created_by)
SELECT event.id, 'Lista general', event.created_by
FROM events event
WHERE event.access_mode = 'personal'
  AND NOT EXISTS (
    SELECT 1
    FROM event_guest_lists guest_list
    WHERE guest_list.event_id = event.id
  );

UPDATE event_guests guest
SET guest_list_id = (
  SELECT MIN(guest_list.id)
  FROM event_guest_lists guest_list
  WHERE guest_list.event_id = guest.event_id
)
WHERE guest.guest_list_id IS NULL;
