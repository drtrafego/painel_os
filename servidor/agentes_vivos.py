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
import sqlite3
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BRT = ZoneInfo("America/Sao_Paulo")

# Onde os transcripts moram. O nome da pasta e o cwd com as barras viradas.
# A sonda observa os agentes de claude, independentemente do usuário que
# iniciou o servidor web (watchdog/root ou claude).
AGENT_HOME = Path(os.environ.get("PAINEL_AGENT_HOME", "/home/claude"))
RAIZ_PROJETOS = AGENT_HOME / ".claude" / "projects"
PROC = Path("/proc")
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
        AGENT_HOME / ".codex-luana" / "sessions",
        AGENT_HOME / ".codex-luana-workers" / "sessions",
    ],
    "renato": [
        AGENT_HOME / ".codex-renato" / "sessions",
        AGENT_HOME / ".codex-renato-workers" / "sessions",
    ],
    "bia": [
        AGENT_HOME / ".codex-bia" / "sessions",
        AGENT_HOME / ".codex-bia-workers" / "sessions",
    ],
}
_CODEX_PADRAO = object()
_PROC_PADRAO = object()
_PROC_CODEX_PADRAO = object()
_PROC_WORKERS_CODEX_PADRAO = object()

# Quanto do fim do transcript a gente le pra achar o ultimo tool_use.
# 256 KB cobre folgado varios turnos; o arquivo pode ter 14 MB.
CAUDA_BYTES = 256 * 1024
CAUDA_PAI_BYTES = 4 * 1024 * 1024

# So abre o transcript de quem escreveu nas ultimas N horas. A sessao pai tem
# mais uma rede: se escreveu hoje, aparece como silenciosa mesmo depois do limiar
# de vivo, porque diretor sem subagente pendente ainda e presença operacional.
JANELA_CANDIDATO_S = 6 * 3600
RAIZ_CODEX = AGENT_HOME / ".codex-luana" / "sessions"
# Cada sessão da casa tem o próprio CODEX_HOME. Sem este mapa, a agregação
# chamava ler_agentes() três vezes e as sessões Codex da Luana apareciam
# triplicadas, carimbadas como luana, renato e bia.
JANELA_CODEX_S = 90
LIMIAR_SESSAO_COORDENADORA_ATIVA_S = 3 * 60

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


def _cmdline_e_claude_remoto(args: list[str], dono: str) -> bool:
    if not args:
        return False
    if Path(args[0]).name != "claude":
        return False
    for i, arg in enumerate(args):
        if arg == "--remote-control" and i + 1 < len(args) and args[i + 1] == dono:
            return True
        if arg == f"--remote-control={dono}":
            return True
    return False


def _processos_claude_remotos(proc: Path = PROC) -> tuple[set[str] | None, str | None]:
    """Retorna donos com /usr/local/bin/claude --remote-control vivo.

    Se a listagem de /proc falha, a presença da sessão raiz fica
    indeterminada. Pids que somem durante a leitura são normais e ignorados.
    """
    try:
        entradas = list(Path(proc).iterdir())
    except OSError as exc:
        return None, f"falha ao listar processos ({type(exc).__name__})"

    vivos: set[str] = set()
    pids = [entrada for entrada in entradas if entrada.name.isdigit()]
    lidos = 0
    for entrada in pids:
        try:
            bruto = (entrada / "cmdline").read_bytes()
        except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
            continue
        if not bruto:
            continue
        lidos += 1
        args = [parte.decode("utf-8", "replace") for parte in bruto.split(b"\0") if parte]
        for dono in PROJETOS_DA_CASA:
            if _cmdline_e_claude_remoto(args, dono):
                vivos.add(dono)
    if pids and lidos == 0:
        return None, "falha ao ler cmdline dos processos"
    return vivos, None


def _resolver_processos_claude(processos_claude: object) -> tuple[set[str] | None, str | None]:
    if processos_claude is _PROC_PADRAO:
        return _processos_claude_remotos()
    if isinstance(processos_claude, tuple) and len(processos_claude) == 2:
        vivos, erro = processos_claude
        return (set(vivos) if vivos is not None else None), erro
    if processos_claude is None:
        return set(), None
    return set(processos_claude), None


def _dono_do_codex_home(valor: str) -> str | None:
    nome = Path(valor).name.lower()
    for dono in PROJETOS_DA_CASA:
        if nome in (f".codex-{dono}", f".codex-{dono}-workers"):
            return dono
    return None


def _processos_codex_exec(proc: Path = PROC) -> tuple[dict[str, int] | None, str | None]:
    """Conta `codex exec` vivos por CODEX_HOME, sem ler prompt ou argumentos.

    O transcript pode ficar sem novo mtime durante uma ferramenta longa. Nesse
    intervalo, o processo é a evidência de vida que impede o card de sumir.
    """
    try:
        entradas = list(Path(proc).iterdir())
    except OSError as exc:
        return None, f"falha ao listar processos ({type(exc).__name__})"

    vivos: dict[str, int] = {}
    candidatos = 0
    ambientes_lidos = 0
    for entrada in (item for item in entradas if item.name.isdigit()):
        try:
            bruto = (entrada / "cmdline").read_bytes()
        except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
            continue
        args = [parte.decode("utf-8", "replace") for parte in bruto.split(b"\0") if parte]
        if not args or Path(args[0]).name != "codex" or "exec" not in args[1:4]:
            continue
        candidatos += 1
        try:
            ambiente = (entrada / "environ").read_bytes()
        except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
            continue
        ambientes_lidos += 1
        pares = [parte.decode("utf-8", "replace") for parte in ambiente.split(b"\0") if parte]
        codex_home = next((par.split("=", 1)[1] for par in pares if par.startswith("CODEX_HOME=")), "")
        dono = _dono_do_codex_home(codex_home)
        if dono:
            vivos[dono] = vivos.get(dono, 0) + 1
    if candidatos and ambientes_lidos == 0:
        return None, "falha ao ler ambiente dos processos Codex"
    return vivos, None


def _resolver_processos_codex(processos_codex: object) -> tuple[dict[str, int] | None, str | None]:
    if processos_codex is _PROC_CODEX_PADRAO:
        return _processos_codex_exec()
    if isinstance(processos_codex, tuple) and len(processos_codex) == 2:
        vivos, erro = processos_codex
        return (dict(vivos) if vivos is not None else None), erro
    if processos_codex is None:
        return {}, None
    return dict(processos_codex), None


def _args_do_processo(proc: Path, pid: str) -> list[str] | None:
    try:
        bruto = (Path(proc) / pid / "cmdline").read_bytes()
    except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
        return None
    if not bruto:
        return []
    return [parte.decode("utf-8", "replace") for parte in bruto.split(b"\0") if parte]


def _ppid_do_processo(proc: Path, pid: str) -> str | None:
    """Lê o pai sem depender do formato frágil de `ps`."""
    try:
        for linha in (Path(proc) / pid / "status").read_text(encoding="utf-8", errors="replace").splitlines():
            if linha.startswith("PPid:"):
                valor = linha.split(":", 1)[1].strip()
                return valor if valor.isdigit() else None
    except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
        return None
    return None


def _dono_do_script_mecanico(args: list[str]) -> str | None:
    for arg in args:
        encontrado = re.search(r"/opt/gastaomatos/(luana|renato|bia)/codex_mecanico\.sh(?:$|[/:])", arg)
        if encontrado:
            return encontrado.group(1)
    return None


def _dono_do_cwd_do_processo(proc: Path, pid: str) -> str | None:
    try:
        caminho = os.readlink(Path(proc) / pid / "cwd")
    except (FileNotFoundError, ProcessLookupError, PermissionError, OSError):
        return None
    encontrado = re.match(r"/opt/gastaomatos/(luana|renato|bia)(?:/|$)", caminho)
    return encontrado.group(1) if encontrado else None


