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

assert_file_not_contains() {
  local path="$1"
  local needle="$2"
  if grep -Fq -- "${needle}" "${path}"; then
    fail "Did not expect ${path} to contain: ${needle}"
  fi
}

assert_order() {
  local haystack="$1"
  local first="$2"
  local second="$3"
  python3 - "$haystack" "$first" "$second" <<'PY'
import sys

haystack, first, second = sys.argv[1:4]
first_index = haystack.find(first)
second_index = haystack.find(second)
if first_index == -1:
    raise SystemExit(f"missing first marker: {first}")
if second_index == -1:
    raise SystemExit(f"missing second marker: {second}")
if first_index >= second_index:
    raise SystemExit(f"incorrect order: {first} !< {second}")
PY
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
cp -R "${BUILD_DIR}" "${SPACE_DIR}/forge deployment build"

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

DRY_RUN_SPACE_OUTPUT="$(
  FORGE_DEPLOY_HOST=example.com \
  FORGE_DEPLOY_USER=forge \
  FORGE_DEPLOY_PORT=22 \
  FORGE_REMOTE_PUBLIC_ROOT=/home/u523569741/domains/thehilltopshop.com/public_html/forge \
  FORGE_REMOTE_PRIVATE_ROOT=/home/example/forge_server \
  FORGE_DEPLOY_HEALTHCHECK_URL=https://forge.thehilltopshop.com/api/v1/health.php \
  ./scripts/deploy-forge.sh --package "${SPACE_DIR}/forge deployment build"
)"
assert_order "${DRY_RUN_SPACE_OUTPUT}" "Private upload command:" "Public upload command:"

assert_file_not_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "config.php"
assert_file_not_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "uploads/"
assert_file_not_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "logs/"
assert_file_not_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "docs/"
assert_file_not_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "tests/"

STUB_BIN_DIR="${TMPDIR_TEST}/stub-bin"
STUB_LOG_PATH="${TMPDIR_TEST}/stub-commands.log"
mkdir -p "${STUB_BIN_DIR}"

cat > "${STUB_BIN_DIR}/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'ssh:%s\n' "$*" >> "${FORGE_STUB_LOG}"
if [[ "${FORGE_STUB_FAIL_BACKUP:-0}" == "1" ]]; then
  exit 1
fi
exit 0
EOF

cat > "${STUB_BIN_DIR}/rsync" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
destination="${*: -1}"
label="unknown"
if [[ "${destination}" == *"${FORGE_REMOTE_PRIVATE_ROOT}/" ]]; then
  label="private"
elif [[ "${destination}" == *"${FORGE_REMOTE_PUBLIC_ROOT}/" ]]; then
  label="public"
fi
printf 'rsync:%s:%s\n' "${label}" "$*" >> "${FORGE_STUB_LOG}"
if [[ "${label}" == "private" && "${FORGE_STUB_FAIL_PRIVATE:-0}" == "1" ]]; then
  exit 1
fi
if [[ "${label}" == "public" && "${FORGE_STUB_FAIL_PUBLIC:-0}" == "1" ]]; then
  exit 1
fi
exit 0
EOF

cat > "${STUB_BIN_DIR}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'curl:%s\n' "$*" >> "${FORGE_STUB_LOG}"
exit 0
EOF

chmod +x "${STUB_BIN_DIR}/ssh" "${STUB_BIN_DIR}/rsync" "${STUB_BIN_DIR}/curl"

run_stubbed_apply() {
  local package_path="$1"
  shift
  : > "${STUB_LOG_PATH}"
  env \
    PATH="${STUB_BIN_DIR}:$PATH" \
    FORGE_STUB_LOG="${STUB_LOG_PATH}" \
    FORGE_DEPLOY_HOST=example.com \
    FORGE_DEPLOY_USER=forge \
    FORGE_DEPLOY_PORT=22 \
    FORGE_REMOTE_PUBLIC_ROOT=/home/u523569741/domains/thehilltopshop.com/public_html/forge \
    FORGE_REMOTE_PRIVATE_ROOT=/home/example/forge_server \
    FORGE_DEPLOY_HEALTHCHECK_URL=https://forge.thehilltopshop.com/api/v1/health.php \
    "$@" \
    bash -c "cd \"${REPO_ROOT}\" && printf 'APPLY\n' | ./scripts/deploy-forge.sh --package \"${package_path}\" --apply --confirm APPLY"
}

APPLY_SUCCESS_OUTPUT="$(
  run_stubbed_apply "${SPACE_DIR}/forge deployment build"
)"
assert_contains "${APPLY_SUCCESS_OUTPUT}" "Private server runtime upload completed successfully."
assert_contains "${APPLY_SUCCESS_OUTPUT}" "Public runtime upload completed successfully."
assert_contains "${APPLY_SUCCESS_OUTPUT}" "Deployment completed successfully."
STUB_LOG_CONTENTS="$(cat "${STUB_LOG_PATH}")"
assert_order "${STUB_LOG_CONTENTS}" "ssh:" "rsync:private:"
assert_order "${STUB_LOG_CONTENTS}" "rsync:private:" "rsync:public:"
assert_contains "${STUB_LOG_CONTENTS}" "curl:"

PRIVATE_FAIL_OUTPUT="$(
  run_stubbed_apply "${BUILD_DIR}" FORGE_STUB_FAIL_PRIVATE=1 2>&1 || true
)"
assert_contains "${PRIVATE_FAIL_OUTPUT}" "Private runtime upload failed. Public runtime was not changed."
STUB_LOG_CONTENTS="$(cat "${STUB_LOG_PATH}")"
assert_contains "${STUB_LOG_CONTENTS}" "rsync:private:"
[[ "${STUB_LOG_CONTENTS}" != *"rsync:public:"* ]] || fail "Public upload should not run after private upload failure."

BACKUP_FAIL_OUTPUT="$(
  run_stubbed_apply "${BUILD_DIR}" FORGE_STUB_FAIL_BACKUP=1 2>&1 || true
)"
assert_contains "${BACKUP_FAIL_OUTPUT}" "Remote backup failed. Private and public runtime files were not changed."
STUB_LOG_CONTENTS="$(cat "${STUB_LOG_PATH}")"
assert_contains "${STUB_LOG_CONTENTS}" "ssh:"
[[ "${STUB_LOG_CONTENTS}" != *"rsync:private:"* ]] || fail "Private upload should not run after backup failure."
[[ "${STUB_LOG_CONTENTS}" != *"rsync:public:"* ]] || fail "Public upload should not run after backup failure."

PUBLIC_FAIL_OUTPUT="$(
  run_stubbed_apply "${BUILD_DIR}" FORGE_STUB_FAIL_PUBLIC=1 2>&1 || true
)"
assert_contains "${PUBLIC_FAIL_OUTPUT}" "Public runtime upload failed. Private runtime may already have changed."
assert_contains "${PUBLIC_FAIL_OUTPUT}" "Use the remote backup for rollback:"
[[ "${PUBLIC_FAIL_OUTPUT}" != *"Deployment completed successfully."* ]] || fail "Public upload failure must not report success."
STUB_LOG_CONTENTS="$(cat "${STUB_LOG_PATH}")"
assert_order "${STUB_LOG_CONTENTS}" "rsync:private:" "rsync:public:"

assert_file_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "public_html/forge/index.html"
assert_file_contains "${BUILD_DIR}/forge-deployment.manifest.txt" "private/forge_server/bootstrap.php"

printf 'PASS deployment tooling safety checks\n'
