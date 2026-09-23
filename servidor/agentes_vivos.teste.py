#!/usr/bin/env python3
"""
Testes automatizados da sonda de agentes vivos e agregação multi-projeto (ler_agentes_da_casa).

Garante o contrato:
- Regressões da seleção de sessão e limite semântico da sonda.
- Nunca devolve zero em silêncio.
- Sessão inexistente ou com erro não apaga sessões sadias (agregação resiliente).
- Cada agente agrega o rótulo de seu 'dono' ('luana', 'renato', 'bia').
"""

import json
import os
import shutil
import tempfile
import time
from pathlib import Path

import agentes_vivos as mod
from agentes_vivos import (
    TRABALHANDO,
    SILENCIOSO,
    PARADO,
    ler_agentes,
    ler_agentes_da_casa,
    _sessao_mais_ativa,
)

falhas = 0


def conferir(nome: str, obtido: object, esperado: object) -> None:
    global falhas
    ok = obtido == esperado
    if not ok:
        falhas += 1
    print(f"  {'ok  ' if ok else 'FALHOU'} {nome}\n       obtido={obtido!r}\n       esperado={esperado!r}")


def criar_sessao_mock(raiz: Path, nome_projeto: str, agentes_dados: list[dict]) -> None:
    pasta = raiz / nome_projeto / "sessao_1" / "subagents"
    pasta.mkdir(parents=True, exist_ok=True)
    agora = time.time()
    for ag in agentes_dados:
        ident = ag["id"]
        meta_file = pasta / f"agent-{ident}.meta.json"
        meta_content = {
            "agentType": ag.get("tipo", "worker"),
            "description": ag.get("descricao", "tarefa de teste"),
            "parentAgentId": ag.get("pai"),
            "spawnDepth": ag.get("profundidade", 1),
        }
        meta_file.write_text(json.dumps(meta_content), encoding="utf-8")

        trans_file = pasta / f"agent-{ident}.jsonl"
        linhas = ag.get("linhas", [])
        trans_file.write_text("\n".join(linhas) + "\n", encoding="utf-8")
        if "idade_s" in ag:
            mtime = agora - ag["idade_s"]
            os.utime(trans_file, (mtime, mtime))
            os.utime(meta_file, (mtime, mtime))
    os.utime(pasta, (agora, agora))


