#!/usr/bin/env bash
set -euo pipefail
umask 077

PAINEL_RAIZ="/opt/gastaomatos/luana/painel_os"
cd "$PAINEL_RAIZ"

# O servidor recusa subir sem build ou credencial válida. O exec deixa o
# processo real visível ao cron e evita um wrapper órfão escondendo falha.
exec /usr/bin/python3 -u servidor/servir.py >> servidor/painel.log 2>&1
