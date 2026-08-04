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

    $explicitPath = trim((string) getenv('NOX_ADMIN_CONFIG'));
    $configPaths = $explicitPath !== ''
        ? [$explicitPath]
        : [
            // /home/{cuenta}/nox-admin-config.php, calculated from admin/app.
            dirname(__DIR__, 3) . '/nox-admin-config.php',
            // Protected cPanel fallback when files cannot be placed outside public_html.
            dirname(__DIR__) . '/config/nox-admin-config.php',
        ];

    foreach ($configPaths as $configPath) {
        if (!is_file($configPath)) {
            continue;
        }
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
        'public_invitation_origin' => getenv('PUBLIC_INVITATION_ORIGIN') ?: (getenv('APP_ORIGIN') ?: ''),
        'cookie_secure' => (getenv('COOKIE_SECURE') ?: 'true') === 'true',
        'db' => [
            'host' => getenv('DB_HOST') ?: '',
            'port' => (int) (getenv('DB_PORT') ?: 3306),
            'name' => getenv('DB_NAME') ?: '',
            'user' => getenv('DB_USER') ?: '',
            'password' => getenv('DB_PASSWORD') ?: '',
        ],
        'wallet' => [
            'apple' => [
                'pass_type_identifier' => getenv('APPLE_WALLET_PASS_TYPE_IDENTIFIER') ?: '',
                'team_identifier' => getenv('APPLE_WALLET_TEAM_IDENTIFIER') ?: '',
                'pkcs12_path' => getenv('APPLE_WALLET_PKCS12_PATH') ?: '',
                'pkcs12_password' => getenv('APPLE_WALLET_PKCS12_PASSWORD') ?: '',
                'wwdr_certificate_path' => getenv('APPLE_WALLET_WWDR_CERTIFICATE_PATH') ?: '',
            ],
            'google' => [
                'issuer_id' => getenv('GOOGLE_WALLET_ISSUER_ID') ?: '',
                'class_suffix' => getenv('GOOGLE_WALLET_CLASS_SUFFIX') ?: 'nox_event_invitation',
                'service_account_json_path' => getenv('GOOGLE_WALLET_SERVICE_ACCOUNT_JSON_PATH') ?: '',
                'origins' => array_values(array_filter(array_map(
                    'trim',
                    explode(',', getenv('GOOGLE_WALLET_ORIGINS') ?: (getenv('APP_ORIGIN') ?: ''))
                ))),
            ],
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
