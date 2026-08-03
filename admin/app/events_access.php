<?php
declare(strict_types=1);

function event_access_token(string $prefix): string
{
    if (!in_array($prefix, ['E', 'P'], true)) {
        throw new InvalidArgumentException('Prefijo de acceso inválido.');
    }
    return $prefix . rtrim(strtr(base64_encode(random_bytes(23)), '+/', '-_'), '=');
}

function event_datetime(array $body, string $key): string
{
    $value = trim((string) ($body[$key] ?? ''));
    if ($value === '') {
        throw new ApiError("El campo {$key} es obligatorio.");
    }
    try {
        $date = new DateTimeImmutable($value);
    } catch (Throwable $error) {
        throw new ApiError("El campo {$key} no es una fecha válida.");
    }
    return $date->format('Y-m-d H:i:s');
}

function event_optional_capacity(array $body): ?int
{
    $raw = $body['capacity'] ?? null;
    if ($raw === null || $raw === '') {
        return null;
    }
    $capacity = filter_var($raw, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100000]]);
    if ($capacity === false) {
        throw new ApiError('La capacidad debe ser un número mayor que cero.');
    }
    return (int) $capacity;
}

function event_row(PDO $pdo, int $eventId, bool $lock = false): ?array
{
    if ($lock) {
        $statement = $pdo->prepare(
            "SELECT e.id, e.name, e.access_mode AS accessMode, e.starts_at AS startsAt, e.ends_at AS endsAt,
                    e.capacity, e.status, e.notes, e.shared_qr_token AS sharedQrToken,
                    e.created_at AS createdAt
             FROM events e
             WHERE e.id = ?
             FOR UPDATE"
        );
        $statement->execute([$eventId]);
        $row = $statement->fetch();
        return $row ?: null;
    }
    $statement = $pdo->prepare(
        "SELECT e.id, e.name, e.access_mode AS accessMode, e.starts_at AS startsAt, e.ends_at AS endsAt,
                e.capacity, e.status, e.notes, e.shared_qr_token AS sharedQrToken,
                e.created_at AS createdAt, u.full_name AS createdBy,
                (SELECT COUNT(*) FROM event_guests g WHERE g.event_id = e.id AND g.status <> 'cancelled') AS guestCount,
                (SELECT COUNT(*) FROM event_access_log a WHERE a.event_id = e.id AND a.decision = 'granted') AS admittedCount
         FROM events e
         JOIN users u ON u.id = e.created_by
         WHERE e.id = ?"
    );
    $statement->execute([$eventId]);
    $row = $statement->fetch();
    return $row ?: null;
}

function events_list(array $params = [])
{
    require_auth();
    $rows = db()->query(
        "SELECT e.id, e.name, e.access_mode AS accessMode, e.starts_at AS startsAt, e.ends_at AS endsAt,
                e.capacity, e.status, e.notes, e.created_at AS createdAt, u.full_name AS createdBy,
                (SELECT COUNT(*) FROM event_guests g WHERE g.event_id = e.id AND g.status <> 'cancelled') AS guestCount,
                (SELECT COUNT(*) FROM event_access_log a WHERE a.event_id = e.id AND a.decision = 'granted') AS admittedCount
         FROM events e
         JOIN users u ON u.id = e.created_by
         ORDER BY e.starts_at DESC, e.id DESC
         LIMIT 200"
    )->fetchAll();
    json_response(['events' => $rows]);
}

function events_detail(array $params)
{
    $user = require_auth();
    $eventId = path_id($params);
    $pdo = db();
    $event = event_row($pdo, $eventId);
    if (!$event) {
        throw new ApiError('Evento no encontrado.', 404);
    }
    $guestStatement = $pdo->prepare(
        "SELECT g.id, g.full_name AS fullName, g.contact, g.notes, g.qr_token AS qrToken,
                g.status, g.admitted_at AS admittedAt, admitted.full_name AS admittedBy,
                g.created_at AS createdAt
         FROM event_guests g
         LEFT JOIN users admitted ON admitted.id = g.admitted_by
         WHERE g.event_id = ?
         ORDER BY g.created_at DESC, g.id DESC"
    );
    $guestStatement->execute([$eventId]);
    $accessStatement = $pdo->prepare(
        "SELECT a.id, a.token_type AS tokenType, a.decision, a.reason, a.scanned_at AS scannedAt,
                scanner.full_name AS scannedBy, guest.full_name AS guestName
         FROM event_access_log a
         JOIN users scanner ON scanner.id = a.scanned_by
         LEFT JOIN event_guests guest ON guest.id = a.guest_id
         WHERE a.event_id = ?
         ORDER BY a.scanned_at DESC, a.id DESC
         LIMIT 40"
    );
    $accessStatement->execute([$eventId]);
    $guests = $guestStatement->fetchAll();
    if ($user['role'] === 'cashier') {
        unset($event['sharedQrToken']);
        foreach ($guests as &$guest) {
            unset($guest['qrToken']);
        }
        unset($guest);
    }
    json_response([
        'event' => $event,
        'guests' => $guests,
        'accesses' => $accessStatement->fetchAll(),
    ]);
}

