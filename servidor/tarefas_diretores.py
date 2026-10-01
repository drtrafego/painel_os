from __future__ import annotations

import os
import re
import threading
import time
import unicodedata
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

TTL_S = 20.0
MAX_ITENS = 30
MAX_BYTES = 1_000_000
BRT = ZoneInfo("America/Sao_Paulo")
DEPENDENCIA_GASTAO = "decisão do Gastão"

ARQUIVOS = {
    "luana": Path("/opt/gastaomatos/luana/working-memory.md"),
    "renato": Path("/opt/gastaomatos/renato/working-memory.md"),
}

_CACHE: dict[tuple, dict[str, object]] = {}
_CACHE_LOCK = threading.Lock()
_PRIORIDADE_ORDEM = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
_HOMOGLIFOS = str.maketrans({
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X",
    "а": "a", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "х": "x", "у": "y",
    "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Χ": "X",
    "Α": "A", "а": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ο": "o", "ρ": "p", "τ": "t", "χ": "x",
})

_FERRAMENTAS_ALLOWLIST = {
    "Painel OS", "Meta Ads", "Instagram", "LinkedIn", "Vercel", "Codex", "Claude", "Telegram",
    "WhatsApp", "Google Ads", "Google Drive", "GitHub", "Vite", "TypeScript", "Python",
    "OpenRouter", "Gemini", "Skyvern", "Composio", "Apify", "Brevo", "Hermes", "AutonomIA",
    "ChatGPT", "BotFather", "PixelOffice", "Nina", "Gabi", "Isabela", "Clara",
}
_NOMES_ALLOWLIST: set[str] | None = None


def _sanitizar_caminho_local(texto: str | None) -> str:
    try:
        from agentes_vivos import _sanitizar_caminho
    except Exception:
        try:
            from servidor.agentes_vivos import _sanitizar_caminho
        except Exception:
            _sanitizar_caminho = None
    if _sanitizar_caminho is not None:
        return _sanitizar_caminho(texto)
    if not texto:
        return ""
    limpo = re.sub(r"/(?:opt|home|root|etc|var|tmp|usr)/[^\s':]+", "[caminho]", str(texto))
    return re.sub(r"[a-zA-Z]:\\[^\s':]+", "[caminho]", limpo)


def _redigir_base(texto: str) -> str:
    return texto[:400]


def _truncar_palavra(texto: str, limite: int) -> str:
    if len(texto) <= limite:
        return texto
    corte = texto[: max(0, limite - 1)].rstrip()
    if " " in corte:
        corte = corte.rsplit(" ", 1)[0].rstrip()
    if not corte:
        corte = texto[: max(0, limite - 1)].rstrip()
    return f"{corte}…"


def _sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def _normalizar_char(char: str) -> str:
    normal = unicodedata.normalize("NFKC", char).translate(_HOMOGLIFOS)
    sem_acento = _sem_acento(normal)
    return (sem_acento[:1] or normal[:1] or char).casefold()


def _normalizar_mapeado(texto: str) -> str:
    return "".join(_normalizar_char(char) for char in texto)


def _normalizar(texto: str) -> str:
    sem_acento = _sem_acento(unicodedata.normalize("NFKC", texto).translate(_HOMOGLIFOS))
    return sem_acento.casefold()


def _aplicar_mascaras_mapeadas(texto: str, regras: list[tuple[str, str]], flags: int = 0) -> str:
    saida = texto
    for padrao, substituto in regras:
        normal = _normalizar_mapeado(saida)
        achados = list(re.finditer(padrao, normal, flags))
        for achado in reversed(achados):
            saida = saida[:achado.start()] + substituto + saida[achado.end():]
    return saida


def _termos_allowlist() -> set[str]:
    global _NOMES_ALLOWLIST
    if _NOMES_ALLOWLIST is not None:
        return _NOMES_ALLOWLIST
    termos = set(_FERRAMENTAS_ALLOWLIST)
    termos.update({"Luana", "Renato", "Bia", "Gastão", "Gastao"})
    candidatos = [
        Path(__file__).resolve().parents[1] / "web/src/dados/pixel-agents.ts",
        Path("/opt/gastaomatos/luana/painel_os/web/src/dados/pixel-agents.ts"),
    ]
    for caminho in candidatos:
        try:
            texto = caminho.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        termos.update(re.findall(r"nome:\s*'([^']+)'", texto))
        termos.update(re.findall(r"id:\s*'([^']+)'", texto))
        for bloco in re.findall(r"aliases:\s*\[([^\]]+)\]", texto):
            termos.update(re.findall(r"'([^']+)'", bloco))
        break
    normalizados: set[str] = set()
    for termo in termos:
        termo = termo.replace("-", " ").replace("_", " ").strip()
        if termo:
            normalizados.add(" ".join(_normalizar(termo).split()))
    _NOMES_ALLOWLIST = normalizados
    return normalizados


