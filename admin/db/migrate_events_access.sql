-- NOX Control — migración independiente de eventos y accesos QR
-- Compatible con MySQL 8.0+ y phpMyAdmin.
--
-- Use este archivo cuando la base de datos de NOX Control ya existe.
-- Solo agrega las tablas del módulo de eventos; no elimina ni modifica
-- ventas, inventario, usuarios, cajas, planilla u otros datos existentes.
-- Puede ejecutarse más de una vez sin duplicar tablas ni registros.

SET NAMES utf8mb4;
SET time_zone = '-05:00';

USE `noxpana_noxpa`;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  access_mode ENUM('shared', 'personal') NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  capacity INT UNSIGNED NULL,
  status ENUM('active', 'closed', 'cancelled') NOT NULL DEFAULT 'active',
  notes VARCHAR(500) NULL,
  shared_qr_token CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY events_shared_qr_uq (shared_qr_token),
  KEY events_schedule_idx (status, starts_at, ends_at),
  CONSTRAINT events_creator_fk
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT events_schedule_ck CHECK (ends_at > starts_at),
  CONSTRAINT events_capacity_ck CHECK (capacity IS NULL OR capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_guest_lists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY event_guest_lists_event_name_uq (event_id, name),
  KEY event_guest_lists_event_idx (event_id, created_at),
  CONSTRAINT event_guest_lists_event_fk
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_guest_lists_creator_fk
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_guests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  guest_list_id BIGINT UNSIGNED NULL,
  full_name VARCHAR(160) NOT NULL,
  contact VARCHAR(160) NULL,
  notes VARCHAR(300) NULL,
  qr_token CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('invited', 'admitted', 'cancelled') NOT NULL DEFAULT 'invited',
  admitted_at DATETIME NULL,
  admitted_by BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY event_guests_qr_uq (qr_token),
  KEY event_guests_event_status_idx (event_id, status, created_at),
  KEY event_guests_list_idx (guest_list_id, created_at),
  CONSTRAINT event_guests_event_fk
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT event_guests_list_fk
    FOREIGN KEY (guest_list_id) REFERENCES event_guest_lists(id) ON DELETE SET NULL,
  CONSTRAINT event_guests_admitted_user_fk
    FOREIGN KEY (admitted_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT event_guests_creator_fk
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_access_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NULL,
  guest_id BIGINT UNSIGNED NULL,
  token_type ENUM('shared', 'personal', 'unknown') NOT NULL,
  decision ENUM('granted', 'duplicate', 'denied') NOT NULL,
  reason VARCHAR(40) NOT NULL,
  token_hint CHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scanned_by BIGINT UNSIGNED NOT NULL,
  ip_address VARCHAR(64) NULL,
  scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY event_access_event_decision_idx (event_id, decision, scanned_at),
  KEY event_access_guest_idx (guest_id, scanned_at),
  KEY event_access_scanner_idx (scanned_by, scanned_at),
  CONSTRAINT event_access_event_fk
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
  CONSTRAINT event_access_guest_fk
    FOREIGN KEY (guest_id) REFERENCES event_guests(id) ON DELETE SET NULL,
  CONSTRAINT event_access_scanner_fk
    FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Actualiza instalaciones que ya tenían event_guests antes de incorporar listas.
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
