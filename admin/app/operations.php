<?php
declare(strict_types=1);

function cash_terminals(array $params = [])
{
    $user = require_auth();
    $statement = db()->prepare(
        "SELECT id, name, location_name AS locationName, assigned_user_id AS assignedUserId
         FROM terminals
         WHERE status = 'active' AND (
           assigned_user_id = ?
           OR (assigned_user_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM terminals own_terminal
             WHERE own_terminal.assigned_user_id = ? AND own_terminal.status = 'active'
           ))
         )
         ORDER BY assigned_user_id DESC, name"
    );
    $statement->execute([$user['id'], $user['id']]);
    $rows = $statement->fetchAll();
    json_response(['terminals' => $rows]);
}

function cash_sessions(array $params = [])
{
    $user = require_auth();
    $sql = "SELECT c.id, c.terminal_id AS terminalId, t.name AS terminalName, c.opening_amount AS openingAmount,
                   c.expected_cash AS expectedCash, c.counted_cash AS countedCash, c.cash_difference AS cashDifference,
                   c.status, c.opened_at AS openedAt, c.closed_at AS closedAt,
                   u.id AS openedById, u.full_name AS openedBy
            FROM cash_sessions c JOIN terminals t ON t.id = c.terminal_id JOIN users u ON u.id = c.opened_by ";
    $values = [];
    if ($user['role'] === 'cashier') {
        $sql .= 'WHERE c.opened_by = ? ';
        $values[] = $user['id'];
    }
    $sql .= 'ORDER BY c.opened_at DESC LIMIT 100';
    $statement = db()->prepare($sql);
    $statement->execute($values);
    json_response(['sessions' => $statement->fetchAll()]);
}

function cash_open(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $body = request_body();
    $terminalId = value_id($body, 'terminalId');
    $opening = value_number($body, 'openingAmount', 0, 100000);
    $id = transaction(function (PDO $pdo) use ($user, $terminalId, $opening): int {
        $terminal = $pdo->prepare("SELECT id, assigned_user_id FROM terminals WHERE id = ? AND status = 'active' FOR UPDATE");
        $terminal->execute([$terminalId]);
        $terminalRow = $terminal->fetch();
        if (!$terminalRow) throw new ApiError('Terminal inválida.', 404);
        if ($terminalRow['assigned_user_id'] !== null && (int) $terminalRow['assigned_user_id'] !== (int) $user['id']) {
            throw new ApiError('Esta caja está asignada a otro usuario.', 403);
        }
        if ($terminalRow['assigned_user_id'] === null) {
            $ownTerminal = $pdo->prepare("SELECT id FROM terminals WHERE assigned_user_id = ? AND status = 'active' FOR UPDATE");
            $ownTerminal->execute([$user['id']]);
            if ($ownTerminal->fetchColumn()) {
                throw new ApiError('Debe utilizar la caja asignada a su usuario.', 409);
            }
        }
        $existing = $pdo->prepare("SELECT id FROM cash_sessions WHERE terminal_id = ? AND status = 'open' FOR UPDATE");
        $existing->execute([$terminalId]);
        if ($existing->fetch()) throw new ApiError('La terminal ya tiene una caja abierta.', 409);
        $own = $pdo->prepare("SELECT id FROM cash_sessions WHERE opened_by = ? AND status = 'open' FOR UPDATE");
        $own->execute([$user['id']]);
        if ($own->fetch()) throw new ApiError('Ya tiene una caja abierta.', 409);
        $insert = $pdo->prepare('INSERT INTO cash_sessions (terminal_id, opened_by, opening_amount) VALUES (?, ?, ?)');
        $insert->execute([$terminalId, $user['id'], $opening]);
        $id = (int) $pdo->lastInsertId();
        audit_log($pdo, $user, 'open', 'cash_session', $id, null, ['terminalId' => $terminalId, 'openingAmount' => $opening]);
        return $id;
    });
    json_response(['id' => $id], 201);
}

