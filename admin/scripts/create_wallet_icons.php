<?php
declare(strict_types=1);

if (!extension_loaded('gd')) {
    fwrite(STDERR, "La extensión GD de PHP es necesaria para generar los iconos.\n");
    exit(1);
}

$outputDirectory = dirname(__DIR__) . '/public/assets/wallet';
if (!is_dir($outputDirectory) && !mkdir($outputDirectory, 0755, true) && !is_dir($outputDirectory)) {
    fwrite(STDERR, "No fue posible crear {$outputDirectory}.\n");
    exit(1);
}

foreach ([29 => 'icon.png', 58 => 'icon@2x.png'] as $size => $filename) {
    $image = imagecreatetruecolor($size, $size);
    imagealphablending($image, true);
    imagesavealpha($image, true);
    $black = imagecolorallocate($image, 5, 5, 5);
    $gold = imagecolorallocate($image, 216, 183, 93);
    imagefilledrectangle($image, 0, 0, $size, $size, $black);

    $scale = $size / 64;
    imagesetthickness($image, max(1, (int) round(2.25 * $scale)));
    imageellipse(
        $image,
        (int) round(23.5 * $scale),
        (int) round(32 * $scale),
        (int) round(36 * $scale),
        (int) round(36 * $scale),
        $gold
    );
    imageellipse(
        $image,
        (int) round(40.5 * $scale),
        (int) round(32 * $scale),
        (int) round(36 * $scale),
        (int) round(36 * $scale),
        $gold
    );

    if (!imagepng($image, $outputDirectory . '/' . $filename, 9)) {
        fwrite(STDERR, "No fue posible escribir {$filename}.\n");
        exit(1);
    }
}

fwrite(STDOUT, "Iconos de Apple Wallet generados.\n");
