<?php
declare(strict_types=1);

function workforce_employees(array $params = [])
{
    require_roles(['admin', 'supervisor']);
    $rows = db()->query(
        'SELECT e.id, e.user_id AS userId, e.employee_code AS code, e.full_name AS fullName,
                e.position_name AS position, e.pay_type AS payType, e.hourly_rate AS hourlyRate,
                e.monthly_salary AS monthlySalary, e.overtime_multiplier AS overtimeMultiplier,
                e.hired_on AS hiredOn, e.status, u.role
         FROM employees e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.full_name'
    )->fetchAll();
    json_response(['employees' => $rows]);
}

function workforce_employee_create(array $params = [])
{
    require_csrf();
    require_roles(['admin']);
    $body = request_body();
    $userId = isset($body['userId']) && $body['userId'] !== null ? value_id($body, 'userId') : null;
    $code = value_string($body, 'code', 1, 40) ?? '';
    $name = value_string($body, 'fullName', 3, 160) ?? '';
    $position = value_string($body, 'position', 2, 100) ?? '';
    $payType = require_choice($body['payType'] ?? '', ['hourly', 'monthly'], 'payType');
    $hourly = value_number($body, 'hourlyRate', 0);
    $monthly = value_number($body, 'monthlySalary', 0);
    $multiplier = value_number($body, 'overtimeMultiplier', 1, 5);
    $hiredOn = value_string($body, 'hiredOn', 0, 10, false);
    try {
        $statement = db()->prepare(
            'INSERT INTO employees
               (user_id, employee_code, full_name, position_name, pay_type, hourly_rate, monthly_salary, overtime_multiplier, hired_on)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $statement->execute([$userId, $code, $name, $position, $payType, $hourly, $monthly, $multiplier, $hiredOn]);
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') throw new ApiError('El código o usuario ya está asignado.', 409);
        throw $error;
    }
    json_response(['id' => (int) db()->lastInsertId()], 201);
}

function workforce_clock(array $params = [])
{
    $user = require_auth();
    $employee = db()->prepare("SELECT id FROM employees WHERE user_id = ? AND status = 'active'");
    $employee->execute([$user['id']]);
    $employeeId = $employee->fetchColumn();
    if (!$employeeId) json_response(['employee' => null, 'openEntry' => null]);
    $entry = db()->prepare(
        "SELECT id, clock_in AS clockIn, clock_out AS clockOut, break_minutes AS breakMinutes, status
         FROM time_entries WHERE employee_id = ? AND status = 'open' ORDER BY clock_in DESC LIMIT 1"
    );
    $entry->execute([$employeeId]);
    json_response(['employee' => ['id' => (int) $employeeId], 'openEntry' => $entry->fetch() ?: null]);
}

function workforce_clock_in(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $id = transaction(function (PDO $pdo) use ($user): int {
        $employee = $pdo->prepare("SELECT id FROM employees WHERE user_id = ? AND status = 'active' FOR UPDATE");
        $employee->execute([$user['id']]);
        $employeeId = $employee->fetchColumn();
        if (!$employeeId) throw new ApiError('Su usuario no está vinculado a un empleado activo.', 409);
        $open = $pdo->prepare("SELECT id FROM time_entries WHERE employee_id = ? AND status = 'open' FOR UPDATE");
        $open->execute([$employeeId]);
        if ($open->fetch()) throw new ApiError('Ya tiene una jornada abierta.', 409);
        $pdo->prepare('INSERT INTO time_entries (employee_id, clock_in) VALUES (?, NOW())')->execute([$employeeId]);
        $id = (int) $pdo->lastInsertId();
        audit_log($pdo, $user, 'clock_in', 'time_entry', $id);
        return $id;
    });
    json_response(['id' => $id], 201);
}

function workforce_clock_out(array $params = [])
{
    require_csrf();
    $user = require_auth();
    $body = request_body();
    $break = isset($body['breakMinutes']) ? (int) value_number($body, 'breakMinutes', 0, 720) : 0;
    $notes = value_string($body, 'notes', 0, 300, false);
    transaction(function (PDO $pdo) use ($user, $break, $notes): void {
        $employee = $pdo->prepare("SELECT id FROM employees WHERE user_id = ? AND status = 'active'");
        $employee->execute([$user['id']]);
        $employeeId = $employee->fetchColumn();
        if (!$employeeId) throw new ApiError('Empleado no encontrado.', 404);
        $entry = $pdo->prepare("SELECT id FROM time_entries WHERE employee_id = ? AND status = 'open' ORDER BY clock_in DESC LIMIT 1 FOR UPDATE");
        $entry->execute([$employeeId]);
        $entryId = $entry->fetchColumn();
        if (!$entryId) throw new ApiError('No tiene una jornada abierta.', 409);
        $pdo->prepare("UPDATE time_entries SET clock_out = NOW(), break_minutes = ?, notes = ?, status = 'submitted' WHERE id = ?")
            ->execute([$break, $notes, $entryId]);
        audit_log($pdo, $user, 'clock_out', 'time_entry', (int) $entryId);
    });
    no_content();
}

function workforce_hours(array $params = [])
{
    $user = require_auth();
    $today = date('Y-m-d');
    $start = isset($_GET['start']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $_GET['start']) ? (string) $_GET['start'] : date('Y-m-01');
    $end = isset($_GET['end']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $_GET['end']) ? (string) $_GET['end'] : $today;
    $sql = "SELECT t.id, e.id AS employeeId, e.full_name AS employeeName, t.clock_in AS clockIn, t.clock_out AS clockOut,
                   t.break_minutes AS breakMinutes, t.status,
                   CASE WHEN t.clock_out IS NULL THEN NULL
                        ELSE ROUND(GREATEST(TIMESTAMPDIFF(MINUTE, t.clock_in, t.clock_out) - t.break_minutes, 0) / 60, 2) END AS hours
            FROM time_entries t JOIN employees e ON e.id = t.employee_id
            WHERE t.clock_in >= ? AND t.clock_in < DATE_ADD(?, INTERVAL 1 DAY) ";
    $values = [$start, $end];
    if ($user['role'] === 'cashier') {
        $sql .= 'AND e.user_id = ? ';
        $values[] = $user['id'];
    }
    $sql .= 'ORDER BY t.clock_in DESC';
    $statement = db()->prepare($sql);
    $statement->execute($values);
    json_response(['entries' => $statement->fetchAll()]);
}

function workforce_hours_approve(array $params)
{
    require_csrf();
    $user = require_roles(['admin', 'supervisor']);
    $id = path_id($params);
    $statement = db()->prepare("UPDATE time_entries SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ? AND status = 'submitted'");
    $statement->execute([$user['id'], $id]);
    if ($statement->rowCount() < 1) throw new ApiError('La marcación no está pendiente de aprobación.', 409);
    no_content();
}

function payroll_periods(array $params = [])
{
    require_roles(['admin']);
    $rows = db()->query(
        'SELECT p.id, p.period_type AS type, p.starts_on AS startsOn, p.ends_on AS endsOn, p.status,
                p.approved_at AS approvedAt, p.paid_at AS paidAt,
                COALESCE(SUM(e.gross_pay), 0) AS grossTotal, COALESCE(SUM(e.net_pay), 0) AS netTotal
         FROM payroll_periods p LEFT JOIN payroll_entries e ON e.payroll_period_id = p.id
         GROUP BY p.id ORDER BY p.starts_on DESC'
    )->fetchAll();
    json_response(['periods' => $rows]);
}

function payroll_period_create(array $params = [])
{
    require_csrf();
    $user = require_roles(['admin']);
    $body = request_body();
    $type = require_choice($body['type'] ?? '', ['biweekly', 'monthly'], 'type');
    $start = value_string($body, 'startsOn', 10, 10) ?? '';
    $end = value_string($body, 'endsOn', 10, 10) ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || $start > $end) {
        throw new ApiError('Las fechas del período son inválidas.');
    }
    try {
        $statement = db()->prepare('INSERT INTO payroll_periods (period_type, starts_on, ends_on, created_by) VALUES (?, ?, ?, ?)');
        $statement->execute([$type, $start, $end, $user['id']]);
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') throw new ApiError('Ese período de planilla ya existe.', 409);
        throw $error;
    }
    json_response(['id' => (int) db()->lastInsertId()], 201);
}

