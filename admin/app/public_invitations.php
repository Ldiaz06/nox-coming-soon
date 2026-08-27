<?php
declare(strict_types=1);

/**
 * Public invitation portal and Wallet pass generation.
 *
 * The personal QR token is also the bearer token for the public invitation.
 * It already has a unique, case-sensitive database index and enough entropy
 * to avoid exposing sequential guest identifiers.
 */

function public_invitation_headers(): void
{
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
}

function public_invitation_token($value): string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        throw new ApiError('Escriba el token de su invitación.');
    }

    if (preg_match('/(?<![A-Za-z0-9_-])(P[A-Za-z0-9_-]{31})(?![A-Za-z0-9_-])/', $raw, $match) !== 1) {
        throw new ApiError('El token de la invitación no es válido.');
    }
    return $match[1];
}

function public_invitation_from_request(): array
{
    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    $body = strpos($contentType, 'application/x-www-form-urlencoded') === 0
        || strpos($contentType, 'multipart/form-data') === 0
        ? $_POST
        : request_body();
    $token = public_invitation_token($body['token'] ?? '');
    return public_invitation_find($token);
}

function public_invitation_find(string $token): array
{
    $statement = db()->prepare(
        "SELECT g.id, g.full_name AS guestName, g.qr_token AS qrToken,
                g.status AS guestStatus, g.admitted_at AS admittedAt,
                e.id AS eventId, e.name AS eventName, e.status AS eventStatus,
                e.starts_at AS startsAt, e.ends_at AS endsAt
         FROM event_guests g
         JOIN events e ON e.id = g.event_id
         WHERE g.qr_token = ?
         LIMIT 1"
    );
    $statement->execute([$token]);
    $invitation = $statement->fetch();
    if (!$invitation) {
        throw new ApiError('Invitación no encontrada.', 404);
    }

    $invitation['id'] = (int) $invitation['id'];
    $invitation['eventId'] = (int) $invitation['eventId'];
    return $invitation;
}

function public_invitation_iso_date(string $value): string
{
    $timezone = new DateTimeZone('America/Panama');
    return (new DateTimeImmutable($value, $timezone))->format(DateTimeInterface::ATOM);
}

function public_invitation_state(array $invitation): array
{
    $timezone = new DateTimeZone('America/Panama');
    $now = new DateTimeImmutable('now', $timezone);
    $startsAt = new DateTimeImmutable($invitation['startsAt'], $timezone);
    $endsAt = new DateTimeImmutable($invitation['endsAt'], $timezone);

    if ($invitation['guestStatus'] === 'cancelled') {
        return ['code' => 'cancelled', 'label' => 'Invitación cancelada', 'usable' => false];
    }
    if ($invitation['guestStatus'] === 'admitted' || $invitation['admittedAt'] !== null) {
        return ['code' => 'admitted', 'label' => 'Entrada registrada', 'usable' => false];
    }
    if ($invitation['eventStatus'] === 'cancelled') {
        return ['code' => 'event_cancelled', 'label' => 'Evento cancelado', 'usable' => false];
    }
    if ($invitation['eventStatus'] !== 'active') {
        return ['code' => 'event_closed', 'label' => 'Evento cerrado', 'usable' => false];
    }
    if ($now > $endsAt) {
        return ['code' => 'ended', 'label' => 'Evento finalizado', 'usable' => false];
    }
    if ($now < $startsAt) {
        return ['code' => 'upcoming', 'label' => 'Invitación confirmada', 'usable' => true];
    }
    return ['code' => 'active', 'label' => 'Invitación activa', 'usable' => true];
}

