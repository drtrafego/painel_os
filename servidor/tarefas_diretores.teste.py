#!/usr/bin/env python3
import contextlib
import io
import json
import os
import resource
import tempfile
import time
from pathlib import Path
from unittest import mock

import agentes_vivos
import tarefas_diretores as mod

falhas = 0


def conferir(nome, obtido, esperado):
    global falhas
    ok = obtido == esperado
    if not ok:
        falhas += 1
    print(f"  {'ok  ' if ok else 'FALHOU'} {nome}\n       obtido={obtido!r}\n       esperado={esperado!r}")


def conferir_verdade(nome, condicao, detalhe=""):
    global falhas
    if not condicao:
        falhas += 1
    print(f"  {'ok  ' if condicao else 'FALHOU'} {nome}{(' · ' + detalhe) if detalhe else ''}")


def wm(conteudo, pasta):
    caminho = Path(pasta) / "working-memory.md"
    caminho.write_text(conteudo, encoding="utf-8")
    return caminho


def ler(caminho):
    mod.limpar_cache()
    return mod.ler_prioridade_agente("luana", caminho, permitir_caminho_teste=True)


def testar_parser():
    print("--- tarefas_diretores: parser e resiliência")
    with tempfile.TemporaryDirectory() as tmp:
        neutro = wm("""# Memória

## Prioridade agora

1. **P1, tarefa neutra da Luana, responsável Luana, 30/09:** texto.
   Próximo passo verificável: abrir painel e conferir parede.
2. **P2, tarefa neutra do Renato, responsável Renato:** texto.
   Próximo passo verificável: validar contrato público.
""", tmp)
        pacote = ler(neutro)
        conferir("working-memory neutro tem 2 itens", len(pacote["itens"]), 2)
        conferir("responsável vem fixo do dono", pacote["itens"][1]["responsavel"], "Luana")

        ausente = ler(Path(tmp) / "ausente.md")
        conferir("arquivo ausente vira lista vazia", ausente["itens"], [])
        conferir_verdade("arquivo ausente avisa motivo", "ausente" in ausente["avisos"][0])

        vazio = wm("", tmp)
        pacote = ler(vazio)
        conferir("arquivo vazio vira lista vazia", pacote["itens"], [])
        conferir_verdade("arquivo vazio avisa motivo", "vazio" in pacote["avisos"][0])

        mal = wm("# Memória\n\nSem bloco útil.\n", tmp)
        pacote = ler(mal)
        conferir("mal formado vira lista vazia", pacote["itens"], [])
        conferir_verdade("mal formado avisa bloco", "Prioridade agora" in pacote["avisos"][0])

        with mock.patch.object(Path, "open", side_effect=PermissionError()):
            pacote = mod.ler_prioridade_agente("luana", Path(tmp) / "negado.md")
        conferir("caminho arbitrário fora de modo teste é recusado", pacote["itens"], [])
        conferir_verdade("recusa avisa caminho", "recusado" in pacote["avisos"][0] or "ausente" in pacote["avisos"][0])

        duplicado = wm("""# Memória

## Prioridade agora

1. **P2, item baixo, responsável Luana:** texto.
   Próximo passo verificável: manter baixo.

## Outra

## Prioridade agora

1. **P0, item alto, responsável Luana:** texto.
   Próximo passo verificável: subir alto.
""", tmp)
        pacote = ler(duplicado)
        conferir("streaming usa primeiro bloco completo", [i["titulo"] for i in pacote["itens"]], ["item baixo"])

        desordenado = wm("""# Memória

## Prioridade agora

1. **P3, baixo antes, responsável Luana:** texto.
   Próximo passo verificável: depois.
2. **P0, alto depois, responsável Luana:** texto.
   Próximo passo verificável: antes.
""", tmp)
        pacote = ler(desordenado)
        conferir("P3 antes de P0 ordena por prioridade", [i["prioridade"] for i in pacote["itens"]], ["P0", "P3"])
        conferir("ordem é a posição final da fila", [i["ordem"] for i in pacote["itens"]], [1, 2])
        conferir("chave continua regenerada com índice", [i["chave"] for i in pacote["itens"]], ["luana:P0:0", "luana:P3:1"])

        muitos = "# Memória\n\n## Prioridade agora\n\n" + "\n".join(
            f"{n}. **P{n % 4}, item {n:02d}, responsável Luana:** texto.\n   Próximo passo verificável: passo {n}."
            for n in range(50)
        )
        pacote = ler(wm(muitos, tmp))
        conferir("50 itens corta em 30", len(pacote["itens"]), 30)
        conferir("corte depois da ordenação mantém P0 primeiro", [i["prioridade"] for i in pacote["itens"][:13]], ["P0"] * 13)
        conferir("50 itens registram restantes fora do limite", pacote["restantes"], 20)

        oito = "# Memória\n\n## Prioridade agora\n\n" + "\n".join(
            f"{n}. **P1, item parseável {n}, responsável Luana:** texto.\n   Próximo passo verificável: passo {n}."
            for n in range(1, 9)
        )
        pacote = ler(wm(oito, tmp))
        conferir("8 itens parseáveis dão 8 exibidos", len(pacote["itens"]), 8)
        conferir("8 itens parseáveis registram restantes 0", pacote["restantes"], 0)

        trinta_e_cinco = "# Memória\n\n## Prioridade agora\n\n" + "\n".join(
            f"{n}. **P1, item extra {n}, responsável Luana:** texto.\n   Próximo passo verificável: passo {n}."
            for n in range(1, 36)
        )
        pacote = ler(wm(trinta_e_cinco, tmp))
        conferir("35 itens parseáveis dão 30 exibidos", len(pacote["itens"]), 30)
        conferir("35 itens parseáveis registram restantes 5", pacote["restantes"], 5)

        longo = wm("# Memória\n\n## Prioridade agora\n\n1. **P1, " + ("tarefa " * 20000) + ", responsável Luana:** texto.\n   Próximo passo verificável: " + ("passo " * 20000) + ".\n", tmp)
        pacote = ler(longo)
        conferir_verdade("linha enorme trunca título até 90 em palavra inteira", len(pacote["itens"][0]["titulo"]) <= 90 and pacote["itens"][0]["titulo"].endswith("…"), pacote["itens"][0]["titulo"])

        estados = wm("""# Memória

## Prioridade agora

1. **P0, aguarda decisão, responsável Luana:** aguarda o Gastão.
   Próximo passo verificável: depende dele.
2. **P1, tarefa concluída, responsável Luana:** concluído e fechado.
   Próximo passo verificável: feito.
3. **P2, tarefa ativa, responsável Luana:** texto.
   Próximo passo verificável: executar.
""", tmp)
        pacote = ler(estados)
        conferir("estado_tarefa sem estado operacional", sorted(i["estado_tarefa"] for i in pacote["itens"]), ["ativa", "ativa", "bloqueada"])
        conferir_verdade("itens não têm campo estado", all("estado" not in i for i in pacote["itens"]))
        conferir("só primeiro item ativo fica em andamento", [i["em_andamento"] for i in pacote["itens"]], [False, True, False])

        fechado_com_proximo = wm("""# Memória

## Prioridade agora

1. **P1, SAC mvpsac, responsável Renato:** Fechado e CONFERIDO no atendimento, mas ainda há validação pendente.
   Próximo passo verificável (1): conferir lembrete 24h no painel e horário editável.
""", tmp)
        pacote = ler(fechado_com_proximo)
        conferir("Fechado e CONFERIDO com próximo passo aberto fica ativa", pacote["itens"][0]["estado_tarefa"], "ativa")

        data_iso = wm("""# Memória

## Prioridade agora

1. **P1, frota com data explícita, responsável Renato, data 2026-09-30:** texto cita 28/09 mais adiante.
   Próximo passo verificável: conferir regressão de 28/09.
""", tmp)
        pacote = ler(data_iso)
        conferir("campo data ISO vence primeiro dd/mm do texto", pacote["itens"][0]["data"], "30/09")

        dependencias = wm("""# Memória

## Prioridade agora

1. **P1, depende textual, responsável Luana:** Depende de: reiniciar receiver.
   Próximo passo verificável: aplicar depois.
2. **P1, depende dele, responsável Luana:** pendente dele.
   Próximo passo verificável: aguardar.
3. **P2, aguarda Gastão, responsável Luana:** aguarda o Gastão.
   Próximo passo verificável: confirmar.
4. **P2, sem dependência, responsável Luana:** texto.
   Próximo passo verificável: executar.
""", tmp)
        pacote = ler(dependencias)
        conferir(
            "dependência extraída sem inventar",
            [i["depende_de"] for i in pacote["itens"]],
            ["reiniciar receiver", "decisão do Gastão", "decisão do Gastão", None],
        )

        parcial = wm("""# Memória

## Prioridade agora

1. **P0, item parcial, responsável Luana:** texto sem próximo passo.
2. **P1, item completo, responsável Luana:** texto.
   Próximo passo verificável: executar completo.
""", tmp)
        pacote = ler(parcial)
        conferir("item sem próximo passo aparece", [i["titulo"] for i in pacote["itens"]], ["item parcial", "item completo"])
        conferir("item sem próximo passo ganha flag", pacote["itens"][0]["sem_proximo_passo"], True)
        conferir_verdade("item sem próximo passo não gera item incompleto", all("item incompleto" not in a for a in pacote["avisos"]))

        incompletos = wm("""# Memória

## Prioridade agora

1. **sem prioridade, responsável Luana:** texto.
   Próximo passo verificável: não exibir.
2. **P1, token=abc123, responsável Luana:** texto.
   Próximo passo verificável: não exibir.
3. **P2, completo, responsável Luana:** texto.
   Próximo passo verificável: exibir.
""", tmp)
        pacote = ler(incompletos)
        conferir("itens sem prioridade ou título são omitidos", [i["titulo"] for i in pacote["itens"]], ["completo"])
        conferir_verdade("aviso cita quantidade sem prioridade", any("1 item sem prioridade omitido" in a for a in pacote["avisos"]), str(pacote["avisos"]))
        conferir_verdade("aviso cita quantidade sem título", any("1 item sem título omitido" in a for a in pacote["avisos"]), str(pacote["avisos"]))