function cash_close(array $params)
{
    require_csrf();
    $user = require_auth();
    $sessionId = path_id($params);
    $body = request_body();
    $counted = value_number($body, 'countedCash', 0, 100000);
    $notes = value_string($body, 'notes', 0, 500, false);
    $result = transaction(function (PDO $pdo) use ($user, $sessionId, $counted, $notes): array {
        $statement = $pdo->prepare('SELECT * FROM cash_sessions WHERE id = ? FOR UPDATE');
        $statement->execute([$sessionId]);
        $session = $statement->fetch();
        if (!$session) throw new ApiError('Caja no encontrada.', 404);
        if ($session['status'] !== 'open') throw new ApiError('La caja ya está cerrada.', 409);
        if ($user['role'] === 'cashier' && (int) $session['opened_by'] !== (int) $user['id']) {
            throw new ApiError('No puede cerrar la caja de otro usuario.', 403);
        }
        $totals = $pdo->prepare(
            "SELECT COALESCE(SUM(p.amount), 0) AS cashSales FROM payments p JOIN sales s ON s.id = p.sale_id
             WHERE s.cash_session_id = ? AND s.status = 'completed' AND p.method = 'cash'"
        );
        $totals->execute([$sessionId]);
        $cashSales = (float) $totals->fetchColumn();
        $expected = money_round((float) $session['opening_amount'] + $cashSales);
        $difference = money_round($counted - $expected);
        $pdo->prepare(
            "UPDATE cash_sessions SET expected_cash = ?, counted_cash = ?, cash_difference = ?, notes = ?,
             closed_by = ?, closed_at = NOW(), status = 'closed' WHERE id = ?"
        )->execute([$expected, $counted, $difference, $notes, $user['id'], $sessionId]);
        audit_log($pdo, $user, 'close', 'cash_session', $sessionId, null, compact('expected', 'counted', 'difference'));
        return ['expectedCash' => $expected, 'countedCash' => $counted, 'difference' => $difference];
    });
    json_response($result);
}

function report_range(string $period, ?string $anchorValue): array
{
    try {
        $anchor = $anchorValue && preg_match('/^\d{4}-\d{2}-\d{2}$/', $anchorValue)
            ? new DateTimeImmutable($anchorValue . ' 12:00:00')
            : new DateTimeImmutable('today');
    } catch (Throwable $error) {
        throw new ApiError('La fecha del reporte no es válida.');
    }
    if ($period === 'daily') {
        $start = $anchor->setTime(0, 0);
        $end = $start->modify('+1 day');
    } elseif ($period === 'fortnightly') {
        if ((int) $anchor->format('d') <= 15) {
            $start = $anchor->modify('first day of this month')->setTime(0, 0);
            $end = $start->modify('+15 days');
        } else {
            $start = $anchor->modify('first day of this month')->modify('+15 days')->setTime(0, 0);
            $end = $anchor->modify('first day of next month')->setTime(0, 0);
        }
    } elseif ($period === 'monthly') {
        $start = $anchor->modify('first day of this month')->setTime(0, 0);
        $end = $anchor->modify('first day of next month')->setTime(0, 0);
    } else {
        throw new ApiError('Período inválido.');
    }
    return ['start' => $start->format('Y-m-d H:i:s'), 'end' => $end->format('Y-m-d H:i:s')];
}