def _inicio_do_processo(proc: Path, pid: str) -> float | None:
    """Converte o starttime de /proc em epoch, sem chamar `ps` por PID."""
    try:
        bruto = (Path(proc) / pid / "stat").read_text(encoding="utf-8", errors="replace")
        fim_nome = bruto.rfind(")")
        campos = bruto[fim_nome + 2:].split()
        inicio_ticks = int(campos[19])
        btime = next(
            int(linha.split()[1])
            for linha in (Path(proc) / "stat").read_text(encoding="utf-8", errors="replace").splitlines()
            if linha.startswith("btime ")
        )
        return btime + inicio_ticks / os.sysconf("SC_CLK_TCK")
    except (FileNotFoundError, ProcessLookupError, PermissionError, OSError, ValueError, IndexError, StopIteration):
        return None


def _modelo_do_comando_codex(args: list[str], indice_exec: int) -> str | None:
    for indice in range(indice_exec + 1, len(args) - 1):
        if args[indice] in ("-m", "--model"):
            return args[indice + 1]
        if args[indice].startswith("--model="):
            return args[indice].split("=", 1)[1]
    return None


def _esforco_do_comando_codex(args: list[str], indice_exec: int) -> str | None:
    for indice in range(indice_exec + 1, len(args) - 1):
        configuracao = args[indice + 1] if args[indice] in ("-c", "--config") else args[indice]
        encontrado = re.fullmatch(r"model_reasoning_effort=(low|medium|high|xhigh)", configuracao)
        if encontrado:
            return encontrado.group(1)
    return None


def _prompt_do_comando_codex(args: list[str], indice_exec: int) -> str | None:
    """Extrai só o argumento posicional que o wrapper passa como prompt."""
    opcoes_com_valor = {"-c", "--config", "-m", "--model", "-s", "--sandbox", "-C", "--cd"}
    indice = indice_exec + 1
    while indice < len(args):
        arg = args[indice]
        if arg in opcoes_com_valor:
            indice += 2
            continue
        if arg.startswith("--model=") or arg.startswith("--config=") or arg.startswith("--sandbox="):
            indice += 1
            continue
        if arg.startswith("-"):
            indice += 1
            continue
        return _sanitizar_etapa_codex(arg)
    return None


def _workers_codex_mecanico(proc: Path = PROC, agora: float | None = None) -> tuple[list[dict] | None, str | None]:
    """Lista cada `codex exec` vivo que descende de `codex_mecanico.sh`.

    Sessions/transcripts não são usados para identificar o worker: em tarefas
    paralelas eles podem atrasar ou não existir ainda. O processo e sua cadeia
    de pais são a evidência de execução, e cada PID vira um boneco próprio.
    """
    try:
        entradas = [item for item in Path(proc).iterdir() if item.name.isdigit()]
    except OSError as exc:
        return None, f"falha ao listar processos ({type(exc).__name__})"

    agora = _agora() if agora is None else agora
    workers = []
    for entrada in entradas:
        pid = entrada.name
        args = _args_do_processo(proc, pid)
        if not args or Path(args[0]).name != "codex" or "exec" not in args[1:8]:
            continue
        indice_exec = args.index("exec")
        dono = None
        ancestral = pid
        vistos = set()
        for _ in range(12):
            if ancestral in vistos:
                break
            vistos.add(ancestral)
            args_ancestral = args if ancestral == pid else _args_do_processo(proc, ancestral)
            if args_ancestral is None:
                break
            dono = _dono_do_script_mecanico(args_ancestral)
            if dono:
                break
            pai = _ppid_do_processo(proc, ancestral)
            if not pai or pai == "0":
                break
            ancestral = pai
        if not dono:
            continue

        inicio_epoch = _inicio_do_processo(proc, pid)
        rodando_s = max(0.0, agora - inicio_epoch) if inicio_epoch is not None else None
        prompt = _prompt_do_comando_codex(args, indice_exec)
        tarefa = prompt or "tarefa técnica em execução"
        modelo = _modelo_do_comando_codex(args, indice_exec)
        esforco = _esforco_do_comando_codex(args, indice_exec)
        workers.append({
            "id": f"worker-codex-{pid}",
            "nome": "Worker Codex",
            "tipo": "worker_codex",
            "motor": "codex",
            "dono": dono,
            "identidade": "worker-codex",
            "papel": "Worker técnico (Codex)",
            "tarefa": tarefa,
            "descricao": tarefa,
            "pai": dono,
            "profundidade": 1,
            "estado": TRABALHANDO,
            "fase": "processo_codex_mecanico",
            "etapa": tarefa,
            "etapa_e_description": False,
            "ferramenta": None,
            "silencio_s": 0.0,
            "ultima_atividade": _hora_br(agora),
            "inicio": _hora_br(inicio_epoch),
            "inicio_epoch": inicio_epoch,
            "transcript_bytes": None,
            "problema": None,
            "modelo": modelo,
            "modelo_legivel": _formatar_modelo(modelo),
            "esforco": _formatar_esforco(esforco),
            "ferramentas_usadas": 0,
            "tokens_total": None,
            "tokens_formatado": None,
            "rodando_ha_s": round(rodando_s, 1) if rodando_s is not None else None,
            "rodando_ha": _formatar_duracao(rodando_s),
            "quem_mandou": dono,
            "status": "executando",
        })
    workers.sort(key=lambda item: item["id"])
    return workers, None


def _resolver_workers_codex_mecanico(workers: object) -> tuple[list[dict] | None, str | None]:
    if workers is _PROC_WORKERS_CODEX_PADRAO:
        return _workers_codex_mecanico()
    if isinstance(workers, tuple) and len(workers) == 2:
        itens, erro = workers
        return (list(itens) if itens is not None else None), erro
    if workers is None:
        return [], None
    return list(workers), None

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
LIMIAR_VIVO_S = 600  # 10 minutos: limite unificado para considerar agente vivo

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


def _analisar_cauda(caminho: Path, n: int = CAUDA_BYTES) -> dict:
    """O que o FIM do transcript diz. Levanta em erro de leitura: quem chama
    decide o que fazer, e o erro viaja junto em vez de virar zero."""
    linhas = _ler_cauda(caminho, n)
    fase = "desconhecida"
    ultimo_ts = None
    etapa = None
    etapa_medida = False
    ferramenta = None
    modelo = None
    esforco = None
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

        if esforco is None:
            esforco = _extrair_esforco_registro(reg)

        msg = reg.get("message") if isinstance(reg.get("message"), dict) else {}
        if modelo is None and isinstance(msg.get("model"), str) and msg["model"].strip():
            modelo = msg["model"].strip()
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
        if fase != "desconhecida" and etapa is not None and esforco is not None and modelo is not None:
            break

    return {
        "fase": fase,
        "etapa": etapa if etapa is not None else "nenhuma ferramenta na cauda lida",
        "etapa_e_description": etapa_medida,
        "ferramenta": ferramenta,
        "modelo": modelo,
        "modelo_legivel": _formatar_modelo(modelo),
        "ultimo_ts_utc": ultimo_ts,
        "linhas_ilegiveis": ilegiveis,
        "problema_api": problema_detectado,
        "esforco": _formatar_esforco(esforco),
    }


def _classificar(fase: str, silencio_s: float) -> str:
    if fase in ("entregou", "erro_api"):
        return PARADO
    if silencio_s > LIMIAR_VIVO_S:
        return PARADO
    if fase in ("executando_ferramenta", "processando_resultado", "escrevendo"):
        return TRABALHANDO if silencio_s <= LIMIAR_ATIVO_S else SILENCIOSO
    return SILENCIOSO


def _texto_curto(valor: object, limite: int = 160) -> str | None:
    if not isinstance(valor, str):
        return None
    valor = " ".join(valor.split())
    return valor[:limite] if valor else None