def _nomes_privados(caminho: Path | None = None) -> list[str]:
    if caminho is None:
        bruto = os.environ.get("TAREFAS_DIRETORES_PRIVACIDADE")
        caminho = Path(bruto) if bruto else Path("/opt/gastaomatos/luana/privacidade_nomes_cliente.txt")
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    nomes = []
    for linha in texto.splitlines():
        linha = linha.split("#", 1)[0].strip()
        if not linha:
            continue
        nome = linha.split(":", 1)[0].strip()
        if nome:
            nomes.append(nome)
    return nomes


def _mascarar_nomes_privados(texto: str) -> str:
    saida = texto
    for nome in _nomes_privados():
        partes = [re.escape(p) for p in re.split(r"[^a-z0-9]+", _normalizar(nome)) if p]
        if not partes:
            continue
        padrao = re.compile(r"(?<![a-z0-9])" + r"[^a-z0-9]{0,3}".join(partes) + r"(?![a-z0-9])")
        normal = _normalizar_mapeado(saida)
        achados = list(padrao.finditer(normal))
        for achado in reversed(achados):
            saida = saida[:achado.start()] + "[privado]" + saida[achado.end():]
    return saida


def _mascarar_telefones(texto: str) -> str:
    padroes = [
        r"(?<![\w.])(?:\+?55[\s().-]*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]?\d{4}(?![\w.])",
        r"(?<![\w.])(?:0\d{2})?9?\d{8}(?![\w.])",
    ]
    saida = texto
    for padrao in padroes:
        saida = re.sub(padrao, "[número]", saida)
    return saida


