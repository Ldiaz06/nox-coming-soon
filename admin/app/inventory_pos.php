<?php
declare(strict_types=1);

function inventory_items(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        'SELECT id, sku, name, category, unit, current_stock AS currentStock, minimum_stock AS minimumStock,
                average_cost AS averageCost, active, current_stock <= minimum_stock AS lowStock
         FROM inventory_items WHERE active = TRUE ORDER BY category, name'
    )->fetchAll();
    json_response(['items' => $rows]);
}

function inventory_item_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $body = request_body();
    $sku = value_string($body, 'sku', 1, 80) ?? '';
    $name = value_string($body, 'name', 2, 180) ?? '';
    $category = value_string($body, 'category', 2, 100) ?? '';
    $unit = require_choice($body['unit'] ?? '', ['unit', 'bottle', 'ml', 'liter', 'gram', 'kg', 'portion'], 'unit');
    $stock = value_number($body, 'currentStock', 0);
    $minimum = value_number($body, 'minimumStock', 0);
    $cost = value_number($body, 'averageCost', 0);

    try {
        $id = transaction(function (PDO $pdo) use ($user, $sku, $name, $category, $unit, $stock, $minimum, $cost): int {
            $statement = $pdo->prepare(
                'INSERT INTO inventory_items (sku, name, category, unit, current_stock, minimum_stock, average_cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $statement->execute([$sku, $name, $category, $unit, $stock, $minimum, $cost]);
            $id = (int) $pdo->lastInsertId();
            if ($stock > 0) {
                $movement = $pdo->prepare(
                    "INSERT INTO inventory_movements
                       (inventory_item_id, movement_type, quantity, unit_cost, notes, created_by)
                     VALUES (?, 'opening', ?, ?, 'Inventario inicial', ?)"
                );
                $movement->execute([$id, $stock, $cost, $user['id']]);
            }
            audit_log($pdo, $user, 'create', 'inventory_item', $id, null, compact('sku', 'name', 'category', 'unit', 'stock', 'minimum', 'cost'));
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
        $id = transaction(function (PDO $pdo) use ($user, $sku, $barcode, $name, $category, $price, $taxRate, $normalizedRecipe): int {
            $ids = array_keys($normalizedRecipe);
            $statement = $pdo->prepare('SELECT id FROM inventory_items WHERE active = TRUE AND id IN (' . placeholders(count($ids)) . ')');
            $statement->execute($ids);
            if (count($statement->fetchAll()) !== count($ids)) {
                throw new ApiError('La receta contiene artículos inválidos.');
            }
            $product = $pdo->prepare('INSERT INTO products (sku, barcode, name, category, sale_price, tax_rate) VALUES (?, ?, ?, ?, ?, ?)');
            $product->execute([$sku, $barcode, $name, $category, $price, $taxRate]);
            $id = (int) $pdo->lastInsertId();
            $recipeInsert = $pdo->prepare('INSERT INTO product_recipes (product_id, inventory_item_id, quantity) VALUES (?, ?, ?)');
            foreach ($normalizedRecipe as $itemId => $quantity) {
                $recipeInsert->execute([$id, $itemId, $quantity]);
            }
            audit_log($pdo, $user, 'create', 'product', $id, null, ['sku' => $sku, 'name' => $name, 'salePrice' => $price, 'recipe' => $normalizedRecipe]);
            return $id;
        });
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            throw new ApiError('El SKU o código de barras ya existe.', 409);
        }
        throw $error;
    }
    json_response(['id' => $id], 201);
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
        $select = $pdo->prepare('SELECT id, current_stock FROM inventory_items WHERE id = ? AND active = TRUE FOR UPDATE');
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
            'INSERT INTO inventory_movements (inventory_item_id, movement_type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?)'
        );
        $movement->execute([$itemId, $type, $delta, $notes, $user['id']]);
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
    $supplierId = isset($body['supplierId']) && $body['supplierId'] !== null ? value_id($body, 'supplierId') : null;
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
            'quantity' => value_number($line, 'quantity', 0.0001),
            'unitCost' => value_number($line, 'unitCost', 0),
        ];
    }

    $id = transaction(function (PDO $pdo) use ($user, $supplierId, $invoice, $notes, $purchasedDate, $items): int {
        $total = array_reduce($items, fn (float $sum, array $item): float => $sum + $item['quantity'] * $item['unitCost'], 0.0);
        $purchase = $pdo->prepare(
            'INSERT INTO purchases (supplier_id, invoice_number, purchased_at, total, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)'
        );
        $purchase->execute([$supplierId, $invoice, $purchasedDate->format('Y-m-d H:i:s'), money_round($total), $notes, $user['id']]);
        $id = (int) $pdo->lastInsertId();
        foreach ($items as $line) {
            $select = $pdo->prepare('SELECT current_stock, average_cost FROM inventory_items WHERE id = ? FOR UPDATE');
            $select->execute([$line['itemId']]);
            $item = $select->fetch();
            if (!$item) throw new ApiError('Artículo de compra inválido.');
            $oldValue = (float) $item['current_stock'] * (float) $item['average_cost'];
            $newStock = (float) $item['current_stock'] + $line['quantity'];
            $newCost = $newStock > 0 ? ($oldValue + $line['quantity'] * $line['unitCost']) / $newStock : $line['unitCost'];
            $pdo->prepare('INSERT INTO purchase_items (purchase_id, inventory_item_id, quantity, unit_cost) VALUES (?, ?, ?, ?)')
                ->execute([$id, $line['itemId'], $line['quantity'], $line['unitCost']]);
            $pdo->prepare('UPDATE inventory_items SET current_stock = ?, average_cost = ? WHERE id = ?')
                ->execute([$newStock, $newCost, $line['itemId']]);
            $pdo->prepare(
                "INSERT INTO inventory_movements
                   (inventory_item_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
                 VALUES (?, 'purchase', ?, ?, 'purchase', ?, ?)"
            )->execute([$line['itemId'], $line['quantity'], $line['unitCost'], $id, $user['id']]);
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
        'SELECT p.id, p.sku, p.barcode, p.name, p.category, p.sale_price AS salePrice, p.tax_rate AS taxRate,
                COALESCE(MIN(i.current_stock / NULLIF(r.quantity, 0)), 999999) AS available
         FROM products p LEFT JOIN product_recipes r ON r.product_id = p.id
         LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
         WHERE p.active = TRUE GROUP BY p.id ORDER BY p.category, p.name'
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
        if ($user['role'] === 'cashier' && (int) $session['opened_by'] !== (int) $user['id']) {
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
