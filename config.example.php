<?php
declare(strict_types=1);

/*
 * Safe to commit: this template contains no working credentials or password.
 * Copy THIS FILE to public_html/../hub-private.php on the hosting server.
 * Do not overwrite config.php: config.php is the application's configuration loader.
 * For a subdirectory deployment, use environment bindings or adjust the loader
 * to a path outside the document root; see DEPLOYMENT.md before deploying.
 * Fill values only in the private copy, never in this example or the loader.
 */
return [
    // PHP on the same Hostinger plan connects locally, not to a remote DB hostname.
    'HUB_DB_HOST' => 'localhost',
    'HUB_DB_PORT' => '3306',
    // Use the full hPanel names, including the account prefix.
    'HUB_DB_NAME' => '',
    'HUB_DB_USER' => '',
    'HUB_DB_PASSWORD' => '',
    // Output of PHP password_hash(). Never enter the plaintext website password.
    'HUB_PASSWORD_HASH' => '',
    // Example format only: https://your-name.hostingersite.com (no trailing slash).
    // The real origin contains no path, even if the app lives under /hub/.
    'HUB_ORIGIN' => '',
    'HUB_COOKIE_SECURE' => '1',
    // Optional until Drive is enabled: deployed Apps Script /exec URL and token.
    'HUB_DRIVE_URL' => '',
    'HUB_DRIVE_TOKEN' => '',
];
