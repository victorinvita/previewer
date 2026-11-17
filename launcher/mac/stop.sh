#!/bin/bash
# Detiene el servidor de Previewer.
source "$(dirname "$0")/common.sh"
PIDS="$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null)"
if [ -n "$PIDS" ]; then
  kill $PIDS
  echo "Previewer detenido."
else
  echo "Previewer no estaba corriendo."
fi
