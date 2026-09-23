#!/usr/bin/env python3
"""Regressões da seleção de sessão e do limite semântico da sonda."""

import importlib.util
import json
import os
import tempfile
import time
from pathlib import Path

spec = importlib.util.spec_from_file_location("agentes_vivos", Path(__file__).with_name("agentes_vivos.py"))
mod = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(mod)

agora = time.time()
with tempfile.TemporaryDirectory(prefix="agentes-vivos-teste-") as tmp:
    raiz = Path(tmp)
    projeto = raiz / "projeto"
    antiga = projeto / "sessao-antiga" / "subagents"
    nova = projeto / "sessao-nova" / "subagents"
    antiga.mkdir(parents=True)
    nova.mkdir(parents=True)
    # A pasta antiga parece mais nova, mas a evidência real dentro dela é velha.
    (antiga / "agent-velho.meta.json").write_text(json.dumps({"agentType": "old"}))
    (nova / "agent-novo.meta.json").write_text(json.dumps({"agentType": "new"}))
    (nova / "agent-novo.jsonl").write_text("")
    os.utime(antiga / "agent-velho.meta.json", (agora - 7200, agora - 7200))
    os.utime(nova / "agent-novo.meta.json", (agora - 20, agora - 20))
    os.utime(nova / "agent-novo.jsonl", (agora - 10, agora - 10))
    os.utime(antiga, (agora, agora))
    assert mod._sessao_mais_ativa(projeto) == nova.parent

    # Uma sessão só histórica não pode inundar a tela com cartões parados.
    historico = raiz / "historico" / "sessao" / "subagents"
    historico.mkdir(parents=True)
    meta = historico / "agent-1.meta.json"
    transcript = historico / "agent-1.jsonl"
    meta.write_text(json.dumps({"agentType": "old"}))
    transcript.write_text("")
    os.utime(meta, (agora - 25200, agora - 25200))
    os.utime(transcript, (agora - 25200, agora - 25200))
    mod.RAIZ_CODEX = raiz / "codex-vazio"
    resultado = mod.ler_agentes("historico", raiz=raiz)
    assert resultado["ok"] is True
    assert resultado["agentes"] == []
    assert resultado["contagem"]["historico"] == 1

print("APROVADO: seleção usa evidência de arquivo e histórico não vira agente ao vivo.")
