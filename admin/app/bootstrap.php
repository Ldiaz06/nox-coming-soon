<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

date_default_timezone_set('America/Panama');

$production = nox_config_value('app_env', 'production') === 'production';
ini_set('display_errors', $production ? '0' : '1');
error_reporting(E_ALL);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

$secureCookie = (bool) nox_config_value('cookie_secure', true);
if ($secureCookie && (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')) {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.gc_maxlifetime', (string) (8 * 60 * 60));
session_name('nox_admin_session');
session_set_cookie_params([
    'lifetime' => 8 * 60 * 60,
    'path' => '/',
    'secure' => $secureCookie,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigin = (string) nox_config_value('app_origin', '');
if ($origin !== '' && $allowedOrigin !== '' && !hash_equals($allowedOrigin, $origin)) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Origen no permitido.']);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