def sanitizar_texto_publico(texto: str | None, limite: int) -> str:
    if not isinstance(texto, str):
        return ""
    texto = _redigir_base(texto)
    limpo = " ".join(unicodedata.normalize("NFKC", texto).split())
    if not limpo:
        return ""
    limpo = _sanitizar_caminho_local(limpo)
    limpo = _aplicar_mascaras_mapeadas(limpo, [
        (r"\bgh(?:p|o|u|s|r)_[a-z0-9_]{12,}\b", "[segredo]"),
        (r"\bgithub_pat_[a-z0-9_]{20,}\b", "[segredo]"),
        (r"\bsk-[a-z0-9_-]{8,}\b", "[segredo]"),
        (r"\bsk\s+-\s*[a-z0-9_-]{8,}\b", "[segredo]"),
        (r"\bsk-[a-z0-9_-]{3,}(?:[\s-]+[0-9][a-z0-9_-]{2,}){1,4}\b", "[segredo]"),
        (r"\bakia[0-9a-z]{16}\b", "[segredo]"),
        (r"\bbearer\s+[a-z0-9._~+/=-]{8,}", "Bearer [segredo]"),
        (r"\b[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b", "[segredo]"),
        (r"(?<![a-z0-9])(?:token|key|apikey|senha|password|secret)=([^&\s]+)", "[segredo]"),
        (r"([?&])(?:token|key|apikey|senha|password|secret)=([^&\s]+)", "[segredo]"),
        (r"(?<![a-f0-9])[a-f0-9]{32,64}(?![a-f0-9])", "[segredo]"),
        (r"(?<!\d)\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}(?!\d)", "[documento]"),
        (r"(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)", "[documento]"),
    ])
    limpo = re.sub(
        r"(?i)(?<!\S)\S*[\\/]\S*(?:credencial|credential|secret|token|senha|password|\.env)\S*",
        "[caminho]",
        limpo,
    )
    limpo = re.sub(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", "[e-mail]", limpo)
    limpo = re.sub(
        r"(?i)\b[A-Z0-9._%+-]+\s*(?:arroba|\[at\])\s*[A-Z0-9.-]+\s*(?:ponto|\[dot\])\s*[A-Z]{2,}\b",
        "[e-mail]",
        limpo,
    )
    limpo = re.sub(r"(?i)(?<![\w:])(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}(?:/\d{1,3})?(?![\w:])", "[número]", limpo)
    limpo = re.sub(r"(?i)(?<![\w:])(?=[0-9a-f:]*::)[0-9a-f:]{3,39}(?:/\d{1,3})?(?![\w:])", "[número]", limpo)
    limpo = re.sub(r"\b(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:/\d{1,2})?\b", "[número]", limpo)
    limpo = re.sub(r"\b169\.254\.\d{1,3}\.\d{1,3}(?:/\d{1,2})?\b", "[número]", limpo)
    limpo = re.sub(r"\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(?:/\d{1,2})?\b", "[número]", limpo)
    limpo = re.sub(r"\b192\.168\.\d{1,3}\.\d{1,3}(?:/\d{1,2})?\b", "[número]", limpo)
    limpo = _mascarar_telefones(limpo)
    numero_palavra = r"(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte)"
    limpo = re.sub(rf"(?i)\b{numero_palavra}(?:\s+{numero_palavra}){{7,}}\b", "[número]", limpo)
    limpo = re.sub(r"(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/=_-]{24,}(?![A-Za-z0-9+/=_-])", "[segredo]", limpo)
    limpo = _mascarar_nomes_privados(limpo)
    limpo = " ".join(limpo.split()).strip(" .:-")
    return limpo[:limite].strip(" .:-")


def _somente_mascara(texto: str) -> bool:
    resto = re.sub(r"\[(?:privado|cliente|segredo|redigido|e-mail|número|documento|num:[^\]]+|caminho)\]", "", texto)
    resto = re.sub(r"(?i)\bBearer\b", "", resto)
    return not resto.strip(" .,:;/-_()")


def _mascarar_nomes_proprios(texto: str) -> str:
    return texto


def _blocos_prioridade(texto: str) -> list[str]:
    blocos = []
    padrao = re.compile(r"(?ms)^##\s+Prioridade agora\s*(.*?)(?=^##\s+|\Z)")
    for achado in padrao.finditer(texto):
        blocos.append(achado.group(1))
    return blocos


def _validar_caminho(dono: str, caminho: Path, permitir_caminho_teste: bool) -> tuple[Path | None, str | None]:
    if dono not in ARQUIVOS:
        return None, "dono de working-memory inválido"
    try:
        real = caminho.resolve(strict=True)
    except FileNotFoundError:
        return None, "working-memory ausente"
    except PermissionError:
        return None, "sem permissão para ler working-memory"
    except OSError as exc:
        return None, f"falha ao resolver working-memory: {type(exc).__name__}"
    if permitir_caminho_teste:
        return real, None
    try:
        permitido = ARQUIVOS[dono].resolve(strict=False)
    except OSError:
        permitido = ARQUIVOS[dono].absolute()
    if real != permitido:
        return None, "caminho de working-memory recusado"
    return real, None


def _ler_prioridade_streaming(caminho: Path) -> tuple[str | None, list[str]]:
    avisos: list[str] = []
    try:
        tamanho = caminho.stat().st_size
    except PermissionError:
        return None, ["sem permissão para ler working-memory"]
    except FileNotFoundError:
        return None, ["working-memory ausente"]
    except OSError as exc:
        return None, [f"falha ao medir working-memory: {type(exc).__name__}"]
    if tamanho > MAX_BYTES:
        return None, ["working-memory acima de 1 MB recusado"]
    if tamanho == 0:
        return "", []
    linhas: list[str] = []
    dentro = False
    try:
        with caminho.open("r", encoding="utf-8", errors="replace") as arquivo:
            for linha in arquivo:
                if re.match(r"^##\s+Prioridade agora\s*$", linha):
                    if dentro:
                        avisos.append("mais de um bloco Prioridade agora, primeiro bloco usado")
                        break
                    dentro = True
                    continue
                if dentro and re.match(r"^##\s+", linha):
                    break
                if dentro:
                    linhas.append(linha)
    except PermissionError:
        return None, ["sem permissão para ler working-memory"]
    except OSError as exc:
        return None, [f"falha ao ler working-memory: {type(exc).__name__}"]
    if not dentro:
        return None, ["bloco Prioridade agora ausente ou mal formado"]
    return "".join(linhas), avisos


def _separar_itens(blocos: list[str]) -> list[str]:
    itens = []
    atual: list[str] = []
    inicio = re.compile(r"^(?:\d+\.\s+|-+\s+|\*\s+)")
    for linha in "\n".join(blocos).splitlines():
        if inicio.match(linha):
            if atual:
                itens.append("\n".join(atual))
            atual = [linha]
        elif atual and (linha.startswith((" ", "\t")) or not linha.strip()):
            atual.append(linha)
        elif atual:
            itens.append("\n".join(atual))
            atual = []
    if atual:
        itens.append("\n".join(atual))
    return itens


def _texto_apos_proximo_passo(texto: str) -> str | None:
    achado = re.search(
        r"pr[oó]ximo passo(?: verific[aá]vel)?\s*(?:\([^)]+\))?\s*(?:é|:)?\s*(.*?)(?:\s+prova(?:/fonte)?\s*:|$)",
        " ".join(texto.split()),
        re.I,
    )
    if not achado:
        return None
    return achado.group(1).strip(" .:-") or None


def _estado_tarefa(texto: str) -> str:
    normal = _normalizar(texto)
    proximo = _texto_apos_proximo_passo(texto)
    if proximo:
        if any(p in normal for p in ("aguarda", "aguardando o gastao", "depende dele", "bloqueado por")):
            return "bloqueada"
        return "ativa"
    primeira_linha = _normalizar(texto.splitlines()[0] if texto.splitlines() else texto)
    if any(p in primeira_linha for p in ("concluido", "concluida", "encerrado", "encerrada", "fechado", "fechada")):
        return "concluida"
    if any(p in normal for p in ("aguarda", "aguardando o gastao", "depende dele", "bloqueado por")):
        return "bloqueada"
    return "ativa"


def _extrair_data(texto: str) -> str | None:
    achado = re.search(r"\bdata\s*:?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)\b", texto, re.I)
    if not achado:
        achado = re.search(r"\b(\d{4}-\d{2}-\d{2}|\d{2}/\d{2}(?:/\d{4})?)\b", texto)
    if not achado:
        return None
    valor = achado.group(1)
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", valor)
    if iso:
        return sanitizar_texto_publico(f"{iso.group(3)}/{iso.group(2)}", 5) or None
    barra = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/\d{2,4})?", valor)
    if barra:
        return sanitizar_texto_publico(f"{int(barra.group(1)):02d}/{int(barra.group(2)):02d}", 5) or None
    return None


