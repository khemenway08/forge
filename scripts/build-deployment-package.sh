#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/_deployment-common.sh
source "${SCRIPT_DIR}/_deployment-common.sh"

deployment_assert_repo_root
deployment_require_command git php node zip unzip rsync find sort awk wc

ALLOW_DIRTY=0

while (($# > 0)); do
  case "$1" in
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./scripts/build-deployment-package.sh [--allow-dirty]

Builds a timestamped Forge deployment package under .deploy/ after rerunning
the required verification commands. By default the working tree must be clean.
USAGE
      exit 0
      ;;
    *)
      deployment_fail "Unknown argument: $1"
      ;;
  esac
done

if [[ "${ALLOW_DIRTY}" -ne 1 ]] && [[ -n "$(git status --short)" ]]; then
  deployment_fail "Working tree must be clean. Re-run with --allow-dirty only when you intentionally want a local preview build."
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse HEAD)"
TIMESTAMP="$(deployment_timestamp_utc)"
BUILD_ROOT=".deploy/forge-deployment-${TIMESTAMP}"
PACKAGE_ROOT="${BUILD_ROOT}/package"
PUBLIC_STAGE="${PACKAGE_ROOT}/public_html/forge"
PRIVATE_STAGE="${PACKAGE_ROOT}/private/forge_server"
MANIFEST_PATH="${BUILD_ROOT}/forge-deployment.manifest.txt"
ZIP_PATH="${BUILD_ROOT}/forge-deployment-${TIMESTAMP}.zip"
METADATA_PATH="${BUILD_ROOT}/forge-deployment.metadata.txt"
INSTRUCTIONS_PATH="${BUILD_ROOT}/forge-deployment.instructions.txt"
COMPOSER_CACHE_DIR_PATH="${PWD}/.deploy/composer-cache"

mkdir -p "${PUBLIC_STAGE}" "${PRIVATE_STAGE}"
mkdir -p "${COMPOSER_CACHE_DIR_PATH}"

deployment_note "Running required verification before building the deployment package..."
php server/tests/run.php
node --test tests/*.test.js
git diff --check

deployment_note "Staging public runtime files..."
rsync -a --prune-empty-dirs \
  --exclude-from="${SCRIPT_DIR}/deployment-excludes.txt" \
  public/ "${PUBLIC_STAGE}/"

deployment_note "Staging private server runtime files..."
rsync -a --prune-empty-dirs \
  --exclude-from="${SCRIPT_DIR}/deployment-excludes.txt" \
  server/ "${PRIVATE_STAGE}/"

deployment_note "Installing private Composer dependencies into the staged runtime..."
deployment_run_composer validate --no-check-publish
COMPOSER_CACHE_DIR="${COMPOSER_CACHE_DIR_PATH}" \
COMPOSER_VENDOR_DIR="${PRIVATE_STAGE}/vendor" \
  deployment_run_composer install \
  --no-dev \
  --prefer-dist \
  --optimize-autoloader \
  --no-interaction \
  --no-progress \
  --working-dir "$(pwd)"

cat > "${PACKAGE_ROOT}/BUILD-METADATA.txt" <<EOF
Forge deployment build metadata
Built at (UTC): ${TIMESTAMP}
Git branch: ${BRANCH}
Git commit: ${COMMIT}
Public web root inside package: public_html/forge
Private server root inside package: private/forge_server
Migration 009 status: NOT EXECUTED
Migration automation: DISABLED
EOF

cat > "${PACKAGE_ROOT}/DEPLOYMENT-INSTRUCTIONS.txt" <<'EOF'
Forge deployment package

1. Upload this ZIP to a safe staging location in your Hostinger account.
2. Extract it without overwriting private config.php, uploads, or persistent logs.
3. Copy public_html/forge/* into the approved Forge web root:
   /home/u523569741/domains/thehilltopshop.com/public_html/forge
4. Copy private/forge_server/* into the existing private server directory that
   your FORGE_SERVER_ROOT setting points to. That private directory must remain
   outside public_html.
5. Do not upload or create config.php from this repository.
6. Do not run migration 009 automatically. Handle it as a separate manual step.
EOF

(
  cd "${PACKAGE_ROOT}"
  find . -type f | sed 's#^\./##' | sort > "../forge-deployment.manifest.txt"
)

cat > "${METADATA_PATH}" <<EOF
build_timestamp_utc=${TIMESTAMP}
git_branch=${BRANCH}
git_commit=${COMMIT}
package_root=${PACKAGE_ROOT}
package_zip=${ZIP_PATH}
manifest=${MANIFEST_PATH}
instructions=${INSTRUCTIONS_PATH}
EOF

cp "${PACKAGE_ROOT}/DEPLOYMENT-INSTRUCTIONS.txt" "${INSTRUCTIONS_PATH}"

deployment_note "Creating ZIP archive..."
(
  cd "${PACKAGE_ROOT}"
  zip -rq "${PWD}/../$(basename "${ZIP_PATH}")" .
)

deployment_note "Verifying deployment package..."
"${SCRIPT_DIR}/verify-deployment-package.sh" "${BUILD_ROOT}"

deployment_note "Deployment package ready:"
deployment_print_key_value "Build directory" "$(deployment_realpath "${BUILD_ROOT}")"
deployment_print_key_value "ZIP archive" "$(deployment_realpath "${ZIP_PATH}")"
deployment_print_key_value "Manifest" "$(deployment_realpath "${MANIFEST_PATH}")"
