#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/_deployment-common.sh
source "${SCRIPT_DIR}/_deployment-common.sh"

deployment_assert_repo_root
deployment_require_command unzip zipinfo awk grep sort wc du find

TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  TARGET="$(deployment_latest_build_dir)"
fi

TARGET="$(deployment_realpath "${TARGET}")"

BUILD_ROOT=""
PACKAGE_ROOT=""
ZIP_PATH=""
MANIFEST_PATH=""

if [[ -d "${TARGET}" ]]; then
  BUILD_ROOT="${TARGET}"
  PACKAGE_ROOT="${BUILD_ROOT}/package"
  ZIP_PATH="$(find "${BUILD_ROOT}" -maxdepth 1 -type f -name 'forge-deployment-*.zip' | sort | tail -n 1)"
  MANIFEST_PATH="${BUILD_ROOT}/forge-deployment.manifest.txt"
elif [[ -f "${TARGET}" ]]; then
  ZIP_PATH="${TARGET}"
  BUILD_ROOT="$(cd "$(dirname "${ZIP_PATH}")" && pwd)"
  MANIFEST_PATH="${BUILD_ROOT}/forge-deployment.manifest.txt"
else
  deployment_fail "Deployment package target not found: ${TARGET}"
fi

[[ -n "${ZIP_PATH}" && -f "${ZIP_PATH}" ]] || deployment_fail "Deployment ZIP not found."
[[ -f "${MANIFEST_PATH}" ]] || deployment_fail "Deployment manifest not found: ${MANIFEST_PATH}"

if [[ -n "${PACKAGE_ROOT}" ]]; then
  [[ -d "${PACKAGE_ROOT}" ]] || deployment_fail "Package directory not found: ${PACKAGE_ROOT}"
fi

TMPDIR_VERIFY="$(mktemp -d "${TMPDIR:-/tmp}/forge-deploy-verify.XXXXXX")"
trap 'rm -rf "${TMPDIR_VERIFY}"' EXIT

ZIP_LIST_PATH="${TMPDIR_VERIFY}/zip-files.txt"
MANIFEST_NORMALIZED_PATH="${TMPDIR_VERIFY}/manifest-files.txt"
PACKAGE_LIST_PATH="${TMPDIR_VERIFY}/package-files.txt"

zipinfo -1 "${ZIP_PATH}" | sed '/\/$/d' | sort > "${ZIP_LIST_PATH}"
sort "${MANIFEST_PATH}" > "${MANIFEST_NORMALIZED_PATH}"

if [[ -n "${PACKAGE_ROOT}" ]]; then
  (
    cd "${PACKAGE_ROOT}"
    find . -type f | sed 's#^\./##' | sort > "${PACKAGE_LIST_PATH}"
  )
  cmp -s "${PACKAGE_LIST_PATH}" "${MANIFEST_NORMALIZED_PATH}" || deployment_fail "Manifest does not match the staged package contents."
fi

cmp -s "${ZIP_LIST_PATH}" "${MANIFEST_NORMALIZED_PATH}" || deployment_fail "ZIP contents do not match the manifest."

required_paths=(
  "public_html/forge/index.html"
  "public_html/forge/css/app.css"
  "public_html/forge/js/app.js"
  "public_html/forge/api/v1/health.php"
  "public_html/forge/api/v1/orders.php"
  "private/forge_server/bootstrap.php"
  "private/forge_server/cli/smoke-test-email.php"
  "private/forge_server/lib/database.php"
  "private/forge_server/lib/email-smoke-test.php"
  "private/forge_server/lib/email-service.php"
  "private/forge_server/lib/order-repository.php"
  "private/forge_server/vendor/autoload.php"
  "private/forge_server/vendor/phpmailer/phpmailer/src/PHPMailer.php"
  "private/forge_server/lib/staff-order-repository.php"
)

for required_path in "${required_paths[@]}"; do
  grep -Fxq "${required_path}" "${MANIFEST_NORMALIZED_PATH}" || deployment_fail "Required deployment file missing: ${required_path}"
done

for forbidden_pattern in \
  '(^|/)\.git($|/)' \
  '(^|/)tests($|/)' \
  '(^|/)docs($|/)' \
  '(^|/)config\.php$' \
  '(^|/)auth\.json$' \
  '(^|/)\.env$' \
  '(^|/)uploads($|/)' \
  '(^|/)logs($|/)' \
  '(^|/)migrations($|/)' \
  '\.sql$' \
  '\.db$' \
  '\.sqlite3?$' \
  '(^|/).*\.pem$' \
  '(^|/).*\.key$'; do
  if grep -Eq "${forbidden_pattern}" "${MANIFEST_NORMALIZED_PATH}"; then
    deployment_fail "Forbidden path detected in deployment package: ${forbidden_pattern}"
  fi
done

grep -Fxq "public_html/forge/api/health.php" "${MANIFEST_NORMALIZED_PATH}" || deployment_fail "Legacy health endpoint is missing from the package."
grep -Fxq "BUILD-METADATA.txt" "${MANIFEST_NORMALIZED_PATH}" || deployment_fail "BUILD-METADATA.txt is missing from the package."
grep -Fxq "DEPLOYMENT-INSTRUCTIONS.txt" "${MANIFEST_NORMALIZED_PATH}" || deployment_fail "DEPLOYMENT-INSTRUCTIONS.txt is missing from the package."
if grep -Eq '^public_html/forge/vendor/' "${MANIFEST_NORMALIZED_PATH}"; then
  deployment_fail "Composer vendor files must not be exposed in the public runtime."
fi

FILE_COUNT="$(wc -l < "${MANIFEST_NORMALIZED_PATH}" | awk '{print $1}')"
ZIP_SIZE="$(du -h "${ZIP_PATH}" | awk '{print $1}')"

deployment_note "Deployment package verification passed."
deployment_print_key_value "Target" "${TARGET}"
deployment_print_key_value "File count" "${FILE_COUNT}"
deployment_print_key_value "ZIP size" "${ZIP_SIZE}"
