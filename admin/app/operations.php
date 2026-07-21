<?php
declare(strict_types=1);

function cash_terminals(array $params = [])
{
    require_auth();
    $rows = db()->query("SELECT id, name, location_name AS locationName FROM terminals WHERE status = 'active' ORDER BY name")->fetchAll();
    json_response(['terminals' => $rows]);
}

function cash_sessions(array $params = [])
{
    $user = require_auth();
    $sql = "SELECT c.id, c.terminal_id AS terminalId, t.name AS terminalName, c.opening_amount AS openingAmount,
                   c.expected_cash AS expectedCash, c.counted_cash AS countedCash, c.cash_difference AS cashDifference,
                   c.status, c.opened_at AS openedAt, c.closed_at AS closedAt, u.full_name AS openedBy
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
        $terminal = $pdo->prepare("SELECT id FROM terminals WHERE id = ? AND status = 'active' FOR UPDATE");
        $terminal->execute([$terminalId]);
        if (!$terminal->fetch()) throw new ApiError('Terminal inválida.', 404);
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
