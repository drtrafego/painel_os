#!/usr/bin/env python3
import json
import tempfile
from pathlib import Path

import coletar_estado as c


def conferir(nome, condicao):
    print(("ok    " if condicao else "FALHA ") + nome)
    if not condicao:
        raise AssertionError(nome)


valido = {
    "versao": 1,
    "fontes": [{
        "id": "drive-teste", "tipo": "google_drive",
        "origem": "Google Drive compartilhado pelo Gastão",
        "url": "https://drive.google.com/drive/folders/abc_123456",
        "recebido_em": "2026-09-09T13:17:26Z",
        "estado": "recebido_nao_importado", "arquivos": 2, "bytes": 30,
        "conjuntos": 1, "por_tipo": {"png": 2},
        "assinatura_inventario_sha256": "a" * 64,
        "observacao": c.OBSERVACAO_FONTE_ESTUDIO["recebido_nao_importado"]
    }]
}

with tempfile.TemporaryDirectory() as tmp:
    caminho = Path(tmp) / "fontes.json"
    caminho.write_text(json.dumps(valido), encoding="utf-8")
    lido = c.ler_fontes_estudio(caminho)
    conferir("manifesto válido preserva proveniência", lido["erro"] is None and lido["itens"][0]["arquivos"] == 2)

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["por_tipo"] = {"png": 1}
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("contagens divergentes falham fechadas", c.ler_fontes_estudio(caminho)["itens"] == [])

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["url"] = "https://exemplo.invalid/pasta"
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("URL fora do Google Drive é recusada", c.ler_fontes_estudio(caminho)["itens"] == [])

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["estado"] = "publicado"
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("recebimento nunca vira publicação", c.ler_fontes_estudio(caminho)["itens"] == [])

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["observacao"] = "Arquivos da Cliente Teste"
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("texto livre não atravessa o manifesto", c.ler_fontes_estudio(caminho)["itens"] == [])

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["por_tipo"] = {"png": 3, "nome-de-cliente": -1}
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("tipo livre e contagem negativa não compensam o total", c.ler_fontes_estudio(caminho)["itens"] == [])

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["recebido_em"] = "2026-09-09T13:17:26"
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("proveniência sem fuso falha fechada", c.ler_fontes_estudio(caminho)["itens"] == [])

    quebrado = json.loads(json.dumps(valido)); quebrado["fontes"][0]["recebido_em"] = 42
    caminho.write_text(json.dumps(quebrado), encoding="utf-8")
    conferir("data com tipo errado falha fechada", c.ler_fontes_estudio(caminho)["itens"] == [])

print("TODOS PASSARAM")
