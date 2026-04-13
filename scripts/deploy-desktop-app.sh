#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_PRODUCT_NAME="$(node -p "require('$ROOT_DIR/package.json').build.productName")"
PRODUCT_APP_NAME="${DEFAULT_PRODUCT_NAME}.app"
DESKTOP_APP_NAME="$PRODUCT_APP_NAME"
SHOULD_OPEN="false"
SHOULD_PACK="true"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "deploy:desktop 目前仅支持 macOS。" >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --open)
      SHOULD_OPEN="true"
      shift
      ;;
    --name)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "--name 需要传入应用名称，例如：--name 'My Codex'" >&2
        exit 1
      fi
      DESKTOP_APP_NAME="${2}.app"
      shift 2
      ;;
    --skip-pack)
      SHOULD_PACK="false"
      shift
      ;;
    *)
      echo "不支持的参数: $1" >&2
      exit 1
      ;;
  esac
done

BUILD_APP_PATH="$ROOT_DIR/release/mac-arm64/$PRODUCT_APP_NAME"
DESKTOP_APP_PATH="$HOME/Desktop/$DESKTOP_APP_NAME"

if [[ "$SHOULD_PACK" == "true" ]]; then
  echo "Building app package..."
  npm --prefix "$ROOT_DIR" run pack
else
  echo "Skip pack, using existing build output..."
fi

if [[ ! -d "$BUILD_APP_PATH" ]]; then
  echo "Build output not found: $BUILD_APP_PATH" >&2
  exit 1
fi

echo "Closing running app if needed..."
osascript -e "tell application \"$DEFAULT_PRODUCT_NAME\" to quit" >/dev/null 2>&1 || true
osascript -e "tell application \"${DESKTOP_APP_NAME%.app}\" to quit" >/dev/null 2>&1 || true
pkill -x "$DEFAULT_PRODUCT_NAME" >/dev/null 2>&1 || true
pkill -x "${DESKTOP_APP_NAME%.app}" >/dev/null 2>&1 || true

echo "Replacing desktop app..."
rm -rf "$DESKTOP_APP_PATH"
cp -R "$BUILD_APP_PATH" "$DESKTOP_APP_PATH"

if [[ "$SHOULD_OPEN" == "true" ]]; then
  echo "Opening desktop app..."
  open "$DESKTOP_APP_PATH"
fi

echo "Desktop app updated: $DESKTOP_APP_PATH"
