<?php
declare(strict_types=1);

add_route('POST', 'auth/login', 'auth_login');
add_route('POST', 'auth/logout', 'auth_logout');
add_route('GET', 'auth/me', 'auth_me');

add_route('GET', 'users', 'users_list');
add_route('POST', 'users', 'users_create');
add_route('PATCH', 'users/{id}', 'users_update');

add_route('GET', 'inventory/items', 'inventory_items');
add_route('POST', 'inventory/items', 'inventory_item_create');
add_route('POST', 'inventory/products', 'inventory_product_create');
add_route('POST', 'inventory/movements', 'inventory_movement_create');
add_route('GET', 'inventory/movements', 'inventory_movements');
add_route('POST', 'inventory/purchases', 'inventory_purchase_create');

add_route('GET', 'pos/products', 'pos_products');
add_route('GET', 'pos/sales', 'pos_sales');
add_route('POST', 'pos/sales', 'pos_sale_create');
add_route('POST', 'pos/sales/{id}/void', 'pos_sale_void');

add_route('GET', 'cash/terminals', 'cash_terminals');
add_route('GET', 'cash/sessions', 'cash_sessions');
add_route('POST', 'cash/sessions/open', 'cash_open');
add_route('POST', 'cash/sessions/{id}/close', 'cash_close');

add_route('GET', 'reports/summary', 'reports_summary');
add_route('GET', 'reports/low-stock', 'reports_low_stock');

add_route('GET', 'workforce/employees', 'workforce_employees');
add_route('POST', 'workforce/employees', 'workforce_employee_create');
add_route('GET', 'workforce/clock', 'workforce_clock');
add_route('POST', 'workforce/clock/in', 'workforce_clock_in');
add_route('POST', 'workforce/clock/out', 'workforce_clock_out');
add_route('GET', 'workforce/hours', 'workforce_hours');
add_route('POST', 'workforce/hours/{id}/approve', 'workforce_hours_approve');

add_route('GET', 'payroll/periods', 'payroll_periods');
add_route('POST', 'payroll/periods', 'payroll_period_create');
add_route('POST', 'payroll/periods/{id}/calculate', 'payroll_calculate');
add_route('GET', 'payroll/periods/{id}/entries', 'payroll_entries');
add_route('PATCH', 'payroll/entries/{id}', 'payroll_entry_update');
add_route('POST', 'payroll/periods/{id}/approve', 'payroll_approve');

add_route('GET', 'health', static function () {
    db()->query('SELECT 1');
    json_response(['ok' => true, 'service' => 'nox-admin-php']);
});
