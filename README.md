# Forge Starter Build

This repository now includes the active Forge Version 1 customer and staff workflow foundation, including durable local order storage and production workflow tools.

## Included

- Real The Hilltop Shop and Forge brand assets
- Tablet-first customer welcome screen
- Product-category selection
- Ornament gallery using real product photos
- Responsive desktop, tablet, and phone layouts
- Progressive Web App manifest and service worker
- Durable local order storage with IndexedDB
- PHP health endpoint foundation for Hostinger
- Approved project specification files

## Run Locally

For the front-end only static experience:

```bash
npx serve public -l 3016
```

Open:

```text
http://127.0.0.1:3016
```

`npx serve` does not execute PHP, so it cannot test Forge API endpoints.

For the browser app plus local PHP API endpoints:

```bash
php -S 127.0.0.1:8080 -t public
```

Open:

```text
http://127.0.0.1:8080
```

Health endpoint:

```text
http://127.0.0.1:8080/api/v1/health.php
```

## Hostinger Deployment

Upload the contents of `public/` into the document root for:

```text
forge.thehilltopshop.com
```

Do not place WooCommerce credentials, database values, or environment secrets in this repository.

## Current Build Goal

Durable local order storage already exists. Milestone 6 server communication is being added incrementally. Order synchronization and WooCommerce order creation are not implemented in this phase.
