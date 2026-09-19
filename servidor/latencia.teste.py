#!/usr/bin/env python3
"""Prova do cold-open: uma coleta, espera limitada e snapshot sem hora falsa."""

import importlib.util
import json
import tempfile
import threading
import time
from pathlib import Path
from types import SimpleNamespace

MODULO = Path(__file__).with_name("servir.py")
spec = importlib.util.spec_from_file_location("painel_servir_latencia", MODULO)
servir = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(servir)

passou = 0


def ok(nome, condicao):
    global passou
    if not condicao:
        raise AssertionError(nome)
    passou += 1
    print(f"  ok    {nome}")


with tempfile.TemporaryDirectory(prefix="painel-latencia-") as pasta:
    estado = Path(pasta) / "estado.json"
    estado.write_text(json.dumps({"gerado_em": "2026-09-08T20:00:00Z", "marcador": "antigo"}))
    servir.ESTADO = estado
    servir.COLETOR = Path(pasta) / "coletor.py"

    iniciou = threading.Event()
    liberar = threading.Event()
    chamadas = 0
    trava_chamadas = threading.Lock()

    def coleta_lenta(*args, **kwargs):
        del args, kwargs
        global chamadas
        with trava_chamadas:
            chamadas += 1
        iniciou.set()
        liberar.wait(2)
        estado.write_text(json.dumps({"gerado_em": "2026-09-09T02:00:00Z", "marcador": "novo"}))
        return SimpleNamespace(returncode=0, stderr="")

    servir.subprocess.run = coleta_lenta
    with servir._coleta_pronta:
        servir._cache.update(quando=0.0, corpo=b"")
        servir._coleta_em_andamento = False

    respostas = []
    duracoes = []

    def pedir():
        inicio = time.monotonic()
        respostas.append(json.loads(servir.coletar(limite_espera=0.12)))
        duracoes.append(time.monotonic() - inicio)

    t1 = threading.Thread(target=pedir)
    t2 = threading.Thread(target=pedir)
    t1.start()
    iniciou.wait(1)
    t2.start()
    t1.join(1)
    t2.join(1)

    ok("duas requisições frias disparam um único subprocesso", chamadas == 1)
    ok("as duas respostas respeitam o teto de espera", len(duracoes) == 2 and max(duracoes) < 0.5)
    ok("o fallback declara que a coleta continua", all(x.get("coleta_em_andamento") is True for x in respostas))
    ok("o snapshot velho não recebe calculado_em novo", all("calculado_em" not in x for x in respostas))
    ok("a idade materializada do snapshot é preservada", all(x.get("gerado_em") == "2026-09-08T20:00:00Z" for x in respostas))

    liberar.set()
    limite = time.monotonic() + 2
    while servir._coleta_em_andamento and time.monotonic() < limite:
        time.sleep(0.01)
    nova = json.loads(servir.coletar(limite_espera=0.2))
    ok("a coleta concluída substitui o snapshot", nova.get("marcador") == "novo")
    ok("a medição concluída traz a própria hora", nova.get("calculado_ao_abrir") is True and "calculado_em" in nova)
    ok("o cache recente não dispara outra coleta", chamadas == 1)

try:
    raise BrokenPipeError("cliente fechou")
except BrokenPipeError:
    servidor_falso = object.__new__(servir.ServidorPainel)
    servidor_falso.handle_error(None, ("127.0.0.1", 1))
    ok("desconexão do cliente é encerrada sem traceback", True)

print(f"\nAPROVADO: {passou} provas de latência, concorrência e desconexão.")
