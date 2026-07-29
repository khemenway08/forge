# Forge Server Foundation

This private `server/` directory contains Forge Version 1 server-side code that supports the WooCommerce synchronization milestone without exposing private business logic from the public document root.

## Purpose

- Hold private PHP bootstrap and server logic outside `public/`
- Provide the server-side order-storage foundation for Forge orders
- Keep browser-accessible endpoints thin

## Environment Variables

The server-side order-storage foundation reads database configuration only from:

- `FORGE_DB_DSN`
- `FORGE_DB_USER`
- `FORGE_DB_PASSWORD`
- `FORGE_STAFF_PIN_HASH`
- `FORGE_TRAY_NUMBERS`
- `FORGE_EMAIL_ENABLED`
- `FORGE_EMAIL_TRANSPORT`
- `FORGE_EMAIL_HOST`
- `FORGE_EMAIL_PORT`
- `FORGE_EMAIL_ENCRYPTION`
- `FORGE_EMAIL_USERNAME`
- `FORGE_EMAIL_PASSWORD`
- `FORGE_EMAIL_FROM_ADDRESS`
- `FORGE_EMAIL_FROM_NAME`
- `FORGE_EMAIL_REPLY_TO`
- `FORGE_EMAIL_CONNECT_TIMEOUT`
- `FORGE_EMAIL_SEND_TIMEOUT`
- `FORGE_FACEBOOK_URL`
- `FORGE_INSTAGRAM_URL`
- `FORGE_EMAIL_SIGNUP_URL`

No credentials belong in Git.

Environment variables remain the preferred configuration source whenever the hosting environment supports them.

`FORGE_STAFF_PIN_HASH` must contain a `password_hash()` output for the approved shared Staff PIN. The plain-text PIN must never be stored in Git, browser code, screenshots, or public API responses.

Private config placeholder:

```php
'FORGE_STAFF_PIN_HASH' => '$2y$...replace-with-password-hash...',
'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8,9,10,11,12',
'FORGE_EMAIL_ENABLED' => false,
'FORGE_EMAIL_TRANSPORT' => 'smtp',
'FORGE_EMAIL_HOST' => 'smtp.example.com',
'FORGE_EMAIL_PORT' => 587,
'FORGE_EMAIL_ENCRYPTION' => 'tls',
'FORGE_EMAIL_USERNAME' => 'smtp-login@example.com',
'FORGE_EMAIL_PASSWORD' => 'SMTP_ACCOUNT_PASSWORD',
'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
'FORGE_EMAIL_CONNECT_TIMEOUT' => 10,
'FORGE_EMAIL_SEND_TIMEOUT' => 20,
'FORGE_FACEBOOK_URL' => '',
'FORGE_INSTAGRAM_URL' => '',
'FORGE_EMAIL_SIGNUP_URL' => '',
```

For manual shared-hosting deployment, a private `config.php` fallback is also supported.
Environment variables take precedence over `config.php` values.

Outbound customer email uses authenticated SMTP through PHPMailer and must remain private. Composer dependencies belong only in the private runtime package and must never be deployed into `public_html`.

## SMTP Notes

- `FORGE_EMAIL_USERNAME` is the SMTP authentication login and may differ from the visible `FORGE_EMAIL_FROM_ADDRESS`.
- `FORGE_EMAIL_FROM_ADDRESS` may differ from `FORGE_EMAIL_REPLY_TO`.
- `FORGE_EMAIL_ENABLED` defaults to `false` when omitted.
- SMTP credentials, Apple Account information, and app-specific passwords must remain in private environment variables or the private `config.php` only.
- Missing or incorrect SMTP configuration must never block order creation; the order still saves and the delivery record is marked with a safe staff-visible failure.

### iCloud+ Custom Email Domain Example

Use placeholders only:

```php
'FORGE_EMAIL_ENABLED' => false,
'FORGE_EMAIL_TRANSPORT' => 'smtp',
'FORGE_EMAIL_HOST' => 'smtp.mail.me.com',
'FORGE_EMAIL_PORT' => 587,
'FORGE_EMAIL_ENCRYPTION' => 'tls',
'FORGE_EMAIL_USERNAME' => 'PRIMARY_ICLOUD_MAIL_ADDRESS',
'FORGE_EMAIL_PASSWORD' => 'APPLE_APP_SPECIFIC_PASSWORD',
'FORGE_EMAIL_FROM_ADDRESS' => 'orders@thehilltopshop.com',
'FORGE_EMAIL_FROM_NAME' => 'The Hilltop Shop',
'FORGE_EMAIL_REPLY_TO' => 'orders@thehilltopshop.com',
'FORGE_FACEBOOK_URL' => '',
'FORGE_INSTAGRAM_URL' => '',
'FORGE_EMAIL_SIGNUP_URL' => '',
```