function public_invitation_apple_is_configured(): bool
{
    $requiredValues = [
        (string) nox_config_value('wallet.apple.pass_type_identifier', ''),
        (string) nox_config_value('wallet.apple.team_identifier', ''),
    ];
    $requiredFiles = [
        (string) nox_config_value('wallet.apple.pkcs12_path', ''),
        (string) nox_config_value('wallet.apple.wwdr_certificate_path', ''),
        dirname(__DIR__) . '/public/assets/wallet/icon.png',
        dirname(__DIR__) . '/public/assets/wallet/icon@2x.png',
    ];

    foreach ($requiredValues as $value) {
        if ($value === '') {
            return false;
        }
    }
    foreach ($requiredFiles as $path) {
        if ($path === '' || !is_readable($path)) {
            return false;
        }
    }
    return extension_loaded('openssl') && class_exists('ZipArchive');
}

function public_invitation_google_is_configured(): bool
{
    $issuerId = (string) nox_config_value('wallet.google.issuer_id', '');
    $credentialsPath = (string) nox_config_value('wallet.google.service_account_json_path', '');
    return $issuerId !== ''
        && $credentialsPath !== ''
        && is_readable($credentialsPath)
        && extension_loaded('openssl');
}

function public_invitation_public_data(array $invitation): array
{
    $state = public_invitation_state($invitation);
    $usable = (bool) $state['usable'];

    return [
        'guestName' => $invitation['guestName'],
        'event' => [
            'name' => $invitation['eventName'],
            'startsAt' => public_invitation_iso_date($invitation['startsAt']),
            'endsAt' => public_invitation_iso_date($invitation['endsAt']),
        ],
        'status' => [
            'code' => $state['code'],
            'label' => $state['label'],
        ],
        'qrAvailable' => $usable,
        'wallet' => [
            'apple' => $usable && public_invitation_apple_is_configured(),
            'google' => $usable && public_invitation_google_is_configured(),
        ],
    ];
}

function public_invitation_lookup(array $params = [])
{
    public_invitation_headers();
    $invitation = public_invitation_from_request();
    json_response(['invitation' => public_invitation_public_data($invitation)]);
}

function public_invitation_require_usable(array $invitation): void
{
    if (!public_invitation_state($invitation)['usable']) {
        throw new ApiError('Esta invitación ya no está disponible para Wallet.', 409);
    }
}

function public_invitation_base64url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function public_invitation_google_credentials(): array
{
    $path = (string) nox_config_value('wallet.google.service_account_json_path', '');
    if ($path === '' || !is_readable($path)) {
        throw new ApiError('Google Wallet todavía no está configurado.', 503);
    }
    $json = file_get_contents($path);
    if ($json === false) {
        throw new ApiError('No fue posible leer la configuración de Google Wallet.', 503);
    }
    try {
        $credentials = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        throw new ApiError('La credencial de Google Wallet no contiene JSON válido.', 503);
    }
    if (!is_array($credentials)
        || empty($credentials['client_email'])
        || empty($credentials['private_key'])
    ) {
        throw new ApiError('La credencial de Google Wallet está incompleta.', 503);
    }
    return $credentials;
}

function public_invitation_localized(string $value): array
{
    return [
        'defaultValue' => [
            'language' => 'es',
            'value' => $value,
        ],
    ];
}

