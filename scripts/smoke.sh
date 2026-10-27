#!/usr/bin/env bash
# Sobe um GNOME Shell headless isolado, liga e desliga a extensão várias vezes
# (o disable() roda a cada lock de tela) e falha se a extensão não ficar ativa
# ou se o log tiver erro ou aviso de JS. Tudo fica em dist/smoke, inclusive o
# HOME: o dconf, as extensões e as credenciais da sessão real não são tocados.
set -euo pipefail

UUID="island@caionazario.dev"
CYCLES="${SMOKE_CYCLES:-20}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/dist/smoke"
LOG="$WORK/shell.log"
# logError/console.error saem como `GNOME Shell-CRITICAL`, console.warn como
# `GNOME Shell-WARNING`.
ERROR_PATTERN='JS ERROR|JS WARNING|Gjs-CRITICAL|Gjs-WARNING|GNOME Shell-CRITICAL|GNOME Shell-WARNING'

fail() {
  echo "smoke: $*" >&2
  exit 1
}

extension_state() {
  LC_ALL=C gnome-extensions info "$UUID" | sed -n 's/^ *State: *//p'
}

wait_for_state() {
  local expected="$1" state=""
  for _ in $(seq 50); do
    state="$(extension_state)"
    [[ "$state" == "$expected" ]] && return 0
    sleep 0.1
  done
  fail "esperava estado $expected, veio '$state'"
}

# Roda dentro do dbus-run-session: o Shell e o gnome-extensions falam pelo
# barramento de sessão isolado. Chamado fora dele, o gnome-extensions acharia
# o Shell da sessão real e ligaria e desligaria a extensão instalada lá.
inside_session() {
  [[ "${ISLAND_SMOKE_SESSION:-}" == "$WORK" ]] || fail "--inside-session só roda chamado pelo próprio smoke"
  exec 1>&3 2>&4
  gnome-shell --headless --no-x11 --virtual-monitor 1600x900 >"$LOG" 2>&1 &
  SHELL_PID=$!
  trap 'kill "$SHELL_PID" 2>/dev/null; wait "$SHELL_PID" 2>/dev/null || true' EXIT
  gdbus wait --session --timeout 60 org.gnome.Shell || fail "o Shell não subiu (veja $LOG)"

  gnome-extensions enable "$UUID"
  wait_for_state ACTIVE
  for cycle in $(seq "$CYCLES"); do
    gnome-extensions disable "$UUID"
    wait_for_state INACTIVE
    gnome-extensions enable "$UUID"
    wait_for_state ACTIVE
    echo "smoke: ciclo $cycle/$CYCLES"
  done
  sleep 2
}

prepare_home() {
  local target="$WORK/data/gnome-shell/extensions/$UUID"
  rm -rf "$WORK"
  mkdir -p "$target" "$WORK/home" "$WORK/config" "$WORK/cache" "$WORK/state"
  find "$ROOT/dist" -mindepth 1 -maxdepth 1 ! -name smoke -exec cp -r {} "$target/" \;
}

main() {
  [[ -f "$ROOT/dist/metadata.json" ]] || fail "rode make build antes"
  prepare_home
  export XDG_DATA_HOME="$WORK/data" XDG_CONFIG_HOME="$WORK/config"
  export XDG_CACHE_HOME="$WORK/cache" XDG_STATE_HOME="$WORK/state"
  export HOME="$WORK/home" ISLAND_SMOKE_SESSION="$WORK"
  # O dbus-daemon e os serviços que ele ativa falam muito: vão para
  # session.log, e os fds 3 e 4 devolvem a saída do próprio smoke ao terminal.
  dbus-run-session -- "${BASH_SOURCE[0]}" --inside-session 3>&1 4>&2 >"$WORK/session.log" 2>&1
  # Serviços que a sessão ativa (Screencast, portais) escrevem no mesmo log
  # com o prefixo `(processo:pid):`; só os do gnome-shell contam.
  if grep -En "$ERROR_PATTERN" "$LOG" | grep -vP '^\d+:\((?!gnome-shell:)[^:]+:\d+\):'; then
    fail "erros no log do Shell ($LOG)"
  fi
  echo "smoke: ok, $CYCLES ciclos sem erro"
}

if [[ "${1:-}" == "--inside-session" ]]; then
  inside_session
else
  main
fi
