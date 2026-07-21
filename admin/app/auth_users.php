<?php
declare(strict_types=1);

function auth_login(array $params = [])
{
    $body = request_body();
    $email = strtolower(value_string($body, 'email', 5, 190) ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new ApiError('Correo o contraseña incorrectos.', 401);
    }
    $password = value_string($body, 'password', 8, 200) ?? '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    db()->exec('DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');

    $attempts = db()->prepare(
        'SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND email = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
    );
    $attempts->execute([$ip, $email]);
    if ((int) $attempts->fetchColumn() >= 10) {
        throw new ApiError('Demasiados intentos. Espere 15 minutos.', 429);
    }

    $statement = db()->prepare('SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = ? LIMIT 1');
    $statement->execute([$email]);
    $user = $statement->fetch();
    $valid = $user && $user['status'] === 'active' && password_verify($password, $user['password_hash']);
    if (!$valid) {
        $failure = db()->prepare('INSERT INTO login_attempts (ip_address, email) VALUES (?, ?)');
        $failure->execute([$ip, $email]);
        throw new ApiError('Correo o contraseña incorrectos.', 401);
    }

    db()->prepare('DELETE FROM login_attempts WHERE ip_address = ? AND email = ?')->execute([$ip, $email]);
    db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$user['id']]);
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int) $user['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(32));

    json_response([
        'user' => [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'fullName' => $user['full_name'],
            'role' => $user['role'],
        ],
        'csrf' => csrf_token(),
    ]);
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
    json_response([
        'user' => [
            'id' => (int) $user['id'],
            'email' => $user['email'],
            'fullName' => $user['full_name'],
            'role' => $user['role'],
        ],
        'csrf' => csrf_token(),
    ]);
}

function users_list(array $params = [])
{
    require_roles(['admin']);
    $rows = db()->query(
        'SELECT u.id, u.email, u.full_name AS fullName, u.role, u.status, u.last_login_at AS lastLoginAt,
                e.id AS employeeId, e.employee_code AS employeeCode, e.position_name AS positionName
         FROM users u LEFT JOIN employees e ON e.user_id = u.id ORDER BY u.full_name'
    )->fetchAll();
    json_response(['users' => $rows]);
}

function users_create(array $params = [])
{
    require_csrf();
    $actor = require_roles(['admin']);
    $body = request_body();
    $email = strtolower(value_string($body, 'email', 5, 190) ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new ApiError('El correo no es válido.');
    }
    $password = value_string($body, 'password', 12, 200) ?? '';
    $fullName = value_string($body, 'fullName', 3, 160) ?? '';
    $role = require_choice($body['role'] ?? '', ['admin', 'supervisor', 'cashier'], 'role');
    $employee = isset($body['employee']) && is_array($body['employee']) ? $body['employee'] : null;

    try {
        $id = transaction(function (PDO $pdo) use ($actor, $email, $password, $fullName, $role, $employee): int {
            $statement = $pdo->prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
            $statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $fullName, $role]);
            $id = (int) $pdo->lastInsertId();

            if ($employee) {
                $code = value_string($employee, 'code', 1, 40) ?? '';
                $position = value_string($employee, 'position', 2, 100) ?? '';
                $payType = require_choice($employee['payType'] ?? '', ['hourly', 'monthly'], 'payType');
                $hourlyRate = value_number($employee, 'hourlyRate', 0);
                $monthlySalary = value_number($employee, 'monthlySalary', 0);
                $multiplier = value_number($employee, 'overtimeMultiplier', 1, 5);
                $employeeStatement = $pdo->prepare(
                    'INSERT INTO employees
                       (user_id, employee_code, full_name, position_name, pay_type, hourly_rate, monthly_salary, overtime_multiplier)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $employeeStatement->execute([$id, $code, $fullName, $position, $payType, $hourlyRate, $monthlySalary, $multiplier]);
            }
            audit_log($pdo, $actor, 'create', 'user', $id, null, ['email' => $email, 'role' => $role]);
            return $id;
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El correo o código de empleado ya existe.', 409);
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

    transaction(function (PDO $pdo) use ($actor, $id, $body): void {
        $select = $pdo->prepare('SELECT id, full_name, role, status FROM users WHERE id = ? FOR UPDATE');
        $select->execute([$id]);
        $before = $select->fetch();
        if (!$before) {
            throw new ApiError('Usuario no encontrado.', 404);
        }
        $fields = [];
        $values = [];
        if (array_key_exists('fullName', $body)) {
            $fields[] = 'full_name = ?';
            $values[] = value_string($body, 'fullName', 3, 160);
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
            $values[] = password_hash(value_string($body, 'password', 12, 200) ?? '', PASSWORD_DEFAULT);
        }
        if (!$fields) {
            throw new ApiError('Debe enviar al menos un cambio.');
        }
        $values[] = $id;
        $update = $pdo->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?');
        $update->execute($values);
        if (isset($body['fullName'])) {
            $pdo->prepare('UPDATE employees SET full_name = ? WHERE user_id = ?')->execute([$body['fullName'], $id]);
        }
        audit_log($pdo, $actor, 'update', 'user', $id, $before, $body);
    });
    no_content();
}
