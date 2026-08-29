<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/app/helpers.php';
require_once dirname(__DIR__) . '/app/inventory_pos.php';

function pos_test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function pos_test_money(float $expected, float $actual, string $message): void
{
    pos_test_assert(abs($expected - $actual) < 0.0001, $message . " ({$actual})");
}

$cases = [
    [[10.00, 5.00], 3.00, [8.00, 4.00]],
    [[0.05, 0.05, 0.05], 0.01, [0.05, 0.04, 0.05]],
    [[10.00, 0.00, 0.00], 5.00, [5.00, 0.00, 0.00]],
    [[7.13], 1.12, [6.01]],
];

foreach ($cases as [$lines, $discount, $expected]) {
    $actual = pos_allocate_discount($lines, $discount);
    pos_test_assert(count($actual) === count($expected), 'La asignación cambió el número de líneas.');
    foreach ($expected as $index => $value) {
        pos_test_money($value, $actual[$index], "Descuento incorrecto en la línea {$index}");
    }
    pos_test_money(
        money_round(array_sum($lines) - $discount),
        money_round(array_sum($actual)),
        'La suma de líneas no coincide con el total descontado.'
    );
}

$invalidDiscountRejected = false;
try {
    pos_allocate_discount([10.00], 10.00);
} catch (ApiError $error) {
    $invalidDiscountRejected = true;
}
pos_test_assert($invalidDiscountRejected, 'El POS aceptó un descuento igual al total.');

pos_test_money(10.00, suggested_product_price(3.00, 0.70), 'El precio sugerido cambió inesperadamente.');
pos_test_money(10.01, money_round(10.005), 'El redondeo monetario no es estable.');

$movement = inventory_movement_result(10.0, 4.0, 'waste', 3.0);
pos_test_money(-3.0, $movement['delta'], 'La merma no produjo la salida esperada.');
pos_test_money(7.0, $movement['currentStock'], 'La merma calculó una existencia incorrecta.');

$reservedStockProtected = false;
try {
    inventory_movement_result(10.0, 8.0, 'count', 7.0);
} catch (ApiError $error) {
    $reservedStockProtected = $error->status === 409;
}
pos_test_assert($reservedStockProtected, 'El conteo permitió bajar la existencia por debajo de las reservas.');

pos_test_money(1.235, pos_quantity('1.235'), 'La cantidad válida del POS cambió de precisión.');
$excessPrecisionRejected = false;
try {
    pos_quantity('1.2345');
} catch (ApiError $error) {
    $excessPrecisionRejected = true;
}
pos_test_assert($excessPrecisionRejected, 'El POS aceptó más decimales de los que almacena MySQL.');

$beerPackage = inventory_package_definition([
    'packageName' => 'Caja de 24',
    'unitsPerPackage' => 24,
]);
pos_test_assert($beerPackage['packageName'] === 'Caja de 24', 'Cambió el nombre de la presentación de cerveza.');
pos_test_money(24.0, $beerPackage['unitsPerPackage'], 'La caja de cerveza no conserva sus 24 unidades.');

$vodkaPackage = inventory_package_definition([
    'packageName' => 'Botella de 750 ml',
    'unitsPerPackage' => 750,
]);
pos_test_money(750.0, $vodkaPackage['unitsPerPackage'], 'La botella de vodka no conserva sus 750 ml.');

$beerReceipt = inventory_purchase_conversion(2, 24, 24.00);
pos_test_money(48.0, $beerReceipt['quantity'], 'Dos cajas de 24 no agregaron 48 cervezas.');
pos_test_money(1.0, $beerReceipt['unitCost'], 'El costo por cerveza no se convirtió correctamente.');

$vodkaReceipt = inventory_purchase_conversion(1, 750, 15.00);
pos_test_money(750.0, $vodkaReceipt['quantity'], 'Una botella de 750 ml no agregó 750 ml.');
pos_test_money(0.02, $vodkaReceipt['unitCost'], 'El costo por ml de vodka no se convirtió correctamente.');

$emptyPackageRejected = false;
try {
    inventory_package_definition(['packageName' => 'Caja de 24', 'unitsPerPackage' => 0]);
} catch (ApiError $error) {
    $emptyPackageRejected = true;
}
pos_test_assert($emptyPackageRejected, 'El artículo aceptó una presentación sin contenido.');

$importRow = [
    'schemaVersion' => 'nox_inventory_import_v1',
    'operation' => 'upsert_and_receive',
    'sku' => 'TEST-001',
    'name' => 'Artículo de prueba',
    'category' => 'Otros artículos',
    'unit' => 'bottle',
    'packageName' => 'Botella de 750 ml',
    'unitsPerPackage' => 1,
    'minimumStock' => 2,
    'leadTimeDays' => 3,
    'safetyStockDays' => 2,
    'targetStockDays' => 14,
    'invoiceNumber' => 'FAC-TEST-1',
    'purchasedAt' => '2026-08-28',
    'packageQuantity' => 3,
    'packageCost' => 12.50,
    'notes' => 'Prueba',
];
$normalizedImport = inventory_import_normalize([
    'sheetCount' => 1,
    'headers' => inventory_import_columns(),
    'rows' => [$importRow],
]);
pos_test_assert(!$normalizedImport['globalErrors'], 'El formato válido de importación produjo errores globales.');
pos_test_assert(!$normalizedImport['rows'][0]['errors'], 'La fila válida de importación fue rechazada.');
pos_test_money(37.50, $normalizedImport['rows'][0]['lineTotal'], 'El total de la fila importada no coincide.');
pos_test_assert($normalizedImport['rows'][0]['purchasedAt'] === '2026-08-28', 'La fecha importada cambió.');

$duplicateImport = inventory_import_normalize([
    'sheetCount' => 1,
    'headers' => inventory_import_columns(),
    'rows' => [$importRow, $importRow],
]);
pos_test_assert(
    in_array('La factura ya incluye este SKU en la fila 2.', $duplicateImport['rows'][1]['errors'], true),
    'La importación no detectó una línea duplicada en la misma factura.'
);

$secondInvoiceLine = $importRow;
$secondInvoiceLine['sku'] = 'TEST-002';
$secondInvoiceLine['name'] = 'Segundo artículo';
$secondInvoiceLine['notes'] = 'Promoción distinta para esta línea';
$differentLineNotes = inventory_import_normalize([
    'sheetCount' => 1,
    'headers' => inventory_import_columns(),
    'rows' => [$importRow, $secondInvoiceLine],
]);
pos_test_assert(!$differentLineNotes['rows'][1]['errors'], 'La importación rechazó notas distintas dentro de una factura.');

$invalidImportRow = $importRow;
$invalidImportRow['targetStockDays'] = 5;
$invalidImportRow['purchasedAt'] = '2026-02-31';
$invalidImport = inventory_import_normalize([
    'sheetCount' => 2,
    'headers' => array_values(array_diff(inventory_import_columns(), ['sku'])),
    'rows' => [$invalidImportRow],
]);
pos_test_assert(count($invalidImport['globalErrors']) === 2, 'No se detectaron la hoja adicional y el encabezado faltante.');
pos_test_assert(
    in_array('La cobertura objetivo debe superar la entrega más los días de seguridad.', $invalidImport['rows'][0]['errors'], true),
    'La importación aceptó una cobertura objetivo inválida.'
);
pos_test_assert(
    in_array('La fecha de compra no es válida.', $invalidImport['rows'][0]['errors'], true),
    'La importación aceptó una fecha inexistente.'
);

echo "POS logic tests: OK\n";
