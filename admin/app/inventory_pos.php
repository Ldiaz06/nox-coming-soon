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

function inventory_items(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        "SELECT i.id, i.sku, i.name, i.category, i.unit,
                i.lead_time_days AS leadTimeDays,
                i.safety_stock_days AS safetyStockDays,
                i.target_stock_days AS targetStockDays,
                i.current_stock AS currentStock,
                i.minimum_stock AS minimumStock, i.average_cost AS averageCost,
                last_line.package_name AS referencePackageName,
                last_line.units_per_package AS referenceUnitsPerPackage,
                last_line.package_cost AS referencePackageCost,
                last_purchase.purchased_at AS referencePurchasedAt,
                supplier.name AS referenceSupplier,
                i.active, i.current_stock <= i.minimum_stock AS lowStock
         FROM inventory_items i
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
         LEFT JOIN purchases last_purchase ON last_purchase.id = last_line.purchase_id
         LEFT JOIN suppliers supplier ON supplier.id = last_purchase.supplier_id
         WHERE i.active = TRUE
         ORDER BY i.category, i.name"
    )->fetchAll();
    json_response(['items' => $rows]);
}

function inventory_suppliers(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        'SELECT id, name, contact_name AS contactName, phone, email
         FROM suppliers WHERE active = TRUE ORDER BY name'
    )->fetchAll();
    json_response(['suppliers' => $rows]);
}

function inventory_supplier_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $name = value_string($body, 'name', 2, 180) ?? '';
    $contactName = value_string($body, 'contactName', 0, 160, false);
    $phone = value_string($body, 'phone', 0, 60, false);
    $email = value_string($body, 'email', 0, 190, false);

    $existing = db()->prepare('SELECT id, active FROM suppliers WHERE LOWER(name) = LOWER(?) LIMIT 1');
    $existing->execute([$name]);
    $existingSupplier = $existing->fetch();
    if ($existingSupplier) {
        $existingId = (int) $existingSupplier['id'];
        transaction(function (PDO $pdo) use ($user, $existingId, $name, $contactName, $phone, $email): void {
            $pdo->prepare(
                'UPDATE suppliers
                 SET active = TRUE,
                     contact_name = COALESCE(?, contact_name),
                     phone = COALESCE(?, phone),
                     email = COALESCE(?, email)
                 WHERE id = ?'
            )->execute([$contactName, $phone, $email, $existingId]);
            audit_log($pdo, $user, 'reuse', 'supplier', $existingId, null, ['name' => $name]);
        });
        json_response(['id' => $existingId, 'reused' => true]);
    }

    $id = transaction(function (PDO $pdo) use ($user, $name, $contactName, $phone, $email): int {
        $statement = $pdo->prepare(
            'INSERT INTO suppliers (name, contact_name, phone, email) VALUES (?, ?, ?, ?)'
        );
        $statement->execute([$name, $contactName, $phone, $email]);
        $id = (int) $pdo->lastInsertId();
        audit_log($pdo, $user, 'create', 'supplier', $id, null, [
            'name' => $name,
            'contactName' => $contactName,
            'phone' => $phone,
        ]);
        return $id;
    });
    json_response(['id' => $id, 'reused' => false], 201);
}

