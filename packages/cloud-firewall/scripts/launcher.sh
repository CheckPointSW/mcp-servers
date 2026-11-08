#!/bin/bash
# Launcher for the cloud-firewall MCP server (macOS only — uses the Keychain; other platforms set the env vars directly).
#
# Reads CFW_CLIENT_ID / CFW_ACCESS_KEY from the macOS Keychain so neither
# Claude Code nor Claude Desktop needs credentials in a config file or a
# shell profile. Register this script as the MCP `command` in both clients;
# extra args (e.g. --mode write) are forwarded to the server.
#
# One-time setup (prompts for the value; nothing lands on disk or in history):
#   security add-generic-password -a "$USER" -s cfw-client-id -w
#   security add-generic-password -a "$USER" -s cfw-access-key -w
#
# Env vars already present at launch take precedence over the Keychain.
#
# CFW_KEYCHAIN_SUFFIX (e.g. -dev) selects a second pair of items for another
# environment's tenant: cfw-client-id-dev / cfw-access-key-dev. Unset reads
# the plain names.
#
# Runs the sibling ../dist/index.js when present (a repo checkout or an
# installed package); otherwise — the script copied on its own, e.g. to
# ~/bin — it runs the published package via npx (CFW_PACKAGE overrides the
# spec, e.g. @chkp/cloud-firewall-mcp@1.2.3 to pin a version).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$SCRIPT_DIR/../dist/index.js"

SUFFIX="${CFW_KEYCHAIN_SUFFIX:-}"
case "$SUFFIX" in
  ''|-[a-z0-9]*) ;;
  *) echo "cloud-firewall launcher: CFW_KEYCHAIN_SUFFIX must be empty or start with '-' followed by lowercase alphanumerics" >&2; exit 1 ;;
esac

keychain_read() {
  security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null
}

if [ -z "${CFW_CLIENT_ID:-}" ]; then
  if ! CFW_CLIENT_ID="$(keychain_read cfw-client-id$SUFFIX)"; then
    echo "cloud-firewall launcher: CFW_CLIENT_ID not in env and Keychain item 'cfw-client-id$SUFFIX' missing — create it with: security add-generic-password -a \"\$USER\" -s cfw-client-id$SUFFIX -w" >&2
    exit 1
  fi
  export CFW_CLIENT_ID
fi

if [ -z "${CFW_ACCESS_KEY:-}" ]; then
  if ! CFW_ACCESS_KEY="$(keychain_read cfw-access-key$SUFFIX)"; then
    echo "cloud-firewall launcher: CFW_ACCESS_KEY not in env and Keychain item 'cfw-access-key$SUFFIX' missing — create it with: security add-generic-password -a \"\$USER\" -s cfw-access-key$SUFFIX -w" >&2
    exit 1
  fi
  export CFW_ACCESS_KEY
fi

# Optional per-deployment SIC one-time password. The create tool resolves the
# literal argument "$env:CFW_SIC_OTP" to this variable, so the password never
# appears in the conversation. Absent is fine — the OTP can be given inline.
# Read once at startup: after changing the item, reconnect the server so the
# new value is picked up. Set it before starting a session, delete it once the
# deployment completes:
#   security add-generic-password -U -a "$USER" -s cfw-sic-otp -w
#   security delete-generic-password -a "$USER" -s cfw-sic-otp
if [ -z "${CFW_SIC_OTP:-}" ]; then
  if CFW_SIC_OTP="$(keychain_read cfw-sic-otp)"; then
    export CFW_SIC_OTP
  fi
fi

export CFW_REGION="${CFW_REGION:-EU}"
# CFW_MODE / CFW_CPCF_ENV are deliberately not set here — the server's own
# defaults (advisor / prod) apply unless the client config or args override.

# GUI-launched clients (Claude Desktop) get a minimal PATH without nvm,
# so fall back to well-known node locations. A candidate must actually run —
# a half-installed node (e.g. Homebrew with a missing dylib) is skipped — AND
# satisfy the package's engines range (>= 20): the nvm glob expands in
# lexicographic order, so without the version check an old install (v14 sorts
# before v20) would win and die with an opaque ESM/AbortSignal error.
node_ok() {
  command -v "$1" >/dev/null 2>&1 || return 1
  local major
  major="$("$1" -e 'process.stdout.write(process.versions.node.split(".")[0])' 2>/dev/null)" || return 1
  [ "${major:-0}" -ge 20 ]
}

NODE=""
for candidate in node "$HOME"/.nvm/versions/node/*/bin/node /opt/homebrew/bin/node /usr/local/bin/node; do
  if node_ok "$candidate"; then
    NODE="$(command -v "$candidate")"
    break
  fi
done
if [ -z "$NODE" ]; then
  echo "cloud-firewall launcher: no node >= 20 found on PATH, in ~/.nvm, or in Homebrew locations" >&2
  exit 1
fi

if [ -f "$SERVER" ]; then
  exec "$NODE" "$SERVER" "$@"
fi

# npx is a node script: run the one shipped with the selected node, with that
# node first on PATH so the package itself runs under it too.
NODE_BIN="$(dirname "$NODE")"
NPX="$NODE_BIN/npx"
if [ ! -x "$NPX" ]; then
  echo "cloud-firewall launcher: $SERVER not found and no npx next to $NODE — build the repo (npm run nx:build:cloud-firewall) or install npm" >&2
  exit 1
fi
export PATH="$NODE_BIN:$PATH"
# --package + bin name (not a bare spec) so any spec works — a version pin, a
# tarball path or a URL; a bare path would be executed rather than installed.
exec "$NPX" -y --package="${CFW_PACKAGE:-@chkp/cloud-firewall-mcp}" -- cloud-firewall-mcp "$@"
