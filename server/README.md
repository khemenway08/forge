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

No credentials belong in Git.

Environment variables remain the preferred configuration source whenever the hosting environment supports them.

For manual shared-hosting deployment, a private `config.php` fallback is also supported.
Environment variables take precedence over `config.php` values.

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
```

This phase does not create WooCommerce orders and does not connect browser submission to the server yet.

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
