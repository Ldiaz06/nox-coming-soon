<?php
declare(strict_types=1);

/**
 * Loads private configuration from outside public_html. Environment variables
 * remain available as a portable fallback for non-cPanel installations.
 */
function nox_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $configPath = (string) (getenv('NOX_ADMIN_CONFIG') ?: '/home/noxpa/nox-admin-config.php');
    if (is_file($configPath)) {
        $loaded = require $configPath;
        if (!is_array($loaded)) {
            throw new RuntimeException("El archivo de configuración {$configPath} debe devolver un arreglo.");
        }
        $config = $loaded;
        return $config;
    }

    $config = [
        'app_env' => getenv('APP_ENV') ?: 'production',
        'app_origin' => getenv('APP_ORIGIN') ?: '',
        'cookie_secure' => (getenv('COOKIE_SECURE') ?: 'true') === 'true',
        'db' => [
            'host' => getenv('DB_HOST') ?: '',
            'port' => (int) (getenv('DB_PORT') ?: 3306),
            'name' => getenv('DB_NAME') ?: '',
            'user' => getenv('DB_USER') ?: '',
            'password' => getenv('DB_PASSWORD') ?: '',
        ],
        'initial_admin' => [
            'email' => getenv('INITIAL_ADMIN_EMAIL') ?: '',
            'password' => getenv('INITIAL_ADMIN_PASSWORD') ?: '',
            'name' => getenv('INITIAL_ADMIN_NAME') ?: 'Administrador NOX',
        ],
    ];

    return $config;
}

function nox_config_value(string $path, $default = null)
{
    $value = nox_config();
    foreach (explode('.', $path) as $segment) {
        if (!is_array($value) || !array_key_exists($segment, $value)) {
            return $default;
        }
        $value = $value[$segment];
    }
    return $value;
}