def _extrair_proximo_passo(texto: str) -> str | None:
    proximo = _texto_apos_proximo_passo(texto)
    if proximo:
        return sanitizar_texto_publico(proximo, 120) or None
    return None


def _titulo_curto_publico(texto: str, limite: int) -> str | None:
    titulo = _truncar_palavra(_mascarar_nomes_proprios(sanitizar_texto_publico(texto, 400)), limite)
    if not titulo or _somente_mascara(titulo):
        return None
    return titulo


def _extrair_titulo(texto: str) -> str:
    plano = re.sub(r"^[\s\d.*•·-]+", "", texto)
    plano = re.sub(r"[*_`]", "", plano)
    plano = " ".join(plano.split())
    plano = re.sub(r"^(?:[\W_]|[🔴🟡🟢✅⚠️‼️❗❕🚨])+","", plano).strip()
    plano = re.sub(r"^P[0-3Xx?]\s*,?\s*", "", plano, flags=re.I)
    plano = re.sub(r"^(?:[\W_]|[🔴🟡🟢✅⚠️‼️❗❕🚨])+","", plano).strip()
    for marcador in (", responsável", ", responsavel", ", desde", ":"):
        pos = _normalizar(plano).find(_normalizar(marcador))
        if pos > 0:
            return plano[:pos]
    return plano


def _limpar_titulo_subtarefa(texto: str) -> str:
    texto = re.sub(r"^\s*(?:[-*]\s+|\d+\.\s+|\(\d+\)\s*)", "", texto)
    texto = re.sub(r"[*_`]", "", texto)
    return " ".join(texto.split()).strip(" .:-")


def _subtarefas_de_lista(bruto: str, estado: str) -> list[dict[str, object]]:
    subtarefas: list[dict[str, object]] = []
    for linha in bruto.splitlines()[1:]:
        if not re.match(r"^[ \t]+(?:-\s+|\d+\.\s+)", linha):
            continue
        titulo = _titulo_curto_publico(_limpar_titulo_subtarefa(linha), 70)
        if not titulo:
            continue
        subtarefas.append({"titulo": titulo, "ordem": len(subtarefas) + 1, "estado": estado})
        if len(subtarefas) >= 6:
            break
    return subtarefas


