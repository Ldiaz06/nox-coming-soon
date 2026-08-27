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

echo "POS logic tests: OK\n";