function public_invitation_google_save_url(array $invitation): string
{
    if (!public_invitation_google_is_configured()) {
        throw new ApiError('Google Wallet todavía no está configurado.', 503);
    }

    $credentials = public_invitation_google_credentials();
    $issuerId = trim((string) nox_config_value('wallet.google.issuer_id', ''));
    $classSuffix = trim((string) nox_config_value('wallet.google.class_suffix', 'nox_event_invitation'));
    if (preg_match('/^[0-9]+$/', $issuerId) !== 1
        || preg_match('/^[A-Za-z0-9._-]+$/', $classSuffix) !== 1
    ) {
        throw new ApiError('Los identificadores de Google Wallet no son válidos.', 503);
    }

    $classId = $issuerId . '.' . $classSuffix;
    $objectId = $issuerId . '.guest_' . $invitation['id'] . '_'
        . substr(hash('sha256', $invitation['qrToken']), 0, 12);
    $origins = nox_config_value('wallet.google.origins', []);
    if (!is_array($origins) || !$origins) {
        $origin = (string) nox_config_value('public_invitation_origin', nox_config_value('app_origin', ''));
        $origins = $origin !== '' ? [$origin] : [];
    }

    $claims = [
        'iss' => $credentials['client_email'],
        'aud' => 'google',
        'origins' => array_values(array_filter(array_map('strval', $origins))),
        'typ' => 'savetowallet',
        'iat' => time(),
        'payload' => [
            'genericClasses' => [
                ['id' => $classId],
            ],
            'genericObjects' => [
                [
                    'id' => $objectId,
                    'classId' => $classId,
                    'state' => 'ACTIVE',
                    'cardTitle' => public_invitation_localized('NOOX Panamá'),
                    'header' => public_invitation_localized($invitation['guestName']),
                    'subheader' => public_invitation_localized($invitation['eventName']),
                    'hexBackgroundColor' => '#11100e',
                    'barcode' => [
                        'type' => 'QR_CODE',
                        'value' => 'NOX1:' . $invitation['qrToken'],
                        'alternateText' => 'Invitación personal NOOX',
                    ],
                    'textModulesData' => [
                        [
                            'id' => 'event_date',
                            'header' => 'FECHA Y HORA',
                            'body' => (new DateTimeImmutable(
                                $invitation['startsAt'],
                                new DateTimeZone('America/Panama')
                            ))->format('d/m/Y · g:i A'),
                        ],
                        [
                            'id' => 'access',
                            'header' => 'ACCESO',
                            'body' => 'Personal e intransferible. El código QR permite una sola entrada.',
                        ],
                    ],
                ],
            ],
        ],
    ];

    $header = ['alg' => 'RS256', 'typ' => 'JWT'];
    $signingInput = public_invitation_base64url(json_encode(
        $header,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    )) . '.' . public_invitation_base64url(json_encode(
        $claims,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    ));

    $privateKey = openssl_pkey_get_private($credentials['private_key']);
    if ($privateKey === false) {
        throw new ApiError('La llave privada de Google Wallet no es válida.', 503);
    }
    $signature = '';
    $signed = openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
    if (is_resource($privateKey)) {
        openssl_free_key($privateKey);
    }
    if (!$signed) {
        throw new ApiError('No fue posible firmar el pase de Google Wallet.', 503);
    }

    return 'https://pay.google.com/gp/v/save/' . $signingInput . '.'
        . public_invitation_base64url($signature);
}

function public_invitation_google_wallet(array $params = [])
{
    public_invitation_headers();
    $invitation = public_invitation_from_request();
    public_invitation_require_usable($invitation);
    json_response(['url' => public_invitation_google_save_url($invitation)]);
}

function public_invitation_temp_directory(): string
{
    $directory = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'nox-wallet-' . bin2hex(random_bytes(12));
    if (!mkdir($directory, 0700) && !is_dir($directory)) {
        throw new ApiError('No fue posible preparar el pase de Apple Wallet.', 503);
    }
    return $directory;
}

function public_invitation_cleanup_directory(string $directory): void
{
    $prefix = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
        . DIRECTORY_SEPARATOR . 'nox-wallet-';
    if (strpos($directory, $prefix) !== 0 || !is_dir($directory)) {
        return;
    }
    $files = scandir($directory);
    if (is_array($files)) {
        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            $path = $directory . DIRECTORY_SEPARATOR . $file;
            if (is_file($path)) {
                unlink($path);
            }
        }
    }
    rmdir($directory);
}