For iCloud+ Custom Email Domain setups, the SMTP username may be the primary iCloud Mail address associated with the Apple Account, while the visible `From` and `Reply-To` addresses may remain `orders@thehilltopshop.com`. Apple requires an app-specific password for SMTP authentication.

## Optional Customer Email Footer Links

The branded customer order-confirmation email can show up to three optional buttons in a visually secondary footer:

- `FORGE_FACEBOOK_URL`
- `FORGE_INSTAGRAM_URL`
- `FORGE_EMAIL_SIGNUP_URL`

Rules:

- Each value must be a valid `http` or `https` URL to render.
- Empty, missing, or invalid URLs are omitted cleanly.
- `FORGE_EMAIL_SIGNUP_URL` must point to a public signup page or form and must never subscribe customers automatically.
- The order-confirmation details remain the dominant content; the optional footer is secondary.

## Email Rollout Sequence

1. Deploy with `FORGE_EMAIL_ENABLED=false`.
2. Configure the private SMTP credentials and visible `From` / `Reply-To` addresses.
3. Run `php server/cli/smoke-test-email.php --to TEST_RECIPIENT@example.com` from PHP CLI on the private host.
4. Set `FORGE_EMAIL_ENABLED=true`.
5. Verify health, then confirm new staff orders begin showing `Sent`, `Pending`, `Failed`, or `Skipped/Test` as expected.

## Document Root

`public/` contents are deployed to the Forge document root. The files under `server/` must stay outside the browser-addressable `public_html` document root when deployed correctly.

For deployment, use a layout similar to:

```text
<domain-root>/public_html/forge
<domain-root>/forge_server_test
```

The private server bootstrap may be resolved through:

- `FORGE_SERVER_ROOT` pointing at the private server directory
- The current local repository sibling layout
- A private sibling test directory such as `<domain-root>/forge_server_test`

This deployment path remains for non-production testing only.

## Private Config Fallback

When environment variables are unavailable, copy `config.example.php` manually to the private server directory as `config.php`.

Rules:

- `config.php` must remain outside `public_html`
- `config.php` is ignored by Git
- `config.example.php` contains placeholders only
- Never send or paste the database password into chat, screenshots, GitHub, or browser-visible files

## Apply the Migration

After configuring a non-production MySQL database, apply:

```bash
mysql --database YOUR_NON_PRODUCTION_DATABASE < server/migrations/001_create_forge_orders.sql
mysql --database YOUR_NON_PRODUCTION_DATABASE < server/migrations/002_add_production_trays.sql
```

This phase does not create WooCommerce orders and does not connect browser submission to the server yet.

## Configure Production Trays

Set `FORGE_TRAY_NUMBERS` in the private hosting environment or private `config.php` using a comma-separated list of positive tray numbers:

```php
'FORGE_TRAY_NUMBERS' => '1,2,3,4,5,6,7,8,9,10,11,12',
```

The tray repository seeds missing tray rows idempotently from this private configuration the first time staff loads trays or assigns a tray. Existing tray rows are preserved, and tray numbers are never derived from array position.

## Run the PHP Tests

When PHP is available:

```bash
php server/tests/run.php
```

## Test the Endpoint After Database Setup

Once a non-production database is configured and the environment variables are set, start a local PHP server from the repository root:

```bash
php -S 127.0.0.1:8080 -t public
```

Then send a fixture request:

```bash
curl -i \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  --data @path/to/forge-order-fixture.json \
  http://127.0.0.1:8080/api/v1/orders.php
```

Production deployment is not approved yet.

## Staff Authentication Foundation

The shared Staff PIN foundation uses:

- PHP sessions
- `HttpOnly` session cookies
- `Secure` cookies when the request is HTTPS
- `SameSite=Strict` because the hosted Forge app and API are same-site and do not require cross-site staff login flows
- `password_verify()` against the private `FORGE_STAFF_PIN_HASH`

Authenticated staff endpoints currently include:

- `POST /api/v1/staff/login.php`
- `POST /api/v1/staff/logout.php`
- `GET /api/v1/staff/session.php`
- `GET /api/v1/staff/orders.php`

The staff orders endpoint is intentionally not public and always requires an authenticated session.

## Safe Shared-Hosting Hash Generation

Generate the staff PIN hash interactively on the private host without placing the chosen PIN directly into shell history:

```bash
read -s -p "Staff PIN: " FORGE_PIN; echo
FORGE_PIN="$FORGE_PIN" php -r 'echo password_hash(getenv("FORGE_PIN"), PASSWORD_DEFAULT), PHP_EOL;'
unset FORGE_PIN
```

Copy only the resulting hash into the private server `config.php` or private environment configuration. Do not store the plain-text PIN in shell scripts, Git, browser code, or screenshots.