function reports_summary(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $period = (string) ($_GET['period'] ?? 'daily');
    $range = report_range($period, isset($_GET['anchor']) ? (string) $_GET['anchor'] : null);
    $pdo = db();
    $values = [$range['start'], $range['end']];

    $salesStatement = $pdo->prepare(
        "SELECT COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS grossSales,
                COALESCE(SUM(discount), 0) AS discounts, COALESCE(SUM(tax), 0) AS tax,
                COALESCE(SUM((SELECT SUM(si.unit_cost * si.quantity) FROM sale_items si WHERE si.sale_id = sales.id)), 0) AS cost
         FROM sales WHERE status = 'completed' AND created_at >= ? AND created_at < ?"
    );
    $salesStatement->execute($values);
    $summary = $salesStatement->fetch() ?: [];
    $summary['profit'] = (float) ($summary['grossSales'] ?? 0) - (float) ($summary['cost'] ?? 0);

    $payments = $pdo->prepare(
        "SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ? GROUP BY p.method ORDER BY p.method"
    );
    $payments->execute($values);
    $top = $pdo->prepare(
        "SELECT si.product_name AS name, SUM(si.quantity) AS quantity, SUM(si.line_total) AS total
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'completed' AND s.created_at >= ? AND s.created_at < ?
         GROUP BY si.product_id, si.product_name ORDER BY total DESC LIMIT 10"
    );
    $top->execute($values);
    $closures = $pdo->prepare(
        "SELECT c.id, t.name AS terminal, u.full_name AS openedBy, c.expected_cash AS expectedCash,
                c.counted_cash AS countedCash, c.cash_difference AS difference, c.closed_at AS closedAt
         FROM cash_sessions c JOIN terminals t ON t.id = c.terminal_id JOIN users u ON u.id = c.opened_by
         WHERE c.status = 'closed' AND c.closed_at >= ? AND c.closed_at < ? ORDER BY c.closed_at DESC"
    );
    $closures->execute($values);
    $inventory = $pdo->query(
        'SELECT COUNT(*) AS itemCount, COALESCE(SUM(current_stock * average_cost), 0) AS inventoryValue,
                SUM(current_stock <= minimum_stock) AS lowStockCount FROM inventory_items WHERE active = TRUE'
    )->fetch() ?: [];
    $trend = $pdo->prepare(
        "SELECT DATE(created_at) AS saleDate, SUM(total) AS total, COUNT(*) AS transactions
         FROM sales WHERE status = 'completed' AND created_at >= ? AND created_at < ?
         GROUP BY DATE(created_at) ORDER BY saleDate"
    );
    $trend->execute($values);
    json_response([
        'period' => $period, 'range' => $range, 'summary' => $summary,
        'payments' => $payments->fetchAll(), 'topProducts' => $top->fetchAll(),
        'closures' => $closures->fetchAll(), 'inventory' => $inventory, 'trend' => $trend->fetchAll(),
    ]);
}

function reports_low_stock(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        'SELECT id, sku, name, unit, current_stock AS currentStock, minimum_stock AS minimumStock
         FROM inventory_items WHERE active = TRUE AND current_stock <= minimum_stock
         ORDER BY (minimum_stock - current_stock) DESC, name'
    )->fetchAll();
    json_response(['items' => $rows]);
}