function events_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $name = value_string($body, 'name', 2, 160);
    $accessMode = require_choice($body['accessMode'] ?? '', ['shared', 'personal'], 'accessMode');
    $startsAt = event_datetime($body, 'startsAt');
    $endsAt = event_datetime($body, 'endsAt');
    if ($endsAt <= $startsAt) {
        throw new ApiError('La hora de cierre debe ser posterior a la hora de inicio.');
    }
    $capacity = event_optional_capacity($body);
    $notes = value_string($body, 'notes', 0, 500, false);
    $sharedToken = $accessMode === 'shared' ? event_access_token('E') : null;
    $eventId = transaction(function (PDO $pdo) use ($user, $name, $accessMode, $startsAt, $endsAt, $capacity, $notes, $sharedToken): int {
        $statement = $pdo->prepare(
            "INSERT INTO events
                (name, access_mode, starts_at, ends_at, capacity, status, notes, shared_qr_token, created_by)
             VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)"
        );
        $statement->execute([$name, $accessMode, $startsAt, $endsAt, $capacity, $notes, $sharedToken, $user['id']]);
        $id = (int) $pdo->lastInsertId();
        audit_log($pdo, $user, 'create', 'event', $id, null, [
            'name' => $name,
            'accessMode' => $accessMode,
            'startsAt' => $startsAt,
            'endsAt' => $endsAt,
            'capacity' => $capacity,
        ]);
        return $id;
    });
    json_response(['id' => $eventId], 201);
}

function events_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $eventId = path_id($params);
    $body = request_body();
    if (!$body) {
        throw new ApiError('Debe enviar al menos un cambio.');
    }
    $result = transaction(function (PDO $pdo) use ($user, $eventId, $body): array {
        $event = event_row($pdo, $eventId, true);
        if (!$event) {
            throw new ApiError('Evento no encontrado.', 404);
        }
        $name = array_key_exists('name', $body)
            ? value_string($body, 'name', 2, 160)
            : $event['name'];
        $accessMode = array_key_exists('accessMode', $body)
            ? require_choice($body['accessMode'], ['shared', 'personal'], 'accessMode')
            : $event['accessMode'];
        $startsAt = array_key_exists('startsAt', $body)
            ? event_datetime($body, 'startsAt')
            : $event['startsAt'];
        $endsAt = array_key_exists('endsAt', $body)
            ? event_datetime($body, 'endsAt')
            : $event['endsAt'];
        $capacity = array_key_exists('capacity', $body)
            ? event_optional_capacity($body)
            : ($event['capacity'] !== null ? (int) $event['capacity'] : null);
        $notes = array_key_exists('notes', $body)
            ? value_string($body, 'notes', 0, 500, false)
            : $event['notes'];
        if ($endsAt <= $startsAt) {
            throw new ApiError('La hora de cierre debe ser posterior a la hora de inicio.');
        }

        $sharedToken = $event['sharedQrToken'];
        if ($accessMode !== $event['accessMode']) {
            $history = $pdo->prepare(
                'SELECT
                    (SELECT COUNT(*) FROM event_guests WHERE event_id = ?) +
                    (SELECT COUNT(*) FROM event_access_log WHERE event_id = ?)'
            );
            $history->execute([$eventId, $eventId]);
            if ((int) $history->fetchColumn() > 0) {
                throw new ApiError('La modalidad no puede cambiarse porque el evento ya tiene invitados o lecturas.', 409);
            }
            $sharedToken = $accessMode === 'shared' ? event_access_token('E') : null;
        }

        $pdo->prepare(
            'UPDATE events
             SET name = ?, access_mode = ?, starts_at = ?, ends_at = ?, capacity = ?, notes = ?, shared_qr_token = ?
             WHERE id = ?'
        )->execute([$name, $accessMode, $startsAt, $endsAt, $capacity, $notes, $sharedToken, $eventId]);
        $after = [
            'name' => $name,
            'accessMode' => $accessMode,
            'startsAt' => $startsAt,
            'endsAt' => $endsAt,
            'capacity' => $capacity,
            'notes' => $notes,
        ];
        audit_log($pdo, $user, 'update', 'event', $eventId, [
            'name' => $event['name'],
            'accessMode' => $event['accessMode'],
            'startsAt' => $event['startsAt'],
            'endsAt' => $event['endsAt'],
            'capacity' => $event['capacity'],
            'notes' => $event['notes'],
        ], $after);
        return ['id' => $eventId] + $after;
    });
    json_response($result);
}

