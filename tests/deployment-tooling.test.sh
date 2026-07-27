#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "${haystack}" == *"${needle}"* ]] || fail "Expected output to contain: ${needle}"
}

assert_file_contains() {
  local path="$1"
  local needle="$2"
  grep -Fq -- "${needle}" "${path}" || fail "Expected ${path} to contain: ${needle}"
}

TMPDIR_TEST="$(mktemp -d "${TMPDIR:-/tmp}/forge-deploy-test.XXXXXX")"
trap 'rm -rf "${TMPDIR_TEST}"' EXIT

DIRTY_REPO_PARENT="${TMPDIR_TEST}/Forge Dirty Repo"
DIRTY_REPO_PATH="${DIRTY_REPO_PARENT}/forge clone"
mkdir -p "${DIRTY_REPO_PARENT}"

git clone --quiet --no-hardlinks "${REPO_ROOT}" "${DIRTY_REPO_PATH}"
printf 'temporary dirty file\n' > "${DIRTY_REPO_PATH}/dirty-test-file.txt"

OUTPUT="$(
  cd "${DIRTY_REPO_PATH}" && ./scripts/build-deployment-package.sh 2>&1 || true
)"
assert_contains "${OUTPUT}" "Working tree must be clean"

BUILD_OUTPUT="$(
  ./scripts/build-deployment-package.sh --allow-dirty
)"
assert_contains "${BUILD_OUTPUT}" "Deployment package ready:"

BUILD_DIR="$(
  find .deploy -mindepth 1 -maxdepth 1 -type d -name 'forge-deployment-*' | sort | tail -n 1
)"
[[ -n "${BUILD_DIR}" ]] || fail "Expected a deployment build directory."

VERIFY_OUTPUT="$(
  ./scripts/verify-deployment-package.sh "${BUILD_DIR}"
)"
assert_contains "${VERIFY_OUTPUT}" "Deployment package verification passed."

ZIP_PATH="$(
  find "${BUILD_DIR}" -maxdepth 1 -type f -name 'forge-deployment-*.zip' | sort | tail -n 1
)"
[[ -n "${ZIP_PATH}" ]] || fail "Expected a deployment ZIP."

SPACE_DIR="${TMPDIR_TEST}/Forge Deploy Artifact"
mkdir -p "${SPACE_DIR}"
cp "${ZIP_PATH}" "${SPACE_DIR}/forge deployment.zip"
cp "${BUILD_DIR}/forge-deployment.manifest.txt" "${SPACE_DIR}/forge-deployment.manifest.txt"

SPACE_VERIFY_OUTPUT="$(
  ./scripts/verify-deployment-package.sh "${SPACE_DIR}/forge deployment.zip"
)"
assert_contains "${SPACE_VERIFY_OUTPUT}" "Deployment package verification passed."

grep -F -- '--delete' scripts/deploy-forge.sh >/dev/null && fail "deploy-forge.sh must not use --delete."
grep -Eq 'migration[^[:cntrl:]]*(mysql|php.*migrations)' scripts/deploy-forge.sh && fail "deploy-forge.sh must not run migrations."

DRY_RUN_OUTPUT="$(
  FORGE_DEPLOY_HOST=example.com \
  FORGE_DEPLOY_USER=forge \
  FORGE_DEPLOY_PORT=22 \
  FORGE_REMOTE_PUBLIC_ROOT=/home/u523569741/domains/thehilltopshop.com/public_html/forge \
  FORGE_REMOTE_PRIVATE_ROOT=/home/example/forge_server \
  FORGE_DEPLOY_HEALTHCHECK_URL=https://forge.thehilltopshop.com/api/v1/health.php \
  ./scripts/deploy-forge.sh --package "${BUILD_DIR}"
)"
assert_contains "${DRY_RUN_OUTPUT}" "Mode"
assert_contains "${DRY_RUN_OUTPUT}" "dry-run"
assert_contains "${DRY_RUN_OUTPUT}" "No remote connection was attempted."

APPLY_FAIL_OUTPUT="$(
  FORGE_DEPLOY_HOST=example.com \
  FORGE_DEPLOY_USER=forge \
  FORGE_DEPLOY_PORT=22 \
  FORGE_REMOTE_PUBLIC_ROOT=/home/u523569741/domains/thehilltopshop.com/public_html/forge \
  FORGE_REMOTE_PRIVATE_ROOT=/home/example/forge_server \
  FORGE_DEPLOY_HEALTHCHECK_URL=https://forge.thehilltopshop.com/api/v1/health.php \
  ./scripts/deploy-forge.sh --package "${BUILD_DIR}" --apply 2>&1 || true
)"
assert_contains "${APPLY_FAIL_OUTPUT}" "Real deployment requires both --apply and --confirm APPLY."

MISSING_ENV_OUTPUT="$(
  ./scripts/deploy-forge.sh --package "${BUILD_DIR}" 2>&1 || true
)"
assert_contains "${MISSING_ENV_OUTPUT}" "FORGE_DEPLOY_HOST is required."

assert_file_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "public_html/forge/index.html"
assert_file_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "private/forge_server/bootstrap.php"

printf 'PASS deployment tooling safety checks\n'
