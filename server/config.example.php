<?php
declare(strict_types=1);

/*
 * Copy this file manually to the private server directory as config.php.
 * Do not place config.php inside public_html or commit it to Git.
 * Replace these placeholder values only on the private hosting environment.
 */
return [
    'FORGE_DB_DSN' => 'mysql:host=localhost;dbname=DATABASE_NAME;charset=utf8mb4',
    'FORGE_DB_USER' => 'DATABASE_USER',
    'FORGE_DB_PASSWORD' => 'DATABASE_PASSWORD',
    'FORGE_STAFF_PIN_HASH' => '$2y$...replace-with-password-hash...',
    'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8,9,10,11,12',
];
