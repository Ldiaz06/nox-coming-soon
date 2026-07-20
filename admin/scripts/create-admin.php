<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/app/db.php';

$email = strtolower(trim((string) getenv('INITIAL_ADMIN_EMAIL')));
$password = (string) getenv('INITIAL_ADMIN_PASSWORD');
$name = trim((string) (getenv('INITIAL_ADMIN_NAME') ?: 'Administrador NOX'));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    throw new RuntimeException('INITIAL_ADMIN_EMAIL no es válido.');
}
if (strlen($password) < 12) {
    throw new RuntimeException('INITIAL_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
}

$statement = db()->prepare(
    "INSERT INTO users (email, password_hash, full_name, role, status)
     VALUES (?, ?, ?, 'admin', 'active')
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role = 'admin', status = 'active'"
);
$statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $name]);
fwrite(STDOUT, "Administrador creado o actualizado: {$email}\n");
