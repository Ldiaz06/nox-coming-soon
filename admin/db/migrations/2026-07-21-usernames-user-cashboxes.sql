-- Ejecutar una sola vez sobre una instalación existente de NOX Control.
-- Antes de importar este archivo, haga un respaldo de la base de datos.

ALTER TABLE users
  CHANGE COLUMN email username VARCHAR(80) NOT NULL;

ALTER TABLE login_attempts
  CHANGE COLUMN email username VARCHAR(80) NOT NULL;

ALTER TABLE employees
  MODIFY COLUMN pay_type ENUM('hourly', 'monthly', 'biweekly') NOT NULL DEFAULT 'hourly';

UPDATE employees
SET hourly_rate = CASE
      WHEN pay_type = 'monthly' AND hourly_rate = 0 AND monthly_salary > 0
        THEN ROUND(monthly_salary / 208, 2)
      ELSE hourly_rate
    END,
    pay_type = CASE WHEN pay_type = 'monthly' THEN 'biweekly' ELSE pay_type END;

ALTER TABLE employees
  MODIFY COLUMN pay_type ENUM('hourly', 'biweekly') NOT NULL DEFAULT 'hourly';

ALTER TABLE terminals
  ADD COLUMN assigned_user_id BIGINT UNSIGNED NULL AFTER status,
  ADD UNIQUE KEY terminals_user_uq (assigned_user_id),
  ADD CONSTRAINT terminals_user_fk
    FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;

INSERT INTO terminals (name, location_name, status, assigned_user_id)
SELECT CONCAT('Caja ', u.id, ' - ', LEFT(u.full_name, 70)), 'Bar principal', 'active', u.id
FROM users u
WHERE u.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM terminals t WHERE t.assigned_user_id = u.id
  );