def _sanitizar_etapa_codex(texto: str) -> str | None:
    """Prepara uma linha de pedido para exibição pública no painel."""
    limpo = _sanitizar_caminho(texto)
    limpo_norm = " ".join(limpo.split()).casefold()
    prefixos_privados = (
        "você é ",
        "voce é ",
        "voce e ",
        "a ponte enviará automaticamente",
        "a ponte enviara automaticamente",
        "mensagem nova recebida",
        "retomada interna da ponte",
        "mantenha cada resposta ao telegram",
        "tipo da entrada:",
    )
    if limpo_norm.startswith(prefixos_privados):
        return None
    if "preserve exclusivamente essa identidade" in limpo_norm:
        return None
    limpo = re.sub(
        r"(?i)(?<!\S)\S*[\\/]\S*(?:credencial|credential|secret|token|senha|password|\.env)\S*",
        "[caminho]",
        limpo,
    )
    limpo = re.sub(
        r"(?i)\b(token|senha|password|credencial|secret|api[ _-]?key)\b\s*[:=]\s*\S+",
        lambda m: f"{m.group(1)}: [redigido]",
        limpo,
    )
    limpo = re.sub(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[e-mail]", limpo)

    def _redigir_telefone(casamento: re.Match[str]) -> str:
        valor = casamento.group(0)
        return "[telefone]" if len(re.sub(r"\D", "", valor)) >= 10 else valor

    limpo = re.sub(r"(?<!\w)\+?\d[\d(). -]{8,}\d(?!\w)", _redigir_telefone, limpo)
    return _texto_curto(limpo, 90)


def _linha_publica_pedido_codex(linha: str) -> str | None:
    linha = " ".join(linha.split())
    if not linha:
        return None
    if linha.startswith("{") and '"content"' in linha:
        try:
            payload = json.loads(linha)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict):
            conteudo = payload.get("content")
            if isinstance(conteudo, str):
                for pedaco in conteudo.splitlines():
                    publico = _sanitizar_etapa_codex(pedaco)
                    if publico:
                        return publico
            return None
    return _sanitizar_etapa_codex(linha)


def _primeira_linha_pedido_codex(registro: dict) -> str | None:
    """Extrai a primeira linha útil de uma mensagem real do usuário."""
    payload = registro.get("payload")
    if not (
        registro.get("type") == "response_item"
        and isinstance(payload, dict)
        and payload.get("type") == "message"
        and payload.get("role") == "user"
    ):
        return None

    conteudo = payload.get("content")
    if isinstance(conteudo, str):
        blocos = [conteudo]
    elif isinstance(conteudo, list):
        blocos = [
            bloco.get("text")
            for bloco in conteudo
            if isinstance(bloco, dict)
            and bloco.get("type") in ("input_text", "text")
            and isinstance(bloco.get("text"), str)
        ]
    else:
        return None

    prefixos_injetados = (
        "<recommended_plugins>",
        "# agents.md instructions for ",
        "<environment_context>",
    )
    # The Telegram bridge prefixes the real JSON message with operational
    # instructions. Prefer the user's content over that wrapper.
    for bloco in blocos:
        for linha in bloco.splitlines():
            if linha.lstrip().startswith("{") and '"content"' in linha:
                publico = _linha_publica_pedido_codex(linha)
                if publico:
                    return publico
    for bloco in blocos:
        texto = bloco.lstrip()
        if texto.lower().startswith(prefixos_injetados):
            continue
        for linha in texto.splitlines():
            publico = _linha_publica_pedido_codex(linha)
            if publico:
                return publico
    return None


def _formatar_modelo(modelo: str | None) -> str | None:
    if not modelo or not isinstance(modelo, str):
        return None
    m = modelo.strip()
    m_low = m.lower()

    # Anthropic
    if any(k in m_low for k in ("opus-5-5", "opus-5.5", "5-5-opus", "5.5-opus")):
        return "Opus 5.5"
    if any(k in m_low for k in ("opus-4-5", "opus-4.5", "4-5-opus", "4.5-opus")):
        return "Opus 4.5"
    if any(k in m_low for k in ("opus-5", "5-opus")):
        return "Opus 5"
    if any(k in m_low for k in ("opus-3", "3-opus")):
        return "Opus 3"
    if "opus" in m_low:
        limpo = m.replace("claude-", "").replace("anthropic/", "").replace("_", " ").strip()
        return limpo[:25]

    if any(k in m_low for k in ("sonnet-3-7", "sonnet-3.7", "3-7-sonnet", "3.7-sonnet")):
        return "Sonnet 3.7"
    if any(k in m_low for k in ("sonnet-3-5", "sonnet-3.5", "3-5-sonnet", "3.5-sonnet")):
        return "Sonnet 3.5"
    if any(k in m_low for k in ("sonnet-4-5", "sonnet-4.5", "4-5-sonnet", "4.5-sonnet")):
        return "Sonnet 4.5"
    if any(k in m_low for k in ("sonnet-5", "5-sonnet")):
        return "Sonnet 5"
    if "sonnet" in m_low:
        return "Sonnet"

    if any(k in m_low for k in ("haiku-4-5", "haiku-4.5", "4-5-haiku", "4.5-haiku")):
        return "Haiku 4.5"
    if any(k in m_low for k in ("haiku-3-5", "haiku-3.5", "3-5-haiku", "3.5-haiku")):
        return "Haiku 3.5"
    if "haiku" in m_low:
        return "Haiku"

    # OpenAI: variantes específicas precisam vir antes das famílias genéricas.
    modelos_codex = {
        "gpt-5.6-sol": "GPT-5.6 Sol",
        "gpt-5.6-terra": "GPT-5.6 Terra",
        "gpt-5.6-luna": "GPT-5.6 Luna",
        "gpt-6-astra": "GPT-6 Astra",
    }
    for id_modelo, rotulo in modelos_codex.items():
        if id_modelo in m_low:
            return rotulo
    if any(k in m_low for k in ("gpt-5-5", "gpt-5.5")):
        return "GPT-5.5"
    versao_gpt = re.search(r"\bgpt-(\d+\.\d+)(?:-([a-z0-9][a-z0-9._-]*))?", m_low)
    if versao_gpt:
        rotulo = f"GPT-{versao_gpt.group(1)}"
        variante = versao_gpt.group(2)
        if variante:
            rotulo += " " + variante.replace("-", " ").replace("_", " ").title()
        return rotulo[:25]
    if "gpt-6" in m_low:
        return "GPT-6"
    if "gpt-5" in m_low:
        return "GPT-5"
    if "gpt-4o-mini" in m_low:
        return "GPT-4o mini"
    if "gpt-4o" in m_low:
        return "GPT-4o"
    if "gpt-4" in m_low:
        return "GPT-4"
    if "o3-mini" in m_low:
        return "o3-mini"
    if "o3" in m_low:
        return "o3"
    if "o1-mini" in m_low:
        return "o1-mini"
    if "o1-preview" in m_low or "o1" in m_low:
        return "o1"

    limpo = m.replace("claude-", "").replace("anthropic/", "").replace("_", " ")
    if "gpt" in m_low:
        return limpo[:25].strip()
    return limpo[:25].strip().title()


def _formatar_duracao(segundos: float | None) -> str | None:
    if segundos is None or segundos < 0:
        return None
    s = int(round(segundos))
    if s < 60:
        return f"{s}s"
    minutos = s // 60
    segs = s % 60
    if minutos < 60:
        return f"{minutos}m {segs}s" if segs > 0 else f"{minutos}m"
    horas = minutos // 60
    resto_mins = minutos % 60
    return f"{horas}h {resto_mins}m" if resto_mins > 0 else f"{horas}h"


def _formatar_tokens(tokens: int | None) -> str | None:
    if tokens is None or tokens < 0:
        return None
    if tokens < 1000:
        return str(tokens)
    if tokens < 1_000_000:
        return f"{tokens / 1000:.1f}k"
    return f"{tokens / 1_000_000:.1f}M"


