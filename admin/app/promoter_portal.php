<?php
declare(strict_types=1);

function promoter_portal_headers(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
}

function promoter_portal_code($value): string
{
    $raw = strtoupper(trim((string) $value));
    if (preg_match('/(?<![A-F0-9])(PR-[A-F0-9]{24})(?![A-F0-9])/', $raw, $match) !== 1) {
        throw new ApiError('El código de promotor no es válido.');
    }
    return $match[1];
}

function promoter_portal_new_code(): string
{
    return 'PR-' . strtoupper(bin2hex(random_bytes(12)));
}

function promoter_portal_origin(): string
{
    $configured = rtrim((string) nox_config_value('app_origin', ''), '/');
    if ($configured !== '') {
        return $configured;
    }
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host !== '' ? "{$scheme}://{$host}" : '';
}

function promoter_portal_list(PDO $pdo, string $code, bool $lock = false): ?array
{
    $sql = "SELECT guest_list.id, guest_list.event_id AS eventId, guest_list.name AS listName,
                   guest_list.created_by AS createdBy, guest_list.promoter_code_hint AS codeHint,
                   event.name AS eventName, event.access_mode AS accessMode,
                   event.status AS eventStatus, event.starts_at AS startsAt, event.ends_at AS endsAt,
                   (SELECT COUNT(*) FROM event_guests guest
                    WHERE guest.guest_list_id = guest_list.id
                      AND guest.status <> 'cancelled') AS guestCount
            FROM event_guest_lists guest_list
            JOIN events event ON event.id = guest_list.event_id
            WHERE guest_list.promoter_code_hash = ?
              AND guest_list.promoter_code_enabled = 1
            LIMIT 1";
    if ($lock) {
        $sql .= ' FOR UPDATE';
    }
    $statement = $pdo->prepare($sql);
    $statement->execute([hash('sha256', $code)]);
    $list = $statement->fetch();
    return $list ?: null;
}

function promoter_portal_require_open(array $list): void
{
    if ($list['accessMode'] !== 'personal') {
        throw new ApiError('Esta lista ya no acepta invitaciones personales.', 409);
    }
    if ($list['eventStatus'] !== 'active') {
        throw new ApiError('El evento no está aceptando nuevos invitados.', 409);
    }
    $timezone = new DateTimeZone('America/Panama');
    if (new DateTimeImmutable('now', $timezone) > new DateTimeImmutable($list['endsAt'], $timezone)) {
        throw new ApiError('El evento ya finalizó y la lista está cerrada.', 409);
    }
}

function event_guest_list_promoter_code_create(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $listId = path_id($params);
    $code = promoter_portal_new_code();
    $hint = substr($code, -6);

    $result = transaction(function (PDO $pdo) use ($user, $listId, $code, $hint): array {
        $statement = $pdo->prepare(
            "SELECT guest_list.id, guest_list.event_id AS eventId, guest_list.name,
                    guest_list.promoter_code_enabled AS wasEnabled,
                    event.access_mode AS accessMode
             FROM event_guest_lists guest_list
             JOIN events event ON event.id = guest_list.event_id
             WHERE guest_list.id = ?
             FOR UPDATE"
        );
        $statement->execute([$listId]);
        $list = $statement->fetch();
        if (!$list) {
            throw new ApiError('Lista no encontrada.', 404);
        }
        if ($list['accessMode'] !== 'personal') {
            throw new ApiError('Solo las listas de eventos personales admiten promotores.', 409);
        }
        $pdo->prepare(
            'UPDATE event_guest_lists
             SET promoter_code_hash = ?, promoter_code_hint = ?,
                 promoter_code_enabled = 1, promoter_code_created_at = NOW()
             WHERE id = ?'
        )->execute([hash('sha256', $code), $hint, $listId]);
        audit_log($pdo, $user, !empty($list['wasEnabled']) ? 'regenerate_code' : 'create_code', 'event_guest_list', $listId, null, [
            'eventId' => (int) $list['eventId'],
            'promoterCodeHint' => $hint,
        ]);
        return ['eventId' => (int) $list['eventId'], 'listName' => $list['name']];
    });

    $origin = promoter_portal_origin();
    json_response([
        'listId' => $listId,
        'listName' => $result['listName'],
        'code' => $code,
        'portalUrl' => $origin . '/promotores/',
        'directUrl' => $origin . '/promotores/#' . rawurlencode($code),
    ], 201);
}

