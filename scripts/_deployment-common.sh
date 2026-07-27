#!/usr/bin/env bash
set -euo pipefail

deployment_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/.." && pwd
}

deployment_timestamp_utc() {
  date -u +"%Y%m%dT%H%M%SZ"
}

deployment_fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

deployment_warn() {
  printf 'Warning: %s\n' "$*" >&2
}

deployment_note() {
  printf '%s\n' "$*"
}

deployment_require_command() {
  local command_name
  for command_name in "$@"; do
    command -v "${command_name}" >/dev/null 2>&1 || deployment_fail "Required command not found: ${command_name}"
  done
}

deployment_assert_repo_root() {
  local repo_root
  repo_root="$(deployment_repo_root)"
  if [[ "$(pwd)" != "${repo_root}" ]]; then
    deployment_fail "Run this script from the repository root: ${repo_root}"
  fi
}

deployment_validate_remote_public_root() {
  local path="$1"
  [[ -n "${path}" ]] || deployment_fail "FORGE_REMOTE_PUBLIC_ROOT is required."
  [[ "${path}" = /* ]] || deployment_fail "FORGE_REMOTE_PUBLIC_ROOT must be an absolute path."
  [[ "${path}" != "/" ]] || deployment_fail "FORGE_REMOTE_PUBLIC_ROOT must not be /."
  [[ "${path}" == *"/public_html/forge" ]] || deployment_fail "FORGE_REMOTE_PUBLIC_ROOT must end with /public_html/forge."
  [[ "${path}" != *".."* ]] || deployment_fail "FORGE_REMOTE_PUBLIC_ROOT must not contain '..'."
}

deployment_validate_remote_private_root() {
  local path="$1"
  [[ -n "${path}" ]] || deployment_fail "FORGE_REMOTE_PRIVATE_ROOT is required."
  [[ "${path}" = /* ]] || deployment_fail "FORGE_REMOTE_PRIVATE_ROOT must be an absolute path."
  [[ "${path}" != "/" ]] || deployment_fail "FORGE_REMOTE_PRIVATE_ROOT must not be /."
  [[ "${path}" != *"/public_html"* ]] || deployment_fail "FORGE_REMOTE_PRIVATE_ROOT must stay outside public_html."
  [[ "${path}" != *".."* ]] || deployment_fail "FORGE_REMOTE_PRIVATE_ROOT must not contain '..'."
}

deployment_print_key_value() {
  local key="$1"
  local value="$2"
  printf '  %-28s %s\n' "${key}" "${value}"
}

deployment_load_env_file_if_present() {
  local config_file="$1"
  if [[ -z "${config_file}" ]]; then
    return 0
  fi

  if [[ ! -f "${config_file}" ]]; then
    deployment_fail "Deployment config file not found: ${config_file}"
  fi

  # shellcheck disable=SC1090
  source "${config_file}"
}

deployment_latest_build_dir() {
  local repo_root
  local latest_dir

  repo_root="$(deployment_repo_root)"
  latest_dir="$(
    find "${repo_root}/.deploy" -mindepth 1 -maxdepth 1 -type d -name 'forge-deployment-*' 2>/dev/null | sort | tail -n 1
  )"

  [[ -n "${latest_dir}" ]] || deployment_fail "No deployment build directory found under ${repo_root}/.deploy."
  printf '%s\n' "${latest_dir}"
}

deployment_realpath() {
  local input_path="$1"
  if [[ -d "${input_path}" ]]; then
    (cd "${input_path}" && pwd)
    return 0
  fi

  local parent_dir
  local file_name

  parent_dir="$(cd "$(dirname "${input_path}")" && pwd)"
  file_name="$(basename "${input_path}")"
  printf '%s/%s\n' "${parent_dir}" "${file_name}"
}
