<?php
declare(strict_types=1);

function normalized_username(array $data): string
{
    $username = mb_strtolower(value_string($data, 'username', 3, 80) ?? '');
    if (!preg_match('/^[\p{L}\p{N}._@-]+$/u', $username)) {
        throw new ApiError('El nombre de usuario solo puede contener letras, números, punto, guion y guion bajo.');
    }
    return $username;
}

function auth_user_payload(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'fullName' => $user['full_name'],
        'role' => $user['role'],
    ];
}

function auth_login(array $params = [])
{
    $body = request_body();
    try {
        $username = normalized_username($body);
        $password = value_string($body, 'password', 4, 200) ?? '';
    } catch (ApiError $error) {
        throw new ApiError('Usuario o contraseña incorrectos.', 401);
    }
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    db()->exec('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');

    $attempts = db()->prepare(
        'SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND username = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
    );
    $attempts->execute([$ip, $username]);
    if ((int) $attempts->fetchColumn() >= 10) {
        throw new ApiError('Demasiados intentos. Espere 15 minutos.', 429);
    }

    $statement = db()->prepare('SELECT id, username, password_hash, full_name, role, status FROM users WHERE username = ? LIMIT 1');
    $statement->execute([$username]);
    $user = $statement->fetch();
    $valid = $user && $user['status'] === 'active' && password_verify($password, $user['password_hash']);
    if (!$valid) {
        $failure = db()->prepare('INSERT INTO login_attempts (ip_address, username) VALUES (?, ?)');
        $failure->execute([$ip, $username]);
        throw new ApiError('Usuario o contraseña incorrectos.', 401);
    }

    db()->prepare('DELETE FROM login_attempts WHERE ip_address = ? AND username = ?')->execute([$ip, $username]);
    db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));

    json_response(['user' => auth_user_payload($user), 'csrf' => csrf_token()]);
}

function auth_logout(array $params = [])
{
    require_csrf();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $settings = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $settings['path'], $settings['domain'] ?? '', $settings['secure'], $settings['httponly']);
    }
    session_destroy();
    no_content();
}

function auth_me(array $params = [])
{
    $user = require_auth();
    json_response(['user' => auth_user_payload($user), 'csrf' => csrf_token()]);
}

function users_list(array $params = [])
{
    require_roles(['admin']);
    $rows = db()->query(
        'SELECT u.id, u.username, u.full_name AS fullName, u.role, u.status, u.last_login_at AS lastLoginAt,
                e.id AS employeeId, e.employee_code AS employeeCode, e.position_name AS positionName,
                e.pay_type AS payType, e.hourly_rate AS hourlyRate, e.overtime_multiplier AS overtimeMultiplier,
                t.id AS terminalId, t.name AS terminalName, t.status AS terminalStatus
         FROM users u
         LEFT JOIN employees e ON e.user_id = u.id
         LEFT JOIN terminals t ON t.assigned_user_id = u.id
         ORDER BY u.full_name'
    )->fetchAll();
    json_response(['users' => $rows]);
}