function public_invitation_apple_certificate(): array
{
    $path = (string) nox_config_value('wallet.apple.pkcs12_path', '');
    if ($path === '' || !is_readable($path)) {
        throw new ApiError('Apple Wallet todavía no está configurado.', 503);
    }
    $contents = file_get_contents($path);
    if ($contents === false) {
        throw new ApiError('No fue posible leer el certificado de Apple Wallet.', 503);
    }
    $certificates = [];
    $password = (string) nox_config_value('wallet.apple.pkcs12_password', '');
    if (!openssl_pkcs12_read($contents, $certificates, $password)
        || empty($certificates['cert'])
        || empty($certificates['pkey'])
    ) {
        throw new ApiError('El certificado o la contraseña de Apple Wallet no son válidos.', 503);
    }
    return $certificates;
}

function public_invitation_extract_pkcs7_signature(string $smime): string
{
    $pattern = '/Content-Type:\\s*application\\/(?:x-)?pkcs7-signature[^\\r\\n]*'
        . '[\\s\\S]*?\\r?\\n\\r?\\n([A-Za-z0-9+\\/=\\r\\n]+)\\r?\\n--/i';
    if (preg_match($pattern, $smime, $match) !== 1) {
        throw new ApiError('No fue posible preparar la firma de Apple Wallet.', 503);
    }
    $signature = base64_decode(preg_replace('/\\s+/', '', $match[1]), true);
    if ($signature === false || $signature === '') {
        throw new ApiError('La firma de Apple Wallet no es válida.', 503);
    }
    return $signature;
}