def _formatar_esforco(esforco: str | None) -> str | None:
    if not esforco or not isinstance(esforco, str):
        return None
    e = esforco.lower().strip()
    mapa = {
        "low": "baixo",
        "baixo": "baixo",
        "medium": "médio",
        "medio": "médio",
        "médio": "médio",
        "high": "alto",
        "alto": "alto",
        "xhigh": "máximo (xhigh)",
        "max": "máximo (xhigh)",
        "maximo": "máximo (xhigh)",
        "máximo": "máximo (xhigh)",
        "máximo (xhigh)": "máximo (xhigh)",
    }
    return mapa.get(e, e.capitalize())


_CHAVES_ESFORCO = (
    "model_reasoning_effort",
    "reasoning_effort",
    "perTurnEffort",
    "effort",
)
_ESFORCOS_REAIS = {"low", "medium", "high", "xhigh"}
_CAMPOS_CONTEUDO_LIVRE = {"content", "input", "arguments", "text", "thinking", "signature"}


def _extrair_esforco_registro(registro: dict) -> str | None:
    """Lê o esforço real da telemetria, sem confundir texto/tool input com metadado.

    Codex grava o valor em turn_context (direto ou em settings); Claude grava
    normalmente `effort`/`perTurnEffort` no evento. As chaves específicas de
    reasoning têm precedência sobre o alias genérico.
    """
    if not isinstance(registro, dict):
        return None

    def buscar(objeto: object, chave: str) -> str | None:
        if isinstance(objeto, dict):
            valor = objeto.get(chave)
            if isinstance(valor, str) and valor.strip():
                normalizado = valor.strip().lower()
                if normalizado in _ESFORCOS_REAIS:
                    return normalizado
            for nome, filho in objeto.items():
                if nome in _CAMPOS_CONTEUDO_LIVRE:
                    continue
                achado = buscar(filho, chave)
                if achado:
                    return achado
        elif isinstance(objeto, list):
            for filho in objeto:
                achado = buscar(filho, chave)
                if achado:
                    return achado
        return None

    for chave in _CHAVES_ESFORCO:
        achado = buscar(registro, chave)
        if achado:
            return achado
    return None


def _ts_para_epoch(ts: object) -> float | None:
    if isinstance(ts, (int, float)):
        return float(ts) if ts > 0 else None
    if not isinstance(ts, str) or not ts.strip():
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.timestamp()
    except (ValueError, TypeError):
        return None


def _mesmo_dia_brt(epoch: float, agora: float) -> bool:
    return datetime.fromtimestamp(epoch, BRT).date() == datetime.fromtimestamp(agora, BRT).date()


_CACHE_PATH = Path(tempfile.gettempdir()) / "painel_os_metricas_cache.json"
_CACHE_METRICAS_VERSAO = 4


def _carregar_cache_disco() -> dict[str, dict]:
    if _CACHE_PATH.is_file():
        try:
            with _CACHE_PATH.open("r", encoding="utf-8") as f:
                d = json.load(f)
                if isinstance(d, dict):
                    return d
        except Exception:
            pass
    return {}


def _salvar_cache_disco(cache: dict[str, dict]) -> None:
    try:
        tmp_file = _CACHE_PATH.with_suffix(".tmp")
        with tmp_file.open("w", encoding="utf-8") as f:
            json.dump(cache, f)
        tmp_file.replace(_CACHE_PATH)
    except Exception:
        pass


_CACHE_METRICAS: dict[str, dict] = _carregar_cache_disco()


def _extrair_metricas_transcript(caminho: Path, agora: float) -> dict:
    chave = str(caminho)
    try:
        st = caminho.stat()
    except OSError:
        return {}

    cached = _CACHE_METRICAS.get(chave)
    if (
        cached
        and cached.get("versao") == _CACHE_METRICAS_VERSAO
        and cached.get("mtime") == st.st_mtime
        and cached.get("size") == st.st_size
    ):
        res = dict(cached["metricas"])
        p_epoch = cached.get("turno_inicio_epoch") or cached.get("primeiro_ts_epoch")
        if p_epoch and res.get("turno_ativo") is not False:
            rodando_s = max(0.0, agora - p_epoch)
            res["rodando_ha_s"] = round(rodando_s, 1)
            res["rodando_ha"] = _formatar_duracao(rodando_s)
        return res

    modelo = None
    esforco = None
    ferramentas_usadas = 0
    tokens_input = 0
    tokens_output = 0
    tokens_cache = 0
    primeiro_ts_epoch = None
    turno_inicio_epoch = None
    turno_ativo = None
    etapa_codex = None
    msgs_vistas: set[str] = set()
    tools_vistos: set[str] = set()
    ferramentas_abertas: dict[str, str] = {}

    try:
        with caminho.open("r", encoding="utf-8", errors="replace") as fh:
            for linha in fh:
                linha = linha.strip()
                if not linha:
                    continue
                try:
                    reg = json.loads(linha)
                except json.JSONDecodeError:
                    continue
                if not isinstance(reg, dict):
                    continue

                pedido = _primeira_linha_pedido_codex(reg)
                if pedido:
                    etapa_codex = pedido

                ts_raw = reg.get("timestamp") or reg.get("created_at") or reg.get("time")
                ts_ep = _ts_para_epoch(ts_raw)
                if ts_ep:
                    if primeiro_ts_epoch is None:
                        primeiro_ts_epoch = ts_ep

                # A sessão pode trocar o esforço ao ser retomada. Assim como o
                # modelo, o último valor explícito do transcript é o vigente.
                e = _extrair_esforco_registro(reg)
                if e:
                    esforco = e

                msg = reg.get("message")
                if isinstance(msg, dict):
                    if not modelo and isinstance(msg.get("model"), str):
                        modelo = msg["model"].strip()
                    conteudo = msg.get("content")
                    if isinstance(conteudo, list):
                        for bloco in conteudo:
                            if isinstance(bloco, dict) and bloco.get("type") == "tool_use":
                                tool_id = bloco.get("id")
                                if tool_id:
                                    if tool_id not in tools_vistos:
                                        tools_vistos.add(tool_id)
                                        ferramentas_usadas += 1
                                else:
                                    ferramentas_usadas += 1
                    msg_id = msg.get("id")
                    usage = msg.get("usage")
                    if isinstance(usage, dict):
                        if msg_id:
                            if msg_id not in msgs_vistas:
                                msgs_vistas.add(msg_id)
                                tokens_input += int(usage.get("input_tokens") or 0)
                                tokens_output += int(usage.get("output_tokens") or 0)
                                tokens_cache += int(usage.get("cache_read_input_tokens") or 0)
                                tokens_cache += int(usage.get("cache_creation_input_tokens") or 0)
                        else:
                            tokens_input += int(usage.get("input_tokens") or 0)
                            tokens_output += int(usage.get("output_tokens") or 0)
                            tokens_cache += int(usage.get("cache_read_input_tokens") or 0)
                            tokens_cache += int(usage.get("cache_creation_input_tokens") or 0)

                tipo = reg.get("type")
                payload = reg.get("payload") if isinstance(reg.get("payload"), dict) else {}

                if tipo == "event_msg":
                    if payload.get("type") == "task_started":
                        turno_ativo = True
                        turno_inicio_epoch = ts_ep
                        ferramentas_abertas.clear()
                    elif payload.get("type") in ("task_complete", "turn_aborted"):
                        turno_ativo = False
                        ferramentas_abertas.clear()

                if tipo == "turn_context" and isinstance(payload.get("model"), str):
                    # O turn_context registra o motor efetivamente usado. Em uma
                    # sessão retomada ele pode mudar, então o último vence.
                    modelo = payload["model"].strip()
                elif not modelo:
                    if tipo == "session_meta":
                        prov = payload.get("provenance")
                        if isinstance(prov, dict) and isinstance(prov.get("model"), str):
                            modelo = prov["model"].strip()
                        elif isinstance(payload.get("model"), str):
                            modelo = payload["model"].strip()

                if tipo == "token_usage_record":
                    u = payload.get("usage") or payload.get("turn_token_usage") or payload.get("thread_token_usage")
                    if isinstance(u, dict):
                        tokens_input += int(u.get("input_tokens") or 0)
                        tokens_output += int(u.get("output_tokens") or 0)
                        tokens_cache += int(u.get("cached_input_tokens") or 0)

                if tipo in ("response_item", "event_msg"):
                    p_tipo = payload.get("type")
                    if p_tipo in ("function_call", "custom_tool_call", "tool_call", "execute_command"):
                        ferramentas_usadas += 1
                        chamada = payload.get("call_id") or payload.get("id")
                        nome_ferramenta = payload.get("name") or payload.get("tool_name") or p_tipo
                        if isinstance(chamada, str) and isinstance(nome_ferramenta, str):
                            ferramentas_abertas[chamada] = nome_ferramenta
                    elif p_tipo in ("function_call_output", "custom_tool_call_output", "tool_result"):
                        chamada = payload.get("call_id") or payload.get("tool_use_id") or payload.get("id")
                        if isinstance(chamada, str):
                            ferramentas_abertas.pop(chamada, None)
                    p_content = payload.get("content")
                    if isinstance(p_content, list):
                        for b in p_content:
                            if isinstance(b, dict) and b.get("type") in ("tool_use", "tool_call", "function_call"):
                                ferramentas_usadas += 1
    except OSError:
        pass

    tokens_total = tokens_input + tokens_output + tokens_cache
    rodando_s = (max(0.0, agora - (turno_inicio_epoch or primeiro_ts_epoch))
                 if turno_ativo is not False and (turno_inicio_epoch or primeiro_ts_epoch)
                 else None)

    metricas = {
        "modelo": modelo,
        "modelo_legivel": _formatar_modelo(modelo),
        "esforco": _formatar_esforco(esforco),
        "ferramentas_usadas": ferramentas_usadas,
        "ferramenta_atual": next(reversed(ferramentas_abertas.values()), None),
        "tokens_total": tokens_total if tokens_total > 0 else None,
        "tokens_formatado": _formatar_tokens(tokens_total) if tokens_total > 0 else None,
        "rodando_ha_s": round(rodando_s, 1) if rodando_s is not None else None,
        "rodando_ha": _formatar_duracao(rodando_s),
        "etapa_codex": etapa_codex,
        "turno_ativo": turno_ativo,
    }

    _CACHE_METRICAS[chave] = {
        "versao": _CACHE_METRICAS_VERSAO,
        "mtime": st.st_mtime,
        "size": st.st_size,
        "primeiro_ts_epoch": primeiro_ts_epoch,
        "turno_inicio_epoch": turno_inicio_epoch,
        "metricas": metricas,
    }
    _salvar_cache_disco(_CACHE_METRICAS)

    return metricas