function events_status_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $eventId = path_id($params);
    $status = require_choice(request_body()['status'] ?? '', ['active', 'closed', 'cancelled'], 'status');
    transaction(function (PDO $pdo) use ($user, $eventId, $status): void {
        $event = event_row($pdo, $eventId, true);
        if (!$event) {
            throw new ApiError('Evento no encontrado.', 404);
        }
        $pdo->prepare('UPDATE events SET status = ? WHERE id = ?')->execute([$status, $eventId]);
        audit_log($pdo, $user, 'status', 'event', $eventId, ['status' => $event['status']], ['status' => $status]);
    });
    json_response(['id' => $eventId, 'status' => $status]);
}

function event_guest_values(array $body, ?int $rowNumber = null): array
{
    try {
        return [
            'fullName' => value_string($body, 'fullName', 2, 160),
            'contact' => value_string($body, 'contact', 0, 160, false),
            'notes' => value_string($body, 'notes', 0, 300, false),
        ];
    } catch (ApiError $error) {
        if ($rowNumber === null) {
            throw $error;
        }
        throw new ApiError("Fila {$rowNumber}: " . $error->getMessage(), $error->status);
    }
}

function event_guests_create(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $eventId = path_id($params);
    $guest = event_guest_values(request_body());
    $fullName = $guest['fullName'];
    $contact = $guest['contact'];
    $notes = $guest['notes'];
    $token = event_access_token('P');
    $guestId = transaction(function (PDO $pdo) use ($user, $eventId, $fullName, $contact, $notes, $token): int {
        $event = event_row($pdo, $eventId, true);
        if (!$event) {
            throw new ApiError('Evento no encontrado.', 404);
        }
        if ($event['accessMode'] !== 'personal') {
            throw new ApiError('Este evento usa un QR general y no admite invitaciones personales.', 409);
        }
        if ($event['status'] === 'cancelled') {
            throw new ApiError('No se pueden agregar invitados a un evento cancelado.', 409);
        }
        $statement = $pdo->prepare(
            "INSERT INTO event_guests (event_id, full_name, contact, notes, qr_token, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'invited', ?)"
        );
        $statement->execute([$eventId, $fullName, $contact, $notes, $token, $user['id']]);
        $id = (int) $pdo->lastInsertId();
        audit_log($pdo, $user, 'create', 'event_guest', $id, null, [
            'eventId' => $eventId,
            'fullName' => $fullName,
            'contact' => $contact,
        ]);
        return $id;
    });
    json_response(['id' => $guestId, 'qrToken' => $token], 201);
}

function event_guests_import(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $eventId = path_id($params);
    $rows = request_body()['guests'] ?? null;
    if (!is_array($rows) || count($rows) < 1) {
        throw new ApiError('El archivo no contiene invitados para importar.');
    }
    if (count($rows) > 500) {
        throw new ApiError('Puede importar un máximo de 500 invitados por archivo.');
    }

    $guests = [];
    foreach (array_values($rows) as $index => $row) {
        if (!is_array($row)) {
            $rowNumber = $index + 2;
            throw new ApiError("Fila {$rowNumber}: los datos no son válidos.");
        }
        $guests[] = event_guest_values($row, $index + 2);
    }

    $createdCount = transaction(function (PDO $pdo) use ($user, $eventId, $guests): int {
        $event = event_row($pdo, $eventId, true);
        if (!$event) {
            throw new ApiError('Evento no encontrado.', 404);
        }
        if ($event['accessMode'] !== 'personal') {
            throw new ApiError('Este evento usa un QR general y no admite invitaciones personales.', 409);
        }
        if ($event['status'] === 'cancelled') {
            throw new ApiError('No se pueden agregar invitados a un evento cancelado.', 409);
        }

        $statement = $pdo->prepare(
            "INSERT INTO event_guests (event_id, full_name, contact, notes, qr_token, status, created_by)
             VALUES (?, ?, ?, ?, ?, 'invited', ?)"
        );
        foreach ($guests as $guest) {
            $statement->execute([
                $eventId,
                $guest['fullName'],
                $guest['contact'],
                $guest['notes'],
                event_access_token('P'),
                $user['id'],
            ]);
        }
        audit_log($pdo, $user, 'bulk_create', 'event_guest', null, null, [
            'eventId' => $eventId,
            'guestCount' => count($guests),
        ]);
        return count($guests);
    });

    json_response(['createdCount' => $createdCount], 201);
}

