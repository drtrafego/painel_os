#!/usr/bin/env bash
set -euo pipefail

RAIZ_PAINEL="/opt/gastaomatos/luana/painel_os"
DOMINIO="painel.casaldotrafego.com"
IP_ESPERADO="31.97.21.249"
DESTINO="/etc/nginx/conf.d/painel-os.conf"
BACKUP=""
ATIVADO=0

restaurar_se_falhar() {
  [[ "$ATIVADO" == "1" ]] && return 0
  /usr/bin/rm -f "$RAIZ_PAINEL/servidor/.https-ativo"
  if [[ -n "$BACKUP" && -f "$BACKUP" ]]; then
    /usr/bin/install -o root -g root -m 0644 "$BACKUP" "$DESTINO"
  else
    /usr/bin/rm -f "$DESTINO"
  fi
  /usr/sbin/nginx -t >/dev/null 2>&1 && /usr/bin/systemctl reload nginx || true
  [[ -n "$BACKUP" ]] && /usr/bin/rm -f "$BACKUP"
  codigo=$(/usr/bin/curl --silent --output /dev/null --write-out '%{http_code}' \
    --max-time 2 http://127.0.0.1:5199/ || true)
  if [[ "$codigo" != "401" ]]; then
    /usr/sbin/runuser -u claude -- /usr/bin/bash -lc \
      "setsid '$RAIZ_PAINEL/servidor/iniciar.sh' </dev/null >/dev/null 2>&1 &"
  fi
}

if [[ ${EUID} -ne 0 ]]; then
  echo "rode com sudo: sudo $RAIZ_PAINEL/servidor/ativar-https.sh" >&2
  exit 2
fi

for comando in /usr/bin/curl /usr/bin/python3 /usr/bin/install /usr/sbin/nginx /usr/bin/systemctl /usr/bin/certbot /usr/sbin/ss /usr/sbin/runuser; do
  [[ -x "$comando" ]] || { echo "dependência ausente: $comando" >&2; exit 5; }
done

# Consulta DNS público, não o resolvedor local desta máquina, que devolve
# loopback para nomes inexistentes. NXDOMAIN precisa parar antes do certbot.
IP_DNS=$(/usr/bin/curl -fsS "https://cloudflare-dns.com/dns-query?name=$DOMINIO&type=A" -H 'accept: application/dns-json' \
  | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((x["data"] for x in d.get("Answer",[]) if x.get("type")==1), ""))')
if [[ "$IP_DNS" != "$IP_ESPERADO" ]]; then
  echo "DNS ainda não aponta $DOMINIO para $IP_ESPERADO (resposta: ${IP_DNS:-NXDOMAIN})" >&2
  exit 3
fi

trap restaurar_se_falhar EXIT
if [[ -e "$DESTINO" ]]; then
  BACKUP=$(/usr/bin/mktemp /tmp/painel-os-nginx.XXXXXX.conf)
  /usr/bin/cp --preserve=mode,ownership,timestamps "$DESTINO" "$BACKUP"
fi

/usr/bin/install -o root -g root -m 0644 "$RAIZ_PAINEL/servidor/nginx-painel-os.conf" "$DESTINO"
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
/usr/bin/certbot --nginx --non-interactive --agree-tos --redirect -d "$DOMINIO"
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx

# Só fecha a porta pública depois que o HTTPS existe. Reinicia o mesmo servidor
# como claude, nunca como root, e valida o processo exato antes de encerrá-lo.
/usr/bin/touch "$RAIZ_PAINEL/servidor/.https-ativo"
/usr/bin/chown claude:claude "$RAIZ_PAINEL/servidor/.https-ativo"
for pid in $(/usr/sbin/ss -ltnpH 'sport = :5199' | /usr/bin/grep -o 'pid=[0-9]*' | /usr/bin/cut -d= -f2 | /usr/bin/sort -u); do
  if /usr/bin/tr '\0' ' ' < "/proc/$pid/cmdline" | /usr/bin/grep -q 'servidor/servir.py'; then
    /usr/bin/kill "$pid"
  else
    echo "porta 5199 pertence a outro processo; não encerrei" >&2
    exit 4
  fi
done
/usr/sbin/runuser -u claude -- /usr/bin/bash -lc "setsid '$RAIZ_PAINEL/servidor/iniciar.sh' </dev/null >/dev/null 2>&1 &"
for _ in {1..20}; do
  [[ "$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:5199/ || true)" == "401" ]] && break
  /usr/bin/sleep .25
done
[[ "$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:5199/)" == "401" ]]
[[ "$(/usr/bin/curl -sS -o /dev/null -w '%{http_code}' https://$DOMINIO/)" == "401" ]]
ATIVADO=1
[[ -n "$BACKUP" ]] && /usr/bin/rm -f "$BACKUP"
echo "HTTPS ativo em https://$DOMINIO; backend preso ao loopback."