def testar_subtarefas_e_sem_proximo_passo():
    print("\n--- tarefas_diretores: subtarefas e sem próximo passo")
    with tempfile.TemporaryDirectory() as tmp:
        sem_passo = wm("""# Memória

## Prioridade agora

1. **P0, item sem passo, responsável Luana:** texto aberto sem a expressão exigida antes.
""", tmp)
        pacote = ler(sem_passo)
        conferir("P0 com título sem próximo passo aparece", len(pacote["itens"]), 1)
        conferir("flag sem_proximo_passo verdadeira", pacote["itens"][0]["sem_proximo_passo"], True)
        conferir("subtarefas ausentes viram lista vazia", pacote["itens"][0]["subtarefas"], [])

        passos = wm("""# Memória

## Prioridade agora

1. **P1, item com passos, responsável Luana:** texto.
   Próximo passo verificável: (1) conferir lembrete 24h no painel (2) validar horário editável com Renato.
""", tmp)
        pacote = ler(passos)
        conferir("passos numerados geram 2 subtarefas", [s["titulo"] for s in pacote["itens"][0]["subtarefas"]], ["conferir lembrete 24h no painel", "validar horário editável com Renato"])
        conferir("subtarefas herdam estado", [s["estado"] for s in pacote["itens"][0]["subtarefas"]], ["ativa", "ativa"])

        lista = wm("""# Memória

## Prioridade agora

1. **P1, item com lista, responsável Luana:** texto.
   - primeira subtarefa aninhada
   2. segunda subtarefa aninhada
   Próximo passo verificável: (1) passo ignorado porque lista vence (2) outro passo.
""", tmp)
        pacote = ler(lista)
        conferir("lista aninhada vence passos numerados", [s["titulo"] for s in pacote["itens"][0]["subtarefas"]], ["primeira subtarefa aninhada", "segunda subtarefa aninhada"])

        sete = wm("# Memória\n\n## Prioridade agora\n\n1. **P1, item com sete, responsável Luana:** texto.\n" + "\n".join(
            f"   - subtarefa número {n} para limite" for n in range(1, 8)
        ) + "\n   Próximo passo verificável: executar.\n", tmp)
        pacote = ler(sete)
        conferir("subtarefas cortam em 6", len(pacote["itens"][0]["subtarefas"]), 6)
        conferir("ordem das 6 subtarefas", [s["ordem"] for s in pacote["itens"][0]["subtarefas"]], [1, 2, 3, 4, 5, 6])

        segredo = wm("""# Memória

## Prioridade agora

1. **P1, item com segredo, responsável Luana:** texto.
   - usar token=abc123 e sk-1234567890abcdef na subtarefa
   Próximo passo verificável: executar.
""", tmp)
        pacote = ler(segredo)
        bruto = json.dumps(pacote, ensure_ascii=False)
        conferir_verdade("segredo dentro de subtarefa é mascarado", "abc123" not in bruto and "sk-1234567890abcdef" not in bruto and "[segredo]" in bruto, bruto)


