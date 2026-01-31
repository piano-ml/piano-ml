#!/usr/bin/env bash
set -euo pipefail

# Wrapper pour exécuter Autoharmonizer dans son venv dédié.
# Usage:
#   ./scripts/autoharmonizer.sh [args...]
# Exemples:
#   ./scripts/autoharmonizer.sh
#   ./scripts/autoharmonizer.sh tun

VENV_BIN="/home/appuser/autoharmonizer-venv/bin"
APP_DIR="/home/appuser/autoharmonizer"

if [[ ! -x "${VENV_BIN}/python" ]]; then
  echo "[autoharmonizer] Venv introuvable: ${VENV_BIN}/python" >&2
  exit 1
fi

if [[ ! -f "${APP_DIR}/harmonizer.py" ]]; then
  echo "[autoharmonizer] Code introuvable: ${APP_DIR}/harmonizer.py" >&2
  exit 1
fi

exec "${VENV_BIN}/python" "${APP_DIR}/harmonizer.py" "$@"

