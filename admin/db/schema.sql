-- NOX Control — instalador completo e idempotente de MySQL
-- Compatible con MySQL 8.0+ y phpMyAdmin.
--
-- Crea la base noxpana_noxpa cuando no existe, la selecciona y prepara todas
-- las tablas del sistema. También puede volver a ejecutarse sobre una
-- instalación existente: no elimina tablas ni registros. Antes de aplicarlo en
-- producción, conserve siempre un respaldo reciente.

SET NAMES utf8mb4;
SET time_zone = '-05:00';

-- Si la base ya existe, no se solicita permiso global para volver a crearla.
-- Si no existe, la cuenta que ejecuta este archivo necesita CREATE DATABASE.
SET @nox_create_database_sql = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'noxpana_noxpa'
  ),
  'SELECT 1',
  'CREATE DATABASE `noxpana_noxpa` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
);

PREPARE nox_create_database_statement FROM @nox_create_database_sql;
EXECUTE nox_create_database_statement;
DEALLOCATE PREPARE nox_create_database_statement;

USE `noxpana_noxpa`;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role ENUM('admin', 'supervisor', 'cashier') NOT NULL,
  status ENUM('active', 'inactive', 'locked') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_uq (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ip_address VARCHAR(64) NOT NULL,
  username VARCHAR(80) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY login_attempts_lookup_idx (ip_address, username, attempted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employees (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  employee_code VARCHAR(40) NOT NULL,
  document_id VARCHAR(80) NULL,
  full_name VARCHAR(160) NOT NULL,
  position_name VARCHAR(100) NOT NULL,
  pay_type ENUM('hourly', 'biweekly') NOT NULL DEFAULT 'hourly',
  hourly_rate DECIMAL(12,2) NOT NULL DEFAULT 0,
  monthly_salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  overtime_multiplier DECIMAL(6,2) NOT NULL DEFAULT 1.50,
  hired_on DATE NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY employees_code_uq (employee_code),
  UNIQUE KEY employees_user_uq (user_id),
  CONSTRAINT employees_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS terminals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  location_name VARCHAR(120) NOT NULL DEFAULT 'Bar principal',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  assigned_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY terminals_name_uq (name),
  UNIQUE KEY terminals_user_uq (assigned_user_id),
  CONSTRAINT terminals_user_fk FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit ENUM('unit', 'bottle', 'ml', 'liter', 'gram', 'kg', 'portion') NOT NULL DEFAULT 'unit',
  current_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
  minimum_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
  average_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY inventory_sku_uq (sku),
  KEY inventory_category_idx (category),
  KEY inventory_active_idx (active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku VARCHAR(80) NOT NULL,
  barcode VARCHAR(120) NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(100) NOT NULL,
  sale_price DECIMAL(12,2) NOT NULL,
  tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY products_sku_uq (sku),
  UNIQUE KEY products_barcode_uq (barcode),
  KEY products_category_idx (category),
  CONSTRAINT products_price_ck CHECK (sale_price >= 0),
  CONSTRAINT products_tax_ck CHECK (tax_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_recipes (
  product_id BIGINT UNSIGNED NOT NULL,
  inventory_item_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  PRIMARY KEY (product_id, inventory_item_id),
  CONSTRAINT recipes_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT recipes_item_fk FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT,
  CONSTRAINT recipes_quantity_ck CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  tax_id VARCHAR(80) NULL,
  contact_name VARCHAR(160) NULL,
  phone VARCHAR(60) NULL,
  email VARCHAR(190) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY suppliers_name_idx (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_id BIGINT UNSIGNED NULL,
  invoice_number VARCHAR(100) NULL,
  purchased_at DATETIME NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('draft', 'received', 'void') NOT NULL DEFAULT 'received',
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY purchases_date_idx (purchased_at),
  CONSTRAINT purchases_supplier_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT purchases_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purchase_id BIGINT UNSIGNED NOT NULL,
  inventory_item_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  unit_cost DECIMAL(14,4) NOT NULL,
  line_total DECIMAL(14,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED,
  PRIMARY KEY (id),
  CONSTRAINT purchase_items_purchase_fk FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT purchase_items_inventory_fk FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cash_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terminal_id BIGINT UNSIGNED NOT NULL,
  opened_by BIGINT UNSIGNED NOT NULL,
  closed_by BIGINT UNSIGNED NULL,
  opening_amount DECIMAL(12,2) NOT NULL,
  expected_cash DECIMAL(12,2) NULL,
  counted_cash DECIMAL(12,2) NULL,
  cash_difference DECIMAL(12,2) NULL,
  notes VARCHAR(500) NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  PRIMARY KEY (id),
  KEY cash_sessions_status_idx (status, opened_at),
  CONSTRAINT cash_terminal_fk FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE RESTRICT,
  CONSTRAINT cash_open_user_fk FOREIGN KEY (opened_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT cash_close_user_fk FOREIGN KEY (closed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_number VARCHAR(50) NOT NULL,
  cash_session_id BIGINT UNSIGNED NOT NULL,
  cashier_id BIGINT UNSIGNED NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  status ENUM('completed', 'voided', 'refunded') NOT NULL DEFAULT 'completed',
  void_reason VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at DATETIME NULL,
  voided_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY sales_receipt_uq (receipt_number),
  KEY sales_date_idx (created_at),
  KEY sales_session_idx (cash_session_id, status),
  CONSTRAINT sales_session_fk FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT sales_cashier_fk FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT sales_void_user_fk FOREIGN KEY (voided_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY sale_items_sale_idx (sale_id),
  CONSTRAINT sale_items_sale_fk FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT sale_items_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id BIGINT UNSIGNED NOT NULL,
  method ENUM('cash', 'card', 'yappy') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reference_number VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY payments_sale_idx (sale_id),
  CONSTRAINT payments_sale_fk FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inventory_item_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM('opening', 'purchase', 'sale', 'waste', 'adjustment', 'count', 'void') NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
  reference_type VARCHAR(40) NULL,
  reference_id BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY movements_item_date_idx (inventory_item_id, created_at),
  KEY movements_reference_idx (reference_type, reference_id),
  CONSTRAINT movements_inventory_fk FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE RESTRICT,
  CONSTRAINT movements_user_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS time_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  clock_in DATETIME NOT NULL,
  clock_out DATETIME NULL,
  break_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('open', 'submitted', 'approved', 'rejected') NOT NULL DEFAULT 'open',
  notes VARCHAR(300) NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY time_employee_date_idx (employee_id, clock_in),
  KEY time_status_idx (status),
  CONSTRAINT time_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
  CONSTRAINT time_approver_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_type ENUM('biweekly', 'monthly') NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status ENUM('draft', 'calculated', 'approved', 'paid') NOT NULL DEFAULT 'draft',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  paid_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY payroll_period_uq (starts_on, ends_on),
  CONSTRAINT payroll_period_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_period_approver_fk FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payroll_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payroll_period_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NOT NULL,
  regular_hours DECIMAL(9,2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(9,2) NOT NULL DEFAULT 0,
  base_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  overtime_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  bonuses DECIMAL(12,2) NOT NULL DEFAULT 0,
  deductions DECIMAL(12,2) NOT NULL DEFAULT 0,
  gross_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY payroll_entry_uq (payroll_period_id, employee_id),
  CONSTRAINT payroll_entry_period_fk FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT payroll_entry_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY audit_entity_idx (entity_type, entity_id),
  KEY audit_user_date_idx (user_id, created_at),
  CONSTRAINT audit_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO terminals (name, location_name)
SELECT 'Caja principal', 'Bar principal'
WHERE NOT EXISTS (SELECT 1 FROM terminals WHERE name = 'Caja principal');

-- Las instalaciones anteriores usaban correo como credencial, empleados
-- mensuales y cajas sin usuario asignado. Este procedimiento detecta el estado
-- real de cada instalación y aplica únicamente los cambios que hagan falta.
DROP PROCEDURE IF EXISTS nox_prepare_database;

DELIMITER $$

CREATE PROCEDURE nox_prepare_database()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE secondary_column_exists INT DEFAULT 0;
  DECLARE index_exists INT DEFAULT 0;
  DECLARE constraint_exists INT DEFAULT 0;

  -- users.email -> users.username
  SELECT COUNT(*) INTO column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'username';

  SELECT COUNT(*) INTO secondary_column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'email';

  IF column_exists = 0 AND secondary_column_exists = 1 THEN
    UPDATE users
    SET email = CONCAT('usuario-', id)
    WHERE email IS NULL OR TRIM(email) = '';

    UPDATE users
    SET email = CONCAT(LEFT(email, 55), '-', id)
    WHERE CHAR_LENGTH(email) > 80;

    ALTER TABLE users
      CHANGE COLUMN email username VARCHAR(80) NOT NULL;
  ELSEIF column_exists = 0 THEN
    ALTER TABLE users
      ADD COLUMN username VARCHAR(80) NULL AFTER id;
  END IF;

  -- Completar nombres vacíos, limitar valores heredados y resolver duplicados
  -- sin eliminar ninguna cuenta.
  UPDATE users
  SET username = CONCAT('usuario-', id)
  WHERE username IS NULL OR TRIM(username) = '';

  UPDATE users
  SET username = CONCAT(LEFT(username, 55), '-', id)
  WHERE CHAR_LENGTH(username) > 80;

  UPDATE users duplicate_user
  INNER JOIN users original_user
    ON original_user.username = duplicate_user.username
   AND original_user.id < duplicate_user.id
  SET duplicate_user.username =
    CONCAT(LEFT(duplicate_user.username, 55), '-', duplicate_user.id);

  ALTER TABLE users
    MODIFY COLUMN username VARCHAR(80) NOT NULL;

  SELECT COUNT(*) INTO index_exists
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'username'
    AND non_unique = 0;

  IF index_exists = 0 THEN
    ALTER TABLE users
      ADD UNIQUE KEY users_username_uq (username);
  END IF;

  -- login_attempts.email -> login_attempts.username
  SELECT COUNT(*) INTO column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'login_attempts'
    AND column_name = 'username';

  SELECT COUNT(*) INTO secondary_column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'login_attempts'
    AND column_name = 'email';

  IF column_exists = 0 AND secondary_column_exists = 1 THEN
    UPDATE login_attempts
    SET email = 'desconocido'
    WHERE email IS NULL OR TRIM(email) = '';

    UPDATE login_attempts
    SET email = LEFT(email, 80)
    WHERE CHAR_LENGTH(email) > 80;

    ALTER TABLE login_attempts
      CHANGE COLUMN email username VARCHAR(80) NOT NULL;
  ELSEIF column_exists = 0 THEN
    ALTER TABLE login_attempts
      ADD COLUMN username VARCHAR(80) NOT NULL DEFAULT 'desconocido' AFTER ip_address;
  END IF;

  UPDATE login_attempts
  SET username = 'desconocido'
  WHERE username IS NULL OR TRIM(username) = '';

  UPDATE login_attempts
  SET username = LEFT(username, 80)
  WHERE CHAR_LENGTH(username) > 80;

  ALTER TABLE login_attempts
    MODIFY COLUMN username VARCHAR(80) NOT NULL;

  SELECT COUNT(*) INTO index_exists
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'login_attempts'
    AND index_name = 'login_attempts_lookup_idx';

  IF index_exists = 0 THEN
    ALTER TABLE login_attempts
      ADD KEY login_attempts_lookup_idx (ip_address, username, attempted_at);
  END IF;

  -- Convertir la modalidad mensual heredada a quincenal. La tarifa siempre se
  -- conserva o se calcula a partir del salario mensual usando 208 horas/mes.
  ALTER TABLE employees
    MODIFY COLUMN pay_type
      ENUM('hourly', 'monthly', 'biweekly') NOT NULL DEFAULT 'hourly';

  UPDATE employees
  SET hourly_rate = CASE
        WHEN pay_type = 'monthly'
         AND hourly_rate = 0
         AND monthly_salary > 0
          THEN ROUND(monthly_salary / 208, 2)
        ELSE hourly_rate
      END,
      pay_type = CASE
        WHEN pay_type = 'monthly' THEN 'biweekly'
        ELSE pay_type
      END;

  ALTER TABLE employees
    MODIFY COLUMN pay_type
      ENUM('hourly', 'biweekly') NOT NULL DEFAULT 'hourly';

  -- Añadir y proteger la caja asignada por usuario.
  SELECT COUNT(*) INTO column_exists
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'terminals'
    AND column_name = 'assigned_user_id';

  IF column_exists = 0 THEN
    ALTER TABLE terminals
      ADD COLUMN assigned_user_id BIGINT UNSIGNED NULL AFTER status;
  END IF;

  UPDATE terminals terminal
  LEFT JOIN users user_account ON user_account.id = terminal.assigned_user_id
  SET terminal.assigned_user_id = NULL
  WHERE terminal.assigned_user_id IS NOT NULL
    AND user_account.id IS NULL;

  UPDATE terminals duplicate_terminal
  INNER JOIN terminals original_terminal
    ON original_terminal.assigned_user_id = duplicate_terminal.assigned_user_id
   AND original_terminal.id < duplicate_terminal.id
  SET duplicate_terminal.assigned_user_id = NULL
  WHERE duplicate_terminal.assigned_user_id IS NOT NULL;

  SELECT COUNT(*) INTO index_exists
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'terminals'
    AND column_name = 'assigned_user_id'
    AND non_unique = 0;

  IF index_exists = 0 THEN
    ALTER TABLE terminals
      ADD UNIQUE KEY terminals_user_uq (assigned_user_id);
  END IF;

  SELECT COUNT(*) INTO constraint_exists
  FROM information_schema.key_column_usage
  WHERE table_schema = DATABASE()
    AND table_name = 'terminals'
    AND column_name = 'assigned_user_id'
    AND referenced_table_name = 'users'
    AND referenced_column_name = 'id';

  IF constraint_exists = 0 THEN
    ALTER TABLE terminals
      ADD CONSTRAINT terminals_user_fk
      FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  -- Solo en una base sin usuarios se crea el acceso inicial. Nunca modifica la
  -- contraseña ni los datos de una cuenta que ya exista.
  INSERT INTO users
    (username, password_hash, full_name, role, status)
  SELECT
    'admin',
    '$2y$12$Fh4SPyFi.FP8EwJxggVMzu2xRC8zbPB1zqYOIsyE7vIBM9NQmyiYO',
    'Administrador NOX',
    'admin',
    'active'
  WHERE NOT EXISTS (SELECT 1 FROM users);

  -- Reutilizar primero una caja nominal que esté libre y después crear las
  -- cajas que falten. El nombre estable permite ejecutar el archivo otra vez.
  UPDATE terminals terminal
  INNER JOIN users user_account
    ON terminal.name = CONCAT('Caja usuario ', user_account.id)
  LEFT JOIN terminals owned_terminal
    ON owned_terminal.assigned_user_id = user_account.id
  SET terminal.assigned_user_id = user_account.id,
      terminal.status = 'active'
  WHERE user_account.status = 'active'
    AND terminal.assigned_user_id IS NULL
    AND owned_terminal.id IS NULL;

  INSERT INTO terminals
    (name, location_name, status, assigned_user_id)
  SELECT
    CONCAT('Caja usuario ', user_account.id),
    'Bar principal',
    'active',
    user_account.id
  FROM users user_account
  WHERE user_account.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM terminals terminal
      WHERE terminal.assigned_user_id = user_account.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM terminals terminal
      WHERE terminal.name = CONCAT('Caja usuario ', user_account.id)
    );
END$$

DELIMITER ;

CALL nox_prepare_database();
DROP PROCEDURE IF EXISTS nox_prepare_database;
