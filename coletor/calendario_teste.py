#!/usr/bin/env python3
import json
import tempfile
from pathlib import Path

import coletar_estado as c


fonte = Path(__file__).resolve().parents[1] / "data" / "calendario.json"
ok = c.ler_calendario(fonte)
assert ok["status"] == "pronto"
assert ok["totais"]["reunioes_ocorridas"] is None
assert all(isinstance(ok["totais"][campo], int) and ok["totais"][campo] >= 0
           for campo in ("eventos_agendados", "minutos_agendados",
                         "horarios_encerrados_ate_coleta", "eventos_futuros_na_coleta",
                         "blocos_ocupados"))
assert sum(x["eventos_agendados"] for x in ok["dias"]) == ok["totais"]["eventos_agendados"]
assert sum(x["minutos_agendados"] for x in ok["dias"]) == ok["totais"]["minutos_agendados"]
assert sum(x["horario_encerrado_ate_coleta"] for x in ok["dias"]) == ok["totais"]["horarios_encerrados_ate_coleta"]
assert sum(x["futuros_na_coleta"] for x in ok["dias"]) == ok["totais"]["eventos_futuros_na_coleta"]
coleta = c.datetime.fromisoformat(ok["coletado_em"].replace("Z", "+00:00"))
assert ok["vencido"] == (c.agora_utc() - coleta.astimezone(c.timezone.utc) > c.timedelta(hours=24))

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
