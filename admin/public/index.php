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
        'error' => 'NOX Control requiere PHP 7.4 o superior.',
        'currentVersion' => PHP_VERSION,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/auth_users.php';
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