def _subtarefas_de_proximo_passo(bruto: str, estado: str) -> list[dict[str, object]]:
    proximo = _texto_apos_proximo_passo(bruto)
    if not proximo:
        return []
    achados = list(re.finditer(r"\((\d+)\)\s*", proximo))
    if len(achados) < 2:
        return []
    subtarefas: list[dict[str, object]] = []
    for pos, achado in enumerate(achados[:6]):
        inicio = achado.end()
        fim = achados[pos + 1].start() if pos + 1 < len(achados) else len(proximo)
        titulo = _titulo_curto_publico(_limpar_titulo_subtarefa(proximo[inicio:fim]), 70)
        if not titulo:
            continue
        subtarefas.append({"titulo": titulo, "ordem": len(subtarefas) + 1, "estado": estado})
    return subtarefas


def _extrair_subtarefas(bruto: str, estado: str) -> list[dict[str, object]]:
    por_lista = _subtarefas_de_lista(bruto, estado)
    if por_lista:
        return por_lista
    return _subtarefas_de_proximo_passo(bruto, estado)


def _responsavel_do_dono(dono: str) -> str:
    return "Renato" if dono == "renato" else "Luana"


def _extrair_dependencia(texto: str) -> str | None:
    plano = " ".join(texto.split())
    normal = _normalizar(plano)
    if re.search(r"\bnao\s+depende\b", normal) or re.search(r"\bsem\s+dependencia\b", normal):
        return None

    fim = r"(?=\.($|\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])|$)"
    for padrao in (
        rf"\bdepende\s+de\s*:\s*(.*?){fim}",
        rf"\bdepend[eê]ncia\s*:\s*(.*?){fim}",
        rf"\bbloqueado\s+por\s*:\s*(.*?){fim}",
    ):
        achado = re.search(padrao, plano, re.I)
        if not achado:
            continue
        bruto = achado.group(1).strip()
        if _normalizar(bruto) in {"dele", "o gastao", "gastao"}:
            return DEPENDENCIA_GASTAO
        dependencia = sanitizar_texto_publico(bruto, 90)
        if dependencia and not _somente_mascara(dependencia):
            return dependencia

    frases_curtas = [
        (r"\baguarda(?:ndo)?\s+o\s+gastao\b", DEPENDENCIA_GASTAO),
        (r"\b(?:depende|pendente)\s+dele\b", DEPENDENCIA_GASTAO),
        (r"\baguarda(?:ndo)?\s+decisao(?:\s+(?:do\s+gastao|dele))?\b", None),
        (r"\baguarda\s+resposta(?:\s+(?:do\s+gastao|dele))?\b", None),
    ]
    for padrao, fixo in frases_curtas:
        achado = re.search(padrao, normal)
        if not achado:
            continue
        trecho_original = plano[achado.start():achado.end()]
        contexto = normal[max(0, achado.start() - 20): achado.end() + 20]
        if fixo or "gastao" in contexto or "dele" in contexto:
            return DEPENDENCIA_GASTAO
        dependencia = sanitizar_texto_publico(trecho_original, 90)
        if dependencia and not _somente_mascara(dependencia):
            return dependencia
    return None


def _parse_item(bruto: str, indice: int, dono: str) -> tuple[dict | None, str | None]:
    texto = " ".join(bruto.split())
    prioridade_achada = re.search(r"\b(P[0-3])\b", texto, re.I)
    if not prioridade_achada:
        return None, "sem prioridade"
    prioridade = prioridade_achada.group(1).upper()
    ordem = _PRIORIDADE_ORDEM.get(prioridade, 99)
    titulo = _titulo_curto_publico(_extrair_titulo(bruto), 90)
    if not titulo:
        return None, "sem título"
    proximo = _extrair_proximo_passo(bruto)
    sem_proximo_passo = not bool(proximo)
    if proximo:
        proximo = _mascarar_nomes_proprios(proximo)
        if _somente_mascara(proximo):
            proximo = "próximo passo omitido por privacidade"
    estado = _estado_tarefa(bruto)
    item = {
        "chave": f"{dono}:{prioridade}:{indice}",
        "prioridade": prioridade,
        "titulo": titulo,
        "responsavel": _responsavel_do_dono(dono),
        "proximo_passo": proximo or "",
        "sem_proximo_passo": sem_proximo_passo,
        "subtarefas": _extrair_subtarefas(bruto, estado),
        "data": _extrair_data(bruto),
        "depende_de": _extrair_dependencia(bruto),
        "estado_tarefa": estado,
        "_ordem": ordem,
        "_indice": indice,
    }
    return item, None