function event_guests_reissue(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $guestId = path_id($params);
    $token = event_access_token('P');
    transaction(function (PDO $pdo) use ($user, $guestId, $token): void {
        $statement = $pdo->prepare(
            "SELECT id, event_id AS eventId, full_name AS fullName, status, admitted_at AS admittedAt
             FROM event_guests WHERE id = ? FOR UPDATE"
        );
        $statement->execute([$guestId]);
        $guest = $statement->fetch();
        if (!$guest) {
            throw new ApiError('Invitación no encontrada.', 404);
        }
        if ($guest['admittedAt'] !== null || $guest['status'] === 'admitted') {
            throw new ApiError('No se puede reemplazar un QR que ya registró entrada.', 409);
        }
        $pdo->prepare("UPDATE event_guests SET qr_token = ?, status = 'invited' WHERE id = ?")->execute([$token, $guestId]);
        audit_log($pdo, $user, 'reissue_qr', 'event_guest', $guestId, null, ['eventId' => $guest['eventId']]);
    });
    json_response(['id' => $guestId, 'qrToken' => $token]);
}

function event_guests_status_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $guestId = path_id($params);
    $status = require_choice(request_body()['status'] ?? '', ['invited', 'cancelled'], 'status');
    transaction(function (PDO $pdo) use ($user, $guestId, $status): void {
        $statement = $pdo->prepare(
            'SELECT id, event_id AS eventId, status, admitted_at AS admittedAt FROM event_guests WHERE id = ? FOR UPDATE'
        );
        $statement->execute([$guestId]);
        $guest = $statement->fetch();
        if (!$guest) {
            throw new ApiError('Invitación no encontrada.', 404);
        }
        if ($guest['admittedAt'] !== null) {
            throw new ApiError('La entrada ya fue registrada y no puede cancelarse.', 409);
        }
        $pdo->prepare('UPDATE event_guests SET status = ? WHERE id = ?')->execute([$status, $guestId]);
        audit_log($pdo, $user, 'status', 'event_guest', $guestId, ['status' => $guest['status']], ['status' => $status]);
    });
    json_response(['id' => $guestId, 'status' => $status]);
}

function access_reason_message(string $reason): string
{
    $messages = [
        'invalid' => 'El código no pertenece a NOX.',
        'inactive' => 'El evento no está activo.',
        'not_started' => 'La ventana de acceso todavía no ha iniciado.',
        'ended' => 'La ventana de acceso ya terminó.',
        'capacity' => 'El evento alcanzó su capacidad.',
        'cancelled' => 'La invitación fue cancelada.',
        'duplicate' => 'Esta invitación ya registró una entrada.',
    ];
    return $messages[$reason] ?? 'No fue posible autorizar la entrada.';
}

