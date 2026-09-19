#!/usr/bin/env python3
import importlib.util
import json
import os
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("servir_aprovacoes", AQUI / "servir.py")
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)
falhas = []

def ok(nome, condicao):
    print(("ok    " if condicao else "FALHA ") + nome)
    if not condicao: falhas.append(nome)

def erro(caminho, pedido, codigo):
    try: s.decidir_aprovacao(pedido, caminho)
    except s.ErroDecisao as e: return e.codigo == codigo
    return False

with tempfile.TemporaryDirectory() as pasta:
    arq = Path(pasta) / "aprovacoes.json"
    base = {"versao": 1, "itens": [{"id": "item_123", "estado": "aguardando", "tipo": "conteudo", "criado_em": "2026-09-08T20:00:00+00:00", "origem": "estudio"}]}
    arq.write_text(json.dumps(base), encoding="utf-8")
    pedido = {"id": "item_123", "decisao": "aprovado", "esperado": "aguardando", "chave_idempotencia": "decisao_1234567890abcdef"}
    codigo, resposta = s.decidir_aprovacao(pedido, arq)
    salvo = json.loads(arq.read_text())
    ok("transição aguardando para aprovado", codigo == 200 and salvo["itens"][0]["estado"] == "aprovado")
    ok("resposta afirma que não publicou", resposta["publicado"] is False)
    ok("auditoria mínima sem conteúdo nem PII", set(salvo["auditoria"][0]) == {"chave", "item_id", "de", "para", "em", "ator"})
    ok("chave bruta não é persistida", pedido["chave_idempotencia"] not in arq.read_text())
    ok("arquivo final fica 600 e não sobra temporário", (arq.stat().st_mode & 0o777) == 0o600 and not list(Path(pasta).glob("*.tmp")))
    codigo2, resposta2 = s.decidir_aprovacao(pedido, arq)
    ok("repetição idempotente não duplica auditoria", codigo2 == 200 and resposta2["idempotente"] and len(json.loads(arq.read_text())["auditoria"]) == 1)
    conflito = {**pedido, "decisao": "reprovado"}
    ok("mesma chave com corpo diferente conflita", erro(arq, conflito, 409))
    outra = {**pedido, "chave_idempotencia": "outra_chave_1234567890", "decisao": "reprovado"}
    ok("estado final não transiciona de novo", erro(arq, outra, 409))
    ok("item inexistente devolve 404", erro(arq, {**outra, "id": "item_999"}, 404))
    ok("estado esperado diferente é rejeitado", erro(arq, {**outra, "esperado": "aprovado"}, 400))
    ok("campo extra é rejeitado", erro(arq, {**outra, "extra": True}, 400))
    ok("chave curta é rejeitada", erro(arq, {**outra, "chave_idempotencia": "curta"}, 400))
    corrompido = Path(pasta) / "ruim.json"; corrompido.write_text('{"versao":1,"itens":"não"}')
    ok("fila corrompida falha fechada", erro(corrompido, pedido, 503))
    marcador = Path(pasta) / ".https-ativo"
    ok("sem marcador, até loopback + header https falha", not s.canal_decisao_seguro("127.0.0.1", "127.0.0.1", "https", marcador))
    marcador.touch()
    ok("header https em porta pública não basta", not s.canal_decisao_seguro("0.0.0.0", "127.0.0.1", "https", marcador))
    ok("cliente público não alcança decisão", not s.canal_decisao_seguro("127.0.0.1", "31.97.21.1", "https", marcador))
    ok("header http atrás do proxy não passa", not s.canal_decisao_seguro("127.0.0.1", "127.0.0.1", "http", marcador))
    ok("só marcador + socket local + proxy local + https passam", s.canal_decisao_seguro("127.0.0.1", "127.0.0.1", "https", marcador))

print(f"{len(falhas)} falha(s)" if falhas else "TODOS PASSARAM")
raise SystemExit(1 if falhas else 0)
