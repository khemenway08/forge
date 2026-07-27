# Forge Deployment

This guide defines the safe repeatable deployment workflow for Forge on Hostinger without manual file-by-file uploads.

## Prerequisites

- Work from the repository root on `develop`
- Confirm the baseline is clean before building a deployment package
- Keep `config.php`, database credentials, SSH keys, and Hostinger secrets outside the repository
- Do not run database migrations automatically from deployment tooling
- Approved public Forge web root:
  `/home/u523569741/domains/thehilltopshop.com/public_html/forge`

## Deployment Mapping

The repository maps to hosting in two parts:

- `public/` maps to the live Forge web root under `public_html/forge`
- `server/bootstrap.php` and `server/lib/` map to a private server directory outside `public_html`

The public PHP entry points resolve private server code by:

- `FORGE_SERVER_ROOT`, when present
- a sibling `forge_server_test` bootstrap in non-production layouts
- a relative fallback `server/bootstrap.php` path in local layouts

Private `config.php` must live next to the deployed private `bootstrap.php`, never under `public_html`.

## Required Environment Variables

Package build does not require secrets, but the SSH/rsync deployment script expects:

- `FORGE_DEPLOY_HOST`
- `FORGE_DEPLOY_USER`
- `FORGE_DEPLOY_PORT`
- `FORGE_REMOTE_PUBLIC_ROOT`
- `FORGE_REMOTE_PRIVATE_ROOT`
- `FORGE_DEPLOY_HEALTHCHECK_URL`

Optional:

- `FORGE_DEPLOY_IDENTITY_FILE`
- `FORGE_DEPLOY_CONFIG_FILE`

If you use a local config file, keep it ignored under `.deploy/` or another non-committed location.

## Dry-Run Workflow

Build a local deployment artifact:

```bash
./scripts/build-deployment-package.sh
```

If you intentionally need a preview build from a dirty local tree:

```bash
./scripts/build-deployment-package.sh --allow-dirty
```

Preview the SSH/rsync deployment plan without any remote connection:

```bash
FORGE_DEPLOY_HOST=example.com \
FORGE_DEPLOY_USER=forge \
FORGE_DEPLOY_PORT=22 \
FORGE_REMOTE_PUBLIC_ROOT=/home/u523569741/domains/thehilltopshop.com/public_html/forge \
FORGE_REMOTE_PRIVATE_ROOT=/home/example/forge_server \
FORGE_DEPLOY_HEALTHCHECK_URL=https://forge.thehilltopshop.com/api/v1/health.php \
./scripts/deploy-forge.sh --package .deploy/forge-deployment-YYYYMMDDTHHMMSSZ
```

Default behavior is dry-run only. The script prints the backup and rsync plan and exits without connecting.

## ZIP Workflow

1. Run `./scripts/build-deployment-package.sh`
2. Locate the generated ZIP under `.deploy/forge-deployment-*/`
3. Upload the ZIP to a safe staging area in Hostinger File Manager
4. Extract it
5. Copy `public_html/forge/*` into `/home/u523569741/domains/thehilltopshop.com/public_html/forge`
6. Copy `private/forge_server/*` into the existing private server directory referenced by `FORGE_SERVER_ROOT`
7. Do not overwrite `config.php`
8. Do not overwrite persistent uploads or logs
9. Do not run migration `009` automatically

## Real Deployment Workflow

Real SSH/rsync deployment requires both `--apply` and `--confirm APPLY`:

```bash
FORGE_DEPLOY_HOST=example.com \
FORGE_DEPLOY_USER=forge \
FORGE_DEPLOY_PORT=22 \
FORGE_REMOTE_PUBLIC_ROOT=/home/u523569741/domains/thehilltopshop.com/public_html/forge \
FORGE_REMOTE_PRIVATE_ROOT=/home/example/forge_server \
FORGE_DEPLOY_HEALTHCHECK_URL=https://forge.thehilltopshop.com/api/v1/health.php \
./scripts/deploy-forge.sh \
  --package .deploy/forge-deployment-YYYYMMDDTHHMMSSZ \
  --apply \
  --confirm APPLY
```

Safeguards:

- no deployment happens without `--apply`
- a second explicit confirmation is required
- no `--delete` behavior is used
- only staged approved files are uploaded
- files being replaced are backed up into a timestamped remote backup directory
- a non-destructive health check runs after upload

## Database Backup Procedure

Before any live deployment or migration:

1. Export the live Forge database tables
2. Verify the backup file exists and is readable
3. Keep the backup until deployment and migration verification are complete

## Migration Procedure

Migration `009` is a separate manual controlled action.

Required sequence:

1. Export live Forge database tables
2. Verify the backup exists
3. Upload compatible deployment files
4. Run the approved migration separately
5. Verify migration success
6. Create one controlled test order
7. Confirm it receives `Order 1001`
8. Confirm historical orders still show UUID-short references
9. Confirm tray assignment and item completion still work
10. Retain rollback files until live verification is complete

Do not create or use a script that runs migrations automatically.

## Health Checks

Recommended checks after upload:

- `GET /api/v1/health.php`
- `GET /api/health.php`
- open the Forge customer app
- open the staff workflow and confirm order and tray pages still load

## Rollback Procedure

If a deployment must be rolled back:

1. Restore the backed-up public files from the timestamped remote backup directory
2. Restore the backed-up private server files from the same backup set
3. Re-run the health check URL
4. Keep the failed deployment package and logs for review

## Common Failure States

- Missing environment variables: deployment script stops before any remote action
- Wrong remote path: deployment script rejects invalid or unsafe paths
- Dirty working tree: package build stops unless `--allow-dirty` is explicitly used
- Missing package files: verification script fails before deployment
- Included secret-like files: verification script fails
- Health check failure after upload: use rollback files before attempting migration

## Warning

`config.php`, database credentials, password hashes, SSH keys, and other secrets must never be uploaded from this repository. The repository may contain `server/config.example.php`, but the real private `config.php` must remain outside Git and outside `public_html`.
