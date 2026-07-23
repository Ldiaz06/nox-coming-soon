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
    $username = (string) nox_config_value('db.user');
    $password = (string) nox_config_value('db.password');
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_STRINGIFY_FETCHES => false,
    ];

    try {
        $pdo = new PDO($dsn, $username, $password, $options);
    } catch (PDOException $error) {
        $nativeCode = isset($error->errorInfo[1])
            ? (int) $error->errorInfo[1]
            : (is_numeric($error->getCode()) ? (int) $error->getCode() : 0);

        // En CentOS/cPanel, "localhost" puede apuntar a un socket distinto del
        // configurado por MySQL. Si ese socket falla, usar TCP local evita
        // depender de la ruta interna del socket.
        if (strtolower($host) !== 'localhost' || $nativeCode !== 2002) {
            throw $error;
        }

        $tcpDsn = "mysql:host=127.0.0.1;port={$port};dbname={$name};charset=utf8mb4";
        $pdo = new PDO($tcpDsn, $username, $password, $options);
    }

    $pdo->exec("SET time_zone = '-05:00'");
    return $pdo;
}

function database_health_diagnostic(Throwable $error): array
{
    if (!in_array('mysql', PDO::getAvailableDrivers(), true)) {
        return [
            'code' => 'PDO_MYSQL_MISSING',
            'message' => 'La extensión pdo_mysql no está habilitada en PHP.',
        ];
    }

    if ($error instanceof RuntimeException && strpos($error->getMessage(), 'Falta la configuración ') === 0) {
        return [
            'code' => 'DATABASE_CONFIG_MISSING',
            'message' => $error->getMessage(),
        ];
    }

    $nativeCode = 0;
    if ($error instanceof PDOException && isset($error->errorInfo[1])) {
        $nativeCode = (int) $error->errorInfo[1];
    } elseif (is_numeric($error->getCode())) {
        $nativeCode = (int) $error->getCode();
    }

    $diagnostics = [
        1044 => [
            'code' => 'DATABASE_ACCESS_DENIED',
            'message' => 'El usuario MySQL no tiene permisos sobre la base de datos.',
        ],
        1045 => [
            'code' => 'DATABASE_AUTH_FAILED',
            'message' => 'El usuario o la contraseña de MySQL no son correctos.',
        ],
        1049 => [
            'code' => 'DATABASE_NOT_FOUND',
            'message' => 'La base de datos configurada no existe.',
        ],
        2002 => [
            'code' => 'DATABASE_UNREACHABLE',
            'message' => 'No fue posible comunicarse con el servidor MySQL.',
        ],
        2006 => [
            'code' => 'DATABASE_SERVER_GONE',
            'message' => 'El servidor MySQL cerró la conexión.',
        ],
        2013 => [
            'code' => 'DATABASE_CONNECTION_LOST',
            'message' => 'Se perdió la conexión con MySQL durante la consulta.',
        ],
    ];

    return $diagnostics[$nativeCode] ?? [
        'code' => 'DATABASE_CONNECTION_FAILED',
        'message' => 'MySQL no pudo completar la comprobación de conexión.',
    ];
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
