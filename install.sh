#!/usr/bin/env bash
set -euo pipefail

UUID="island@caionazario.dev"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

usage() {
  echo "Uso: $0 [--uninstall]"
  exit 1
}

uninstall() {
  if [[ -d "$TARGET_DIR" ]]; then
    rm -rf "$TARGET_DIR"
    echo "Removido: $TARGET_DIR"
  else
    echo "Nada instalado em $TARGET_DIR"
  fi
}

install() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  make -C "$script_dir" build

  rm -rf "$TARGET_DIR"
  mkdir -p "$TARGET_DIR"
  cp -r "$script_dir/dist/." "$TARGET_DIR/"

  echo "Instalado em: $TARGET_DIR"
  echo "Faça logout/login para carregar (Wayland não recarrega em quente)."
}

case "${1:-}" in
  --uninstall)
    uninstall
    ;;
  "")
    install
    ;;
  *)
    usage
    ;;
esac