function event_access_log(
    PDO $pdo,
    array $user,
    ?int $eventId,
    ?int $guestId,
    string $tokenType,
    string $decision,
    string $reason,
    string $token
): void {
    $statement = $pdo->prepare(
        "INSERT INTO event_access_log
            (event_id, guest_id, token_type, decision, reason, token_hint, scanned_by, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $statement->execute([
        $eventId,
        $guestId,
        $tokenType,
        $decision,
        $reason,
        substr(hash('sha256', $token), 0, 16),
        $user['id'],
        $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
}

function access_scan(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $rawToken = trim((string) (request_body()['token'] ?? ''));
    $token = strpos($rawToken, 'NOX1:') === 0 ? substr($rawToken, 5) : $rawToken;
    if (!preg_match('/^[A-Za-z0-9_-]{32}$/', $token)) {
        transaction(function (PDO $pdo) use ($user, $token): void {
            event_access_log($pdo, $user, null, null, 'unknown', 'denied', 'invalid', $token);
        });
        json_response([
            'granted' => false,
            'decision' => 'denied',
            'reason' => 'invalid',
            'message' => access_reason_message('invalid'),
        ]);
    }

    $result = transaction(function (PDO $pdo) use ($user, $token): array {
        $shared = $pdo->prepare(
            "SELECT e.id, e.name, e.status, e.starts_at AS startsAt, e.ends_at AS endsAt, e.capacity,
                    e.access_mode AS accessMode
             FROM events e
             WHERE e.shared_qr_token = ?
             FOR UPDATE"
        );
        $shared->execute([$token]);
        $event = $shared->fetch();
        $guest = null;
        $tokenType = 'shared';

        if (!$event) {
            $personal = $pdo->prepare(
                "SELECT e.id, e.name, e.status, e.starts_at AS startsAt, e.ends_at AS endsAt, e.capacity,
                        e.access_mode AS accessMode, g.id AS guestId, g.full_name AS guestName,
                        g.status AS guestStatus, g.admitted_at AS admittedAt
                 FROM event_guests g
                 JOIN events e ON e.id = g.event_id
                 WHERE g.qr_token = ?
                 FOR UPDATE"
            );
            $personal->execute([$token]);
            $event = $personal->fetch();
            if ($event) {
                $guest = [
                    'id' => (int) $event['guestId'],
                    'name' => $event['guestName'],
                    'status' => $event['guestStatus'],
                    'admittedAt' => $event['admittedAt'],
                ];
                $tokenType = 'personal';
            }
        }

        if (!$event) {
            event_access_log($pdo, $user, null, null, 'unknown', 'denied', 'invalid', $token);
            return [
                'granted' => false,
                'decision' => 'denied',
                'reason' => 'invalid',
                'message' => access_reason_message('invalid'),
            ];
        }

        $eventId = (int) $event['id'];
        $guestId = $guest ? $guest['id'] : null;
        $reason = '';
        $now = new DateTimeImmutable('now');
        $startsAt = new DateTimeImmutable($event['startsAt']);
        $endsAt = new DateTimeImmutable($event['endsAt']);
        if ($event['status'] !== 'active') {
            $reason = 'inactive';
        } elseif ($now < $startsAt) {
            $reason = 'not_started';
        } elseif ($now > $endsAt) {
            $reason = 'ended';
        } elseif ($guest && $guest['status'] === 'cancelled') {
            $reason = 'cancelled';
        } elseif ($guest && ($guest['status'] === 'admitted' || $guest['admittedAt'] !== null)) {
            $reason = 'duplicate';
        }

        if ($reason === '') {
            $countStatement = $pdo->prepare(
                "SELECT COUNT(*) FROM event_access_log WHERE event_id = ? AND decision = 'granted'"
            );
            $countStatement->execute([$eventId]);
            $admittedCount = (int) $countStatement->fetchColumn();
            if ($event['capacity'] !== null && $admittedCount >= (int) $event['capacity']) {
                $reason = 'capacity';
            }
        }

        if ($reason !== '') {
            $decision = $reason === 'duplicate' ? 'duplicate' : 'denied';
            event_access_log($pdo, $user, $eventId, $guestId, $tokenType, $decision, $reason, $token);
            return [
                'granted' => false,
                'decision' => $decision,
                'reason' => $reason,
                'message' => access_reason_message($reason),
                'event' => ['id' => $eventId, 'name' => $event['name']],
                'guest' => $guest ? ['id' => $guest['id'], 'name' => $guest['name'], 'admittedAt' => $guest['admittedAt']] : null,
            ];
        }

        if ($guest) {
            $pdo->prepare(
                "UPDATE event_guests
                 SET status = 'admitted', admitted_at = NOW(), admitted_by = ?
                 WHERE id = ?"
            )->execute([$user['id'], $guest['id']]);
        }
        event_access_log($pdo, $user, $eventId, $guestId, $tokenType, 'granted', 'granted', $token);
        $countStatement = $pdo->prepare(
            "SELECT COUNT(*) FROM event_access_log WHERE event_id = ? AND decision = 'granted'"
        );
        $countStatement->execute([$eventId]);
        return [
            'granted' => true,
            'decision' => 'granted',
            'reason' => 'granted',
            'message' => $guest ? 'Entrada autorizada.' : 'Asistencia registrada.',
            'event' => ['id' => $eventId, 'name' => $event['name']],
            'guest' => $guest ? ['id' => $guest['id'], 'name' => $guest['name']] : null,
            'admittedCount' => (int) $countStatement->fetchColumn(),
        ];
    });
    json_response($result);
}