def _identidade_codex(caminho: Path) -> dict:
    """Lê somente o session_meta inicial, sem expor prompt ou caminhos.

    O nome da tarefa usa apenas o último componente de agent_path, que é um
    rótulo operacional curto. Nunca devolvemos o caminho bruto.
    """
    resultado = {"identidade": IDENTIDADE_CODEX_GENERICA, "papel": "Execução técnica (Codex)",
                 "tarefa": None, "pai": None, "profundidade": None}
    try:
        with caminho.open("rb") as arquivo:
            linha = arquivo.readline(128 * 1024)
        meta = json.loads(linha.decode("utf-8", "replace"))
        payload = meta.get("payload") if isinstance(meta, dict) else None
        if not isinstance(payload, dict):
            return resultado
        papel = _texto_curto(payload.get("agent_role"), 80)
        if papel in IDENTIDADES_CODEX:
            resultado["papel"] = papel
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
        source = payload.get("source") if isinstance(payload, dict) else None
        subagent = source.get("subagent") if isinstance(source, dict) else None
        spawn = subagent.get("thread_spawn") if isinstance(subagent, dict) else {}
        if isinstance(spawn, dict):
            pai = _texto_curto(spawn.get("parent_thread_id"), 80)
            resultado["pai"] = pai
            profundidade = spawn.get("depth")
            if isinstance(profundidade, int) and 0 <= profundidade <= 32:
                resultado["profundidade"] = profundidade
    except (OSError, UnicodeError, json.JSONDecodeError, AttributeError, TypeError, ValueError):
        pass
    return resultado


def _transcript_pai(dir_sessao: Path) -> Path:
    return dir_sessao.parent / f"{dir_sessao.name}.jsonl"


def _transcript_raiz_mais_recente(dir_projeto: Path) -> Path | None:
    try:
        candidatos = [p for p in dir_projeto.glob("*.jsonl") if p.is_file()]
    except OSError:
        return None
    if not candidatos:
        return None
    return max(candidatos, key=lambda p: p.stat().st_mtime)


def _sessoes_do_projeto(dir_projeto: Path) -> list[Path]:
    """Sessões com alguma evidência: pasta subagents/ ou transcript pai."""
    sessoes: dict[str, Path] = {}
    for item in dir_projeto.iterdir():
        if item.is_dir() and (item / "subagents").is_dir():
            sessoes[item.name] = item
        elif item.is_file() and item.suffix == ".jsonl":
            sessoes.setdefault(item.stem, dir_projeto / item.stem)
    return list(sessoes.values())


def _ultima_evidencia_sessao(dir_sessao: Path) -> float:
    evidencias: list[float] = []
    transcript_pai = _transcript_pai(dir_sessao)
    try:
        if transcript_pai.is_file():
            evidencias.append(transcript_pai.stat().st_mtime)
    except OSError:
        pass

    pasta = dir_sessao / "subagents"
    try:
        if pasta.is_dir():
            arquivos = [p for p in pasta.iterdir() if p.is_file()]
            evidencias.extend(p.stat().st_mtime for p in arquivos)
    except OSError:
        pass
    return max(evidencias, default=0.0)


def _sessao_mais_ativa(dir_projeto: Path) -> Path | None:
    """Escolhe pela última evidência da sessão, incluindo o transcript pai."""
    candidatas = _sessoes_do_projeto(dir_projeto)
    if not candidatas:
        return None
    return max(candidatas, key=_ultima_evidencia_sessao)


