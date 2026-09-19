#!/usr/bin/env bash
set -euo pipefail
umask 077

RAIZ_PAINEL="/opt/gastaomatos/luana/painel_os"
PORTA="5199"
TRAVA="/tmp/painel-os-watchdog.lock"

# Uma única instância decide. O watchdog nunca encerra processo: se a porta
# pertencer a outra coisa, falha alto para não causar dano tentando adivinhar.
exec 9>"$TRAVA"
/usr/bin/flock -n 9 || exit 0

mapfile -t PIDS < <(
  /usr/sbin/ss -ltnpH "sport = :$PORTA" 2>/dev/null \
    | /usr/bin/grep -o 'pid=[0-9]*' \
    | /usr/bin/cut -d= -f2 \
    | /usr/bin/sort -u || true
)

if (( ${#PIDS[@]} > 0 )); then
  for pid in "${PIDS[@]}"; do
    cmdline=$(/usr/bin/tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
    cwd=$(/usr/bin/readlink -f "/proc/$pid/cwd" 2>/dev/null || true)
    if [[ "$cmdline" == *'/opt/gastaomatos/luana/painel_os/servidor/servir.py'* ]] \
      || { [[ "$cwd" == "$RAIZ_PAINEL" ]] && [[ "$cmdline" == *'servidor/servir.py'* ]]; }; then
      codigo=$(/usr/bin/curl --silent --output /dev/null --write-out '%{http_code}' \
        --max-time 3 "http://127.0.0.1:$PORTA/" || true)
      if [[ "$codigo" == "401" ]]; then
        exit 0
      fi
      echo "painel-os: processo $pid existe, mas a porta local respondeu ${codigo:-sem resposta}; não reiniciei às cegas" >&2
      exit 1
    fi
  done
  echo "painel-os: porta $PORTA pertence a outro processo; não reiniciei" >&2
  exit 1
fi

cd "$RAIZ_PAINEL"
/usr/bin/setsid "$RAIZ_PAINEL/servidor/iniciar.sh" </dev/null >/dev/null 2>&1 &

for _ in {1..20}; do
  codigo=$(/usr/bin/curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 1 "http://127.0.0.1:$PORTA/" || true)
  [[ "$codigo" == "401" ]] && exit 0
  /usr/bin/sleep .25
done

echo "painel-os: tentativa de recuperação não produziu uma porta protegida" >&2
exit 1
