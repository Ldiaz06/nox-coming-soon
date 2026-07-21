<?php
declare(strict_types=1);

// Physical health endpoint for Apache installations where URL rewriting is
// disabled by the hosting provider.
$_GET['api_path'] = 'health';
require dirname(__DIR__, 2) . '/index.php';