def _sessoes_ativas(dir_projeto: Path, agora: float) -> list[Path]:
    """Retorna todas as sessões com subagentes ativas dentro da janela de candidatos.
    Se nenhuma estiver na janela, retorna a mais ativa para preservação de histórico."""
    try:
        candidatas = _sessoes_do_projeto(dir_projeto)
    except OSError:
        return []
    if not candidatas:
        return []

    com_mtime = [(d, _ultima_evidencia_sessao(d)) for d in candidatas]
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
    home = AGENT_HOME
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
                    coletar_avisos: list[str] | None = None,
                    processos_vivos: int = 0) -> list[dict]:
    """Sessões Codex recentes, incluindo pastas normais e de workers.
    Nunca silencia erro de leitura em pasta existente."""
    pastas = _pastas_codex_do_dono(dono, raiz_explicita=raiz_codex)
    candidatos = []
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
            if silencio <= JANELA_CANDIDATO_S:
                candidatos.append((caminho, silencio))

    candidatos.sort(key=lambda par: par[1])
    garantidos_por_processo = {caminho for caminho, _ in candidatos[:max(0, processos_vivos)]}
    encontrados = [
        (caminho, silencio)
        for caminho, silencio in candidatos
        if silencio <= JANELA_CODEX_S or caminho in garantidos_por_processo
    ]
    agentes = []
    for caminho, silencio in encontrados[:32]:
        identidade = _identidade_codex(caminho)
        metricas = _extrair_metricas_transcript(caminho, agora)
        quem_mandou = identidade.get("pai") or identidade.get("tarefa")
        confirmado_por_processo = caminho in garantidos_por_processo
        if metricas.get("turno_ativo") is False:
            estado_codex = PARADO
        else:
            estado_codex = TRABALHANDO if silencio <= LIMIAR_ATIVO_S or confirmado_por_processo else SILENCIOSO
        status_codex = {TRABALHANDO: "executando", SILENCIOSO: "ocioso", PARADO: "encerrado"}[estado_codex]
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
            "estado": estado_codex,
            "fase": "atividade_codex",
            "etapa": metricas.get("etapa_codex") or "atividade Codex detectada",
            "etapa_e_description": False,
            "ferramenta": metricas.get("ferramenta_atual"),
            "silencio_s": round(silencio, 1),
            "ultima_atividade": _hora_br(agora - silencio),
            "inicio": None,
            "transcript_bytes": caminho.stat().st_size,
            "problema": None,
            "modelo": metricas.get("modelo"),
            "modelo_legivel": metricas.get("modelo_legivel"),
            "esforco": metricas.get("esforco"),
            "ferramentas_usadas": metricas.get("ferramentas_usadas", 0),
            "tokens_total": metricas.get("tokens_total"),
            "tokens_formatado": metricas.get("tokens_formatado"),
            "rodando_ha_s": metricas.get("rodando_ha_s"),
            "rodando_ha": metricas.get("rodando_ha"),
            "quem_mandou": quem_mandou,
            "status": status_codex,
        })
    return agentes


def _jobs_ponte_codex(dono: str | None, agora: float,
                      banco: Path | None = None) -> tuple[list[dict], list[str]]:
    """Read independent bridge jobs, whose lifetime is not a rollout's mtime."""
    if dono not in PROJETOS_DA_CASA:
        return [], []
    banco = banco or AGENT_HOME / f".codex-{dono}" / "inbox.sqlite3"
    if not banco.is_file():
        return [], []
    try:
        con = sqlite3.connect(f"file:{banco}?mode=ro", uri=True, timeout=1)
        try:
            rows = con.execute('''
                SELECT id,name,status,created,updated,model,effort
                  FROM background_jobs
                 WHERE status IN ('queued','running','reviewing','ready','delivery_failed')
                 ORDER BY created DESC LIMIT 32
            ''').fetchall()
        finally:
            con.close()
    except (sqlite3.Error, OSError) as exc:
        return [], [f"{dono}: não foi possível ler jobs da ponte ({type(exc).__name__})"]

    phase = {
        'queued': ('na fila', SILENCIOSO),
        'running': ('executando', TRABALHANDO),
        'reviewing': ('em revisão', TRABALHANDO),
        'ready': ('pronto para entrega', SILENCIOSO),
        'delivery_failed': ('entrega pendente', SILENCIOSO),
    }
    jobs = []
    for job_id, name, status, created, updated, model, effort in rows:
        stage, state = phase[status]
        task = _texto_curto(name, 90) or 'tarefa sem nome'
        age = max(0.0, agora - updated)
        running = max(0.0, agora - created)
        jobs.append({
            'id': f'bridge-job-{job_id}', 'tipo': 'codex', 'motor': 'codex',
            'dono': dono, 'identidade': IDENTIDADE_CODEX_GENERICA,
            'papel': 'Execução em segundo plano (Codex)',
            'tarefa': task, 'descricao': task, 'pai': None, 'profundidade': 0,
            'estado': state, 'fase': 'job_ponte', 'etapa': f'{stage}: {task}',
            'etapa_e_description': False, 'ferramenta': None,
            'silencio_s': round(age, 1), 'ultima_atividade': _hora_br(updated),
            'inicio': _hora_br(created), 'transcript_bytes': None,
            'problema': None, 'modelo': model,
            'modelo_legivel': _formatar_modelo(model),
            'esforco': _formatar_esforco(effort),
            'ferramentas_usadas': 0, 'tokens_total': None,
            'tokens_formatado': None, 'rodando_ha_s': round(running, 1),
            'rodando_ha': _formatar_duracao(running), 'quem_mandou': dono,
            'status': stage,
        })
    return jobs, []


def _agentes_agent_pendentes_do_pai(dir_sessao: Path, dono: str | None, agora: float) -> list[dict]:
    """Chamadas `Agent` pendentes no transcript pai.

    Claude Code nem sempre atualiza os arquivos em subagents/ enquanto a sessão
    pai segue ativa. A presença viva então está no tool_use sem tool_result.
    """
    transcript = _transcript_pai(dir_sessao)
    try:
        st = transcript.stat()
    except OSError:
        return []

    silencio = max(0.0, agora - st.st_mtime)
    if silencio > LIMIAR_VIVO_S:
        return []

    try:
        linhas = _ler_cauda(transcript, CAUDA_PAI_BYTES)
    except OSError:
        return []

    usos: dict[str, dict] = {}
    resultados: set[str] = set()
    for linha in linhas:
        try:
            reg = json.loads(linha)
        except json.JSONDecodeError:
            continue
        if not isinstance(reg, dict):
            continue
        ts_raw = reg.get("timestamp")
        msg = reg.get("message") if isinstance(reg.get("message"), dict) else {}
        conteudo = msg.get("content") if isinstance(msg, dict) else None
        if not isinstance(conteudo, list):
            continue
        for bloco in conteudo:
            if not isinstance(bloco, dict):
                continue
            tipo = bloco.get("type")
            if tipo == "tool_result":
                tool_use_id = bloco.get("tool_use_id")
                if isinstance(tool_use_id, str):
                    resultados.add(tool_use_id)
                continue
            if tipo != "tool_use" or bloco.get("name") != "Agent":
                continue
            tool_id = bloco.get("id")
            if not isinstance(tool_id, str) or not tool_id:
                continue
            entrada = bloco.get("input") if isinstance(bloco.get("input"), dict) else {}
            desc = _texto_curto(entrada.get("description"), 160)
            sub_tipo = _texto_curto(entrada.get("subagent_type"), 80)
            modelo = _texto_curto(entrada.get("model"), 80)
            usos[tool_id] = {
                "id": tool_id,
                "descricao": desc,
                "tipo": sub_tipo or "agent",
                "modelo": modelo,
                "ts_epoch": _ts_para_epoch(ts_raw),
            }

    agentes = []
    for tool_id, uso in usos.items():
        if tool_id in resultados:
            continue
        idade = max(0.0, agora - uso["ts_epoch"]) if uso.get("ts_epoch") else silencio
        estado = TRABALHANDO if idade <= LIMIAR_ATIVO_S else SILENCIOSO
        item = {
            "id": f"agent-tool-{tool_id[-8:]}",
            "tipo": uso["tipo"],
            "motor": "claude",
            "dono": dono,
            "identidade": None,
            "papel": uso["tipo"],
            "tarefa": None,
            "descricao": uso["descricao"],
            "pai": f"sessao-{dir_sessao.name[-8:]}",
            "profundidade": 1,
            "estado": estado,
            "fase": "executando_subagente",
            "etapa": uso["descricao"] or "Agent",
            "etapa_e_description": bool(uso["descricao"]),
            "ferramenta": "Agent",
            "silencio_s": round(idade, 1),
            "ultima_atividade": _hora_br(agora - idade),
            "inicio": _hora_br(uso["ts_epoch"]) if uso.get("ts_epoch") else None,
            "transcript_bytes": st.st_size,
            "problema": None,
            "modelo": uso["modelo"],
            "modelo_legivel": _formatar_modelo(uso["modelo"]),
            "esforco": None,
            "ferramentas_usadas": None,
            "tokens_total": None,
            "tokens_formatado": None,
            "rodando_ha_s": round(idade, 1),
            "rodando_ha": _formatar_duracao(idade),
            "quem_mandou": f"sessao-{dir_sessao.name[-8:]}",
            "status": "executando" if estado == TRABALHANDO else "ocioso",
        }
        agentes.append(item)
    return agentes


