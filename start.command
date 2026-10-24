#!/bin/bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$ROOT/scripts/macos.sh"
trap xgs_finish EXIT
xgs_find_node
APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
export DSH_CLI="${DSH_CLI:-$APP/Contents/Resources/runtime/cli/bin/dsh}"
if [ ! -x "$DSH_CLI" ]; then
  printf '找不到 DeepSeek Harness CLI：%s\n可用 DSH_APP 或 DSH_CLI 指定安装路径。\n' "$DSH_CLI" >&2
  exit 1
fi
cd -- "$ROOT"
printf 'XGS · DeepSeek Harness\n项目：%s\nNode：%s\n' "$ROOT" "$XGS_NODE"
"$XGS_NODE" --check "$ROOT/index.js"
case "${1:-}" in
  --check)
    "$XGS_NODE" "$ROOT/scripts/manage.cjs" check
    "$DSH_CLI" --version
    printf '\n检查通过；未安装或启动会话。\n'
    ;;
  --uninstall)
    "$XGS_NODE" "$ROOT/scripts/manage.cjs" uninstall
    ;;
  --install-only)
    "$XGS_NODE" "$ROOT/scripts/manage.cjs" install
    ;;
  '')
    "$XGS_NODE" "$ROOT/scripts/manage.cjs" install
    printf '\n正在打开 DeepSeek Harness。如应用已经打开，请完全退出后重开，再新建对话发送 XGS。\n'
    open -a "$APP"
    ;;
  *)
    printf '用法：start.command [--check | --install-only | --uninstall]\n' >&2
    exit 1
    ;;
esac
