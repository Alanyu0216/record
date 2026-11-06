<?php
declare(strict_types=1);

/* Production values belong in environment variables or ../hub-private.php,
 * outside public_html. This file never contains a working default password. */
$privateFile = dirname(__DIR__) . '/hub-private.php';
$private = is_file($privateFile) ? require $privateFile : [];
if (!is_array($private)) {
    throw new RuntimeException('Private configuration must return an array.');
}
$get = static function (string $name, string $default = '') use ($private): string {
    $value = getenv($name);
    return $value !== false ? $value : (string) ($private[$name] ?? $default);
};

return [
    'db_host' => $get('HUB_DB_HOST', 'localhost'),
    'db_port' => $get('HUB_DB_PORT', '3306'),
    'db_name' => $get('HUB_DB_NAME'),
    'db_user' => $get('HUB_DB_USER'),
    'db_password' => $get('HUB_DB_PASSWORD'),
    'password_hash' => $get('HUB_PASSWORD_HASH'),
    // Exact website origin; no trailing slash. Example: https://example.hostingersite.com
    'origin' => rtrim($get('HUB_ORIGIN'), '/'),
    'cookie_secure' => $get('HUB_COOKIE_SECURE', '1') !== '0',
    'session_seconds' => 30 * 24 * 60 * 60,
    'drive_url' => $get('HUB_DRIVE_URL'),
    'drive_token' => $get('HUB_DRIVE_TOKEN'),
    'max_image_bytes' => 3 * 1024 * 1024,
];