def _agente_sessao_pai(dir_sessao: Path, dono: str | None, agora: float,
                       processo_vivo: bool, agentes_coordenados: int = 0) -> dict | None:
    """Presença da sessão Claude Code raiz confirmada por processo vivo."""
    if not processo_vivo:
        return None
    transcript = _transcript_pai(dir_sessao)
    try:
        st = transcript.stat()
    except OSError:
        return None

    silencio = max(0.0, agora - st.st_mtime)

    try:
        cauda = _analisar_cauda(transcript, CAUDA_PAI_BYTES)
    except OSError:
        return None

    estado = _classificar(cauda["fase"], silencio)
    if silencio <= LIMIAR_SESSAO_COORDENADORA_ATIVA_S or agentes_coordenados > 0:
        estado = TRABALHANDO
    elif estado == PARADO:
        estado = SILENCIOSO

    item = {
        "id": f"sessao-{dir_sessao.name[-8:]}",
        "tipo": "sessao_claude",
        "motor": "claude",
        "dono": dono,
        "identidade": "sessao-claude",
        "papel": "sessão Claude Code",
        "tarefa": None,
        "descricao": "sessão Claude Code ativa",
        "pai": None,
        "profundidade": 0,
        "estado": estado,
        "fase": "coordenando_agentes" if agentes_coordenados > 0 else cauda["fase"],
        "etapa": (
            f"coordenando {agentes_coordenados} agente{'s' if agentes_coordenados != 1 else ''}"
            if agentes_coordenados > 0 else cauda["etapa"]
        ),
        "etapa_e_description": False if agentes_coordenados > 0 else cauda["etapa_e_description"],
        "ferramenta": cauda["ferramenta"],
        "silencio_s": round(silencio, 1),
        "ultima_atividade": _hora_br(st.st_mtime),
        "inicio": None,
        "transcript_bytes": st.st_size,
        "problema": cauda.get("problema_api"),
        "modelo": cauda.get("modelo"),
        "modelo_legivel": cauda.get("modelo_legivel"),
        "esforco": cauda.get("esforco"),
        "ferramentas_usadas": None,
        "tokens_total": None,
        "tokens_formatado": None,
        "rodando_ha_s": None,
        "rodando_ha": None,
        "quem_mandou": None,
        "status": "executando" if estado == TRABALHANDO else "ocioso",
    }
    return item


def _finalizar_item_claude(item: dict, metricas: dict | None, agora: float) -> None:
    if metricas:
        if metricas.get("rodando_ha") is None and item.get("inicio_epoch"):
            dur_s = max(0.0, agora - item["inicio_epoch"])
            metricas["rodando_ha_s"] = round(dur_s, 1)
            metricas["rodando_ha"] = _formatar_duracao(dur_s)
        item.update({
            "modelo": metricas.get("modelo"),
            "modelo_legivel": metricas.get("modelo_legivel"),
            "esforco": metricas.get("esforco"),
            "ferramentas_usadas": metricas.get("ferramentas_usadas", 0),
            "tokens_total": metricas.get("tokens_total"),
            "tokens_formatado": metricas.get("tokens_formatado"),
            "rodando_ha_s": metricas.get("rodando_ha_s"),
            "rodando_ha": metricas.get("rodando_ha"),
        })
    item["quem_mandou"] = item.get("pai") or item.get("descricao")
    if item.get("problema"):
        item["status"] = f"erro ({item['problema']})" if len(item["problema"]) <= 40 else "erro"
    elif item.get("estado") == TRABALHANDO:
        item["status"] = "executando"
    elif item.get("estado") == SILENCIOSO:
        item["status"] = "ocioso"
    elif item.get("estado") == PARADO:
        item["status"] = "encerrado"
    else:
        item["status"] = "desconhecido"
    item.pop("inicio_epoch", None)


