<?php
declare(strict_types=1);

function suggested_product_price(float $recipeCost, float $targetMargin): float
{
    if ($recipeCost <= 0) {
        return 0.0;
    }
    $margin = max(0.10, min(0.95, $targetMargin));
    return money_round(ceil(($recipeCost / (1 - $margin)) * 4) / 4);
}

function pos_allocate_discount(array $lineTotals, float $discount): array
{
    $lineTotals = array_map(static fn ($value): float => money_round((float) $value), array_values($lineTotals));
    $grossTotal = money_round(array_sum($lineTotals));
    $discount = money_round($discount);
    if ($discount <= 0) return $lineTotals;
    if ($grossTotal <= 0 || $discount >= $grossTotal) {
        throw new ApiError('El descuento debe ser menor que el total de la venta.');
    }
    $remainingDiscount = $discount;
    $remainingGross = $grossTotal;
    $lastIndex = count($lineTotals) - 1;
    foreach ($lineTotals as $index => $lineTotal) {
        $lineDiscount = $index === $lastIndex
            ? $remainingDiscount
            : ($remainingDiscount <= 0 || $remainingGross <= 0
                ? 0
                : money_round($remainingDiscount * ($lineTotal / $remainingGross)));
        $lineDiscount = max(0, min($lineDiscount, $lineTotal, $remainingDiscount));
        $lineTotals[$index] = money_round($lineTotal - $lineDiscount);
        $remainingDiscount = money_round($remainingDiscount - $lineDiscount);
        $remainingGross = money_round($remainingGross - $lineTotal);
    }
    return $lineTotals;
}

function pos_quantity($value, bool $allowZero = false): float
{
    if (!is_numeric($value)) {
        throw new ApiError('La cantidad no es válida.');
    }
    $quantity = (float) $value;
    $minimum = $allowZero ? 0.0 : 0.001;
    if (!is_finite($quantity) || $quantity < $minimum || $quantity > 100) {
        throw new ApiError('La cantidad no es válida.');
    }
    if (abs($quantity - round($quantity, 3)) > 0.0000001) {
        throw new ApiError('La cantidad admite como máximo tres decimales.');
    }
    return round($quantity, 3);
}

function inventory_movement_result(float $currentStock, float $reservedStock, string $type, float $quantity): array
{
    if (!is_finite($currentStock) || !is_finite($reservedStock) || !is_finite($quantity)) {
        throw new ApiError('La cantidad no es válida.');
    }
    $delta = $type === 'count' ? $quantity - $currentStock : $quantity;
    if ($type === 'waste') {
        $delta = -abs($quantity);
    }
    if ($type !== 'count' && abs($delta) < 0.0000001) {
        throw new ApiError('La cantidad no puede ser cero.');
    }
    $newStock = $currentStock + $delta;
    if ($newStock < -0.0000001) {
        throw new ApiError('El movimiento dejaría el inventario en negativo.', 409);
    }
    if ($newStock + 0.000001 < $reservedStock) {
        throw new ApiError('El movimiento dejaría la existencia por debajo de lo reservado en cuentas abiertas.', 409);
    }
    return ['delta' => $delta, 'currentStock' => max(0.0, $newStock)];
}

function catalog_search(): string
{
    return trim(substr((string) ($_GET['search'] ?? ''), 0, 120));
}

function inventory_package_definition(array $body): array
{
    return [
        'packageName' => value_string($body, 'packageName', 1, 80) ?? '',
        'unitsPerPackage' => value_number($body, 'unitsPerPackage', 0.0001, 1000000),
    ];
}

function inventory_purchase_conversion(float $packageQuantity, float $unitsPerPackage, float $packageCost): array
{
    if (!is_finite($packageQuantity) || !is_finite($unitsPerPackage) || !is_finite($packageCost)
        || $packageQuantity <= 0 || $unitsPerPackage <= 0 || $packageCost < 0) {
        throw new ApiError('La presentación de compra no es válida.');
    }
    return [
        'quantity' => $packageQuantity * $unitsPerPackage,
        'unitCost' => $packageCost / $unitsPerPackage,
    ];
}

function inventory_import_columns(): array
{
    return [
        'schemaVersion', 'operation', 'sku', 'name', 'category', 'unit',
        'packageName', 'unitsPerPackage', 'minimumStock', 'leadTimeDays',
        'safetyStockDays', 'targetStockDays', 'invoiceNumber', 'purchasedAt',
        'packageQuantity', 'packageCost', 'notes',
    ];
}

function inventory_import_text($value): string
{
    return trim(preg_replace('/\s+/u', ' ', (string) ($value ?? '')) ?? '');
}

function inventory_import_number($value, float $minimum, float $maximum, string $label, array &$errors): ?float
{
    if (!is_numeric($value)) {
        $errors[] = "{$label} debe ser numérico.";
        return null;
    }
    $number = (float) $value;
    if (!is_finite($number) || $number < $minimum || $number > $maximum) {
        $errors[] = "{$label} está fuera del rango permitido.";
        return null;
    }
    return $number;
}

function inventory_import_integer($value, int $minimum, int $maximum, string $label, array &$errors): ?int
{
    $number = inventory_import_number($value, $minimum, $maximum, $label, $errors);
    if ($number === null) return null;
    if (abs($number - round($number)) > 0.000001) {
        $errors[] = "{$label} debe ser un número entero.";
        return null;
    }
    return (int) round($number);
}

function inventory_import_date($value, array &$errors): ?string
{
    $source = inventory_import_text($value);
    if ($source === '') {
        $errors[] = 'La fecha de compra es obligatoria.';
        return null;
    }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $source, $parts)
        || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) {
        $errors[] = 'La fecha de compra no es válida.';
        return null;
    }
    return $source;
}

