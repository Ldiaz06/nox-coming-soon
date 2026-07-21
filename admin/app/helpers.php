<?php
declare(strict_types=1);

final class ApiError extends RuntimeException
{
    public int $status;

    public function __construct(string $message, int $status = 400)
    {
        $this->status = $status;
        parent::__construct($message);
    }
}

function json_response(array $data = [], int $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    exit;
}

function no_content()
{
    http_response_code(204);
    exit;
}

function request_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($data)) {
        throw new ApiError('El cuerpo de la solicitud no es válido.');
    }
    return $data;
}

function value_string(array $data, string $key, int $min = 0, int $max = 255, bool $required = true): ?string
{
    $value = isset($data[$key]) ? trim((string) $data[$key]) : '';
    if ($value === '' && !$required) {
        return null;
    }
    $length = mb_strlen($value);
    if ($length < $min || $length > $max) {
        throw new ApiError("El campo {$key} no es válido.");
    }
    return $value;
}

function value_number(array $data, string $key, float $min = 0, ?float $max = null): float
{
    if (!isset($data[$key]) || !is_numeric($data[$key])) {
        throw new ApiError("El campo {$key} no es válido.");
    }
    $value = (float) $data[$key];
    if ($value < $min || ($max !== null && $value > $max)) {
        throw new ApiError("El campo {$key} está fuera del rango permitido.");
    }
    return $value;
}

function value_id(array $data, string $key): int
{
    $value = filter_var($data[$key] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($value === false) {
        throw new ApiError("El campo {$key} no es válido.");
    }
    return (int) $value;
}

function path_id(array $params, string $key = 'id'): int
{
    $value = filter_var($params[$key] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($value === false) {
        throw new ApiError('Identificador inválido.');
    }
    return (int) $value;
}

function require_choice($value, array $choices, string $field): string
{
    $value = (string) $value;
    if (!in_array($value, $choices, true)) {
        throw new ApiError("El campo {$field} no es válido.");
    }
    return $value;
}

function current_user(): ?array
{
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) {
        return null;
    }
    $statement = db()->prepare('SELECT id, username, full_name, role, status FROM users WHERE id = ? LIMIT 1');
    $statement->execute([(int) $id]);
    $user = $statement->fetch();
    if (!$user || $user['status'] !== 'active') {
        $_SESSION = [];
        return null;
    }
    return $user;
}

function require_auth(): array
{
    $user = current_user();
    if (!$user) {
        throw new ApiError('Debe iniciar sesión.', 401);
    }
    return $user;
}

function require_roles(array $roles): array
{
    $user = require_auth();
    if (!in_array($user['role'], $roles, true)) {
        throw new ApiError('No tiene permiso para realizar esta acción.', 403);
    }
    return $user;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void
{
    if (in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if ($token === '' || !hash_equals(csrf_token(), $token)) {
        throw new ApiError('La solicitud de seguridad expiró. Recargue la página.', 419);
    }
}

function audit_log(PDO $pdo, array $user, string $action, string $entity, ?int $entityId = null, ?array $before = null, ?array $after = null): void
{
    $statement = $pdo->prepare(
        'INSERT INTO audit_log (user_id, action, entity_type, entity_id, before_data, after_data, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $statement->execute([
        $user['id'], $action, $entity, $entityId,
        $before ? json_encode($before, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
        $after ? json_encode($after, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) : null,
        $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
}

function placeholders(int $count): string
{
    if ($count < 1) {
        throw new ApiError('La lista no puede estar vacía.');
    }
    return implode(',', array_fill(0, $count, '?'));
}

function money_round(float $value): float
{
    return round($value + PHP_FLOAT_EPSILON, 2);
}

function add_route(string $method, string $pattern, callable $handler): void
{
    $GLOBALS['routes'][] = [$method, $pattern, $handler];
}

function dispatch_routes(string $method, string $path)
{
    foreach ($GLOBALS['routes'] ?? [] as [$routeMethod, $pattern, $handler]) {
        if ($routeMethod !== $method) {
            continue;
        }
        $paramNames = [];
        $regex = preg_replace_callback('/\{([a-zA-Z][a-zA-Z0-9_]*)\}/', static function (array $match) use (&$paramNames): string {
            $paramNames[] = $match[1];
            return '([^/]+)';
        }, $pattern);
        if (preg_match('#^' . $regex . '$#', $path, $matches)) {
            array_shift($matches);
            $params = $paramNames ? array_combine($paramNames, $matches) : [];
            $handler($params ?: []);
            throw new LogicException('La ruta no produjo una respuesta.');
        }
    }
    throw new ApiError('Ruta no encontrada.', 404);
}