def ler_agentes(projeto: str = PROJETO_PADRAO, raiz: Path | None = None,
                sessao: str | None = None, dono: str | None = None,
                raiz_codex: object = _CODEX_PADRAO,
                processos_claude: object = _PROC_PADRAO,
                processos_codex: object = _PROC_CODEX_PADRAO,
                workers_codex: object = _PROC_WORKERS_CODEX_PADRAO) -> dict:
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
        "limiares_s": {"ativo": LIMIAR_ATIVO_S, "vivo": LIMIAR_VIVO_S, "janela_candidato": JANELA_CANDIDATO_S},
        "contagem": {TRABALHANDO: None, SILENCIOSO: None, PARADO: None, "vivos": None, "total": None, "historico": None},
        "agentes": [],
        "avisos": [],
    }

    def fechar(**campos) -> dict:
        base.update(campos)
        base["custo_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        return base

    raiz_explicita = raiz is not None
    raiz = raiz or RAIZ_PROJETOS
    if raiz_explicita and raiz_codex is _CODEX_PADRAO:
        raiz_codex = []
    agentes: list[dict] = []
    avisos: list[str] = []
    claude_ok = False
    claude_motivo = None
    claude_erro = None
    processos_vivos, erro_processos = _resolver_processos_claude(processos_claude)
    codex_vivos, erro_processos_codex = _resolver_processos_codex(processos_codex)
    if raiz_explicita and workers_codex is _PROC_WORKERS_CODEX_PADRAO:
        workers_codex = None
    workers_vivos, erro_workers = _resolver_workers_codex_mecanico(workers_codex)
    if codex_vivos is None:
        avisos.append(f"{dono or projeto}: sessões Codex indeterminadas: {erro_processos_codex}")
    if workers_vivos is None:
        avisos.append(f"{dono or projeto}: workers Codex indeterminados: {erro_workers}")
    codex = _codex_recentes(
        agora,
        dono=dono,
        raiz_codex=raiz_codex,
        coletar_avisos=avisos,
        processos_vivos=(codex_vivos or {}).get(dono or "", 0),
    )
    jobs_ponte: list[dict] = []
    if not raiz_explicita:
        jobs_ponte, avisos_jobs = _jobs_ponte_codex(dono, agora)
        avisos.extend(avisos_jobs)
        nomes_jobs = {job["tarefa"] for job in jobs_ponte}
        if nomes_jobs:
            codex = [item for item in codex if not (
                item.get("pai") is None
                and any(str(item.get("etapa") or "").startswith(f"Tarefa: {nome}")
                        for nome in nomes_jobs)
            )]
    workers_do_dono = [worker for worker in (workers_vivos or []) if worker.get("dono") == dono]
    # O processo é a evidência mais precisa de um worker em voo. Quando o
    # rollout já escreveu exatamente o mesmo pedido, ele é o mesmo trabalho,
    # não uma segunda cadeira no escritório.
    def mesma_tarefa(item: dict, worker: dict) -> bool:
        a = " ".join(str(item.get("etapa") or item.get("tarefa") or "").split()).casefold()
        b = " ".join(str(worker.get("tarefa") or "").split()).casefold()
        return bool(a and b and a == b)

    if workers_do_dono:
        codex = [item for item in codex if not any(mesma_tarefa(item, worker) for worker in workers_do_dono)]

    try:
        dir_projeto = Path(raiz) / projeto
        if not dir_projeto.is_dir():
            claude_motivo = "projeto_inexistente"
            claude_erro = f"não existe a pasta do projeto: {_sanitizar_caminho(str(dir_projeto))}"
            base["caminho"] = _sanitizar_caminho(str(dir_projeto))
            avisos.append(claude_erro)
        else:
            transcript_raiz_vivo = _transcript_raiz_mais_recente(dir_projeto)
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
                    inicio_sessao = len(agentes)
                    pasta = dir_sessao / "subagents"

                    if pasta.is_dir():
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
                                "modelo": None, "modelo_legivel": None, "esforco": None,
                                "ferramentas_usadas": 0, "tokens_total": None, "tokens_formatado": None,
                                "rodando_ha_s": None, "rodando_ha": None,
                                "quem_mandou": None, "status": None,
                            }
                            try:
                                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                                if not isinstance(meta, dict):
                                    raise ValueError("meta.json não é um dicionário")
                                item["tipo"] = meta.get("agentType")
                                item["descricao"] = meta.get("description")
                                item["pai"] = meta.get("parentAgentId")
                                item["profundidade"] = meta.get("spawnDepth")
                                if item["profundidade"] == 1 and not item["pai"]:
                                    item["pai"] = f"sessao-{dir_sessao.name[-8:]}"
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
                                _finalizar_item_claude(item, None, agora)
                                agentes.append(item)
                                avisos.append(f"{ident}: registrado sem transcript")
                                continue
                            except OSError as e:
                                item["problema"] = f"transcript ilegível: {type(e).__name__}: {_sanitizar_caminho(str(e))}"
                                item["estado"] = None
                                item["etapa"] = "não foi possível ler"
                                _finalizar_item_claude(item, None, agora)
                                agentes.append(item)
                                avisos.append(f"{ident}: transcript ilegível")
                                continue

                            if silencio > JANELA_CANDIDATO_S:
                                item["estado"] = PARADO
                                item["fase"] = "fora_da_janela"
                                item["etapa"] = "fora da janela de leitura (histórico)"
                                _finalizar_item_claude(item, None, agora)
                                agentes.append(item)
                                continue

                            try:
                                cauda = _analisar_cauda(transcript)
                            except OSError as e:
                                item["problema"] = f"falha ao ler a cauda: {type(e).__name__}: {_sanitizar_caminho(str(e))}"
                                item["estado"] = None
                                item["etapa"] = "não foi possível ler"
                                _finalizar_item_claude(item, None, agora)
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
                            if item["estado"] != PARADO:
                                metricas = _extrair_metricas_transcript(transcript, agora)
                            else:
                                metricas = None
                            _finalizar_item_claude(item, metricas, agora)
                            agentes.append(item)

                    tem_vivo_sessao = any(a.get("estado") in (TRABALHANDO, SILENCIOSO) for a in agentes[inicio_sessao:])
                    if not tem_vivo_sessao:
                        agentes.extend(_agentes_agent_pendentes_do_pai(dir_sessao, dono, agora))
                    tem_vivo_sessao = any(a.get("estado") in (TRABALHANDO, SILENCIOSO) for a in agentes[inicio_sessao:])
                    transcript_pai = _transcript_pai(dir_sessao)
                    eh_raiz_mais_recente = (
                        transcript_raiz_vivo is not None
                        and transcript_pai == transcript_raiz_vivo
                    )
                    if eh_raiz_mais_recente and processos_vivos is None:
                        avisos.append(f"{dono or projeto}: sessão raiz indeterminada: {erro_processos}")
                    processo_vivo = bool(dono and processos_vivos is not None and dono in processos_vivos)
                    if eh_raiz_mais_recente:
                        agentes_coordenados = sum(
                            a.get("estado") in (TRABALHANDO, SILENCIOSO)
                            for a in agentes[inicio_sessao:]
                        ) + len(codex)
                        item_pai = _agente_sessao_pai(
                            dir_sessao, dono, agora, processo_vivo, agentes_coordenados,
                        )
                        if item_pai:
                            agentes.append(item_pai)
    except PermissionError as e:
        claude_motivo = "sem_permissao"
        claude_erro = f"sem permissão de leitura: {_sanitizar_caminho(str(e))}"
        avisos.append(claude_erro)
    except OSError as e:
        claude_motivo = "erro_leitura"
        claude_erro = f"{type(e).__name__}: {_sanitizar_caminho(str(e))}"
        avisos.append(claude_erro)

    # Leitura Codex sempre executada (não é cancelada por falha do Claude)
    if codex or jobs_ponte or workers_do_dono:
        base["sessao"] = base["sessao"] or "codex"
        pastas_dono = _pastas_codex_do_dono(dono, raiz_explicita=raiz_codex)
        base["caminho"] = base["caminho"] or (_sanitizar_caminho(str(pastas_dono[0])) if pastas_dono else "codex")
        agentes.extend(codex)
        agentes.extend(jobs_ponte)
        agentes.extend(workers_do_dono)

    # Se Claude funcionou OU se o Codex retornou agentes, a leitura é bem-sucedida
    sucesso = claude_ok or bool(codex) or bool(jobs_ponte) or bool(workers_do_dono)
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
                         codex: dict[str, Path] | None = None,
                         processos_claude: object = _PROC_PADRAO,
                         processos_codex: object = _PROC_CODEX_PADRAO,
                         workers_codex: object = _PROC_WORKERS_CODEX_PADRAO) -> dict:
    """Agrega ler_agentes() das três sessões da casa em um único retrato.

    Nunca deixa uma sessão que falhou apagar as que funcionaram: erro de
    uma entra em `avisos`, com o dono nomeado, e as outras continuam
    valendo. Cada agente ganha o campo `dono` (luana/renato/bia) — sem
    isso o front não tem como saber de quem é o boneco.

    Codex: cada dono lê só o próprio CODEX_HOME (`codex`). Com `projetos`
    explícito e sem `codex`, nenhuma sessão Codex entra (leitura isolada).
    """
    modo_casa_padrao = projetos is None and raiz is None
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
    processos = _resolver_processos_claude(processos_claude)
    processos_codex_resolvidos = _resolver_processos_codex(processos_codex)
    if not modo_casa_padrao and workers_codex is _PROC_WORKERS_CODEX_PADRAO:
        workers_codex = None
    workers_codex_resolvidos = _resolver_workers_codex_mecanico(workers_codex)

    for dono, projeto in projetos.items():
        try:
            r = ler_agentes(
                projeto=projeto,
                raiz=raiz,
                dono=dono,
                raiz_codex=codex.get(dono) if codex is not None else _CODEX_PADRAO,
                processos_claude=processos,
                processos_codex=processos_codex_resolvidos,
                workers_codex=workers_codex_resolvidos,
            )
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
    tarefas_diretores = {}
    if modo_casa_padrao:
        try:
            try:
                from servidor.tarefas_diretores import obter_tarefas_diretores
            except ModuleNotFoundError:
                from tarefas_diretores import obter_tarefas_diretores
            tarefas_diretores = obter_tarefas_diretores()
        except Exception as e:
            tarefas_diretores = {
                "luana": {"itens": [], "avisos": [f"falha ao ler tarefas: {type(e).__name__}"], "lido_em": None},
                "renato": {"itens": [], "avisos": [f"falha ao ler tarefas: {type(e).__name__}"], "lido_em": None},
            }
    agora = _agora()
    return {
        "ok": algum_ok,
        "motivo": "leitura_ok" if algum_ok else "todas_as_sessoes_falharam",
        "erro": None,
        "medido_em": _hora_br(agora),
        "medido_em_iso": datetime.fromtimestamp(agora, BRT).isoformat(),
        "custo_ms": round((time.perf_counter() - t0) * 1000, 1),
        "limiares_s": {"ativo": LIMIAR_ATIVO_S, "vivo": LIMIAR_VIVO_S, "janela_candidato": JANELA_CANDIDATO_S},
        "contagem": {**conta, "vivos": conta[TRABALHANDO] + conta[SILENCIOSO],
                     "total": len(agentes), "historico": historico_total,
                     "indeterminados": indeterminados_total},
        "agentes": agentes,
        "tarefas_diretores": tarefas_diretores,
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
