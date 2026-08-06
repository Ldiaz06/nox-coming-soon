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

function event_guest_lists_schema_ready(PDO $pdo): bool
{
    try {
        $pdo->query(
            'SELECT guest.guest_list_id
             FROM event_guests guest
             LEFT JOIN event_guest_lists guest_list ON guest_list.id = guest.guest_list_id
             WHERE 1 = 0'
        );
        $pending = $pdo->query(
            "SELECT
                EXISTS(
                    SELECT 1
                    FROM events event
                    WHERE event.access_mode = 'personal'
                      AND NOT EXISTS (
                          SELECT 1 FROM event_guest_lists guest_list
                          WHERE guest_list.event_id = event.id
                      )
                    LIMIT 1
                )
                OR EXISTS(
                    SELECT 1 FROM event_guests guest
                    WHERE guest.guest_list_id IS NULL
                    LIMIT 1
                )"
        )->fetchColumn();
        return (int) $pending === 0;
    } catch (PDOException $error) {
        $nativeCode = isset($error->errorInfo[1])
            ? (int) $error->errorInfo[1]
            : (is_numeric($error->getCode()) ? (int) $error->getCode() : 0);
        if (in_array($nativeCode, [1054, 1146], true)) {
            return false;
        }
        throw $error;
    }
}

function event_guest_lists_ensure_schema(PDO $pdo): void
{
    static $ready = false;
    if ($ready || event_guest_lists_schema_ready($pdo)) {
        $ready = true;
        return;
    }

    $lockAcquired = false;
    try {
        $lock = $pdo->prepare('SELECT GET_LOCK(?, 10)');
        $lock->execute(['nox_event_guest_lists_schema_v1']);
        $lockAcquired = (int) $lock->fetchColumn() === 1;
        if (!$lockAcquired) {
            throw new RuntimeException('No fue posible reservar la actualización de eventos.');
        }
        if (event_guest_lists_schema_ready($pdo)) {
            $ready = true;
            return;
        }

        $pdo->exec(
            "CREATE TABLE IF NOT EXISTS event_guest_lists (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                event_id BIGINT UNSIGNED NOT NULL,
                name VARCHAR(160) NOT NULL,
                created_by BIGINT UNSIGNED NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY event_guest_lists_event_name_uq (event_id, name),
                KEY event_guest_lists_event_idx (event_id, created_at),
                CONSTRAINT event_guest_lists_event_fk
                    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
                CONSTRAINT event_guest_lists_creator_fk
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
            ) ENGINE=InnoDB"
        );

        $column = $pdo->query(
            "SELECT COUNT(*)
             FROM information_schema.columns
             WHERE table_schema = DATABASE()
               AND table_name = 'event_guests'
               AND column_name = 'guest_list_id'"
        );
        if ((int) $column->fetchColumn() === 0) {
            $pdo->exec(
                'ALTER TABLE event_guests
                 ADD COLUMN guest_list_id BIGINT UNSIGNED NULL AFTER event_id'
            );
        }

        $index = $pdo->query(
            "SELECT COUNT(*)
             FROM information_schema.statistics
             WHERE table_schema = DATABASE()
               AND table_name = 'event_guests'
               AND index_name = 'event_guests_list_idx'"
        );
        if ((int) $index->fetchColumn() === 0) {
            $pdo->exec(
                'ALTER TABLE event_guests
                 ADD KEY event_guests_list_idx (guest_list_id, created_at)'
            );
        }

        $foreignKey = $pdo->query(
            "SELECT COUNT(*)
             FROM information_schema.key_column_usage
             WHERE table_schema = DATABASE()
               AND table_name = 'event_guests'
               AND (
                    constraint_name = 'event_guests_list_fk'
                    OR (
                        column_name = 'guest_list_id'
                        AND referenced_table_name = 'event_guest_lists'
                        AND referenced_column_name = 'id'
                    )
               )"
        );
        if ((int) $foreignKey->fetchColumn() === 0) {
            $pdo->exec(
                'ALTER TABLE event_guests
                 ADD CONSTRAINT event_guests_list_fk
                 FOREIGN KEY (guest_list_id) REFERENCES event_guest_lists(id) ON DELETE SET NULL'
            );
        }

        $pdo->exec(
            "INSERT INTO event_guest_lists (event_id, name, created_by)
             SELECT event.id, 'Lista general', event.created_by
             FROM events event
             WHERE event.access_mode = 'personal'
               AND NOT EXISTS (
                   SELECT 1 FROM event_guest_lists guest_list
                   WHERE guest_list.event_id = event.id
               )"
        );
        $pdo->exec(
            'UPDATE event_guests guest
             SET guest_list_id = (
                 SELECT MIN(guest_list.id)
                 FROM event_guest_lists guest_list
                 WHERE guest_list.event_id = guest.event_id
             )
             WHERE guest.guest_list_id IS NULL'
        );
        if (!event_guest_lists_schema_ready($pdo)) {
            throw new RuntimeException('La actualización de listas quedó incompleta.');
        }
        $ready = true;
    } catch (Throwable $error) {
        error_log('NOX guest lists schema update failed: ' . $error->__toString());
        throw new ApiError(
            'La base de datos de Eventos necesita actualizarse. Ejecute admin/db/migrate_guest_lists.sql en phpMyAdmin y vuelva a intentar.',
            503
        );
    } finally {
        if ($lockAcquired) {
            try {
                $release = $pdo->prepare('SELECT RELEASE_LOCK(?)');
                $release->execute(['nox_event_guest_lists_schema_v1']);
            } catch (Throwable $releaseError) {
                error_log('NOX guest lists schema lock release failed: ' . $releaseError->getMessage());
            }
        }
    }
}