function public_invitation_apple_pass(array $invitation): array
{
    if (!public_invitation_apple_is_configured()) {
        throw new ApiError('Apple Wallet todavía no está configurado.', 503);
    }

    $directory = public_invitation_temp_directory();
    try {
        $barcode = [
            'format' => 'PKBarcodeFormatQR',
            'message' => 'NOX1:' . $invitation['qrToken'],
            'messageEncoding' => 'iso-8859-1',
            'altText' => 'Invitación personal NOOX',
        ];
        $pass = [
            'formatVersion' => 1,
            'passTypeIdentifier' => (string) nox_config_value('wallet.apple.pass_type_identifier', ''),
            'serialNumber' => 'guest-' . $invitation['id'] . '-'
                . substr(hash('sha256', $invitation['qrToken']), 0, 12),
            'teamIdentifier' => (string) nox_config_value('wallet.apple.team_identifier', ''),
            'organizationName' => 'NOOX Panamá',
            'description' => 'Invitación para ' . $invitation['eventName'],
            'logoText' => 'NOOX',
            'foregroundColor' => 'rgb(255, 255, 255)',
            'backgroundColor' => 'rgb(17, 16, 14)',
            'labelColor' => 'rgb(230, 202, 122)',
            'relevantDate' => public_invitation_iso_date($invitation['startsAt']),
            'expirationDate' => public_invitation_iso_date($invitation['endsAt']),
            'barcodes' => [$barcode],
            'barcode' => $barcode,
            'eventTicket' => [
                'primaryFields' => [
                    [
                        'key' => 'event',
                        'label' => 'EVENTO',
                        'value' => $invitation['eventName'],
                    ],
                ],
                'secondaryFields' => [
                    [
                        'key' => 'guest',
                        'label' => 'INVITADO',
                        'value' => $invitation['guestName'],
                    ],
                ],
                'auxiliaryFields' => [
                    [
                        'key' => 'date',
                        'label' => 'FECHA Y HORA',
                        'value' => public_invitation_iso_date($invitation['startsAt']),
                        'dateStyle' => 'PKDateStyleMedium',
                        'timeStyle' => 'PKDateStyleShort',
                    ],
                ],
                'backFields' => [
                    [
                        'key' => 'access',
                        'label' => 'Acceso',
                        'value' => 'Invitación personal e intransferible. El código QR permite una sola entrada.',
                    ],
                ],
            ],
        ];

        $passJson = json_encode(
            $pass,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR
        );
        if (file_put_contents($directory . '/pass.json', $passJson) === false) {
            throw new ApiError('No fue posible crear el pase de Apple Wallet.', 503);
        }

        $assetDirectory = dirname(__DIR__) . '/public/assets/wallet';
        foreach (['icon.png', 'icon@2x.png'] as $asset) {
            if (!copy($assetDirectory . '/' . $asset, $directory . '/' . $asset)) {
                throw new ApiError('No fue posible agregar el icono al pase de Apple Wallet.', 503);
            }
        }

        $manifest = [];
        foreach (['pass.json', 'icon.png', 'icon@2x.png'] as $file) {
            $hash = sha1_file($directory . '/' . $file);
            if ($hash === false) {
                throw new ApiError('No fue posible validar los archivos de Apple Wallet.', 503);
            }
            $manifest[$file] = $hash;
        }
        $manifestJson = json_encode(
            $manifest,
            JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR
        );
        $manifestPath = $directory . '/manifest.json';
        if (file_put_contents($manifestPath, $manifestJson) === false) {
            throw new ApiError('No fue posible crear el manifiesto de Apple Wallet.', 503);
        }

        $certificates = public_invitation_apple_certificate();
        $wwdrPath = (string) nox_config_value('wallet.apple.wwdr_certificate_path', '');
        $smimePath = $directory . '/signature.smime';
        $signed = openssl_pkcs7_sign(
            $manifestPath,
            $smimePath,
            $certificates['cert'],
            $certificates['pkey'],
            [],
            PKCS7_BINARY | PKCS7_DETACHED,
            $wwdrPath
        );
        if (!$signed) {
            throw new ApiError('No fue posible firmar el pase de Apple Wallet.', 503);
        }
        $smime = file_get_contents($smimePath);
        if ($smime === false) {
            throw new ApiError('No fue posible leer la firma de Apple Wallet.', 503);
        }
        if (file_put_contents(
            $directory . '/signature',
            public_invitation_extract_pkcs7_signature($smime)
        ) === false) {
            throw new ApiError('No fue posible guardar la firma de Apple Wallet.', 503);
        }

        $passPath = $directory . '/invitation.pkpass';
        $zip = new ZipArchive();
        if ($zip->open($passPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new ApiError('No fue posible comprimir el pase de Apple Wallet.', 503);
        }
        foreach (['pass.json', 'manifest.json', 'signature', 'icon.png', 'icon@2x.png'] as $file) {
            if (!$zip->addFile($directory . '/' . $file, $file)) {
                $zip->close();
                throw new ApiError('No fue posible completar el pase de Apple Wallet.', 503);
            }
        }
        if (!$zip->close() || !is_file($passPath)) {
            throw new ApiError('No fue posible cerrar el pase de Apple Wallet.', 503);
        }
        return ['directory' => $directory, 'path' => $passPath];
    } catch (Throwable $error) {
        public_invitation_cleanup_directory($directory);
        throw $error;
    }
}

function public_invitation_safe_filename(string $value): string
{
    $ascii = function_exists('iconv')
        ? iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value)
        : false;
    $safe = preg_replace('/[^A-Za-z0-9_-]+/', '-', $ascii !== false ? $ascii : $value);
    $safe = trim((string) $safe, '-');
    return $safe !== '' ? strtolower($safe) : 'invitacion';
}

function public_invitation_apple_wallet(array $params = [])
{
    public_invitation_headers();
    $invitation = public_invitation_from_request();
    public_invitation_require_usable($invitation);
    $file = public_invitation_apple_pass($invitation);
    $filename = public_invitation_safe_filename($invitation['eventName']) . '-noox.pkpass';

    try {
        $size = filesize($file['path']);
        header('Content-Type: application/vnd.apple.pkpass');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        if ($size !== false) {
            header('Content-Length: ' . $size);
        }
        readfile($file['path']);
    } finally {
        public_invitation_cleanup_directory($file['directory']);
    }
    exit;
}
