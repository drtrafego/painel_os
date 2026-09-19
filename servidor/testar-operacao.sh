#!/usr/bin/env bash
set -euo pipefail

RAIZ_PAINEL="/opt/gastaomatos/luana/painel_os"
PORTA_TESTE="15199"
PID=""
LOG_TESTE=$(/usr/bin/mktemp /tmp/painel-os-teste.XXXXXX.log)
encerrar() {
  [[ -n "$PID" ]] && kill "$PID" 2>/dev/null || true
  /usr/bin/rm -f "$LOG_TESTE"
}
trap encerrar EXIT

/usr/bin/bash -n "$RAIZ_PAINEL/servidor/iniciar.sh" "$RAIZ_PAINEL/servidor/ativar-https.sh" "$RAIZ_PAINEL/servidor/garantir-ativo.sh"
/usr/bin/test -x "$RAIZ_PAINEL/servidor/iniciar.sh"
/usr/bin/test -x "$RAIZ_PAINEL/servidor/garantir-ativo.sh"
/usr/bin/crontab -l | /usr/bin/grep -Fxq '@reboot /opt/gastaomatos/luana/painel_os/servidor/iniciar.sh'
/usr/bin/crontab -l | /usr/bin/grep -Fxq '* * * * * umask 077; /opt/gastaomatos/luana/painel_os/servidor/garantir-ativo.sh >> /opt/gastaomatos/luana/painel_os/servidor/watchdog.log 2>&1'
/usr/bin/python3 "$RAIZ_PAINEL/servidor/latencia.teste.py"

PAINEL_OS_ENDERECO=127.0.0.1 PAINEL_OS_PORTA="$PORTA_TESTE" /usr/bin/python3 -u "$RAIZ_PAINEL/servidor/servir.py" >"$LOG_TESTE" 2>&1 &
PID=$!
for _ in {1..20}; do
  if [[ "$(/usr/bin/curl --silent --output /dev/null --write-out '%{http_code}' --max-time 1 "http://127.0.0.1:$PORTA_TESTE/" || true)" == "401" ]]; then
    echo "OK: boot e watchdog instalados, scripts válidos e servidor alternativo respondeu 401 protegido."
    exit 0
  fi
  sleep .2
done
echo "servidor de teste não respondeu como esperado" >&2
exit 1
