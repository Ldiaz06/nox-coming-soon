<?php
declare(strict_types=1);

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
} catch (JsonException) {
    json_response(['error' => 'El contenido JSON no es válido.'], 400);
} catch (Throwable $error) {
    error_log($error->__toString());
    json_response(['error' => 'Ocurrió un error interno.'], 500);
}
