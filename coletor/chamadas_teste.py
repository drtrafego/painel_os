#!/usr/bin/env python3
import json
import tempfile
from pathlib import Path
from chamadas_ingestao import ErroIngestao, MAX_BYTES, carregar_inbox

def sanitizar(texto, limite):
    if not isinstance(texto, str) or not texto.strip(): raise ErroIngestao("texto vazio")
    limpo = texto.replace("a@b.com", "[e-mail]")[:limite]
    return limpo, int(limpo != texto)

base = {"schema":"painel-os/chamada@1","escopo_id":"gastaomatos","chamada_id":"call-1","origem_id":"export-1","ocorrido_em":"2026-09-08T12:00:00Z","citacoes":[{"id":"pessoa@exemplo.com","trecho":"Atrasamos sempre a resposta","inicio_s":12,"fim_s":15}],"achados":[{"id":"a1","tipo":"dor","rotulo":"resposta atrasada","citacao_ids":["pessoa@exemplo.com"]},{"id":"a2","tipo":"objecao","rotulo":"custo","citacao_ids":["pessoa@exemplo.com"]}]}

def rejeita(conteudo, trecho):
    with tempfile.TemporaryDirectory() as tmp:
        pasta = Path(tmp)
        (pasta/"entrada.json").write_text(json.dumps(conteudo), encoding="utf-8")
        try:
            carregar_inbox(pasta, sanitizar, "gastaomatos")
            raise AssertionError("deveria reprovar")
        except ErroIngestao as exc:
            assert trecho in str(exc), str(exc)

testes = 0
with tempfile.TemporaryDirectory() as tmp:
    pasta=Path(tmp)
    assert carregar_inbox(pasta, sanitizar, "gastaomatos") is None; testes += 1
    (pasta/"uma.json").write_text(json.dumps(base), encoding="utf-8")
    r=carregar_inbox(pasta, sanitizar, "gastaomatos")
    assert len(r["registros"])==1 and len(r["nos"])==2 and len(r["arestas"])==1; testes += 1
    publicado = json.dumps(r, ensure_ascii=False)
    assert "call-1" not in publicado and "export-1" not in publicado and "pessoa@exemplo.com" not in publicado; testes += 1

rejeita({**base,"achados":[{"id":"x","tipo":"dor","rotulo":"x","citacao_ids":["ausente"]}]}, "citação inexistente"); testes += 1
rejeita({**base,"ocorrido_em":"2026-09-08T12:00:00"}, "fuso horário"); testes += 1
with tempfile.TemporaryDirectory() as tmp:
    pasta = Path(tmp)
    (pasta/"cliente.json").write_text(json.dumps({**base, "escopo_id":"cliente-x"}), encoding="utf-8")
    try: carregar_inbox(pasta, sanitizar, "gastaomatos"); raise AssertionError("deveria reprovar escopo")
    except ErroIngestao as exc: assert "escopo não autorizado" in str(exc); testes += 1

with tempfile.TemporaryDirectory() as tmp:
    pasta = Path(tmp)
    alvo = pasta/"fora.json"
    alvo.write_text(json.dumps(base), encoding="utf-8")
    link = pasta/"entrada.json"
    link.symlink_to(alvo)
    try:
        carregar_inbox(pasta, sanitizar, "gastaomatos")
        raise AssertionError("deveria reprovar link")
    except ErroIngestao as exc:
        assert "links" in str(exc); testes += 1

with tempfile.TemporaryDirectory() as tmp:
    pasta = Path(tmp)
    grande = pasta/"grande.json"
    with grande.open("wb") as arquivo:
        arquivo.truncate(MAX_BYTES + 1)
    try:
        carregar_inbox(pasta, sanitizar, "gastaomatos")
        raise AssertionError("deveria reprovar tamanho")
    except ErroIngestao as exc:
        assert "excede" in str(exc); testes += 1

print(f"{testes} passaram, 0 falharam")