function inventory_products(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        'SELECT p.id, p.sku, p.barcode, p.name, p.category, p.image_path AS imageUrl, p.sale_price AS salePrice,
                p.tax_rate AS taxRate, p.target_margin AS targetMargin, p.active,
                r.inventory_item_id AS itemId, r.quantity, i.sku AS itemSku,
                i.name AS itemName, i.unit, i.average_cost AS averageCost
         FROM products p
         LEFT JOIN product_recipes r ON r.product_id = p.id
         LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
         ORDER BY p.category, p.name, i.name'
    )->fetchAll();

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
    json_response(['products' => array_values($products)]);
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
    // Purchase terms are intentionally not part of the article master.
    // These compatibility values keep the existing schema usable; every real
    // presentation, conversion and price is stored in purchase_items.
    $packageName = 'Unidad base';
    $unitsPerPackage = 1.0;
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
        $result = transaction(function (PDO $pdo) use ($user, $sku, $barcode, $name, $category, $price, $taxRate, $targetMargin, $normalizedRecipe): array {
            $ids = array_keys($normalizedRecipe);
            $statement = $pdo->prepare('SELECT id, average_cost FROM inventory_items WHERE active = TRUE AND id IN (' . placeholders(count($ids)) . ')');
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
                'INSERT INTO products (sku, barcode, name, category, sale_price, tax_rate, target_margin)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $product->execute([$sku, $barcode, $name, $category, $price, $taxRate, $targetMargin]);
            $id = (int) $pdo->lastInsertId();
            $recipeInsert = $pdo->prepare('INSERT INTO product_recipes (product_id, inventory_item_id, quantity) VALUES (?, ?, ?)');
            foreach ($normalizedRecipe as $itemId => $quantity) {
                $recipeInsert->execute([$id, $itemId, $quantity]);
            }
            audit_log($pdo, $user, 'create', 'product', $id, null, [
                'sku' => $sku, 'name' => $name, 'salePrice' => $price,
                'targetMargin' => $targetMargin, 'recipeCost' => $recipeCost,
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
        || ($imageInfo[0] ?? 0) > 8000 || ($imageInfo[1] ?? 0) > 8000) {
        throw new ApiError('La fotografía no es una imagen válida o sus dimensiones no están permitidas.');
    }
    $mime = isset($imageInfo['mime']) ? (string) $imageInfo['mime'] : '';
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime])) {
        throw new ApiError('Use una fotografía JPG, PNG o WebP.');
    }

    $pdo = db();
    $statement = $pdo->prepare('SELECT id, image_path FROM products WHERE id = ?');
    $statement->execute([$productId]);
    $product = $statement->fetch();
    if (!$product) {
        throw new ApiError('Producto no encontrado.', 404);
    }

    $uploadDirectory = dirname(__DIR__) . '/public/uploads/products';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
        throw new ApiError('No fue posible preparar el directorio de fotografías.', 500);
    }
    $fileName = 'product-' . $productId . '-' . bin2hex(random_bytes(12)) . '.' . $extensions[$mime];
    $destination = $uploadDirectory . '/' . $fileName;
    if (!move_uploaded_file((string) $file['tmp_name'], $destination)) {
        throw new ApiError('No fue posible guardar la fotografía en el servidor.', 500);
    }
    @chmod($destination, 0644);
    $imagePath = '/uploads/products/' . $fileName;

    try {
        transaction(function (PDO $transaction) use ($user, $productId, $product, $imagePath): void {
            $update = $transaction->prepare('UPDATE products SET image_path = ? WHERE id = ?');
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

    json_response(['imageUrl' => $imagePath]);
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
        $select = $pdo->prepare('SELECT id, current_stock, average_cost FROM inventory_items WHERE id = ? AND active = TRUE FOR UPDATE');
        $select->execute([$itemId]);
        $item = $select->fetch();
        if (!$item) {
            throw new ApiError('Artículo no encontrado.', 404);
        }
        $delta = $type === 'count' ? $quantity - (float) $item['current_stock'] : $quantity;
        if ($type === 'waste') {
            $delta = -abs($quantity);
        }
        if ($type !== 'count' && abs($delta) < 0.0000001) {
            throw new ApiError('La cantidad no puede ser cero.');
        }
        $newStock = (float) $item['current_stock'] + $delta;
        if ($newStock < 0) {
            throw new ApiError('El movimiento dejaría el inventario en negativo.', 409);
        }
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
    $supplierId = value_id($body, 'supplierId');
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
            'packageQuantity' => value_number($line, 'packageQuantity', 0.0001),
            'packageCost' => value_number($line, 'packageCost', 0),
        ];
    }

    $id = transaction(function (PDO $pdo) use ($user, $supplierId, $invoice, $notes, $purchasedDate, $items): int {
        $supplier = $pdo->prepare('SELECT id FROM suppliers WHERE id = ? AND active = TRUE');
        $supplier->execute([$supplierId]);
        if (!$supplier->fetchColumn()) {
            throw new ApiError('El proveedor seleccionado no es válido.');
        }
        $total = array_reduce($items, fn (float $sum, array $item): float => $sum + $item['packageQuantity'] * $item['packageCost'], 0.0);
        $purchase = $pdo->prepare(
            'INSERT INTO purchases (supplier_id, invoice_number, purchased_at, total, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $purchase->execute([$supplierId, $invoice, $purchasedDate->format('Y-m-d H:i:s'), money_round($total), $notes, $user['id']]);
        $id = (int) $pdo->lastInsertId();
        foreach ($items as $line) {
            $select = $pdo->prepare(
                'SELECT current_stock, average_cost, unit, package_name, units_per_package
                 FROM inventory_items WHERE id = ? AND active = TRUE FOR UPDATE'
            );
            $select->execute([$line['itemId']]);
            $item = $select->fetch();
            if (!$item) throw new ApiError('Artículo de compra inválido.');
            $packageName = $line['packageName'];
            $unitsPerPackage = $line['unitsPerPackage'];
            if ($unitsPerPackage <= 0) throw new ApiError('La presentación del artículo no es válida.', 409);
            $quantity = $line['packageQuantity'] * $unitsPerPackage;
            $unitCost = $line['packageCost'] / $unitsPerPackage;
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
    $rows = db()->query(
        'SELECT p.id, p.sku, p.barcode, p.name, p.category, p.image_path AS imageUrl, p.sale_price AS salePrice, p.tax_rate AS taxRate,
                COALESCE(MIN(i.current_stock / NULLIF(r.quantity, 0)), 999999) AS available
         FROM products p LEFT JOIN product_recipes r ON r.product_id = p.id
         LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
         WHERE p.active = TRUE GROUP BY p.id HAVING available >= 1 ORDER BY p.category, p.name'
    )->fetchAll();
    foreach ($rows as &$row) {
        $row['available'] = max(0, (int) floor((float) $row['available']));
    }
    json_response(['products' => $rows]);
}

function pos_sale_create(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $body = request_body();
    $sessionId = value_id($body, 'cashSessionId');
    $discount = isset($body['discount']) ? value_number($body, 'discount', 0) : 0;
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
        $quantity = value_number($line, 'quantity', 0.001, 100);
        $requested[$productId] = ($requested[$productId] ?? 0) + $quantity;
    }
    $payments = [];
    foreach ($body['payments'] as $payment) {
        if (!is_array($payment)) throw new ApiError('Pago inválido.');
        $payments[] = [
            'method' => require_choice($payment['method'] ?? '', ['cash', 'card', 'yappy'], 'method'),
            'amount' => value_number($payment, 'amount', 0.01),
            'reference' => value_string($payment, 'reference', 0, 120, false),
        ];
    }

    $result = transaction(function (PDO $pdo) use ($user, $sessionId, $discount, $requested, $payments): array {
        $sessionStatement = $pdo->prepare("SELECT id, opened_by FROM cash_sessions WHERE id = ? AND status = 'open' FOR UPDATE");
        $sessionStatement->execute([$sessionId]);
        $session = $sessionStatement->fetch();
        if (!$session) throw new ApiError('La caja no está abierta.', 409);
        if ((int) $session['opened_by'] !== (int) $user['id']) {
            throw new ApiError('Solo puede vender en su propia caja.', 403);
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
            "SELECT r.product_id, r.inventory_item_id, r.quantity, i.name AS item_name, i.current_stock, i.average_cost
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
            if ((float) $itemState[$itemId]['current_stock'] < $needed) {
                throw new ApiError("Inventario insuficiente: {$itemState[$itemId]['item_name']}.", 409);
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
        $paymentTotal = money_round(array_reduce($payments, fn (float $sum, array $payment): float => $sum + $payment['amount'], 0.0));
        if (abs($paymentTotal - $total) > 0.009) throw new ApiError('Los pagos deben coincidir exactamente con el total.');

        $receipt = 'NOX-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
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
            $pdo->prepare('UPDATE inventory_items SET current_stock = current_stock - ? WHERE id = ?')->execute([$needed, $itemId]);
            $pdo->prepare(
                "INSERT INTO inventory_movements
                   (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
                 VALUES (?, 'sale', ?, ?, 'sale', ?, ?)"
            )->execute([$itemId, -$needed, $itemState[$itemId]['average_cost'], $saleId, $user['id']]);
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
        $statement = $pdo->prepare('SELECT id, status FROM sales WHERE id = ? FOR UPDATE');
        $statement->execute([$saleId]);
        $sale = $statement->fetch();
        if (!$sale) throw new ApiError('Venta no encontrada.', 404);
        if ($sale['status'] !== 'completed') throw new ApiError('La venta ya fue anulada.', 409);
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
    $sql = 'SELECT s.id, s.receipt_number AS receipt, s.total, s.status, s.created_at AS createdAt, u.full_name AS cashier
            FROM sales s JOIN users u ON u.id = s.cashier_id ';
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
