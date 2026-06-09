#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"
NPM_CLI="$ROOT_DIR/.tools/npm-cli/package/bin/npm-cli.js"
CACHE_DIR="$ROOT_DIR/.npm-cache"
NPM_VERSION="11.16.0"
NPM_TARBALL_URL="https://registry.npmjs.org/npm/-/npm-${NPM_VERSION}.tgz"

if [[ -z "${NODE_BIN}" ]]; then
  echo "ไม่พบ node ในเครื่องนี้"
  exit 1
fi

mkdir -p "$ROOT_DIR/.tools/npm-cli" "$CACHE_DIR"

if [[ ! -f "$NPM_CLI" ]]; then
  echo "กำลังเตรียม npm ชั่วคราวสำหรับโปรเจกต์นี้..."
  curl -L "$NPM_TARBALL_URL" -o "$ROOT_DIR/.tools/npm.tgz"
  tar -xzf "$ROOT_DIR/.tools/npm.tgz" -C "$ROOT_DIR/.tools/npm-cli"
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "กำลังติดตั้งแพ็กเกจที่จำเป็น..."
  "$NODE_BIN" "$NPM_CLI" install --cache "$CACHE_DIR"
fi

echo "กำลังเปิดแอปที่ http://localhost:3000"
exec "$NODE_BIN" "$NPM_CLI" run dev -- --hostname 0.0.0.0
