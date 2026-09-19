#!/usr/bin/env bash
# Fala com o painel SEM que a credencial apareça em saída nenhuma.
#
# POR QUE ISTO EXISTE: em 10/09/2026 a senha do painel vazou DUAS VEZES na saída
# de agentes que só queriam conferir a tela. Nos dois casos o briefing dizia "não
# imprima a senha", e nos dois ela apareceu. A instrução não impede: o que impede
# é o agente NÃO PRECISAR ver a senha.
# É a trava na porta, não na decisão.
#
#   ./abrir.sh /api/estado           -> corpo da resposta
#   ./abrir.sh /#cofre --http        -> só o código HTTP
#   ./abrir.sh /api/estado --arquivo /tmp/e.json
set -u
CRED_FILE="/opt/gastaomatos/luana/.painel_os.credencial"
BASE="${PAINEL_BASE:-https://painel.casaldotrafego.com}"
CAMINHO="${1:-/}"; shift || true
[ -r "$CRED_FILE" ] || { echo "ERRO: nao consigo ler a credencial" >&2; exit 2; }
# a credencial entra pelo stdin do curl: nunca vai pra linha de comando (ps/history)
_curl() { curl -sS --netrc-file /dev/null -K - "$@" <<CFG
user = "$(grep -v '^#' "$CRED_FILE" | grep ':' | head -1)"
CFG
}
case "${1:-}" in
  --http)    _curl -o /dev/null -m 40 -w "%{http_code}\n" "$BASE$CAMINHO" ;;
  --arquivo) _curl -o "$2" -m 60 -w "http=%{http_code} bytes=%{size_download}\n" "$BASE$CAMINHO" ;;
  *)         _curl -m 60 "$BASE$CAMINHO" ;;
esac
