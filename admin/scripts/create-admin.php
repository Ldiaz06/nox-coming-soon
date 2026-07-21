<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/app/config.php';
require_once dirname(__DIR__) . '/app/db.php';

$username = mb_strtolower(trim((string) nox_config_value(
    'initial_admin.username',
    nox_config_value('initial_admin.email', '')
)));
$password = (string) nox_config_value('initial_admin.password', '');
$name = trim((string) nox_config_value('initial_admin.name', 'Administrador NOX'));

if (mb_strlen($username) < 3 || mb_strlen($username) > 80 || !preg_match('/^[\p{L}\p{N}._@-]+$/u', $username)) {
    throw new RuntimeException('INITIAL_ADMIN_USERNAME no es válido.');
}
if (strlen($password) < 4) {
    throw new RuntimeException('INITIAL_ADMIN_PASSWORD debe tener al menos 4 caracteres.');
}

$statement = db()->prepare(
    "INSERT INTO users (username, password_hash, full_name, role, status)
     VALUES (?, ?, ?, 'admin', 'active')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role = 'admin', status = 'active'"
);
$statement->execute([$username, password_hash($password, PASSWORD_DEFAULT), $name]);

$userStatement = db()->prepare('SELECT id FROM users WHERE username = ? LIMIT 1');
$userStatement->execute([$username]);
$userId = (int) $userStatement->fetchColumn();
$terminalStatement = db()->prepare('SELECT id FROM terminals WHERE assigned_user_id = ? LIMIT 1');
$terminalStatement->execute([$userId]);
if (!$terminalStatement->fetchColumn()) {
    $available = db()->query(
        "SELECT id FROM terminals WHERE assigned_user_id IS NULL AND status = 'active' ORDER BY id LIMIT 1"
    )->fetchColumn();
    if ($available) {
        db()->prepare('UPDATE terminals SET assigned_user_id = ? WHERE id = ?')->execute([$userId, $available]);
    } else {
        db()->prepare(
            "INSERT INTO terminals (name, location_name, status, assigned_user_id)
             VALUES (?, 'Bar principal', 'active', ?)"
        )->execute(['Caja ' . $userId . ' - ' . $name, $userId]);
    }
}

fwrite(STDOUT, "Administrador creado o actualizado: {$username}\n");