function reports_inventory_intelligence(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $days = max(7, min((int) ($_GET['days'] ?? 30), 365));
    $start = (new DateTimeImmutable('now'))->modify("-{$days} days")->format('Y-m-d H:i:s');
    $pdo = db();

    $profitabilityStatement = $pdo->prepare(
        "SELECT p.id, p.sku, p.name, p.category, p.sale_price AS salePrice,
                p.target_margin AS targetMargin,
                COALESCE(recipe.recipeCost, 0) AS currentRecipeCost,
                COALESCE(sales.unitsSold, 0) AS unitsSold,
                COALESCE(sales.revenue, 0) AS revenue,
                COALESCE(sales.actualCost, 0) AS actualCost
         FROM products p
         LEFT JOIN (
           SELECT r.product_id, SUM(r.quantity * i.average_cost) AS recipeCost
           FROM product_recipes r
           JOIN inventory_items i ON i.id = r.inventory_item_id
           GROUP BY r.product_id
         ) recipe ON recipe.product_id = p.id
         LEFT JOIN (
           SELECT si.product_id, SUM(si.quantity) AS unitsSold,
                  SUM(si.unit_price * si.quantity) AS revenue,
                  SUM(si.unit_cost * si.quantity) AS actualCost
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           WHERE s.status = 'completed' AND s.created_at >= ?
           GROUP BY si.product_id
         ) sales ON sales.product_id = p.id
         WHERE p.active = TRUE
         ORDER BY p.category, p.name"
    );
    $profitabilityStatement->execute([$start]);
    $profitability = [];
    $totalRevenue = 0.0;
    $totalActualCost = 0.0;
    foreach ($profitabilityStatement->fetchAll() as $row) {
        $price = (float) $row['salePrice'];
        $recipeCost = money_round((float) $row['currentRecipeCost']);
        $actualCost = money_round((float) $row['actualCost']);
        $revenue = money_round((float) $row['revenue']);
        $unitProfit = money_round($price - $recipeCost);
        $grossProfit = money_round($revenue - $actualCost);
        $totalRevenue += $revenue;
        $totalActualCost += $actualCost;
        $profitability[] = [
            'id' => (int) $row['id'],
            'sku' => $row['sku'],
            'name' => $row['name'],
            'category' => $row['category'],
            'salePrice' => $price,
            'targetMargin' => (float) $row['targetMargin'],
            'currentRecipeCost' => $recipeCost,
            'suggestedPrice' => suggested_product_price($recipeCost, (float) $row['targetMargin']),
            'unitGrossProfit' => $unitProfit,
            'currentMargin' => $price > 0 ? round($unitProfit / $price, 4) : 0.0,
            'unitsSold' => (float) $row['unitsSold'],
            'revenue' => $revenue,
            'actualCost' => $actualCost,
            'grossProfit' => $grossProfit,
            'realizedMargin' => $revenue > 0 ? round($grossProfit / $revenue, 4) : null,
        ];
    }

    $wasteStatement = $pdo->prepare(
        "SELECT i.id AS itemId, i.sku, i.name, i.unit,
                SUM(ABS(m.quantity)) AS quantity,
                SUM(ABS(m.quantity) * CASE WHEN m.unit_cost > 0 THEN m.unit_cost ELSE i.average_cost END) AS cost
         FROM inventory_movements m
         JOIN inventory_items i ON i.id = m.inventory_item_id
         WHERE m.movement_type = 'waste' AND m.created_at >= ?
         GROUP BY i.id, i.sku, i.name, i.unit
         ORDER BY cost DESC, i.name"
    );
    $wasteStatement->execute([$start]);
    $waste = [];
    $totalWasteCost = 0.0;
    foreach ($wasteStatement->fetchAll() as $row) {
        $cost = money_round((float) $row['cost']);
        $totalWasteCost += $cost;
        $waste[] = [
            'itemId' => (int) $row['itemId'],
            'sku' => $row['sku'],
            'name' => $row['name'],
            'unit' => $row['unit'],
            'quantity' => (float) $row['quantity'],
            'cost' => $cost,
        ];
    }

    $reorderStatement = $pdo->prepare(
        "SELECT i.id, i.sku, i.name, i.category, i.unit,
                COALESCE(last_line.package_name, 'Unidad base') AS packageName,
                COALESCE(last_line.units_per_package, 1) AS unitsPerPackage,
                COALESCE(last_line.package_cost, 0) AS referencePackageCost,
                i.current_stock AS currentStock, i.minimum_stock AS minimumStock,
                i.average_cost AS averageCost, i.lead_time_days AS leadTimeDays,
                i.safety_stock_days AS safetyStockDays, i.target_stock_days AS targetStockDays,
                COALESCE(consumption.consumed, 0) AS consumed,
                consumption.lastConsumption, purchase_activity.lastPurchase
         FROM inventory_items i
         LEFT JOIN (
           SELECT inventory_item_id,
                  GREATEST(0, SUM(CASE
                    WHEN movement_type = 'sale' THEN -quantity
                    WHEN movement_type = 'void' THEN -quantity
                    ELSE 0 END)) AS consumed,
                  MAX(CASE WHEN movement_type = 'sale' THEN created_at END) AS lastConsumption
           FROM inventory_movements
           WHERE movement_type IN ('sale', 'void') AND created_at >= ?
           GROUP BY inventory_item_id
         ) consumption ON consumption.inventory_item_id = i.id
         LEFT JOIN (
           SELECT inventory_item_id, MAX(created_at) AS lastPurchase
           FROM inventory_movements
           WHERE movement_type = 'purchase'
           GROUP BY inventory_item_id
         ) purchase_activity ON purchase_activity.inventory_item_id = i.id
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
         WHERE i.active = TRUE
         ORDER BY i.category, i.name"
    );
    $reorderStatement->execute([$start]);
    $reorder = [];
    $statusPriority = ['critical' => 0, 'soon' => 1, 'stable' => 2, 'no_movement' => 3];
    foreach ($reorderStatement->fetchAll() as $row) {
        $stock = (float) $row['currentStock'];
        $minimum = (float) $row['minimumStock'];
        $consumed = (float) $row['consumed'];
        $daily = $consumed / $days;
        $leadDays = (int) $row['leadTimeDays'];
        $safetyDays = (int) $row['safetyStockDays'];
        $targetDays = (int) $row['targetStockDays'];
        $packageSize = max(0.0001, (float) $row['unitsPerPackage']);
        $reorderPoint = max($minimum, $daily * ($leadDays + $safetyDays));
        $daysRemaining = $daily > 0 ? max(0.0, $stock / $daily) : null;
        $daysUntilOrder = $daily > 0
            ? max(0, (int) floor(max(0.0, $stock - $reorderPoint) / $daily))
            : null;

        if ($stock <= $minimum || ($daysRemaining !== null && $daysRemaining <= $leadDays)) {
            $status = 'critical';
        } elseif ($stock <= $reorderPoint || ($daysUntilOrder !== null && $daysUntilOrder <= 3)) {
            $status = 'soon';
        } elseif ($daily > 0) {
            $status = 'stable';
        } else {
            $status = 'no_movement';
        }

        $targetStock = max($minimum, $daily * $targetDays);
        $unitsNeeded = max(0.0, $targetStock - $stock);
        if (in_array($status, ['critical', 'soon'], true)) {
            $unitsNeeded = max($unitsNeeded, $packageSize);
        }
        $recommendedPackages = $unitsNeeded > 0 ? (int) ceil($unitsNeeded / $packageSize) : 0;
        $recommendedUnits = $recommendedPackages * $packageSize;
        $reorder[] = [
            'id' => (int) $row['id'],
            'sku' => $row['sku'],
            'name' => $row['name'],
            'category' => $row['category'],
            'unit' => $row['unit'],
            'packageName' => $row['packageName'],
            'unitsPerPackage' => $packageSize,
            'currentStock' => $stock,
            'minimumStock' => $minimum,
            'averageCost' => (float) $row['averageCost'],
            'consumed' => $consumed,
            'averageDailyConsumption' => round($daily, 4),
            'leadTimeDays' => $leadDays,
            'safetyStockDays' => $safetyDays,
            'targetStockDays' => $targetDays,
            'reorderPoint' => round($reorderPoint, 4),
            'daysRemaining' => $daysRemaining !== null ? round($daysRemaining, 1) : null,
            'daysUntilOrder' => $daysUntilOrder,
            'recommendedPackages' => $recommendedPackages,
            'recommendedUnits' => round($recommendedUnits, 4),
            'estimatedPurchaseCost' => money_round(
                $recommendedPackages > 0 && (float) $row['referencePackageCost'] > 0
                    ? $recommendedPackages * (float) $row['referencePackageCost']
                    : $recommendedUnits * (float) $row['averageCost']
            ),
            'buyOn' => $daysUntilOrder !== null
                ? (new DateTimeImmutable('today'))->modify("+{$daysUntilOrder} days")->format('Y-m-d')
                : null,
            'lastConsumption' => $row['lastConsumption'],
            'lastPurchase' => $row['lastPurchase'],
            'status' => $status,
        ];
    }
    usort($reorder, static function (array $left, array $right) use ($statusPriority): int {
        $priority = $statusPriority[$left['status']] <=> $statusPriority[$right['status']];
        if ($priority !== 0) {
            return $priority;
        }
        $leftDays = $left['daysRemaining'] ?? PHP_FLOAT_MAX;
        $rightDays = $right['daysRemaining'] ?? PHP_FLOAT_MAX;
        return $leftDays <=> $rightDays;
    });

    $criticalCount = count(array_filter($reorder, static fn (array $item): bool => $item['status'] === 'critical'));
    $reorderCount = count(array_filter($reorder, static fn (array $item): bool => in_array($item['status'], ['critical', 'soon'], true)));
    $totalRevenue = money_round($totalRevenue);
    $totalActualCost = money_round($totalActualCost);
    $grossProfit = money_round($totalRevenue - $totalActualCost);
    json_response([
        'days' => $days,
        'since' => $start,
        'summary' => [
            'revenue' => $totalRevenue,
            'actualCost' => $totalActualCost,
            'grossProfit' => $grossProfit,
            'grossMargin' => $totalRevenue > 0 ? round($grossProfit / $totalRevenue, 4) : null,
            'wasteCost' => money_round($totalWasteCost),
            'reorderCount' => $reorderCount,
            'criticalCount' => $criticalCount,
        ],
        'profitability' => $profitability,
        'waste' => $waste,
        'reorder' => $reorder,
    ]);
}
