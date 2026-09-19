#!/usr/bin/env python3
import json
import tempfile
from pathlib import Path

import coletar_estado as c


fonte = Path(__file__).resolve().parents[1] / "data" / "calendario.json"
ok = c.ler_calendario(fonte)
assert ok["status"] == "pronto" and ok["totais"]["eventos_agendados"] == 38
assert ok["totais"]["reunioes_ocorridas"] is None
assert ok["vencido"] is False
assert sum(x["eventos_agendados"] for x in ok["dias"]) == 38

with tempfile.TemporaryDirectory() as pasta:
    alvo = Path(pasta) / "calendario.json"
    ruim = json.loads(fonte.read_text(encoding="utf-8"))
    ruim["totais"]["eventos_agendados"] = 0
    alvo.write_text(json.dumps(ruim), encoding="utf-8")
    falha = c.ler_calendario(alvo)
    assert falha["status"] == "erro" and falha["totais"] is None and falha["erro"]

    ruim = json.loads(fonte.read_text(encoding="utf-8"))
    ruim["summary"] = "dado livre não permitido"
    alvo.write_text(json.dumps(ruim), encoding="utf-8")
    falha = c.ler_calendario(alvo)
    assert falha["status"] == "erro" and falha["totais"] is None and falha["vencido"] is None

print("ok  calendário: leitura fecha totais e recusa contrato adulterado")
