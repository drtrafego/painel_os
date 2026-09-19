#!/usr/bin/env python3
import json
import tempfile
from pathlib import Path

from sanitizar_calendario import ErroCalendario, gravar_atomico, sanitizar


INICIO = "2026-09-01T00:00:00-03:00"
FIM = "2026-09-16T00:00:00-03:00"
COLETA = "2026-09-08T20:28:30-03:00"
bruto = {"events": [{
    "id": "segredo", "summary": "Nome de uma pessoa", "description": "Telefone 5511999999999",
    "location": "endereço", "url": "https://privado", "start": "2026-09-08T18:00:00-03:00",
    "end": "2026-09-08T19:00:00-03:00", "transparency": "opaque", "my_response_status": "accepted",
}], "next_page_token": None}
saida = sanitizar(bruto, INICIO, FIM, COLETA)
texto = json.dumps(saida, ensure_ascii=False)
assert saida["totais"]["eventos_agendados"] == 1
assert saida["totais"]["horarios_encerrados_ate_coleta"] == 1
assert saida["totais"]["reunioes_ocorridas"] is None
for proibido in ("segredo", "Nome de uma pessoa", "5511999999999", "endereço", "https://privado"):
    assert proibido not in texto, proibido

for nome, ruim in {
    "página incompleta": {**bruto, "next_page_token": "continua"},
    "evento fora da janela": {"events": [{"start": "2026-10-01T10:00:00-03:00", "end": "2026-10-01T11:00:00-03:00"}]},
    "sem fuso": {"events": [{"start": "2026-09-08T10:00:00", "end": "2026-09-08T11:00:00"}]},
}.items():
    try:
        sanitizar(ruim, INICIO, FIM, COLETA)
    except ErroCalendario:
        pass
    else:
        raise AssertionError(f"deveria recusar: {nome}")

with tempfile.TemporaryDirectory() as pasta:
    alvo = Path(pasta) / "estado.json"
    gravar_atomico(alvo, saida)
    assert json.loads(alvo.read_text(encoding="utf-8")) == saida

print("ok  calendário: agregado sem PII, atômico e falha fechado")
