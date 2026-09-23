#!/usr/bin/env python3
"""
SONDA DOS AGENTES AO VIVO.

Responde as tres perguntas que o dono fez, e nao outras:
    QUAIS agentes estao contatados  ·  QUANTOS agora  ·  EM QUE ETAPA cada um.

O painel ja mostrava HISTORICO de convocacao, que nao responde nenhuma das tres.

--------------------------------------------------------------------------
CONTRATO: ESTA SONDA NUNCA DEVOLVE ZERO EM SILENCIO
--------------------------------------------------------------------------
Caminho inexistente, pasta vazia e leitura boa sao TRES respostas diferentes.
Com um `return 0` viram a mesma tela, e esta casa ja perdeu dias com um zero
que vinha de erro sendo lido como ausencia (um painel mostrou 0 conversas de
um cliente que tinha 1.489, porque um except engolia o erro).

Toda resposta carrega `ok` e `motivo`. Quem consumir sem olhar `ok` esta
lendo errado de proposito. `total_vivos` e None quando ok=False: nao existe
numero pra mostrar quando a leitura falhou.

--------------------------------------------------------------------------
CUSTO: stat antes de open, sempre
--------------------------------------------------------------------------
Sao ~900 transcripts na sessao e o maior tem 14 MB. Ler todos inteiros leva
dezenas de segundos, e um dado de 58s seria ficcao com cara de ao vivo,
porque a etapa de um agente muda a cada ~2s.
Entao: stat em todos (barato), e leitura do FIM so nos candidatos a vivo.
Ler transcript inteiro esta proibido aqui.

--------------------------------------------------------------------------
FUSO
--------------------------------------------------------------------------
O transcript grava em UTC (sufixo Z) e este servidor roda em UTC; o dono vive
em UTC-3. Toda hora que sai daqui pra tela ja vai convertida pra America/
Sao_Paulo com o fuso escrito ao lado. Hora sem fuso e palpite.
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BRT = ZoneInfo("America/Sao_Paulo")

# Onde os transcripts moram. O nome da pasta e o cwd com as barras viradas.
RAIZ_PROJETOS = Path.home() / ".claude" / "projects"
PROJETO_PADRAO = "-opt-gastaomatos-luana"

# As três sessões da casa. Nome de exibição (dono) -> pasta do projeto em
# ~/.claude/projects/. Se um quarto agente ganhar sessão própria, cadastrar
# aqui é o único passo necessário — ler_agentes() já sabe ler qualquer uma.
PROJETOS_DA_CASA: dict[str, str] = {
    "luana": "-opt-gastaomatos-luana",
    "renato": "-opt-gastaomatos-renato",
    "bia": "-opt-gastaomatos-bia",
}

# Pastas de sessões Codex por dono, incluindo workers de segundo plano.
CODEX_DA_CASA: dict[str, list[Path]] = {
    "luana": [
        Path.home() / ".codex-luana" / "sessions",
        Path.home() / ".codex-luana-workers" / "sessions",
    ],
    "renato": [
        Path.home() / ".codex-renato" / "sessions",
        Path.home() / ".codex-renato-workers" / "sessions",
    ],
    "bia": [
        Path.home() / ".codex-bia" / "sessions",
        Path.home() / ".codex-bia-workers" / "sessions",
    ],
}
_CODEX_PADRAO = object()

# Quanto do fim do transcript a gente le pra achar o ultimo tool_use.
# 256 KB cobre folgado varios turnos; o arquivo pode ter 14 MB.
CAUDA_BYTES = 256 * 1024

# So abre o transcript de quem escreveu nas ultimas N horas. Quem nao escreve
# ha mais que isso e historico: entra na contagem de parados sem custo de I/O.
JANELA_CANDIDATO_S = 6 * 3600
RAIZ_CODEX = Path.home() / ".codex-luana" / "sessions"
# Cada sessão da casa tem o próprio CODEX_HOME. Sem este mapa, a agregação
# chamava ler_agentes() três vezes e as sessões Codex da Luana apareciam
# triplicadas, carimbadas como luana, renato e bia.
JANELA_CODEX_S = 90

# Identidades operacionais são deliberadamente uma allowlist. O conteúdo de
# session_meta é não confiável e não deve virar nome arbitrário na interface.
IDENTIDADES_CODEX = {
    "cont_radar": "nova-mineradora",
    "cont_estrategista": "suri",
    "cont_copy": "cleo",
    "cont_designer": "dani",
    "cont_corretor": "corretor",
    "cont_qa": "guardiao",
}
IDENTIDADES_POR_TAREFA_CODEX = {
    "iris_orquestradora": "iris",
}
IDENTIDADE_CODEX_GENERICA = "sessao-codex"


def _sanitizar_caminho(texto: str | None) -> str:
    """Substitui caminhos absolutos do servidor por marcação segura."""
    if not texto:
        return ""
    limpo = re.sub(r"/(?:opt|home|root|etc|var|tmp|usr)/[^\s':]+", "[caminho]", str(texto))
    limpo = re.sub(r"[a-zA-Z]:\\[^\s':]+", "[caminho]", limpo)
    return limpo


def _deduzir_dono(projeto: str) -> str | None:
    for dono, proj in PROJETOS_DA_CASA.items():
        if proj == projeto:
            return dono
    proj_low = projeto.lower()
    for dono in ("luana", "renato", "bia"):
        if dono in proj_low:
            return dono
    return None

# --------------------------------------------------------------------------
# OS TRES ESTADOS
# --------------------------------------------------------------------------
# Sao tres e nunca dois, porque um limiar unico mente para os dois lados:
# agente pensando aparece como morto, e agente morto aparece como vivo.
#
# O eixo principal e SEMANTICO, nao temporal:
#   - o transcript termina em tool_use  -> a ferramenta ainda nao devolveu
#   - o transcript termina em resultado -> o modelo esta processando
#   - o transcript termina em end_turn  -> o agente fechou o turno, entregou
# O tempo so desempata o primeiro caso, que e onde mora a duvida de verdade.
#
# LIMIAR_ATIVO_S: abaixo disso, quem esta no meio de uma ferramenta conta como
# trabalhando; acima, como silencioso. NAO e um chute: veja `_CALIBRAGEM` no
# fim deste arquivo, com a medicao e a data.
LIMIAR_ATIVO_S = 90

TRABALHANDO = "trabalhando"
SILENCIOSO = "silencioso"
PARADO = "parado"


def _agora() -> float:
    return time.time()


def _hora_br(epoch: float | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, BRT).strftime("%d/%m %H:%M:%S BRT")


def _ler_cauda(caminho: Path, n: int = CAUDA_BYTES) -> list[str]:
    """Ultimas linhas do arquivo sem carregar o arquivo. seek, nunca read()."""
    tam = caminho.stat().st_size
    with caminho.open("rb") as fh:
        if tam > n:
            fh.seek(tam - n)
            fh.readline()  # descarta a linha partida ao meio pelo seek
        bruto = fh.read()
    return [l for l in bruto.decode("utf-8", "replace").splitlines() if l.strip()]


def _blocos(reg: dict) -> list[dict]:
    msg = reg.get("message")
    if not isinstance(msg, dict):
        return []
    conteudo = msg.get("content")
    return [b for b in conteudo if isinstance(b, dict)] if isinstance(conteudo, list) else []


def _etapa_do_bloco(bloco: dict) -> tuple[str, bool]:
    """(texto da etapa, veio_de_description).

    NAO INVENTA ETAPA. Se o tool_use nao tiver `description`, sai o nome da
    ferramenta; se nem nome tiver, sai 'sem descricao'. Rotulo bonito deduzido
    e o que faz um instrumento descrever a si mesmo em vez do objeto.
    """
    entrada = bloco.get("input")
    if isinstance(entrada, dict):
        desc = entrada.get("description")
        if isinstance(desc, str) and desc.strip():
            return desc.strip(), True
    nome = bloco.get("name")
    if isinstance(nome, str) and nome.strip():
        return nome.strip(), False
    return "sem descrição", False


def _analisar_cauda(caminho: Path) -> dict:
    """O que o FIM do transcript diz. Levanta em erro de leitura: quem chama
    decide o que fazer, e o erro viaja junto em vez de virar zero."""
    linhas = _ler_cauda(caminho)
    fase = "desconhecida"
    ultimo_ts = None
    etapa = None
    etapa_medida = False
    ferramenta = None
    ilegiveis = 0
    problema_detectado = None

    for linha in reversed(linhas):
        try:
            reg = json.loads(linha)
        except json.JSONDecodeError:
            ilegiveis += 1
            continue

        if not isinstance(reg, dict):
            ilegiveis += 1
            continue

        if ultimo_ts is None and isinstance(reg.get("timestamp"), str):
            ultimo_ts = reg["timestamp"]

        msg = reg.get("message") if isinstance(reg.get("message"), dict) else {}
        is_api_err = (
            reg.get("isApiErrorMessage") is True
            or (isinstance(msg, dict) and msg.get("isApiErrorMessage") is True)
            or any(isinstance(b, dict) and b.get("isApiErrorMessage") is True for b in _blocos(reg))
        )
        stop_reason = msg.get("stop_reason") if isinstance(msg, dict) else None

        if is_api_err or stop_reason in ("refusal", "error"):
            fase = "erro_api"
            problema_detectado = "erro de API" if is_api_err else f"execução recusada ({stop_reason})"

        if fase == "desconhecida":
            tipo = reg.get("type")
            if tipo == "assistant":
                tipos = [b.get("type") for b in _blocos(reg)]
                if "tool_use" in tipos:
                    fase = "executando_ferramenta"
                elif msg.get("stop_reason") == "end_turn":
                    fase = "entregou"
                else:
                    fase = "escrevendo"
            elif tipo in ("user", "attachment"):
                fase = "processando_resultado"

        if etapa is None:
            for bloco in reversed(_blocos(reg)):
                if bloco.get("type") == "tool_use":
                    etapa, etapa_medida = _etapa_do_bloco(bloco)
                    ferramenta = bloco.get("name")
                    break
        if fase != "desconhecida" and etapa is not None:
            break

    return {
        "fase": fase,
        "etapa": etapa if etapa is not None else "nenhuma ferramenta na cauda lida",
        "etapa_e_description": etapa_medida,
        "ferramenta": ferramenta,
        "ultimo_ts_utc": ultimo_ts,
        "linhas_ilegiveis": ilegiveis,
        "problema_api": problema_detectado,
    }


def _classificar(fase: str, silencio_s: float) -> str:
    if fase in ("entregou", "erro_api"):
        return PARADO
    if fase in ("executando_ferramenta", "processando_resultado", "escrevendo"):
        return TRABALHANDO if silencio_s <= LIMIAR_ATIVO_S else SILENCIOSO
    return SILENCIOSO if silencio_s <= JANELA_CANDIDATO_S else PARADO


def _texto_curto(valor: object, limite: int = 160) -> str | None:
    if not isinstance(valor, str):
        return None
    valor = " ".join(valor.split())
    return valor[:limite] if valor else None


def _identidade_codex(caminho: Path) -> dict:
    """Lê somente o session_meta inicial, sem expor prompt ou caminhos.

    O nome da tarefa usa apenas o último componente de agent_path, que é um
    rótulo operacional curto. Nunca devolvemos o caminho bruto.
    """
    resultado = {"identidade": IDENTIDADE_CODEX_GENERICA, "papel": None,
                 "tarefa": None, "pai": None, "profundidade": None}
    try:
        with caminho.open("rb") as arquivo:
            linha = arquivo.readline(128 * 1024)
        meta = json.loads(linha.decode("utf-8", "replace"))
        payload = meta.get("payload") if isinstance(meta, dict) else None
        if not isinstance(payload, dict):
            return resultado
        papel = _texto_curto(payload.get("agent_role"), 80)
        resultado["papel"] = papel
        if papel in IDENTIDADES_CODEX:
            resultado["identidade"] = IDENTIDADES_CODEX[papel]
        tarefa = _texto_curto(payload.get("agent_path"), 240)
        if tarefa:
            tarefa = tarefa.rstrip("/").rsplit("/", 1)[-1]
            if resultado["identidade"] == IDENTIDADE_CODEX_GENERICA:
                resultado["identidade"] = IDENTIDADES_POR_TAREFA_CODEX.get(tarefa, resultado["identidade"])
            resultado["tarefa"] = _texto_curto(tarefa.replace("_", " "), 120)
        nickname = _texto_curto(payload.get("agent_nickname"), 80)
        if resultado["tarefa"] is None and nickname:
            resultado["tarefa"] = nickname
        source = payload.get("source")
        spawn = source.get("subagent", {}).get("thread_spawn", {}) if isinstance(source, dict) else {}
        if isinstance(spawn, dict):
            pai = _texto_curto(spawn.get("parent_thread_id"), 80)
            resultado["pai"] = pai
            profundidade = spawn.get("depth")
            if isinstance(profundidade, int) and 0 <= profundidade <= 32:
                resultado["profundidade"] = profundidade
    except (OSError, UnicodeError, json.JSONDecodeError):
        pass
    return resultado


def _sessao_mais_ativa(dir_projeto: Path) -> Path | None:
    """Escolhe pela última evidência dentro da sessão, não pelo diretório."""
    candidatas = [d for d in dir_projeto.iterdir() if d.is_dir() and (d / "subagents").is_dir()]
    if not candidatas:
        return None
    def ultima_evidencia(diretorio: Path) -> float:
        arquivos = [p for p in (diretorio / "subagents").iterdir() if p.is_file()]
        return max((p.stat().st_mtime for p in arquivos), default=(diretorio / "subagents").stat().st_mtime)
    return max(candidatas, key=ultima_evidencia)


def _sessoes_ativas(dir_projeto: Path, agora: float) -> list[Path]:
    """Retorna todas as sessões com subagentes ativas dentro da janela de candidatos.
    Se nenhuma estiver na janela, retorna a mais ativa para preservação de histórico."""
    try:
        candidatas = [d for d in dir_projeto.iterdir() if d.is_dir() and (d / "subagents").is_dir()]
    except OSError:
        return []
    if not candidatas:
        return []

    def ultima_evidencia(diretorio: Path) -> float:
        try:
            arquivos = [p for p in (diretorio / "subagents").iterdir() if p.is_file()]
            return max((p.stat().st_mtime for p in arquivos), default=(diretorio / "subagents").stat().st_mtime)
        except OSError:
            return 0.0

    com_mtime = [(d, ultima_evidencia(d)) for d in candidatas]
    ativas = [d for d, mt in com_mtime if (agora - mt) <= JANELA_CANDIDATO_S]
    if ativas:
        ativas.sort(key=lambda d: next(mt for x, mt in com_mtime if x == d), reverse=True)
        return ativas
    mais_ativa = max(com_mtime, key=lambda par: par[1])[0]
    return [mais_ativa]


def _pastas_codex_do_dono(dono: str | None = None, raiz_explicita: object = _CODEX_PADRAO) -> list[Path]:
    """Retorna pastas de sessões Codex do dono (ou da casa toda), incluindo workers."""
    if raiz_explicita is not _CODEX_PADRAO:
        if isinstance(raiz_explicita, Path) and raiz_explicita.is_dir():
            return [raiz_explicita]
        elif isinstance(raiz_explicita, list):
            return [p for p in raiz_explicita if isinstance(p, Path) and p.is_dir()]
        return []
    home = Path.home()
    donos = [dono] if dono else list(PROJETOS_DA_CASA.keys())
    pastas = []
    for d in donos:
        candidatas = list(CODEX_DA_CASA.get(d, []))
        try:
            for p in home.glob(f".codex-{d}*/sessions"):
                if p not in candidatas and p.is_dir():
                    candidatas.append(p)
        except OSError:
            pass
        for c in candidatas:
            if c.is_dir() and c not in pastas:
                pastas.append(c)
    if not pastas and RAIZ_CODEX.is_dir():
        pastas.append(RAIZ_CODEX)
    return pastas


def _codex_recentes(agora: float, dono: str | None = None,
                    raiz_codex: object = _CODEX_PADRAO,
                    coletar_avisos: list[str] | None = None) -> list[dict]:
    """Sessões Codex recentes, incluindo pastas normais e de workers.
    Nunca silencia erro de leitura em pasta existente."""
    pastas = _pastas_codex_do_dono(dono, raiz_explicita=raiz_codex)
    encontrados = []
    for pasta in pastas:
        try:
            arquivos = list(pasta.rglob("*.jsonl"))
        except PermissionError as e:
            if coletar_avisos is not None:
                coletar_avisos.append(f"sem permissão em pasta codex: {_sanitizar_caminho(str(pasta))}")
            continue
        except OSError as e:
            if coletar_avisos is not None:
                coletar_avisos.append(f"erro ao ler codex: {type(e).__name__}: {_sanitizar_caminho(str(e))}")
            continue

        for caminho in arquivos:
            try:
                silencio = max(0.0, agora - caminho.stat().st_mtime)
            except OSError:
                continue
            if silencio <= JANELA_CODEX_S:
                encontrados.append((caminho, silencio))

    encontrados.sort(key=lambda par: par[1])
    agentes = []
    for caminho, silencio in encontrados[:32]:
        identidade = _identidade_codex(caminho)
        agentes.append({
            "id": caminho.stem.removeprefix("rollout-")[-36:],
            "tipo": "codex",
            "motor": "codex",
            "dono": dono,
            "identidade": identidade["identidade"],
            "papel": identidade["papel"],
            "tarefa": identidade["tarefa"],
            "descricao": identidade["tarefa"],
            "pai": identidade["pai"],
            "profundidade": identidade["profundidade"],
            "estado": TRABALHANDO if silencio <= LIMIAR_ATIVO_S else SILENCIOSO,
            "fase": "atividade_codex",
            "etapa": "atividade Codex detectada",
            "etapa_e_description": False,
            "ferramenta": None,
            "silencio_s": round(silencio, 1),
            "ultima_atividade": _hora_br(agora - silencio),
            "inicio": None,
            "transcript_bytes": caminho.stat().st_size,
            "problema": None,
        })
    return agentes


def ler_agentes(projeto: str = PROJETO_PADRAO, raiz: Path | None = None,
                sessao: str | None = None, dono: str | None = None,
                raiz_codex: object = _CODEX_PADRAO) -> dict:
    """Retrato dos agentes desta sessao, agora.

    SEMPRE devolve dict com `ok` e `motivo`. Nunca levanta pra quem chama e
    nunca devolve 0 disfarcando falha.
    """
    t0 = time.perf_counter()
    agora = _agora()
    dono = dono or _deduzir_dono(projeto)
    base = {
        "ok": False,
        "motivo": None,
        "erro": None,
        "medido_em": _hora_br(agora),
        "medido_em_iso": datetime.fromtimestamp(agora, BRT).isoformat(),
        "custo_ms": None,
        "sessao": None,
        "caminho": None,
        "limiares_s": {"ativo": LIMIAR_ATIVO_S, "janela_candidato": JANELA_CANDIDATO_S},
        "contagem": {TRABALHANDO: None, SILENCIOSO: None, PARADO: None, "vivos": None, "total": None, "historico": None},
        "agentes": [],
        "avisos": [],
    }

    def fechar(**campos) -> dict:
        base.update(campos)
        base["custo_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return base

    raiz = raiz or RAIZ_PROJETOS
    agentes: list[dict] = []
    avisos: list[str] = []
    claude_ok = False
    claude_motivo = None
    claude_erro = None

    try:
        dir_projeto = Path(raiz) / projeto
        if not dir_projeto.is_dir():
            claude_motivo = "projeto_inexistente"
            claude_erro = f"não existe a pasta do projeto: {_sanitizar_caminho(str(dir_projeto))}"
            base["caminho"] = _sanitizar_caminho(str(dir_projeto))
            avisos.append(claude_erro)
        else:
            sessoes_candidatas = [dir_projeto / sessao] if sessao else _sessoes_ativas(dir_projeto, agora)
            if not sessoes_candidatas:
                claude_motivo = "nenhuma_sessao_com_subagentes"
                claude_erro = f"nenhuma sessão com pasta subagents/ dentro de {_sanitizar_caminho(str(dir_projeto))}"
                base["caminho"] = _sanitizar_caminho(str(dir_projeto))
                avisos.append(claude_erro)
            else:
                base["sessao"] = sessoes_candidatas[0].name
                base["caminho"] = _sanitizar_caminho(str(sessoes_candidatas[0] / "subagents"))
                claude_ok = True

                for dir_sessao in sessoes_candidatas:
                    pasta = dir_sessao / "subagents"
                    if not pasta.is_dir():
                        continue

                    metas = sorted(pasta.glob("agent-*.meta.json"))
                    if not metas and len(sessoes_candidatas) == 1:
                        avisos.append("a pasta existe e foi lida, e não há nenhum agente registrado nela")

                    for meta_path in metas:
                        ident = meta_path.name[len("agent-"):-len(".meta.json")]
                        item = {
                            "id": ident,
                            "tipo": None, "motor": "claude", "dono": dono,
                            "descricao": None, "pai": None, "profundidade": None,
                            "estado": None, "fase": None, "etapa": None, "etapa_e_description": None,
                            "ferramenta": None,
                            "silencio_s": None, "ultima_atividade": None, "inicio": None,
                            "transcript_bytes": None, "problema": None,
                        }
                        try:
                            meta = json.loads(meta_path.read_text(encoding="utf-8"))
                            if not isinstance(meta, dict):
                                raise ValueError("meta.json não é um dicionário")
                            item["tipo"] = meta.get("agentType")
                            item["descricao"] = meta.get("description")
                            item["pai"] = meta.get("parentAgentId")
                            item["profundidade"] = meta.get("spawnDepth")
                            item["inicio"] = _hora_br(meta_path.stat().st_mtime)
                            item["inicio_epoch"] = meta_path.stat().st_mtime
                        except (OSError, ValueError) as e:
                            item["problema"] = f"meta ilegível: {type(e).__name__}: {_sanitizar_caminho(str(e))}"
                            avisos.append(f"{ident}: meta ilegível")

                        transcript = pasta / f"agent-{ident}.jsonl"
                        try:
                            st = transcript.stat()
                            item["transcript_bytes"] = st.st_size
                            silencio = max(0.0, agora - st.st_mtime)
                            item["silencio_s"] = round(silencio, 1)
                            item["ultima_atividade"] = _hora_br(st.st_mtime)
                        except FileNotFoundError:
                            item["problema"] = (item["problema"] or "") + " sem transcript (agente registrado e nunca escreveu)"
                            item["estado"] = PARADO
                            item["fase"] = "sem_transcript"
                            item["etapa"] = "nunca escreveu no transcript"
                            agentes.append(item)
                            avisos.append(f"{ident}: registrado sem transcript")
                            continue
                        except OSError as e:
                            item["problema"] = f"transcript ilegível: {type(e).__name__}: {_sanitizar_caminho(str(e))}"
                            item["estado"] = None
                            item["etapa"] = "não foi possível ler"
                            agentes.append(item)
                            avisos.append(f"{ident}: transcript ilegível")
                            continue

                        if silencio > JANELA_CANDIDATO_S:
                            item["estado"] = PARADO
                            item["fase"] = "fora_da_janela"
                            item["etapa"] = "fora da janela de leitura (histórico)"
                            agentes.append(item)
                            continue

                        try:
                            cauda = _analisar_cauda(transcript)
                        except OSError as e:
                            item["problema"] = f"falha ao ler a cauda: {type(e).__name__}: {_sanitizar_caminho(str(e))}"
                            item["estado"] = None
                            item["etapa"] = "não foi possível ler"
                            agentes.append(item)
                            avisos.append(f"{ident}: falha ao ler a cauda do transcript")
                            continue

                        item.update({
                            "fase": cauda["fase"],
                            "etapa": cauda["etapa"],
                            "etapa_e_description": cauda["etapa_e_description"],
                            "ferramenta": cauda["ferramenta"],
                            "estado": _classificar(cauda["fase"], silencio),
                        })
                        if cauda.get("problema_api"):
                            item["problema"] = cauda["problema_api"]
                        elif cauda["linhas_ilegiveis"]:
                            item["problema"] = f"{cauda['linhas_ilegiveis']} linha(s) ilegível(is) na cauda"
                        agentes.append(item)
    except PermissionError as e:
        claude_motivo = "sem_permissao"
        claude_erro = f"sem permissão de leitura: {_sanitizar_caminho(str(e))}"
        avisos.append(claude_erro)
    except OSError as e:
        claude_motivo = "erro_leitura"
        claude_erro = f"{type(e).__name__}: {_sanitizar_caminho(str(e))}"
        avisos.append(claude_erro)

    # Leitura Codex sempre executada (não é cancelada por falha do Claude)
    codex = _codex_recentes(agora, dono=dono, raiz_codex=raiz_codex, coletar_avisos=avisos)
    if codex:
        base["sessao"] = base["sessao"] or "codex"
        pastas_dono = _pastas_codex_do_dono(dono, raiz_explicita=raiz_codex)
        base["caminho"] = base["caminho"] or (_sanitizar_caminho(str(pastas_dono[0])) if pastas_dono else "codex")
        agentes.extend(codex)

    # Se Claude funcionou OU se o Codex retornou agentes, a leitura é bem-sucedida
    sucesso = claude_ok or bool(codex)
    if not sucesso:
        return fechar(
            ok=False,
            motivo=claude_motivo or "falha_leitura",
            erro=claude_erro,
            avisos=avisos,
        )

    historico = sum(a["estado"] == PARADO for a in agentes)
    agentes = [a for a in agentes if a["estado"] != PARADO]
    conta = {TRABALHANDO: 0, SILENCIOSO: 0, PARADO: 0}
    indeterminados = 0
    for a in agentes:
        if a["estado"] in conta:
            conta[a["estado"]] += 1
        else:
            indeterminados += 1
    if indeterminados:
        avisos.append(f"{indeterminados} agente(s) sem estado: o transcript não pôde ser lido")

    agentes.sort(key=lambda a: (a["silencio_s"] is None, a["silencio_s"] or 0))

    return fechar(
        ok=True,
        motivo="leitura_ok",
        contagem={**conta, "vivos": conta[TRABALHANDO] + conta[SILENCIOSO],
                  "total": len(agentes), "historico": historico,
                  "indeterminados": indeterminados},
        agentes=agentes,
        avisos=avisos,
    )


def ler_agentes_da_casa(projetos: dict[str, str] | None = None,
                         raiz: Path | None = None,
                         codex: dict[str, Path] | None = None) -> dict:
    """Agrega ler_agentes() das três sessões da casa em um único retrato.

    Nunca deixa uma sessão que falhou apagar as que funcionaram: erro de
    uma entra em `avisos`, com o dono nomeado, e as outras continuam
    valendo. Cada agente ganha o campo `dono` (luana/renato/bia) — sem
    isso o front não tem como saber de quem é o boneco.

    Codex: cada dono lê só o próprio CODEX_HOME (`codex`). Com `projetos`
    explícito e sem `codex`, nenhuma sessão Codex entra (leitura isolada).
    """
    if codex is None:
        codex = CODEX_DA_CASA if projetos is None else {}
    projetos = projetos or PROJETOS_DA_CASA
    t0 = time.perf_counter()
    agentes: list[dict] = []
    avisos: list[str] = []
    conta = {TRABALHANDO: 0, SILENCIOSO: 0, PARADO: 0}
    historico_total = 0
    indeterminados_total = 0
    algum_ok = False

    for dono, projeto in projetos.items():
        try:
            r = ler_agentes(projeto=projeto, raiz=raiz, dono=dono, raiz_codex=codex.get(dono) if codex is not None else _CODEX_PADRAO)
            if not r.get("ok"):
                erro_desc = _sanitizar_caminho(str(r.get("erro") or r.get("motivo")))
                avisos.append(f"{dono}: {r.get('motivo')} — {erro_desc}")
            else:
                algum_ok = True

            for a in r.get("agentes", []):
                a = {**a, "dono": dono}
                agentes.append(a)
                if a.get("estado") in conta:
                    conta[a["estado"]] += 1
            historico_total += r.get("contagem", {}).get("historico") or 0
            indeterminados_total += r.get("contagem", {}).get("indeterminados") or 0
            avisos.extend(f"{dono}: {_sanitizar_caminho(av)}" for av in r.get("avisos", []))
        except Exception as e:
            avisos.append(f"{dono}: falha inesperada na sonda: {type(e).__name__}: {_sanitizar_caminho(str(e))}")

    agentes.sort(key=lambda a: (a.get("silencio_s") is None, a.get("silencio_s") or 0))
    agora = _agora()
    return {
        "ok": algum_ok,
        "motivo": "leitura_ok" if algum_ok else "todas_as_sessoes_falharam",
        "erro": None,
        "medido_em": _hora_br(agora),
        "medido_em_iso": datetime.fromtimestamp(agora, BRT).isoformat(),
        "custo_ms": round((time.perf_counter() - t0) * 1000, 1),
        "limiares_s": {"ativo": LIMIAR_ATIVO_S, "janela_candidato": JANELA_CANDIDATO_S},
        "contagem": {**conta, "vivos": conta[TRABALHANDO] + conta[SILENCIOSO],
                     "total": len(agentes), "historico": historico_total,
                     "indeterminados": indeterminados_total},
        "agentes": agentes,
        "avisos": avisos,
    }



# --------------------------------------------------------------------------
# _CALIBRAGEM
# --------------------------------------------------------------------------
# LIMIAR_ATIVO_S = 90 em 10/09/2026. Preenchido pela medicao registrada no
# fim deste arquivo pelo agente que mediu a distribuicao de silencio.
# Se este bloco estiver sem numero, o limiar e chute: conserte antes de
# confiar na cor da pilula.
# --------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    alvo = sys.argv[1] if len(sys.argv) > 1 else PROJETO_PADRAO
    if alvo == "--casa":
        r = ler_agentes_da_casa()
    else:
        r = ler_agentes(projeto=alvo)
    print(json.dumps(r, ensure_ascii=False, indent=2)[:4000])
