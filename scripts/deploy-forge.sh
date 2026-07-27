#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=scripts/_deployment-common.sh
source "${SCRIPT_DIR}/_deployment-common.sh"

deployment_assert_repo_root
deployment_require_command bash rsync ssh curl

APPLY=0
CONFIRM_TOKEN=""
PACKAGE_SOURCE=""
CONFIG_FILE="${FORGE_DEPLOY_CONFIG_FILE:-}"

while (($# > 0)); do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --confirm)
      [[ $# -ge 2 ]] || deployment_fail "--confirm requires a value."
      CONFIRM_TOKEN="$2"
      shift 2
      ;;
    --package)
      [[ $# -ge 2 ]] || deployment_fail "--package requires a path."
      PACKAGE_SOURCE="$2"
      shift 2
      ;;
    --config)
      [[ $# -ge 2 ]] || deployment_fail "--config requires a path."
      CONFIG_FILE="$2"
      shift 2
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: ./scripts/deploy-forge.sh [--package BUILD_DIR_OR_ZIP] [--config FILE] [--apply --confirm APPLY]

Default mode is a dry-run plan only. No remote commands run unless both
--apply and --confirm APPLY are provided.
USAGE
      exit 0
      ;;
    *)
      deployment_fail "Unknown argument: $1"
      ;;
  esac
done

deployment_load_env_file_if_present "${CONFIG_FILE}"

if [[ -z "${PACKAGE_SOURCE}" ]]; then
  PACKAGE_SOURCE="$(deployment_latest_build_dir)"
fi

PACKAGE_SOURCE="$(deployment_realpath "${PACKAGE_SOURCE}")"
BUILD_ROOT=""
PACKAGE_ROOT=""
ZIP_PATH=""

if [[ -d "${PACKAGE_SOURCE}" ]]; then
  BUILD_ROOT="${PACKAGE_SOURCE}"
  PACKAGE_ROOT="${BUILD_ROOT}/package"
  ZIP_PATH="$(find "${BUILD_ROOT}" -maxdepth 1 -type f -name 'forge-deployment-*.zip' | sort | tail -n 1)"
elif [[ -f "${PACKAGE_SOURCE}" ]]; then
  ZIP_PATH="${PACKAGE_SOURCE}"
  BUILD_ROOT="$(cd "$(dirname "${ZIP_PATH}")" && pwd)"
  PACKAGE_ROOT="${BUILD_ROOT}/package"
else
  deployment_fail "Package source not found: ${PACKAGE_SOURCE}"
fi

[[ -d "${PACKAGE_ROOT}" ]] || deployment_fail "Staged package directory not found: ${PACKAGE_ROOT}"
[[ -n "${ZIP_PATH}" && -f "${ZIP_PATH}" ]] || deployment_fail "Deployment ZIP not found."

"${SCRIPT_DIR}/verify-deployment-package.sh" "${BUILD_ROOT}" >/dev/null

FORGE_DEPLOY_HOST="${FORGE_DEPLOY_HOST:-}"
FORGE_DEPLOY_USER="${FORGE_DEPLOY_USER:-}"
FORGE_DEPLOY_PORT="${FORGE_DEPLOY_PORT:-22}"
FORGE_REMOTE_PUBLIC_ROOT="${FORGE_REMOTE_PUBLIC_ROOT:-}"
FORGE_REMOTE_PRIVATE_ROOT="${FORGE_REMOTE_PRIVATE_ROOT:-}"
FORGE_DEPLOY_IDENTITY_FILE="${FORGE_DEPLOY_IDENTITY_FILE:-}"
FORGE_DEPLOY_HEALTHCHECK_URL="${FORGE_DEPLOY_HEALTHCHECK_URL:-}"

[[ -n "${FORGE_DEPLOY_HOST}" ]] || deployment_fail "FORGE_DEPLOY_HOST is required."
[[ -n "${FORGE_DEPLOY_USER}" ]] || deployment_fail "FORGE_DEPLOY_USER is required."
[[ -n "${FORGE_DEPLOY_PORT}" ]] || deployment_fail "FORGE_DEPLOY_PORT is required."
[[ -n "${FORGE_DEPLOY_HEALTHCHECK_URL}" ]] || deployment_fail "FORGE_DEPLOY_HEALTHCHECK_URL is required."

deployment_validate_remote_public_root "${FORGE_REMOTE_PUBLIC_ROOT}"
deployment_validate_remote_private_root "${FORGE_REMOTE_PRIVATE_ROOT}"

if [[ -n "${FORGE_DEPLOY_IDENTITY_FILE}" && ! -f "${FORGE_DEPLOY_IDENTITY_FILE}" ]]; then
  deployment_fail "FORGE_DEPLOY_IDENTITY_FILE does not exist: ${FORGE_DEPLOY_IDENTITY_FILE}"
fi

REMOTE_TARGET="${FORGE_DEPLOY_USER}@${FORGE_DEPLOY_HOST}"
BACKUP_STAMP="$(deployment_timestamp_utc)"
REMOTE_BACKUP_ROOT="${FORGE_REMOTE_PRIVATE_ROOT}/backups/deploy-${BACKUP_STAMP}"
PUBLIC_STAGE="${PACKAGE_ROOT}/public_html/forge/"
PRIVATE_STAGE="${PACKAGE_ROOT}/private/forge_server/"

SSH_BASE=(ssh -p "${FORGE_DEPLOY_PORT}")
RSYNC_BASE=(rsync -az --itemize-changes --human-readable --checksum)

if [[ -n "${FORGE_DEPLOY_IDENTITY_FILE}" ]]; then
  SSH_BASE+=(-i "${FORGE_DEPLOY_IDENTITY_FILE}")
  RSYNC_BASE+=(-e "ssh -p ${FORGE_DEPLOY_PORT} -i ${FORGE_DEPLOY_IDENTITY_FILE}")
else
  RSYNC_BASE+=(-e "ssh -p ${FORGE_DEPLOY_PORT}")
fi

MANIFEST_PATH="${BUILD_ROOT}/forge-deployment.manifest.txt"

deployment_note "Forge deployment plan"
deployment_print_key_value "Mode" "$([[ "${APPLY}" -eq 1 ]] && printf 'apply' || printf 'dry-run')"
deployment_print_key_value "Package source" "${PACKAGE_SOURCE}"
deployment_print_key_value "ZIP archive" "${ZIP_PATH}"
deployment_print_key_value "Remote host" "${REMOTE_TARGET}"
deployment_print_key_value "Remote public root" "${FORGE_REMOTE_PUBLIC_ROOT}"
deployment_print_key_value "Remote private root" "${FORGE_REMOTE_PRIVATE_ROOT}"
deployment_print_key_value "Remote backup root" "${REMOTE_BACKUP_ROOT}"
deployment_print_key_value "Health check URL" "${FORGE_DEPLOY_HEALTHCHECK_URL}"

deployment_note
deployment_note "Private upload command:"
printf '  %q ' "${RSYNC_BASE[@]}" "$PRIVATE_STAGE" "${REMOTE_TARGET}:${FORGE_REMOTE_PRIVATE_ROOT}/"
printf '\n'

deployment_note "Public upload command:"
printf '  %q ' "${RSYNC_BASE[@]}" "$PUBLIC_STAGE" "${REMOTE_TARGET}:${FORGE_REMOTE_PUBLIC_ROOT}/"
printf '\n'

if [[ "${APPLY}" -ne 1 ]]; then
  deployment_note
  deployment_note "Dry run only. No remote connection was attempted."
  deployment_note "To perform a real upload later, rerun with: --apply --confirm APPLY"
  exit 0
fi

[[ "${CONFIRM_TOKEN}" == "APPLY" ]] || deployment_fail "Real deployment requires both --apply and --confirm APPLY."

read -r -p "Type APPLY to continue with the live upload: " INTERACTIVE_CONFIRM
[[ "${INTERACTIVE_CONFIRM}" == "APPLY" ]] || deployment_fail "Deployment cancelled."

PUBLIC_BACKUP_FILES="$(
  awk '/^public_html\/forge\// { sub(/^public_html\/forge\//, "", $0); print $0 }' "${MANIFEST_PATH}" | sort
)"
PRIVATE_BACKUP_FILES="$(
  awk '/^private\/forge_server\// { sub(/^private\/forge_server\//, "", $0); print $0 }' "${MANIFEST_PATH}" | sort
)"

read -r -d '' REMOTE_BACKUP_SCRIPT <<EOF || true
set -euo pipefail
mkdir -p "$(printf '%q' "${REMOTE_BACKUP_ROOT}")/public" "$(printf '%q' "${REMOTE_BACKUP_ROOT}")/private"
while IFS= read -r file_path; do
  [[ -n "\${file_path}" ]] || continue
  source_path="$(printf '%q' "${FORGE_REMOTE_PUBLIC_ROOT}")/\${file_path}"
  if [[ -f "\${source_path}" ]]; then
    mkdir -p "$(printf '%q' "${REMOTE_BACKUP_ROOT}")/public/\$(dirname "\${file_path}")"
    cp -p "\${source_path}" "$(printf '%q' "${REMOTE_BACKUP_ROOT}")/public/\${file_path}"
  fi
done <<'PUBLIC_FILES'
${PUBLIC_BACKUP_FILES}
PUBLIC_FILES
while IFS= read -r file_path; do
  [[ -n "\${file_path}" ]] || continue
  source_path="$(printf '%q' "${FORGE_REMOTE_PRIVATE_ROOT}")/\${file_path}"
  if [[ -f "\${source_path}" ]]; then
    mkdir -p "$(printf '%q' "${REMOTE_BACKUP_ROOT}")/private/\$(dirname "\${file_path}")"
    cp -p "\${source_path}" "$(printf '%q' "${REMOTE_BACKUP_ROOT}")/private/\${file_path}"
  fi
done <<'PRIVATE_FILES'
${PRIVATE_BACKUP_FILES}
PRIVATE_FILES
EOF

deployment_note "Creating remote backup of files that may be replaced..."
if ! "${SSH_BASE[@]}" "${REMOTE_TARGET}" "${REMOTE_BACKUP_SCRIPT}"; then
  deployment_note "Remote backup failed. Private and public runtime files were not changed."
  exit 1
fi

deployment_note "Uploading private server runtime files..."
if ! "${RSYNC_BASE[@]}" "${PRIVATE_STAGE}" "${REMOTE_TARGET}:${FORGE_REMOTE_PRIVATE_ROOT}/"; then
  deployment_note "Private runtime upload failed. Public runtime was not changed."
  deployment_note "Rollback backup remains available at: ${REMOTE_BACKUP_ROOT}"
  exit 1
fi

deployment_note "Private server runtime upload completed successfully."

deployment_note "Uploading public runtime files..."
if ! "${RSYNC_BASE[@]}" "${PUBLIC_STAGE}" "${REMOTE_TARGET}:${FORGE_REMOTE_PUBLIC_ROOT}/"; then
  deployment_note "Public runtime upload failed. Private runtime may already have changed."
  deployment_note "Use the remote backup for rollback: ${REMOTE_BACKUP_ROOT}"
  exit 1
fi

deployment_note "Public runtime upload completed successfully."

deployment_note "Running non-destructive health check..."
curl --fail --silent --show-error "${FORGE_DEPLOY_HEALTHCHECK_URL}" >/dev/null

deployment_note "Deployment completed successfully."
deployment_note "Rollback instructions:"
deployment_note "  1. Restore files from ${REMOTE_BACKUP_ROOT}/public back into ${FORGE_REMOTE_PUBLIC_ROOT}"
deployment_note "  2. Restore files from ${REMOTE_BACKUP_ROOT}/private back into ${FORGE_REMOTE_PRIVATE_ROOT}"
deployment_note "  3. Re-run the health check URL: ${FORGE_DEPLOY_HEALTHCHECK_URL}"
