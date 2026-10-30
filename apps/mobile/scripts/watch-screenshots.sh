#!/bin/sh
# Captures the Apple Watch store/verification screenshots from a booted watchOS simulator.
#
#   sh apps/mobile/scripts/watch-screenshots.sh <simulator-udid> <size-label> [content-origin]
#
# Expects a Debug build of the ManualSAMURWatch target already installed on the simulator
# (see apps/mobile/targets/watch/README.md). Pass an unreachable content origin such as
# http://127.0.0.1:9 to capture the offline state. Uses the DEBUG-only launch arguments
# -DebugRoute / -DebugSearchCodes / -DebugSearchDrugs / -ContentOrigin.
set -eu
udid="$1"
label="$2"
origin="${3:-}"
bundle="es.madrid.samur.manual.watchkitapp"
out="$(cd "$(dirname "$0")/.." && pwd)/release/screenshots/watch"
mkdir -p "$out"

shot() {
  name="$1"
  shift
  set -- "$@"
  [ -n "$origin" ] && set -- -ContentOrigin "$origin" "$@"
  # The first launch right after an install is occasionally refused ("Scene update failed").
  xcrun simctl launch --terminate-running-process "$udid" "$bundle" "$@" >/dev/null 2>&1 \
    || { sleep 3; xcrun simctl launch --terminate-running-process "$udid" "$bundle" "$@" >/dev/null; }
  sleep 6
  xcrun simctl io "$udid" screenshot "$out/$label-$name.png" >/dev/null 2>&1
  echo "$out/$label-$name.png"
}

shot 01-codigos -DebugRoute codes
shot 02-codigos-busqueda -DebugRoute codes -DebugSearchCodes "parada"
shot 03-codigo-detalle -DebugRoute code:incidente:1.3
shot 04-vademecum -DebugRoute drugs
shot 05-vademecum-detalle -DebugRoute drug:adrenalina
shot 06-vademecum-comercial -DebugRoute drugs -DebugSearchDrugs "actilyse"
shot 07-status4 -DebugRoute status4
shot 08-acerca-de -DebugRoute about
