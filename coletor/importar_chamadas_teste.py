#!/usr/bin/env python3
import json
import tempfile
from pathlib import Path

from chamadas_ingestao import ErroIngestao
from importar_chamadas import importar

BASE = {"schema":"painel-os/chamada@1","escopo_id":"gastaomatos","chamada_id":"call-1","origem_id":"export-1","ocorrido_em":"2026-09-08T12:00:00Z","citacoes":[{"id":"c1","trecho":"A resposta atrasou","inicio_s":12,"fim_s":15}],"achados":[{"id":"a1","tipo":"dor","rotulo":"resposta atrasada","citacao_ids":["c1"]}]}

testes = 0
with tempfile.TemporaryDirectory() as tmp:
    raiz = Path(tmp); origem = raiz/"origem"; destino = raiz/"destino"
    origem.mkdir(); (origem/"nome-privado.json").write_text(json.dumps(BASE), encoding="utf-8")
    novos, total = importar(origem, destino)
    assert (novos, total) == (1, 1); testes += 1
    arquivos = list(destino.glob("*.json"))
    assert len(arquivos) == 1 and arquivos[0].name != "nome-privado.json"; testes += 1
    assert arquivos[0].stat().st_mode & 0o077 == 0; testes += 1
    assert destino.stat().st_mode & 0o077 == 0; testes += 1
    assert importar(origem, destino) == (0, 1); testes += 1

    ruim = {**BASE, "chamada_id":"call-2", "ocorrido_em":"sem-data"}
    (origem/"ruim.json").write_text(json.dumps(ruim), encoding="utf-8")
    antes = {p.name: p.read_bytes() for p in destino.glob("*.json")}
    try:
        importar(origem, destino)
        raise AssertionError("deveria rejeitar o lote")
    except ErroIngestao:
        pass
    assert {p.name: p.read_bytes() for p in destino.glob("*.json")} == antes; testes += 1

with tempfile.TemporaryDirectory() as tmp:
    raiz = Path(tmp); origem = raiz/"origem"; destino = raiz/"destino"
    origem.mkdir()
    outro = {**BASE, "escopo_id":"cliente-x"}
    (origem/"cliente.json").write_text(json.dumps(outro), encoding="utf-8")
    try:
        importar(origem, destino)
        raise AssertionError("deveria rejeitar escopo")
    except ErroIngestao as exc:
        assert "escopo não autorizado" in str(exc)
    assert not list(destino.glob("*.json")); testes += 1

with tempfile.TemporaryDirectory() as tmp:
    raiz = Path(tmp); origem = raiz/"origem"; destino = raiz/"destino"
    origem.mkdir()
    alvo = raiz/"fora.json"
    alvo.write_text(json.dumps(BASE), encoding="utf-8")
    (origem/"atalho.json").symlink_to(alvo)
    try:
        importar(origem, destino)
        raise AssertionError("deveria rejeitar link simbólico")
    except ErroIngestao as exc:
        assert "entrada insegura" in str(exc)
    assert not list(destino.glob("*.json")); testes += 1

print(f"{testes} passaram, 0 falharam")