function users_create(array $params = [])
{
    require_csrf();
    $actor = require_roles(['admin']);
    $body = request_body();
    $username = normalized_username($body);
    $password = value_string($body, 'password', 4, 200) ?? '';
    $fullName = value_string($body, 'fullName', 2, 160) ?? '';
    $role = require_choice($body['role'] ?? '', ['admin', 'supervisor', 'cashier'], 'role');
    $employee = isset($body['employee']) && is_array($body['employee']) ? $body['employee'] : null;
    $terminal = isset($body['terminal']) && is_array($body['terminal']) ? $body['terminal'] : null;

    try {
        $id = transaction(function (PDO $pdo) use ($actor, $username, $password, $fullName, $role, $employee, $terminal): int {
            $statement = $pdo->prepare('INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
            $statement->execute([$username, password_hash($password, PASSWORD_DEFAULT), $fullName, $role]);
            $id = (int) $pdo->lastInsertId();

            if ($employee) {
                $code = value_string($employee, 'code', 1, 40) ?? '';
                $position = value_string($employee, 'position', 2, 100) ?? '';
                $payType = require_choice($employee['payType'] ?? '', ['hourly', 'biweekly'], 'payType');
                $hourlyRate = value_number($employee, 'hourlyRate', 0);
                $multiplier = isset($employee['overtimeMultiplier'])
                    ? value_number($employee, 'overtimeMultiplier', 1, 5)
                    : 1.5;
                $employeeStatement = $pdo->prepare(
                    'INSERT INTO employees
                       (user_id, employee_code, full_name, position_name, pay_type, hourly_rate, monthly_salary, overtime_multiplier)
                     VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
                );
                $employeeStatement->execute([$id, $code, $fullName, $position, $payType, $hourlyRate, $multiplier]);
            }

            if ($terminal && !empty($terminal['enabled'])) {
                $terminalName = value_string($terminal, 'name', 2, 100, false) ?? ('Caja ' . $id . ' - ' . $fullName);
                $terminalStatement = $pdo->prepare(
                    "INSERT INTO terminals (name, location_name, status, assigned_user_id) VALUES (?, 'Bar principal', 'active', ?)"
                );
                $terminalStatement->execute([$terminalName, $id]);
            }

            audit_log($pdo, $actor, 'create', 'user', $id, null, ['username' => $username, 'role' => $role]);
            return $id;
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El usuario, código de empleado o nombre de caja ya existe.', 409);
        }
        throw $error;
    }
    json_response(['id' => $id], 201);
}

function users_update(array $params)
{
    require_csrf();
    $actor = require_roles(['admin']);
    $id = path_id($params);
    $body = request_body();
    if ($id === (int) $actor['id'] && isset($body['status']) && $body['status'] !== 'active') {
        throw new ApiError('No puede desactivar su propia cuenta.');
    }
    if ($id === (int) $actor['id'] && isset($body['role']) && $body['role'] !== 'admin') {
        throw new ApiError('No puede quitarse su propio rol de administrador.');
    }
    if (!$body) {
        throw new ApiError('Debe enviar al menos un cambio.');
    }

    try {
        transaction(function (PDO $pdo) use ($actor, $id, $body): void {
            $select = $pdo->prepare('SELECT id, username, full_name, role, status FROM users WHERE id = ? FOR UPDATE');
            $select->execute([$id]);
            $before = $select->fetch();
            if (!$before) {
                throw new ApiError('Usuario no encontrado.', 404);
            }

            $fields = [];
            $values = [];
            if (array_key_exists('username', $body)) {
                $fields[] = 'username = ?';
                $values[] = normalized_username($body);
            }
            if (array_key_exists('fullName', $body)) {
                $fields[] = 'full_name = ?';
                $values[] = value_string($body, 'fullName', 2, 160);
            }
            if (array_key_exists('role', $body)) {
                $fields[] = 'role = ?';
                $values[] = require_choice($body['role'], ['admin', 'supervisor', 'cashier'], 'role');
            }
            if (array_key_exists('status', $body)) {
                $fields[] = 'status = ?';
                $values[] = require_choice($body['status'], ['active', 'inactive', 'locked'], 'status');
            }
            if (!empty($body['password'])) {
                $fields[] = 'password_hash = ?';
                $values[] = password_hash(value_string($body, 'password', 4, 200) ?? '', PASSWORD_DEFAULT);
            }
            if ($fields) {
                $values[] = $id;
                $update = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?');
                $update->execute($values);
            }

            $fullName = array_key_exists('fullName', $body)
                ? value_string($body, 'fullName', 2, 160)
                : $before['full_name'];
            $pdo->prepare('UPDATE employees SET full_name = ? WHERE user_id = ?')->execute([$fullName, $id]);

            if (isset($body['employee']) && is_array($body['employee'])) {
                $employee = $body['employee'];
                $code = value_string($employee, 'code', 1, 40) ?? '';
                $position = value_string($employee, 'position', 2, 100) ?? '';
                $payType = require_choice($employee['payType'] ?? '', ['hourly', 'biweekly'], 'payType');
                $hourlyRate = value_number($employee, 'hourlyRate', 0);
                $existing = $pdo->prepare('SELECT id FROM employees WHERE user_id = ? FOR UPDATE');
                $existing->execute([$id]);
                if ($existing->fetchColumn()) {
                    $pdo->prepare(
                        'UPDATE employees SET employee_code = ?, full_name = ?, position_name = ?,
                         pay_type = ?, hourly_rate = ?, monthly_salary = 0, status = \'active\' WHERE user_id = ?'
                    )->execute([$code, $fullName, $position, $payType, $hourlyRate, $id]);
                } else {
                    $pdo->prepare(
                        'INSERT INTO employees
                           (user_id, employee_code, full_name, position_name, pay_type, hourly_rate, monthly_salary, overtime_multiplier)
                         VALUES (?, ?, ?, ?, ?, ?, 0, 1.5)'
                    )->execute([$id, $code, $fullName, $position, $payType, $hourlyRate]);
                }
            }

            if (isset($body['terminal']) && is_array($body['terminal'])) {
                $terminal = $body['terminal'];
                $terminalSelect = $pdo->prepare('SELECT id FROM terminals WHERE assigned_user_id = ? FOR UPDATE');
                $terminalSelect->execute([$id]);
                $terminalId = $terminalSelect->fetchColumn();
                if (!empty($terminal['enabled'])) {
                    $terminalName = value_string($terminal, 'name', 2, 100, false) ?? ('Caja ' . $id . ' - ' . $fullName);
                    if ($terminalId) {
                        $pdo->prepare("UPDATE terminals SET name = ?, status = 'active' WHERE id = ?")
                            ->execute([$terminalName, $terminalId]);
                    } else {
                        $pdo->prepare(
                            "INSERT INTO terminals (name, location_name, status, assigned_user_id) VALUES (?, 'Bar principal', 'active', ?)"
                        )->execute([$terminalName, $id]);
                    }
                } elseif ($terminalId) {
                    $open = $pdo->prepare("SELECT id FROM cash_sessions WHERE terminal_id = ? AND status = 'open' LIMIT 1");
                    $open->execute([$terminalId]);
                    if ($open->fetchColumn()) {
                        throw new ApiError('Debe cerrar la caja antes de desactivarla.', 409);
                    }
                    $pdo->prepare("UPDATE terminals SET status = 'inactive' WHERE id = ?")->execute([$terminalId]);
                }
            }

            $after = $body;
            unset($after['password']);
            audit_log($pdo, $actor, 'update', 'user', $id, $before, $after);
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El usuario, código de empleado o nombre de caja ya existe.', 409);
        }
        throw $error;
    }
    no_content();
}
