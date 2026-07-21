<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $required = [
        'db.host' => 'DB_HOST',
        'db.name' => 'DB_NAME',
        'db.user' => 'DB_USER',
        'db.password' => 'DB_PASSWORD',
    ];
    foreach ($required as $path => $label) {
        if ((string) nox_config_value($path, '') === '') {
            throw new RuntimeException("Falta la configuración {$label}.");
        }
    }

    $host = (string) nox_config_value('db.host');
    $port = (int) nox_config_value('db.port', 3306);
    $name = (string) nox_config_value('db.name');
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";

    $pdo = new PDO($dsn, (string) nox_config_value('db.user'), (string) nox_config_value('db.password'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ]);
    $pdo->exec("SET time_zone = '-05:00'");
    return $pdo;
}

function transaction(callable $work)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $work($pdo);
        $pdo->commit();
        return $result;
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}
