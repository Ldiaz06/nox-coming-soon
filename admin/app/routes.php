<?php
declare(strict_types=1);

add_route('POST', 'auth/login', 'auth_login');
add_route('POST', 'auth/logout', 'auth_logout');
add_route('GET', 'auth/me', 'auth_me');

if (function_exists('events_list')) {
    add_route('GET', 'events', 'events_list');
    add_route('POST', 'events', 'events_create');
    add_route('GET', 'events/{id}', 'events_detail');
    add_route('PATCH', 'events/{id}', 'events_update');
    add_route('DELETE', 'events/{id}', 'events_delete');
    add_route('PATCH', 'events/{id}/status', 'events_status_update');
    add_route('POST', 'events/{id}/guests', 'event_guests_create');
    add_route('POST', 'events/{id}/guests/import', 'event_guests_import');
    add_route('POST', 'event-guests/{id}/reissue', 'event_guests_reissue');
    add_route('PATCH', 'event-guests/{id}/status', 'event_guests_status_update');
    add_route('POST', 'access/scan', 'access_scan');
}

if (function_exists('public_invitation_lookup')) {
    add_route('POST', 'public/invitations/lookup', 'public_invitation_lookup');
    add_route('POST', 'public/invitations/apple-wallet', 'public_invitation_apple_wallet');
    add_route('POST', 'public/invitations/google-wallet', 'public_invitation_google_wallet');
}

add_route('GET', 'users', 'users_list');
add_route('POST', 'users', 'users_create');
add_route('PATCH', 'users/{id}', 'users_update');

add_route('GET', 'inventory/items', 'inventory_items');
add_route('GET', 'inventory/item-options', 'inventory_item_options');
add_route('POST', 'inventory/items', 'inventory_item_create');
add_route('PATCH', 'inventory/items/{id}', 'inventory_item_update');
add_route('GET', 'inventory/products', 'inventory_products');
add_route('POST', 'inventory/products', 'inventory_product_create');
add_route('PATCH', 'inventory/products/{id}', 'inventory_product_update');
add_route('POST', 'inventory/products/{id}/image', 'inventory_product_image_upload');
add_route('POST', 'inventory/movements', 'inventory_movement_create');
add_route('GET', 'inventory/movements', 'inventory_movements');
add_route('POST', 'inventory/purchases', 'inventory_purchase_create');

add_route('GET', 'pos/products', 'pos_products');
add_route('GET', 'pos/tabs', 'pos_tabs');
add_route('POST', 'pos/tabs', 'pos_tab_create');
add_route('GET', 'pos/tabs/{id}', 'pos_tab_detail');
add_route('POST', 'pos/tabs/{id}/items', 'pos_tab_item_set');
add_route('POST', 'pos/tabs/{id}/clear', 'pos_tab_clear');
add_route('GET', 'pos/sales', 'pos_sales');
add_route('POST', 'pos/sales', 'pos_sale_create');
add_route('POST', 'pos/sales/{id}/void', 'pos_sale_void');

add_route('GET', 'cash/terminals', 'cash_terminals');
add_route('GET', 'cash/sessions', 'cash_sessions');
add_route('POST', 'cash/sessions/open', 'cash_open');
add_route('POST', 'cash/sessions/{id}/close', 'cash_close');

add_route('GET', 'reports/summary', 'reports_summary');
add_route('GET', 'reports/low-stock', 'reports_low_stock');
add_route('GET', 'reports/inventory-intelligence', 'reports_inventory_intelligence');

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
    try {
        db()->query('SELECT 1');
        json_response(['ok' => true, 'service' => 'nox-admin-php']);
    } catch (Throwable $error) {
        error_log($error->__toString());
        json_response([
            'ok' => false,
            'service' => 'nox-admin-php',
            'diagnostic' => database_health_diagnostic($error),
        ], 503);
    }
});
