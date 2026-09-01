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

foreach (['cash', 'card', 'yappy'] as $method) {
    $payments = pos_payment_entries([['method' => $method, 'amount' => 5.50, 'reference' => null]]);
    pos_test_assert($payments[0]['method'] === $method, "El POS rechazó el método de pago {$method}.");
    pos_test_money(5.50, $payments[0]['amount'], "El POS cambió el monto para {$method}.");
}
$splitPayments = pos_payment_entries([
    ['method' => 'cash', 'amount' => 2.00, 'reference' => null],
    ['method' => 'card', 'amount' => 2.00, 'reference' => 'AUTH-1'],
    ['method' => 'yappy', 'amount' => 1.50, 'reference' => 'YAPPY-1'],
]);
pos_test_assert(count($splitPayments) === 3, 'El POS rechazó un pago combinado con los tres métodos.');
$duplicatePaymentRejected = false;
try {
    pos_payment_entries([
        ['method' => 'card', 'amount' => 3.00],
        ['method' => 'card', 'amount' => 2.50],
    ]);
} catch (ApiError $error) {
    $duplicatePaymentRejected = true;
}
pos_test_assert($duplicatePaymentRejected, 'El POS aceptó un método de pago duplicado.');

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

$productImportRow = [
    'schemaVersion' => 'nox_product_import_v1',
    'operation' => 'create',
    'productSku' => 'HBL-TEST',
    'productName' => 'Highball de prueba',
    'category' => 'Highballs',
    'barcode' => '',
    'active' => true,
    'taxRate' => 0.10,
    'targetMargin' => 0.70,
    'minimumPrice' => 8,
    'roundingIncrement' => 1,
    'component1Sku' => 'VOD-TEST',
    'component1Quantity' => 50,
    'component1UnitCost' => 0.02,
    'component2Sku' => 'SODA-TEST',
    'component2Quantity' => 1,
    'component2UnitCost' => 0.85,
    'component3Sku' => '',
    'component3Quantity' => '',
    'component3UnitCost' => '',
    'estimatedRecipeCost' => 1.85,
    'pricingBasisCost' => 1.85,
    'salePrice' => 8,
    'customerPriceWithTax' => 8.80,
    'estimatedGrossMargin' => 0.7688,
    'notes' => 'Prueba',
    'taxSourceUrl' => 'https://dgi.mef.gob.pa/itbms/Itbms',
    'sourceInventoryFile' => 'inventario.xlsx',
];
$normalizedProducts = product_import_normalize([
    'sheetCount' => 1,
    'headers' => product_import_columns(),
    'rows' => [$productImportRow],
]);
pos_test_assert(!$normalizedProducts['globalErrors'], 'El formato válido de productos produjo errores globales.');
pos_test_assert(!$normalizedProducts['rows'][0]['errors'], 'El producto válido de importación fue rechazado.');
pos_test_assert(count($normalizedProducts['rows'][0]['components']) === 2, 'La receta importada perdió componentes.');
pos_test_money(8.80, $normalizedProducts['rows'][0]['customerPriceWithTax'], 'El precio final importado cambió.');

$invalidProductImportRow = $productImportRow;
$invalidProductImportRow['customerPriceWithTax'] = 8.00;
$invalidProductImportRow['component2Sku'] = 'VOD-TEST';
$invalidProducts = product_import_normalize([
    'sheetCount' => 1,
    'headers' => product_import_columns(),
    'rows' => [$invalidProductImportRow, $productImportRow],
]);
pos_test_assert(
    in_array('El precio final con impuesto no coincide con el precio de venta y la tasa indicada.', $invalidProducts['rows'][0]['errors'], true),
    'La importación aceptó un precio final incoherente.'
);
pos_test_assert(
    in_array('La receta repite el mismo artículo.', $invalidProducts['rows'][0]['errors'], true),
    'La importación aceptó un artículo repetido en la receta.'
);
pos_test_assert(
    in_array('El SKU repite la fila 2.', $invalidProducts['rows'][1]['errors'], true),
    'La importación no detectó un SKU de producto duplicado.'
);

echo "POS logic tests: OK\n";