function payroll_calculate(array $params)
{
    require_csrf();
    $user = require_roles(['admin']);
    $periodId = path_id($params);
    $result = transaction(function (PDO $pdo) use ($user, $periodId): array {
        $periodStatement = $pdo->prepare('SELECT * FROM payroll_periods WHERE id = ? FOR UPDATE');
        $periodStatement->execute([$periodId]);
        $period = $periodStatement->fetch();
        if (!$period) throw new ApiError('Período no encontrado.', 404);
        if (!in_array($period['status'], ['draft', 'calculated'], true)) throw new ApiError('La planilla aprobada o pagada no puede recalcularse.', 409);
        $pdo->prepare('DELETE FROM payroll_entries WHERE payroll_period_id = ?')->execute([$periodId]);
        $employees = $pdo->prepare(
            "SELECT e.id, e.pay_type, e.hourly_rate, e.monthly_salary, e.overtime_multiplier,
                    COALESCE(SUM(GREATEST(TIMESTAMPDIFF(MINUTE, t.clock_in, t.clock_out) - t.break_minutes, 0)) / 60, 0) AS total_hours
             FROM employees e LEFT JOIN time_entries t ON t.employee_id = e.id AND t.status = 'approved'
               AND t.clock_in >= ? AND t.clock_in < DATE_ADD(?, INTERVAL 1 DAY)
             WHERE e.status = 'active' GROUP BY e.id"
        );
        $employees->execute([$period['starts_on'], $period['ends_on']]);
        $rows = $employees->fetchAll();
        $limit = $period['period_type'] === 'biweekly' ? 80.0 : 160.0;
        $grossTotal = 0.0;
        $insert = $pdo->prepare(
            'INSERT INTO payroll_entries
               (payroll_period_id, employee_id, regular_hours, overtime_hours, base_pay, overtime_pay, gross_pay, net_pay)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($rows as $employee) {
            $totalHours = (float) $employee['total_hours'];
            $regular = min($totalHours, $limit);
            $overtime = max($totalHours - $limit, 0);
            $hourly = $employee['pay_type'] === 'hourly' ? (float) $employee['hourly_rate'] : (float) $employee['monthly_salary'] / 208;
            $basePay = $employee['pay_type'] === 'hourly'
                ? $regular * $hourly
                : (float) $employee['monthly_salary'] * ($period['period_type'] === 'biweekly' ? 0.5 : 1);
            $overtimePay = $overtime * $hourly * (float) $employee['overtime_multiplier'];
            $gross = money_round($basePay + $overtimePay);
            $insert->execute([$periodId, $employee['id'], $regular, $overtime, $basePay, $overtimePay, $gross, $gross]);
            $grossTotal += $gross;
        }
        $pdo->prepare("UPDATE payroll_periods SET status = 'calculated' WHERE id = ?")->execute([$periodId]);
        audit_log($pdo, $user, 'calculate', 'payroll_period', $periodId, null, ['employees' => count($rows), 'grossTotal' => $grossTotal]);
        return ['employees' => count($rows), 'grossTotal' => money_round($grossTotal), 'netTotal' => money_round($grossTotal)];
    });
    json_response($result);
}

function payroll_entries(array $params)
{
    require_roles(['admin']);
    $periodId = path_id($params);
    $statement = db()->prepare(
        'SELECT pe.id, pe.employee_id AS employeeId, e.full_name AS employeeName,
                pe.regular_hours AS regularHours, pe.overtime_hours AS overtimeHours,
                pe.base_pay AS basePay, pe.overtime_pay AS overtimePay, pe.bonuses,
                pe.deductions, pe.gross_pay AS grossPay, pe.net_pay AS netPay, pe.notes
         FROM payroll_entries pe JOIN employees e ON e.id = pe.employee_id
         WHERE pe.payroll_period_id = ? ORDER BY e.full_name'
    );
    $statement->execute([$periodId]);
    json_response(['entries' => $statement->fetchAll()]);
}

function payroll_entry_update(array $params)
{
    require_csrf();
    $user = require_roles(['admin']);
    $entryId = path_id($params);
    $body = request_body();
    $bonuses = value_number($body, 'bonuses', 0);
    $deductions = value_number($body, 'deductions', 0);
    $notes = value_string($body, 'notes', 0, 500, false);
    transaction(function (PDO $pdo) use ($user, $entryId, $bonuses, $deductions, $notes): void {
        $statement = $pdo->prepare(
            'SELECT pe.*, pp.status FROM payroll_entries pe JOIN payroll_periods pp ON pp.id = pe.payroll_period_id
             WHERE pe.id = ? FOR UPDATE'
        );
        $statement->execute([$entryId]);
        $entry = $statement->fetch();
        if (!$entry) throw new ApiError('Registro no encontrado.', 404);
        if ($entry['status'] !== 'calculated') throw new ApiError('Solo puede ajustar una planilla calculada.', 409);
        $gross = money_round((float) $entry['base_pay'] + (float) $entry['overtime_pay'] + $bonuses);
        $net = max(money_round($gross - $deductions), 0);
        $pdo->prepare('UPDATE payroll_entries SET bonuses = ?, deductions = ?, gross_pay = ?, net_pay = ?, notes = ? WHERE id = ?')
            ->execute([$bonuses, $deductions, $gross, $net, $notes, $entryId]);
        audit_log($pdo, $user, 'adjust', 'payroll_entry', $entryId, null, compact('bonuses', 'deductions', 'net'));
    });
    no_content();
}

function payroll_approve(array $params)
{
    require_csrf();
    $user = require_roles(['admin']);
    $periodId = path_id($params);
    $statement = db()->prepare("UPDATE payroll_periods SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ? AND status = 'calculated'");
    $statement->execute([$user['id'], $periodId]);
    if ($statement->rowCount() < 1) throw new ApiError('La planilla debe estar calculada antes de aprobarse.', 409);
    no_content();
}