function inventory_import_normalize(array $body): array
{
    $requiredColumns = inventory_import_columns();
    $headers = $body['headers'] ?? null;
    $sourceRows = $body['rows'] ?? null;
    $globalErrors = [];
    if ((int) ($body['sheetCount'] ?? 0) !== 1) {
        $globalErrors[] = 'El archivo debe contener una sola hoja.';
    }
    if (!is_array($headers)) {
        $globalErrors[] = 'No fue posible leer los encabezados del archivo.';
        $headers = [];
    }
    $headers = array_map('inventory_import_text', array_values($headers));
    foreach ($requiredColumns as $column) {
        if (!in_array($column, $headers, true)) {
            $globalErrors[] = "Falta la columna obligatoria {$column}.";
        }
    }
    if (!is_array($sourceRows) || !$sourceRows) {
        $globalErrors[] = 'El archivo no contiene artículos para importar.';
        $sourceRows = [];
    }
    if (count($sourceRows) > 500) {
        $globalErrors[] = 'El archivo supera el máximo de 500 filas por importación.';
    }

    $allowedUnits = ['unit', 'bottle', 'can', 'ml', 'liter', 'fluid_ounce', 'gram', 'kg', 'portion', 'pack', 'case', 'keg'];
    $rows = [];
    foreach (array_slice($sourceRows, 0, 500) as $index => $source) {
        $errors = [];
        $warnings = [];
        if (!is_array($source)) {
            $source = [];
            $errors[] = 'La fila no tiene un formato válido.';
        }
        $rowNumber = $index + 2;
        $schemaVersion = inventory_import_text($source['schemaVersion'] ?? null);
        $operation = inventory_import_text($source['operation'] ?? null);
        $sku = inventory_import_text($source['sku'] ?? null);
        $name = inventory_import_text($source['name'] ?? null);
        $category = inventory_import_text($source['category'] ?? null);
        $unit = inventory_import_text($source['unit'] ?? null);
        $packageName = inventory_import_text($source['packageName'] ?? null);
        $invoiceNumber = inventory_import_text($source['invoiceNumber'] ?? null);
        $notes = inventory_import_text($source['notes'] ?? null);

        if ($schemaVersion !== 'nox_inventory_import_v1') $errors[] = 'La versión del formato no es compatible.';
        if ($operation !== 'upsert_and_receive') $errors[] = 'La operación debe ser upsert_and_receive.';
        if ($sku === '' || mb_strlen($sku) > 80) $errors[] = 'El SKU es obligatorio y admite hasta 80 caracteres.';
        if (mb_strlen($name) < 2 || mb_strlen($name) > 180) $errors[] = 'El nombre debe tener entre 2 y 180 caracteres.';
        if (mb_strlen($category) < 2 || mb_strlen($category) > 100) $errors[] = 'La categoría debe tener entre 2 y 100 caracteres.';
        if (!in_array($unit, $allowedUnits, true)) $errors[] = 'La unidad de control no es válida.';
        if ($packageName === '' || mb_strlen($packageName) > 80) $errors[] = 'La presentación es obligatoria y admite hasta 80 caracteres.';
        if ($invoiceNumber === '' || mb_strlen($invoiceNumber) > 100) $errors[] = 'El número de factura es obligatorio y admite hasta 100 caracteres.';
        if (mb_strlen($notes) > 500) $errors[] = 'Las notas admiten hasta 500 caracteres.';

        $unitsPerPackage = inventory_import_number($source['unitsPerPackage'] ?? null, 0.0001, 1000000, 'El contenido por presentación', $errors);
        $minimumStock = inventory_import_number($source['minimumStock'] ?? null, 0, 1000000000, 'El stock mínimo', $errors);
        $leadTimeDays = inventory_import_integer($source['leadTimeDays'] ?? null, 0, 365, 'El tiempo de entrega', $errors);
        $safetyStockDays = inventory_import_integer($source['safetyStockDays'] ?? null, 0, 365, 'El stock de seguridad', $errors);
        $targetStockDays = inventory_import_integer($source['targetStockDays'] ?? null, 1, 730, 'La cobertura objetivo', $errors);
        $packageQuantity = inventory_import_integer($source['packageQuantity'] ?? null, 1, 1000000, 'La cantidad de presentaciones', $errors);
        $packageCost = inventory_import_number($source['packageCost'] ?? null, 0, 1000000000, 'El costo por presentación', $errors);
        $purchasedAt = inventory_import_date($source['purchasedAt'] ?? null, $errors);
        if ($leadTimeDays !== null && $safetyStockDays !== null && $targetStockDays !== null
            && $targetStockDays <= $leadTimeDays + $safetyStockDays) {
            $errors[] = 'La cobertura objetivo debe superar la entrega más los días de seguridad.';
        }

        $rows[] = [
            'rowNumber' => $rowNumber,
            'schemaVersion' => $schemaVersion,
            'operation' => $operation,
            'sku' => $sku,
            'name' => $name,
            'category' => $category,
            'unit' => $unit,
            'packageName' => $packageName,
            'unitsPerPackage' => $unitsPerPackage,
            'minimumStock' => $minimumStock,
            'leadTimeDays' => $leadTimeDays,
            'safetyStockDays' => $safetyStockDays,
            'targetStockDays' => $targetStockDays,
            'invoiceNumber' => $invoiceNumber,
            'purchasedAt' => $purchasedAt,
            'packageQuantity' => $packageQuantity,
            'packageCost' => $packageCost,
            'notes' => $notes,
            'lineTotal' => $packageQuantity !== null && $packageCost !== null
                ? money_round($packageQuantity * $packageCost)
                : null,
            'action' => null,
            'itemId' => null,
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    $skuDefinitions = [];
    $invoiceDates = [];
    $lineKeys = [];
    foreach ($rows as &$row) {
        if ($row['sku'] !== '') {
            $skuKey = mb_strtolower($row['sku']);
            $definition = json_encode(array_intersect_key($row, array_flip([
                'name', 'category', 'unit', 'packageName', 'unitsPerPackage', 'minimumStock',
                'leadTimeDays', 'safetyStockDays', 'targetStockDays',
            ])), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if (isset($skuDefinitions[$skuKey]) && $skuDefinitions[$skuKey] !== $definition) {
                $row['errors'][] = 'El mismo SKU aparece con una definición de artículo diferente.';
            } else {
                $skuDefinitions[$skuKey] = $definition;
            }
        }
        if ($row['invoiceNumber'] !== '') {
            $invoiceKey = mb_strtolower($row['invoiceNumber']);
            if (isset($invoiceDates[$invoiceKey]) && $invoiceDates[$invoiceKey] !== $row['purchasedAt']) {
                $row['errors'][] = 'La misma factura aparece con fechas diferentes.';
            } else {
                $invoiceDates[$invoiceKey] = $row['purchasedAt'];
            }
            $lineKey = $invoiceKey . "\0" . mb_strtolower($row['sku']);
            if (isset($lineKeys[$lineKey])) {
                $row['errors'][] = "La factura ya incluye este SKU en la fila {$lineKeys[$lineKey]}.";
            } else {
                $lineKeys[$lineKey] = $row['rowNumber'];
            }
        }
    }
    unset($row);
    return ['rows' => $rows, 'globalErrors' => array_values(array_unique($globalErrors))];
}

function inventory_import_analyze(PDO $pdo, array $body, bool $lock = false): array
{
    $analysis = inventory_import_normalize($body);
    $rows = $analysis['rows'];
    $validSkus = array_values(array_unique(array_filter(array_column($rows, 'sku'))));
    $itemsBySku = [];
    if ($validSkus) {
        $statement = $pdo->prepare(
            'SELECT id, sku, name, category, unit, package_name AS packageName,
                    units_per_package AS unitsPerPackage, current_stock AS currentStock,
                    average_cost AS averageCost, active, deleted_at AS deletedAt
             FROM inventory_items WHERE sku IN (' . placeholders(count($validSkus)) . ')' . ($lock ? ' FOR UPDATE' : '')
        );
        $statement->execute($validSkus);
        foreach ($statement->fetchAll() as $item) $itemsBySku[mb_strtolower((string) $item['sku'])] = $item;
    }

    $invoices = array_values(array_unique(array_filter(array_column($rows, 'invoiceNumber'))));
    $existingInvoices = [];
    if ($invoices) {
        $statement = $pdo->prepare(
            "SELECT invoice_number FROM purchases
             WHERE invoice_number IN (" . placeholders(count($invoices)) . ") AND status <> 'void'" . ($lock ? ' FOR UPDATE' : '')
        );
        $statement->execute($invoices);
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $invoice) $existingInvoices[mb_strtolower((string) $invoice)] = true;
    }

    $newSkus = [];
    $existingSkus = [];
    foreach ($rows as &$row) {
        $skuKey = mb_strtolower($row['sku']);
        $item = $skuKey !== '' ? ($itemsBySku[$skuKey] ?? null) : null;
        if ($item) {
            if (!(bool) $item['active'] || $item['deletedAt'] !== null) {
                $row['errors'][] = 'El SKU pertenece a un artículo inactivo o eliminado.';
            } elseif ($item['unit'] !== $row['unit']) {
                $row['errors'][] = "La unidad no coincide con el artículo existente ({$item['unit']}).";
            } else {
                $row['action'] = 'existing';
                $row['itemId'] = (int) $item['id'];
                $existingSkus[$skuKey] = true;
                $differences = [];
                foreach (['name' => 'nombre', 'category' => 'categoría', 'packageName' => 'presentación habitual'] as $field => $label) {
                    if ((string) $item[$field] !== (string) $row[$field]) $differences[] = $label;
                }
                if (abs((float) $item['unitsPerPackage'] - (float) $row['unitsPerPackage']) > 0.0001) $differences[] = 'contenido habitual';
                if ($differences) {
                    $row['warnings'][] = 'Se conservarán los datos actuales del artículo; difieren: ' . implode(', ', $differences) . '.';
                }
            }
        } elseif ($row['sku'] !== '') {
            $row['action'] = 'create';
            $newSkus[$skuKey] = true;
        }
        if ($row['invoiceNumber'] !== '' && isset($existingInvoices[mb_strtolower($row['invoiceNumber'])])) {
            $row['errors'][] = 'Esta factura ya fue recibida; importarla duplicaría las existencias.';
        }
        $row['errors'] = array_values(array_unique($row['errors']));
        $row['warnings'] = array_values(array_unique($row['warnings']));
    }
    unset($row);

    $invoiceKeys = [];
    foreach (array_filter(array_column($rows, 'invoiceNumber')) as $invoiceNumber) {
        $invoiceKeys[mb_strtolower((string) $invoiceNumber)] = true;
    }
    $invoiceTotals = [];
    foreach ($rows as $row) {
        if ($row['invoiceNumber'] === '' || $row['packageQuantity'] === null || $row['packageCost'] === null) continue;
        $invoiceKey = mb_strtolower($row['invoiceNumber']);
        $invoiceTotals[$invoiceKey] = ($invoiceTotals[$invoiceKey] ?? 0.0)
            + $row['packageQuantity'] * $row['packageCost'];
    }
    $rowErrorCount = array_sum(array_map(static fn (array $row): int => count($row['errors']), $rows));
    $warningCount = array_sum(array_map(static fn (array $row): int => count($row['warnings']), $rows));
    $total = money_round(array_sum(array_map('money_round', $invoiceTotals)));
    return [
        'valid' => !$analysis['globalErrors'] && $rowErrorCount === 0,
        'globalErrors' => $analysis['globalErrors'],
        'rows' => $rows,
        'summary' => [
            'rows' => count($rows),
            'invoices' => count($invoiceKeys),
            'newItems' => count($newSkus),
            'existingItems' => count($existingSkus),
            'errors' => $rowErrorCount + count($analysis['globalErrors']),
            'warnings' => $warningCount,
            'total' => $total,
        ],
    ];
}

function catalog_pagination(int $total, int $defaultPerPage = 20, int $maximumPerPage = 100): array
{
    $perPage = max(6, min((int) ($_GET['perPage'] ?? $defaultPerPage), $maximumPerPage));
    $pages = max(1, (int) ceil($total / $perPage));
    $page = max(1, min((int) ($_GET['page'] ?? 1), $pages));
    return [
        'page' => $page,
        'perPage' => $perPage,
        'total' => $total,
        'pages' => $pages,
        'from' => $total ? (($page - 1) * $perPage) + 1 : 0,
        'to' => min($page * $perPage, $total),
    ];
}

function inventory_items(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $search = catalog_search();
    $joins = "FROM inventory_items i
         LEFT JOIN purchase_items last_line
           ON last_line.id = (
             SELECT candidate.id
             FROM purchase_items candidate
             JOIN purchases candidate_purchase ON candidate_purchase.id = candidate.purchase_id
             WHERE candidate.inventory_item_id = i.id
               AND candidate_purchase.status = 'received'
             ORDER BY candidate_purchase.purchased_at DESC, candidate.id DESC
             LIMIT 1
           )
         LEFT JOIN purchases last_purchase ON last_purchase.id = last_line.purchase_id";
    $where = ' WHERE i.active = TRUE AND i.deleted_at IS NULL';
    $values = [];
    if ($search !== '') {
        $where .= " AND LOWER(CONCAT_WS(' ', i.sku, i.name, i.category, i.package_name, last_line.package_name)) LIKE ?";
        $values[] = '%' . strtolower($search) . '%';
    }
    $countStatement = db()->prepare("SELECT COUNT(*) {$joins}{$where}");
    $countStatement->execute($values);
    $pagination = catalog_pagination((int) $countStatement->fetchColumn());
    $offset = ($pagination['page'] - 1) * $pagination['perPage'];

    $statement = db()->prepare(
        "SELECT i.id, i.sku, i.name, i.category, i.unit,
                i.package_name AS packageName,
                i.units_per_package AS unitsPerPackage,
                i.lead_time_days AS leadTimeDays,
                i.safety_stock_days AS safetyStockDays,
                i.target_stock_days AS targetStockDays,
                i.current_stock AS currentStock,
                i.reserved_stock AS reservedStock,
                GREATEST(0, i.current_stock - i.reserved_stock) AS availableStock,
                i.minimum_stock AS minimumStock, i.average_cost AS averageCost,
                COALESCE(last_line.package_name, i.package_name) AS referencePackageName,
                COALESCE(last_line.units_per_package, i.units_per_package) AS referenceUnitsPerPackage,
                last_line.package_cost AS referencePackageCost,
                last_purchase.purchased_at AS referencePurchasedAt,
                i.active,
                GREATEST(0, i.current_stock - i.reserved_stock) <= i.minimum_stock AS lowStock
         {$joins}{$where}
         ORDER BY i.category, i.name
         LIMIT ? OFFSET ?"
    );
    $position = 1;
    foreach ($values as $value) {
        $statement->bindValue($position++, $value, PDO::PARAM_STR);
    }
    $statement->bindValue($position++, $pagination['perPage'], PDO::PARAM_INT);
    $statement->bindValue($position, $offset, PDO::PARAM_INT);
    $statement->execute();
    json_response(['items' => $statement->fetchAll(), 'pagination' => $pagination]);
}

function inventory_item_options(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        'SELECT i.id, i.sku, i.name, i.category, i.unit,
                i.package_name AS packageName, i.units_per_package AS unitsPerPackage,
                i.average_cost AS averageCost,
                i.lead_time_days AS leadTimeDays, i.safety_stock_days AS safetyStockDays,
                i.target_stock_days AS targetStockDays,
                COALESCE(last_line.package_name, i.package_name) AS referencePackageName,
                COALESCE(last_line.units_per_package, i.units_per_package) AS referenceUnitsPerPackage,
                last_line.package_cost AS referencePackageCost,
                last_purchase.purchased_at AS referencePurchasedAt
         FROM inventory_items i
         LEFT JOIN purchase_items last_line
           ON last_line.id = (
             SELECT candidate.id
             FROM purchase_items candidate
             JOIN purchases candidate_purchase ON candidate_purchase.id = candidate.purchase_id
             WHERE candidate.inventory_item_id = i.id
               AND candidate_purchase.status = \'received\'
             ORDER BY candidate_purchase.purchased_at DESC, candidate.id DESC
             LIMIT 1
           )
         LEFT JOIN purchases last_purchase ON last_purchase.id = last_line.purchase_id
         WHERE i.active = TRUE AND i.deleted_at IS NULL ORDER BY i.category, i.name'
    )->fetchAll();
    $presentations = db()->query(
        "SELECT name, unitsPerPackage
         FROM (
           SELECT package_name AS name, units_per_package AS unitsPerPackage
           FROM inventory_items
           WHERE active = TRUE AND deleted_at IS NULL
           UNION
           SELECT package_name AS name, units_per_package AS unitsPerPackage
           FROM purchase_items
         ) presentation_catalog
         WHERE name IS NOT NULL AND TRIM(name) <> ''
         ORDER BY name, unitsPerPackage"
    )->fetchAll();
    json_response(['items' => $rows, 'presentations' => $presentations]);
}

function inventory_products(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $search = catalog_search();
    $where = ' WHERE p.deleted_at IS NULL';
    $values = [];
    if ($search !== '') {
        $where .= " AND LOWER(CONCAT_WS(' ', p.sku, p.name, p.category, p.barcode)) LIKE ?";
        $values[] = '%' . strtolower($search) . '%';
    }
    $countStatement = db()->prepare("SELECT COUNT(*) FROM products p{$where}");
    $countStatement->execute($values);
    $pagination = catalog_pagination((int) $countStatement->fetchColumn());
    $offset = ($pagination['page'] - 1) * $pagination['perPage'];
    $idStatement = db()->prepare(
        "SELECT p.id FROM products p{$where}
         ORDER BY p.category, p.name LIMIT ? OFFSET ?"
    );
    $position = 1;
    foreach ($values as $value) {
        $idStatement->bindValue($position++, $value, PDO::PARAM_STR);
    }
    $idStatement->bindValue($position++, $pagination['perPage'], PDO::PARAM_INT);
    $idStatement->bindValue($position, $offset, PDO::PARAM_INT);
    $idStatement->execute();
    $ids = array_map('intval', array_column($idStatement->fetchAll(), 'id'));
    if (!$ids) {
        json_response(['products' => [], 'pagination' => $pagination]);
    }

    $statement = db()->prepare(
        'SELECT p.id, p.sku, p.barcode, p.name, p.category, p.image_path AS imageUrl, p.sale_price AS salePrice,
                p.tax_rate AS taxRate, p.target_margin AS targetMargin, p.active,
                r.inventory_item_id AS itemId, r.quantity, i.sku AS itemSku,
                i.name AS itemName, i.unit, i.average_cost AS averageCost
         FROM products p
         LEFT JOIN product_recipes r ON r.product_id = p.id
         LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
         WHERE p.id IN (' . placeholders(count($ids)) . ')
         ORDER BY p.category, p.name, i.name'
    );
    $statement->execute($ids);
    $rows = $statement->fetchAll();

    $products = [];
    foreach ($rows as $row) {
        $id = (int) $row['id'];
        if (!isset($products[$id])) {
            $products[$id] = [
                'id' => $id,
                'sku' => $row['sku'],
                'barcode' => $row['barcode'],
                'name' => $row['name'],
                'category' => $row['category'],
                'imageUrl' => $row['imageUrl'],
                'salePrice' => $row['salePrice'],
                'taxRate' => $row['taxRate'],
                'targetMargin' => $row['targetMargin'],
                'active' => $row['active'],
                'recipe' => [],
                'recipeCost' => 0.0,
            ];
        }
        if ($row['itemId'] !== null) {
            $componentCost = (float) $row['quantity'] * (float) $row['averageCost'];
            $products[$id]['recipeCost'] += $componentCost;
            $products[$id]['recipe'][] = [
                'itemId' => (int) $row['itemId'],
                'sku' => $row['itemSku'],
                'name' => $row['itemName'],
                'quantity' => $row['quantity'],
                'unit' => $row['unit'],
                'averageCost' => $row['averageCost'],
                'componentCost' => money_round($componentCost),
            ];
        }
    }
    foreach ($products as &$product) {
        $product['recipeCost'] = money_round((float) $product['recipeCost']);
        $product['suggestedPrice'] = suggested_product_price(
            (float) $product['recipeCost'],
            (float) $product['targetMargin']
        );
        $product['unitGrossProfit'] = money_round((float) $product['salePrice'] - (float) $product['recipeCost']);
        $product['grossMargin'] = (float) $product['salePrice'] > 0
            ? round($product['unitGrossProfit'] / (float) $product['salePrice'], 4)
            : 0.0;
    }
    unset($product);
    json_response(['products' => array_values($products), 'pagination' => $pagination]);
}

function inventory_item_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $sku = value_string($body, 'sku', 1, 80) ?? '';
    $name = value_string($body, 'name', 2, 180) ?? '';
    $category = value_string($body, 'category', 2, 100) ?? '';
    $unit = require_choice(
        $body['unit'] ?? '',
        ['unit', 'bottle', 'can', 'ml', 'liter', 'fluid_ounce', 'gram', 'kg', 'portion', 'pack', 'case', 'keg'],
        'unit'
    );
    $package = inventory_package_definition($body);
    $packageName = $package['packageName'];
    $unitsPerPackage = $package['unitsPerPackage'];
    $initialPackages = 0.0;
    $packageCost = 0.0;
    $stock = $initialPackages * $unitsPerPackage;
    $minimum = value_number($body, 'minimumStock', 0);
    $cost = $packageCost / $unitsPerPackage;
    $leadTimeDays = (int) round(isset($body['leadTimeDays']) ? value_number($body, 'leadTimeDays', 0, 365) : 3);
    $safetyStockDays = (int) round(isset($body['safetyStockDays']) ? value_number($body, 'safetyStockDays', 0, 365) : 2);
    $targetStockDays = (int) round(isset($body['targetStockDays']) ? value_number($body, 'targetStockDays', 1, 730) : 14);
    if ($targetStockDays <= $leadTimeDays + $safetyStockDays) {
        throw new ApiError('La cobertura objetivo debe superar el tiempo de entrega más los días de seguridad.');
    }

    try {
        $id = transaction(function (PDO $pdo) use ($user, $sku, $name, $category, $unit, $packageName, $unitsPerPackage, $initialPackages, $packageCost, $stock, $minimum, $cost, $leadTimeDays, $safetyStockDays, $targetStockDays): int {
            $statement = $pdo->prepare(
                'INSERT INTO inventory_items
                   (sku, name, category, unit, package_name, units_per_package,
                    lead_time_days, safety_stock_days, target_stock_days,
                    current_stock, minimum_stock, average_cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $statement->execute([
                $sku, $name, $category, $unit, $packageName, $unitsPerPackage,
                $leadTimeDays, $safetyStockDays, $targetStockDays,
                $stock, $minimum, $cost,
            ]);
            $id = (int) $pdo->lastInsertId();
            if ($stock > 0) {
                $movement = $pdo->prepare(
                    "INSERT INTO inventory_movements
                       (inventory_item_id, movement_type, quantity, unit_cost, notes, created_by)
                     VALUES (?, 'opening', ?, ?, 'Inventario inicial', ?)"
                );
                $movement->execute([$id, $stock, $cost, $user['id']]);
            }
            audit_log($pdo, $user, 'create', 'inventory_item', $id, null, compact(
                'sku', 'name', 'category', 'unit', 'packageName', 'unitsPerPackage',
                'initialPackages', 'packageCost', 'stock', 'minimum', 'cost',
                'leadTimeDays', 'safetyStockDays', 'targetStockDays'
            ));
            return $id;
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El SKU ya existe.', 409);
        }
        throw $error;
    }
    json_response(['id' => $id], 201);
}

function inventory_item_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $itemId = path_id($params);
    $body = request_body();
    $sku = value_string($body, 'sku', 1, 80) ?? '';
    $name = value_string($body, 'name', 2, 180) ?? '';
    $category = value_string($body, 'category', 2, 100) ?? '';
    $unit = require_choice(
        $body['unit'] ?? '',
        ['unit', 'bottle', 'can', 'ml', 'liter', 'fluid_ounce', 'gram', 'kg', 'portion', 'pack', 'case', 'keg'],
        'unit'
    );
    $package = inventory_package_definition($body);
    $packageName = $package['packageName'];
    $unitsPerPackage = $package['unitsPerPackage'];
    $minimum = value_number($body, 'minimumStock', 0);
    $leadTimeDays = (int) round(value_number($body, 'leadTimeDays', 0, 365));
    $safetyStockDays = (int) round(value_number($body, 'safetyStockDays', 0, 365));
    $targetStockDays = (int) round(value_number($body, 'targetStockDays', 1, 730));
    if ($targetStockDays <= $leadTimeDays + $safetyStockDays) {
        throw new ApiError('La cobertura objetivo debe superar el tiempo de entrega más los días de seguridad.');
    }

    try {
        transaction(function (PDO $pdo) use ($user, $itemId, $sku, $name, $category, $unit, $packageName, $unitsPerPackage, $minimum, $leadTimeDays, $safetyStockDays, $targetStockDays): void {
            $statement = $pdo->prepare(
                'SELECT id, sku, name, category, unit, package_name AS packageName,
                        units_per_package AS unitsPerPackage, minimum_stock AS minimumStock,
                        lead_time_days AS leadTimeDays, safety_stock_days AS safetyStockDays,
                        target_stock_days AS targetStockDays, current_stock AS currentStock,
                        reserved_stock AS reservedStock
                 FROM inventory_items WHERE id = ? AND deleted_at IS NULL FOR UPDATE'
            );
            $statement->execute([$itemId]);
            $before = $statement->fetch();
            if (!$before) throw new ApiError('Artículo no encontrado.', 404);
            if ($before['unit'] !== $unit) {
                if (abs((float) $before['currentStock']) > 0.000001 || abs((float) $before['reservedStock']) > 0.000001) {
                    throw new ApiError('No se puede cambiar la unidad mientras el artículo tenga existencias o reservas.', 409);
                }
                $history = $pdo->prepare(
                    'SELECT EXISTS(SELECT 1 FROM inventory_movements WHERE inventory_item_id = ?)
                            OR EXISTS(SELECT 1 FROM purchase_items WHERE inventory_item_id = ?)
                            OR EXISTS(SELECT 1 FROM product_recipes WHERE inventory_item_id = ?)'
                );
                $history->execute([$itemId, $itemId, $itemId]);
                if ((int) $history->fetchColumn() === 1) {
                    throw new ApiError('No se puede cambiar la unidad porque el artículo ya tiene compras, movimientos o recetas.', 409);
                }
            }
            $pdo->prepare(
                'UPDATE inventory_items
                 SET sku = ?, name = ?, category = ?, unit = ?, package_name = ?,
                     units_per_package = ?, minimum_stock = ?,
                     lead_time_days = ?, safety_stock_days = ?, target_stock_days = ?
                 WHERE id = ?'
            )->execute([$sku, $name, $category, $unit, $packageName, $unitsPerPackage, $minimum, $leadTimeDays, $safetyStockDays, $targetStockDays, $itemId]);
            audit_log($pdo, $user, 'update', 'inventory_item', $itemId, $before, [
                'sku' => $sku, 'name' => $name, 'category' => $category, 'unit' => $unit,
                'packageName' => $packageName, 'unitsPerPackage' => $unitsPerPackage,
                'minimumStock' => $minimum, 'leadTimeDays' => $leadTimeDays,
                'safetyStockDays' => $safetyStockDays, 'targetStockDays' => $targetStockDays,
            ]);
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') throw new ApiError('El SKU ya existe.', 409);
        throw $error;
    }
    json_response(['id' => $itemId]);
}

function inventory_item_delete(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $itemId = path_id($params);

    transaction(function (PDO $pdo) use ($user, $itemId): void {
        $statement = $pdo->prepare(
            'SELECT id, sku, name, current_stock AS currentStock, reserved_stock AS reservedStock
             FROM inventory_items WHERE id = ? AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$itemId]);
        $before = $statement->fetch();
        if (!$before) throw new ApiError('Artículo no encontrado.', 404);
        if ((float) $before['reservedStock'] > 0.000001) {
            throw new ApiError('El artículo está reservado en una cuenta abierta. Cobre o vacíe la cuenta antes de eliminarlo.', 409);
        }

        $products = $pdo->prepare(
            'SELECT COUNT(*)
             FROM product_recipes recipe
             JOIN products product ON product.id = recipe.product_id
             WHERE recipe.inventory_item_id = ? AND product.deleted_at IS NULL'
        );
        $products->execute([$itemId]);
        if ((int) $products->fetchColumn() > 0) {
            throw new ApiError('El artículo forma parte de productos de venta. Elimine primero esos productos.', 409);
        }

        $pdo->prepare(
            "UPDATE inventory_items
             SET active = FALSE, current_stock = 0, reserved_stock = 0,
                 sku = CONCAT('__eliminado_articulo_', id, '_', UNIX_TIMESTAMP()),
                 deleted_at = NOW()
             WHERE id = ?"
        )->execute([$itemId]);
        audit_log($pdo, $user, 'delete', 'inventory_item', $itemId, $before, [
            'deleted' => true, 'discardedStock' => (float) $before['currentStock'],
        ]);
    });

    no_content();
}

function inventory_items_delete(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $ids = array_values(array_unique(array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : [])));
    $ids = array_values(array_filter($ids, static fn (int $id): bool => $id > 0));
    if (!$ids || count($ids) > 500) {
        throw new ApiError('Seleccione entre 1 y 500 artículos.');
    }

    $deleted = transaction(function (PDO $pdo) use ($user, $ids): int {
        $in = placeholders(count($ids));
        $statement = $pdo->prepare(
            "SELECT id, sku, name, current_stock AS currentStock, reserved_stock AS reservedStock
             FROM inventory_items
             WHERE id IN ({$in}) AND deleted_at IS NULL
             ORDER BY id FOR UPDATE"
        );
        $statement->execute($ids);
        $items = $statement->fetchAll();
        if (count($items) !== count($ids)) {
            throw new ApiError('Uno o más artículos ya no están disponibles.', 409);
        }
        foreach ($items as $item) {
            if ((float) $item['reservedStock'] > 0.000001) {
                throw new ApiError("El artículo {$item['name']} está reservado en una cuenta abierta.", 409);
            }
        }

        $products = $pdo->prepare(
            "SELECT item.name AS itemName, product.name AS productName
             FROM product_recipes recipe
             JOIN inventory_items item ON item.id = recipe.inventory_item_id
             JOIN products product ON product.id = recipe.product_id
             WHERE recipe.inventory_item_id IN ({$in}) AND product.deleted_at IS NULL
             ORDER BY item.name, product.name LIMIT 1"
        );
        $products->execute($ids);
        $dependency = $products->fetch();
        if ($dependency) {
            throw new ApiError(
                "El artículo {$dependency['itemName']} forma parte de {$dependency['productName']}. Elimine primero ese producto.",
                409
            );
        }

        $update = $pdo->prepare(
            "UPDATE inventory_items
             SET active = FALSE, current_stock = 0, reserved_stock = 0,
                 sku = CONCAT('__eliminado_articulo_', id, '_', UNIX_TIMESTAMP()),
                 deleted_at = NOW()
             WHERE id IN ({$in}) AND deleted_at IS NULL"
        );
        $update->execute($ids);
        audit_log($pdo, $user, 'delete_bulk', 'inventory_item', null, [
            'items' => array_map(static fn (array $item): array => [
                'id' => (int) $item['id'],
                'name' => $item['name'],
                'discardedStock' => (float) $item['currentStock'],
            ], $items),
        ], ['deleted' => true, 'count' => count($items)]);
        return count($items);
    });

    json_response(['deleted' => $deleted]);
}

function inventory_product_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $sku = value_string($body, 'sku', 1, 80) ?? '';
    $name = value_string($body, 'name', 2, 180) ?? '';
    $category = value_string($body, 'category', 2, 100) ?? '';
    $price = value_number($body, 'salePrice', 0);
    $taxRate = value_number($body, 'taxRate', 0, 1);
    $targetMargin = isset($body['targetMargin'])
        ? value_number($body, 'targetMargin', 0.10, 0.95)
        : 0.70;
    $active = isset($body['active'])
        ? filter_var($body['active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE)
        : true;
    if ($active === null) throw new ApiError('El estado del producto no es válido.');
    $barcode = value_string($body, 'barcode', 0, 120, false);
    $recipe = $body['recipe'] ?? null;
    if (!is_array($recipe) || count($recipe) < 1 || count($recipe) > 100) {
        throw new ApiError('La receta debe tener al menos un ingrediente.');
    }

    $normalizedRecipe = [];
    foreach ($recipe as $component) {
        if (!is_array($component)) {
            throw new ApiError('La receta no es válida.');
        }
        $itemId = value_id($component, 'itemId');
        $quantity = value_number($component, 'quantity', 0.0001);
        $normalizedRecipe[$itemId] = ($normalizedRecipe[$itemId] ?? 0) + $quantity;
    }

    try {
        $result = transaction(function (PDO $pdo) use ($user, $sku, $barcode, $name, $category, $price, $taxRate, $targetMargin, $active, $normalizedRecipe): array {
            $ids = array_keys($normalizedRecipe);
            $statement = $pdo->prepare('SELECT id, average_cost FROM inventory_items WHERE active = TRUE AND deleted_at IS NULL AND id IN (' . placeholders(count($ids)) . ')');
            $statement->execute($ids);
            $itemRows = $statement->fetchAll();
            if (count($itemRows) !== count($ids)) {
                throw new ApiError('La receta contiene artículos inválidos.');
            }
            $costs = [];
            foreach ($itemRows as $itemRow) {
                $costs[(int) $itemRow['id']] = (float) $itemRow['average_cost'];
            }
            $recipeCost = 0.0;
            foreach ($normalizedRecipe as $itemId => $quantity) {
                $recipeCost += $quantity * $costs[$itemId];
            }
            $recipeCost = money_round($recipeCost);
            $suggestedPrice = suggested_product_price($recipeCost, $targetMargin);
            $product = $pdo->prepare(
                'INSERT INTO products (sku, barcode, name, category, sale_price, tax_rate, target_margin, active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $product->execute([$sku, $barcode, $name, $category, $price, $taxRate, $targetMargin, $active ? 1 : 0]);
            $id = (int) $pdo->lastInsertId();
            $recipeInsert = $pdo->prepare('INSERT INTO product_recipes (product_id, inventory_item_id, quantity) VALUES (?, ?, ?)');
            foreach ($normalizedRecipe as $itemId => $quantity) {
                $recipeInsert->execute([$id, $itemId, $quantity]);
            }
            audit_log($pdo, $user, 'create', 'product', $id, null, [
                'sku' => $sku, 'name' => $name, 'salePrice' => $price,
                'targetMargin' => $targetMargin, 'active' => $active,
                'recipeCost' => $recipeCost,
                'suggestedPrice' => $suggestedPrice, 'recipe' => $normalizedRecipe,
            ]);
            return [
                'id' => $id,
                'recipeCost' => $recipeCost,
                'suggestedPrice' => $suggestedPrice,
                'unitGrossProfit' => money_round($price - $recipeCost),
                'grossMargin' => $price > 0 ? round(($price - $recipeCost) / $price, 4) : 0.0,
            ];
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El SKU o código de barras ya existe.', 409);
        }
        throw $error;
    }
    json_response($result, 201);
}

function inventory_product_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $productId = path_id($params);
    $body = request_body();
    $sku = value_string($body, 'sku', 1, 80) ?? '';
    $name = value_string($body, 'name', 2, 180) ?? '';
    $category = value_string($body, 'category', 2, 100) ?? '';
    $price = value_number($body, 'salePrice', 0);
    $taxRate = value_number($body, 'taxRate', 0, 1);
    $targetMargin = value_number($body, 'targetMargin', 0.10, 0.95);
    $barcode = value_string($body, 'barcode', 0, 120, false);
    $active = filter_var($body['active'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($active === null) throw new ApiError('El estado del producto no es válido.');
    $recipe = $body['recipe'] ?? null;
    if (!is_array($recipe) || count($recipe) < 1 || count($recipe) > 100) {
        throw new ApiError('La receta debe tener al menos un ingrediente.');
    }
    $normalizedRecipe = [];
    foreach ($recipe as $component) {
        if (!is_array($component)) throw new ApiError('La receta no es válida.');
        $itemId = value_id($component, 'itemId');
        $quantity = value_number($component, 'quantity', 0.0001);
        $normalizedRecipe[$itemId] = ($normalizedRecipe[$itemId] ?? 0) + $quantity;
    }

    try {
        $result = transaction(function (PDO $pdo) use ($user, $productId, $sku, $barcode, $name, $category, $price, $taxRate, $targetMargin, $active, $normalizedRecipe): array {
            $product = $pdo->prepare(
                'SELECT id, sku, barcode, name, category, sale_price AS salePrice,
                        tax_rate AS taxRate, target_margin AS targetMargin, active
                 FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE'
            );
            $product->execute([$productId]);
            $before = $product->fetch();
            if (!$before) throw new ApiError('Producto no encontrado.', 404);
            $openTabs = $pdo->prepare(
                "SELECT COUNT(*)
                 FROM customer_tab_items item
                 JOIN customer_tabs tab ON tab.id = item.tab_id
                 WHERE item.product_id = ? AND tab.status = 'open'"
            );
            $openTabs->execute([$productId]);
            if ((int) $openTabs->fetchColumn() > 0) {
                throw new ApiError('El producto está cargado en una cuenta abierta. Cóbrela o retire el producto antes de editarlo.', 409);
            }
            $ids = array_keys($normalizedRecipe);
            $items = $pdo->prepare(
                'SELECT id, average_cost FROM inventory_items
                 WHERE active = TRUE AND deleted_at IS NULL AND id IN (' . placeholders(count($ids)) . ')'
            );
            $items->execute($ids);
            $itemRows = $items->fetchAll();
            if (count($itemRows) !== count($ids)) throw new ApiError('La receta contiene artículos inválidos.');
            $costs = [];
            foreach ($itemRows as $itemRow) $costs[(int) $itemRow['id']] = (float) $itemRow['average_cost'];
            $recipeCost = 0.0;
            foreach ($normalizedRecipe as $itemId => $quantity) $recipeCost += $quantity * $costs[$itemId];
            $recipeCost = money_round($recipeCost);
            $suggestedPrice = suggested_product_price($recipeCost, $targetMargin);
            $pdo->prepare(
                'UPDATE products
                 SET sku = ?, barcode = ?, name = ?, category = ?, sale_price = ?,
                     tax_rate = ?, target_margin = ?, active = ?
                 WHERE id = ?'
            )->execute([$sku, $barcode, $name, $category, $price, $taxRate, $targetMargin, $active ? 1 : 0, $productId]);
            $pdo->prepare('DELETE FROM product_recipes WHERE product_id = ?')->execute([$productId]);
            $insert = $pdo->prepare('INSERT INTO product_recipes (product_id, inventory_item_id, quantity) VALUES (?, ?, ?)');
            foreach ($normalizedRecipe as $itemId => $quantity) $insert->execute([$productId, $itemId, $quantity]);
            audit_log($pdo, $user, 'update', 'product', $productId, $before, [
                'sku' => $sku, 'barcode' => $barcode, 'name' => $name, 'category' => $category,
                'salePrice' => $price, 'taxRate' => $taxRate, 'targetMargin' => $targetMargin,
                'active' => $active, 'recipeCost' => $recipeCost, 'recipe' => $normalizedRecipe,
            ]);
            return [
                'id' => $productId, 'recipeCost' => $recipeCost,
                'suggestedPrice' => $suggestedPrice,
                'unitGrossProfit' => money_round($price - $recipeCost),
                'grossMargin' => $price > 0 ? round(($price - $recipeCost) / $price, 4) : 0.0,
            ];
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') throw new ApiError('El SKU o código de barras ya existe.', 409);
        throw $error;
    }
    json_response($result);
}

function inventory_product_delete(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $productId = path_id($params);

    transaction(function (PDO $pdo) use ($user, $productId): void {
        $statement = $pdo->prepare(
            'SELECT id, sku, barcode, name, active
             FROM products WHERE id = ? AND deleted_at IS NULL FOR UPDATE'
        );
        $statement->execute([$productId]);
        $before = $statement->fetch();
        if (!$before) throw new ApiError('Producto no encontrado.', 404);

        $openTabs = $pdo->prepare(
            "SELECT COUNT(*)
             FROM customer_tab_items item
             JOIN customer_tabs tab ON tab.id = item.tab_id
             WHERE item.product_id = ? AND tab.status = 'open'"
        );
        $openTabs->execute([$productId]);
        if ((int) $openTabs->fetchColumn() > 0) {
            throw new ApiError('El producto está cargado en una cuenta abierta. Cóbrela o retire el producto antes de eliminarlo.', 409);
        }

        $pdo->prepare(
            "UPDATE products
             SET active = FALSE, barcode = NULL,
                 sku = CONCAT('__eliminado_producto_', id, '_', UNIX_TIMESTAMP()),
                 deleted_at = NOW()
             WHERE id = ?"
        )->execute([$productId]);
        audit_log($pdo, $user, 'delete', 'product', $productId, $before, ['deleted' => true]);
    });

    no_content();
}

function inventory_products_delete(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $ids = array_values(array_unique(array_map('intval', is_array($body['ids'] ?? null) ? $body['ids'] : [])));
    $ids = array_values(array_filter($ids, static fn (int $id): bool => $id > 0));
    if (!$ids || count($ids) > 500) {
        throw new ApiError('Seleccione entre 1 y 500 productos.');
    }

    $deleted = transaction(function (PDO $pdo) use ($user, $ids): int {
        $in = placeholders(count($ids));
        $statement = $pdo->prepare(
            "SELECT id, sku, barcode, name, active
             FROM products
             WHERE id IN ({$in}) AND deleted_at IS NULL
             ORDER BY id FOR UPDATE"
        );
        $statement->execute($ids);
        $products = $statement->fetchAll();
        if (count($products) !== count($ids)) {
            throw new ApiError('Uno o más productos ya no están disponibles.', 409);
        }

        $openTabs = $pdo->prepare(
            "SELECT product.name
             FROM customer_tab_items item
             JOIN customer_tabs tab ON tab.id = item.tab_id
             JOIN products product ON product.id = item.product_id
             WHERE item.product_id IN ({$in}) AND tab.status = 'open'
             ORDER BY product.name LIMIT 1"
        );
        $openTabs->execute($ids);
        $openProduct = $openTabs->fetchColumn();
        if ($openProduct !== false) {
            throw new ApiError("El producto {$openProduct} está cargado en una cuenta abierta.", 409);
        }

        $update = $pdo->prepare(
            "UPDATE products
             SET active = FALSE, barcode = NULL,
                 sku = CONCAT('__eliminado_producto_', id, '_', UNIX_TIMESTAMP()),
                 deleted_at = NOW()
             WHERE id IN ({$in}) AND deleted_at IS NULL"
        );
        $update->execute($ids);
        audit_log($pdo, $user, 'delete_bulk', 'product', null, [
            'products' => array_map(static fn (array $product): array => [
                'id' => (int) $product['id'], 'name' => $product['name'],
            ], $products),
        ], ['deleted' => true, 'count' => count($products)]);
        return count($products);
    });

    json_response(['deleted' => $deleted]);
}

function inventory_reset(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin']);
    $body = request_body();
    if (($body['confirmation'] ?? '') !== 'REINICIAR') {
        throw new ApiError('Escriba REINICIAR para confirmar.');
    }

    $result = transaction(function (PDO $pdo) use ($user): array {
        $openTabs = (int) $pdo->query(
            "SELECT COUNT(*)
             FROM customer_tab_items item
             JOIN customer_tabs tab ON tab.id = item.tab_id
             JOIN products product ON product.id = item.product_id
             WHERE tab.status = 'open' AND product.deleted_at IS NULL"
        )->fetchColumn();
        if ($openTabs > 0) {
            throw new ApiError('Hay productos cargados en cuentas abiertas. Cóbrelas o vacíelas antes de reiniciar el inventario.', 409);
        }
        $reserved = (float) $pdo->query(
            'SELECT COALESCE(SUM(reserved_stock), 0)
             FROM inventory_items WHERE deleted_at IS NULL'
        )->fetchColumn();
        if ($reserved > 0.000001) {
            throw new ApiError('Hay existencias reservadas. Cierre o vacíe las cuentas abiertas antes de reiniciar.', 409);
        }

        $productCount = (int) $pdo->query(
            'SELECT COUNT(*) FROM products WHERE deleted_at IS NULL'
        )->fetchColumn();
        $itemCount = (int) $pdo->query(
            'SELECT COUNT(*) FROM inventory_items WHERE deleted_at IS NULL'
        )->fetchColumn();

        $pdo->exec(
            "UPDATE products
             SET active = FALSE, barcode = NULL,
                 sku = CONCAT('__eliminado_producto_', id, '_', UNIX_TIMESTAMP()),
                 deleted_at = NOW()
             WHERE deleted_at IS NULL"
        );
        $pdo->exec(
            "UPDATE inventory_items
             SET active = FALSE, current_stock = 0, reserved_stock = 0,
                 sku = CONCAT('__eliminado_articulo_', id, '_', UNIX_TIMESTAMP()),
                 deleted_at = NOW()
             WHERE deleted_at IS NULL"
        );
        audit_log($pdo, $user, 'reset', 'inventory', null, [
            'items' => $itemCount, 'products' => $productCount,
        ], ['reset' => true]);
        return ['items' => $itemCount, 'products' => $productCount];
    });

    json_response($result);
}

function inventory_product_image_upload(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $productId = path_id($params);
    $file = $_FILES['image'] ?? null;

    if (!is_array($file) || !isset($file['error'], $file['tmp_name'], $file['size'])) {
        throw new ApiError('Seleccione una fotografía para el producto.');
    }
    if ((int) $file['error'] !== UPLOAD_ERR_OK) {
        $messages = [
            UPLOAD_ERR_INI_SIZE => 'La fotografía supera el límite permitido por el servidor.',
            UPLOAD_ERR_FORM_SIZE => 'La fotografía es demasiado grande.',
            UPLOAD_ERR_PARTIAL => 'La fotografía no terminó de cargarse.',
            UPLOAD_ERR_NO_FILE => 'Seleccione una fotografía para el producto.',
        ];
        throw new ApiError($messages[(int) $file['error']] ?? 'No fue posible cargar la fotografía.');
    }
    if ((int) $file['size'] <= 0 || (int) $file['size'] > 5 * 1024 * 1024) {
        throw new ApiError('La fotografía debe pesar como máximo 5 MB.');
    }
    if (!is_uploaded_file((string) $file['tmp_name'])) {
        throw new ApiError('El archivo cargado no es válido.');
    }

    $imageInfo = @getimagesize((string) $file['tmp_name']);
    if ($imageInfo === false || ($imageInfo[0] ?? 0) < 32 || ($imageInfo[1] ?? 0) < 32
        || ($imageInfo[0] ?? 0) > 8000 || ($imageInfo[1] ?? 0) > 8000
        || ($imageInfo[0] ?? 0) * ($imageInfo[1] ?? 0) > 25000000) {
        throw new ApiError('La fotografía no es una imagen válida o sus dimensiones no están permitidas.');
    }
    $mime = isset($imageInfo['mime']) ? (string) $imageInfo['mime'] : '';
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        throw new ApiError('Use una fotografía JPG, PNG o WebP.');
    }

    $pdo = db();
    $statement = $pdo->prepare('SELECT id, image_path FROM products WHERE id = ? AND deleted_at IS NULL');
    $statement->execute([$productId]);
    $product = $statement->fetch();
    if (!$product) {
        throw new ApiError('Producto no encontrado.', 404);
    }

    $uploadDirectory = dirname(__DIR__) . '/public/uploads/products';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
        throw new ApiError('No fue posible preparar el directorio de fotografías.', 500);
    }
    $fileName = 'product-' . $productId . '-' . bin2hex(random_bytes(12)) . '.webp';
    $destination = $uploadDirectory . '/' . $fileName;
    try {
        normalize_product_image_to_webp((string) $file['tmp_name'], $destination, $imageInfo);
    } catch (Throwable $error) {
        if (is_file($destination)) @unlink($destination);
        throw $error;
    }
    @chmod($destination, 0644);
    $imagePath = '/uploads/products/' . $fileName;

    try {
        transaction(function (PDO $transaction) use ($user, $productId, $product, $imagePath): void {
            $update = $transaction->prepare('UPDATE products SET image_path = ? WHERE id = ? AND deleted_at IS NULL');
            $update->execute([$imagePath, $productId]);
            audit_log($transaction, $user, 'update_image', 'product', $productId, [
                'imagePath' => $product['image_path'],
            ], [
                'imagePath' => $imagePath,
            ]);
        });
    } catch (Throwable $error) {
        @unlink($destination);
        throw $error;
    }

    $previousPath = (string) ($product['image_path'] ?? '');
    if (strpos($previousPath, '/uploads/products/') === 0) {
        $previousFile = basename($previousPath);
        if (preg_match('/^product-[0-9]+-[a-f0-9]{24}\.(jpg|png|webp)$/', $previousFile)) {
            $previousDestination = $uploadDirectory . '/' . $previousFile;
            if ($previousDestination !== $destination && is_file($previousDestination)) {
                @unlink($previousDestination);
            }
        }
    }

    json_response([
        'imageUrl' => $imagePath,
        'format' => 'webp',
        'width' => 768,
        'height' => 768,
    ]);
}

function normalize_product_image_to_webp(string $source, string $destination, ?array $imageInfo = null): void
{
    if (!extension_loaded('gd') || !function_exists('imagewebp')) {
        throw new ApiError('El servidor necesita la extensión GD con soporte WebP para procesar fotografías.', 503);
    }
    $imageInfo = $imageInfo ?: @getimagesize($source);
    if ($imageInfo === false) throw new ApiError('La fotografía no es válida.');
    $mime = (string) ($imageInfo['mime'] ?? '');
    if ($mime === 'image/jpeg') {
        $sourceImage = @imagecreatefromjpeg($source);
    } elseif ($mime === 'image/png') {
        $sourceImage = @imagecreatefrompng($source);
    } elseif ($mime === 'image/webp') {
        $sourceImage = @imagecreatefromwebp($source);
    } else {
        throw new ApiError('Use una fotografía JPG, PNG o WebP.');
    }
    if ($sourceImage === false) throw new ApiError('No fue posible procesar la fotografía.');

    $output = null;
    try {
        $sourceWidth = imagesx($sourceImage);
        $sourceHeight = imagesy($sourceImage);
        $sourceSize = min($sourceWidth, $sourceHeight);
        $sourceX = (int) floor(($sourceWidth - $sourceSize) / 2);
        $sourceY = (int) floor(($sourceHeight - $sourceSize) / 2);
        $output = imagecreatetruecolor(768, 768);
        if ($output === false) throw new ApiError('No fue posible preparar la fotografía.', 500);
        imagealphablending($output, false);
        imagesavealpha($output, true);
        $transparent = imagecolorallocatealpha($output, 0, 0, 0, 127);
        imagefill($output, 0, 0, $transparent);
        if (!imagecopyresampled(
            $output,
            $sourceImage,
            0,
            0,
            $sourceX,
            $sourceY,
            768,
            768,
            $sourceSize,
            $sourceSize
        ) || !imagewebp($output, $destination, 82)) {
            throw new ApiError('No fue posible guardar la fotografía optimizada.', 500);
        }
    } finally {
        if (is_resource($output)) imagedestroy($output);
        if (is_resource($sourceImage)) imagedestroy($sourceImage);
    }
}

function inventory_movement_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $itemId = value_id($body, 'itemId');
    $type = require_choice($body['type'] ?? '', ['waste', 'adjustment', 'count'], 'type');
    if (!isset($body['quantity']) || !is_numeric($body['quantity'])) {
        throw new ApiError('La cantidad no es válida.');
    }
    $quantity = (float) $body['quantity'];
    $notes = value_string($body, 'notes', 0, 500, false);

    $result = transaction(function (PDO $pdo) use ($user, $itemId, $type, $quantity, $notes): array {
        $select = $pdo->prepare('SELECT id, current_stock, reserved_stock, average_cost FROM inventory_items WHERE id = ? AND active = TRUE AND deleted_at IS NULL FOR UPDATE');
        $select->execute([$itemId]);
        $item = $select->fetch();
        if (!$item) {
            throw new ApiError('Artículo no encontrado.', 404);
        }
        $movementResult = inventory_movement_result(
            (float) $item['current_stock'],
            (float) $item['reserved_stock'],
            $type,
            $quantity
        );
        $delta = $movementResult['delta'];
        $newStock = $movementResult['currentStock'];
        $pdo->prepare('UPDATE inventory_items SET current_stock = ? WHERE id = ?')->execute([$newStock, $itemId]);
        $movement = $pdo->prepare(
            'INSERT INTO inventory_movements
               (inventory_item_id, movement_type, quantity, unit_cost, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $movement->execute([$itemId, $type, $delta, $item['average_cost'], $notes, $user['id']]);
        audit_log($pdo, $user, $type, 'inventory_item', $itemId, ['stock' => $item['current_stock']], ['stock' => $newStock]);
        return ['id' => (int) $pdo->lastInsertId(), 'currentStock' => $newStock];
    });
    json_response($result, 201);
}

function inventory_purchase_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $invoice = value_string($body, 'invoiceNumber', 0, 100, false);
    $notes = value_string($body, 'notes', 0, 500, false);
    $purchasedAt = value_string($body, 'purchasedAt', 10, 40) ?? '';
    try {
        $purchasedDate = new DateTimeImmutable($purchasedAt);
    } catch (Throwable $error) {
        throw new ApiError('La fecha de compra no es válida.');
    }
    $lines = $body['items'] ?? null;
    if (!is_array($lines) || !$lines) {
        throw new ApiError('La compra debe contener artículos.');
    }
    $items = [];
    foreach ($lines as $line) {
        if (!is_array($line)) throw new ApiError('La compra contiene una línea inválida.');
        $items[] = [
            'itemId' => value_id($line, 'itemId'),
            'packageName' => value_string($line, 'packageName', 2, 80) ?? '',
            'unitsPerPackage' => value_number($line, 'unitsPerPackage', 0.0001),
            'packageQuantity' => value_number($line, 'packageQuantity', 1),
            'packageCost' => value_number($line, 'packageCost', 0),
        ];
        $packageQuantity = (float) $items[count($items) - 1]['packageQuantity'];
        if (abs($packageQuantity - round($packageQuantity)) > 0.000001) {
            throw new ApiError('La cantidad de presentaciones debe ser un número entero.');
        }
        $items[count($items) - 1]['packageQuantity'] = (int) round($packageQuantity);
    }

    $id = transaction(function (PDO $pdo) use ($user, $invoice, $notes, $purchasedDate, $items): int {
        $total = array_reduce($items, fn (float $sum, array $item): float => $sum + $item['packageQuantity'] * $item['packageCost'], 0.0);
        $purchase = $pdo->prepare(
            'INSERT INTO purchases (invoice_number, purchased_at, total, notes, created_by) VALUES (?, ?, ?, ?, ?)'
        );
        $purchase->execute([$invoice, $purchasedDate->format('Y-m-d H:i:s'), money_round($total), $notes, $user['id']]);
        $id = (int) $pdo->lastInsertId();
        foreach ($items as $line) {
            $select = $pdo->prepare(
                'SELECT current_stock, average_cost, unit, package_name, units_per_package
                 FROM inventory_items WHERE id = ? AND active = TRUE AND deleted_at IS NULL FOR UPDATE'
            );
            $select->execute([$line['itemId']]);
            $item = $select->fetch();
            if (!$item) throw new ApiError('Artículo de compra inválido.');
            $packageName = $line['packageName'];
            $unitsPerPackage = $line['unitsPerPackage'];
            if ($unitsPerPackage <= 0) throw new ApiError('La presentación del artículo no es válida.', 409);
            $conversion = inventory_purchase_conversion(
                (float) $line['packageQuantity'],
                (float) $unitsPerPackage,
                (float) $line['packageCost']
            );
            $quantity = $conversion['quantity'];
            $unitCost = $conversion['unitCost'];
            $oldValue = (float) $item['current_stock'] * (float) $item['average_cost'];
            $newStock = (float) $item['current_stock'] + $quantity;
            $newCost = $newStock > 0 ? ($oldValue + $quantity * $unitCost) / $newStock : $unitCost;
            $pdo->prepare(
                'INSERT INTO purchase_items
                   (purchase_id, inventory_item_id, package_name, package_quantity,
                    units_per_package, package_cost, quantity, unit_cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                $id, $line['itemId'], $packageName, $line['packageQuantity'],
                $unitsPerPackage, $line['packageCost'], $quantity, $unitCost,
            ]);
            $pdo->prepare('UPDATE inventory_items SET current_stock = ?, average_cost = ? WHERE id = ?')
                ->execute([$newStock, $newCost, $line['itemId']]);
            $pdo->prepare(
                "INSERT INTO inventory_movements
                   (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
                 VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)"
            )->execute([$line['itemId'], $quantity, $unitCost, $id, $user['id']]);
        }
        audit_log($pdo, $user, 'receive', 'purchase', $id, null, ['total' => money_round($total), 'items' => count($items)]);
        return $id;
    });
    json_response(['id' => $id], 201);
}

function inventory_import_preview(array $params = [])
{
    require_csrf();
    require_roles(['admin', 'supervisor']);
    $analysis = inventory_import_analyze(db(), request_body());
    json_response($analysis);
}

function inventory_import_commit(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    try {
        $result = transaction(function (PDO $pdo) use ($user, $body): array {
            $analysis = inventory_import_analyze($pdo, $body, true);
            if (!$analysis['valid']) {
                $message = $analysis['globalErrors'][0] ?? null;
                if (!$message) {
                    foreach ($analysis['rows'] as $row) {
                        if ($row['errors']) {
                            $message = "Fila {$row['rowNumber']}: {$row['errors'][0]}";
                            break;
                        }
                    }
                }
                throw new ApiError($message ?: 'El archivo cambió o ya no es válido. Vuelva a verificarlo.', 409);
            }

            $itemIdsBySku = [];
            $createdSkus = [];
            foreach ($analysis['rows'] as $row) {
                $skuKey = mb_strtolower($row['sku']);
                if ($row['action'] === 'existing') {
                    $itemIdsBySku[$skuKey] = (int) $row['itemId'];
                    continue;
                }
                if (isset($itemIdsBySku[$skuKey])) continue;
                $statement = $pdo->prepare(
                    'INSERT INTO inventory_items
                       (sku, name, category, unit, package_name, units_per_package,
                        lead_time_days, safety_stock_days, target_stock_days,
                        current_stock, minimum_stock, average_cost)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)'
                );
                $statement->execute([
                    $row['sku'], $row['name'], $row['category'], $row['unit'],
                    $row['packageName'], $row['unitsPerPackage'], $row['leadTimeDays'],
                    $row['safetyStockDays'], $row['targetStockDays'], $row['minimumStock'],
                ]);
                $itemId = (int) $pdo->lastInsertId();
                $itemIdsBySku[$skuKey] = $itemId;
                $createdSkus[$skuKey] = true;
                audit_log($pdo, $user, 'create', 'inventory_item', $itemId, null, [
                    'source' => 'inventory_import',
                    'sku' => $row['sku'],
                    'name' => $row['name'],
                    'category' => $row['category'],
                    'unit' => $row['unit'],
                    'packageName' => $row['packageName'],
                    'unitsPerPackage' => $row['unitsPerPackage'],
                    'minimumStock' => $row['minimumStock'],
                    'leadTimeDays' => $row['leadTimeDays'],
                    'safetyStockDays' => $row['safetyStockDays'],
                    'targetStockDays' => $row['targetStockDays'],
                ]);
            }

            $invoices = [];
            foreach ($analysis['rows'] as $row) {
                $invoiceKey = mb_strtolower($row['invoiceNumber']);
                if (!isset($invoices[$invoiceKey])) {
                    $invoices[$invoiceKey] = ['invoiceNumber' => $row['invoiceNumber'], 'lines' => []];
                }
                $invoices[$invoiceKey]['lines'][] = $row;
            }
            $purchaseIds = [];
            $grandTotal = 0.0;
            foreach ($invoices as $invoice) {
                $invoiceNumber = $invoice['invoiceNumber'];
                $lines = $invoice['lines'];
                $purchaseTotal = money_round(array_sum(array_map(
                    static fn (array $line): float => $line['packageQuantity'] * $line['packageCost'],
                    $lines
                )));
                $purchaseNotes = array_values(array_unique(array_filter(array_column($lines, 'notes'))));
                $purchaseNotes = $purchaseNotes ? mb_substr(implode(' | ', $purchaseNotes), 0, 500) : null;
                $purchase = $pdo->prepare(
                    'INSERT INTO purchases (invoice_number, purchased_at, total, notes, created_by) VALUES (?, ?, ?, ?, ?)'
                );
                $purchase->execute([
                    $invoiceNumber,
                    $lines[0]['purchasedAt'] . ' 00:00:00',
                    $purchaseTotal,
                    $purchaseNotes,
                    $user['id'],
                ]);
                $purchaseId = (int) $pdo->lastInsertId();
                $purchaseIds[] = $purchaseId;
                foreach ($lines as $line) {
                    $itemId = $itemIdsBySku[mb_strtolower($line['sku'])];
                    $select = $pdo->prepare(
                        'SELECT current_stock, average_cost FROM inventory_items
                         WHERE id = ? AND active = TRUE AND deleted_at IS NULL FOR UPDATE'
                    );
                    $select->execute([$itemId]);
                    $item = $select->fetch();
                    if (!$item) throw new ApiError('Uno de los artículos dejó de estar disponible.', 409);
                    $conversion = inventory_purchase_conversion(
                        (float) $line['packageQuantity'],
                        (float) $line['unitsPerPackage'],
                        (float) $line['packageCost']
                    );
                    $quantity = $conversion['quantity'];
                    $unitCost = $conversion['unitCost'];
                    $oldValue = (float) $item['current_stock'] * (float) $item['average_cost'];
                    $newStock = (float) $item['current_stock'] + $quantity;
                    $newCost = $newStock > 0 ? ($oldValue + $quantity * $unitCost) / $newStock : $unitCost;
                    $pdo->prepare(
                        'INSERT INTO purchase_items
                           (purchase_id, inventory_item_id, package_name, package_quantity,
                            units_per_package, package_cost, quantity, unit_cost)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                    )->execute([
                        $purchaseId, $itemId, $line['packageName'], $line['packageQuantity'],
                        $line['unitsPerPackage'], $line['packageCost'], $quantity, $unitCost,
                    ]);
                    $pdo->prepare('UPDATE inventory_items SET current_stock = ?, average_cost = ? WHERE id = ?')
                        ->execute([$newStock, $newCost, $itemId]);
                    $pdo->prepare(
                        "INSERT INTO inventory_movements
                           (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
                         VALUES (?, 'purchase', ?, ?, 'purchase', ?, 'Importación de inventario', ?)"
                    )->execute([$itemId, $quantity, $unitCost, $purchaseId, $user['id']]);
                }
                audit_log($pdo, $user, 'receive', 'purchase', $purchaseId, null, [
                    'source' => 'inventory_import',
                    'invoiceNumber' => $invoiceNumber,
                    'total' => $purchaseTotal,
                    'items' => count($lines),
                ]);
                $grandTotal += $purchaseTotal;
            }
            $summary = [
                'rows' => count($analysis['rows']),
                'invoices' => count($purchaseIds),
                'newItems' => count($createdSkus),
                'existingItems' => $analysis['summary']['existingItems'],
                'total' => money_round($grandTotal),
            ];
            audit_log($pdo, $user, 'import', 'inventory', null, null, $summary);
            return ['purchaseIds' => $purchaseIds, 'summary' => $summary];
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El archivo contiene un SKU que ya fue creado por otra operación. Vuelva a verificarlo.', 409);
        }
        throw $error;
    }
    json_response($result, 201);
}

function inventory_movements(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $limit = max(1, min((int) ($_GET['limit'] ?? 100), 500));
    $statement = db()->prepare(
        'SELECT m.id, i.name AS itemName, i.sku, m.movement_type AS type, m.quantity, m.unit_cost AS unitCost,
                m.notes, u.full_name AS createdBy, m.created_at AS createdAt
         FROM inventory_movements m JOIN inventory_items i ON i.id = m.inventory_item_id
         JOIN users u ON u.id = m.created_by ORDER BY m.created_at DESC LIMIT ?'
    );
    $statement->bindValue(1, $limit, PDO::PARAM_INT);
    $statement->execute();
    json_response(['movements' => $statement->fetchAll()]);
}

function pos_products(array $params = [])
{
    require_auth();
    $search = catalog_search();
    $category = trim(substr((string) ($_GET['category'] ?? ''), 0, 100));
    $base = 'SELECT p.id, p.sku, p.barcode, p.name, p.category, p.image_path AS imageUrl, p.sale_price AS salePrice, p.tax_rate AS taxRate,
                COALESCE(MIN(GREATEST(0, i.current_stock - i.reserved_stock) / NULLIF(r.quantity, 0)), 0) AS available
         FROM products p LEFT JOIN product_recipes r ON r.product_id = p.id
         LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
         WHERE p.active = TRUE AND p.deleted_at IS NULL GROUP BY p.id';
    $filters = ['available >= 1'];
    $values = [];
    if ($search !== '') {
        $filters[] = "LOWER(CONCAT_WS(' ', name, sku, barcode)) LIKE ?";
        $values[] = '%' . strtolower($search) . '%';
    }
    if ($category !== '') {
        $filters[] = 'category = ?';
        $values[] = $category;
    }
    $where = ' WHERE ' . implode(' AND ', $filters);
    $countStatement = db()->prepare("SELECT COUNT(*) FROM ({$base}) available_products{$where}");
    $countStatement->execute($values);
    $pagination = catalog_pagination((int) $countStatement->fetchColumn(), 18, 60);
    $offset = ($pagination['page'] - 1) * $pagination['perPage'];
    $statement = db()->prepare(
        "SELECT * FROM ({$base}) available_products{$where}
         ORDER BY category, name LIMIT ? OFFSET ?"
    );
    $position = 1;
    foreach ($values as $value) {
        $statement->bindValue($position++, $value, PDO::PARAM_STR);
    }
    $statement->bindValue($position++, $pagination['perPage'], PDO::PARAM_INT);
    $statement->bindValue($position, $offset, PDO::PARAM_INT);
    $statement->execute();
    $rows = $statement->fetchAll();
    foreach ($rows as &$row) {
        $row['available'] = max(0, (int) floor((float) $row['available']));
    }
    unset($row);
    $categories = db()->query(
        'SELECT DISTINCT category FROM products WHERE active = TRUE AND deleted_at IS NULL ORDER BY category'
    )->fetchAll(PDO::FETCH_COLUMN);
    json_response(['products' => $rows, 'categories' => $categories, 'pagination' => $pagination]);
}

function pos_tabs(array $params = [])
{
    require_auth();
    $statement = db()->query(
        "SELECT t.id, t.customer_name AS customerName, t.opened_at AS openedAt, t.updated_at AS updatedAt,
                u.full_name AS openedBy, COALESCE(SUM(i.quantity), 0) AS itemCount,
                COALESCE(SUM(
                    ROUND(i.quantity * i.unit_price, 2)
                    + ROUND(ROUND(i.quantity * i.unit_price, 2) * p.tax_rate, 2)
                ), 0) AS total
         FROM customer_tabs t
         JOIN users u ON u.id = t.opened_by
         LEFT JOIN customer_tab_items i ON i.tab_id = t.id
         LEFT JOIN products p ON p.id = i.product_id
         WHERE t.status = 'open'
         GROUP BY t.id, u.full_name
         ORDER BY t.updated_at DESC, t.id DESC"
    );
    json_response(['tabs' => $statement->fetchAll()]);
}

function pos_tab_create(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $body = request_body();
    $customerName = value_string($body, 'customerName', 2, 120) ?? '';
    $existing = db()->prepare("SELECT id FROM customer_tabs WHERE status = 'open' AND LOWER(customer_name) = LOWER(?) LIMIT 1");
    $existing->execute([$customerName]);
    $existingId = $existing->fetchColumn();
    if ($existingId) {
        json_response(['id' => (int) $existingId, 'reused' => true]);
        return;
    }
    $statement = db()->prepare('INSERT INTO customer_tabs (customer_name, opened_by) VALUES (?, ?)');
    $statement->execute([$customerName, $user['id']]);
    $id = (int) db()->lastInsertId();
    audit_log(db(), $user, 'open', 'customer_tab', $id, null, ['customerName' => $customerName]);
    json_response(['id' => $id, 'reused' => false], 201);
}

function pos_tab_detail(array $params)
{
    require_auth();
    $tabId = path_id($params);
    $statement = db()->prepare(
        "SELECT t.id, t.customer_name AS customerName, t.opened_at AS openedAt,
                u.full_name AS openedBy
         FROM customer_tabs t JOIN users u ON u.id = t.opened_by
         WHERE t.id = ? AND t.status = 'open'"
    );
    $statement->execute([$tabId]);
    $tab = $statement->fetch();
    if (!$tab) throw new ApiError('La cuenta no está abierta.', 404);
    $items = db()->prepare(
        "SELECT p.id, p.sku, p.name, p.category, p.image_path AS imageUrl,
                i.unit_price AS salePrice, p.tax_rate AS taxRate, i.quantity,
                MIN(i.added_at) AS addedAt,
                COALESCE(MIN(
                  GREATEST(0, stock.current_stock - stock.reserved_stock + (r.quantity * i.quantity))
                  / NULLIF(r.quantity, 0)
                ), 0) AS available
         FROM customer_tab_items i
         JOIN products p ON p.id = i.product_id
         LEFT JOIN product_recipes r ON r.product_id = p.id
         LEFT JOIN inventory_items stock ON stock.id = r.inventory_item_id
         WHERE i.tab_id = ?
         GROUP BY p.id, i.tab_id, i.unit_price, i.quantity
         ORDER BY addedAt"
    );
    $items->execute([$tabId]);
    $rows = $items->fetchAll();
    foreach ($rows as &$row) $row['available'] = max(0, (int) floor((float) $row['available']));
    unset($row);
    $tab['items'] = $rows;
    json_response(['tab' => $tab]);
}

function pos_tab_item_set(array $params)
{
    require_csrf();
    $user = require_auth();
    $tabId = path_id($params);
    $body = request_body();
    $productId = value_id($body, 'productId');
    if (!array_key_exists('quantity', $body)) throw new ApiError('La cantidad es obligatoria.');
    $quantity = pos_quantity($body['quantity'], true);
    transaction(function (PDO $pdo) use ($user, $tabId, $productId, $quantity): void {
        $tab = $pdo->prepare("SELECT id FROM customer_tabs WHERE id = ? AND status = 'open' FOR UPDATE");
        $tab->execute([$tabId]);
        if (!$tab->fetch()) throw new ApiError('La cuenta ya no está abierta.', 409);
        $currentLine = $pdo->prepare('SELECT quantity FROM customer_tab_items WHERE tab_id = ? AND product_id = ? FOR UPDATE');
        $currentLine->execute([$tabId, $productId]);
        $currentQuantity = (float) ($currentLine->fetchColumn() ?: 0);
        $difference = $quantity - $currentQuantity;
        $product = $pdo->prepare('SELECT id, sale_price FROM products WHERE id = ? AND active = TRUE AND deleted_at IS NULL FOR UPDATE');
        $product->execute([$productId]);
        $row = $product->fetch();
        if (!$row) throw new ApiError('El producto no está disponible.', 409);
        $recipe = $pdo->prepare(
            'SELECT r.inventory_item_id, r.quantity, i.name AS item_name,
                    i.current_stock, i.reserved_stock
             FROM product_recipes r
             JOIN inventory_items i ON i.id = r.inventory_item_id
             WHERE r.product_id = ?
             ORDER BY r.inventory_item_id FOR UPDATE'
        );
        $recipe->execute([$productId]);
        $components = $recipe->fetchAll();
        if (!$components) throw new ApiError('El producto no tiene receta de inventario.', 409);
        if ($difference > 0) {
            foreach ($components as $component) {
                $needed = (float) $component['quantity'] * $difference;
                $free = (float) $component['current_stock'] - (float) $component['reserved_stock'];
                if ($free + 0.000001 < $needed) {
                    throw new ApiError("Inventario ya reservado o insuficiente: {$component['item_name']}.", 409);
                }
            }
        }
        foreach ($components as $component) {
            $reservationChange = (float) $component['quantity'] * $difference;
            $pdo->prepare(
                'UPDATE inventory_items
                 SET reserved_stock = GREATEST(0, reserved_stock + ?)
                 WHERE id = ?'
            )->execute([$reservationChange, $component['inventory_item_id']]);
        }
        if ($quantity <= 0) {
            $pdo->prepare('DELETE FROM customer_tab_items WHERE tab_id = ? AND product_id = ?')->execute([$tabId, $productId]);
        } else {
            $pdo->prepare(
                'INSERT INTO customer_tab_items (tab_id, product_id, quantity, unit_price)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), updated_at = NOW()'
            )->execute([$tabId, $productId, $quantity, $row['sale_price']]);
        }
        $pdo->prepare('UPDATE customer_tabs SET updated_at = NOW() WHERE id = ?')->execute([$tabId]);
        audit_log($pdo, $user, 'set_item', 'customer_tab', $tabId, [
            'productId' => $productId,
            'quantity' => $currentQuantity,
        ], [
            'productId' => $productId,
            'quantity' => $quantity,
        ]);
    });
    no_content();
}

function pos_tab_clear(array $params)
{
    require_csrf();
    $user = require_auth();
    $tabId = path_id($params);
    transaction(function (PDO $pdo) use ($user, $tabId): void {
        $tab = $pdo->prepare("SELECT id FROM customer_tabs WHERE id = ? AND status = 'open' FOR UPDATE");
        $tab->execute([$tabId]);
        if (!$tab->fetch()) throw new ApiError('La cuenta ya no está abierta.', 409);
        $reservations = $pdo->prepare(
            'SELECT r.inventory_item_id, SUM(r.quantity * i.quantity) AS quantity
             FROM customer_tab_items i
             JOIN product_recipes r ON r.product_id = i.product_id
             WHERE i.tab_id = ?
             GROUP BY r.inventory_item_id
             ORDER BY r.inventory_item_id'
        );
        $reservations->execute([$tabId]);
        foreach ($reservations->fetchAll() as $reservation) {
            $pdo->prepare(
                'UPDATE inventory_items
                 SET reserved_stock = GREATEST(0, reserved_stock - ?)
                 WHERE id = ?'
            )->execute([$reservation['quantity'], $reservation['inventory_item_id']]);
        }
        $pdo->prepare('DELETE FROM customer_tab_items WHERE tab_id = ?')->execute([$tabId]);
        $pdo->prepare('UPDATE customer_tabs SET updated_at = NOW() WHERE id = ?')->execute([$tabId]);
        audit_log($pdo, $user, 'clear', 'customer_tab', $tabId);
    });
    no_content();
}

function pos_tab_void(array $params)
{
    require_csrf();
    $user = require_auth();
    $tabId = path_id($params);
    $body = request_body();
    $reason = value_string($body, 'reason', 4, 300) ?? '';
    transaction(function (PDO $pdo) use ($user, $tabId, $reason): void {
        $tab = $pdo->prepare(
            "SELECT id, customer_name AS customerName
             FROM customer_tabs WHERE id = ? AND status = 'open' FOR UPDATE"
        );
        $tab->execute([$tabId]);
        $tabRow = $tab->fetch();
        if (!$tabRow) throw new ApiError('La cuenta ya no está abierta.', 409);
        $reservations = $pdo->prepare(
            'SELECT r.inventory_item_id, SUM(r.quantity * i.quantity) AS quantity
             FROM customer_tab_items i
             JOIN product_recipes r ON r.product_id = i.product_id
             WHERE i.tab_id = ?
             GROUP BY r.inventory_item_id
             ORDER BY r.inventory_item_id'
        );
        $reservations->execute([$tabId]);
        foreach ($reservations->fetchAll() as $reservation) {
            $pdo->prepare(
                'UPDATE inventory_items
                 SET reserved_stock = GREATEST(0, reserved_stock - ?)
                 WHERE id = ?'
            )->execute([$reservation['quantity'], $reservation['inventory_item_id']]);
        }
        $pdo->prepare('DELETE FROM customer_tab_items WHERE tab_id = ?')->execute([$tabId]);
        $pdo->prepare(
            "UPDATE customer_tabs
             SET status = 'void', closed_at = NOW(), updated_at = NOW()
             WHERE id = ?"
        )->execute([$tabId]);
        audit_log($pdo, $user, 'void', 'customer_tab', $tabId, [
            'status' => 'open',
            'customerName' => $tabRow['customerName'],
        ], [
            'status' => 'void',
            'reason' => $reason,
        ]);
    });
    no_content();
}

function pos_sale_create(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $body = request_body();
    $sessionId = value_id($body, 'cashSessionId');
    $tabId = isset($body['tabId']) && $body['tabId'] !== null ? value_id($body, 'tabId') : null;
    $discount = isset($body['discount']) ? value_number($body, 'discount', 0, 100000) : 0;
    if (!is_array($body['items'] ?? null) || !$body['items'] || count($body['items']) > 100) {
        throw new ApiError('La venta debe contener productos.');
    }
    if (!is_array($body['payments'] ?? null) || !$body['payments'] || count($body['payments']) > 3) {
        throw new ApiError('La venta debe contener pagos.');
    }
    $requested = [];
    foreach ($body['items'] as $line) {
        if (!is_array($line)) throw new ApiError('Producto inválido.');
        $productId = value_id($line, 'productId');
        $quantity = pos_quantity($line['quantity'] ?? null);
        $requested[$productId] = ($requested[$productId] ?? 0) + $quantity;
        if ($requested[$productId] > 100) throw new ApiError('La cantidad acumulada de un producto no puede superar 100.');
    }
    $payments = [];
    $paymentMethods = [];
    foreach ($body['payments'] as $payment) {
        if (!is_array($payment)) throw new ApiError('Pago inválido.');
        $method = require_choice($payment['method'] ?? '', ['cash', 'card', 'yappy'], 'method');
        if (isset($paymentMethods[$method])) throw new ApiError('Cada método de pago solo puede utilizarse una vez.');
        $paymentMethods[$method] = true;
        $payments[] = [
            'method' => $method,
            'amount' => value_number($payment, 'amount', 0.01),
            'reference' => value_string($payment, 'reference', 0, 120, false),
        ];
    }

    $result = transaction(function (PDO $pdo) use ($user, $sessionId, $tabId, $discount, $requested, $payments): array {
        $sessionStatement = $pdo->prepare("SELECT id, opened_by FROM cash_sessions WHERE id = ? AND status = 'open' FOR UPDATE");
        $sessionStatement->execute([$sessionId]);
        $session = $sessionStatement->fetch();
        if (!$session) throw new ApiError('La caja no está abierta.', 409);
        if ((int) $session['opened_by'] !== (int) $user['id']) {
            throw new ApiError('Solo puede vender en su propia caja.', 403);
        }

        if ($tabId !== null) {
            $tab = $pdo->prepare("SELECT id FROM customer_tabs WHERE id = ? AND status = 'open' FOR UPDATE");
            $tab->execute([$tabId]);
            if (!$tab->fetch()) throw new ApiError('La cuenta ya no está abierta.', 409);
            $tabItems = $pdo->prepare('SELECT product_id, quantity FROM customer_tab_items WHERE tab_id = ? ORDER BY product_id FOR UPDATE');
            $tabItems->execute([$tabId]);
            $stored = [];
            foreach ($tabItems->fetchAll() as $line) $stored[(int) $line['product_id']] = (float) $line['quantity'];
            if (count($stored) !== count($requested)) throw new ApiError('La cuenta cambió. Actualícela antes de cobrar.', 409);
            foreach ($requested as $productId => $quantity) {
                if (!isset($stored[$productId]) || abs($stored[$productId] - $quantity) > 0.0009) {
                    throw new ApiError('La cuenta cambió. Actualícela antes de cobrar.', 409);
                }
            }
        }

        $productIds = array_keys($requested);
        $in = placeholders(count($productIds));
        $productStatement = $pdo->prepare("SELECT id, name, sale_price, tax_rate FROM products WHERE active = TRUE AND id IN ({$in}) FOR UPDATE");
        $productStatement->execute($productIds);
        $productRows = $productStatement->fetchAll();
        if (count($productRows) !== count($productIds)) throw new ApiError('Uno o más productos no están disponibles.', 409);
        $products = [];
        foreach ($productRows as $product) $products[(int) $product['id']] = $product;

        $recipeStatement = $pdo->prepare(
            "SELECT r.product_id, r.inventory_item_id, r.quantity, i.name AS item_name,
                    i.current_stock, i.reserved_stock, i.average_cost
             FROM product_recipes r JOIN inventory_items i ON i.id = r.inventory_item_id
             WHERE r.product_id IN ({$in}) ORDER BY r.inventory_item_id FOR UPDATE"
        );
        $recipeStatement->execute($productIds);
        $recipeRows = $recipeStatement->fetchAll();
        $recipes = [];
        $requirements = [];
        $itemState = [];
        foreach ($recipeRows as $component) {
            $productId = (int) $component['product_id'];
            $itemId = (int) $component['inventory_item_id'];
            $recipes[$productId][] = $component;
            $requirements[$itemId] = ($requirements[$itemId] ?? 0) + (float) $component['quantity'] * $requested[$productId];
            $itemState[$itemId] = $component;
        }
        foreach ($productIds as $productId) {
            if (empty($recipes[$productId])) throw new ApiError("El producto {$products[$productId]['name']} no tiene receta de inventario.", 409);
        }
        foreach ($requirements as $itemId => $needed) {
            $available = $tabId !== null
                ? (float) $itemState[$itemId]['current_stock']
                : (float) $itemState[$itemId]['current_stock'] - (float) $itemState[$itemId]['reserved_stock'];
            if ($available + 0.000001 < $needed) {
                throw new ApiError("Inventario insuficiente: {$itemState[$itemId]['item_name']}.", 409);
            }
            if ($tabId !== null && (float) $itemState[$itemId]['reserved_stock'] + 0.000001 < $needed) {
                throw new ApiError("La reserva de inventario está incompleta: {$itemState[$itemId]['item_name']}.", 409);
            }
        }

        $subtotal = 0.0;
        $tax = 0.0;
        $calculated = [];
        foreach ($requested as $productId => $quantity) {
            $product = $products[$productId];
            $lineSubtotal = money_round((float) $product['sale_price'] * $quantity);
            $lineTax = money_round($lineSubtotal * (float) $product['tax_rate']);
            $unitCost = array_reduce($recipes[$productId], fn (float $sum, array $item): float => $sum + (float) $item['quantity'] * (float) $item['average_cost'], 0.0);
            $subtotal = money_round($subtotal + $lineSubtotal);
            $tax = money_round($tax + $lineTax);
            $calculated[] = compact('productId', 'quantity', 'product', 'unitCost', 'lineTax') + ['total' => money_round($lineSubtotal + $lineTax)];
        }
        if ($discount > $subtotal + $tax) throw new ApiError('El descuento supera el total.');
        $total = money_round($subtotal + $tax - $discount);
        if ($total <= 0) throw new ApiError('El total de la venta debe ser mayor que cero.');
        $paymentTotal = money_round(array_reduce($payments, fn (float $sum, array $payment): float => $sum + $payment['amount'], 0.0));
        if (abs($paymentTotal - $total) > 0.009) throw new ApiError('Los pagos deben coincidir exactamente con el total.');

        // Distribuir el descuento entre las líneas mantiene la suma de
        // sale_items.line_total alineada con sales.total y evita inflar los
        // reportes de productos cuando el POS aplica un descuento.
        if ($discount > 0) {
            $discountedTotals = pos_allocate_discount(array_column($calculated, 'total'), $discount);
            foreach ($calculated as $index => &$line) $line['total'] = $discountedTotals[$index];
            unset($line);
        }

        $receipt = 'NOOX-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
        $sale = $pdo->prepare('INSERT INTO sales (receipt_number, cash_session_id, cashier_id, subtotal, tax, discount, total) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $sale->execute([$receipt, $sessionId, $user['id'], $subtotal, $tax, $discount, $total]);
        $saleId = (int) $pdo->lastInsertId();
        $saleItem = $pdo->prepare(
            'INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost, tax_amount, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($calculated as $line) {
            $saleItem->execute([$saleId, $line['productId'], $line['product']['name'], $line['quantity'], $line['product']['sale_price'], $line['unitCost'], $line['lineTax'], $line['total']]);
        }
        $paymentInsert = $pdo->prepare('INSERT INTO payments (sale_id, method, amount, reference_number) VALUES (?, ?, ?, ?)');
        foreach ($payments as $payment) $paymentInsert->execute([$saleId, $payment['method'], $payment['amount'], $payment['reference']]);
        foreach ($requirements as $itemId => $needed) {
            if ($tabId !== null) {
                $pdo->prepare(
                    'UPDATE inventory_items
                     SET current_stock = current_stock - ?,
                         reserved_stock = GREATEST(0, reserved_stock - ?)
                     WHERE id = ?'
                )->execute([$needed, $needed, $itemId]);
            } else {
                $pdo->prepare('UPDATE inventory_items SET current_stock = current_stock - ? WHERE id = ?')
                    ->execute([$needed, $itemId]);
            }
            $pdo->prepare(
                "INSERT INTO inventory_movements
                   (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
                 VALUES (?, 'sale', ?, ?, 'sale', ?, ?)"
            )->execute([$itemId, -$needed, $itemState[$itemId]['average_cost'], $saleId, $user['id']]);
        }
        if ($tabId !== null) {
            $pdo->prepare("UPDATE customer_tabs SET status = 'paid', sale_id = ?, closed_at = NOW(), updated_at = NOW() WHERE id = ?")
                ->execute([$saleId, $tabId]);
        }
        audit_log($pdo, $user, 'complete', 'sale', $saleId, null, compact('receipt', 'total'));
        return ['id' => $saleId, 'receipt' => $receipt, 'subtotal' => $subtotal, 'tax' => $tax, 'discount' => $discount, 'total' => $total];
    });
    json_response($result, 201);
}

function pos_sale_void(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $saleId = path_id($params);
    $body = request_body();
    $reason = value_string($body, 'reason', 4, 300) ?? '';
    transaction(function (PDO $pdo) use ($user, $saleId, $reason): void {
        $statement = $pdo->prepare(
            'SELECT s.id, s.status, c.status AS cashSessionStatus
             FROM sales s
             JOIN cash_sessions c ON c.id = s.cash_session_id
             WHERE s.id = ? FOR UPDATE'
        );
        $statement->execute([$saleId]);
        $sale = $statement->fetch();
        if (!$sale) throw new ApiError('Venta no encontrada.', 404);
        if ($sale['status'] !== 'completed') throw new ApiError('La venta ya fue anulada.', 409);
        if ($sale['cashSessionStatus'] !== 'open') {
            throw new ApiError('No puede anular una venta después del cierre de caja. Registre una devolución controlada.', 409);
        }
        $movements = $pdo->prepare(
            "SELECT inventory_item_id, quantity, unit_cost FROM inventory_movements
             WHERE reference_type = 'sale' AND reference_id = ? AND movement_type = 'sale' FOR UPDATE"
        );
        $movements->execute([$saleId]);
        foreach ($movements->fetchAll() as $movement) {
            $restored = abs((float) $movement['quantity']);
            $pdo->prepare('UPDATE inventory_items SET current_stock = current_stock + ? WHERE id = ?')->execute([$restored, $movement['inventory_item_id']]);
            $pdo->prepare(
                "INSERT INTO inventory_movements
                   (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_by)
                 VALUES (?, 'void', ?, ?, 'sale', ?, ?, ?)"
            )->execute([$movement['inventory_item_id'], $restored, $movement['unit_cost'], $saleId, $reason, $user['id']]);
        }
        $pdo->prepare("UPDATE sales SET status = 'voided', void_reason = ?, voided_at = NOW(), voided_by = ? WHERE id = ?")
            ->execute([$reason, $user['id'], $saleId]);
        audit_log($pdo, $user, 'void', 'sale', $saleId, ['status' => 'completed'], ['status' => 'voided', 'reason' => $reason]);
    });
    no_content();
}

function pos_sales(array $params = [])
{
    $user = require_auth();
    $limit = max(1, min((int) ($_GET['limit'] ?? 50), 200));
    $sql = "SELECT s.id, s.receipt_number AS receipt, s.subtotal, s.tax, s.discount, s.total,
                   s.status, s.void_reason AS voidReason, s.created_at AS createdAt,
                   u.full_name AS cashier, c.status AS cashSessionStatus,
                   (SELECT GROUP_CONCAT(CONCAT(payment.method, ':', CAST(payment.amount AS CHAR))
                                        ORDER BY payment.id SEPARATOR '|')
                    FROM payments payment WHERE payment.sale_id = s.id) AS paymentSummary
            FROM sales s
            JOIN users u ON u.id = s.cashier_id
            JOIN cash_sessions c ON c.id = s.cash_session_id ";
    $values = [];
    if ($user['role'] === 'cashier') {
        $sql .= 'WHERE s.cashier_id = ? ';
        $values[] = $user['id'];
    }
    $sql .= 'ORDER BY s.created_at DESC LIMIT ?';
    $statement = db()->prepare($sql);
    foreach ($values as $index => $value) $statement->bindValue($index + 1, $value, PDO::PARAM_INT);
    $statement->bindValue(count($values) + 1, $limit, PDO::PARAM_INT);
    $statement->execute();
    json_response(['sales' => $statement->fetchAll()]);
}