function event_guest_list_id(PDO $pdo, int $eventId, $rawListId, int $userId): int
{
    if ($rawListId !== null && $rawListId !== '') {
        $listId = filter_var($rawListId, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($listId === false) {
            throw new ApiError('Seleccione una lista válida.');
        }
        $statement = $pdo->prepare(
            'SELECT id FROM event_guest_lists WHERE id = ? AND event_id = ? LIMIT 1'
        );
        $statement->execute([(int) $listId, $eventId]);
        if ($statement->fetchColumn() !== false) {
            return (int) $listId;
        }
        throw new ApiError('La lista seleccionada no pertenece a este evento.', 409);
    }

    $statement = $pdo->prepare(
        'SELECT id FROM event_guest_lists WHERE event_id = ? ORDER BY id LIMIT 1'
    );
    $statement->execute([$eventId]);
    $existing = $statement->fetchColumn();
    if ($existing !== false) {
        return (int) $existing;
    }

    $insert = $pdo->prepare(
        'INSERT INTO event_guest_lists (event_id, name, created_by) VALUES (?, ?, ?)'
    );
    $insert->execute([$eventId, 'Lista general', $userId]);
    return (int) $pdo->lastInsertId();
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
    event_guest_lists_ensure_schema(db());
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
    event_guest_lists_ensure_schema(db());
    $eventId = path_id($params);
    $pdo = db();
    $event = event_row($pdo, $eventId);
    if (!$event) {
        throw new ApiError('Evento no encontrado.', 404);
    }
    $guestStatement = $pdo->prepare(
        "SELECT g.id, g.full_name AS fullName, g.contact, g.notes, g.qr_token AS qrToken,
                g.status, g.admitted_at AS admittedAt, admitted.full_name AS admittedBy,
                g.created_at AS createdAt, g.guest_list_id AS listId,
                COALESCE(guest_list.name, 'Sin lista') AS listName
         FROM event_guests g
         LEFT JOIN users admitted ON admitted.id = g.admitted_by
         LEFT JOIN event_guest_lists guest_list ON guest_list.id = g.guest_list_id
         WHERE g.event_id = ?
         ORDER BY g.created_at DESC, g.id DESC"
    );
    $guestStatement->execute([$eventId]);
    $listStatement = $pdo->prepare(
        "SELECT guest_list.id, guest_list.name, guest_list.created_at AS createdAt,
                COUNT(guest.id) AS guestCount,
                SUM(guest.status = 'admitted') AS admittedCount
         FROM event_guest_lists guest_list
         LEFT JOIN event_guests guest ON guest.guest_list_id = guest_list.id
         WHERE guest_list.event_id = ?
         GROUP BY guest_list.id, guest_list.name, guest_list.created_at
         ORDER BY guest_list.created_at, guest_list.id"
    );
    $listStatement->execute([$eventId]);
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
        'guestLists' => $listStatement->fetchAll(),
        'guests' => $guests,
        'accesses' => $accessStatement->fetchAll(),
    ]);
}

