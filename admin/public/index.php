<?php
declare(strict_types=1);

// Some shared Apache configurations ignore DirectoryIndex from .htaccess and
// open index.php before index.html. Serve the interface in that case.
if (!isset($_GET['api_path'])) {
    header('Content-Type: text/html; charset=utf-8');
    readfile(__DIR__ . '/index.html');
    exit;
}

// Avoid an opaque parse error when the hosting account still uses legacy PHP.
if (PHP_VERSION_ID < 70400) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'NOOX Control requiere PHP 7.4 o superior.',
        'currentVersion' => PHP_VERSION,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/auth_users.php';
$eventsAccessModule = dirname(__DIR__) . '/app/events_access.php';
if (is_file($eventsAccessModule)) {
    try {
        require_once $eventsAccessModule;
    } catch (Throwable $error) {
        error_log('NOOX events module could not be loaded: ' . $error->__toString());
    }
}
$publicInvitationsModule = dirname(__DIR__) . '/app/public_invitations.php';
if (is_file($publicInvitationsModule)) {
    try {
        require_once $publicInvitationsModule;
    } catch (Throwable $error) {
        error_log('NOOX public invitations module could not be loaded: ' . $error->__toString());
    }
}
$promoterPortalModule = dirname(__DIR__) . '/app/promoter_portal.php';
if (is_file($promoterPortalModule)) {
    try {
        require_once $promoterPortalModule;
    } catch (Throwable $error) {
        error_log('NOOX promoter portal module could not be loaded: ' . $error->__toString());
    }
}
require_once dirname(__DIR__) . '/app/inventory_pos.php';
require_once dirname(__DIR__) . '/app/operations.php';
require_once dirname(__DIR__) . '/app/workforce_payroll.php';
require_once dirname(__DIR__) . '/app/routes.php';

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'OPTIONS') {
        no_content();
    }
    $path = trim((string) ($_GET['api_path'] ?? ''), '/');
    if ($path === '') {
        throw new ApiError('Ruta no encontrada.', 404);
    }
    dispatch_routes($method, $path);
} catch (ApiError $error) {
    json_response(['error' => $error->getMessage()], $error->status);
} catch (JsonException $error) {
    json_response(['error' => 'El contenido JSON no es válido.'], 400);
} catch (Throwable $error) {
    error_log($error->__toString());
    json_response(['error' => 'Ocurrió un error interno.'], 500);
}