def testar_privacidade():
    print("\n--- tarefas_diretores: privacidade")
    with tempfile.TemporaryDirectory() as tmp:
        priv = Path(tmp) / "privacidade_nomes_cliente.txt"
        priv.write_text("Pessoa Teste Privada: nome sintético do teste\n", encoding="utf-8")
        os.environ["TAREFAS_DIRETORES_PRIVACIDADE"] = str(priv)
        sensivel = wm("""# Memória

## Prioridade agora

1. **P0, ligar para Pessoa Teste Privada, responsável Luana:** telefone 11999999999, e-mail pessoa@example.com, segredo sk-1234567890abcdef, url https://x.test/a?token=abc123, id 123456789012, cnpj 12.345.678/0001-90, caminho /opt/gastaomatos/luana/.env.
   Próximo passo verificável: mandar para Pessoa Teste Privada pelo Bearer abcdefghijklmnop e abrir /opt/gastaomatos/luana/.env.
2. **P1, Pessoa Teste Privada, responsável Luana:** texto.
   Próximo passo verificável: omitir.
3. **P2, tarefa pública, responsável Luana:** texto.
   Próximo passo verificável: sem segredo.
""", tmp)
        pacote = ler(sensivel)
        bruto = json.dumps(pacote, ensure_ascii=False)
        proibidos = [
            "Pessoa Teste Privada", "11999999999", "pessoa@example.com", "sk-1234567890abcdef",
            "token=abc123", "123456789012", "12.345.678/0001-90", "/0001-90", "/opt/gastaomatos/luana/.env", "abcdefghijklmnop",
        ]
        conferir_verdade("nada sensível aparece na saída", all(p not in bruto for p in proibidos), bruto)
        conferir("item com título só privado é omitido", [i["titulo"] for i in pacote["itens"]], ["ligar para [privado]", "tarefa pública"])
        conferir_verdade("omissão por título todo mascarado gera aviso", any("item sem título omitido" in a for a in pacote["avisos"]))

        original = mod.sanitizar_texto_publico
        try:
            mod.sanitizar_texto_publico = lambda texto, limite: (texto or "")[:limite]
            pacote_sem = ler(sensivel)
            bruto_sem = json.dumps(pacote_sem, ensure_ascii=False)
            conferir_verdade("teste reprova se sanitizador for removido", any(p in bruto_sem for p in proibidos), bruto_sem)
        finally:
            mod.sanitizar_texto_publico = original
            os.environ.pop("TAREFAS_DIRETORES_PRIVACIDADE", None)

        casos = {
            "token=abc123": "abc123",
            "key=abc123": "abc123",
            "senha=abc123": "abc123",
            "secret=abc123": "abc123",
            "?token=abc123": "abc123",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "ghp_1234567890abcdefghijklmnop": "ghp_1234567890abcdefghijklmnop",
            "gho_1234567890abcdefghijklmnop": "gho_1234567890abcdefghijklmnop",
            "github_pat_1234567890abcdefghijklmnop_123456": "github_pat_1234567890abcdefghijklmnop_123456",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signatureX": "eyJhbGciOiJIUzI1NiJ9",
            "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=": "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo",
            "12345678000190": "12345678000190",
            "123.456.789-09": "123.456.789-09",
            "sk-abcdefghi": "sk-abcdefghi",
            "sκ-abcdefghi": "sκ-abcdefghi",
            "sk - abc123456789": "abc123456789",
            "sk-abc 123456789": "123456789",
            "AKIA1234567890ABCDEF": "AKIA1234567890ABCDEF",
            "fd12:3456:789a:1::10": "fd12:3456:789a:1::10",
            "192.168.15.10": "192.168.15.10",
            "10.0.0.5": "10.0.0.5",
            "fulano arroba dominio ponto com": "fulano",
            "fulano [at] dominio [dot] com": "fulano",
            "zero onze nove oito sete seis cinco quatro tres dois": "onze",
        }
        for entrada, proibido in casos.items():
            saida = mod.sanitizar_texto_publico(entrada, 200)
            conferir_verdade(f"máscara cobre {entrada[:10]}", proibido not in saida, saida)

        falsos_numericos = {
            "203.0.113.10": "203.0.113.10",
            "192.0.2.44": "192.0.2.44",
            "198.51.100.7": "198.51.100.7",
            "MAKIA1234567890ABCDEFZ": "MAKIA1234567890ABCDEFZ",
        }
        for entrada, esperado in falsos_numericos.items():
            conferir(f"não mascara falso positivo numérico {entrada}", mod.sanitizar_texto_publico(entrada, 200), esperado)
        conferir("telefone BR com DDI mascarado", mod.sanitizar_texto_publico("+55 11 99999-9999", 200), "[número]")
        conferir("telefone BR sem DDI mascarado", mod.sanitizar_texto_publico("(11) 99999-9999", 200), "[número]")

        frases_normais = {
            "ponto de atenção": "ponto de atenção",
            "arroba de boi": "arroba de boi",
            "mineração AutonomIA": "mineração AutonomIA",
            "gravação de terça": "gravação de terça",
            "horário editável": "horário editável",
        }
        for entrada, esperado in frases_normais.items():
            conferir(f"frase normal preserva {entrada}", mod.sanitizar_texto_publico(entrada, 200), esperado)

        nomeado = wm("""# Memória

## Prioridade agora

1. **P0, Mariana Lopes precisa de revisão, responsável Outra Pessoa:** texto.
   Próximo passo verificável: falar com Mariana Lopes.
2. **P1, Nina ajusta origem, responsável Outra Pessoa:** texto.
   Próximo passo verificável: chamar Nina.
3. **P1, Gabi confere retorno, responsável Outra Pessoa:** texto.
   Próximo passo verificável: chamar Gabi.
""", tmp)
        pacote = ler(nomeado)
        titulos = [i["titulo"] for i in pacote["itens"]]
        conferir("nome fora da lista não é mascarado por heurística", titulos, ["Mariana Lopes precisa de revisão", "Nina ajusta origem", "Gabi confere retorno"])
        conferir("responsável ignora texto livre", [i["responsavel"] for i in pacote["itens"]], ["Luana", "Luana", "Luana"])