function events_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
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
        if ($accessMode === 'personal') {
            $pdo->prepare(
                'INSERT INTO event_guest_lists (event_id, name, created_by) VALUES (?, ?, ?)'
            )->execute([$id, 'Lista general', $user['id']]);
        }
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
    event_guest_lists_ensure_schema(db());
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
        if ($accessMode !== $event['accessMode']) {
            if ($accessMode === 'personal') {
                event_guest_list_id($pdo, $eventId, null, (int) $user['id']);
            } else {
                $pdo->prepare('DELETE FROM event_guest_lists WHERE event_id = ?')->execute([$eventId]);
            }
        }
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

function event_guest_lists_create(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $eventId = path_id($params);
    $name = value_string(request_body(), 'name', 2, 160);

    try {
        $listId = transaction(function (PDO $pdo) use ($user, $eventId, $name): int {
            $event = event_row($pdo, $eventId, true);
            if (!$event) {
                throw new ApiError('Evento no encontrado.', 404);
            }
            if ($event['accessMode'] !== 'personal') {
                throw new ApiError('Solo los eventos con QR personal pueden tener listas.', 409);
            }
            if ($event['status'] === 'cancelled') {
                throw new ApiError('No se pueden crear listas en un evento cancelado.', 409);
            }
            $statement = $pdo->prepare(
                'INSERT INTO event_guest_lists (event_id, name, created_by) VALUES (?, ?, ?)'
            );
            $statement->execute([$eventId, $name, $user['id']]);
            $id = (int) $pdo->lastInsertId();
            audit_log($pdo, $user, 'create', 'event_guest_list', $id, null, [
                'eventId' => $eventId,
                'name' => $name,
            ]);
            return $id;
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('Ya existe una lista con ese nombre en el evento.', 409);
        }
        throw $error;
    }

    json_response(['id' => $listId, 'name' => $name], 201);
}

function event_guest_lists_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $listId = path_id($params);
    $name = value_string(request_body(), 'name', 2, 160);

    try {
        $eventId = transaction(function (PDO $pdo) use ($user, $listId, $name): int {
            $statement = $pdo->prepare(
                'SELECT id, event_id AS eventId, name FROM event_guest_lists WHERE id = ? FOR UPDATE'
            );
            $statement->execute([$listId]);
            $list = $statement->fetch();
            if (!$list) {
                throw new ApiError('Lista no encontrada.', 404);
            }
            $pdo->prepare('UPDATE event_guest_lists SET name = ? WHERE id = ?')
                ->execute([$name, $listId]);
            audit_log($pdo, $user, 'update', 'event_guest_list', $listId, [
                'eventId' => $list['eventId'],
                'name' => $list['name'],
            ], [
                'eventId' => $list['eventId'],
                'name' => $name,
            ]);
            return (int) $list['eventId'];
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('Ya existe una lista con ese nombre en el evento.', 409);
        }
        throw $error;
    }

    json_response(['id' => $listId, 'eventId' => $eventId, 'name' => $name]);
}

function events_delete(array $params)
{
    require_csrf();
    $user = require_roles(['admin']);
    event_guest_lists_ensure_schema(db());
    $eventId = path_id($params);
    $confirmation = value_string(request_body(), 'confirmation', 2, 160);

    $result = transaction(function (PDO $pdo) use ($user, $eventId, $confirmation): array {
        $event = event_row($pdo, $eventId, true);
        if (!$event) {
            throw new ApiError('Evento no encontrado.', 404);
        }
        if (!hash_equals((string) $event['name'], $confirmation)) {
            throw new ApiError('El nombre de confirmación no coincide con el evento.', 409);
        }

        $guestStatement = $pdo->prepare('SELECT id FROM event_guests WHERE event_id = ?');
        $guestStatement->execute([$eventId]);
        $guestIds = array_map('intval', $guestStatement->fetchAll(PDO::FETCH_COLUMN));
        $listStatement = $pdo->prepare('SELECT id FROM event_guest_lists WHERE event_id = ?');
        $listStatement->execute([$eventId]);
        $listIds = array_map('intval', $listStatement->fetchAll(PDO::FETCH_COLUMN));

        $accessWhere = 'event_id = ?';
        $accessParams = [$eventId];
        if ($guestIds) {
            $accessWhere .= ' OR guest_id IN (' . placeholders(count($guestIds)) . ')';
            $accessParams = array_merge($accessParams, $guestIds);
        }
        $accessStatement = $pdo->prepare("SELECT COUNT(*) FROM event_access_log WHERE {$accessWhere}");
        $accessStatement->execute($accessParams);
        $accessCount = (int) $accessStatement->fetchColumn();

        $pdo->prepare("DELETE FROM event_access_log WHERE {$accessWhere}")->execute($accessParams);

        if ($guestIds) {
            $guestAudit = $pdo->prepare(
                "DELETE FROM audit_log
                 WHERE entity_type = 'event_guest'
                   AND entity_id IN (" . placeholders(count($guestIds)) . ')'
            );
            $guestAudit->execute($guestIds);
        }
        if ($listIds) {
            $listAudit = $pdo->prepare(
                "DELETE FROM audit_log
                 WHERE entity_type = 'event_guest_list'
                   AND entity_id IN (" . placeholders(count($listIds)) . ')'
            );
            $listAudit->execute($listIds);
        }
        $pdo->prepare(
            "DELETE FROM audit_log
             WHERE entity_type = 'event'
               AND entity_id = ?"
        )->execute([$eventId]);
        $pdo->prepare(
            "DELETE FROM audit_log
             WHERE entity_type IN ('event_guest', 'event_guest_deletion', 'event_guest_list_deletion')
               AND entity_id IS NULL
               AND (
                    JSON_UNQUOTE(JSON_EXTRACT(before_data, '$.eventId')) = ?
                    OR JSON_UNQUOTE(JSON_EXTRACT(after_data, '$.eventId')) = ?
               )"
        )->execute([(string) $eventId, (string) $eventId]);

        $delete = $pdo->prepare('DELETE FROM events WHERE id = ?');
        $delete->execute([$eventId]);
        if ($delete->rowCount() !== 1) {
            throw new ApiError('No fue posible eliminar el evento.', 409);
        }

        audit_log($pdo, $user, 'delete', 'event_deletion', null, null, [
            'guestCount' => count($guestIds),
            'accessCount' => $accessCount,
        ]);
        return [
            'deleted' => true,
            'guestCount' => count($guestIds),
            'accessCount' => $accessCount,
        ];
    });

    json_response($result);
}

function event_guest_repair_text($value): string
{
    $text = (string) ($value ?? '');
    if (function_exists('iconv') && preg_match('/[ÃÂâ]/u', $text)) {
        $repaired = preg_replace_callback(
            '/(?:Ã.|Â.|â..)+/u',
            static function (array $match): string {
                $candidate = @iconv('UTF-8', 'Windows-1252//IGNORE', $match[0]);
                return is_string($candidate) && preg_match('//u', $candidate)
                    ? $candidate
                    : $match[0];
            },
            $text
        );
        if (is_string($repaired)) {
            $text = $repaired;
        }
    }
    $text = preg_replace('/[\x{00A0}\x{1680}\x{2000}-\x{200A}\x{202F}\x{205F}\x{3000}]/u', ' ', $text) ?? $text;
    $text = preg_replace('/[\x{200B}\x{2060}\x{FEFF}]/u', '', $text) ?? $text;
    $text = preg_replace('/[ \t]+/u', ' ', $text) ?? $text;
    if (class_exists('Normalizer')) {
        $normalized = Normalizer::normalize($text, Normalizer::FORM_C);
        if (is_string($normalized)) {
            $text = $normalized;
        }
    }
    return trim($text);
}

function event_guest_values(array $body, ?int $rowNumber = null): array
{
    $cleanBody = $body;
    foreach (['fullName', 'contact', 'notes'] as $field) {
        if (array_key_exists($field, $cleanBody)) {
            $cleanBody[$field] = event_guest_repair_text($cleanBody[$field]);
        }
    }
    try {
        return [
            'fullName' => value_string($cleanBody, 'fullName', 2, 160),
            'contact' => value_string($cleanBody, 'contact', 0, 160, false),
            'notes' => value_string($cleanBody, 'notes', 0, 300, false),
        ];
    } catch (ApiError $error) {
        if ($rowNumber === null) {
            throw $error;
        }
        throw new ApiError("Fila {$rowNumber}: " . $error->getMessage(), $error->status);
    }
}

function event_guests_delete_rows(PDO $pdo, array $user, int $eventId, array $ids): array
{
    $ids = array_values(array_unique(array_filter(
        array_map('intval', $ids),
        static fn (int $id): bool => $id > 0
    )));
    if (!$ids) {
        return ['deleted' => 0, 'accessCount' => 0];
    }

    $in = placeholders(count($ids));
    $statement = $pdo->prepare(
        "SELECT id, full_name AS fullName, guest_list_id AS listId
         FROM event_guests
         WHERE event_id = ? AND id IN ({$in})
         ORDER BY id FOR UPDATE"
    );
    $statement->execute(array_merge([$eventId], $ids));
    $guests = $statement->fetchAll();
    if (count($guests) !== count($ids)) {
        throw new ApiError('Uno o más invitados ya no pertenecen a este evento.', 409);
    }

    $accessCountStatement = $pdo->prepare(
        "SELECT COUNT(*) FROM event_access_log WHERE guest_id IN ({$in})"
    );
    $accessCountStatement->execute($ids);
    $accessCount = (int) $accessCountStatement->fetchColumn();
    $pdo->prepare("DELETE FROM event_access_log WHERE guest_id IN ({$in})")->execute($ids);
    $pdo->prepare(
        "DELETE FROM audit_log
         WHERE entity_type = 'event_guest' AND entity_id IN ({$in})"
    )->execute($ids);
    $delete = $pdo->prepare(
        "DELETE FROM event_guests WHERE event_id = ? AND id IN ({$in})"
    );
    $delete->execute(array_merge([$eventId], $ids));
    if ($delete->rowCount() !== count($ids)) {
        throw new ApiError('No fue posible eliminar todos los invitados seleccionados.', 409);
    }

    audit_log($pdo, $user, 'delete_bulk', 'event_guest_deletion', null, [
        'eventId' => $eventId,
        'guests' => array_map(static fn (array $guest): array => [
            'id' => (int) $guest['id'],
            'fullName' => $guest['fullName'],
            'listId' => $guest['listId'] !== null ? (int) $guest['listId'] : null,
        ], $guests),
    ], [
        'eventId' => $eventId,
        'deleted' => count($guests),
        'accessCount' => $accessCount,
    ]);

    return ['deleted' => count($guests), 'accessCount' => $accessCount];
}

function event_guests_create(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $eventId = path_id($params);
    $body = request_body();
    $guest = event_guest_values($body);
    $fullName = $guest['fullName'];
    $contact = $guest['contact'];
    $notes = $guest['notes'];
    $requestedListId = $body['listId'] ?? null;
    $token = event_access_token('P');
    $result = transaction(function (PDO $pdo) use ($user, $eventId, $fullName, $contact, $notes, $requestedListId, $token): array {
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
        $listId = event_guest_list_id($pdo, $eventId, $requestedListId, (int) $user['id']);
        $statement = $pdo->prepare(
            "INSERT INTO event_guests (event_id, guest_list_id, full_name, contact, notes, qr_token, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'invited', ?)"
        );
        $statement->execute([$eventId, $listId, $fullName, $contact, $notes, $token, $user['id']]);
        $id = (int) $pdo->lastInsertId();
        audit_log($pdo, $user, 'create', 'event_guest', $id, null, [
            'eventId' => $eventId,
            'fullName' => $fullName,
            'contact' => $contact,
            'listId' => $listId,
        ]);
        return ['id' => $id, 'listId' => $listId];
    });
    json_response(['id' => $result['id'], 'listId' => $result['listId'], 'qrToken' => $token], 201);
}

function event_guests_import(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $eventId = path_id($params);
    $body = request_body();
    $rows = $body['guests'] ?? null;
    $requestedListId = $body['listId'] ?? null;
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

    $result = transaction(function (PDO $pdo) use ($user, $eventId, $guests, $requestedListId): array {
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
        $listId = event_guest_list_id($pdo, $eventId, $requestedListId, (int) $user['id']);

        $statement = $pdo->prepare(
            "INSERT INTO event_guests (event_id, guest_list_id, full_name, contact, notes, qr_token, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'invited', ?)"
        );
        foreach ($guests as $guest) {
            $statement->execute([
                $eventId,
                $listId,
                $guest['fullName'],
                $guest['contact'],
                $guest['notes'],
                event_access_token('P'),
                $user['id'],
            ]);
        }
        audit_log($pdo, $user, 'bulk_create', 'event_guest', null, null, [
            'eventId' => $eventId,
            'listId' => $listId,
            'guestCount' => count($guests),
        ]);
        return ['createdCount' => count($guests), 'listId' => $listId];
    });

    json_response($result, 201);
}

function event_guests_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $guestId = path_id($params);
    $body = request_body();
    $values = event_guest_values($body);

    $result = transaction(function (PDO $pdo) use ($user, $guestId, $body, $values): array {
        $statement = $pdo->prepare(
            "SELECT id, event_id AS eventId, guest_list_id AS listId, full_name AS fullName,
                    contact, notes, status
             FROM event_guests WHERE id = ? FOR UPDATE"
        );
        $statement->execute([$guestId]);
        $guest = $statement->fetch();
        if (!$guest) {
            throw new ApiError('Invitación no encontrada.', 404);
        }
        $listId = event_guest_list_id(
            $pdo,
            (int) $guest['eventId'],
            $body['listId'] ?? $guest['listId'],
            (int) $user['id']
        );
        $pdo->prepare(
            'UPDATE event_guests
             SET guest_list_id = ?, full_name = ?, contact = ?, notes = ?
             WHERE id = ?'
        )->execute([
            $listId,
            $values['fullName'],
            $values['contact'],
            $values['notes'],
            $guestId,
        ]);
        $after = [
            'eventId' => (int) $guest['eventId'],
            'listId' => $listId,
            'fullName' => $values['fullName'],
            'contact' => $values['contact'],
            'notes' => $values['notes'],
        ];
        audit_log($pdo, $user, 'update', 'event_guest', $guestId, [
            'eventId' => (int) $guest['eventId'],
            'listId' => $guest['listId'] !== null ? (int) $guest['listId'] : null,
            'fullName' => $guest['fullName'],
            'contact' => $guest['contact'],
            'notes' => $guest['notes'],
        ], $after);
        return ['id' => $guestId] + $after;
    });

    json_response($result);
}

function event_guests_delete(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $eventId = path_id($params);
    $body = request_body();
    $all = filter_var($body['all'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $requestedIds = is_array($body['ids'] ?? null) ? $body['ids'] : [];
    $requestedIds = array_values(array_unique(array_filter(
        array_map('intval', $requestedIds),
        static fn (int $id): bool => $id > 0
    )));
    if (!$all && (!$requestedIds || count($requestedIds) > 1000)) {
        throw new ApiError('Seleccione entre 1 y 1000 invitados.');
    }

    $result = transaction(function (PDO $pdo) use ($user, $eventId, $body, $all, $requestedIds): array {
        $event = event_row($pdo, $eventId, true);
        if (!$event) {
            throw new ApiError('Evento no encontrado.', 404);
        }
        $ids = $requestedIds;
        if ($all) {
            $listId = $body['listId'] ?? null;
            if ($listId !== null && $listId !== '') {
                $listId = event_guest_list_id($pdo, $eventId, $listId, (int) $user['id']);
                $statement = $pdo->prepare(
                    'SELECT id FROM event_guests WHERE event_id = ? AND guest_list_id = ?'
                );
                $statement->execute([$eventId, $listId]);
            } else {
                $statement = $pdo->prepare('SELECT id FROM event_guests WHERE event_id = ?');
                $statement->execute([$eventId]);
            }
            $ids = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
        }
        return event_guests_delete_rows($pdo, $user, $eventId, $ids);
    });

    json_response($result);
}

function event_guest_lists_delete(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $listId = path_id($params);
    $confirmation = value_string(request_body(), 'confirmation', 2, 160);

    $result = transaction(function (PDO $pdo) use ($user, $listId, $confirmation): array {
        $statement = $pdo->prepare(
            'SELECT id, event_id AS eventId, name FROM event_guest_lists WHERE id = ? FOR UPDATE'
        );
        $statement->execute([$listId]);
        $list = $statement->fetch();
        if (!$list) {
            throw new ApiError('Lista no encontrada.', 404);
        }
        if (!hash_equals((string) $list['name'], $confirmation)) {
            throw new ApiError('El nombre de confirmación no coincide con la lista.', 409);
        }

        $guestStatement = $pdo->prepare(
            'SELECT id FROM event_guests WHERE event_id = ? AND guest_list_id = ?'
        );
        $guestStatement->execute([(int) $list['eventId'], $listId]);
        $ids = array_map('intval', $guestStatement->fetchAll(PDO::FETCH_COLUMN));
        $deleted = event_guests_delete_rows($pdo, $user, (int) $list['eventId'], $ids);
        $pdo->prepare(
            "DELETE FROM audit_log WHERE entity_type = 'event_guest_list' AND entity_id = ?"
        )->execute([$listId]);
        $pdo->prepare('DELETE FROM event_guest_lists WHERE id = ?')->execute([$listId]);
        $remaining = $pdo->prepare('SELECT COUNT(*) FROM event_guest_lists WHERE event_id = ?');
        $remaining->execute([(int) $list['eventId']]);
        $replacementListId = null;
        if ((int) $remaining->fetchColumn() === 0) {
            $pdo->prepare(
                'INSERT INTO event_guest_lists (event_id, name, created_by) VALUES (?, ?, ?)'
            )->execute([(int) $list['eventId'], 'Lista general', $user['id']]);
            $replacementListId = (int) $pdo->lastInsertId();
        }
        audit_log($pdo, $user, 'delete', 'event_guest_list_deletion', null, [
            'eventId' => (int) $list['eventId'],
            'listId' => $listId,
            'name' => $list['name'],
        ], [
            'eventId' => (int) $list['eventId'],
            'guestCount' => $deleted['deleted'],
            'accessCount' => $deleted['accessCount'],
            'replacementListId' => $replacementListId,
        ]);
        return [
            'deleted' => true,
            'eventId' => (int) $list['eventId'],
            'guestCount' => $deleted['deleted'],
            'accessCount' => $deleted['accessCount'],
            'replacementListId' => $replacementListId,
        ];
    });

    json_response($result);
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
