#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/dev-webview.ts"

if command -v mise >/dev/null 2>&1; then
  exec mise exec -- bun run "$TARGET" "$@"
fi

exec bun run "$TARGET" "$@"