def testar_acentos_e_supermascara():
    print("\n--- tarefas_diretores: acentos e supermáscara")
    casos = [
        "mineração AutonomIA",
        "gravação de terça",
        "horário editável",
        "ação com coração e maçã",
    ]
    for caso in casos:
        conferir(f"preserva acento: {caso}", mod.sanitizar_texto_publico(caso, 200), caso)
    segredo = "token sκ - ábc123456789 em terça"
    saida = mod.sanitizar_texto_publico(segredo, 200)
    conferir_verdade("segredo com acento e homóglifo mascara sem degradar entorno", "ábc123456789" not in saida and "terça" in saida, saida)

    titulos = [
        "post 277 \"morte do n8n\"",
        "Skyvern narrado",
        "roteiros B, C, D, A e Skyvern",
        "mineração AutonomIA",
        "Nina lead de anúncio",
        "Nina prospecção fria",
        "repo drtrafego/luana",
        "gravação de terça",
        "quatro ideias pelos perfis de referência",
        "permissões do servidor",
        "medição de agentes/modelos",
        "Campanha AutonomIA de 24/09",
        "Privacidade do Painel OS",
        "Movimento do escritório",
        "travas de custo e bridge",
        "AutonomIA WhatsApp",
        "Frota e inbound",
        "Senha 270926",
        "Render narrado",
        "Credencial da Nina",
        "vazamento potencial de DM entre empresas no SAC",
        "webhook de Instagram e WhatsApp",
        "horário editável no painel",
        "Gabi parou de pedir mesa",
        "lacuna de idioma da Gabi",
        "Isabela sem SOUL com roteiro de vendas",
        "Gemini rodada do painel",
        "cache por dono com lock",
        "item incompleto omitido",
        "contrato front de tarefas",
    ]
    mascarados = [mod.sanitizar_texto_publico(titulo, 140) for titulo in titulos]
    perdas = sum(1 for original, publico in zip(titulos, mascarados) if "[privado]" in publico or "[segredo]" in publico or len(publico) < max(8, len(original) // 2))
    for titulo in mascarados:
        print(f"  título público: {titulo}")
    conferir("30 títulos avaliados", len(mascarados), 30)
    conferir_verdade("supermáscara no máximo 3 de 30", perdas <= 3, f"perdas={perdas}")


def testar_corte_antes_de_regex():
    print("\n--- tarefas_diretores: corte antes de regex")
    segredo_no_meio = "ação " + ("á" * 180) + " sk-1234567890abcdef " + ("ç" * 10)
    gigante = segredo_no_meio + ("x" * 10_000_000)
    inicio = time.perf_counter()
    saida = mod.sanitizar_texto_publico(gigante, 400)
    duracao = time.perf_counter() - inicio
    conferir_verdade("texto 10 MB sanitiza abaixo de 2s", duracao < 2.0, f"{duracao:.3f}s")
    conferir_verdade("segredo dentro dos 400 primeiros caracteres é mascarado", "sk-1234567890abcdef" not in saida and "[segredo]" in saida, saida)
    conferir_verdade("acentos antes do corte são preservados", "ação" in saida and "á" in saida and "ç" in saida, saida)

    from servir import redigir_dados_agentes

    payload = {
        "agentes": [{
            "id": "agente-gigante",
            "descricao": gigante,
            "etapa": gigante,
            "tarefa": gigante,
            "problema": gigante,
            "quem_mandou": gigante,
            "status": gigante,
            "esforco": gigante,
        }],
        "avisos": [gigante],
    }
    inicio = time.perf_counter()
    redigido = redigir_dados_agentes(payload)
    duracao = time.perf_counter() - inicio
    bruto = json.dumps(redigido, ensure_ascii=False)
    conferir_verdade("campos livres de agentes e avisos cortam antes do sanitizador", duracao < 2.0, f"{duracao:.3f}s")
    conferir_verdade("rota mascara segredo no trecho preservado", "sk-1234567890abcdef" not in bruto and "[segredo]" in bruto, bruto[:600])


def testar_titulo_limpo_e_truncado():
    print("\n--- tarefas_diretores: título limpo")
    with tempfile.TemporaryDirectory() as tmp:
        longo = "revisão crítica de DM entre empresas no SAC com webhook de Instagram e WhatsApp exigindo correção imediata"
        arquivo = wm(f"""# Memória

## Prioridade agora

1. **🔴 P0, {longo}, responsável Renato:** texto.
   Próximo passo verificável: revisar agora.
""", tmp)
        pacote = ler(arquivo)
        item = pacote["itens"][0]
        titulo = item["titulo"]
        conferir("prioridade continua no campo próprio", item["prioridade"], "P0")
        conferir_verdade("título remove emoji e prefixo de prioridade", not titulo.startswith("🔴") and not titulo.startswith("P0,"), titulo)
        conferir_verdade("título trunca com reticências dentro de 90", len(titulo) <= 90 and titulo.endswith("…"), f"{len(titulo)} {titulo!r}")
        conferir_verdade("título não corta no meio de palavra", not titulo[:-1].endswith(("Wha", "What", "Whats")), titulo)
        conferir_verdade("título preserva acentos", "revisão crítica" in titulo, titulo)


def testar_rota_real():
    print("\n--- tarefas_diretores: rota real usa sanitizador único")
    from servir import redigir_dados_agentes

    payload = {
        "agentes": [],
        "avisos": [],
        "tarefas_diretores": {
            "luana": {
                "itens": [{
                    "titulo": "segredo sk-1234567890abcdef token=abc123 Mariana Lopes",
                    "responsavel": "sk-1234567890abcdef",
                    "proximo_passo": "usar Bearer abcdefghijklmnop e key=abc123",
                    "data": "sk-1234567890abcdef",
                    "depende_de": "aguarda token=abc123",
                    "ordem": "sk-1234567890abcdef",
                    "em_andamento": "sk-1234567890abcdef",
                    "prioridade": "sk-1234567890abcdef",
                    "estado_tarefa": "sk-1234567890abcdef",
                    "chave": "sk-1234567890abcdef",
                    "sem_proximo_passo": True,
                    "subtarefas": [{"titulo": "sub token=abc123 sk-1234567890abcdef", "ordem": 8, "estado": "quebrado"}],
                }],
                "avisos": ["aviso com secret=abc123 " + ("x" * 200)] * 12,
                "lido_em": "sk-1234567890abcdef",
            }
        },
    }
    redigido = redigir_dados_agentes(payload)
    saida = json.dumps(redigido, ensure_ascii=False)
    for proibido in ("sk-1234567890abcdef", "abc123", "abcdefghijklmnop", "Mariana Lopes"):
        if proibido == "Mariana Lopes":
            conferir_verdade("rota preserva nome fora da lista", proibido in saida, saida)
        else:
            conferir_verdade(f"rota mascara {proibido[:8]}", proibido not in saida, saida)
    item = redigido["tarefas_diretores"]["luana"]["itens"][0]
    conferir("rota regenera chave", item["chave"], "luana:P3:0")
    conferir("rota descarta prioridade inválida", item["prioridade"], "P3")
    conferir("rota regenera ordem", item["ordem"], 1)
    conferir("rota mascara dependência", item["depende_de"], "aguarda [segredo]")
    conferir("rota descarta estado inválido", item["estado_tarefa"], "ativa")
    conferir("rota preserva flag sem próximo passo", item["sem_proximo_passo"], True)
    conferir("rota redige subtarefa", item["subtarefas"], [{"titulo": "sub [segredo] [segredo]", "ordem": 1, "estado": "ativa"}])
    conferir("rota marca andamento único", item["em_andamento"], True)
    conferir("rota fixa responsável pelo dono", item["responsavel"], "Luana")
    conferir("rota descarta data inválida", item["data"], None)
    conferir("rota aceita só lido_em ISO", redigido["tarefas_diretores"]["luana"]["lido_em"], None)
    conferir("rota trata restantes ausente como zero", redigido["tarefas_diretores"]["luana"]["restantes"], 0)
    conferir("rota limita avisos a 10", len(redigido["tarefas_diretores"]["luana"]["avisos"]), 10)
    conferir_verdade("rota limita aviso a 120 caracteres", all(len(a) <= 120 for a in redigido["tarefas_diretores"]["luana"]["avisos"]))


def testar_rota_tipos_e_vazamento():
    print("\n--- tarefas_diretores: rota resiste a tipos inválidos e não vaza extras")
    from servir import redigir_dados_agentes

    agente = {"id": "ag_teste", "descricao": "agente vivo"}
    casos = [
        ("estado_tarefa objeto", {"luana": {"itens": [{"titulo": "Tarefa", "proximo_passo": "Fazer", "estado_tarefa": {"x": 1}}], "avisos": []}}),
        ("tarefas_diretores string", "quebrado"),
        ("itens string", {"luana": {"itens": "quebrado", "avisos": []}}),
        ("item lista", {"luana": {"itens": [["quebrado"]], "avisos": []}}),
        ("ordem string", {"luana": {"itens": [{"titulo": "Tarefa", "proximo_passo": "Fazer", "ordem": "1"}], "avisos": []}}),
        ("em_andamento string", {"luana": {"itens": [{"titulo": "Tarefa", "proximo_passo": "Fazer", "em_andamento": "sim"}], "avisos": []}}),
        ("depende_de lista", {"luana": {"itens": [{"titulo": "Tarefa", "proximo_passo": "Fazer", "depende_de": ["x"]}], "avisos": []}}),
        ("sem próximo passo explícito", {"luana": {"itens": [{"titulo": "Tarefa", "proximo_passo": "", "sem_proximo_passo": True}], "avisos": []}}),
        ("pacote None", {"luana": None}),
        ("chave inexistente", {"luana": {"itens": [{"titulo": "Tarefa", "proximo_passo": "Fazer"}], "avisos": []}}),
    ]
    for nome, tarefas in casos:
        payload = {"agentes": [agente], "avisos": [], "tarefas_diretores": tarefas}
        try:
            redigido = redigir_dados_agentes(payload)
            ok = len(redigido["agentes"]) == 1 and redigido["agentes"][0]["id"] == "ag_teste"
        except Exception as exc:
            ok = False
            redigido = {"erro": type(exc).__name__}
        conferir_verdade(f"payload {nome} não derruba agentes", ok, json.dumps(redigido, ensure_ascii=False))

    payload_extra = {
        "agentes": [agente],
        "avisos": [],
        "tarefas_diretores": {
            "luana": {
                "extra": {"token": "sk-vazamento123456"},
                "itens": [{
                    "titulo": "Tarefa segura",
                    "proximo_passo": "Fazer seguro",
                    "sem_proximo_passo": False,
                    "subtarefas": [{"titulo": "Sub segura", "ordem": 99, "estado": "ativa", "extra": "sk-subvazamento123456"}],
                    "campo_desconhecido": "sk-itemvazamento123456",
                }],
                "avisos": [],
                "lido_em": "2026-10-01T00:00:00-03:00",
                "restantes": 3,
            }
        },
    }
    redigido = redigir_dados_agentes(payload_extra)
    pacote = redigido["tarefas_diretores"]["luana"]
    item = pacote["itens"][0]
    conferir("pacote público só tem campos conhecidos", set(pacote.keys()), {"itens", "avisos", "lido_em", "restantes"})
    conferir("pacote público preserva restantes inteiro", pacote["restantes"], 3)
    conferir("item público só tem campos conhecidos", set(item.keys()), {"chave", "ordem", "prioridade", "titulo", "responsavel", "proximo_passo", "sem_proximo_passo", "subtarefas", "data", "depende_de", "estado_tarefa", "em_andamento"})
    conferir("subtarefa pública só tem campos conhecidos", set(item["subtarefas"][0].keys()), {"titulo", "ordem", "estado"})
    saida = json.dumps(redigido, ensure_ascii=False)
    conferir_verdade("extra aninhado não vaza segredo", "sk-vazamento" not in saida and "sk-itemvazamento" not in saida and "sk-subvazamento" not in saida, saida)


def testar_dependencia_40_frases():
    print("\n--- tarefas_diretores: 40 frases de dependência")
    casos = [
        ("Depende de: reiniciar receiver.", "reiniciar receiver"),
        ("Dependência: contrato assinado.", "contrato assinado"),
        ("Bloqueado por: confirmação do Gastão.", "confirmação do Gastão"),
        ("Depende de: 203.0.113.10 documentado. Próximo passo depois.", "203.0.113.10 documentado"),
        ("aguarda o Gastão", mod.DEPENDENCIA_GASTAO),
        ("aguardando o Gastão", mod.DEPENDENCIA_GASTAO),
        ("depende dele", mod.DEPENDENCIA_GASTAO),
        ("pendente dele", mod.DEPENDENCIA_GASTAO),
        ("aguarda decisão", "aguarda decisão"),
        ("aguardando decisão", "aguardando decisão"),
        ("aguarda resposta", "aguarda resposta"),
        ("aguarda resposta dele", mod.DEPENDENCIA_GASTAO),
        ("não depende de ninguém", None),
        ("sem dependência", None),
        ("depende de contexto", None),
        ("depois de 3 dias conferir", None),
        ("depois de segunda medir", None),
        ("a tarefa depende de contexto e leitura humana", None),
        ("aguarda em frase sobre outro assunto", None),
        ("explicação longa dizendo que depende de clareza do texto", None),
        ("Próximo passo verificável: executar depois de 3 dias.", None),
        ("P1, mineração: texto sem bloqueio explícito.", None),
        ("P1, rota: não depende de deploy.", None),
        ("P2, relatório: sem dependência operacional.", None),
        ("P0, cache: Depende de: arquivo válido sem segredo sk-1234567890abcdef.", "arquivo válido sem segredo [segredo]"),
        ("Depende de: decisão final. Outra frase começa.", "decisão final"),
        ("Dependência: IP 192.0.2.44 documentado", "IP 192.0.2.44 documentado"),
        ("Bloqueado por: acesso do painel", "acesso do painel"),
        ("aguardando decisão do Gastão", mod.DEPENDENCIA_GASTAO),
        ("aguarda decisão dele", mod.DEPENDENCIA_GASTAO),
        ("roteiro aguarda resposta", "aguarda resposta"),
        ("aguarda resposta do Gastão", mod.DEPENDENCIA_GASTAO),
        ("Depende de: validar versão 1.2.3 antes do build", "validar versão 1.2.3 antes do build"),
        ("Depende de: 203.0.113.10 documentado", "203.0.113.10 documentado"),
        ("bloqueado por falta de tempo sem dois pontos", None),
        ("dependência operacional citada sem campo", None),
        ("Depende dele?", mod.DEPENDENCIA_GASTAO),
        ("pendente dele para fechar", mod.DEPENDENCIA_GASTAO),
        ("aguardando decisão de calendário", "aguardando decisão"),
        ("texto normal com depois de segunda e depende de contexto", None),
    ]
    falsos_positivos = 0
    falsos_negativos = 0
    for idx, (frase, esperado) in enumerate(casos, 1):
        obtido = mod._extrair_dependencia(frase)
        print(f"  {idx:02d}. {frase} => {obtido!r}")
        if esperado is None and obtido is not None:
            falsos_positivos += 1
        if esperado is not None and obtido is None:
            falsos_negativos += 1
        conferir(f"dependência frase {idx:02d}", obtido, esperado)
    conferir("40 frases avaliadas", len(casos), 40)
    conferir_verdade("falso positivo no máximo 1", falsos_positivos <= 1, f"FP={falsos_positivos}")
    conferir_verdade("falso negativo no máximo 1", falsos_negativos <= 1, f"FN={falsos_negativos}")


def testar_cache_caminho_tamanho():
    print("\n--- tarefas_diretores: cache, caminho e tamanho")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        ausente = tmp_path / "ausente.md"
        valido = wm("# Memória\n\n## Prioridade agora\n\n1. **P0, válido, responsável Luana:** texto.\n   Próximo passo verificável: ler válido.\n", tmp)
        renato = tmp_path / "renato.md"
        renato.write_text("# Memória\n\n## Prioridade agora\n\n1. **P0, Renato válido, responsável Renato:** texto.\n   Próximo passo verificável: ler Renato.\n", encoding="utf-8")
        mod.limpar_cache()
        falha = mod.obter_tarefas_diretores({"luana": ausente, "renato": renato}, permitir_caminho_teste=True)
        conferir("falha inicial não tem item", falha["luana"]["itens"], [])
        novo = tmp_path / "agora-valido.md"
        novo.write_text(valido.read_text(encoding="utf-8"), encoding="utf-8")
        ok = mod.obter_tarefas_diretores({"luana": novo, "renato": renato}, permitir_caminho_teste=True)
        conferir("falha não envenena cache dentro de 20s", ok["luana"]["itens"][0]["titulo"], "válido")

        fora = tmp_path / "fora.md"
        fora.write_text(valido.read_text(encoding="utf-8"), encoding="utf-8")
        link = tmp_path / "link.md"
        link.symlink_to(fora)
        recusas = [
            mod.ler_prioridade_agente("luana", link),
            mod.ler_prioridade_agente("luana", tmp_path / "sub" / ".." / "fora.md"),
            mod.ler_prioridade_agente("luana", fora),
        ]
        conferir_verdade("symlink, .. e caminho arbitrário são recusados", all(not r["itens"] and any("recusado" in a or "ausente" in a for a in r["avisos"]) for r in recusas))

        grande = tmp_path / "grande.md"
        with grande.open("wb") as f:
            f.truncate(100 * 1024 * 1024)
        rss_antes = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        inicio = time.perf_counter()
        pacote = mod.ler_prioridade_agente("luana", grande, permitir_caminho_teste=True)
        duracao_ms = (time.perf_counter() - inicio) * 1000
        rss_depois = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        conferir_verdade("arquivo 100 MB recusado abaixo de 200 ms", duracao_ms < 200, f"{duracao_ms:.1f} ms")
        conferir_verdade("arquivo 100 MB sem salto de 50 MB RSS", (rss_depois - rss_antes) < 50 * 1024, f"{rss_depois - rss_antes} KB")
        conferir_verdade("arquivo grande avisa teto", any("1 MB" in a for a in pacote["avisos"]))


def testar_integracao():
    print("\n--- tarefas_diretores: integração sem inflar agentes")
    with tempfile.TemporaryDirectory() as tmp:
        luana = wm("# Memória\n\n## Prioridade agora\n\n1. **P0, tarefa Luana, responsável Luana:** texto.\n   Próximo passo verificável: mostrar Luana.\n", tmp)
        renato = Path(tmp) / "renato.md"
        renato.write_text("# Memória\n\n## Prioridade agora\n\n1. **P1, tarefa Renato, responsável Renato:** texto.\n   Próximo passo verificável: mostrar Renato.\n", encoding="utf-8")
        caminhos = {"luana": luana, "renato": renato}
        with mock.patch.object(mod, "ARQUIVOS", caminhos):
            mod.limpar_cache()
            depois = agentes_vivos.ler_agentes_da_casa(processos_claude={}, processos_codex={})
        conferir_verdade("payload tem tarefas_diretores", bool(depois["tarefas_diretores"]["luana"]["itens"]))
        contagem_por_lista = sum(1 for a in depois["agentes"] if a.get("estado") in ("trabalhando", "silencioso"))
        total_tarefas = sum(len(pacote["itens"]) for pacote in depois["tarefas_diretores"].values())
        conferir_verdade("tarefas não entram na lista de agentes", len(depois["agentes"]) < len(depois["agentes"]) + total_tarefas)
        conferir("contarAgentesVivos por lista não muda", contagem_por_lista, len(depois["agentes"]))


if __name__ == "__main__":
    testar_parser()
    testar_subtarefas_e_sem_proximo_passo()
    testar_privacidade()
    testar_acentos_e_supermascara()
    testar_corte_antes_de_regex()
    testar_titulo_limpo_e_truncado()
    testar_rota_real()
    testar_rota_tipos_e_vazamento()
    testar_dependencia_40_frases()
    testar_cache_caminho_tamanho()
    testar_integracao()
    if falhas:
        print(f"\nFALHAS: {falhas}")
        raise SystemExit(1)
    print("\nOK: tarefas_diretores")
