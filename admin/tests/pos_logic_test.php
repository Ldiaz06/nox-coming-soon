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

echo "POS logic tests: OK\n";