def testar_agentes_vivos():
    global falhas

    print("--- Teste 0: Regressão de seleção de sessão mais ativa e histórico")
    agora = time.time()
    with tempfile.TemporaryDirectory(prefix="agentes-vivos-teste-") as tmp_dir:
        raiz = Path(tmp_dir)
        # Isola do Codex real da máquina: sem isto, qualquer sessão Codex viva
        # agora entra nos resultados e derruba as contagens do teste.
        mod.RAIZ_CODEX = raiz / "codex-vazio"
        projeto = raiz / "projeto"
        antiga = projeto / "sessao-antiga" / "subagents"
        nova = projeto / "sessao-nova" / "subagents"
        antiga.mkdir(parents=True)
        nova.mkdir(parents=True)
        (antiga / "agent-velho.meta.json").write_text(json.dumps({"agentType": "old"}))
        (nova / "agent-novo.meta.json").write_text(json.dumps({"agentType": "new"}))
        (nova / "agent-novo.jsonl").write_text("")
        os.utime(antiga / "agent-velho.meta.json", (agora - 7200, agora - 7200))
        os.utime(nova / "agent-novo.meta.json", (agora - 20, agora - 20))
        os.utime(nova / "agent-novo.jsonl", (agora - 10, agora - 10))
        os.utime(antiga, (agora, agora))
        conferir("seleção de sessão mais ativa usa evidência real", _sessao_mais_ativa(projeto), nova.parent)

        historico = raiz / "historico" / "sessao" / "subagents"
        historico.mkdir(parents=True)
        meta = historico / "agent-1.meta.json"
        transcript = historico / "agent-1.jsonl"
        meta.write_text(json.dumps({"agentType": "old"}))
        transcript.write_text("")
        os.utime(meta, (agora - 25200, agora - 25200))
        os.utime(transcript, (agora - 25200, agora - 25200))
        res_hist = ler_agentes("historico", raiz=raiz)
        conferir("histórico ok=True", res_hist["ok"], True)
        conferir("sessão histórica não inunda tela com ativos", res_hist["agentes"], [])
        conferir("contagem histórico registrada", res_hist["contagem"]["historico"], 1)

    print("\n--- Teste 1: Projeto inexistente")
    tmp = Path(tempfile.mkdtemp(prefix="painel_vivos_teste_"))
    try:
        r = ler_agentes(projeto="inexistente", raiz=tmp)
        conferir("projeto inexistente devolve ok=False", r["ok"], False)
        conferir("motivo correto", r["motivo"], "projeto_inexistente")
        conferir("total de vivos é None quando ok=False", r["contagem"]["vivos"], None)

        print("\n--- Teste 2: Pasta vazia")
        (tmp / "vazio" / "sessao_1" / "subagents").mkdir(parents=True)
        r_vazio = ler_agentes(projeto="vazio", raiz=tmp)
        conferir("pasta vazia devolve ok=True", r_vazio["ok"], True)
        conferir("contagem total zero", r_vazio["contagem"]["total"], 0)

        print("\n--- Teste 3: Leitura e classificação de agentes")
        criar_sessao_mock(tmp, "-opt-gastaomatos-luana", [
            {
                "id": "ag_1",
                "tipo": "pesquisador",
                "linhas": [
                    json.dumps({
                        "type": "assistant",
                        "message": {
                            "content": [
                                {"type": "tool_use", "name": "view_file", "input": {"description": "Lendo arquivo"}}
                            ]
                        }
                    }),
                ],
                "idade_s": 10,  # <= 90s -> trabalhando
            },
            {
                "id": "ag_2",
                "tipo": "executor",
                "linhas": [
                    json.dumps({
                        "type": "assistant",
                        "message": {
                            "content": [
                                {"type": "tool_use", "name": "run_command", "input": {"description": "Executando"}}
                            ]
                        }
                    }),
                ],
                "idade_s": 200,  # > 90s -> silencioso
            },
        ])

        r_luana = ler_agentes(projeto="-opt-gastaomatos-luana", raiz=tmp)
        conferir("leitura_ok em luana", r_luana["ok"], True)
        conferir("ag_1 classificado trabalhando", r_luana["agentes"][0]["estado"], TRABALHANDO)
        conferir("ag_2 classificado silencioso", r_luana["agentes"][1]["estado"], SILENCIOSO)
        conferir("contagem vivos = 2", r_luana["contagem"]["vivos"], 2)

        print("\n--- Teste 4: Agregação multi-projeto (ler_agentes_da_casa)")
        criar_sessao_mock(tmp, "-opt-gastaomatos-renato", [
            {
                "id": "ag_renato_1",
                "tipo": "auditor",
                "linhas": [
                    json.dumps({
                        "type": "assistant",
                        "message": {
                            "content": [
                                {"type": "tool_use", "name": "grep_search", "input": {"description": "Auditando"}}
                            ]
                        }
                    }),
                ],
                "idade_s": 5,
            }
        ])
        criar_sessao_mock(tmp, "-opt-gastaomatos-bia", [
            {
                "id": "ag_bia_1",
                "tipo": "redator",
                "linhas": [
                    json.dumps({
                        "type": "assistant",
                        "message": {
                            "content": [
                                {"type": "tool_use", "name": "edit_file", "input": {"description": "Redigindo"}}
                            ]
                        }
                    }),
                ],
                "idade_s": 15,
            },
            {
                "id": "ag_bia_entregue",
                "tipo": "redator",
                "linhas": [
                    json.dumps({
                        "type": "assistant",
                        "message": {
                            "stop_reason": "end_turn",
                            "content": [{"type": "text", "text": "entregue"}]
                        }
                    }),
                ],
                "idade_s": 15,
            }
        ])

        projetos_teste = {
            "luana": "-opt-gastaomatos-luana",
            "renato": "-opt-gastaomatos-renato",
            "bia": "-opt-gastaomatos-bia",
        }

        casa = ler_agentes_da_casa(projetos=projetos_teste, raiz=tmp)
        conferir("agregação da casa ok=True", casa["ok"], True)
        conferir("total de agentes ativos agregados = 4", len(casa["agentes"]), 4)
        conferir("contagem vivos = 4", casa["contagem"]["vivos"], 4)
        conferir("contagem histórico agregada = 1", casa["contagem"]["historico"], 1)

        donos = {a["id"]: a.get("dono") for a in casa["agentes"]}
        conferir("dono do ag_1 é luana", donos.get("ag_1"), "luana")
        conferir("dono do ag_renato_1 é renato", donos.get("ag_renato_1"), "renato")
        conferir("dono do ag_bia_1 é bia", donos.get("ag_bia_1"), "bia")

        print("\n--- Teste 5: Agregação resiliente quando uma sessão falha")
        projetos_com_falha = {
            "luana": "-opt-gastaomatos-luana",
            "renato": "-opt-gastaomatos-renato",
            "fantasma": "-opt-gastaomatos-fantasma-inexistente",
        }
        casa_resiliente = ler_agentes_da_casa(projetos=projetos_com_falha, raiz=tmp)
        conferir("continua ok=True mesmo com sessão fantasma", casa_resiliente["ok"], True)
        conferir("3 agentes de luana e renato continuam na saída", len(casa_resiliente["agentes"]), 3)
        falha_no_aviso = any("fantasma" in av for av in casa_resiliente.get("avisos", []))
        conferir("aviso sobre sessão fantasma registrado", falha_no_aviso, True)

        print("\n--- Teste 6: Falha total quando nenhuma sessão existe")
        casa_zero = ler_agentes_da_casa(projetos={"errado": "pasta_inexistente_123"}, raiz=tmp)
        conferir("ok=False quando todas falham", casa_zero["ok"], False)
        conferir("motivo correto de falha total", casa_zero["motivo"], "todas_as_sessoes_falharam")

        print("\n--- Teste 7: Identidade Codex lida só do session_meta, sem vazar agent_path")
        meta_codex = tmp / "rollout-teste.jsonl"
        meta_codex.write_text(json.dumps({
            "type": "session_meta", "payload": {
                "agent_role": "cont_copy", "agent_nickname": "Cleo",
                "agent_path": "/root/segredo/produzir_legenda",
                "source": {"subagent": {"thread_spawn": {
                    "parent_thread_id": "pai-123", "depth": 2}}},
            },
        }) + "\n" + '{"prompt":"NUNCA DEVE SAIR"}\n')
        conferir("identidade codex allowlisted", mod._identidade_codex(meta_codex), {
            "identidade": "cleo", "papel": "cont_copy",
            "tarefa": "produzir legenda", "pai": "pai-123", "profundidade": 2,
        })

    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    if falhas == 0:
        print("\nAPROVADO: todos os testes de agentes vivos passaram com sucesso.")
    else:
        print(f"\nREPROVADO: {falhas} falha(s) encontrada(s).")
        raise SystemExit(1)


if __name__ == "__main__":
    testar_agentes_vivos()