def ler_prioridade_agente(dono: str, caminho: Path, *, permitir_caminho_teste: bool = False) -> dict:
    avisos: list[str] = []
    caminho_real, aviso_caminho = _validar_caminho(dono, caminho, permitir_caminho_teste)
    if aviso_caminho:
        return {"itens": [], "avisos": [aviso_caminho], "lido_em": None, "restantes": 0}
    assert caminho_real is not None
    texto, avisos_leitura = _ler_prioridade_streaming(caminho_real)
    avisos.extend(avisos_leitura)
    if texto is None:
        return {"itens": [], "avisos": avisos, "lido_em": None, "restantes": 0}
    if not texto.strip():
        return {"itens": [], "avisos": ["working-memory vazio"], "lido_em": None, "restantes": 0}
    itens = []
    avisos_parse: dict[str, int] = {}
    for indice, bruto in enumerate(_separar_itens([texto])):
        item, aviso = _parse_item(bruto, indice, dono)
        if aviso:
            avisos_parse[aviso] = avisos_parse.get(aviso, 0) + 1
        if item:
            itens.append(item)
    for motivo, quantidade in avisos_parse.items():
        if motivo == "sem prioridade":
            avisos.append(f"{quantidade} {'item sem prioridade omitido' if quantidade == 1 else 'itens sem prioridade omitidos'}")
        elif motivo == "sem título":
            avisos.append(f"{quantidade} {'item sem título omitido' if quantidade == 1 else 'itens sem título omitidos'}")
        else:
            avisos.append(f"{quantidade} {motivo}")
    if not itens:
        avisos.append("nenhum item público parseável")
    itens.sort(key=lambda item: (item["_ordem"], item["_indice"]))
    preferenciais = [i for i in itens if i["estado_tarefa"] != "concluida"]
    concluidos = [i for i in itens if i["estado_tarefa"] == "concluida"]
    ordenados = preferenciais + concluidos
    escolhidos = ordenados[:MAX_ITENS]
    restantes = max(0, len(ordenados) - len(escolhidos))
    for indice, item in enumerate(escolhidos):
        ordem = indice + 1
        item["ordem"] = ordem
        item["chave"] = f"{dono}:{item['prioridade']}:{indice}"
        item["em_andamento"] = False
        item.pop("_ordem", None)
        item.pop("_indice", None)
    for item in escolhidos:
        if item["estado_tarefa"] == "ativa":
            item["em_andamento"] = True
            break
    return {"itens": escolhidos, "avisos": avisos, "lido_em": datetime.now(BRT).isoformat(), "restantes": restantes}


def _assinatura(caminhos: dict[str, Path]) -> tuple:
    assinatura = []
    for dono in ("luana", "renato"):
        caminho = caminhos[dono]
        try:
            st = caminho.resolve(strict=True).stat()
            assinatura.append((dono, str(caminho.resolve(strict=True)), st.st_mtime_ns, st.st_size))
        except OSError:
            assinatura.append((dono, str(caminho), "erro", "erro"))
    return tuple(assinatura)


def _tem_falha(valor: dict) -> bool:
    for pacote in valor.values():
        if not isinstance(pacote, dict):
            return True
        if not pacote.get("itens") and pacote.get("avisos"):
            return True
    return False


def obter_tarefas_diretores(
    caminhos: dict[str, Path] | None = None,
    usar_cache: bool = True,
    *,
    permitir_caminho_teste: bool = False,
) -> dict:
    agora = time.monotonic()
    caminhos = caminhos or ARQUIVOS
    if caminhos is not ARQUIVOS and not permitir_caminho_teste:
        return {
            "luana": {"itens": [], "avisos": ["caminho de teste recusado fora do modo teste"], "lido_em": None, "restantes": 0},
            "renato": {"itens": [], "avisos": ["caminho de teste recusado fora do modo teste"], "lido_em": None, "restantes": 0},
        }
    chave = _assinatura(caminhos)
    if usar_cache:
        with _CACHE_LOCK:
            entrada = _CACHE.get(chave)
            if entrada and agora - float(entrada["quando"]) < TTL_S:
                return entrada["valor"]  # type: ignore[return-value]
    valor = {
        "luana": ler_prioridade_agente("luana", caminhos["luana"], permitir_caminho_teste=permitir_caminho_teste),
        "renato": ler_prioridade_agente("renato", caminhos["renato"], permitir_caminho_teste=permitir_caminho_teste),
    }
    if usar_cache and not _tem_falha(valor):
        with _CACHE_LOCK:
            _CACHE[chave] = {"quando": agora, "valor": valor}
    return valor


def limpar_cache() -> None:
    with _CACHE_LOCK:
        _CACHE.clear()