function event_guest_list_promoter_code_delete(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    event_guest_lists_ensure_schema(db());
    $listId = path_id($params);

    transaction(function (PDO $pdo) use ($user, $listId): void {
        $statement = $pdo->prepare(
            'SELECT id, event_id AS eventId, promoter_code_hint AS codeHint
             FROM event_guest_lists WHERE id = ? FOR UPDATE'
        );
        $statement->execute([$listId]);
        $list = $statement->fetch();
        if (!$list) {
            throw new ApiError('Lista no encontrada.', 404);
        }
        $pdo->prepare(
            'UPDATE event_guest_lists
             SET promoter_code_hash = NULL, promoter_code_hint = NULL,
                 promoter_code_enabled = 0, promoter_code_created_at = NULL
             WHERE id = ?'
        )->execute([$listId]);
        audit_log($pdo, $user, 'revoke_code', 'event_guest_list', $listId, [
            'eventId' => (int) $list['eventId'],
            'promoterCodeHint' => $list['codeHint'],
        ], null);
    });
    json_response(['revoked' => true, 'listId' => $listId]);
}

function public_promoter_lookup(array $params = [])
{
    promoter_portal_headers();
    event_guest_lists_ensure_schema(db());
    $code = promoter_portal_code(request_body()['code'] ?? '');
    $list = promoter_portal_list(db(), $code);
    if (!$list) {
        throw new ApiError('Código de promotor incorrecto o desactivado.', 404);
    }
    promoter_portal_require_open($list);
    json_response([
        'portal' => [
            'eventName' => $list['eventName'],
            'listName' => $list['listName'],
            'startsAt' => (new DateTimeImmutable($list['startsAt'], new DateTimeZone('America/Panama')))
                ->format(DateTimeInterface::ATOM),
            'guestCount' => (int) $list['guestCount'],
        ],
    ]);
}

function public_promoter_guests_create(array $params = [])
{
    promoter_portal_headers();
    event_guest_lists_ensure_schema(db());
    $body = request_body();
    $code = promoter_portal_code($body['code'] ?? '');
    $rows = $body['guests'] ?? null;
    if (!is_array($rows) || count($rows) < 1 || count($rows) > 100) {
        throw new ApiError('Agregue entre 1 y 100 invitados.');
    }

    $guests = [];
    $seen = [];
    foreach (array_values($rows) as $index => $row) {
        if (!is_array($row)) {
            throw new ApiError('Una de las filas no es válida.');
        }
        $guest = event_guest_values($row, $index + 1);
        $fingerprint = mb_strtolower($guest['fullName'] . "\0" . ($guest['contact'] ?? ''));
        if (isset($seen[$fingerprint])) {
            throw new ApiError('La lista pegada contiene invitados repetidos.');
        }
        $seen[$fingerprint] = true;
        $guests[] = $guest;
    }

    $created = transaction(function (PDO $pdo) use ($code, $guests): array {
        $list = promoter_portal_list($pdo, $code, true);
        if (!$list) {
            throw new ApiError('Código de promotor incorrecto o desactivado.', 404);
        }
        promoter_portal_require_open($list);
        $insert = $pdo->prepare(
            "INSERT INTO event_guests
                (event_id, guest_list_id, full_name, contact, notes, qr_token, status, created_by)
             VALUES (?, ?, ?, ?, ?, ?, 'invited', ?)"
        );
        $created = [];
        $guestIds = [];
        foreach ($guests as $guest) {
            $token = event_access_token('P');
            $insert->execute([
                $list['eventId'],
                $list['id'],
                $guest['fullName'],
                $guest['contact'],
                $guest['notes'],
                $token,
                $list['createdBy'],
            ]);
            $guestIds[] = (int) $pdo->lastInsertId();
            $created[] = [
                'fullName' => $guest['fullName'],
                'token' => $token,
                'invitationUrl' => promoter_portal_origin() . '/invite/#' . rawurlencode($token),
            ];
        }
        $audit = $pdo->prepare(
            "INSERT INTO audit_log
                (user_id, action, entity_type, entity_id, before_data, after_data, ip_address)
             VALUES (NULL, 'promoter_create', 'event_guest', NULL, NULL, ?, ?)"
        );
        $audit->execute([
            json_encode([
                'eventId' => (int) $list['eventId'],
                'listId' => (int) $list['id'],
                'guestIds' => $guestIds,
                'guestCount' => count($guestIds),
                'source' => 'promoter_portal',
            ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
        return $created;
    });

    json_response(['created' => $created, 'createdCount' => count($created)], 201);
}
