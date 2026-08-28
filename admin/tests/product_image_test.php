<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/app/helpers.php';
require_once dirname(__DIR__) . '/app/inventory_pos.php';

if (!extension_loaded('gd') || !function_exists('imagewebp')) {
    fwrite(STDERR, "Product image tests require GD with WebP support.\n");
    exit(1);
}

$source = tempnam(sys_get_temp_dir(), 'nox-image-source-');
$destination = tempnam(sys_get_temp_dir(), 'nox-image-output-');
if ($source === false || $destination === false) {
    throw new RuntimeException('No fue posible crear archivos temporales.');
}

try {
    $image = imagecreatetruecolor(1200, 800);
    $background = imagecolorallocate($image, 20, 10, 30);
    $center = imagecolorallocate($image, 220, 180, 70);
    imagefill($image, 0, 0, $background);
    imagefilledrectangle($image, 400, 0, 799, 799, $center);
    imagepng($image, $source);
    if (is_resource($image)) imagedestroy($image);

    $info = getimagesize($source);
    normalize_product_image_to_webp($source, $destination, $info);
    $result = getimagesize($destination);
    if ($result === false || $result[0] !== 768 || $result[1] !== 768 || ($result['mime'] ?? '') !== 'image/webp') {
        throw new RuntimeException('La imagen no quedó normalizada a WebP de 768 × 768 px.');
    }
    echo "Product image tests: OK\n";
} finally {
    @unlink($source);
    @unlink($destination);
}
