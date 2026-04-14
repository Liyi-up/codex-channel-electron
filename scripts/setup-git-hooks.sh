#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$ROOT_DIR/scripts/git-hooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "hooks 目录不存在: $HOOKS_DIR" >&2
  exit 1
fi

chmod +x "$HOOKS_DIR"/*
git -C "$ROOT_DIR" config core.hooksPath scripts/git-hooks

echo "Git hooks 已启用: core.hooksPath=scripts/git-hooks"
echo "post-commit 将在每次 commit 后自动执行 deploy:desktop:silent（只替换，不打包）"
echo "如需临时跳过：SKIP_AUTO_DESKTOP_DEPLOY=1 git commit -m \"...\""
