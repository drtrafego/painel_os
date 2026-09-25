#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coletor de estado do PAINEL OS da casa.

O painel NAO gera nada: ele mostra o que este coletor deixou escrito.
Rodar:
    python3 /opt/gastaomatos/luana/painel_os/coletor/coletar_estado.py

Escreve: /opt/gastaomatos/luana/painel_os/data/estado.json

REGRA DE 20/09/2026, NAO REABRIR SEM LER ANTES: este arquivo de saida NAO
pode voltar a apontar para dentro de `web/src/`. Ate 20/09 o SAIDA escrevia
em cima de `web/src/dados/estado.json`, que e rastreado pelo git como a
fixture SINTETICA do build (ver README, item 2 da divida tecnica). Como o
servidor roda o coletor a cada request, o snapshot REAL (roster de agentes,
cron, cofre de aprendizados internos, volume comercial) ficava sujando esse
arquivo versionado, e um commit chegou a subir essa versao suja para o
repositorio PUBLICO no GitHub (commit 97656dc, corrigido nesta mesma
mudanca). `data/` ja e ignorado pelo git e tem permissao 700, igual
aprovacoes.json e cofre.json: e o lugar certo para dado real de operacao.

REGRA DESTE ARQUIVO: nada aqui inventa numero. Todo campo que nao pode ser
medido no disco sai como None, e a tela mostra um traco. Se voce for
acrescentar um campo, ou ele vem de um arquivo real ou ele nao entra.

REGRA DE PRIVACIDADE: nenhum texto livre escrito por cliente ou sobre cliente
entra no JSON. Nome, telefone e e-mail nao aparecem em tela nenhuma.
"""

import json
import hashlib
import math
import os
import re
import shutil
import stat as stat_mod
import subprocess
import sys
import tempfile
import time
import tomllib
import urllib.error
import urllib.request
import unicodedata
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
    FUSO_SP = ZoneInfo("America/Sao_Paulo")
except Exception:
    FUSO_SP = timezone(timedelta(hours=-3), name="America/Sao_Paulo")
from pathlib import Path
from chamadas_ingestao import ErroIngestao, carregar_inbox
from diretiva import carregar as carregar_diretiva
import motores

RAIZ = Path("/opt/gastaomatos")
PAINEL_OS_DIR = Path(__file__).resolve().parent.parent
DATA_MAPAS = PAINEL_OS_DIR / "data" / "mapas"
DIST_MAPAS = PAINEL_OS_DIR / "web" / "dist" / "mapas"
PUBLIC_MAPAS = PAINEL_OS_DIR / "web" / "public" / "mapas"
_ARCHIFY_CLI_ENV = os.environ.get("ARCHIFY_CLI")
ARCHIFY_CLI = Path(_ARCHIFY_CLI_ENV) if _ARCHIFY_CLI_ENV else None
CASA_CLAUDE = Path.home() / ".claude"
PROJETOS = CASA_CLAUDE / "projects"
AGENTES_GLOBAIS = CASA_CLAUDE / "agents"
PROC = Path("/proc")
PASTAS_SESSOES_CODEX = (
    Path.home() / ".codex-luana/sessions",
    Path.home() / ".codex-renato/sessions",
    Path.home() / ".codex-bia/sessions",
)
SESSOES_CODEX = PASTAS_SESSOES_CODEX[0]
AGENTES_CODEX = RAIZ / "luana/.codex/agents"
CONFIGS_CODEX = (Path.home() / ".codex-luana/config.toml", RAIZ / "luana/.codex/config.toml")
CONFIGS_CLAUDE = (RAIZ / "luana/.mcp.json", Path.home() / ".claude.json")
MCP_RUNTIME_TOOLS = Path.home() / ".codex-luana/cache/codex_apps_tools"
PLUGINS_CODEX = Path.home() / ".codex-luana/plugins/cache/openai-curated-remote"
PLUGINS_CLAUDE = Path.home() / ".claude/plugins/installed_plugins.json"
SAIDA = RAIZ / "luana/painel_os/data/estado.json"
APROVACOES_JSON = RAIZ / "luana/painel_os/data/aprovacoes.json"
APROVACAO_ESTADOS = ("aguardando", "aprovado", "reprovado", "cancelado")
APROVACAO_TIPOS = ("conteudo", "documento", "campanha", "outro")
COR_RENATO = "#c2410c"
MEMORIA_RAIZ = RAIZ / "luana/memoria"
# Cofre de conhecimento: UM arquivo, na mesma pasta de dados curados do painel
# (aprovacoes/calendario/diretiva). Cada registro é um APRENDIZADO com autor e
# fonte, não um arquivo de memória. Sem data no nome, de propósito.
COFRE_JSON = RAIZ / "luana/painel_os/data/cofre.json"
COFRE_RAIZ_FONTE = RAIZ / "luana"
COFRE_ESPECIES = ("trava", "ordem", "correcao", "medicao", "defeito", "padrao")
COFRE_TETO_BLOCO = 60
COFRE_LIMITE_TITULO = 96
COFRE_LIMITE_CORPO = 420
RE_COFRE_ID = re.compile(r"[a-z0-9][a-z0-9-]{2,79}")
RE_COFRE_FONTE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_./-]{2,120}\.(?:md|txt)")
CHAMADAS_INBOX = RAIZ / "luana/painel_os/dados/chamadas-inbox"
CHAMADAS_ESCOPO = "gastaomatos"
PRODUTOR = RAIZ / "produtor_conteudo"
CRM_ENV = RAIZ / "luana/.env.crm"
CRM_BASE = "https://crm.casaldotrafego.com"
FOLLOWUP_ESTADO = RAIZ / "luana/whatsapp_bridge/followup_nina_state.json"
FOLLOWUP_LOG = RAIZ / "luana/whatsapp_bridge/followup_nina.log"
CALENDARIO_JSON = RAIZ / "luana/painel_os/data/calendario.json"
DIRETIVA_JSON = RAIZ / "luana/painel_os/data/diretiva.json"
ESTUDIO_FONTES_JSON = RAIZ / "luana/painel_os/data/estudio-fontes.json"
SKILLS_RAIZ = RAIZ / "luana/.claude/skills"
CONEXOES_RAIZ = RAIZ / "luana/conexoes"

# Agentes de sessao: os que rodam no systemd e falam pelo Telegram.
#
# `service_prefixo` NAO e o nome de um service: e o prefixo com que os services
# do agente sao DESCOBERTOS no systemd (`luana.service`, `luana-claude.service`,
# e o proximo que o Gastao criar). Ate 10/09/2026 havia aqui um nome unico e
# fixo, e ele apontava justamente para o service PARADO: o painel dizia que a
# Luana estava inativa com a Luana viva. Lista escrita a mao faz o service novo
# nascer invisivel, que e pior que reprovado. Quem mede e `motores.py`.
SESSAO = [
    {
        "id": "luana",
        "nome": "Luana",
        "papel": "Super funcionária",
        "camada": "OPERAÇÃO INTEIRA",
        "resumo": "Coordena conteúdo, tráfego, mineração, financeiro e os bots. Convoca os especialistas e confere o que voltou.",
        "pasta": RAIZ / "luana",
        "verificador": RAIZ / "luana/verificar_frota_ULTIMO.txt",
        "service_prefixo": "luana",
        "cor": "lima",
    },
    {
        "id": "renato",
        "nome": "Renato",
        "papel": "Dono dos bots",
        "camada": "FROTA HERMES",
        "resumo": "Cuida só dos bots de atendimento: SOUL, memória, travas e as checagens da frota.",
        "pasta": RAIZ / "renato",
        "verificador": RAIZ / "renato/verificar_bots_ULTIMO.txt",
        "service_prefixo": "renato",
        "cor": "renato",
    },
    {
        "id": "bia",
        "nome": "Bia",
        "papel": "Diretora de Tráfego e IA",
        "camada": "TRÁFEGO & IA",
        "resumo": "Coordena tráfego pago, produção de conteúdo e automações de IA com controle de escopo.",
        "pasta": RAIZ / "bia",
        "verificador": RAIZ / "bia/verificar_bia_ULTIMO.txt",
        "service_prefixo": "bia",
        "cor": "rosa",
    },
]

# De qual pasta veio o agente -> qual esquadrao ele e.
SQUADS = {
    "global": {
        "nome": "Especialistas globais",
        "descricao": "Um ofício cada. São os que a Luana convoca em qualquer projeto.",
    },
    "conteudo": {
        "nome": "Squad de conteúdo",
        "descricao": "Pipeline da peça: radar, estratégia, roteiro, texto, arte e fiscal.",
    },
    "comercial": {
        "nome": "Setor comercial",
        "descricao": "Traz cliente novo pra agência vendendo o sistema pronto.",
    },
    "trafego": {
        "nome": "Squad de tráfego",
        "descricao": "Tráfego pago dos clientes da Bia: diagnóstico, campanha pausada, fiscal e ligar só com o dono.",
        "regente": "tereza",
    },
    "bots": {
        "nome": "Squad de bots",
        "descricao": "Conserto e evolução dos bots do Renato: cópia, revisão, troca atômica e conversa real.",
        "regente": "heitor",
    },
}


def squads_com_agentes(agentes: list[dict], squads: dict = SQUADS) -> dict:
    ids_com_agentes = {ag.get("squad") for ag in agentes if ag.get("squad")}
    return {id_: dados for id_, dados in squads.items() if id_ in ids_com_agentes}


# Mapa explícito pasta de squad -> chave de squad
MAPA_PASTA_SQUAD = {
    "conteudo-squad": "conteudo",
    "squad-conteudo": "conteudo",
    "conteudo": "conteudo",
    "comercial-squad": "comercial",
    "squad-comercial": "comercial",
    "comercial": "comercial",
    "trafego-squad": "trafego",
    "squad-trafego": "trafego",
    "trafego": "trafego",
    "tráfego": "trafego",
    "bots-squad": "bots",
    "squad-bots": "bots",
    "bots": "bots",
}



def agora_utc():
    return datetime.now(timezone.utc)


def gravar_atomico(caminho: Path, dado) -> None:
    """Escreve JSON atômico (tmp + os.replace) para os caches de leitura externa.

    BUG LATENTE CORRIGIDO EM 25/09/2026: esta função era chamada em três
    lugares (`ler_uso_planos`, `ler_financeiro`, `ler_redes_organicas`) sem
    nunca ter sido definida neste arquivo nem importada. Todo `NameError`
    caía no `except Exception: pass` de quem chamava, então o cache nunca
    era escrito e ninguém via erro nenhum: os três caches sempre reconsultavam
    a fonte, silenciosamente. Corrigido uma vez, corrige os três chamadores.
    """
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".cache-", suffix=".json", dir=str(caminho.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(dado, f, ensure_ascii=False, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, caminho)
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def _projeto_claude_da_pasta(pasta: Path) -> str:
    try:
        partes = Path(pasta).resolve().parts
    except OSError:
        partes = Path(pasta).parts
    return "-" + "-".join(p for p in partes if p and p != Path(p).anchor)


def _cmdline_e_claude_remoto(args: list[str], agente: str) -> bool:
    if not args:
        return False
    if Path(args[0]).name != "claude":
        return False
    for i, arg in enumerate(args):
        if arg == "--remote-control" and i + 1 < len(args) and args[i + 1] == agente:
            return True
        if arg == f"--remote-control={agente}":
            return True
    return False


def ler_processos_claude_remotos(proc: Path = PROC) -> tuple[set[str] | None, str | None]:
    """Lê /proc e devolve quais agentes têm Claude Code remoto vivo.

    Falha para listar /proc torna a presença indeterminada. Falhas pontuais de
    pid que morreu durante a leitura são esperadas e não anulam a sonda inteira.
    """
    try:
        entradas = list(Path(proc).iterdir())
    except OSError as exc:
        return None, f"falha ao listar processos ({type(exc).__name__})"

    vivos: set[str] = set()
    agentes = {item["id"] for item in SESSAO}
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
        for agente in agentes:
            if _cmdline_e_claude_remoto(args, agente):
                vivos.add(agente)
    if pids and lidos == 0:
        return None, "falha ao ler cmdline dos processos"
    return vivos, None


def _resolver_processos_claude(processos_claude):
    if processos_claude is None:
        return ler_processos_claude_remotos()
    if isinstance(processos_claude, tuple) and len(processos_claude) == 2:
        vivos, erro = processos_claude
        return (set(vivos) if vivos is not None else None), erro
    return set(processos_claude), None


def ler_presenca_sessao(
    item: dict,
    projetos: Path = PROJETOS,
    agora: datetime | None = None,
    processos_claude=None,
):
    """Resume a presença da sessão raiz Claude Code viva do agente."""
    vazio = {
        "estado": "sem_sessao",
        "ultima_atividade": None,
        "fonte_atividade": "processo Claude --remote-control em /proc e transcript Claude Code mais recente",
        "erro_atividade": None,
    }
    projeto = _projeto_claude_da_pasta(item["pasta"])
    pasta = Path(projetos) / projeto
    if not pasta.is_dir():
        return {**vazio, "erro_atividade": "catálogo de sessão Claude Code não encontrado"}
    try:
        candidatos = []
        for arq in pasta.glob("*.jsonl"):
            if not arq.is_file():
                continue
            try:
                candidatos.append((arq.stat().st_mtime, arq))
            except OSError:
                continue
    except OSError as exc:
        return {**vazio, "estado": "indeterminado", "erro_atividade": f"falha ao listar sessões ({type(exc).__name__})"}
    if not candidatos:
        return {**vazio, "erro_atividade": "nenhum transcript Claude Code encontrado"}
    mtime, _ = max(candidatos, key=lambda par: par[0])
    instante = datetime.fromtimestamp(mtime, tz=timezone.utc)
    processos_vivos, erro_processos = _resolver_processos_claude(processos_claude)
    if processos_vivos is None:
        estado = "indeterminado"
    else:
        estado = "ativo" if item["id"] in processos_vivos else "ocioso"
    return {
        **vazio,
        "estado": estado,
        "ultima_atividade": instante.isoformat(),
        "erro_atividade": erro_processos,
    }


def ler_calendario(caminho=CALENDARIO_JSON):
    """Lê somente o snapshot agregado; qualquer desvio falha sem fabricar zero."""
    vazio = {
        "status": "erro", "fonte": "Google Calendar primário, leitura agregada",
        "coletado_em": None, "janela": None, "totais": None, "respostas": {},
        "dias": [], "vencido": None, "erro": None,
    }
    try:
        bruto = json.loads(Path(caminho).read_text(encoding="utf-8"))
        chaves = {"versao", "status", "fonte", "coletado_em", "janela", "totais", "respostas", "dias", "erro"}
        if not isinstance(bruto, dict) or set(bruto) != chaves or bruto.get("versao") != 1 or bruto.get("status") != "pronto":
            raise ValueError("contrato ou versão inválida")
        coleta = datetime.fromisoformat(bruto["coletado_em"].replace("Z", "+00:00"))
        if coleta.tzinfo is None:
            raise ValueError("coleta sem fuso")
        janela = bruto["janela"]
        if not isinstance(janela, dict) or set(janela) != {"inicio", "fim", "fuso"} or janela["fuso"] != "America/Sao_Paulo":
            raise ValueError("janela inválida")
        for campo in ("inicio", "fim"):
            if datetime.fromisoformat(janela[campo].replace("Z", "+00:00")).tzinfo is None:
                raise ValueError("janela sem fuso")
        totais = bruto["totais"]
        total_chaves = {"eventos_agendados", "minutos_agendados", "horarios_encerrados_ate_coleta", "eventos_futuros_na_coleta", "blocos_ocupados", "reunioes_ocorridas"}
        if not isinstance(totais, dict) or set(totais) != total_chaves or totais["reunioes_ocorridas"] is not None:
            raise ValueError("totais inválidos")
        for campo in total_chaves - {"reunioes_ocorridas"}:
            if type(totais[campo]) is not int or totais[campo] < 0:
                raise ValueError("total negativo ou não inteiro")
        if totais["horarios_encerrados_ate_coleta"] + totais["eventos_futuros_na_coleta"] != totais["eventos_agendados"]:
            raise ValueError("partição temporal não fecha")
        respostas = bruto["respostas"]
        respostas_chaves = {"aceito", "recusado", "talvez", "pendente", "não informado"}
        if not isinstance(respostas, dict) or set(respostas) != respostas_chaves or any(type(v) is not int or v < 0 for v in respostas.values()) or sum(respostas.values()) != totais["eventos_agendados"]:
            raise ValueError("respostas não fecham")
        soma_eventos = soma_minutos = soma_encerrados = soma_futuros = 0
        anterior = ""
        dias = bruto["dias"]
        if not isinstance(dias, list):
            raise ValueError("dias não é lista")
        for dia in dias:
            campos = {"data", "eventos_agendados", "minutos_agendados", "horario_encerrado_ate_coleta", "futuros_na_coleta"}
            if not isinstance(dia, dict) or set(dia) != campos:
                raise ValueError("dia inválido")
            datetime.strptime(dia["data"], "%Y-%m-%d")
            if dia["data"] <= anterior or any(type(dia[k]) is not int or dia[k] < 0 for k in campos - {"data"}):
                raise ValueError("dia desordenado ou negativo")
            if dia["horario_encerrado_ate_coleta"] + dia["futuros_na_coleta"] != dia["eventos_agendados"]:
                raise ValueError("partição diária não fecha")
            anterior = dia["data"]
            soma_eventos += dia["eventos_agendados"]
            soma_minutos += dia["minutos_agendados"]
            soma_encerrados += dia["horario_encerrado_ate_coleta"]
            soma_futuros += dia["futuros_na_coleta"]
        if (soma_eventos, soma_minutos, soma_encerrados, soma_futuros) != (
            totais["eventos_agendados"], totais["minutos_agendados"],
            totais["horarios_encerrados_ate_coleta"], totais["eventos_futuros_na_coleta"],
        ):
            raise ValueError("dias não fecham com totais")
        saida = {k: bruto[k] for k in chaves - {"versao"}}
        saida["vencido"] = agora_utc() - coleta.astimezone(timezone.utc) > timedelta(hours=24)
        return saida
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as e:
        vazio["erro"] = f"snapshot agregado indisponível ({type(e).__name__})"
        return vazio


def _ler_env(caminho: Path, chave: str):
    """Lê uma variável sem executar o arquivo e sem devolver seu valor em erro."""
    try:
        texto = caminho.read_text(encoding="utf-8")
    except OSError as e:
        raise RuntimeError(f"arquivo de credencial indisponível ({type(e).__name__})") from e
    for linha in texto.splitlines():
        limpa = linha.strip()
        if not limpa or limpa.startswith("#") or "=" not in limpa:
            continue
        nome, valor = limpa.split("=", 1)
        if nome.strip().removeprefix("export ").strip() == chave:
            valor = valor.strip().strip('"').strip("'")
            if valor:
                return valor
    raise RuntimeError(f"credencial {chave} não configurada")


def ler_pipeline():
    """Agrega analytics de todas as organizações sem publicar a organização.

    Não lê `/leads` nem `/contacts`: a rota analytics já devolve o agregado
    necessário. Uma organização que falhar invalida o todo, porque parcial se
    pareceria com um funil menor.
    """
    vazio = {
        "erro": None,
        "fonte": "CRM /api/v1/organizations/:id/analytics, somado sem identificação de organização",
        "coletado_em": None,
        "organizacoes": None,
        "total": None,
        "etapas": [],
    }
    try:
        cid = _ler_env(CRM_ENV, "MVPCRM_CLIENT_ID")
        segredo = _ler_env(CRM_ENV, "MVPCRM_CLIENT_SECRET")
        corpo = json.dumps({"client_id": cid, "client_secret": segredo}).encode()
        req = urllib.request.Request(
            f"{CRM_BASE}/api/oauth/token", data=corpo,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=18) as resposta:
            auth = json.load(resposta)
        token = auth.get("access_token") if isinstance(auth, dict) else None
        if not isinstance(token, str) or not token:
            raise RuntimeError("token ausente")
        cabecalho = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        req = urllib.request.Request(f"{CRM_BASE}/api/v1/organizations", headers=cabecalho)
        with urllib.request.urlopen(req, timeout=18) as resposta:
            org_bruto = json.load(resposta)
        orgs = org_bruto.get("organizations") if isinstance(org_bruto, dict) else None
        if not isinstance(orgs, list):
            raise RuntimeError("lista de organizações inválida")

        # Lista positiva: título de coluna é texto livre da organização e pode
        # conter nome de cliente, corretor ou campanha. Só estes rótulos
        # operacionais genéricos atravessam; todo o resto vira uma categoria.
        etapas_publicas = {
            "novos leads": "Novos leads", "nao tem interesse": "Sem interesse",
            "em contato": "Em contato", "perdido": "Perdido",
            "nao retornou": "Não retornou", "contato realizado": "Contato realizado",
            "atendimento em andamento": "Atendimento em andamento",
            "proposta enviada": "Proposta enviada", "contrato fechado": "Contrato fechado",
            "nao fechou": "Não fechou", "nao locamos": "Não locado",
            "orcamento enviado": "Orçamento enviado", "call agendada": "Chamada agendada",
            "call realizada": "Chamada realizada", "consulta agendada": "Consulta agendada",
            "fechado": "Fechado", "fechou contrato": "Contrato fechado",
            "atendimento finalizado sem sucesso": "Atendimento sem sucesso",
            "numero incorreto": "Número incorreto",
        }
        total = 0
        etapas = {}
        for org in orgs:
            org_id = org.get("id") if isinstance(org, dict) else None
            if not isinstance(org_id, str):
                raise RuntimeError("organização sem id")
            req = urllib.request.Request(
                f"{CRM_BASE}/api/v1/organizations/{org_id}/analytics", headers=cabecalho
            )
            with urllib.request.urlopen(req, timeout=18) as resposta:
                analytics = json.load(resposta)
            colunas = analytics.get("byColumn") if isinstance(analytics, dict) else None
            total_org = analytics.get("totalLeads") if isinstance(analytics, dict) else None
            if not isinstance(colunas, list) or not isinstance(total_org, int):
                raise RuntimeError("analytics inválido")
            total += total_org
            for coluna in colunas:
                if not isinstance(coluna, dict) or not isinstance(coluna.get("count"), int):
                    raise RuntimeError("coluna de analytics inválida")
                titulo = re.sub(r"\s+", " ", _chave(str(coluna.get("title") or "")).strip())
                rotulo = etapas_publicas.get(titulo, "Outras etapas protegidas")
                etapas[rotulo] = etapas.get(rotulo, 0) + coluna["count"]
    except urllib.error.HTTPError as e:
        vazio["erro"] = f"CRM respondeu HTTP {e.code}; funil indisponível"
        return vazio
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, RuntimeError) as e:
        vazio["erro"] = f"não consegui ler o CRM ({type(e).__name__}); funil indisponível"
        return vazio

    return {
        **vazio,
        "coletado_em": agora_utc().isoformat(),
        "organizacoes": len(orgs),
        "total": total,
        "etapas": [
            {"etapa": etapa, "total": quantidade}
            for etapa, quantidade in sorted(etapas.items(), key=lambda x: (-x[1], x[0]))
        ],
    }


def ler_followup(caminho_estado=FOLLOWUP_ESTADO, caminho_log=FOLLOWUP_LOG):
    """Agrega o motor sem levar identificador ou conversa ao painel.

    ``enviados`` no estado também inclui etapa barrada/consumida, logo não é
    entrega. Entregas vêm apenas das linhas explícitas do log; os dois números
    seguem separados para não transformar decisão do motor em resultado.
    """
    vazio = {
        "status": "erro", "fonte": "estado e log locais do follow-up Nina, somente agregados",
        "atualizado_em": None, "contatos_no_estado": None,
        "etapas_consumidas": None, "envios_registrados_no_log": None,
        "recusas_registradas": None, "despedidas_registradas": None,
        "por_etapa": [], "erro": None,
    }
    try:
        bruto = json.loads(Path(caminho_estado).read_text(encoding="utf-8"))
        if not isinstance(bruto, dict):
            raise ValueError("estado não é objeto")
        registros = [v for k, v in bruto.items() if k != "_ritmo" and isinstance(v, dict)]
        etapas = {}
        consumidas = 0
        for reg in registros:
            lista = reg.get("enviados", [])
            if not isinstance(lista, list) or any(not isinstance(x, str) for x in lista):
                raise ValueError("lista de etapas inválida")
            for etapa in lista:
                if etapa in {"carimbado_corte_25_08", "fora_da_janela_24h"}:
                    continue
                if not re.fullmatch(r"(?:30min|1h|3h|4h|12h|20h|23h30|24h|48h|70h)", etapa):
                    continue
                consumidas += 1
                etapas[etapa] = etapas.get(etapa, 0) + 1

        texto_log = Path(caminho_log).read_text(encoding="utf-8")
        entregas = len(re.findall(r"(?m)^\S+\s+\S+: toque \S+ enviado(?:\s|$)", texto_log))
        atualizado = max(Path(caminho_estado).stat().st_mtime, Path(caminho_log).stat().st_mtime)
    except (OSError, ValueError, json.JSONDecodeError, TypeError) as exc:
        return {**vazio, "erro": f"não consegui agregar o follow-up ({type(exc).__name__})"}

    return {
        **vazio,
        "status": "pronto",
        "atualizado_em": datetime.fromtimestamp(atualizado, tz=timezone.utc).isoformat(),
        "contatos_no_estado": len(registros),
        "etapas_consumidas": consumidas,
        "envios_registrados_no_log": entregas,
        "recusas_registradas": sum(1 for r in registros if r.get("recusou")),
        "despedidas_registradas": sum(1 for r in registros if r.get("despediu")),
        "por_etapa": [
            {"etapa": etapa, "total": total}
            for etapa, total in sorted(etapas.items(), key=lambda x: (-x[1], x[0]))
        ],
        "erro": None,
    }


def ler_fiscal_comercial(caminho_agregado=None, caminho_pipeline=None):
    """Lê o veredito e checagens do fiscal comercial (C1..C13, S1..S3).

    Regra dura: NUNCA repassa texto de peças, correções pedidas nem dados de leads.
    Se nem o agregado nem o pipeline.jsonl existirem, devolve status: 'sem_dado' sem inventar zero.
    """
    vazio = {
        "status": "sem_dado",
        "atualizado_em": None,
        "erro": "fiscal comercial ainda não mediu peças; fase 1 em andamento",
        "por_checagem": [],
        "total_passa": None,
        "total_bloqueia": None,
        "checagem_mais_disparada": None,
        "meta_agendamentos": {
            "status": "sem_dado",
            "texto": "sem dado, Hugo ainda não mediu",
        },
    }

    candidatos_agregado = [
        caminho_agregado,
        RAIZ / "comercial/squad/painel/agregado.json",
        RAIZ / "luana/plugins/sales-autonomia/fiscal/agregado.json",
        RAIZ / "luana/comercial/agregado.json",
    ]
    arq_agregado = next((Path(p) for p in candidatos_agregado if p and Path(p).is_file()), None)

    if arq_agregado:
        try:
            bruto = json.loads(arq_agregado.read_text(encoding="utf-8"))
            if isinstance(bruto, dict):
                por_chec = []
                total_p = 0
                total_b = 0
                raw_chec = bruto.get("por_checagem") or bruto.get("checagens") or []
                if isinstance(raw_chec, list):
                    for item in raw_chec:
                        if isinstance(item, dict) and "checagem" in item:
                            c_nome = str(item["checagem"])
                            p_cnt = int(item.get("passa", 0) or 0)
                            b_cnt = int(item.get("bloqueia", 0) or 0)
                            por_chec.append({"checagem": c_nome, "passa": p_cnt, "bloqueia": b_cnt})
                            total_p += p_cnt
                            total_b += b_cnt
                elif isinstance(raw_chec, dict):
                    for c_nome, counts in raw_chec.items():
                        if isinstance(counts, dict):
                            p_cnt = int(counts.get("passa", 0) or 0)
                            b_cnt = int(counts.get("bloqueia", 0) or 0)
                            por_chec.append({"checagem": str(c_nome), "passa": p_cnt, "bloqueia": b_cnt})
                            total_p += p_cnt
                            total_b += b_cnt

                total_p = bruto.get("total_passa", total_p)
                total_b = bruto.get("total_bloqueia", total_b)
                mais_disp = bruto.get("checagem_mais_disparada")
                if not mais_disp and por_chec:
                    mais_disp = max(por_chec, key=lambda x: x["bloqueia"])["checagem"]

                mtime = datetime.fromtimestamp(arq_agregado.stat().st_mtime, tz=timezone.utc).isoformat()
                return {
                    "status": "pronto",
                    "atualizado_em": mtime,
                    "erro": None,
                    "por_checagem": sorted(por_chec, key=lambda x: x["checagem"]),
                    "total_passa": total_p,
                    "total_bloqueia": total_b,
                    "checagem_mais_disparada": mais_disp,
                    "meta_agendamentos": {
                        "status": "sem_dado",
                        "texto": "sem dado, Hugo ainda não mediu",
                    },
                }
        except Exception:
            pass

    candidatos_pipe = [
        caminho_pipeline,
        RAIZ / "comercial/squad/logs/pipeline.jsonl",
        RAIZ / "luana/plugins/sales-autonomia/fiscal/pipeline.jsonl",
        RAIZ / "luana/comercial/pipeline.jsonl",
    ]
    arq_pipe = next((Path(p) for p in candidatos_pipe if p and Path(p).is_file()), None)

    if arq_pipe:
        try:
            linhas_fiscal = []
            for lin in arq_pipe.read_text(encoding="utf-8", errors="replace").splitlines():
                lin = lin.strip()
                if not lin:
                    continue
                try:
                    obj = json.loads(lin)
                    if isinstance(obj, dict) and obj.get("etapa") == "fiscal":
                        linhas_fiscal.append(obj)
                except Exception:
                    continue

            if linhas_fiscal:
                total_p = 0
                total_b = 0
                checagens_contadas = {}
                for obj in linhas_fiscal:
                    st = str(obj.get("status", "")).upper()
                    if st == "PASSA":
                        total_p += 1
                    elif st == "BLOQUEIA":
                        total_b += 1
                    raw_c = obj.get("checagens")
                    if isinstance(raw_c, list):
                        for c in raw_c:
                            if isinstance(c, dict) and "checagem" in c:
                                nome = str(c["checagem"])
                                d = checagens_contadas.setdefault(nome, {"checagem": nome, "passa": 0, "bloqueia": 0})
                                if c.get("status") == "PASSA":
                                    d["passa"] += 1
                                else:
                                    d["bloqueia"] += 1
                            elif isinstance(c, str):
                                d = checagens_contadas.setdefault(c, {"checagem": c, "passa": 0, "bloqueia": 0})
                                if st == "PASSA":
                                    d["passa"] += 1
                                else:
                                    d["bloqueia"] += 1
                    elif isinstance(raw_c, dict):
                        for nome, val in raw_c.items():
                            d = checagens_contadas.setdefault(nome, {"checagem": nome, "passa": 0, "bloqueia": 0})
                            if str(val).upper() == "PASSA":
                                d["passa"] += 1
                            else:
                                d["bloqueia"] += 1

                por_chec = sorted(checagens_contadas.values(), key=lambda x: x["checagem"])
                mais_disp = max(por_chec, key=lambda x: x["bloqueia"])["checagem"] if por_chec else None
                mtime = datetime.fromtimestamp(arq_pipe.stat().st_mtime, tz=timezone.utc).isoformat()
                return {
                    "status": "pronto",
                    "atualizado_em": mtime,
                    "erro": None,
                    "por_checagem": por_chec,
                    "total_passa": total_p,
                    "total_bloqueia": total_b,
                    "checagem_mais_disparada": mais_disp,
                    "meta_agendamentos": {
                        "status": "sem_dado",
                        "texto": "sem dado, Hugo ainda não mediu",
                    },
                }
        except Exception:
            pass

    return vazio


def ler_aprovacoes(caminho=APROVACOES_JSON):
    """Valida a fila persistente inteira ou falha fechada, sem aproveitar nada."""
    https_ativo = (RAIZ / "luana/painel_os/servidor/.https-ativo").is_file()
    vazio = {"erro": None, "arquivo": Path(caminho).name, "atualizado_em": None,
             "total": None, "por_estado": {}, "itens": [],
             "decisoes_habilitadas": https_ativo,
             "decisoes_bloqueio": None if https_ativo else "aguardando HTTPS; leitura continua disponível"}
    try:
        bruto = json.loads(Path(caminho).read_text(encoding="utf-8"))
        if not isinstance(bruto, dict) or bruto.get("versao") != 1 or not isinstance(bruto.get("itens"), list):
            raise ValueError("contrato inválido")
        ids, itens = set(), []
        for i, item in enumerate(bruto["itens"]):
            if not isinstance(item, dict):
                raise ValueError(f"item {i} não é objeto")
            ident, estado, tipo = item.get("id"), item.get("estado"), item.get("tipo")
            criado, origem = item.get("criado_em"), item.get("origem")
            if not isinstance(ident, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{6,80}", ident) or ident in ids:
                raise ValueError(f"id inválido ou repetido no item {i}")
            if estado not in APROVACAO_ESTADOS or tipo not in APROVACAO_TIPOS:
                raise ValueError(f"estado ou tipo inválido no item {i}")
            if not isinstance(criado, str) or not isinstance(origem, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{2,60}", origem):
                raise ValueError(f"origem ou data inválida no item {i}")
            datetime.fromisoformat(criado.replace("Z", "+00:00"))
            ids.add(ident)
            itens.append({"id": ident, "estado": estado, "tipo": tipo,
                          "criado_em": criado, "origem": origem})
        por_estado = {e: sum(1 for x in itens if x["estado"] == e) for e in APROVACAO_ESTADOS}
        atualizado = datetime.fromtimestamp(Path(caminho).stat().st_mtime, tz=timezone.utc).isoformat()
        return {**vazio, "atualizado_em": atualizado, "total": len(itens),
                "por_estado": por_estado, "itens": itens}
    except (OSError, ValueError, TypeError) as e:
        vazio["erro"] = f"fila de aprovações inválida ou indisponível ({type(e).__name__}); contagens indisponíveis"
        return vazio


# Asterisco, sublinhado e crase são ENFEITE do Markdown e grudam na palavra:
# a fonte escreve `**um zero que vem de erro`, e a âncora do registro é texto
# limpo. Comparar sem tirar isso reprovava as cinco âncoras certas de uma vez.
RE_COFRE_ENFEITE = re.compile(r"[*_`]")


def _cofre_espaco(texto: str) -> str:
    """Enfeite fora e espaço colapsado, porque o Markdown da casa quebra frase
    no meio. Acento NÃO se mexe: a casa já apanhou de `grep` cru em português,
    e âncora que ignora acento deixa de provar que leu a frase certa."""
    return " ".join(RE_COFRE_ENFEITE.sub("", texto).split())


def _cofre_indexar(linhas: list):
    """O texto plano da fonte e, pra CADA caractere dele, a linha onde ele mora.

    Casar por janela de N linhas devolvia a primeira linha da JANELA, não a da
    frase: o endereço saía uma acima. Endereço errado é pior que endereço
    ausente, porque parece medido.
    """
    partes, de_que_linha = [], []
    for n, linha in enumerate(linhas):
        for palavra in RE_COFRE_ENFEITE.sub("", linha).split():
            if partes:
                partes.append(" ")
                de_que_linha.append(n)
            partes.append(palavra)
            de_que_linha.extend([n] * len(palavra))
    return "".join(partes), de_que_linha


def _cofre_achar(ancora: str, plano: str, de_que_linha: list):
    """Índice da linha onde a âncora COMEÇA, ou None quando ela sumiu da fonte."""
    posicao = plano.find(ancora)
    return de_que_linha[posicao] if posicao >= 0 else None


# Fim de bloco: linha em branco, ou o começo de OUTRO bloco marcado. Só a linha
# em branco não bastava: bloco aninhado emenda no seguinte e o tamanho saía
# igual ao TETO em vez de medido, que é o instrumento narrando o próprio limite.
RE_COFRE_FIM = re.compile(r"^\s*(?:\u203c|\u26a0|#{2,}\s|\d+\.\s+\*\*)")


def _cofre_bloco(linhas: list, inicio: int):
    """Tamanho do bloco de origem, medido a cada coleta. Devolve (linhas, teto),
    e `teto` diz que a medição BATEU no limite, ou seja: não é o tamanho real."""
    total = 0
    for passo, linha in enumerate(linhas[inicio:inicio + COFRE_TETO_BLOCO]):
        if not linha.strip():
            break
        if passo and RE_COFRE_FIM.match(linha):
            break
        total += 1
    return (total or 1), total >= COFRE_TETO_BLOCO


def _cofre_fonte(nome: str, raiz: Path):
    """Resolve a fonte DENTRO da raiz. Caminho que escapa não é lido."""
    if not isinstance(nome, str) or not RE_COFRE_FONTE.fullmatch(nome):
        raise ValueError(f"fonte inválida: {nome!r}")
    alvo = (raiz / nome).resolve()
    if not alvo.is_file() or raiz.resolve() not in alvo.parents:
        raise ValueError(f"fonte fora da raiz ou ausente: {nome}")
    return alvo


def _cofre_texto(bruto, campo: str, limite: int) -> str:
    """A PORTA. Todo texto do registro passa por `rotulo_seguro` antes de virar
    tela: e-mail, dígito longo e nome de cliente morrem aqui. `rotulo_seguro`
    devolve TUPLA, não dicionário: a casa já errou esse exato desempacotamento."""
    if not isinstance(bruto, str) or not bruto.strip():
        raise ValueError(f"{campo} vazio")
    seguro = rotulo_seguro(bruto, limite=limite)
    if seguro is None:
        raise ValueError(f"{campo} não passou na trava de nome de cliente")
    texto, _achados = seguro
    return texto


def _cofre_razao(porque: str) -> str:
    """A razão da ligação DEPOIS de provada literal na fonte.

    A ORDEM é o conserto inteiro. A prova de que a frase está escrita na fonte
    roda contra o texto CRU, lá em cima; mascarar antes faria `[cliente]` nunca
    casar com o arquivo e TODA aresta seria recusada. A máscara roda aqui,
    porque é este texto que vai pra tela: ele é desenhado no painel do caminho
    mais curto e no `title` de cada seta.

    Era a única citação literal de arquivo que ia ao navegador sem passar pela
    trava, e as fontes aceitas incluem `memoria/`, onde nome de cliente mora.

    Quando a máscara não consegue garantir a limpeza, a ARESTA continua e só a
    razão vira marca: a ligação é o achado, e sumir com ela pra proteger uma
    frase seria trocar um vazamento por um zero calado.
    """
    try:
        return _cofre_texto(porque, "porque", COFRE_LIMITE_CORPO)
    except ValueError:
        return "[razão omitida: não passou na trava de nome de cliente]"


def _cofre_recusa(motivo: str) -> str:
    """Motivo de recusa também é saída, e é a saída MENOS revisada que existe.

    `recusados` e `arestas_recusadas` carregam valor CRU do `cofre.json` (id,
    espécie, área, destino da aresta, nome do arquivo de fonte, mensagem do
    sistema de arquivos) e viajam inteiros no `estado.json` servido, mesmo com
    o front mostrando só a contagem. Justamente o registro que ninguém revisou
    é o que falhou na validação, então ele sai pela MESMA porta do resto:
    caminho de máquina fora, e-mail, número e nome de cliente mascarados.
    """
    return _texto_de_tela(motivo)


def ler_cofre(arquivo: Path = COFRE_JSON, raiz_fonte: Path = COFRE_RAIZ_FONTE, skills_acessos_extras: list = None):
    """O Cofre é o que a operação APRENDEU, não a estante de arquivos.

    Cada nó é um aprendizado declarado em `painel_os/data/cofre.json`, e o
    coletor CONFERE cada um contra a fonte antes de emitir: a `ancora` tem que
    existir no arquivo citado. Sumiu, o nó sai marcado como vencido e entra na
    contagem; ele NÃO some calado, porque cofre que encolhe sozinho é zero de
    ausência com cara de zero de erro.

    Aresta só nasce quando o texto da FONTE declara a ligação: o campo `porque`
    tem que estar escrito lá. Semelhança que alguém achou nunca vira aresta.
    """
    vazio = {"nos": [], "arestas": [], "arquivos": None, "conexoes": None,
             "cobertura": None, "arquivo": "painel_os/data/cofre.json",
             "areas": [], "familias": [], "grau_medio": None,
             "vencidos": [], "recusados": [], "arestas_recusadas": [], "truncados": [],
             "avisos": []}

    # Sem a lista de nomes a porta não sabe negar ninguém, e TODO registro seria
    # recusado. Cofre vazio nessa hora seria "não aprendemos nada" quando o
    # certo é "não consegui conferir". Falha alto.
    if not NEGACAO["carregada"]:
        return {**vazio, "erro": f"trava de nome de cliente indisponível ({NEGACAO['erro']}); "
                                 "o Cofre não sai sem ela"}
    try:
        bruto = json.loads(Path(arquivo).read_text(encoding="utf-8"))
        registros = bruto["registros"]
        if not isinstance(registros, list) or not registros:
            raise ValueError("registros vazio ou não é lista")
        # Os dois eixos vêm do CATÁLOGO do próprio registro, não chumbados aqui:
        # área nova se cadastra num lugar só, e área que ninguém usa não vira
        # cluster vazio na barra lateral.
        areas = {a["id"]: a for a in bruto.get("areas", []) if isinstance(a, dict) and a.get("id")}
        familias = {f["id"]: f for f in bruto.get("familias", []) if isinstance(f, dict) and f.get("id")}
        if not areas or not familias:
            raise ValueError("catálogo de áreas ou de famílias ausente")
        if "operacao" not in areas:
            areas["operacao"] = {"id": "operacao", "nome": "Skills e ferramentas", "sempre_visivel": False}
        if "ferramentas" not in familias:
            familias["ferramentas"] = {"id": "ferramentas", "nome": "Ferramentas e automações"}
        if "agentes" not in familias:
            familias["agentes"] = {"id": "agentes", "nome": "Agentes da operação"}
        if "sistemas" not in familias:
            familias["sistemas"] = {"id": "sistemas", "nome": "Sistemas integrados"}
    except (OSError, ValueError, TypeError, KeyError) as e:
        return {**vazio, "erro": f"registro do Cofre inválido ou ausente ({type(e).__name__})"}

    fontes: dict = {}
    nos, ids, vencidos, recusados, truncados = [], set(), [], [], []
    pendentes = []  # (id_de_origem, texto normalizado da fonte, lista de conexões)

    for i, reg in enumerate(registros):
        try:
            if not isinstance(reg, dict):
                raise ValueError("não é objeto")
            ident = reg.get("id")
            if not isinstance(ident, str) or not RE_COFRE_ID.fullmatch(ident) or ident in ids:
                raise ValueError(f"id inválido ou repetido: {ident!r}")
            especie = reg.get("especie")
            if especie not in COFRE_ESPECIES:
                raise ValueError(f"espécie fora do catálogo: {especie!r}")
            area = reg.get("area")
            if not isinstance(area, str) or not area:
                raise ValueError(f"área inválida: {area!r}")
            if area not in areas:
                raise ValueError(f"área fora do catálogo: {area!r}")
            familia = reg.get("familia")
            if familia not in familias:
                raise ValueError(f"família fora do catálogo: {familia!r}")
            peso = reg.get("peso")
            if not isinstance(peso, int) or not 1 <= peso <= 5:
                raise ValueError("peso fora de 1 a 5")
            quando = reg.get("quando")
            if not isinstance(quando, str):
                raise ValueError("quando ausente")
            datetime.strptime(quando, "%Y-%m-%d")
            linha = reg.get("linha")
            if not isinstance(linha, int) or linha < 1:
                raise ValueError("linha inválida")

            caminho = _cofre_fonte(reg.get("fonte"), raiz_fonte)
            if caminho not in fontes:
                texto = caminho.read_text(encoding="utf-8", errors="replace")
                linhas_da_fonte = texto.splitlines()
                plano_da_fonte, mapa_da_fonte = _cofre_indexar(linhas_da_fonte)
                fontes[caminho] = (
                    linhas_da_fonte, plano_da_fonte, mapa_da_fonte,
                    datetime.fromtimestamp(caminho.stat().st_mtime, timezone.utc).isoformat(),
                )
            linhas_fonte, plano, de_que_linha, modificado = fontes[caminho]

            ancora = _cofre_espaco(str(reg.get("ancora", "")))
            if len(ancora) < 12:
                raise ValueError("âncora curta demais pra provar coisa nenhuma")

            # A linha declarada no registro é só uma dica humana. Quem manda é a
            # ÂNCORA: se o arquivo andou, o endereço anda junto; se ela sumiu, o
            # nó sai marcado, nunca com endereço de mentira.
            achado = _cofre_achar(ancora, plano, de_que_linha)
            confere = achado is not None
            indice = achado if confere else max(0, min(linha - 1, len(linhas_fonte) - 1))

            titulo = _cofre_texto(reg.get("titulo"), "titulo", COFRE_LIMITE_TITULO)
            corpo = _cofre_texto(reg.get("corpo"), "corpo", COFRE_LIMITE_CORPO)
            caso = _cofre_texto(reg.get("caso"), "caso", COFRE_LIMITE_CORPO)
            autor = _cofre_texto(reg.get("autor"), "autor", 40)

            endereco = f"{reg['fonte']}:{indice + 1}"
            tamanho, bateu_no_teto = _cofre_bloco(linhas_fonte, indice)
            nos.append({
                "id": ident,
                "rotulo": titulo,
                "arquivo": endereco if confere else f"âncora não confere em {endereco}",
                "linhas": tamanho if confere else 0,
                "modificado": modificado,
                "tipo": "assunto",
                # Campos NOVOS. A tela de hoje ignora o que não conhece; a ficha
                # que mostra espécie, autor e caso é mudança de front, não daqui.
                "especie": especie,
                "area": area,
                "familia": familia,
                "corpo": corpo,
                "caso": caso,
                "autor": autor,
                "quando": quando,
                "peso": peso,
                "vencido": not confere,
            })
            ids.add(ident)
            if not confere:
                vencidos.append(ident)
            if confere and bateu_no_teto:
                # o número saiu do LIMITE, não do texto: quem lê tem que saber.
                truncados.append(ident)
            pendentes.append((ident, plano, reg.get("conecta") or []))
        except (OSError, ValueError, TypeError, KeyError) as e:
            recusados.append(_cofre_recusa(f"registro {i}: {type(e).__name__}: {e}"))

    arestas, arestas_recusadas = [], []
    vistas = set()
    for origem, plano, conexoes in pendentes:
        if not isinstance(conexoes, list):
            arestas_recusadas.append(_cofre_recusa(f"{origem}: conecta não é lista"))
            continue
        for c in conexoes:
            destino = c.get("para") if isinstance(c, dict) else None
            porque = _cofre_espaco(str(c.get("porque", ""))) if isinstance(c, dict) else ""
            if destino not in ids:
                arestas_recusadas.append(_cofre_recusa(f"{origem} -> {destino}: destino não existe"))
            elif destino == origem:
                arestas_recusadas.append(_cofre_recusa(f"{origem} -> {destino}: aponta pra si mesmo"))
            elif len(porque) < 8 or porque not in plano:
                # A ligação tem que estar ESCRITA na fonte de quem liga.
                arestas_recusadas.append(_cofre_recusa(f"{origem} -> {destino}: ligação não declarada na fonte"))
            elif (origem, destino) not in vistas:
                vistas.add((origem, destino))
                # `porque` só é mascarado DEPOIS de casar com o texto cru da
                # fonte, na linha de cima: a prova precisa do original.
                arestas.append({"de": origem, "para": destino, "porque": _cofre_razao(porque)})


    # Injeção dinâmica de Nós e Arestas de Skills & Acessos no Cofre
    try:
        if skills_acessos_extras is not None:
            skills_acessos = list(skills_acessos_extras)
        elif Path(raiz_fonte).resolve() == COFRE_RAIZ_FONTE.resolve():
            ferr = ler_ferramentas(raiz=raiz_fonte)
            skills_acessos = ferr.get("skills_acessos", [])
        else:
            skills_acessos = []

        if skills_acessos:
            palavras_ignoradas = {
                "skill", "skills", "conexao", "conexoes", "acesso", "acessos",
                "sistema", "sistemas", "agente", "agentes", "runtime", "claude",
                "codex", "padrao", "padroes", "ajuda", "geral", "para", "com",
                "pelo", "pela", "onde", "quando", "como", "auto", "manual",
                "script", "scripts", "componente", "operacional", "de", "do", "da",
            }
            sinonimos_cofre = {
                "uazapi": ["whatsapp", "zap", "wpp", "whats", "bot", "mensagem", "mensagens", "conversas", "atendimento", "restaurante"],
                "whatsapp": ["whatsapp", "zap", "wpp", "uazapi", "bot", "mensagem", "conversas", "atendimento"],
                "meta_ads": ["meta", "facebook", "instagram", "face", "insta", "anuncio", "anúncio", "anuncios", "anúncios", "campanha", "campanhas", "trafego", "tráfego", "feed", "grupo"],
                "meta": ["meta", "facebook", "instagram", "anuncio", "anúncio", "campanha", "trafego", "tráfego", "feed"],
                "trafego": ["trafego", "tráfego", "campanha", "anuncio", "anúncio", "meta", "google ads", "curl"],
                "google_ads": ["google ads", "google", "adwords", "gads", "palavras-chave", "palavra-chave", "negativas", "rsa", "busca", "anuncio", "anúncio"],
                "minerador": ["minerador", "mineracao", "mineração", "google", "busca", "scraping", "extracao", "extração", "alarme", "contador"],
                "minerador_google": ["minerador", "google", "mineracao", "mineração", "busca", "scraping"],
                "apify": ["apify", "scraping", "scraper", "minerador", "mineracao", "mineração", "extrator", "curl"],
                "crm": ["crm", "hubspot", "mvpcrm", "lead", "leads", "contato", "contatos", "origem", "funil"],
                "mvpcrm": ["crm", "hubspot", "mvpcrm", "lead", "leads", "contato"],
                "hubspot": ["hubspot", "crm", "lead", "leads", "contato"],
                "portal": ["portal", "cliente", "clientes", "painel", "sac"],
                "sac": ["sac", "atendimento", "multicanal", "conversas", "omnichannel", "suporte"],
                "multicanal": ["multicanal", "sac", "atendimento", "omnichannel", "conversas"],
                "financeiro": ["financeiro", "fatura", "faturas", "cobranca", "cobrança", "pix", "asaas", "stripe", "banco", "pagamento"],
                "asaas": ["asaas", "fatura", "cobranca", "cobrança", "pix", "financeiro", "boleto"],
                "stripe": ["stripe", "cartao", "cartão", "fatura", "pagamento", "financeiro"],
                "contratos": ["contrato", "contratos", "juridico", "jurídico", "assinatura", "documento"],
                "tarefas": ["tarefa", "tarefas", "backlog", "todo", "kanban", "gestor", "demanda", "demandas", "cron"],
                "tts": ["tts", "voz", "voz sintetica", "voz sintética", "audio", "áudio", "elevenlabs", "fala"],
                "video": ["video", "vídeo", "reels", "capcut", "frame", "cover", "sete segundos", "studio", "edicao", "edição"],
                "ai_video_studio": ["video", "vídeo", "reels", "capcut", "frame", "cover", "studio"],
                "transcritor": ["transcritor", "transcricao", "transcrição", "whisper", "audio", "áudio", "degravacao", "degravação"],
                "produtor": ["produtor", "conteudo", "conteúdo", "post", "posts", "carrossel", "copy", "roteiro", "feed", "senha"],
                "produtor_conteudo": ["produtor", "conteudo", "conteúdo", "post", "posts", "carrossel", "copy", "roteiro", "feed", "senha"],
                "conteudo": ["conteudo", "conteúdo", "post", "posts", "carrossel", "copy", "roteiro", "feed", "senha"],
                "copy": ["copy", "copywriting", "texto", "legenda", "roteiro", "senha"],
                "designer": ["designer", "design", "layout", "arte", "capa", "contraste", "tag"],
                "verificador": ["verificador", "frota", "checagem", "sonda", "validador", "alerta", "verificacao", "verificação"],
                "verificar_frota": ["verificador", "frota", "checagem", "sonda", "validador"],
                "validador": ["validador", "rsa", "regras", "checagem", "teste"],
                "dev": ["dev", "codigo", "código", "commit", "engenharia", "processo", "boot", "shell"],
                "qa": ["qa", "validador", "teste", "revisor", "checagem"],
                "gestor": ["gestor", "diretiva", "ordem", "relatorio", "relatório"],
                "analista": ["analista", "analise", "análise", "credito", "crédito"],
                "social": ["social", "post", "posts", "feed", "instagram"],
                "dashboard": ["dashboard", "painel", "conversas", "metrica", "métrica", "grafico", "gráfico"],
                "painel": ["painel", "dashboard", "conversas", "boot", "tela"],
                "telegram": ["telegram", "bot", "canal", "mensageria"],
                "cal": ["calendario", "calendário", "agenda", "agendamento", "reuniao", "reunião"],
                "calendario": ["calendario", "calendário", "agenda", "agendamento", "reuniao", "reunião"],
                "drive": ["drive", "google drive", "gdrive", "pasta", "nuvem"],
                "github": ["github", "git", "commit", "repositorio", "repositório"],
                "wordpress": ["wordpress", "wp", "site", "landing page", "lp"],
                "n8n": ["n8n", "webhook", "automacao", "automação", "fluxo"],
            }
            termos_por_no = {}

            for sa in skills_acessos:
                no_skill_id = sa["id"]
                no_agente_id = f"agente-{sa['responsavel'].lower()}"
                sistema_slug = _chave(sa['sistema']).replace(' ', '-')[:30]
                no_sistema_id = f"sistema-{sistema_slug}"

                if no_skill_id not in ids:
                    ids.add(no_skill_id)
                    nos.append({
                        "id": no_skill_id,
                        "rotulo": f"Skill: {sa['nome']}",
                        "arquivo": sa["origem"],
                        "linhas": 1,
                        "modificado": sa["ultima_verificacao"],
                        "tipo": "skill",
                        "especie": "padrao",
                        "area": "operacao",
                        "familia": "ferramentas",
                        "corpo": sa["finalidade"],
                        "caso": f"Skill/Acesso de {sa['responsavel']}",
                        "autor": sa["responsavel"],
                        "quando": sa["ultima_verificacao"][:10] if sa["ultima_verificacao"] else "2026-09-20",
                        "peso": 3,
                        "vencido": False,
                        "grau": 0
                    })
                if no_agente_id not in ids:
                    ids.add(no_agente_id)
                    nos.append({
                        "id": no_agente_id,
                        "rotulo": f"Agente: {sa['responsavel']}",
                        "arquivo": f"agente/{sa['responsavel'].lower()}",
                        "linhas": 1,
                        "modificado": sa["ultima_verificacao"],
                        "tipo": "agente",
                        "especie": "padrao",
                        "area": "operacao",
                        "familia": "agentes",
                        "corpo": f"Agente responsável {sa['responsavel']}",
                        "caso": f"Responsável por skills e conexões",
                        "autor": sa["responsavel"],
                        "quando": sa["ultima_verificacao"][:10] if sa["ultima_verificacao"] else "2026-09-20",
                        "peso": 4,
                        "vencido": False,
                        "grau": 0
                    })
                if no_sistema_id not in ids:
                    ids.add(no_sistema_id)
                    nos.append({
                        "id": no_sistema_id,
                        "rotulo": f"Sistema: {sa['sistema']}",
                        "arquivo": f"sistema/{sa['sistema']}",
                        "linhas": 1,
                        "modificado": sa["ultima_verificacao"],
                        "tipo": "sistema",
                        "especie": "padrao",
                        "area": "operacao",
                        "familia": "sistemas",
                        "corpo": f"Sistema {sa['sistema']}",
                        "caso": f"Alvo de integração/skill",
                        "autor": sa["responsavel"],
                        "quando": sa["ultima_verificacao"][:10] if sa["ultima_verificacao"] else "2026-09-20",
                        "peso": 3,
                        "vencido": False,
                        "grau": 0
                    })

                # 3.a: Nós de agente/sistema não viram hub gigante:
                # Omitir aresta direta skill -> agente para evitar que agente-luana concentre 47+ arestas e puxe o leque.
                # O agente responsável permanece declarado em sa['responsavel'] e é exibido na ficha lateral ao clicar.
                graus_atuais = graus_atuais if 'graus_atuais' in locals() else {}
                if (no_agente_id, no_sistema_id) not in vistas and (no_sistema_id, no_agente_id) not in vistas:
                    if graus_atuais.get(no_agente_id, 0) < 12 and graus_atuais.get(no_sistema_id, 0) < 12:
                        vistas.add((no_agente_id, no_sistema_id))
                        arestas.append({
                            "de": no_agente_id,
                            "para": no_sistema_id,
                            "porque": f"Agente {sa['responsavel']} acessa {sa['sistema']}",
                            "ponte": False,
                        })
                        graus_atuais[no_agente_id] = graus_atuais.get(no_agente_id, 0) + 1
                        graus_atuais[no_sistema_id] = graus_atuais.get(no_sistema_id, 0) + 1

                # Extrair termos para busca nos aprendizados, incluindo sinônimos declarados
                candidatos = []
                nome_limpo = re.sub(r"^(?:skill|conexão|conexao)\s+", "", sa.get("nome", ""), flags=re.I).strip()
                if nome_limpo:
                    candidatos.append(nome_limpo)
                    candidatos.extend(nome_limpo.split())
                slug = sa["id"].split("-", 2)[-1] if "-" in sa["id"] else sa["id"]
                if slug:
                    candidatos.append(slug)
                    candidatos.extend(slug.replace("_", "-").split("-"))

                # Consulta da tabela de sinônimos/apelidos para a skill
                for chave_candidata in [slug, slug.replace("-", "_"), slug.replace("_", "-")]:
                    if chave_candidata in sinonimos_cofre:
                        candidatos.extend(sinonimos_cofre[chave_candidata])
                for chave_sin, sin_termos in sinonimos_cofre.items():
                    if chave_sin in slug:
                        candidatos.extend(sin_termos)

                termos_validos = {
                    c.lower() for c in candidatos
                    if len(c) >= 3 and c.lower() not in palavras_ignoradas
                }
                if termos_validos:
                    termos_por_no[no_skill_id] = termos_por_no.get(no_skill_id, set()) | termos_validos

                # Termos exclusivos do sistema (evita que o sistema herde termos de todas as skills que o usam)
                candidatos_sistema = []
                if sa.get("sistema"):
                    sis_cru = sa["sistema"].strip()
                    candidatos_sistema.append(sis_cru)
                    candidatos_sistema.extend(sis_cru.split())
                    sis_slug = _chave(sis_cru).replace(" ", "_")
                    if sis_slug in sinonimos_cofre:
                        candidatos_sistema.extend(sinonimos_cofre[sis_slug])
                    for chave_sin, sin_termos in sinonimos_cofre.items():
                        if chave_sin in sis_slug:
                            candidatos_sistema.extend(sin_termos)

                termos_sistema = {
                    c.lower() for c in candidatos_sistema
                    if len(c) >= 3 and c.lower() not in palavras_ignoradas
                }
                if termos_sistema:
                    termos_por_no[no_sistema_id] = termos_por_no.get(no_sistema_id, set()) | termos_sistema

            def _desacentuar(txt: str) -> str:
                nfkd = unicodedata.normalize("NFKD", txt)
                return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()

            # Conectar aprendizados existentes aos nós de skill/sistema que eles citam
            # Teto de segurança: nenhum nó pode ter mais de 20 arestas
            MAX_ARESTAS_POR_NO = 20
            aprendizados = [n for n in nos if n.get("area") != "operacao"]
            for apr in aprendizados:
                texto_apr_original = f"{apr.get('rotulo', '')} {apr.get('corpo', '')} {apr.get('caso', '')} {apr.get('id', '')}".lower()
                texto_apr_sem_acento = _desacentuar(texto_apr_original)
                for no_destino, termos in termos_por_no.items():
                    if apr["id"] == no_destino:
                        continue
                    if graus_atuais.get(apr["id"], 0) >= MAX_ARESTAS_POR_NO or graus_atuais.get(no_destino, 0) >= MAX_ARESTAS_POR_NO:
                        continue
                    casou = False
                    for t in termos:
                        t_orig = t.lower()
                        t_sem = _desacentuar(t)
                        if re.search(rf"\b{re.escape(t_orig)}\b", texto_apr_original):
                            casou = True
                            break
                        if re.search(rf"\b{re.escape(t_sem)}\b", texto_apr_sem_acento):
                            casou = True
                            break
                    if casou:
                        par = (apr["id"], no_destino)
                        inverso = (no_destino, apr["id"])
                        if par not in vistas and inverso not in vistas:
                            vistas.add(par)
                            rotulo_alvo = next((n["rotulo"] for n in nos if n["id"] == no_destino), no_destino)
                            arestas.append({
                                "de": apr["id"],
                                "para": no_destino,
                                "porque": f"Aprendizado cita {rotulo_alvo}",
                                "ponte": apr.get("area") != "operacao",
                            })
                            graus_atuais[apr["id"]] = graus_atuais.get(apr["id"], 0) + 1
                            graus_atuais[no_destino] = graus_atuais.get(no_destino, 0) + 1
    except Exception:
        pass

    # A PONTE: aresta que sai de uma área e cai em outra. Atualizado com todos os nós.
    area_de = {n["id"]: n.get("area") for n in nos}
    for a in arestas:
        a["ponte"] = area_de.get(a["de"]) != area_de.get(a["para"])

    # Grau para o tamanho do nó e para a lista lateral ordenada.
    grau = {n["id"]: 0 for n in nos}
    for a in arestas:
        if a["de"] in grau:
            grau[a["de"]] += 1
        if a["para"] in grau:
            grau[a["para"]] += 1
    for n in nos:
        n["grau"] = grau.get(n["id"], 0)

    # Cobertura: aprendizados e nós amarrados a algum outro na rede.
    ligados = {i for i, g in grau.items() if g}
    cobertura = round(len(ligados) / len(nos) * 100, 1) if nos else None

    avisos = []

    def _agrupar(campo, catalogo):
        contagem = {}
        for n in nos:
            contagem[n[campo]] = contagem.get(n[campo], 0) + 1
        saida = []
        for chave, total in sorted(contagem.items(), key=lambda kv: (-kv[1], kv[0])):
            item = catalogo.get(chave)
            if item is None:
                eixo = "área" if campo == "area" else "família"
                item = {"id": chave, "nome": f"{eixo.capitalize()} não catalogada ({chave})",
                        "fallback": True}
                avisos.append(_cofre_recusa(f"{eixo} {chave!r} não está no catálogo; exibida em fallback"))
                catalogo[chave] = item
            saida.append({**item, "total": total})
        return saida

    return {
        "erro": None,
        "arquivo": "painel_os/data/cofre.json",
        "nos": nos,
        "arestas": arestas,
        "arquivos": len({n["arquivo"].split(":")[0].split(" em ")[-1] for n in nos}) or None,
        "conexoes": len(arestas),
        "cobertura": cobertura,
        "areas": _agrupar("area", areas),
        "familias": _agrupar("familia", familias),
        "grau_medio": round(2 * len(arestas) / len(nos), 1) if nos else None,
        "vencidos": vencidos,
        "truncados": truncados,
        "recusados": recusados,
        "arestas_recusadas": arestas_recusadas,
        "avisos": avisos,
    }


# Catálogo deliberadamente declarativo. Cada texto abaixo resume uma instrução
# explícita no playbook indicado. O coletor NÃO tenta transformar prosa livre em
# workflow: um parser "inteligente" acabaria inventando gatilhos e autonomia.
SOPS_DECLARADOS = [
    # O diretório é `conteudo`, mas o manifesto do playbook foi renomeado para
    # `orquestrar-conteudo-anuncios`. O catálogo público mantém o id curto;
    # fonte e identidade são conferidas separadamente contra o disco.
    {"id": "conteudo", "pasta": "conteudo", "manifesto": "orquestrar-conteudo-anuncios", "nome": "Produção de conteúdo", "objetivo": "Produzir e publicar conteúdo orgânico a partir de um brief", "gatilho": "Pedido de post, carrossel, reel, vídeo, legenda, publicação ou agendamento", "agentes": ["suri-estrategista", "theo-criador", "guardiao", "analista"], "ferramentas": ["Produtor de conteúdo"], "entradas": ["brief aprovado", "manual de tom e visual"], "saidas": ["peça produzida", "peça validada", "publicação ou agendamento autorizado"], "frequencia": None, "autonomia": "publicação exige ordem explícita do Gastão", "conexao": None, "memorias": ["MEMORY.md"]},
    {"id": "curso", "nome": "Conteúdo do curso", "objetivo": "Produzir conteúdo de topo de funil do curso a partir das fontes vigentes", "gatilho": "Pedido sobre curso, tela preta, IA para iniciantes ou conteúdo de topo", "agentes": ["suri-estrategista", "theo-criador", "cleo-produtor", "dani-designer", "guardiao"], "ferramentas": ["Produtor de conteúdo"], "entradas": ["tema ou pedido do produtor", "oferta e currículo vigentes", "especificação visual"], "saidas": ["peça conferida para Instagram e LinkedIn"], "frequencia": None, "autonomia": "publicação exige ordem explícita do Gastão", "conexao": "curso.md", "memorias": ["MEMORY.md"]},
    {"id": "trafego", "nome": "Gestão de tráfego", "objetivo": "Diagnosticar e operar campanhas do Meta Ads na conta isolada correta", "gatilho": "Pedido sobre campanha, anúncio, verba, público ou desempenho de mídia", "agentes": ["gestor", "analista"], "ferramentas": ["Meta Ads"], "entradas": ["conta autorizada", "período e objetivo da análise"], "saidas": ["diagnóstico de mídia", "alteração conferida quando autorizada"], "frequencia": None, "autonomia": "alterar verba ou pausar exige confirmação do Gastão", "conexao": "trafego.md", "memorias": ["MEMORY.md"]},
    {"id": "dashboard", "nome": "Métricas da agência", "objetivo": "Consultar métricas e vendas na organização correta", "gatilho": "Pedido de número de campanha, ROAS, CPA, vendas, leads ou situação de cliente", "agentes": [], "ferramentas": ["Dashboard da agência", "Meta Ads", "Google Ads"], "entradas": ["organização descoberta pela API", "período e métrica"], "saidas": ["métricas calculadas na moeda da organização"], "frequencia": "sincronização automática às 8h, 12h e 20h de São Paulo", "autonomia": "consulta livre; sincronização forçada somente quando a atualização imediata for necessária", "conexao": "dashboard.md", "memorias": []},
    {"id": "doctor", "nome": "Diagnóstico do agente", "objetivo": "Conferir a estrutura e diagnosticar a memória do agente pessoal", "gatilho": "Comando de diagnóstico ou relato de agente estranho, lento, mudo ou esquecendo informações", "agentes": [], "ferramentas": ["Arquivos do agente"], "entradas": ["sintoma relatado", "pasta do agente"], "saidas": ["checklist de saúde", "diagnóstico de memória", "relatório técnico sanitizado"], "frequencia": None, "autonomia": "alteração ou exclusão de memória exige aprovação do dono", "conexao": None, "memorias": []},
    {"id": "minerador-google", "nome": "Mineração de leads", "objetivo": "Minerar e acompanhar leads de Google Maps por campanha isolada", "gatilho": "Pedido de prospecção, empresas por nicho ou cidade, ou consulta dos leads minerados", "agentes": [], "ferramentas": ["Minerador do Google"], "entradas": ["nicho ou termo", "cidade ou região", "quantidade desejada"], "saidas": ["mineração iniciada", "resultado conferido após conclusão"], "frequencia": None, "autonomia": "mineração e disparo somente quando pedidos; execução assíncrona acompanhada até o resultado", "conexao": "minerador.md", "memorias": ["MEMORY.md"]},
    {"id": "tarefas", "nome": "Gestão de tarefas", "objetivo": "Consultar, criar e concluir tarefas no gerenciador GTD", "gatilho": "Pedido sobre pendências, tarefas de hoje, captura, prioridade, prazo ou conclusão", "agentes": [], "ferramentas": ["Gerenciador de tarefas"], "entradas": ["descrição da tarefa", "projeto obrigatório para criação"], "saidas": ["resumo agrupado", "tarefa registrada ou concluída"], "frequencia": None, "autonomia": "não registrar quando a API ou a credencial estiver indisponível", "conexao": "tarefas.md", "memorias": []},
    {"id": "planejador", "nome": "Planejamento semanal", "objetivo": "Consultar e atualizar o planejamento e o calendário de conteúdo", "gatilho": "Pedido sobre planejamento, semana, missões, checklist ou marcação de publicação", "agentes": [], "ferramentas": ["Planejador"], "entradas": ["planejamento vigente", "item a atualizar quando solicitado"], "saidas": ["semana resumida", "marcação sincronizada"], "frequencia": None, "autonomia": "marcar como publicado exige confirmação do Gastão", "conexao": "planejador.md", "memorias": []},
    {"id": "financeiro", "nome": "Operação financeira", "objetivo": "Consultar e operar dados financeiros sem fabricar valores", "gatilho": "Pedido sobre saldo, fluxo, cobrança, lançamento, cliente, contrato ou fatura", "agentes": [], "ferramentas": ["Financeiro"], "entradas": ["entidade e operação financeira solicitadas", "dados exigidos pela API"], "saidas": ["consulta financeira", "mutação registrada quando autorizada"], "frequencia": None, "autonomia": "consulta livre; qualquer mutação exige pedido explícito ou confirmação do Gastão", "conexao": "financeiro.md", "memorias": []},
    {"id": "contratos", "nome": "Gestão de contratos", "objetivo": "Cadastrar, gerar, revisar e acompanhar contratos sem duplicar registros", "gatilho": "Pedido para gerar contrato, cadastrar cliente, revisar, assinar ou consultar status", "agentes": ["lex"], "ferramentas": ["Gestor de contratos", "Autentique"], "entradas": ["cliente", "serviço e template", "signatários quando aplicável"], "saidas": ["contrato atualizado", "revisão jurídica", "envio para assinatura"], "frequencia": None, "autonomia": "geração, revisão paga e assinatura exigem pedido explícito ou confirmação do Gastão", "conexao": "contratos.md", "memorias": []},
    {"id": "gerador-proposta", "nome": "Geração de proposta", "objetivo": "Transformar briefing comercial em proposta PDF conferida", "gatilho": "Pedido de proposta comercial, orçamento formal ou PDF de escopo", "agentes": [], "ferramentas": ["Gerador de PDF"], "entradas": ["briefing comercial completo", "diretrizes e identidade da empresa"], "saidas": ["HTML autocontido", "PDF conferido visualmente"], "frequencia": None, "autonomia": "conflito com diretriz exige decisão do Gastão", "conexao": None, "memorias": []},
    {"id": "video", "nome": "Edição e geração de vídeo", "objetivo": "Editar gravações ou gerar reels e conferir o resultado real", "gatilho": "Pedido de edição, cortes, legenda, reenquadramento, remoção de fundo ou reel animado", "agentes": ["video-editor", "video-validator"], "ferramentas": ["AI Video Studio", "Produtor de conteúdo"], "entradas": ["vídeo ou briefing", "especificação das zonas seguras"], "saidas": ["vídeo validado", "capa conferida quando houver publicação"], "frequencia": None, "autonomia": "um render por vez; publicação exige ordem explícita do Gastão", "conexao": "video.md", "memorias": []},
]


def ler_sops(agentes=None, pasta_skills: Path = SKILLS_RAIZ,
             pasta_conexoes: Path = CONEXOES_RAIZ, pasta_memoria: Path = MEMORIA_RAIZ):
    """Materializa somente workflows declarados e relações comprováveis."""
    vazio = {"status": "erro", "erro": None, "total": None, "itens": [], "arestas": []}
    agentes_ids = {a.get("id") for a in (agentes or descobrir_agentes())}
    agentes_ids.update({item["id"] for item in SESSAO})
    itens, arestas = [], []
    try:
        for d in SOPS_DECLARADOS:
            pasta_skill = d.get("pasta", d["id"])
            fonte_skill = f"skill:{pasta_skill}/SKILL.md"
            skill = pasta_skills / pasta_skill / "SKILL.md"
            if not skill.is_file():
                raise ValueError(f"playbook ausente: {d['id']}")
            # Referências Markdown do pacote fazem parte do playbook. O
            # manifesto raiz aponta para elas, e ignorá-las tornava agentes
            # reais invisíveis ao catálogo.
            fontes_skill = [skill] + sorted(
                (p for p in skill.parent.rglob("*.md") if p != skill),
                key=lambda p: str(p),
            )
            texto_skill = "\n".join(p.read_text(encoding="utf-8", errors="strict") for p in fontes_skill)
            frontmatter, _ = ler_frontmatter(skill)
            if frontmatter.get("name") != d.get("manifesto", d["id"]):
                raise ValueError(f"identidade do playbook divergente: {d['id']}")
            conexao = d["conexao"]
            if conexao and not (pasta_conexoes / conexao).is_file():
                raise ValueError(f"conexão ausente: {d['id']}")
            if conexao and conexao not in texto_skill:
                raise ValueError(f"conexão sem citação no playbook: {d['id']}")
            faltantes = [a for a in d["agentes"] if a not in agentes_ids]
            if faltantes:
                raise ValueError(f"agente citado não existe: {d['id']}")
            texto_skill_busca = "".join(
                c for c in unicodedata.normalize("NFKD", texto_skill.casefold())
                if not unicodedata.combining(c)
            )
            def citado(agente):
                aliases = (agente, agente.split("-", 1)[0], agente.replace("-", " "))
                return any(alias in texto_skill_busca for alias in aliases)
            if any(not citado(a) for a in d["agentes"]):
                raise ValueError(f"agente sem citação no playbook: {d['id']}")
            memorias = [m for m in d["memorias"] if (pasta_memoria / m).is_file()]
            if len(memorias) != len(d["memorias"]):
                raise ValueError(f"memória citada ausente: {d['id']}")
            for memoria in memorias:
                texto_memoria = (pasta_memoria / memoria).read_text(encoding="utf-8", errors="strict")
                marcador = pasta_skill.removesuffix("-google")
                memoria_normalizada = "".join(c for c in unicodedata.normalize("NFKD", texto_memoria.casefold()) if not unicodedata.combining(c))
                if marcador not in memoria_normalizada:
                    raise ValueError(f"memória sem referência ao SOP: {d['id']}")
            item = {k: d[k] for k in ("id", "nome", "objetivo", "gatilho", "agentes", "ferramentas", "entradas", "saidas", "frequencia", "autonomia")}
            item["responsavel"] = "luana"
            item["fontes"] = [fonte_skill] + ([f"conexao:{conexao}"] if conexao else [])
            itens.append(item)
            for memoria in memorias:
                arestas.append({"de": f"memoria:{memoria}", "para": f"sop:{d['id']}", "tipo": "fundamenta", "evidencia": f"memoria:{memoria}"})
            arestas.append({"de": f"sop:{d['id']}", "para": "agente:luana", "tipo": "responsável", "evidencia": fonte_skill})
            for agente in d["agentes"]:
                arestas.append({"de": f"sop:{d['id']}", "para": f"agente:{agente}", "tipo": "executa", "evidencia": fonte_skill})
            for ferramenta in d["ferramentas"]:
                arestas.append({"de": f"sop:{d['id']}", "para": f"ferramenta:{ferramenta}", "tipo": "usa", "evidencia": fonte_skill})
        return {"status": "pronto", "erro": None, "total": len(itens), "itens": itens, "arestas": arestas}
    except (OSError, ValueError, TypeError) as exc:
        return {**vazio, "erro": f"catálogo de SOPs indisponível ({type(exc).__name__}); nenhuma relação publicada"}


NOMES_FERRAMENTAS = {
    "21st": "21st Design", "google-ads": "Google Ads", "telegram": "Telegram",
    "codex-apps": "Runtime de apps",
    "deep-research-work": "Pesquisa aprofundada", "google-calendar": "Google Calendar",
    "google-drive": "Google Drive", "openai-templates": "Templates OpenAI",
    "plugin-management": "Gestão de plugins", "vercel": "Vercel",
}


def _slug_publico(nome: str) -> str | None:
    slug = nome.split("@", 1)[0].strip().casefold().replace("_", "-")
    return slug if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", slug) else None


def _nome_ferramenta(slug: str) -> str:
    return NOMES_FERRAMENTAS.get(slug, " ".join(p.capitalize() for p in slug.split("-")))


def _mcp_utilizavel(configuracao: dict) -> bool:
    url = configuracao.get("url")
    if isinstance(url, str) and re.match(r"^https?://", url):
        return True
    comando = configuracao.get("command")
    if not isinstance(comando, str) or not comando:
        return False
    executavel = Path(comando).is_file() if comando.startswith("/") else shutil.which(comando) is not None
    if not executavel:
        return False
    argumentos = configuracao.get("args", [])
    if argumentos is not None and not isinstance(argumentos, list):
        return False
    return all(not isinstance(x, str) or not x.startswith("/") or Path(x).exists() for x in (argumentos or []))


def _env_configurado(caminho: Path, chaves: tuple[str, ...]) -> bool:
    """Confere presença e permissão sem devolver nome nem valor ao estado."""
    try:
        if stat_mod.S_IMODE(caminho.stat().st_mode) & 0o077:
            return False
        encontrados = {}
        for linha in caminho.read_text(encoding="utf-8", errors="strict").splitlines():
            m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", linha)
            if m:
                encontrados[m.group(1)] = m.group(2).strip().strip("'\"")
        return all(encontrados.get(chave) for chave in chaves)
    except OSError:
        return False


def ler_ferramentas(configs_codex=CONFIGS_CODEX, configs_claude=CONFIGS_CLAUDE,
                     mcp_runtime_tools: Path = MCP_RUNTIME_TOOLS,
                     plugins_codex: Path = PLUGINS_CODEX,
                     plugins_claude: Path = PLUGINS_CLAUDE, raiz: Path = RAIZ):
    """Inventário da operação, normalizado por capacidade e não por LLM.

    Configurações Codex/Claude são apenas adaptadores. O catálogo também mede
    APIs diretas e componentes locais. Nenhum comando, URL, caminho ou valor de
    credencial atravessa a fronteira pública.
    """
    itens, erros = [], []
    mcps = {}

    def registrar_mcp(nome, configuracao, proveniencia, utilizavel=None):
        slug = _slug_publico(nome) if isinstance(nome, str) else None
        if slug is None or not isinstance(configuracao, dict):
            return
        item = mcps.setdefault(slug, {"validos": 0, "proveniencias": []})
        item["validos"] += int(_mcp_utilizavel(configuracao) if utilizavel is None else utilizavel)
        item["proveniencias"].append(proveniencia)

    for caminho in configs_codex:
        caminho = Path(caminho)
        if not caminho.is_file():
            continue
        try:
            bruto = tomllib.loads(caminho.read_text(encoding="utf-8", errors="strict"))
            servidores = bruto.get("mcp_servers", {})
            if not isinstance(servidores, dict):
                raise ValueError("mcp_servers não é objeto")
            for nome, configuracao in servidores.items():
                registrar_mcp(nome, configuracao, "adaptador Codex")
        except (OSError, ValueError, tomllib.TOMLDecodeError) as exc:
            erros.append(f"adaptador Codex ilegível ({type(exc).__name__})")

    for caminho in configs_claude:
        caminho = Path(caminho)
        if not caminho.is_file():
            continue
        try:
            bruto = json.loads(caminho.read_text(encoding="utf-8", errors="strict"))
            servidores = bruto.get("mcpServers", {}) if isinstance(bruto, dict) else None
            if not isinstance(servidores, dict):
                raise ValueError("mcpServers não é objeto")
            for nome, configuracao in servidores.items():
                registrar_mcp(nome, configuracao, "adaptador Claude")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            erros.append(f"adaptador Claude ilegível ({type(exc).__name__})")

    # Apps conectados entram no Codex por um servidor que o runtime publica em
    # seu catálogo de ferramentas, não no config.toml. O cache é a fonte local
    # canônica desse namespace. Descobrir o ``server_name`` aqui evita congelar
    # a quarta MCP em uma lista e também faz uma nova entrar sem alterar código.
    pasta_runtime = Path(mcp_runtime_tools)
    if pasta_runtime.is_dir():
        for caminho in sorted(pasta_runtime.glob("*.json")):
            try:
                bruto = json.loads(caminho.read_text(encoding="utf-8", errors="strict"))
                ferramentas_runtime = bruto.get("tools") if isinstance(bruto, dict) else None
                versao_runtime = bruto.get("schema_version") if isinstance(bruto, dict) else None
                if type(versao_runtime) is not int or versao_runtime < 1 or not isinstance(ferramentas_runtime, list):
                    raise ValueError("contrato do catálogo do runtime inválido")
                servidores = {
                    item.get("server_name")
                    for item in ferramentas_runtime
                    if isinstance(item, dict)
                    and isinstance(item.get("server_name"), str)
                    and item.get("server_name")
                    and isinstance(item.get("tool_name"), str)
                    and item.get("tool_name")
                }
                if ferramentas_runtime and not servidores:
                    raise ValueError("catálogo do runtime sem namespace")
                for servidor in servidores:
                    registrar_mcp(servidor, {}, "catálogo do runtime", utilizavel=True)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                erros.append(f"catálogo do runtime ilegível ({type(exc).__name__})")

    for slug, medicao in sorted(mcps.items()):
        total = len(medicao["proveniencias"])
        validos = medicao["validos"]
        itens.append({
            "id": f"mcp-{slug}", "nome": _nome_ferramenta(slug), "tipo": "MCP",
            "estado": "disponível" if validos else "ausente",
            "evidencia": f"{validos} de {total} adaptador(es) com configuração utilizável",
            "fallback": None, "proveniencias": sorted(set(medicao["proveniencias"])),
        })

    apps = {}
    if Path(plugins_codex).is_dir():
        for recibo in sorted(Path(plugins_codex).glob("*/.codex-remote-plugin-install.json")):
            slug = _slug_publico(recibo.parent.name)
            if slug:
                apps.setdefault(slug, set()).add("recibo Codex")
    if Path(plugins_claude).is_file():
        try:
            bruto = json.loads(Path(plugins_claude).read_text(encoding="utf-8", errors="strict"))
            instalados = bruto.get("plugins", {}) if isinstance(bruto, dict) else {}
            if not isinstance(instalados, dict):
                raise ValueError("plugins não é objeto")
            for nome, recibos in instalados.items():
                slug = _slug_publico(nome)
                if slug and isinstance(recibos, list) and recibos:
                    apps.setdefault(slug, set()).add("recibo Claude")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            erros.append(f"recibos Claude ilegíveis ({type(exc).__name__})")

    # Drive é dependência operacional explícita de Chamadas. Ausente precisa
    # aparecer; apps só recomendados e nunca usados não inflam o inventário.
    apps.setdefault("google-drive", set())
    for slug, proveniencias in sorted(apps.items()):
        instalado = bool(proveniencias)
        itens.append({
            "id": f"app-{slug}", "nome": _nome_ferramenta(slug), "tipo": "App",
            "estado": "disponível" if instalado else "ausente",
            "evidencia": "recibo de instalação local presente" if instalado else "dependência operacional sem recibo de instalação",
            "fallback": None, "proveniencias": sorted(proveniencias) or ["dependência da operação"],
        })

    integracoes = [
        ("apify", "Apify", "apify.md", ".env.apify", ("APIFY_TOKEN",), None),
        ("audio", "Transcrição local", "audio.md", None, (), Path("/opt/transcrever")),
        ("contratos", "Gestor de contratos", "contratos.md", ".env.contratos", ("CONTRATOS_API_KEY", "CONTRATOS_BASE_URL"), None),
        ("crm", "CRM", "crm.md", ".env.crm", ("MVPCRM_CLIENT_ID", "MVPCRM_CLIENT_SECRET"), None),
        ("dashboard", "Dashboard da agência", "dashboard.md", ".env.dashboard", ("LUANA_DASHBOARD_API_KEY",), None),
        ("financeiro", "Financeiro", "financeiro.md", ".env.secrets", ("AGENT_API_KEY",), None),
        ("minerador", "Minerador do Google", "minerador.md", ".env.minerador", ("LUANA_API_TOKEN",), raiz / "luana/minerador"),
        ("portal", "Portal de clientes", "portal.md", ".env.portal", ("PORTAL_CLIENT_ID", "PORTAL_CLIENT_SECRET"), None),
        ("tarefas", "Gerenciador de tarefas", "tarefas.md", ".env.tarefas", ("GESTOR_TAREFAS_API_KEY",), None),
        ("tts", "Voz sintética", "video.md", ".gcp-tts-credentials.json", (), raiz / "luana/conexoes/tts_wrapper.py"),
    ]
    for id_, nome, doc, env, chaves, componente in integracoes:
        doc_ok = (raiz / f"luana/conexoes/{doc}").is_file()
        env_ok = True if env is None else (_env_configurado(raiz / f"luana/{env}", chaves) if chaves else (raiz / f"luana/{env}").is_file())
        componente_ok = componente is None or Path(componente).exists()
        ok = doc_ok and env_ok and componente_ok
        itens.append({
            "id": f"integracao-{id_}", "nome": nome, "tipo": "Integração",
            "estado": "disponível" if ok else "ausente",
            "evidencia": "manual, configuração protegida e componente exigido presentes" if ok else "falta manual, configuração protegida ou componente exigido",
            "fallback": None, "proveniencias": [f"conexao:{doc}", "configuração operacional"],
        })

    meta_fallback = (raiz / "luana/conexoes/trafego.md").is_file() and (raiz / "agent_campanhas_meta").is_dir()
    itens.append({
        "id": "integracao-meta", "nome": "Meta Ads", "tipo": "Integração",
        "estado": "fallback" if meta_fallback else "ausente",
        "evidencia": "cliente direto documentado, sem conector canônico ativo" if meta_fallback else "conector e alternativa local indisponíveis",
        "fallback": "API direta com cobertura parcial" if meta_fallback else None,
        "proveniencias": ["conexao:trafego.md", "componente operacional"],
    })

    scripts = [
        ("verificador", "Verificador da frota", raiz / "luana/verificar_frota.py"),
        ("coletor", "Coletor do painel", raiz / "luana/painel_os/coletor/coletar_estado.py"),
        ("transcritor", "Transcritor remoto", raiz / "luana/transcritor/transcritor_remoto.py"),
        ("produtor", "Produtor de conteúdo", raiz / "produtor_conteudo"),
        ("video", "AI Video Studio", raiz / "Ferramentas/ai-video-studio"),
    ]
    for id_, nome, caminho in scripts:
        ok = caminho.exists()
        itens.append({
            "id": f"script-{id_}", "nome": nome, "tipo": "Script",
            "estado": "disponível" if ok else "ausente",
            "evidencia": "componente operacional presente" if ok else "componente esperado não encontrado",
            "fallback": None, "proveniencias": ["componente operacional"],
        })

    # Dynamic scan of skills and access connections for Luana and Renato
    skills_acessos = []
    fontes_skills = [
        ("Luana", RAIZ / "luana/.claude/skills", RAIZ / "luana/conexoes"),
        ("Renato", RAIZ / "renato/.claude/skills", RAIZ / "renato/conexoes"),
    ]
    for resp, pasta_skills, pasta_conexoes in fontes_skills:
        if pasta_skills.is_dir():
            for p in sorted(pasta_skills.glob("*/SKILL.md")):
                try:
                    fm, corpo = ler_frontmatter(p)
                    nome = (fm.get("name") if fm else None) or p.parent.name
                    desc = (fm.get("description") if fm else None) or "skill registrada em SKILL.md"
                    st = p.stat()
                    mod = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
                    skills_acessos.append({
                        "id": f"skill-{resp.lower()}-{p.parent.name}",
                        "nome": nome,
                        "tipo": "Skill",
                        "responsavel": resp,
                        "sistema": "Claude / Agent Runtime",
                        "finalidade": desc[:160],
                        "origem": str(p.relative_to(RAIZ)),
                        "estado": "disponível",
                        "ultima_verificacao": mod
                    })
                except Exception:
                    pass

        if pasta_conexoes.is_dir():
            for p in sorted(pasta_conexoes.glob("*.md")):
                try:
                    st = p.stat()
                    mod = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
                    nome = p.stem.replace("_", " ").title()
                    skills_acessos.append({
                        "id": f"conexao-{resp.lower()}-{p.stem}",
                        "nome": f"Conexão {nome}",
                        "tipo": "Acesso",
                        "responsavel": resp,
                        "sistema": nome,
                        "finalidade": f"Manual e integração de conexão {p.name}",
                        "origem": str(p.relative_to(RAIZ)),
                        "estado": "disponível",
                        "ultima_verificacao": mod
                    })
                except Exception:
                    pass

    for sa in skills_acessos:
        itens.append({
            "id": sa["id"],
            "nome": f"{sa['responsavel']}: {sa['nome']}",
            "tipo": sa["tipo"],
            "estado": sa["estado"],
            "evidencia": f"{sa['sistema']} · {sa['finalidade']}",
            "fallback": None,
            "proveniencias": [sa["origem"]],
            "responsavel": sa["responsavel"],
            "sistema": sa["sistema"],
            "finalidade": sa["finalidade"],
            "ultima_verificacao": sa["ultima_verificacao"]
        })

    itens.sort(key=lambda x: (("MCP", "App", "Integração", "Script", "Skill", "Acesso").index(x["tipo"]) if x["tipo"] in ("MCP", "App", "Integração", "Script", "Skill", "Acesso") else 99, x["nome"].casefold()))
    contagem = {estado: sum(1 for i in itens if i["estado"] == estado) for estado in ("disponível", "fallback", "ausente")}
    por_tipo = {tipo: sum(1 for i in itens if i["tipo"] == tipo) for tipo in ("MCP", "App", "Integração", "Script", "Skill", "Acesso")}
    return {"erro": "; ".join(sorted(set(erros))) or None, "itens": itens, "contagem": contagem, "por_tipo": por_tipo, "medidos": len(itens), "skills_acessos": skills_acessos}


CACHE_USO_PLANOS = PAINEL_OS_DIR / "data" / "cache_uso_planos.json"
CACHE_FINANCEIRO = PAINEL_OS_DIR / "data" / "cache_financeiro.json"
CACHE_REDES = PAINEL_OS_DIR / "data" / "cache_redes.json"
CACHE_ANALYTICS = PAINEL_OS_DIR / "data" / "cache_analytics.json"
CACHE_LINKEDIN_APIFY = PAINEL_OS_DIR / "data" / "cache_linkedin_apify.json"
BLOQUEIO_LINKEDIN_APIFY = PAINEL_OS_DIR / "data" / "linkedin_apify_bloqueado.json"


def ler_uso_planos_codex(buscar=None, pastas_sessoes=None):
    """Lê metadados de limite do Codex (.jsonl em .codex-*/sessions).

    Regra de privacidade: NUNCA lê nem repassa account_id, tokens de auth ou segredos.
    Apenas extrai rate_limits.primary / secondary, plano e contagem de tokens.
    """
    diretores = ["luana", "renato", "bia"]
    vazio_codex = {
        "primario_percentual": None,
        "primario_janela_dias": None,
        "primario_reset": None,
        "secundario_percentual": None,
        "secundario_reset": None,
        "has_credits": None,
        "plano": None,
        "conta_compartilhada": True,
        "tokens_24h_estimativa": None,
        "por_diretor": [{"diretor": d, "tokens_24h": None} for d in diretores],
    }

    if buscar is not None:
        try:
            bruto = buscar()
            if isinstance(bruto, dict):
                return bruto
        except Exception:
            return vazio_codex

    if pastas_sessoes is None:
        pastas_sessoes = [Path.home() / f".codex-{d}/sessions" for d in diretores]

    ultimo_token_count = None
    ultimo_mtime_rate_limits = None
    tokens_24h_map = {d: None for d in diretores}
    agora = agora_utc()
    limite_24h = agora - timedelta(hours=24)

    for idx, d_nome in enumerate(diretores):
        pasta = pastas_sessoes[idx] if idx < len(pastas_sessoes) else Path.home() / f".codex-{d_nome}/sessions"
        if not isinstance(pasta, Path):
            pasta = Path(pasta)
        if not pasta.is_dir():
            continue

        arquivos = sorted(pasta.rglob("*.jsonl"))
        soma_dir = 0
        teve_arquivo = False

        for arq in arquivos:
            try:
                st = arq.stat()
                mtime_dt = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
            except OSError:
                continue

            teve_arquivo = True
            try:
                size = st.st_size
                with arq.open("r", encoding="utf-8", errors="replace") as fh:
                    if size > 65536:
                        fh.seek(size - 65536)
                        fh.readline()
                    linhas = [l.strip() for l in fh if l.strip()]
            except OSError:
                continue

            for lin in reversed(linhas):
                try:
                    obj = json.loads(lin)
                    if not isinstance(obj, dict):
                        continue
                    payload = obj.get("payload") if isinstance(obj.get("payload"), dict) else {}
                    t_count = None
                    if obj.get("type") == "event_msg" and payload.get("type") == "token_count":
                        t_count = payload
                    elif obj.get("type") == "token_count":
                        t_count = payload if payload else obj
                    elif isinstance(obj.get("rate_limits"), dict):
                        t_count = obj
                    elif isinstance(payload.get("rate_limits"), dict):
                        t_count = payload

                    if t_count and isinstance(t_count.get("rate_limits"), dict):
                        if (ultimo_mtime_rate_limits is None) or (mtime_dt > ultimo_mtime_rate_limits):
                            ultimo_mtime_rate_limits = mtime_dt
                            ultimo_token_count = t_count

                    if mtime_dt >= limite_24h:
                        toks = None
                        if isinstance(t_count, dict):
                            info = t_count.get("info") if isinstance(t_count.get("info"), dict) else {}
                            ttu = info.get("total_token_usage") if isinstance(info.get("total_token_usage"), dict) else (
                                t_count.get("total_token_usage") if isinstance(t_count.get("total_token_usage"), dict) else {}
                            )
                            if isinstance(ttu, dict) and "total_tokens" in ttu and isinstance(ttu["total_tokens"], (int, float)):
                                toks = int(ttu["total_tokens"])
                            elif "tokens" in t_count and isinstance(t_count["tokens"], (int, float)):
                                toks = int(t_count["tokens"])

                        if toks is None and isinstance(payload, dict):
                            info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
                            ttu = info.get("total_token_usage") if isinstance(info.get("total_token_usage"), dict) else {}
                            if isinstance(ttu, dict) and "total_tokens" in ttu and isinstance(ttu["total_tokens"], (int, float)):
                                toks = int(ttu["total_tokens"])

                        if toks is None and "tokens" in obj and isinstance(obj["tokens"], (int, float)):
                            toks = int(obj["tokens"])

                        if toks is not None:
                            soma_dir += toks
                except Exception:
                    continue

        if teve_arquivo:
            tokens_24h_map[d_nome] = soma_dir

    if not ultimo_token_count or not isinstance(ultimo_token_count.get("rate_limits"), dict):
        return {
            **vazio_codex,
            "por_diretor": [{"diretor": d, "tokens_24h": tokens_24h_map[d]} for d in diretores],
            "tokens_24h_estimativa": sum(v for v in tokens_24h_map.values() if v is not None) if any(v is not None for v in tokens_24h_map.values()) else None,
        }

    rl = ultimo_token_count["rate_limits"]
    pri = rl.get("primary") if isinstance(rl.get("primary"), dict) else None
    sec = rl.get("secondary") if isinstance(rl.get("secondary"), dict) else None
    has_credits = bool(rl.get("credits")) if rl.get("credits") is not None else None

    pri_perc = pri.get("used_percent") if pri else None
    pri_dias = round(pri["window_minutes"] / 1440.0, 1) if pri and isinstance(pri.get("window_minutes"), (int, float)) else None
    pri_reset = None
    if pri and pri.get("resets_at"):
        try:
            pri_reset = datetime.fromtimestamp(float(pri["resets_at"]), tz=timezone.utc).isoformat()
        except Exception:
            pri_reset = None

    sec_perc = sec.get("used_percent") if sec else None
    sec_reset = None
    if sec and sec.get("resets_at"):
        try:
            sec_reset = datetime.fromtimestamp(float(sec["resets_at"]), tz=timezone.utc).isoformat()
        except Exception:
            sec_reset = None

    plano = ultimo_token_count.get("plan_type") or rl.get("plan_type")
    soma_total = sum(v for v in tokens_24h_map.values() if v is not None)

    return {
        "primario_percentual": pri_perc,
        "primario_janela_dias": pri_dias,
        "primario_reset": pri_reset,
        "secundario_percentual": sec_perc,
        "secundario_reset": sec_reset,
        "has_credits": has_credits,
        "plano": str(plano) if plano else "prolite",
        "conta_compartilhada": True,
        "tokens_24h_estimativa": soma_total if any(v is not None for v in tokens_24h_map.values()) else None,
        "por_diretor": [{"diretor": d, "tokens_24h": tokens_24h_map[d]} for d in diretores],
    }


def ler_uso_planos_claude(pasta_projetos=PROJETOS):
    """Calcula estimativa de volume de tokens do Claude por diretor em 24h.

    Regra dura: Não fabrica percentual oficial (sessao_5h/semana_7d saem como None/indeterminado).
    """
    diretores = ["luana", "renato", "bia"]
    vazio_claude = {
        "sessao_5h_percentual": None,
        "sessao_5h_reset": None,
        "semana_7d_percentual": None,
        "semana_7d_reset": None,
        "fonte_percentual_oficial": False,
        "tokens_24h_estimativa": None,
        "por_diretor": [{"diretor": d, "tokens_24h": None} for d in diretores],
    }

    if not isinstance(pasta_projetos, Path):
        pasta_projetos = Path(pasta_projetos)

    if not pasta_projetos.is_dir():
        return vazio_claude

    agora = agora_utc()
    limite_24h = agora - timedelta(hours=24)
    tokens_map = {d: None for d in diretores}

    try:
        for arq in pasta_projetos.rglob("*.jsonl"):
            try:
                st = arq.stat()
                if datetime.fromtimestamp(st.st_mtime, tz=timezone.utc) < limite_24h:
                    continue
            except OSError:
                continue

            caminho_str = str(arq).lower()
            d_alvo = None
            if "luana" in caminho_str:
                d_alvo = "luana"
            elif "renato" in caminho_str:
                d_alvo = "renato"
            elif "bia" in caminho_str:
                d_alvo = "bia"

            if not d_alvo:
                continue

            if tokens_map[d_alvo] is None:
                tokens_map[d_alvo] = 0

            try:
                size = st.st_size
                with arq.open("r", encoding="utf-8", errors="replace") as fh:
                    if size > 65536:
                        fh.seek(size - 65536)
                        fh.readline()
                    for line in fh:
                        if not line.strip():
                            continue
                        try:
                            obj = json.loads(line)
                            if isinstance(obj, dict):
                                usg = obj.get("usage") or obj.get("message", {}).get("usage")
                                if isinstance(usg, dict):
                                    in_t = int(usg.get("input_tokens", 0) or 0)
                                    out_t = int(usg.get("output_tokens", 0) or 0)
                                    cc_t = int(usg.get("cache_creation_input_tokens", 0) or 0)
                                    cr_t = int(usg.get("cache_read_input_tokens", 0) or 0)
                                    tokens_map[d_alvo] += (in_t + out_t + cc_t + cr_t)
                        except Exception:
                            continue
            except OSError:
                continue
    except Exception:
        pass

    soma_total = sum(v for v in tokens_map.values() if v is not None)
    return {
        "sessao_5h_percentual": None,
        "sessao_5h_reset": None,
        "semana_7d_percentual": None,
        "semana_7d_reset": None,
        "fonte_percentual_oficial": False,
        "tokens_24h_estimativa": soma_total if any(v is not None for v in tokens_map.values()) else None,
        "por_diretor": [{"diretor": d, "tokens_24h": tokens_map[d]} for d in diretores],
    }


def ler_uso_planos(caminho_cache=CACHE_USO_PLANOS, buscar_codex=None, pasta_projetos=PROJETOS, pastas_sessoes_codex=None):
    """Agrega uso dos planos Claude e Codex com cache TTL de 5 minutos."""
    agora_iso = agora_utc().isoformat()

    if buscar_codex is None and caminho_cache and Path(caminho_cache).is_file():
        try:
            st = Path(caminho_cache).stat()
            idade_s = (datetime.now(timezone.utc).timestamp() - st.st_mtime)
            if idade_s < 300:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict) and cache_obj.get("status") in ("pronto", "indeterminado"):
                    return cache_obj
        except Exception:
            pass

    codex_dados = ler_uso_planos_codex(buscar=buscar_codex, pastas_sessoes=pastas_sessoes_codex)
    claude_dados = ler_uso_planos_claude(pasta_projetos=pasta_projetos)

    resultado = {
        "status": "pronto" if (codex_dados or claude_dados) else "indeterminado",
        "atualizado_em": agora_iso,
        "erro": None,
        "claude": claude_dados,
        "codex": codex_dados,
    }

    if caminho_cache:
        try:
            gravar_atomico(Path(caminho_cache), resultado)
        except Exception:
            pass

    return resultado


ALLOWLIST_FINANCEIRO = {
    "a_receber_mes",
    "recebido_mes",
    "faturado_mes",
    "despesa_mes",
    "mrr_atual",
    "mrr_mes_anterior",
    "clientes_ativos",
    "clientes_em_atraso",
    "valor_em_atraso",
    "contratos_novos_mes",
    "contratos_encerrados_mes",
    "moeda_exibicao",
    "cambio_usd_brl",
    "cambio_usd_ars",
    "tendencia_mensal",
    "por_canal_aquisicao",
    "proximas_cobrancas_qtd",
}


def _processar_resposta_financeira(bruto: dict, agora_iso: str) -> dict:
    """Filtra rigorosamente a resposta financeira garantindo que só chaves da allowlist saem."""
    prev = bruto.get("previous") if isinstance(bruto.get("previous"), dict) else {}
    rate = bruto.get("rate") if isinstance(bruto.get("rate"), dict) else {}

    chart_raw = bruto.get("chartData") if isinstance(bruto.get("chartData"), list) else []
    tendencia = []
    for item in chart_raw:
        if isinstance(item, dict):
            tendencia.append({
                "mes": str(item.get("month", "")),
                "faturado": item.get("income"),
                "despesa": item.get("expense"),
                "mrr": item.get("mrr"),
            })

    source_raw = bruto.get("sourceBreakdown") if isinstance(bruto.get("sourceBreakdown"), list) else []
    canais = []
    for item in source_raw:
        if isinstance(item, dict):
            canais.append({
                "canal": str(item.get("code", "")),
                "mrr": item.get("mrr"),
                "total": item.get("total"),
                "clientes": item.get("clients"),
            })

    upcoming = bruto.get("upcomingInvoices")
    proximas_qtd = len(upcoming) if isinstance(upcoming, list) else None

    res = {
        "status": "pronto",
        "atualizado_em": agora_iso,
        "erro": None,
        "a_receber_mes": bruto.get("periodToReceive"),
        "recebido_mes": bruto.get("periodReceived"),
        "faturado_mes": bruto.get("periodIncome"),
        "despesa_mes": bruto.get("periodExpense"),
        "mrr_atual": bruto.get("mrr"),
        "mrr_mes_anterior": prev.get("mrr"),
        "clientes_ativos": bruto.get("activeClients"),
        "clientes_em_atraso": bruto.get("overdueClients"),
        "valor_em_atraso": bruto.get("overdueAmount"),
        "contratos_novos_mes": bruto.get("contratosNovos"),
        "contratos_encerrados_mes": bruto.get("contratosEncerrados"),
        "moeda_exibicao": bruto.get("displayCurrency") or "BRL",
        "cambio_usd_brl": rate.get("usd_brl"),
        "cambio_usd_ars": rate.get("usd_ars"),
        "tendencia_mensal": tendencia,
        "por_canal_aquisicao": canais,
        "proximas_cobrancas_qtd": proximas_qtd,
    }

    chaves_invalidas = set(res.keys()) - ALLOWLIST_FINANCEIRO - {"status", "atualizado_em", "erro"}
    if chaves_invalidas:
        raise ValueError(f"chaves não autorizadas na saída financeira: {chaves_invalidas}")

    return res


def ler_financeiro(buscar=None, caminho_cache=CACHE_FINANCEIRO):
    """Lê métricas financeiras agregadas (GET /dashboard/metrics) descartando qualquer PII."""
    agora_iso = agora_utc().isoformat()
    vazio = {
        "status": "indeterminado",
        "atualizado_em": agora_iso,
        "erro": None,
        "a_receber_mes": None,
        "recebido_mes": None,
        "faturado_mes": None,
        "despesa_mes": None,
        "mrr_atual": None,
        "mrr_mes_anterior": None,
        "clientes_ativos": None,
        "clientes_em_atraso": None,
        "valor_em_atraso": None,
        "contratos_novos_mes": None,
        "contratos_encerrados_mes": None,
        "moeda_exibicao": "BRL",
        "cambio_usd_brl": None,
        "cambio_usd_ars": None,
        "tendencia_mensal": [],
        "por_canal_aquisicao": [],
        "proximas_cobrancas_qtd": None,
    }

    if buscar is not None:
        try:
            bruto = buscar()
            if isinstance(bruto, dict):
                return _processar_resposta_financeira(bruto, agora_iso)
        except Exception as e:
            return {**vazio, "status": "erro", "erro": type(e).__name__}

    if caminho_cache and Path(caminho_cache).is_file():
        try:
            st = Path(caminho_cache).stat()
            idade_s = (datetime.now(timezone.utc).timestamp() - st.st_mtime)
            if idade_s < 600:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict) and cache_obj.get("status") in ("pronto", "indeterminado"):
                    return cache_obj
        except Exception:
            pass

    try:
        segredos_path = RAIZ / "luana/.env.secrets"
        if not segredos_path.is_file():
            return {**vazio, "status": "indeterminado", "erro": "luana/.env.secrets indisponível"}
        segredos = segredos_path.read_text(encoding="utf-8")
        m = re.search(r"^AGENT_API_KEY=(?:['\"])?([^'\"\n]+)", segredos, re.MULTILINE)
        if not m:
            return {**vazio, "status": "indeterminado", "erro": "AGENT_API_KEY não encontrada"}

        req = urllib.request.Request(
            "https://financeiro.casaldotrafego.com/api/agent/v1/dashboard/metrics",
            headers={"Authorization": f"Bearer {m.group(1).strip()}", "x-agent-actor": "painel-os-readonly"},
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            corpo = json.loads(resp.read().decode("utf-8"))
            if not isinstance(corpo, dict):
                return {**vazio, "status": "erro", "erro": "resposta financeira não é um objeto"}
            resultado = _processar_resposta_financeira(corpo, agora_iso)
            if caminho_cache:
                try:
                    gravar_atomico(Path(caminho_cache), resultado)
                except Exception:
                    pass
            return resultado
    except Exception as e:
        if caminho_cache and Path(caminho_cache).is_file():
            try:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict):
                    cache_obj["status"] = "indeterminado"
                    return cache_obj
            except Exception:
                pass
        return {**vazio, "status": "indeterminado", "erro": type(e).__name__}


# ---------------------------------------------------------------------------
# GA4 (casaldotrafego.com, propriedade 255274390) — rodada 25/09/2026.
#
# A credencial (service account GCP com escopo analytics.readonly) NÃO mora
# neste código, em nenhuma forma: nem caminho fixo, nem valor. Ela é resolvida
# só em tempo de execução, por PAINEL_GA4_CREDENCIAL (variável de ambiente) ou
# por um `.env` local em `PAINEL_OS_DIR` (gitignorado, nunca commitado). Ver
# README para o passo a passo sem o caminho real.
# ---------------------------------------------------------------------------

GA4_PROPRIEDADE = "255274390"
GA4_ESCOPO = "https://www.googleapis.com/auth/analytics.readonly"


def _resolver_credencial_ga4(caminho_config=None):
    """PAINEL_GA4_CREDENCIAL no ambiente, senão a mesma chave num `.env` local."""
    caminho = os.environ.get("PAINEL_GA4_CREDENCIAL")
    if caminho:
        return Path(caminho)
    alvo = caminho_config if caminho_config is not None else (PAINEL_OS_DIR / ".env")
    if alvo.is_file():
        try:
            for lin in alvo.read_text(encoding="utf-8").splitlines():
                if lin.startswith("PAINEL_GA4_CREDENCIAL="):
                    valor = lin.split("=", 1)[1].strip().strip("'\"")
                    if valor:
                        return Path(valor)
        except OSError:
            pass
    return None


def _obter_token_ga4(caminho_credencial: Path) -> str:
    """Troca a service account por um token OAuth2 de leitura (analytics.readonly)."""
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request as GoogleAuthRequest

    credenciais = service_account.Credentials.from_service_account_file(
        str(caminho_credencial), scopes=[GA4_ESCOPO]
    )
    credenciais.refresh(GoogleAuthRequest())
    return credenciais.token


def _runreport_ga4(token: str, propriedade: str, corpo: dict, timeout: int = 10) -> dict:
    req = urllib.request.Request(
        f"https://analyticsdata.googleapis.com/v1beta/properties/{propriedade}:runReport",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(corpo).encode("utf-8"),
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _buscar_analytics_ga4(token: str, propriedade: str = GA4_PROPRIEDADE) -> dict:
    """5 chamadas runReport (totais 7d/30d, série diária, top páginas, top origens).

    Contam como UMA coleta para efeito do cache de 1h: a régua "no máximo 1
    chamada GA4 por hora" é sobre a FREQUÊNCIA da coleta, não sobre o número
    de requisições HTTP dentro dela.
    """
    metricas_totais = [{"name": "activeUsers"}, {"name": "sessions"}, {"name": "screenPageViews"}]
    totais_7d = _runreport_ga4(token, propriedade, {
        "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
        "metrics": metricas_totais,
    })
    totais_30d = _runreport_ga4(token, propriedade, {
        "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
        "metrics": metricas_totais,
    })
    serie_diaria_30d = _runreport_ga4(token, propriedade, {
        "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
        "dimensions": [{"name": "date"}],
        "metrics": metricas_totais,
        "orderBys": [{"dimension": {"dimensionName": "date"}}],
    })
    top_paginas = _runreport_ga4(token, propriedade, {
        "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
        "dimensions": [{"name": "pagePath"}],
        "metrics": [{"name": "screenPageViews"}],
        "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}],
        "limit": 5,
    })
    top_origens = _runreport_ga4(token, propriedade, {
        "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
        "dimensions": [{"name": "sessionSource"}],
        "metrics": [{"name": "sessions"}],
        "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}],
        "limit": 5,
    })
    return {
        "totais_7d": totais_7d,
        "totais_30d": totais_30d,
        "serie_diaria_30d": serie_diaria_30d,
        "top_paginas": top_paginas,
        "top_origens": top_origens,
    }


def _linhas_ga4(bruto: dict, chave: str) -> list:
    bloco = bruto.get(chave) if isinstance(bruto, dict) else None
    if not isinstance(bloco, dict):
        return []
    linhas = bloco.get("rows")
    return linhas if isinstance(linhas, list) else []


def _metrica_ga4(valores, indice) -> int | None:
    if not isinstance(valores, list) or indice >= len(valores) or not isinstance(valores[indice], dict):
        return None
    try:
        return int(valores[indice].get("value"))
    except (TypeError, ValueError):
        return None


def _processar_resposta_analytics(bruto: dict, agora_iso: str) -> dict:
    """Extrai só o que a tela usa do runReport bruto do GA4; nunca inventa zero."""
    def total(chave, indice):
        linhas = _linhas_ga4(bruto, chave)
        if not linhas or not isinstance(linhas[0], dict):
            return None
        return _metrica_ga4(linhas[0].get("metricValues"), indice)

    usuarios_7d = total("totais_7d", 0)
    sessoes_7d = total("totais_7d", 1)
    visualizacoes_7d = total("totais_7d", 2)
    usuarios_30d = total("totais_30d", 0)
    sessoes_30d = total("totais_30d", 1)
    visualizacoes_30d = total("totais_30d", 2)

    serie = []
    for linha in _linhas_ga4(bruto, "serie_diaria_30d"):
        if not isinstance(linha, dict):
            continue
        dims = linha.get("dimensionValues")
        if not isinstance(dims, list) or not dims or not isinstance(dims[0], dict):
            continue
        data_bruta = str(dims[0].get("value") or "")
        if len(data_bruta) != 8 or not data_bruta.isdigit():
            continue
        vals = linha.get("metricValues")
        serie.append({
            "data": f"{data_bruta[0:4]}-{data_bruta[4:6]}-{data_bruta[6:8]}",
            "usuarios_ativos": _metrica_ga4(vals, 0),
            "sessoes": _metrica_ga4(vals, 1),
            "visualizacoes": _metrica_ga4(vals, 2),
        })
    serie.sort(key=lambda x: x["data"])

    top_paginas = []
    for linha in _linhas_ga4(bruto, "top_paginas")[:5]:
        if not isinstance(linha, dict):
            continue
        dims = linha.get("dimensionValues")
        if not isinstance(dims, list) or not dims or not isinstance(dims[0], dict):
            continue
        caminho = dims[0].get("value")
        if not caminho:
            continue
        # "pagePath" já vem sem query string na API; o split é defensivo.
        caminho = str(caminho).split("?", 1)[0]
        top_paginas.append({
            "caminho": caminho,
            "visualizacoes": _metrica_ga4(linha.get("metricValues"), 0),
        })

    top_origens = []
    for linha in _linhas_ga4(bruto, "top_origens")[:5]:
        if not isinstance(linha, dict):
            continue
        dims = linha.get("dimensionValues")
        if not isinstance(dims, list) or not dims or not isinstance(dims[0], dict):
            continue
        origem = dims[0].get("value")
        if not origem:
            continue
        top_origens.append({
            "origem": str(origem),
            "sessoes": _metrica_ga4(linha.get("metricValues"), 0),
        })

    tem_dado = any(
        v is not None for v in (usuarios_7d, sessoes_7d, visualizacoes_7d, usuarios_30d, sessoes_30d, visualizacoes_30d)
    ) or bool(serie) or bool(top_paginas) or bool(top_origens)

    return {
        "status": "pronto" if tem_dado else "sem_dado",
        "atualizado_em": agora_iso,
        "motivo": None if tem_dado else "resposta GA4 sem métricas aproveitáveis",
        "propriedade_ga4": GA4_PROPRIEDADE,
        "usuarios_ativos_7d": usuarios_7d,
        "sessoes_7d": sessoes_7d,
        "visualizacoes_7d": visualizacoes_7d,
        "usuarios_ativos_30d": usuarios_30d,
        "sessoes_30d": sessoes_30d,
        "visualizacoes_30d": visualizacoes_30d,
        "serie_diaria_30d": serie,
        "top_paginas": top_paginas,
        "top_origens": top_origens,
    }


def ler_analytics_ga4(caminho_cache=CACHE_ANALYTICS, buscar=None, caminho_config_ga4=None):
    """GA4 do casaldotrafego.com (propriedade 255274390). Cache de 1h (1 coleta/hora)."""
    agora_iso = agora_utc().isoformat()
    vazio = {
        "status": "sem_dado",
        "atualizado_em": agora_iso,
        "motivo": None,
        "propriedade_ga4": GA4_PROPRIEDADE,
        "usuarios_ativos_7d": None,
        "sessoes_7d": None,
        "visualizacoes_7d": None,
        "usuarios_ativos_30d": None,
        "sessoes_30d": None,
        "visualizacoes_30d": None,
        "serie_diaria_30d": [],
        "top_paginas": [],
        "top_origens": [],
    }

    if buscar is not None:
        try:
            bruto = buscar()
        except Exception as e:
            return {**vazio, "motivo": f"consulta GA4 falhou: {type(e).__name__}"}
        if not isinstance(bruto, dict):
            return {**vazio, "motivo": "resposta GA4 não é um objeto"}
        return _processar_resposta_analytics(bruto, agora_iso)

    if caminho_cache and Path(caminho_cache).is_file():
        try:
            st = Path(caminho_cache).stat()
            idade_s = (datetime.now(timezone.utc).timestamp() - st.st_mtime)
            if idade_s < 3600:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict) and cache_obj.get("status") in ("pronto", "sem_dado"):
                    return cache_obj
        except Exception:
            pass

    caminho_credencial = _resolver_credencial_ga4(caminho_config_ga4)
    if not caminho_credencial or not Path(caminho_credencial).is_file():
        resultado = {**vazio, "motivo": "credencial GA4 não configurada (defina PAINEL_GA4_CREDENCIAL)"}
    else:
        try:
            token = _obter_token_ga4(caminho_credencial)
        except ImportError:
            resultado = {**vazio, "motivo": "biblioteca google-auth não instalada"}
        except Exception as e:
            resultado = {**vazio, "motivo": f"falha ao gerar token GA4: {type(e).__name__}"}
        else:
            try:
                bruto = _buscar_analytics_ga4(token)
            except Exception as e:
                resultado = {**vazio, "motivo": f"consulta GA4 falhou: {type(e).__name__}"}
            else:
                resultado = _processar_resposta_analytics(bruto, agora_iso)

    if caminho_cache:
        try:
            gravar_atomico(Path(caminho_cache), resultado)
        except Exception:
            pass
    return resultado


# ---------------------------------------------------------------------------
# LINKEDIN VIA APIFY — rodada 25/09/2026.
#
# A reconexão pela Composio NÃO resolve (o app dela só tem os escopos de
# login/publicação, nunca leitura; ver entrega de 25/09). O Gastão autorizou
# ler os posts públicos do perfil pessoal dele via Apify. O token
# (APIFY_TOKEN) é resolvido em tempo de execução por variável de ambiente ou
# pelo arquivo de configuração já existente da casa (RAIZ/luana/.env.apify);
# nenhum valor de token aparece neste arquivo. O ATOR escolhido é
# harvestapi/linkedin-profile-posts (sem cookie/login, ~US$ 2,00 por 1.000
# posts extraídos): para um perfil pessoal de baixo volume o custo real fica
# bem abaixo do teto de US$ 0,10 por execução.
#
# ‼️ NÃO TESTADO CONTRA O ATOR REAL: falta a URL pública do perfil do
# LinkedIn do Gastão, que não está em nenhuma memória/conexão da casa
# (varredura registrada na entrega de 25/09). A função funciona e está
# coberta por teste com resposta falsa; falta só configurar
# PAINEL_LINKEDIN_PERFIL_URL e rodar um smoke test real antes de confiar em
# produção.
# ---------------------------------------------------------------------------

APIFY_ATOR_LINKEDIN = "harvestapi~linkedin-profile-posts"
APIFY_TETO_USD = 0.10
AVISO_LINKEDIN_APIFY = (
    "dado vem de raspagem pública via Apify (curtidas, comentários, "
    "compartilhamentos e texto). Impressões e visualizações NÃO existem por "
    "este caminho: só aparecem dentro do painel de Analytics do próprio "
    "LinkedIn, visível apenas para o dono da conta logado."
)


def _resolver_apify_token(caminho_config=None):
    """APIFY_TOKEN no ambiente, senão o mesmo arquivo que a casa já usa (Composio/Instagram)."""
    token = os.environ.get("APIFY_TOKEN")
    if token:
        return token
    alvo = caminho_config if caminho_config is not None else (RAIZ / "luana/.env.apify")
    if alvo.is_file():
        try:
            for lin in alvo.read_text(encoding="utf-8").splitlines():
                if lin.startswith("APIFY_TOKEN="):
                    valor = lin.split("=", 1)[1].strip().strip("'\"")
                    if valor:
                        return valor
        except OSError:
            pass
    return None


def _resolver_perfil_linkedin(caminho_config=None):
    """URL pública do perfil pessoal a raspar: só variável de ambiente ou `.env` local."""
    url = os.environ.get("PAINEL_LINKEDIN_PERFIL_URL")
    if url:
        return url
    alvo = caminho_config if caminho_config is not None else (PAINEL_OS_DIR / ".env")
    if alvo.is_file():
        try:
            for lin in alvo.read_text(encoding="utf-8").splitlines():
                if lin.startswith("PAINEL_LINKEDIN_PERFIL_URL="):
                    valor = lin.split("=", 1)[1].strip().strip("'\"")
                    if valor:
                        return valor
        except OSError:
            pass
    return None


def _buscar_linkedin_apify(token: str, perfil_url: str, limite: int = 20) -> dict:
    """Roda o ator, espera terminar, mede o custo real e traz os últimos posts.

    Fluxo em 3 chamadas (documentado, não coberto por execução real aqui):
    inicia a run, faz polling até status terminal, lê o dataset. O custo vem
    de `usageTotalUsd` da própria run, não de estimativa.
    """
    base = f"https://api.apify.com/v2/acts/{APIFY_ATOR_LINKEDIN}/runs?token={token}"
    req_start = urllib.request.Request(
        base,
        headers={"Content-Type": "application/json"},
        data=json.dumps({"profileUrls": [perfil_url], "maxPosts": limite}).encode("utf-8"),
        method="POST",
    )
    with urllib.request.urlopen(req_start, timeout=15) as resp:
        run = json.loads(resp.read().decode("utf-8")).get("data", {})

    run_id = run.get("id")
    if not run_id:
        raise RuntimeError("Apify não devolveu id de run")

    status = run.get("status")
    tentativas = 0
    while status not in ("SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED") and tentativas < 20:
        time.sleep(3)
        tentativas += 1
        req_status = urllib.request.Request(f"https://api.apify.com/v2/actor-runs/{run_id}?token={token}")
        with urllib.request.urlopen(req_status, timeout=10) as resp:
            run = json.loads(resp.read().decode("utf-8")).get("data", {})
        status = run.get("status")

    if status != "SUCCEEDED":
        raise RuntimeError(f"run Apify terminou com status {status}")

    custo = run.get("usageTotalUsd")
    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        raise RuntimeError("run Apify sem defaultDatasetId")

    req_itens = urllib.request.Request(
        f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={token}&limit={limite}"
    )
    with urllib.request.urlopen(req_itens, timeout=15) as resp:
        itens = json.loads(resp.read().decode("utf-8"))

    return {"posts": itens if isinstance(itens, list) else [], "custo_usd": custo}


def _int_seguro(valor):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def _processar_resposta_linkedin_apify(bruto: dict, agora_iso: str) -> dict:
    itens = bruto.get("posts") if isinstance(bruto, dict) else None
    custo = bruto.get("custo_usd") if isinstance(bruto, dict) else None
    if not isinstance(itens, list):
        return {
            "status": "erro",
            "atualizado_em": agora_iso,
            "motivo": "resposta Apify sem lista de posts",
            "custo_usd": custo,
            "aviso_cobertura": AVISO_LINKEDIN_APIFY,
            "posts": [],
        }

    posts = []
    for item in itens[:20]:
        if not isinstance(item, dict):
            continue
        texto = str(item.get("text") or item.get("commentary") or item.get("content") or "")
        inicio = " ".join(texto.split()[:12])
        posts.append({
            "data": item.get("postedAt") or item.get("publishedAt") or item.get("date"),
            "inicio_texto": inicio,
            "curtidas": _int_seguro(item.get("likeCount") or item.get("reactionsCount") or item.get("reactions")),
            "comentarios": _int_seguro(item.get("commentCount") or item.get("commentsCount") or item.get("comments")),
            "compartilhamentos": _int_seguro(item.get("repostCount") or item.get("sharesCount") or item.get("shares")),
        })

    if custo is not None:
        try:
            custo_num = float(custo)
        except (TypeError, ValueError):
            custo_num = None
        if custo_num is not None and custo_num > APIFY_TETO_USD:
            return {
                "status": "erro",
                "atualizado_em": agora_iso,
                "motivo": (
                    f"custo da execução (US$ {custo_num:.4f}".replace(".", ",") + ") passou do teto de "
                    f"US$ {APIFY_TETO_USD:.2f}".replace(".", ",") + "; não roda de novo até revisão manual"
                ),
                "custo_usd": custo_num,
                "aviso_cobertura": AVISO_LINKEDIN_APIFY,
                "posts": [],
            }
        custo = custo_num

    return {
        "status": "ok_apify",
        "atualizado_em": agora_iso,
        "motivo": None,
        "custo_usd": custo,
        "aviso_cobertura": AVISO_LINKEDIN_APIFY,
        "posts": posts,
    }


def ler_linkedin_apify(
    caminho_cache=CACHE_LINKEDIN_APIFY,
    caminho_bloqueio=BLOQUEIO_LINKEDIN_APIFY,
    buscar=None,
    caminho_config_apify=None,
    caminho_config_perfil=None,
):
    """Posts públicos do LinkedIn pessoal via Apify. Cache de 24h (1 coleta/dia)."""
    agora_iso = agora_utc().isoformat()
    vazio = {
        "status": "sem_dado",
        "atualizado_em": agora_iso,
        "motivo": None,
        "custo_usd": None,
        "aviso_cobertura": AVISO_LINKEDIN_APIFY,
        "posts": [],
    }

    if buscar is not None:
        try:
            bruto = buscar()
        except Exception as e:
            return {**vazio, "status": "erro", "motivo": f"consulta Apify falhou: {type(e).__name__}"}
        if not isinstance(bruto, dict):
            return {**vazio, "status": "erro", "motivo": "resposta Apify não é um objeto"}
        return _processar_resposta_linkedin_apify(bruto, agora_iso)

    if caminho_bloqueio and Path(caminho_bloqueio).is_file():
        try:
            bloqueio = json.loads(Path(caminho_bloqueio).read_text(encoding="utf-8"))
            if isinstance(bloqueio, dict):
                return {**vazio, "status": "erro", "motivo": bloqueio.get("motivo") or "execução bloqueada por teto de gasto excedido"}
        except Exception:
            pass

    if caminho_cache and Path(caminho_cache).is_file():
        try:
            st = Path(caminho_cache).stat()
            idade_s = (datetime.now(timezone.utc).timestamp() - st.st_mtime)
            if idade_s < 86400:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict) and cache_obj.get("status") in ("ok_apify", "erro", "sem_dado"):
                    return cache_obj
        except Exception:
            pass

    token = _resolver_apify_token(caminho_config_apify)
    if not token:
        resultado = {**vazio, "motivo": "token Apify não configurado (APIFY_TOKEN)"}
    else:
        perfil_url = _resolver_perfil_linkedin(caminho_config_perfil)
        if not perfil_url:
            resultado = {**vazio, "motivo": "perfil do LinkedIn não configurado (defina PAINEL_LINKEDIN_PERFIL_URL)"}
        else:
            try:
                bruto = _buscar_linkedin_apify(token, perfil_url)
            except Exception as e:
                resultado = {**vazio, "status": "erro", "motivo": f"consulta Apify falhou: {type(e).__name__}"}
            else:
                resultado = _processar_resposta_linkedin_apify(bruto, agora_iso)

    if resultado.get("status") == "erro" and resultado.get("custo_usd") is not None:
        try:
            if float(resultado["custo_usd"]) > APIFY_TETO_USD:
                gravar_atomico(Path(caminho_bloqueio), {
                    "motivo": resultado["motivo"],
                    "bloqueado_em": agora_iso,
                    "custo_usd": resultado["custo_usd"],
                })
        except Exception:
            pass

    if caminho_cache:
        try:
            gravar_atomico(Path(caminho_cache), resultado)
        except Exception:
            pass
    return resultado


def ler_redes_organicas(buscar=None, caminho_cache=CACHE_REDES):
    """Lê insights orgânicos de redes (Instagram via Composio, LinkedIn via Apify)."""
    agora_iso = agora_utc().isoformat()
    vazio = {
        "status": "indeterminado",
        "atualizado_em": agora_iso,
        "erro": None,
        "instagram": None,
        "linkedin": None,
    }

    if buscar is not None:
        try:
            bruto = buscar()
            if isinstance(bruto, dict):
                return bruto
        except Exception as e:
            return {**vazio, "status": "erro", "erro": type(e).__name__}

    if caminho_cache and Path(caminho_cache).is_file():
        try:
            st = Path(caminho_cache).stat()
            idade_s = (datetime.now(timezone.utc).timestamp() - st.st_mtime)
            if idade_s < 1800:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict) and cache_obj.get("status") in ("pronto", "indeterminado"):
                    return cache_obj
        except Exception:
            pass

    # LinkedIn tem fonte, cache (24h) e teto de gasto próprios; não depende do
    # Composio nem do resultado do Instagram abaixo.
    linkedin_resultado = ler_linkedin_apify()
    vazio["linkedin"] = linkedin_resultado

    comp_key = os.environ.get("COMPOSIO_API_KEY")
    if not comp_key:
        comp_env = Path.home() / ".composio_env"
        if comp_env.is_file():
            for lin in comp_env.read_text(encoding="utf-8").splitlines():
                if lin.startswith("COMPOSIO_API_KEY="):
                    comp_key = lin.split("=", 1)[1].strip().strip("'\"")
                    break

    if not comp_key:
        return {**vazio, "status": "indeterminado", "erro": "chave Composio não encontrada"}

    ig_user_id = "26530904369921644"
    conn_id = "ca_4DZxyWqyHq4W"

    try:
        headers = {"x-api-key": comp_key, "Content-Type": "application/json"}
        seguidores = None
        alcance = None
        metricas_obtidas = []

        req_account = urllib.request.Request(
            "https://backend.composio.dev/api/v3.1/tools/execute/proxy",
            headers=headers,
            data=json.dumps({
                "connected_account_id": conn_id,
                "endpoint": f"/{ig_user_id}?fields=followers_count,media_count,name,username",
                "method": "GET"
            }).encode("utf-8")
        )
        with urllib.request.urlopen(req_account, timeout=8) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
            data = res_json.get("data") if isinstance(res_json, dict) else {}
            if isinstance(data, dict):
                resp_body = data.get("response_data") if isinstance(data.get("response_data"), dict) else data
                if isinstance(resp_body, dict):
                    seguidores = resp_body.get("followers_count")
                    if seguidores is not None:
                        metricas_obtidas.append("followers_count")

        try:
            req_insights = urllib.request.Request(
                "https://backend.composio.dev/api/v3.1/tools/execute/proxy",
                headers=headers,
                data=json.dumps({
                    "connected_account_id": conn_id,
                    "endpoint": f"/{ig_user_id}/insights?metric=reach,profile_views&period=day",
                    "method": "GET"
                }).encode("utf-8")
            )
            with urllib.request.urlopen(req_insights, timeout=8) as resp_in:
                res_in_json = json.loads(resp_in.read().decode("utf-8"))
                data_in = res_in_json.get("data") if isinstance(res_in_json, dict) else {}
                if isinstance(data_in, dict):
                    resp_in_body = data_in.get("response_data") if isinstance(data_in.get("response_data"), dict) else data_in
                    raw_items = []
                    if isinstance(resp_in_body, dict):
                        raw_items = resp_in_body.get("data", [])
                    elif isinstance(resp_in_body, list):
                        raw_items = resp_in_body

                    for item in raw_items:
                        if isinstance(item, dict):
                            m_name = item.get("name")
                            values = item.get("values", [])
                            val = values[0].get("value") if values and isinstance(values[0], dict) else None
                            if m_name == "reach" and val is not None:
                                alcance = val
                                metricas_obtidas.append("reach")
                            elif m_name == "profile_views" and val is not None:
                                metricas_obtidas.append("profile_views")
        except Exception:
            pass

        resultado = {
            "status": "pronto",
            "atualizado_em": agora_iso,
            "erro": None,
            "instagram": {
                "seguidores": seguidores,
                "alcance_agregado": alcance,
                "salvamentos_agregado": None,
                "metricas_obtidas": metricas_obtidas,
                "posts": [],
            },
            "linkedin": linkedin_resultado,
        }

        if caminho_cache:
            try:
                gravar_atomico(Path(caminho_cache), resultado)
            except Exception:
                pass
        return resultado
    except Exception as e:
        if caminho_cache and Path(caminho_cache).is_file():
            try:
                cache_obj = json.loads(Path(caminho_cache).read_text(encoding="utf-8"))
                if isinstance(cache_obj, dict):
                    cache_obj["status"] = "indeterminado"
                    return cache_obj
            except Exception:
                pass
        return {**vazio, "status": "indeterminado", "erro": type(e).__name__}


TEREZA_RAIZ = Path(os.environ.get("TEREZA_DIR", RAIZ / "tereza"))
HEITOR_RAIZ = Path(os.environ.get("HEITOR_DIR", RAIZ / "heitor"))


def ler_squad_trafego(raiz: Path = None) -> dict:
    """Lê o estado operacional do Squad de Tráfego da casa da Tereza."""
    base = raiz or TEREZA_RAIZ
    if not base.exists() or not base.is_dir():
        return {
            "status": "sem_dado",
            "atualizado_em": None,
            "pipeline": None,
            "ativacoes": None,
            "pendencias_d2": None,
            "execucoes": [],
            "total_execucoes": None,
            "fazendo": None,
            "proxima": None,
            "done": None,
            "aguardando_dono_d2": False,
        }

    fazendo = 0
    proxima = 0
    done = 0
    execucoes = []

    exec_dir = base / "execucoes"
    if exec_dir.exists() and exec_dir.is_dir():
        for item in exec_dir.iterdir():
            if item.is_dir():
                estado_file = item / "ESTADO.json"
                if estado_file.is_file():
                    try:
                        d = json.loads(estado_file.read_text(encoding="utf-8"))
                        st = str(d.get("status", "")).lower()
                        if st in ("executando", "fazendo", "trabalhando", "em_andamento"):
                            fazendo += 1
                        elif st in ("aguardando", "fila", "proxima", "pendente"):
                            proxima += 1
                        elif st in ("concluido", "concluído", "feito", "sucesso", "done"):
                            done += 1
                        execucoes.append(d)
                    except Exception:
                        pass

    aguardando_d2 = False
    aprov_file = base / "aprovacoes.json"
    if not aprov_file.is_file():
        aprov_file = APROVACOES_JSON
    if aprov_file.is_file():
        try:
            ap_data = json.loads(aprov_file.read_text(encoding="utf-8"))
            lista = ap_data if isinstance(ap_data, list) else ap_data.get("pendencias", [])
            for item in lista:
                if isinstance(item, dict):
                    gate = str(item.get("gate", "")).upper()
                    nivel = str(item.get("nivel", "")).upper()
                    tipo = str(item.get("tipo", "")).lower()
                    status = str(item.get("status", "aguardando")).lower()
                    if (gate == "D2" or nivel == "D2" or "d2" in tipo) and status == "aguardando":
                        aguardando_d2 = True
                        break
        except Exception:
            pass

    mtime = datetime.fromtimestamp(base.stat().st_mtime, tz=timezone.utc).isoformat()
    return {
        "status": "pronto",
        "atualizado_em": mtime,
        "pipeline": (base / "logs" / "pipeline.jsonl").is_file(),
        "ativacoes": (base / "logs" / "ativacoes.jsonl").is_file(),
        "total_execucoes": len(execucoes),
        "execucoes": execucoes,
        "fazendo": fazendo,
        "proxima": proxima,
        "done": done,
        "aguardando_dono_d2": aguardando_d2,
    }


def ler_squad_bots(raiz: Path = None) -> dict:
    """Lê o estado operacional do Squad de Bots da casa do Heitor."""
    base = raiz or HEITOR_RAIZ
    if not base.exists() or not base.is_dir():
        return {
            "status": "sem_dado",
            "atualizado_em": None,
            "pipeline": None,
            "trocas": None,
            "execucoes": [],
            "total_execucoes": None,
            "fazendo": None,
            "proxima": None,
            "done": None,
        }

    fazendo = 0
    proxima = 0
    done = 0
    execucoes = []

    exec_dir = base / "execucoes"
    if exec_dir.exists() and exec_dir.is_dir():
        for item in exec_dir.iterdir():
            if item.is_dir():
                estado_file = item / "ESTADO.json"
                if estado_file.is_file():
                    try:
                        d = json.loads(estado_file.read_text(encoding="utf-8"))
                        st = str(d.get("status", "")).lower()
                        if st in ("executando", "fazendo", "trabalhando", "em_andamento"):
                            fazendo += 1
                        elif st in ("aguardando", "fila", "proxima", "pendente"):
                            proxima += 1
                        elif st in ("concluido", "concluído", "feito", "sucesso", "done"):
                            done += 1
                        execucoes.append(d)
                    except Exception:
                        pass

    mtime = datetime.fromtimestamp(base.stat().st_mtime, tz=timezone.utc).isoformat()
    return {
        "status": "pronto",
        "atualizado_em": mtime,
        "pipeline": (base / "logs" / "pipeline.jsonl").is_file(),
        "trocas": (base / "logs" / "trocas.jsonl").is_file(),
        "total_execucoes": len(execucoes),
        "execucoes": execucoes,
        "fazendo": fazendo,
        "proxima": proxima,
        "done": done,
    }


def ler_cobrancas(buscar=None):
    """Lê o relatório canônico e descarta PII antes de montar o estado."""
    fonte = "API financeira /reports/overdue, somente leitura"
    vazio = {"status": "erro", "fonte": fonte, "atualizado_em": agora_utc().isoformat(), "faturas_atrasadas": None, "clientes_atrasados": None, "por_faixa": [], "por_moeda": [], "erro": None}
    if buscar is None:
        try:
            segredos = (RAIZ / "luana/.env.secrets").read_text(encoding="utf-8")
            m = re.search(r"^AGENT_API_KEY=(?:['\"])?([^'\"\n]+)", segredos, re.MULTILINE)
            if not m:
                return {**vazio, "erro": "AGENT_API_KEY não encontrada"}
            req = urllib.request.Request(
                "https://financeiro.casaldotrafego.com/api/agent/v1/reports/overdue",
                headers={"Authorization": f"Bearer {m.group(1).strip()}", "x-agent-actor": "painel-os-readonly"},
            )
            with urllib.request.urlopen(req, timeout=12) as resposta:
                bruto = json.loads(resposta.read().decode("utf-8"))
        except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            return {**vazio, "erro": f"consulta financeira falhou: {type(exc).__name__}"}
    else:
        try:
            bruto = buscar()
        except Exception as exc:
            return {**vazio, "erro": f"consulta financeira falhou: {type(exc).__name__}"}

    if not isinstance(bruto, dict) or not isinstance(bruto.get("overdueInvoices"), list) or not isinstance(bruto.get("overdueClients"), list):
        return {**vazio, "erro": "resposta financeira fora do contrato esperado"}
    faturas = bruto["overdueInvoices"]
    clientes = bruto["overdueClients"]
    hoje = agora_utc().date()
    faixas = {"1 a 7 dias": 0, "8 a 30 dias": 0, "mais de 30 dias": 0, "data inválida": 0}
    moedas = {}
    for item in faturas:
        if not isinstance(item, dict):
            continue
        data = item.get("dueDate") or item.get("due_date")
        try:
            dias = max(1, (hoje - datetime.fromisoformat(str(data).replace("Z", "+00:00")).date()).days)
            faixa = "1 a 7 dias" if dias <= 7 else "8 a 30 dias" if dias <= 30 else "mais de 30 dias"
        except (ValueError, TypeError):
            faixa = "data inválida"
        faixas[faixa] += 1
        moeda = str(item.get("currency") or "não informada").upper()
        try:
            valor = float(item.get("amount"))
        except (ValueError, TypeError):
            valor = None
        agregado = moedas.setdefault(moeda, {"moeda": moeda, "faturas": 0, "total": 0.0, "total_disponivel": True})
        agregado["faturas"] += 1
        if valor is None:
            agregado["total_disponivel"] = False
        else:
            agregado["total"] += valor

    por_moeda = [{"moeda": x["moeda"], "faturas": x["faturas"], "total": round(x["total"], 2) if x["total_disponivel"] else None} for x in moedas.values()]
    return {**vazio, "status": "pronto", "faturas_atrasadas": len(faturas), "clientes_atrasados": len(clientes), "por_faixa": [{"faixa": k, "faturas": v} for k, v in faixas.items() if v], "por_moeda": sorted(por_moeda, key=lambda x: x["moeda"]), "erro": None}


def ler_chamadas():
    """Ingere exportações locais explícitas; não acessa nem finge acessar Drive."""
    vazio = {
        "status": "sem_fonte",
        "fonte": "caixa local protegida",
        "total": None,
        "atualizado_em": None,
        "erro": "A caixa local de exportações está vazia. O Drive não está conectado.",
        "registros": [],
        "nos": [],
        "arestas": [],
        "arquivos": 0,
        "mascarados": 0,
    }
    def sanitizar(texto, limite):
        if not isinstance(texto, str):
            raise ErroIngestao("texto de citação ou achado ausente")
        saida = rotulo_seguro(texto, limite=limite)
        if not saida:
            raise ErroIngestao("texto não pôde ser sanitizado")
        # `rotulo_seguro` contabiliza nomes; e-mail e sequência numérica são
        # redigidos antes. A saída, não o bruto, é a única coisa publicada.
        return saida[0], saida[1] + int(redigir(texto) != texto)
    try:
        lote = carregar_inbox(CHAMADAS_INBOX, sanitizar, CHAMADAS_ESCOPO)
    except ErroIngestao as exc:
        return {**vazio, "status": "erro", "erro": f"lote local rejeitado: {type(exc).__name__}"}
    if lote is None:
        return vazio
    mais_novo = max(CHAMADAS_INBOX.glob("*.json"), key=lambda p: p.stat().st_mtime)
    return {
        "status": "pronto",
        "fonte": "caixa local protegida",
        "total": len(lote["registros"]),
        "atualizado_em": datetime.fromtimestamp(mais_novo.stat().st_mtime, tz=timezone.utc).isoformat(),
        "erro": None,
        **lote,
    }


def ler_biblioteca():
    """Indexa apenas a primeira camada do acervo e não publica caminhos."""
    agora = agora_utc().isoformat()
    saida = {
        "erro": None,
        "atualizado_em": agora,
        "total": 0,
        "por_origem": {"acervo": 0, "pronto": 0, "cliente": 0},
        "atalhos_quebrados": 0,
        "rotulos_mascarados": 0,
        "itens": [],
    }
    fontes = [
        (PRODUTOR / "out", "acervo"),
        (PRODUTOR / "PRONTOS", "pronto"),
        (PRODUTOR / "PRONTOS-CLIENTES", "cliente"),
    ]
    ausentes = []
    for pasta, origem in fontes:
        if not pasta.is_dir():
            ausentes.append(pasta.name)
            continue
        try:
            entradas = sorted(pasta.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            ausentes.append(pasta.name)
            continue
        for entrada in entradas:
            if entrada.name.startswith(".") or ".bak" in entrada.name:
                continue
            atalho = entrada.is_symlink()
            acessivel = entrada.exists()
            if atalho and not acessivel:
                saida["atalhos_quebrados"] += 1
            try:
                st = entrada.stat() if acessivel else entrada.lstat()
                modificado = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
            except OSError:
                modificado = None
            arquivos = None
            if acessivel and entrada.is_dir():
                try:
                    arquivos = sum(1 for p in entrada.rglob("*") if p.is_file())
                except OSError:
                    arquivos = None
            # A coleção de cliente nunca expõe o nome da entrada, nem mesmo
            # redigido: a posição ordenada vira o rótulo público estável desta
            # medição. Nas demais, todo texto passa pela porta canônica.
            if origem == "cliente":
                rotulo = "peça de cliente"
                saida["rotulos_mascarados"] += 1
            else:
                seguro = rotulo_seguro(entrada.stem.replace("-", " "), limite=68)
                rotulo = seguro[0] if seguro else "[rótulo omitido]"
                saida["rotulos_mascarados"] += seguro[1] if seguro else 1
            identidade = hashlib.sha256(f"{origem}:{entrada.name}".encode()).hexdigest()[:12]
            saida["itens"].append({
                "id": identidade,
                "rotulo": rotulo,
                "origem": origem,
                "tipo": "atalho" if atalho else "pasta" if entrada.is_dir() else "arquivo",
                "arquivos": arquivos,
                "modificado": modificado,
                "acessivel": acessivel,
            })
            saida["por_origem"][origem] += 1
    saida["total"] = len(saida["itens"])
    if ausentes:
        saida["erro"] = "não consegui abrir: " + ", ".join(ausentes)
    saida["itens"].sort(key=lambda x: x["modificado"] or "", reverse=True)
    return saida


def ler_frontmatter(caminho: Path):
    """Le o bloco YAML entre --- e --- no topo. Sem dependencia externa."""
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None, ""
    if not texto.startswith("---"):
        return None, texto
    fim = texto.find("\n---", 3)
    if fim == -1:
        return None, texto
    bloco = texto[3:fim]
    corpo = texto[fim + 4 :]

    dados = {}
    chave_atual = None
    buffer_lista = []
    buffer_texto = []
    modo = None

    for linha in bloco.splitlines():
        if not linha.strip():
            continue
        m = re.match(r"^([a-zA-Z_-]+):\s*(.*)$", linha)
        if m and not linha.startswith(" ") and not linha.startswith("\t"):
            if chave_atual:
                if modo == "lista":
                    dados[chave_atual] = buffer_lista
                elif modo == "texto":
                    dados[chave_atual] = " ".join(buffer_texto).strip()
            chave_atual = m.group(1)
            valor = m.group(2).strip()
            buffer_lista, buffer_texto, modo = [], [], None
            if valor in (">", "|", ">-", "|-"):
                modo = "texto"
            elif valor == "":
                modo = "lista"
            else:
                dados[chave_atual] = valor
                chave_atual = None
        elif chave_atual and modo == "lista" and linha.strip().startswith("-"):
            buffer_lista.append(linha.strip().lstrip("-").strip())
        elif chave_atual and modo in ("texto", "lista"):
            if modo == "lista" and not buffer_lista:
                modo = "texto"
            buffer_texto.append(linha.strip())

    if chave_atual:
        if modo == "lista":
            dados[chave_atual] = buffer_lista
        elif modo == "texto":
            dados[chave_atual] = " ".join(buffer_texto).strip()

    return dados, corpo


def descobrir_agentes(pasta_codex: Path = AGENTES_CODEX, pasta_global: Path = None):
    """Normaliza catálogos de agentes sem eleger um motor como fonte única.

    O parâmetro `pasta_codex` fica na assinatura por compatibilidade com testes
    antigos. O pipeline local da Luana foi arquivado e não alimenta mais o
    catálogo público.
    """
    achados = {}

    def adicionar(dados: dict, adaptador: str):
        id_ = str(dados["id"]).replace("_", "-")
        dados = {**dados, "id": id_, "nome": id_, "adaptadores": [adaptador]}
        anterior = achados.get(id_)
        if anterior is None:
            achados[id_] = dados
            return
        anterior["adaptadores"] = sorted(set(anterior["adaptadores"] + [adaptador]))
        # O manifesto mais novo governa descrição/modelo, sem perder a origem
        # operacional neutra nem multiplicar um mesmo papel na tela.
        if dados["modificado"] > anterior["modificado"]:
            anterior.update({k: v for k, v in dados.items() if k != "adaptadores"})
            anterior["adaptadores"] = sorted(set(anterior["adaptadores"] + [adaptador]))

    def coletar(pasta: Path, squad: str, origem: str, profundidade: int):
        if not pasta.is_dir():
            return
        padrao = "*.md" if profundidade == 1 else "*/agents/*.md"
        for arq in sorted(pasta.glob(padrao)):
            if ".bak" in arq.name:
                continue
            fm, corpo = ler_frontmatter(arq)
            if not fm or not fm.get("name"):
                continue  # sem name no frontmatter nao e subagente invocavel
            texto = arq.read_text(encoding="utf-8", errors="replace")
            ferramentas = fm.get("tools")
            if isinstance(ferramentas, str):
                ferramentas = [t.strip() for t in ferramentas.split(",") if t.strip()]
            descricao = _texto_de_tela(fm.get("description", "") or "sem descrição pública")
            if auditar_estado_publico(descricao, "descricao"):
                descricao = "[descrição omitida: dado privado]"
            id_ = str(fm["name"]).replace("_", "-")
            adicionar(
                {
                    "id": id_,
                    "nome": id_,
                    "descricao": descricao,
                    "modelo": fm.get("model") or None,
                    "ferramentas": ferramentas or None,
                    "squad": squad,
                    "regente": (id_ in ("iris", "elza")) or bool(fm.get("regente")) or (fm.get("tier") == 0),
                    "origem": "catálogo operacional normalizado",
                    "arquivo": f"agente:{squad}/{id_}",
                    "linhas": texto.count("\n") + 1,
                    "bytes": arq.stat().st_size,
                    "modificado": datetime.fromtimestamp(
                        arq.stat().st_mtime, tz=timezone.utc
                    ).isoformat(),
                },
                origem,
            )

    alvo_global = pasta_global if pasta_global is not None else AGENTES_GLOBAIS
    coletar(alvo_global, "global", "catálogo global", 1)
    if alvo_global.is_dir():
        for sub in sorted(alvo_global.iterdir()):
            if sub.is_dir() and (sub / "agents").is_dir():
                sq = MAPA_PASTA_SQUAD.get(sub.name.lower(), "desconhecido")
                orig = SQUADS.get(sq, {}).get("nome", f"squad {sub.name}")
                coletar(sub / "agents", sq, orig, 1)

    # Os packs (copy-squad, brand-squad, ...) nao tem name: no frontmatter,
    # entao nao sao subagentes invocaveis e ficam de fora de proposito.
    return list(achados.values())


RE_AGENT_ID = re.compile(r"agentId:\s*([0-9a-f]{6,40})")

# ‼️ O QUE SEPARA LANCAMENTO DE RETORNO (medido em 10/09/2026).
#
# Ate hoje o painel contava como RETORNO qualquer `tool_result` que respondesse
# a chamada. Medido: de 1.020 chamadas, 1.020 tinham resultado, e 936 desses
# resultados eram o RECIBO `Async agent launched successfully`. O painel escrevia
# 99,7% de retorno e media LANCAMENTO. E a mesma familia do "agendamento nao e
# reuniao": o sistema registra o que ELE faz e alguem le como o que ACONTECEU.
#
# O agente async devolve o relatorio DEPOIS, numa `<task-notification>` que
# chega no transcript de quem chamou. Ela e a unica prova, no transcript, de que
# o relatorio voltou, e o discriminador dela e o `<subagent_tokens>`: comando de
# fundo (`Bash` em background) tambem produz notificacao, e nao tem esse campo.
RECIBO_DE_LANCAMENTO = "Async agent launched"
RE_ID_DE_CHAMADA = re.compile(rb"toolu_[A-Za-z0-9_-]+")
RE_NOTIFICACAO = re.compile(r"<task-notification>.*?</task-notification>", re.S)
RE_NOTIFICACAO_CHAMADA = re.compile(r"<tool-use-id>(toolu_[A-Za-z0-9_-]+)</tool-use-id>")


def _notificacoes_de_agente(linha: dict):
    """
    Os ids de chamada cujo AGENTE terminou e entregou relatorio, nesta linha.

    Devolve `(ids, sem_par)`. `sem_par` conta a notificacao de agente que nao
    traz `<tool-use-id>`: ela existe no formato antigo do harness e nao da pra
    casar com chamada nenhuma. Sem esse contador o numero pareceria completo,
    e ele e PISO: o que nao casa desaparece pro lado de reprovar.
    """
    mensagem = linha.get("message")
    if not isinstance(mensagem, dict):
        return set(), 0
    conteudo = mensagem.get("content")
    if isinstance(conteudo, str):
        textos = [conteudo]
    elif isinstance(conteudo, list):
        textos = [
            b.get("text", "")
            for b in conteudo
            if isinstance(b, dict) and b.get("type") == "text"
        ]
    else:
        return set(), 0
    ids = set()
    sem_par = 0
    for texto in textos:
        if "<task-notification>" not in texto:
            continue
        for bloco in RE_NOTIFICACAO.findall(texto):
            if "<subagent_tokens>" not in bloco:
                continue  # notificacao de comando de fundo, nao de agente
            if "<status>completed</status>" not in bloco:
                continue  # morto, morto no lancamento ou interrompido nao e retorno
            achado = RE_NOTIFICACAO_CHAMADA.search(bloco)
            if achado:
                ids.add(achado.group(1))
            else:
                sem_par += 1
    return ids, sem_par


# Nomes que o Claude Code traz embutidos: sao chamados como subagente mas nao
# tem cargo, persona, memoria nem modelo escolhido. Nao e uma lista chumbada
# de "quem e de fora": QUEM E DA CASA sai do frontmatter medido em
# descobrir_agentes(), e de fora e todo o resto. Cargo novo entra sozinho.
SESSAO_POR_PROJETO = {
    "-opt-gastaomatos-luana": "Luana",
    "-opt-gastaomatos-renato": "Renato",
    "-opt-gastaomatos-bia": "Bia",
}


def _blocos_de_ferramenta(linha: dict):
    """Os blocos tool_use/tool_result da linha, ou nada. Sem adivinhar forma."""
    mensagem = linha.get("message")
    if not isinstance(mensagem, dict):
        return []
    conteudo = mensagem.get("content")
    return conteudo if isinstance(conteudo, list) else []


def _texto_do_resultado(bloco: dict) -> str:
    conteudo = bloco.get("content")
    if isinstance(conteudo, str):
        return conteudo
    if isinstance(conteudo, list):
        return " ".join(
            p.get("text", "") for p in conteudo if isinstance(p, dict)
        )
    return ""


# O harness escreve o MODELO DE VERDADE que rodou a convocação em
# `toolUseResult.resolvedModel` da linha de resultado da ferramenta `Agent`,
# nao no `tool_use` que pediu o despacho (pedido nao e resolucao: `model` pode
# vir omitido no despacho e o harness escolhe o padrao). Medido em 19/09/2026
# contra transcript real: os 840 casos de `resolvedModel` na sessao da Luana
# vieram, sem excecao, de um `tool_result` cujo `tool_use_id` aponta pra um
# `tool_use` com `name == "Agent"`. E' por isso que a extracao mora no MESMO
# lugar que ja le `tool_result` (`respondidas_locais`, `nasceu_locais`), e nao
# precisa checar o nome da ferramenta de novo: o campo so existe ali.
#
# RE_MODELO_SUFIXO_DATA tira o carimbo de data que alguns ids de modelo trazem
# (ex.: "claude-haiku-4-5-20251001"), pra nao contar a mesma familia de modelo
# como itens diferentes so porque o snapshot mudou de dia. O que sobra
# ("claude-haiku-4-5") ainda diferencia versao maior/menor.
RE_MODELO_SUFIXO_DATA = re.compile(r"-\d{8}$")


def _rotulo_modelo(bruto: str) -> str:
    """"claude-sonnet-5" -> "sonnet-5"; "claude-haiku-4-5-20251001" -> "haiku-4-5".

    Nao existe lista de modelos conhecidos aqui de proposito: um modelo novo
    tem que aparecer sozinho na tela, com o rotulo que sobra deste corte, e
    nunca cair num "outro" que esconde qual foi. Se o valor nao bater no
    formato esperado ("claude-" na frente), ele sai INTEIRO: rotulo que
    esconde um id desconhecido e pior que rotulo feio.
    """
    if not isinstance(bruto, str) or not bruto.strip():
        return "desconhecido"
    sem_data = RE_MODELO_SUFIXO_DATA.sub("", bruto.strip())
    sem_prefixo = sem_data.removeprefix("claude-")
    return sem_prefixo or bruto


def _apelido_codex(caminho_agente: str | None, apelidos: dict[str, str]) -> str:
    """Nome público estável sem publicar o caminho/tarefa, que pode citar cliente."""
    if not caminho_agente:
        return "Luana"
    apelido = apelidos.get(caminho_agente)
    if apelido and re.fullmatch(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_-]{0,39}", apelido):
        return apelido
    anonimo = hashlib.sha256(caminho_agente.encode("utf-8")).hexdigest()[:6]
    return f"agente Codex {anonimo}"


_CACHE_JSONL_CODEX = {}


def _ler_convocacoes_codex(pasta=PASTAS_SESSOES_CODEX):
    """Lê somente metadados estruturados de colaboração dos rollouts Codex.

    Briefings, mensagens e respostas podem conter dados de cliente e são
    deliberadamente ignorados. A identidade pública vem do apelido gerado pelo
    runtime; o caminho da tarefa só alimenta um hash quando esse apelido falta.
    """
    vazio = {
        "chamadas": {}, "retornos": {}, "arestas": {}, "arquivos": 0,
        "repetidas_descartadas": 0, "erro": None, "lista_chamadas": [],
    }
    if isinstance(pasta, (list, tuple)):
        pastas = [Path(p) for p in pasta if Path(p).is_dir()]
    elif isinstance(pasta, (str, Path)) and Path(pasta).is_dir():
        pastas = [Path(pasta)]
    else:
        pastas = []

    if not pastas:
        vazio["erro"] = "catálogo de sessões Codex não encontrado"
        return vazio

    arquivos = []
    for p in pastas:
        arquivos.extend(sorted(p.rglob("*.jsonl")))
    metadados = {}
    apelidos = {}
    concluidos = {}
    linhas_por_arquivo = {}
    for arq in arquivos:
        try:
            st = arq.stat()
            chave_cache = (str(arq), st.st_mtime_ns, st.st_size)
        except OSError:
            continue
        if chave_cache in _CACHE_JSONL_CODEX:
            linhas = _CACHE_JSONL_CODEX[chave_cache]
        else:
            linhas = []
            try:
                with arq.open("r", encoding="utf-8", errors="replace") as fh:
                    for bruta in fh:
                        try:
                            linha = json.loads(bruta)
                        except (ValueError, UnicodeDecodeError):
                            continue
                        if isinstance(linha, dict):
                            linhas.append(linha)
                _CACHE_JSONL_CODEX[chave_cache] = linhas
            except OSError:
                continue
        linhas_por_arquivo[arq] = linhas
        # Um rollout pode carregar session_meta herdado. O último que declara
        # agent_path é o dono do arquivo; sem agent_path, é a sessão Luana.
        candidatos = [
            (x.get("timestamp"), x.get("payload", {})) for x in linhas
            if x.get("type") == "session_meta" and isinstance(x.get("payload"), dict)
        ]
        # O primeiro session_meta e o rollout deste arquivo; os seguintes sao
        # ancestrais herdados pelo fork. Em subagente de segundo nivel, escolher
        # o ultimo `agent_path` atribuia a sessao ao PAI e fabricava a aresta.
        # O id proprio tambem aparece no nome do rollout, entao ele e a ancora
        # preferida; o primeiro registro e o fallback para amostras antigas.
        proprio = next(
            (
                par for par in candidatos
                if isinstance(par[1].get("id"), str) and par[1]["id"] in arq.name
            ),
            candidatos[0] if candidatos else (None, {}),
        )
        inicio_texto, dono = proprio
        caminho = dono.get("agent_path") if isinstance(dono.get("agent_path"), str) else None
        metadados[arq] = caminho
        if caminho and isinstance(dono.get("agent_nickname"), str):
            apelidos[caminho] = dono["agent_nickname"]
        if caminho:
            try:
                inicio = datetime.fromisoformat(str(inicio_texto).replace("Z", "+00:00")).timestamp()
            except (TypeError, ValueError):
                inicio = None

            def conclusao_deste_rollout(registro):
                if registro.get("type") != "event_msg" or not isinstance(registro.get("payload"), dict):
                    return False
                evento = registro["payload"]
                if evento.get("type") != "task_complete":
                    return False
                # Um fork com historico inteiro copia task_complete antigos no
                # arquivo novo e redata a linha para o instante do fork. O
                # completed_at preserva o instante real, logo e o discriminador
                # que impede agente ainda ativo de aparecer como concluido.
                completou = evento.get("completed_at")
                return (
                    inicio is not None
                    and type(completou) in {int, float}
                    and completou >= inicio
                )

            concluidos[caminho] = concluidos.get(caminho, 0) + sum(
                1 for x in linhas if conclusao_deste_rollout(x)
            )

    chamadas = {}
    repetidas = 0
    for arq, linhas in linhas_por_arquivo.items():
        chamador_path = metadados.get(arq)
        for linha in linhas:
            payload = linha.get("payload")
            if linha.get("type") != "response_item" or not isinstance(payload, dict):
                continue
            if payload.get("type") not in {"function_call", "custom_tool_call"}:
                continue
            if payload.get("namespace") not in {None, "collaboration"}:
                continue
            ferramenta = payload.get("name")
            if ferramenta not in {"spawn_agent", "followup_task"}:
                continue
            ident = payload.get("call_id") or payload.get("id")
            if not isinstance(ident, str):
                continue
            if ident in chamadas:
                repetidas += 1
                continue
            bruto_args = payload.get("arguments", payload.get("input", "{}"))
            try:
                args = json.loads(bruto_args) if isinstance(bruto_args, str) else bruto_args
            except (TypeError, ValueError):
                continue
            if not isinstance(args, dict):
                continue
            alvo_path = args.get("task_name") if ferramenta == "spawn_agent" else args.get("target")
            if not isinstance(alvo_path, str) or not alvo_path:
                continue
            if not alvo_path.startswith("/"):
                base = chamador_path or "/root"
                alvo_path = f"{base.rstrip('/')}/{alvo_path}"
            chamadas[ident] = (chamador_path, alvo_path, linha.get("timestamp"))

    por_alvo = {}
    arestas = {}
    lista_chamadas = []
    for chamador_path, alvo_path, quando in chamadas.values():
        alvo = _apelido_codex(alvo_path, apelidos)
        chamador = _apelido_codex(chamador_path, apelidos)
        de_tipo = "agente" if chamador_path else "sessao"
        por_alvo.setdefault(alvo, []).append(quando)
        chave = (chamador, de_tipo, alvo)
        arestas[chave] = arestas.get(chave, 0) + 1
        lista_chamadas.append((chamador, de_tipo, alvo, quando))

    retornos = {}
    for alvo, momentos in por_alvo.items():
        caminhos = [p for p in concluidos if _apelido_codex(p, apelidos) == alvo]
        retornos[alvo] = min(len(momentos), sum(concluidos[p] for p in caminhos))
    return {
        "chamadas": por_alvo, "retornos": retornos, "arestas": arestas,
        "arquivos": len(linhas_por_arquivo),
        "repetidas_descartadas": repetidas, "erro": None,
        "lista_chamadas": lista_chamadas,
    }


_CACHE_JSONL_CLAUDE = {}


def ler_convocacoes(projetos: Path = PROJETOS, sessoes_codex: Path = SESSOES_CODEX):
    """
    Le TODA convocacao de subagente e de onde ela partiu.

    O QUE MUDOU EM 08/09/2026, E POR QUE
    ------------------------------------
    Esta funcao lia so os .jsonl da RAIZ de cada projeto, com a justificativa
    escrita de que "um subagente nao invoca outro (hierarquia de 2 niveis)".
    A premissa e FALSA e esta corrigida no CLAUDE.md da casa desde 07/09:
    subagente lanca subagente aqui, e isso e bom (a revisao adversarial
    acontece dentro da cadeia). Medido em 08/09: 205 de 982 chamadas, 20%,
    partiram de subagentes e nao apareciam. O erro nao era parelho, que e o
    que o tornava dificil de ver: `dev` sumia 6% e `Explore` sumia 82%.

    E o instrumento antigo errava para os DOIS lados ao mesmo tempo, o que
    fazia o total parecer plausivel: ele contava ACERTOS DE REGEX POR LINHA,
    e uma chamada a `fork` e gravada duas vezes (no transcript do pai e no do
    filho, que herda o contexto). Medido: 993 linhas, 982 chamadas, 11
    repetidas, todas `fork`. Por isso a contagem aqui e por ID DA CHAMADA
    (`tool_use.id`), que e o unico identificador que nao dobra.

    ⚠️ ESTE CONTADOR E VIVO. Ele muda enquanto a operacao roda: 982 numa
    medicao e 986 quinze minutos depois. Lista viva se compara por NOME, nunca
    por total. Quem for conferir este numero contra outra medicao vai achar
    diferenca sem que exista defeito, e por isso ele nunca aparece na tela sem
    a hora em que foi medido.

    O QUE ISTO NAO SABE, e nao se deduz: PARA QUE a chamada foi feita. A
    descricao que o chamador escreveu nao diz o assunto de verdade (uma
    descrita como "vale juntar os agentes num so?" era sobre outra coisa
    inteiramente). Entao daqui sai QUEM chamou QUEM e QUANTAS vezes, e mais
    nada. Rotulo que interpreta intencao nao existe neste arquivo.
    """
    saida = {
        "por_agente": {},
        "ultima": {},
        "por_agente_24h": {},
        "por_agente_7d": {},
        "retornos_por_agente": {},
        # Notificacao de agente concluido que nao traz o id da chamada. E o
        # tamanho declarado do buraco: sem ele, "retorno" pareceria completo.
        "retornos_sem_par": 0,
        "arestas": [],
        "arquivos": 0,
        "total": 0,
        "repetidas_descartadas": 0,
        "pela_sessao": 0,
        "por_subagente": 0,
        "chamador_nao_resolvido": 0,
        "erro": None,
    }
    saida["por_motor"] = {"claude": 0, "codex": 0}
    saida["arquivos_por_motor"] = {"claude": 0, "codex": 0}
    saida["erros_por_motor"] = {"claude": None, "codex": None}
    # Modelo especifico (sonnet-5, haiku, opus...) so existe pro motor Claude:
    # `resolvedModel` e campo do harness Claude Code, o rollout Codex nao tem
    # equivalente medido. Por isso este contador nunca soma com o de Codex, e
    # a tela precisa dizer isso, nao inventar um "n/a" que parece zero.
    saida["por_modelo"] = {}
    if not projetos.is_dir():
        saida["erros_por_motor"]["claude"] = "catálogo de transcrições Claude não encontrado"

    chamadas = {}   # id da chamada -> (agentId do chamador ou None, alvo, projeto, quando)
    nasceu = {}     # agentId do filho -> id da chamada que o criou
    modelo_de = {}  # id da chamada -> resolvedModel bruto, so quando o resultado trouxe
    repetidas = 0
    arquivos = 0
    # `respondidas`: a chamada recebeu resultado DIRETO, e ele nao e o recibo de
    # lancamento nem erro. E o agente sincrono, que entrega o relatorio ali mesmo.
    # `notificadas`: o agente async avisou que terminou, la na frente.
    respondidas = set()
    notificadas = set()
    notificacoes_sem_par = 0

    for jsonl in sorted(projetos.rglob("*.jsonl")) if projetos.is_dir() else []:
        arquivos += 1
        try:
            st = jsonl.stat()
            chave_cache = (str(jsonl), st.st_mtime_ns, st.st_size)
        except OSError:
            continue

        if chave_cache in _CACHE_JSONL_CLAUDE:
            reg = _CACHE_JSONL_CLAUDE[chave_cache]
            for item in reg["chamadas"]:
                ident, aid, alvo, proj, ts = item
                if ident in chamadas:
                    repetidas += 1
                else:
                    chamadas[ident] = (aid, alvo, proj, ts)
            respondidas |= reg["respondidas"]
            notificadas |= reg["notificadas"]
            notificacoes_sem_par += reg["notificacoes_sem_par"]
            for aid, tid in reg["nasceu"]:
                nasceu.setdefault(aid, tid)
            for ident, modelo in reg.get("modelos", []):
                modelo_de.setdefault(ident, modelo)
            repetidas += reg["repetidas_locais"]
            continue

        chamadas_locais = []
        respondidas_locais = set()
        notificadas_locais = set()
        nasceu_locais = []
        modelos_locais = []
        notificacoes_sem_par_locais = 0
        repetidas_locais = 0
        ids_locais = set()

        try:
            with jsonl.open("rb") as fh:
                for bruta in fh:
                    tem_chamada = b"subagent_type" in bruta
                    tem_nascimento = b"agentId:" in bruta
                    tem_notificacao = b"task-notification" in bruta
                    # ‼️ O RELATORIO DO AGENTE SINCRONO NAO PASSA POR NENHUM
                    # DOS TRES FILTROS ACIMA: ele chega num `tool_result` que
                    # nao cita `subagent_type` nem `agentId`. Sem esta quarta
                    # porta, 77 retornos de verdade sumiriam, e o instrumento
                    # erraria pro lado de reprovar sem ninguem ver.
                    # Abrir TODA linha com `tool_use_id` custaria 10x em JSON
                    # (8,3 mil linhas viram 86 mil, medido em 10/09). Entao a
                    # linha so e aberta quando cita um id de chamada JA
                    # CONHECIDO: chamada e resultado moram no mesmo arquivo, e
                    # o resultado vem depois, entao o id ja foi registrado.
                    tem_resposta = False
                    if not (tem_chamada or tem_nascimento or tem_notificacao):
                        if b"tool_use_id" not in bruta:
                            continue
                        tem_resposta = any(
                            achado.decode() in ids_locais or achado.decode() in chamadas
                            for achado in RE_ID_DE_CHAMADA.findall(bruta)
                        )
                        if not tem_resposta:
                            continue
                    try:
                        linha = json.loads(bruta)
                    except (ValueError, UnicodeDecodeError):
                        continue
                    if not isinstance(linha, dict):
                        continue
                    if tem_notificacao:
                        ids, sem_par = _notificacoes_de_agente(linha)
                        notificadas_locais |= ids
                        notificacoes_sem_par_locais += sem_par
                    projeto = jsonl.relative_to(projetos).parts[0]
                    for bloco in _blocos_de_ferramenta(linha):
                        if not isinstance(bloco, dict):
                            continue
                        tipo = bloco.get("type")
                        if tipo == "tool_use":
                            entrada = bloco.get("input")
                            alvo = entrada.get("subagent_type") if isinstance(entrada, dict) else None
                            ident = bloco.get("id")
                            if not alvo or not ident:
                                continue
                            if ident in ids_locais or ident in chamadas:
                                repetidas_locais += 1
                                continue
                            ids_locais.add(ident)
                            chamadas_locais.append((
                                ident,
                                linha.get("agentId"),
                                alvo,
                                projeto,
                                linha.get("timestamp"),
                            ))
                        elif tipo == "tool_result":
                            texto = _texto_do_resultado(bloco)
                            if (
                                bloco.get("tool_use_id")
                                and not bloco.get("is_error")
                                and not texto.startswith(RECIBO_DE_LANCAMENTO)
                            ):
                                respondidas_locais.add(bloco.get("tool_use_id"))
                            achado = RE_AGENT_ID.search(texto)
                            if achado:
                                nasceu_locais.append((achado.group(1), bloco.get("tool_use_id")))
                            # O modelo resolvido vem no toolUseResult DA LINHA,
                            # nao dentro do bloco: ver o comentario de
                            # _rotulo_modelo. So conta quando o resultado esta
                            # amarrado a uma chamada (tool_use_id presente).
                            resultado_bruto = linha.get("toolUseResult")
                            modelo_bruto = (
                                resultado_bruto.get("resolvedModel")
                                if isinstance(resultado_bruto, dict) else None
                            )
                            if isinstance(modelo_bruto, str) and modelo_bruto and bloco.get("tool_use_id"):
                                modelos_locais.append((bloco.get("tool_use_id"), modelo_bruto))
        except OSError:
            continue

        _CACHE_JSONL_CLAUDE[chave_cache] = {
            "chamadas": chamadas_locais,
            "respondidas": respondidas_locais,
            "notificadas": notificadas_locais,
            "nasceu": nasceu_locais,
            "modelos": modelos_locais,
            "notificacoes_sem_par": notificacoes_sem_par_locais,
            "repetidas_locais": repetidas_locais,
        }
        for item in chamadas_locais:
            ident, aid, alvo, proj, ts = item
            if ident in chamadas:
                repetidas += 1
            else:
                chamadas[ident] = (aid, alvo, proj, ts)
        respondidas |= respondidas_locais
        notificadas |= notificadas_locais
        notificacoes_sem_par += notificacoes_sem_par_locais
        for aid, tid in nasceu_locais:
            nasceu.setdefault(aid, tid)
        for ident, modelo in modelos_locais:
            modelo_de.setdefault(ident, modelo)
        repetidas += repetidas_locais

    # O agentId de um subagente vira CARGO pela chamada que o criou. Sem isso o
    # chamador seria um id hexadecimal, que nao diz nada a quem le a tela.
    cargo_de = {
        aid: chamadas[ident][1]
        for aid, ident in nasceu.items()
        if ident in chamadas
    }

    arestas = {}
    todas_chamadas = []
    agora = agora_utc()
    for ident, (chamador, alvo, projeto, quando) in chamadas.items():
        saida["por_agente"][alvo] = saida["por_agente"].get(alvo, 0) + 1
        if ident in notificadas or ident in respondidas:
            saida["retornos_por_agente"][alvo] = saida["retornos_por_agente"].get(alvo, 0) + 1
        if quando and (alvo not in saida["ultima"] or quando > saida["ultima"][alvo]):
            saida["ultima"][alvo] = quando
        try:
            instante = datetime.fromisoformat(str(quando).replace("Z", "+00:00"))
            if instante.tzinfo is None:
                instante = instante.replace(tzinfo=timezone.utc)
            idade = agora - instante.astimezone(timezone.utc)
            if timedelta(0) <= idade <= timedelta(hours=24):
                saida["por_agente_24h"][alvo] = saida["por_agente_24h"].get(alvo, 0) + 1
            if timedelta(0) <= idade <= timedelta(days=7):
                saida["por_agente_7d"][alvo] = saida["por_agente_7d"].get(alvo, 0) + 1
        except (TypeError, ValueError):
            pass

        if chamador:
            saida["por_subagente"] += 1
            de = cargo_de.get(chamador)
            de_tipo = "agente"
            if de is None:
                # agentId que nao casou com chamada nenhuma: o transcript que o
                # criou pode ter sido apagado. Vira "nao resolvido" declarado,
                # nunca um nome chutado.
                saida["chamador_nao_resolvido"] += 1
                de, de_tipo = "não resolvido", "desconhecido"
        else:
            saida["pela_sessao"] += 1
            nome = SESSAO_POR_PROJETO.get(projeto)
            if nome is None:
                # Nome de projeto do Claude é caminho codificado (ex.:
                # ``-home-usuario``). Publicá-lo sem a barra inicial ainda
                # revela a estrutura privada e escapa do detector de caminhos.
                # O sufixo mantém sessões distintas sem expor de onde vieram.
                anonimo = hashlib.sha256(projeto.encode("utf-8")).hexdigest()[:6]
                nome = f"sessão externa {anonimo}"
            de, de_tipo = nome, "sessao"

        chave = (de, de_tipo, alvo)
        arestas[chave] = arestas.get(chave, 0) + 1
        todas_chamadas.append((de, de_tipo, alvo, quando))

    saida["arestas"] = [
        {"de": de, "de_tipo": de_tipo, "para": para, "vezes": n}
        for (de, de_tipo, para), n in sorted(
            arestas.items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][2])
        )
    ]
    # So conta pra `por_modelo` o ident que sobreviveu a deduplicacao de
    # `chamadas` (a mesma regra de "id da chamada, nao linha" usada no total).
    # Chamada sem resultado ainda medido (agente async que nao voltou, erro
    # antes do harness resolver o modelo) fica de fora, e por isso a soma de
    # `por_modelo` pode ser MENOR que `por_motor.claude`: e' piso, nao total.
    for ident, modelo_bruto in modelo_de.items():
        if ident not in chamadas:
            continue
        rotulo = _rotulo_modelo(modelo_bruto)
        saida["por_modelo"][rotulo] = saida["por_modelo"].get(rotulo, 0) + 1

    saida["por_motor"]["claude"] = len(chamadas)
    saida["arquivos_por_motor"]["claude"] = arquivos
    saida["retornos_sem_par"] = notificacoes_sem_par

    codex = _ler_convocacoes_codex(sessoes_codex)
    saida["erros_por_motor"]["codex"] = codex["erro"]
    saida["por_motor"]["codex"] = sum(len(v) for v in codex["chamadas"].values())
    saida["arquivos_por_motor"]["codex"] = codex["arquivos"]
    for alvo, momentos in codex["chamadas"].items():
        saida["por_agente"][alvo] = saida["por_agente"].get(alvo, 0) + len(momentos)
        validos = [m for m in momentos if isinstance(m, str)]
        if validos:
            ultimo = max(validos)
            if alvo not in saida["ultima"] or ultimo > saida["ultima"][alvo]:
                saida["ultima"][alvo] = ultimo
            for momento in validos:
                try:
                    instante = datetime.fromisoformat(momento.replace("Z", "+00:00"))
                    idade = agora - instante.astimezone(timezone.utc)
                    if timedelta(0) <= idade <= timedelta(hours=24):
                        saida["por_agente_24h"][alvo] = saida["por_agente_24h"].get(alvo, 0) + 1
                    if timedelta(0) <= idade <= timedelta(days=7):
                        saida["por_agente_7d"][alvo] = saida["por_agente_7d"].get(alvo, 0) + 1
                except (TypeError, ValueError):
                    pass
        saida["retornos_por_agente"][alvo] = saida["retornos_por_agente"].get(alvo, 0) + codex["retornos"].get(alvo, 0)
    for chave, quantidade in codex["arestas"].items():
        arestas[chave] = arestas.get(chave, 0) + quantidade
        if chave[1] == "sessao":
            saida["pela_sessao"] += quantidade
        else:
            saida["por_subagente"] += quantidade

    saida["arestas"] = [
        {"de": de, "de_tipo": de_tipo, "para": para, "vezes": n}
        for (de, de_tipo, para), n in sorted(arestas.items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][2]))
    ]
    saida["arquivos"] = arquivos + codex["arquivos"]
    todas_chamadas.extend(codex.get("lista_chamadas", []))
    saida["todas_chamadas"] = todas_chamadas
    saida["total"] = len(todas_chamadas)
    saida["repetidas_descartadas"] = repetidas + codex["repetidas_descartadas"]
    erros = [x for x in saida["erros_por_motor"].values() if x]
    saida["erro"] = "; ".join(erros) if erros else None
    return saida


def agregar_janelas_convocacoes(todas_chamadas, ids_casa, agora_referencia=None):
    """Agrega as chamadas nas janelas: 'hoje', '7d', '30d' e 'total'.
    Fuso de São Paulo (America/Sao_Paulo) para 'hoje', '7d' e '30d'.
    """
    if agora_referencia is None:
        agora_sp = datetime.now(FUSO_SP)
    else:
        agora_sp = agora_referencia.astimezone(FUSO_SP) if agora_referencia.tzinfo else agora_referencia.replace(tzinfo=FUSO_SP)

    inicio_hoje_sp = agora_sp.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_7d_sp = inicio_hoje_sp - timedelta(days=6)
    inicio_30d_sp = inicio_hoje_sp - timedelta(days=29)

    janelas = {
        "hoje": {
            "rotulo": "Hoje",
            "filtro": lambda t: t is not None and t >= inicio_hoje_sp,
            "arestas_map": {},
            "por_agente": {},
            "total": 0,
            "fora_da_casa": {},
        },
        "7d": {
            "rotulo": "Últimos 7 dias",
            "filtro": lambda t: t is not None and t >= inicio_7d_sp,
            "arestas_map": {},
            "por_agente": {},
            "total": 0,
            "fora_da_casa": {},
        },
        "30d": {
            "rotulo": "Últimos 30 dias",
            "filtro": lambda t: t is not None and t >= inicio_30d_sp,
            "arestas_map": {},
            "por_agente": {},
            "total": 0,
            "fora_da_casa": {},
        },
        "total": {
            "rotulo": "Total histórico",
            "filtro": lambda t: True,
            "arestas_map": {},
            "por_agente": {},
            "total": 0,
            "fora_da_casa": {},
        },
    }

    for de, de_tipo, alvo, quando in todas_chamadas:
        t_sp = None
        if quando:
            try:
                instante = datetime.fromisoformat(str(quando).replace("Z", "+00:00"))
                if instante.tzinfo is None:
                    instante = instante.replace(tzinfo=timezone.utc)
                t_sp = instante.astimezone(FUSO_SP)
            except (TypeError, ValueError):
                t_sp = None

        chave = (de, de_tipo, alvo)
        for j_key, j_data in janelas.items():
            if j_data["filtro"](t_sp):
                j_data["total"] += 1
                j_data["arestas_map"][chave] = j_data["arestas_map"].get(chave, 0) + 1
                j_data["por_agente"][alvo] = j_data["por_agente"].get(alvo, 0) + 1
                if alvo not in ids_casa:
                    j_data["fora_da_casa"][alvo] = j_data["fora_da_casa"].get(alvo, 0) + 1

    resultado = {}
    for j_key, j_data in janelas.items():
        arestas_lista = [
            {"de": de, "de_tipo": de_tipo, "para": para, "vezes": n}
            for (de, de_tipo, para), n in sorted(
                j_data["arestas_map"].items(), key=lambda kv: (-kv[1], kv[0][0], kv[0][2])
            )
            if n > 0
        ]
        resultado[j_key] = {
            "rotulo": j_data["rotulo"],
            "total": j_data["total"],
            "por_agente": j_data["por_agente"],
            "arestas": arestas_lista,
            "convocacoes_fora_da_casa": j_data["fora_da_casa"],
            "mapa_src": f"/mapas/quem-convoca-quem-{j_key}.html",
        }
    return resultado


def gerar_workflow_quem_convoca_quem(janela_key: str, janela_info: dict, agentes: list, squads: dict) -> dict:
    rotulo = janela_info.get("rotulo", janela_key)
    arestas = janela_info.get("arestas", [])
    por_agente = janela_info.get("por_agente", {})
    fora_da_casa = janela_info.get("convocacoes_fora_da_casa", {})

    diretores = [
        {"id": "luana", "label": "Luana", "sublabel": "CEO Operacional", "col": 0},
        {"id": "renato", "label": "Renato", "sublabel": "CRO Comercial", "col": 0, "color": COR_RENATO},
        {"id": "bia", "label": "Bia", "sublabel": "Tráfego & IA", "col": 0},
    ]
    ids_diretores = {d["id"] for d in diretores}

    especialistas_por_squad = {}
    for ag in agentes:
        ag_id = ag.get("id")
        if not ag_id or ag_id in ids_diretores:
            continue
        squad_id = ag.get("squad", "global")
        especialistas_por_squad.setdefault(squad_id, []).append({
            "id": ag_id,
            "label": ag.get("nome", ag_id),
            "sublabel": ag.get("funcao", squad_id),
            "squad": squad_id,
        })

    qtd_fora = sum(fora_da_casa.values())
    nos_outros = []
    if qtd_fora > 0 or len(fora_da_casa) > 0:
        nos_outros.append({
            "id": "outros",
            "label": f"outros ({len(fora_da_casa)})",
            "sublabel": f"{qtd_fora} chamada{'s' if qtd_fora != 1 else ''} sem ficha",
            "type": "external",
        })

    ordem_squads = [s for s in ("global", "conteudo", "comercial") if s in especialistas_por_squad]
    ordem_squads.extend(sorted(s for s in especialistas_por_squad if s not in ordem_squads))

    def distribuir_colunas(limite_linhas: int) -> list[dict]:
        colunas = []
        for squad_id in ordem_squads:
            itens = especialistas_por_squad[squad_id]
            partes = max(1, math.ceil(len(itens) / limite_linhas))
            tamanho = math.ceil(len(itens) / partes)
            for inicio in range(0, len(itens), tamanho):
                colunas.append({"squad": squad_id, "itens": itens[inicio:inicio + tamanho]})
        return colunas

    colunas_agentes = []
    for limite_linhas in range(6, 16):
        colunas_agentes = distribuir_colunas(limite_linhas)
        if len(colunas_agentes) <= 5:
            break
    if len(colunas_agentes) > 5:
        colunas_agentes = [
            *colunas_agentes[:4],
            {
                "squad": colunas_agentes[4]["squad"],
                "itens": [item for coluna in colunas_agentes[4:] for item in coluna["itens"]],
            },
        ]
    if nos_outros:
        if colunas_agentes and len(colunas_agentes[-1]["itens"]) < 8:
            colunas_agentes[-1]["itens"].extend(nos_outros)
        elif len(colunas_agentes) < 5:
            colunas_agentes.append({"squad": "outros", "itens": nos_outros})
        else:
            colunas_agentes[-1]["itens"].extend(nos_outros)

    nodes = []
    def offsets_centralizados(qtd: int, passo: int) -> list[int]:
        inicio = -((qtd - 1) * passo) / 2
        return [round(inicio + i * passo) for i in range(qtd)]

    for d, y_offset in zip(diretores, offsets_centralizados(len(diretores), 82)):
        node = {
            "id": d["id"],
            "lane": "diretoria",
            "col": d["col"],
            "type": "frontend",
            "label": d["label"],
            "sublabel": d["sublabel"],
            "width": 136,
            "yOffset": y_offset,
        }
        nodes.append(node)

    colunas_squad = {}
    for idx_col, coluna in enumerate(colunas_agentes, start=1):
        colunas_squad.setdefault(coluna["squad"], []).append(idx_col)
        for item, y_offset in zip(coluna["itens"], offsets_centralizados(len(coluna["itens"]), 90)):
            nodes.append({
                "id": item["id"],
                "lane": "operacao",
                "col": idx_col,
                "type": item.get("type", "backend"),
                "label": item["label"],
                "sublabel": item["sublabel"],
                "width": 124 if item.get("type") != "external" else 136,
                "yOffset": y_offset,
            })

    ids_todos_nodes = {n["id"] for n in nodes}
    origem_diretor_por_rotulo = {}
    for d in diretores:
        for chave in (d.get("id"), d.get("label")):
            if isinstance(chave, str):
                origem_diretor_por_rotulo[chave.casefold()] = d["id"]
    origem_fallback = (
        "luana"
        if "luana" in ids_todos_nodes
        else (sorted(ids_todos_nodes)[0] if ids_todos_nodes else "sessao")
    )
    edges_map = {}
    for a in arestas:
        origem = a.get("de")
        destino = a.get("para")
        vezes = a.get("vezes", 0)
        if vezes <= 0:
            continue
        if isinstance(origem, str):
            origem = origem_diretor_por_rotulo.get(origem.casefold(), origem)
        if destino not in ids_todos_nodes:
            destino = "outros" if "outros" in ids_todos_nodes else None
        if not destino:
            continue
        if origem not in ids_todos_nodes:
            origem = origem_fallback

        chave_edge = (origem, destino)
        edges_map[chave_edge] = edges_map.get(chave_edge, 0) + vezes

    edges = []
    for (src, dst), n in sorted(edges_map.items(), key=lambda kv: -kv[1]):
        edge_id = f"{src}-{dst}"
        variant = "emphasis" if n >= 20 else ("default" if n >= 5 else "dashed")
        role = "main" if n >= 15 else "branch"
        edges.append({
            "id": edge_id,
            "from": src,
            "to": dst,
            "label": f"{n} chamada{'s' if n != 1 else ''}",
            "variant": variant,
            "role": role,
            "width": min(4, max(1.2, n / 10)),
        })

    return {
        "schema_version": 2,
        "diagram_type": "workflow",
        "meta": {
            "title": f"Quem convoca quem ({rotulo})",
            "animation": "trace",
            "quality_profile": "showcase",
            "output": f"quem-convoca-quem-{janela_key}.html",
        },
        "lanes": [
            {"id": "diretoria", "label": "Diretoria"},
            {"id": "operacao", "label": "Operação e Especialistas"},
        ],
        "phases": [
            {"id": "comando", "label": "Diretoria", "fromCol": 0, "toCol": 0, "variant": "emphasis"},
            *[
                {
                    "id": f"squad-{squad_id}",
                    "label": squads.get(squad_id, {}).get("nome", squad_id),
                    "fromCol": min(colunas),
                    "toCol": max(colunas),
                }
                for squad_id, colunas in colunas_squad.items()
            ],
        ],
        "nodes": nodes,
        "edges": edges,
    }


def _cor_hex_rgba(cor: str, alfa: float) -> str:
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", str(cor).strip())
    if not m:
        return "rgba(126, 231, 135, 0.15)"
    valor = m.group(1)
    r = int(valor[0:2], 16)
    g = int(valor[2:4], 16)
    b = int(valor[4:6], 16)
    return f"rgba({r}, {g}, {b}, {alfa})"


def _sem_espaco_fim_de_linha(texto: str) -> str:
    resultado = "\n".join(linha.rstrip() for linha in texto.splitlines())
    return resultado + ("\n" if texto.endswith("\n") else "")


def renderizar_html_workflow_quem_convoca_quem(workflow: dict) -> str:
    meta = workflow.get("meta", {})
    titulo = meta.get("title", "Quem convoca quem")
    nodes = workflow.get("nodes", [])
    edges = workflow.get("edges", [])
    total_convocacoes = 0
    for edge in edges:
        m_chamadas = re.match(r"(\d+)\s+chamada", str(edge.get("label", "")))
        if m_chamadas:
            total_convocacoes += int(m_chamadas.group(1))

    col_width = 200
    start_x = 40
    start_y = 60
    card_w = 160
    card_h = 60

    nodes_by_col = {}
    for n in nodes:
        c = n.get("col", 0)
        nodes_by_col.setdefault(c, []).append(n)

    max_rows = max((len(cols) for cols in nodes_by_col.values()), default=1)
    max_cols = max(nodes_by_col.keys(), default=0) + 1

    svg_w = max(900, start_x * 2 + max_cols * col_width)
    svg_h = max(550, start_y * 2 + max_rows * 85 + 40)

    node_positions = {}
    for col_idx, col_nodes in nodes_by_col.items():
        x = start_x + col_idx * col_width
        for row_idx, n in enumerate(col_nodes):
            y = start_y + row_idx * 85
            node_positions[n["id"]] = (x, y)

    svg_nodes = []
    for n in nodes:
        nid = n["id"]
        pos = node_positions.get(nid, (start_x, start_y))
        x, y = pos
        label = n.get("label", nid)
        sublabel = n.get("sublabel", "")
        ntype = n.get("type", "backend")
        eh_diretor = n.get("lane") == "diretoria"

        cor_borda = COR_RENATO if nid == "renato" else ("#7ee787" if eh_diretor else ("#58a6ff" if ntype == "backend" else "#f0883e"))
        badge_bg = _cor_hex_rgba(cor_borda, 0.15) if nid == "renato" else ("rgba(126, 231, 135, 0.15)" if eh_diretor else "rgba(88, 166, 255, 0.15)")
        badge_cor = cor_borda
        badge = "DIR" if eh_diretor else ntype[:3].upper()

        svg_nodes.append(f"""
        <g class="node-group" id="node-{nid}" transform="translate({x}, {y})">
          <rect width="{card_w}" height="{card_h}" rx="8" class="card-bg" stroke="{cor_borda}" stroke-width="1.5"/>
          <text x="12" y="24" class="node-title">{label}</text>
          <text x="12" y="44" class="node-sub">{sublabel}</text>
          <rect x="{card_w - 42}" y="8" width="34" height="18" rx="4" fill="{badge_bg}"/>
          <text x="{card_w - 25}" y="21" class="node-badge" fill="{badge_cor}" text-anchor="middle">{badge}</text>
        </g>
        """)

    svg_edges = []
    for e in edges:
        src = e.get("from")
        dst = e.get("to")
        lbl = e.get("label", "")
        if src not in node_positions or dst not in node_positions:
            continue
        x1, y1 = node_positions[src]
        x2, y2 = node_positions[dst]

        if x2 > x1:
            p1 = (x1 + card_w, y1 + card_h / 2)
            p2 = (x2, y2 + card_h / 2)
            cx1 = p1[0] + (p2[0] - p1[0]) * 0.5
            cy1 = p1[1]
            cx2 = p1[0] + (p2[0] - p1[0]) * 0.5
            cy2 = p2[1]
        elif x2 < x1:
            p1 = (x1, y1 + card_h / 2)
            p2 = (x2 + card_w, y2 + card_h / 2)
            cx1 = p1[0] - 40
            cy1 = p1[1]
            cx2 = p2[0] + 40
            cy2 = p2[1]
        else:
            p1 = (x1 + card_w / 2, y1 + card_h)
            p2 = (x2 + card_w / 2, y2)
            cx1 = p1[0] + 40
            cy1 = p1[1] + 20
            cx2 = p2[0] + 40
            cy2 = p2[1] - 20

        mid_x = (p1[0] + p2[0]) / 2
        mid_y = (p1[1] + p2[1]) / 2

        stroke_w = e.get("width", 1.5)
        variant_class = e.get("variant", "default")

        svg_edges.append(f"""
        <g class="edge-group">
          <path d="M {p1[0]} {p1[1]} C {cx1} {cy1}, {cx2} {cy2}, {p2[0]} {p2[1]}" 
                class="edge-path {variant_class}" stroke-width="{stroke_w}" marker-end="url(#arrow)"/>
          <g transform="translate({mid_x}, {mid_y})">
            <rect x="-32" y="-9" width="64" height="18" rx="4" class="edge-label-bg"/>
            <text x="0" y="3.5" class="edge-label-text" text-anchor="middle">{lbl}</text>
          </g>
        </g>
        """)

    return f"""<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{titulo}</title>
  <style>
    :root {{
      --bg: #0e1117;
      --card-bg: #161b22;
      --card-border: #30363d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --edge: #8b949e;
      --edge-emphasis: #7ee787;
      --badge-bg: #21262d;
      --header-bg: rgba(22, 27, 34, 0.85);
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
    }}
    [data-theme="light"] {{
      --bg: #f6f8fa;
      --card-bg: #ffffff;
      --card-border: #d0d7de;
      --text: #1f2328;
      --text-muted: #656d76;
      --edge: #656d76;
      --edge-emphasis: #1a7f37;
      --badge-bg: #eaeef2;
      --header-bg: rgba(255, 255, 255, 0.85);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }}
    .toolbar {{
      height: 48px;
      padding: 0 16px;
      background: var(--header-bg);
      border-bottom: 1px solid var(--card-border);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      z-index: 10;
    }}
    .title-area {{
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }}
    .title {{
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .pill {{
      font-size: 11px;
      font-family: var(--font-mono);
      padding: 2px 8px;
      border-radius: 12px;
      background: var(--badge-bg);
      color: var(--text-muted);
      border: 1px solid var(--card-border);
      white-space: nowrap;
    }}
    .btn {{
      background: var(--badge-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      font-family: var(--font-mono);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s, border-color 0.15s;
    }}
    .btn:hover {{
      border-color: var(--text-muted);
    }}
    .canvas-container {{
      flex: 1;
      width: 100%;
      height: 100%;
      overflow: auto;
      position: relative;
      background-image: radial-gradient(var(--card-border) 1px, transparent 1px);
      background-size: 24px 24px;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }}
    svg {{
      display: block;
      min-width: 100%;
      min-height: 100%;
    }}
    .card-bg {{
      fill: var(--card-bg);
      transition: fill 0.2s, stroke 0.2s;
    }}
    .node-group:hover .card-bg {{
      stroke-width: 2.2px;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
    }}
    .node-title {{
      font-size: 13px;
      font-weight: 600;
      fill: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    .node-sub {{
      font-size: 10.5px;
      fill: var(--text-muted);
      font-family: var(--font-mono);
    }}
    .node-badge {{
      font-size: 9px;
      font-weight: 700;
      font-family: var(--font-mono);
    }}
    .edge-path {{
      fill: none;
      stroke: var(--edge);
      stroke-opacity: 0.65;
      transition: stroke 0.2s, stroke-width 0.2s;
    }}
    .edge-path.emphasis {{
      stroke: var(--edge-emphasis);
      stroke-opacity: 0.85;
    }}
    .edge-path.dashed {{
      stroke-dasharray: 4, 4;
    }}
    .edge-group:hover .edge-path {{
      stroke-opacity: 1;
      stroke: #7ee787;
    }}
    .edge-label-bg {{
      fill: var(--card-bg);
      stroke: var(--card-border);
      stroke-width: 1px;
    }}
    .edge-label-text {{
      font-size: 9px;
      font-family: var(--font-mono);
      fill: var(--text-muted);
      font-weight: 500;
    }}
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title-area">
      <span class="title">⚡ {titulo}</span>
      <span class="pill">{total_convocacoes} chamadas</span>
    </div>
    <div>
      <button class="btn" id="theme-btn" type="button" title="Alternar tema">🌓 Tema</button>
      <button class="btn" id="reset-btn" type="button" title="Centralizar">⛶ Centralizar</button>
    </div>
  </div>
  <div class="canvas-container" id="container">
    <svg viewBox="0 0 {svg_w} {svg_h}" width="{svg_w}" height="{svg_h}">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--edge)"/>
        </marker>
      </defs>
      {"".join(svg_edges)}
      {"".join(svg_nodes)}
    </svg>
  </div>
  <script>
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {{
      themeBtn.addEventListener('click', () => {{
        const html = document.documentElement;
        const cur = html.getAttribute('data-theme') || 'dark';
        html.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark');
      }});
    }}
    const resetBtn = document.getElementById('reset-btn');
    const container = document.getElementById('container');
    if (resetBtn && container) {{
      resetBtn.addEventListener('click', () => {{
        container.scrollTo({{ left: 0, top: 0, behavior: 'smooth' }});
      }});
    }}
  </script>
</body>
</html>
"""


def salvar_mapas_quem_convoca_quem(janelas: dict, agentes: list, squads: dict) -> None:
    """Gera e salva artefatos de mapa (workflow.json e html) para cada janela."""
    for janela_key, j_data in janelas.items():
        wf = gerar_workflow_quem_convoca_quem(janela_key, j_data, agentes, squads)
        wf_json = json.dumps(wf, ensure_ascii=False, indent=2)

        html_conteudo = None
        if ARCHIFY_CLI and ARCHIFY_CLI.exists() and shutil.which("node"):
            try:
                with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp_wf:
                    tmp_wf.write(wf_json)
                    tmp_wf_path = Path(tmp_wf.name)
                tmp_out = tmp_wf_path.with_suffix(".html")
                validacao = subprocess.run(
                    ["node", str(ARCHIFY_CLI), "validate", "workflow", str(tmp_wf_path), "--quality", "showcase", "--json"],
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                if validacao.returncode == 0:
                    entrega = subprocess.run(
                        ["node", str(ARCHIFY_CLI), "deliver", "workflow", str(tmp_wf_path), str(tmp_out), "--quality", "showcase", "--json"],
                        capture_output=True,
                        text=True,
                        timeout=25,
                    )
                    if entrega.returncode == 0 and tmp_out.is_file():
                        html_conteudo = tmp_out.read_text(encoding="utf-8")
                if html_conteudo is None:
                    renderizador_workflow = ARCHIFY_CLI.parent.parent / "renderers" / "workflow" / "render-workflow.mjs"
                    if renderizador_workflow.exists():
                        direto = subprocess.run(
                            ["node", str(renderizador_workflow), str(tmp_wf_path), str(tmp_out)],
                            capture_output=True,
                            text=True,
                            timeout=25,
                        )
                        if direto.returncode == 0 and tmp_out.is_file():
                            html_conteudo = tmp_out.read_text(encoding="utf-8")
                try:
                    tmp_wf_path.unlink(missing_ok=True)
                    tmp_out.unlink(missing_ok=True)
                except OSError:
                    pass
            except Exception:
                html_conteudo = None

        if not html_conteudo:
            html_conteudo = renderizar_html_workflow_quem_convoca_quem(wf)
        html_conteudo = _sem_espaco_fim_de_linha(html_conteudo)

        try:
            DATA_MAPAS.mkdir(parents=True, exist_ok=True)
            (DATA_MAPAS / f"quem-convoca-quem-{janela_key}.html").write_text(html_conteudo, encoding="utf-8")
            (DATA_MAPAS / f"quem-convoca-quem-{janela_key}.workflow.json").write_text(wf_json, encoding="utf-8")
        except OSError:
            pass

        if DIST_MAPAS.parent.exists():
            try:
                DIST_MAPAS.mkdir(parents=True, exist_ok=True)
                (DIST_MAPAS / f"quem-convoca-quem-{janela_key}.html").write_text(html_conteudo, encoding="utf-8")
                (DIST_MAPAS / f"quem-convoca-quem-{janela_key}.workflow.json").write_text(wf_json, encoding="utf-8")
            except OSError:
                pass

        if PUBLIC_MAPAS.exists():
            try:
                alvo_pub = PUBLIC_MAPAS / f"quem-convoca-quem-{janela_key}.html"
                alvo_pub.write_text(html_conteudo, encoding="utf-8")
                (PUBLIC_MAPAS / f"quem-convoca-quem-{janela_key}.workflow.json").write_text(wf_json, encoding="utf-8")
            except OSError:
                pass


def gerar_workflow_setor_comercial() -> dict:
    """Gera o workflow horizontal Archify v2 para o Setor Comercial (aquisição)."""
    return {
        "schema_version": 2,
        "diagram_type": "workflow",
        "meta": {
            "title": "Setor comercial: aquisição de cliente novo",
            "animation": "trace",
            "quality_profile": "showcase",
            "views": [
                {
                    "id": "pipeline-completo",
                    "label": "Pipeline completo",
                    "focus": [
                        "zara", "otto", "bento", "gastao_plano",
                        "maya", "olga", "gastao_textos",
                        "caio", "clay", "hugo"
                    ],
                    "note": "Fluxo horizontal completo de aquisição de cliente novo.",
                },
                {
                    "id": "aprovacoes",
                    "label": "Aprovações do Gastão",
                    "focus": ["gastao_plano", "gastao_textos"],
                    "note": "Gates humanos obrigatórios: aprovação de plano e aprovação de textos com hash.",
                },
            ],
            "output": "web/public/mapas/setor-comercial.html",
        },
        "lanes": [
            {"id": "comercial", "label": "Setor comercial"}
        ],
        "phases": [
            {"id": "regencia", "label": "Regência", "fromCol": 0, "toCol": 0, "variant": "emphasis"},
            {"id": "sinal-plano", "label": "Sinal e plano", "fromCol": 1, "toCol": 3},
            {"id": "aprovacao-plano", "label": "Aprovação", "fromCol": 4, "toCol": 4, "variant": "security"},
            {"id": "texto-fiscal", "label": "Texto e fiscal", "fromCol": 5, "toCol": 7, "variant": "security"},
            {"id": "ativacao-aprendizado", "label": "Ativação, fechamento e aprendizado", "fromCol": 8, "toCol": 10, "variant": "emphasis"},
        ],
        "mainPath": [
            "elza", "zara", "otto", "bento", "gastao_plano",
            "maya", "olga", "gastao_textos",
            "caio", "clay", "hugo"
        ],
        "semanticChecks": {
            "allowedRoots": ["elza"],
            "allowedTerminals": ["hugo"],
            "requiredEdges": [
                {"from": "elza", "to": "zara"},
                {"from": "bento", "to": "gastao_plano"},
                {"from": "gastao_plano", "to": "maya"},
                {"from": "olga", "to": "gastao_textos"},
                {"from": "gastao_textos", "to": "caio"},
            ],
            "requiredPaths": [
                {"from": "elza", "to": "hugo"}
            ]
        },
        "nodes": [
            {"id": "elza", "lane": "comercial", "col": 0, "type": "regente", "label": "Elza", "sublabel": "diretora e regência", "width": 135, "yOffset": 0},
            {"id": "zara", "lane": "comercial", "col": 1, "type": "backend", "label": "Zara", "sublabel": "triagem e ICP", "width": 125, "yOffset": 0},
            {"id": "otto", "lane": "comercial", "col": 2, "type": "backend", "label": "Otto", "sublabel": "radar e sinais", "width": 125, "yOffset": 0},
            {"id": "bento", "lane": "comercial", "col": 3, "type": "backend", "label": "Bento", "sublabel": "estrategista da conta", "width": 135, "yOffset": 0},
            {"id": "gastao_plano", "lane": "comercial", "col": 4, "type": "security", "label": "Gastão", "sublabel": "aprova o plano", "width": 145, "yOffset": 0, "variant": "security"},
            {"id": "maya", "lane": "comercial", "col": 5, "type": "backend", "label": "Maya", "sublabel": "copy e abordagem", "width": 135, "yOffset": 0},
            {"id": "olga", "lane": "comercial", "col": 6, "type": "security", "label": "Olga", "sublabel": "fiscal de copy (PASSA)", "width": 145, "yOffset": 0},
            {"id": "gastao_textos", "lane": "comercial", "col": 7, "type": "security", "label": "Gastão", "sublabel": "aprova textos e hash", "width": 155, "yOffset": 0, "variant": "security"},
            {"id": "caio", "lane": "comercial", "col": 8, "type": "backend", "label": "Caio", "sublabel": "operador de envio", "width": 135, "yOffset": 0},
            {"id": "clay", "lane": "comercial", "col": 9, "type": "backend", "label": "Clay", "sublabel": "closer (reunião)", "width": 125, "yOffset": 0},
            {"id": "hugo", "lane": "comercial", "col": 10, "type": "database", "label": "Hugo", "sublabel": "analista e métricas", "width": 135, "yOffset": 0},
        ],
        "edges": [
            {"id": "elza-zara", "from": "elza", "to": "zara", "label": "orquestra", "variant": "emphasis", "role": "main"},
            {"id": "zara-otto", "from": "zara", "to": "otto", "label": "leads ICP", "variant": "default", "role": "main"},
            {"id": "otto-bento", "from": "otto", "to": "bento", "label": "sinais", "variant": "default", "role": "main"},
            {"id": "bento-gastao", "from": "bento", "to": "gastao_plano", "label": "plano", "variant": "security", "role": "main"},
            {"id": "gastao-maya", "from": "gastao_plano", "to": "maya", "label": "aprovado", "variant": "emphasis", "role": "main"},
            {"id": "maya-olga", "from": "maya", "to": "olga", "label": "peça de copy", "variant": "security", "role": "main"},
            {"id": "olga-gastao", "from": "olga", "to": "gastao_textos", "label": "PASSA", "variant": "security", "role": "main"},
            {"id": "gastao-caio", "from": "gastao_textos", "to": "caio", "label": "liberado", "variant": "emphasis", "role": "main"},
            {"id": "caio-clay", "from": "caio", "to": "clay", "label": "resposta / reunião", "variant": "default", "role": "main"},
            {"id": "clay-hugo", "from": "clay", "to": "hugo", "label": "fechamento e dados", "variant": "dashed", "role": "main"},
        ],
        "cards": []
    }


def renderizar_html_workflow_setor_comercial(workflow: dict) -> str:
    """Renderiza mapa HTML interativo horizontal responsivo para o Setor Comercial."""
    meta = workflow.get("meta", {})
    titulo = meta.get("title", "Setor comercial: aquisição de cliente novo")
    nodes = workflow.get("nodes", [])
    edges = workflow.get("edges", [])

    col_w = 160
    start_x = 35
    card_w = 130
    card_h = 62
    node_y = 120

    phases_info = [
        {"id": "regencia", "nome": "Regência", "fromCol": 0, "toCol": 0, "cor": "#c084fc", "badge": "REGENTE"},
        {"id": "sinal-plano", "nome": "Sinal e plano", "fromCol": 1, "toCol": 3, "cor": "#58a6ff", "badge": "FASE 1"},
        {"id": "aprovacao-plano", "nome": "Aprovação", "fromCol": 4, "toCol": 4, "cor": "#f59e0b", "badge": "GATE HUMANO"},
        {"id": "texto-fiscal", "nome": "Texto e fiscal", "fromCol": 5, "toCol": 7, "cor": "#f59e0b", "badge": "FASE 2 & FISCAL"},
        {"id": "ativacao-aprendizado", "nome": "Ativação, fechamento e dados", "fromCol": 8, "toCol": 10, "cor": "#7ee787", "badge": "FASE 3"},
    ]

    svg_w = start_x * 2 + len(nodes) * col_w
    svg_h = 280

    svg_phases = []
    for ph in phases_info:
        px = start_x + ph["fromCol"] * col_w - 10
        pw = (ph["toCol"] - ph["fromCol"] + 1) * col_w - 10
        cor = ph["cor"]
        svg_phases.append(f"""
        <g class="phase-group" id="phase-{ph['id']}">
          <rect x="{px}" y="35" width="{pw}" height="195" rx="8" class="phase-rect" stroke="{cor}" stroke-dasharray="3 3"/>
          <text x="{px + 12}" y="55" class="phase-label" fill="{cor}">{ph['nome']}</text>
          <rect x="{px + pw - 90}" y="42" width="80" height="18" rx="4" fill="{cor}" fill-opacity="0.2"/>
          <text x="{px + pw - 50}" y="54.5" class="phase-badge" fill="{cor}" text-anchor="middle">{ph['badge']}</text>
        </g>
        """)

    node_pos = {}
    svg_nodes = []
    for i, n in enumerate(nodes):
        nid = n["id"]
        x = start_x + i * col_w
        y = node_y
        node_pos[nid] = (x, y)
        label = n.get("label", nid)
        sublabel = n.get("sublabel", "")
        ntype = n.get("type", "backend")
        is_security = ntype == "security" or n.get("variant") == "security"

        if ntype == "regente" or nid == "elza":
            cor_borda = "#c084fc"
            cor_badge = "#c084fc"
            badge_bg = "rgba(192, 132, 252, 0.15)"
            badge_txt = "REGENTE"
            classe_extra = "node-regente"
        elif is_security:
            cor_borda = "#f59e0b"
            cor_badge = "#f59e0b"
            badge_bg = "rgba(245, 158, 11, 0.15)"
            badge_txt = "SECURITY" if "gastao" in nid else "FISCAL"
            classe_extra = "node-security"
        elif ntype == "database":
            cor_borda = "#a855f7"
            cor_badge = "#a855f7"
            badge_bg = "rgba(168, 85, 247, 0.15)"
            badge_txt = "DADOS"
            classe_extra = ""
        else:
            cor_borda = "#58a6ff"
            cor_badge = "#58a6ff"
            badge_bg = "rgba(88, 166, 255, 0.15)"
            badge_txt = "AGENTE"
            classe_extra = ""

        svg_nodes.append(f"""
        <g class="node-group {classe_extra}" id="node-{nid}" transform="translate({x}, {y})" data-node-id="{nid}">
          <rect width="{card_w}" height="{card_h}" rx="8" class="card-bg" stroke="{cor_borda}"/>
          <text x="10" y="24" class="node-title">{label}</text>
          <text x="10" y="44" class="node-sub">{sublabel}</text>
          <rect x="{card_w - 58}" y="8" width="50" height="17" rx="3" fill="{badge_bg}"/>
          <text x="{card_w - 33}" y="20" class="node-badge" fill="{cor_badge}" text-anchor="middle">{badge_txt}</text>
        </g>
        """)

    svg_edges = []
    for e in edges:
        src = e.get("from")
        dst = e.get("to")
        lbl = e.get("label", "")
        if src not in node_pos or dst not in node_pos:
            continue
        x1, y1 = node_pos[src]
        x2, y2 = node_pos[dst]
        p1 = (x1 + card_w, y1 + card_h / 2)
        p2 = (x2, y2 + card_h / 2)

        mid_x = (p1[0] + p2[0]) / 2
        mid_y = p1[1]
        variant_class = e.get("variant", "default")
        cor_edge = "#f59e0b" if variant_class == "security" else ("#7ee787" if variant_class == "emphasis" else "#8b949e")

        svg_edges.append(f"""
        <g class="edge-group" data-src="{src}" data-dst="{dst}">
          <line x1="{p1[0]}" y1="{p1[1]}" x2="{p2[0]}" y2="{p2[1]}" 
                class="edge-path {variant_class}" stroke="{cor_edge}" stroke-width="2" marker-end="url(#arrow-{variant_class})"/>
          <g transform="translate({mid_x}, {mid_y})">
            <rect x="-28" y="-9" width="56" height="18" rx="4" class="edge-label-bg"/>
            <text x="0" y="3.5" class="edge-label-text" text-anchor="middle">{lbl}</text>
          </g>
        </g>
        """)

    nodes_html = "".join(svg_nodes)
    edges_html = "".join(svg_edges)
    phases_html = "".join(svg_phases)

    return f"""<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{titulo}</title>
  <style>
    :root {{
      --bg: #0e1117;
      --card-bg: #161b22;
      --card-border: #30363d;
      --text: #e6edf3;
      --text-muted: #8b949e;
      --edge: #8b949e;
      --edge-emphasis: #7ee787;
      --badge-bg: #21262d;
      --header-bg: rgba(22, 27, 34, 0.9);
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
      --amber: #f59e0b;
      --verde: #7ee787;
      --azul: #58a6ff;
    }}
    [data-theme="light"] {{
      --bg: #f6f8fa;
      --card-bg: #ffffff;
      --card-border: #d0d7de;
      --text: #1f2328;
      --text-muted: #656d76;
      --edge: #656d76;
      --edge-emphasis: #1a7f37;
      --badge-bg: #eaeef2;
      --header-bg: rgba(255, 255, 255, 0.9);
      --amber: #d97706;
      --verde: #1a7f37;
      --azul: #0969da;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-mono);
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      user-select: none;
    }}
    header {{
      padding: 8px 14px;
      background: var(--header-bg);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      z-index: 10;
    }}
    .title-group h1 {{
      font-size: 12.5px;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .badge-sub {{
      font-size: 9.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--badge-bg);
      color: var(--text-muted);
      border: 1px solid var(--card-border);
    }}
    .toolbar {{
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    button {{
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 10.5px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
    }}
    button:hover {{
      border-color: var(--text-muted);
      background: var(--badge-bg);
    }}
    button.active {{
      border-color: var(--amber);
      color: var(--amber);
      background: rgba(245, 158, 11, 0.1);
    }}
    #viewport {{
      flex: 1;
      width: 100%;
      height: 100%;
      cursor: grab;
      touch-action: none;
      position: relative;
    }}
    #viewport:active {{ cursor: grabbing; }}
    svg {{
      width: 100%;
      height: 100%;
      display: block;
    }}
    .phase-rect {{
      fill: var(--card-bg);
      fill-opacity: 0.12;
      stroke-width: 1.2px;
    }}
    .phase-label {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }}
    .phase-badge {{
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }}
    .card-bg {{
      fill: var(--card-bg);
      stroke-width: 1.5px;
      transition: stroke 0.2s, filter 0.2s;
    }}
    .node-title {{
      font-size: 12px;
      font-weight: 700;
      fill: var(--text);
    }}
    .node-sub {{
      font-size: 9.5px;
      fill: var(--text-muted);
    }}
    .node-badge {{
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }}
    .edge-path {{
      fill: none;
      stroke-linecap: round;
      transition: stroke 0.2s;
    }}
    .edge-path.security {{
      stroke-dasharray: 4 2;
    }}
    .edge-path.dashed {{
      stroke-dasharray: 3 3;
    }}
    .edge-label-bg {{
      fill: var(--card-bg);
      stroke: var(--card-border);
      stroke-width: 1px;
    }}
    .edge-label-text {{
      font-size: 9px;
      fill: var(--text-muted);
      font-weight: 500;
    }}
    .node-group {{
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }}
    .node-group:hover .card-bg {{
      filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
      stroke-width: 2px;
    }}
    .node-security .card-bg {{
      stroke-width: 2px;
    }}
    .dimmed {{ opacity: 0.22; }}
    .highlighted .card-bg {{
      stroke-width: 2.5px !important;
      filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.5));
    }}
  </style>
</head>
<body>
  <header>
    <div class="title-group">
      <h1>
        <span>{titulo}</span>
        <span class="badge-sub">pipeline horizontal</span>
      </h1>
    </div>
    <div class="toolbar">
      <button type="button" id="btn-view-all" class="active" onclick="setView('all')">Pipeline completo</button>
      <button type="button" id="btn-view-gates" onclick="setView('gates')">Aprovações Gastão</button>
      <button type="button" onclick="zoomIn()">+</button>
      <button type="button" onclick="zoomOut()">−</button>
      <button type="button" onclick="resetView()">Centralizar</button>
      <button type="button" onclick="toggleTheme()" id="theme-btn">☀️ / 🌙</button>
    </div>
  </header>
  <div id="viewport">
    <svg id="svg-root" viewBox="0 0 {svg_w} {svg_h}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8b949e"/>
        </marker>
        <marker id="arrow-security" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b"/>
        </marker>
        <marker id="arrow-emphasis" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#7ee787"/>
        </marker>
        <marker id="arrow-dashed" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8b949e"/>
        </marker>
      </defs>
      <g id="scene-layer">
        {phases_html}
        {edges_html}
        {nodes_html}
      </g>
    </svg>
  </div>
  <script>
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let startX, startY;
    const scene = document.getElementById('scene-layer');
    const viewport = document.getElementById('viewport');

    function updateTransform() {{
      scene.setAttribute('transform', `translate(${{panX}}, ${{panY}}) scale(${{scale}})`);
    }}

    viewport.addEventListener('wheel', (e) => {{
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(0.3, scale * zoomFactor), 4.0);
      scale = newScale;
      updateTransform();
    }}, {{ passive: false }});

    viewport.addEventListener('mousedown', (e) => {{
      if (e.button !== 0) return;
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    }});

    window.addEventListener('mousemove', (e) => {{
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    }});

    window.addEventListener('mouseup', () => {{
      isDragging = false;
    }});

    function zoomIn() {{
      scale = Math.min(4.0, scale * 1.2);
      updateTransform();
    }}

    function zoomOut() {{
      scale = Math.max(0.3, scale / 1.2);
      updateTransform();
    }}

    function resetView() {{
      scale = 1;
      panX = 0;
      panY = 0;
      updateTransform();
    }}

    function setView(view) {{
      document.getElementById('btn-view-all').classList.toggle('active', view === 'all');
      document.getElementById('btn-view-gates').classList.toggle('active', view === 'gates');
      const nodes = document.querySelectorAll('.node-group');
      const edges = document.querySelectorAll('.edge-group');
      const phases = document.querySelectorAll('.phase-group');

      if (view === 'gates') {{
        nodes.forEach(n => {{
          const nid = n.getAttribute('data-node-id');
          if (nid === 'gastao_plano' || nid === 'gastao_textos') {{
            n.classList.remove('dimmed');
            n.classList.add('highlighted');
          }} else {{
            n.classList.add('dimmed');
            n.classList.remove('highlighted');
          }}
        }});
        edges.forEach(e => e.classList.add('dimmed'));
        phases.forEach(p => p.classList.add('dimmed'));
      }} else {{
        nodes.forEach(n => {{
          n.classList.remove('dimmed');
          n.classList.remove('highlighted');
        }});
        edges.forEach(e => e.classList.remove('dimmed'));
        phases.forEach(p => p.classList.remove('dimmed'));
      }}
    }}

    function toggleTheme() {{
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try {{ localStorage.setItem('archify-theme', next); }} catch (_) {{}}
    }}

    (function() {{
      try {{
        const saved = localStorage.getItem('archify-theme');
        if (saved) document.documentElement.setAttribute('data-theme', saved);
      }} catch (_) {{}}
    }})();
  </script>
</body>
</html>
"""


def salvar_mapa_setor_comercial() -> None:
    """Gera e salva os artefatos de mapa do setor comercial (.workflow.json e .html)."""
    wf = gerar_workflow_setor_comercial()
    wf_json = json.dumps(wf, ensure_ascii=False, indent=2)

    html_conteudo = None
    if ARCHIFY_CLI and ARCHIFY_CLI.exists() and shutil.which("node"):
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp_wf:
                tmp_wf.write(wf_json)
                tmp_wf_path = Path(tmp_wf.name)
            tmp_out = tmp_wf_path.with_suffix(".html")
            res = subprocess.run(["node", str(ARCHIFY_CLI), "build", str(tmp_wf_path), "-o", str(tmp_out)], capture_output=True, text=True, timeout=15)
            if res.returncode == 0 and tmp_out.is_file():
                html_conteudo = tmp_out.read_text(encoding="utf-8")
            try:
                tmp_wf_path.unlink(missing_ok=True)
                tmp_out.unlink(missing_ok=True)
            except OSError:
                pass
        except Exception:
            html_conteudo = None

    if not html_conteudo:
        html_conteudo = renderizar_html_workflow_setor_comercial(wf)

    for pasta in (DATA_MAPAS, DIST_MAPAS, PUBLIC_MAPAS):
        try:
            pasta.mkdir(parents=True, exist_ok=True)
            (pasta / "setor-comercial.html").write_text(html_conteudo, encoding="utf-8")
            (pasta / "setor-comercial.workflow.json").write_text(wf_json, encoding="utf-8")
        except OSError:
            pass


def gerar_workflow_setor_trafego() -> dict:
    """Gera o workflow horizontal Archify v2 para o Setor de Tráfego (Tereza/Bia)."""
    return {
        "schema_version": 2,
        "diagram_type": "workflow",
        "meta": {
            "title": "Setor de tráfego: gestão de mídia e campanhas",
            "animation": "trace",
            "quality_profile": "showcase",
            "views": [
                {
                    "id": "pipeline-completo",
                    "label": "Pipeline completo",
                    "focus": ["bia", "tereza", "jade", "gestor", "analista", "iris"],
                    "note": "Fluxo de regência, otimização e veiculação de tráfego pago.",
                }
            ],
            "output": "web/public/mapas/setor-trafego.html",
        },
        "lanes": [{"id": "trafego", "label": "Squad de tráfego"}],
        "phases": [
            {"id": "diretoria", "label": "Diretoria", "fromCol": 0, "toCol": 0, "variant": "emphasis"},
            {"id": "regencia", "label": "Regência e fiscalização", "fromCol": 1, "toCol": 2, "variant": "security"},
            {"id": "operacao", "label": "Operação e análise", "fromCol": 3, "toCol": 5},
        ],
        "mainPath": ["bia", "tereza", "jade", "gestor", "analista", "iris"],
        "semanticChecks": {
            "allowedRoots": ["bia", "luana"],
            "allowedTerminals": ["iris", "analista"],
            "requiredEdges": [
                {"from": "bia", "to": "tereza"},
                {"from": "luana", "to": "tereza"},
                {"from": "tereza", "to": "jade"},
                {"from": "tereza", "to": "gestor"},
                {"from": "tereza", "to": "analista"},
                {"from": "tereza", "to": "iris"},
            ],
        },
    }


def salvar_mapa_setor_trafego() -> None:
    wf = gerar_workflow_setor_trafego()
    wf_json = json.dumps(wf, ensure_ascii=False, indent=2)
    html_conteudo = renderizar_html_workflow_setor_comercial(wf)
    for pasta in (DATA_MAPAS, DIST_MAPAS, PUBLIC_MAPAS):
        try:
            pasta.mkdir(parents=True, exist_ok=True)
            (pasta / "setor-trafego.html").write_text(html_conteudo, encoding="utf-8")
            (pasta / "setor-trafego.workflow.json").write_text(wf_json, encoding="utf-8")
        except OSError:
            pass


def gerar_workflow_setor_bots() -> dict:
    """Gera o workflow horizontal Archify v2 para o Setor de Bots (Heitor/Renato)."""
    return {
        "schema_version": 2,
        "diagram_type": "workflow",
        "meta": {
            "title": "Setor de bots: desenvolvimento e fiscalização de agentes",
            "animation": "trace",
            "quality_profile": "showcase",
            "views": [
                {
                    "id": "pipeline-completo",
                    "label": "Pipeline completo",
                    "focus": ["renato", "heitor", "vitor", "dev", "qa", "explore"],
                    "note": "Fluxo de desenvolvimento, regência e testes automatizados de bots.",
                }
            ],
            "output": "web/public/mapas/setor-bots.html",
        },
        "lanes": [{"id": "bots", "label": "Squad de bots"}],
        "phases": [
            {"id": "diretoria", "label": "Diretoria", "fromCol": 0, "toCol": 0, "variant": "emphasis"},
            {"id": "regencia", "label": "Regência e fiscalização", "fromCol": 1, "toCol": 2, "variant": "security"},
            {"id": "engenharia", "label": "Engenharia e testes", "fromCol": 3, "toCol": 5},
        ],
        "mainPath": ["renato", "heitor", "vitor", "dev", "qa", "explore"],
        "semanticChecks": {
            "allowedRoots": ["renato"],
            "allowedTerminals": ["explore"],
            "requiredEdges": [
                {"from": "renato", "to": "heitor"},
                {"from": "heitor", "to": "vitor"},
                {"from": "heitor", "to": "dev"},
                {"from": "heitor", "to": "qa"},
                {"from": "heitor", "to": "explore"},
            ],
        },
    }


def salvar_mapa_setor_bots() -> None:
    wf = gerar_workflow_setor_bots()
    wf_json = json.dumps(wf, ensure_ascii=False, indent=2)
    html_conteudo = renderizar_html_workflow_setor_comercial(wf)
    for pasta in (DATA_MAPAS, DIST_MAPAS, PUBLIC_MAPAS):
        try:
            pasta.mkdir(parents=True, exist_ok=True)
            (pasta / "setor-bots.html").write_text(html_conteudo, encoding="utf-8")
            (pasta / "setor-bots.workflow.json").write_text(wf_json, encoding="utf-8")
        except OSError:
            pass



FUSOS = {"utc": 0, "gmt": 0, "z": 0, "brt": -3, "-03": -3, "-0300": -3, "art": -3}


def _numero_rotulado(rotulo: str, chave: str):
    """CHECAGENS ..: 51  -> 51. Casa cada campo SOZINHO: com um regex unico,
    faltar INDETERMINADAS apagava tambem checagens e reprovadas."""
    m = re.search(rf"(?<![a-z]){rotulo}(?![a-z])\s*\.*\s*:\s*(\d+)", chave)
    return int(m.group(1)) if m else None


RE_MOMENTO = re.compile(
    r"\s*\.*\s*:\s*(\d{1,2}/\d{1,2}/\d{4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([a-z0-9+-]{1,5})?"
)


def _momento(rotulo: str, chave: str):
    """Devolve (texto, datetime|None, motivo). O fuso vem do arquivo; fuso que
    eu nao conheco NAO vira UTC por conta propria: vira None com motivo, e
    quem le decide. Hora sem fuso e palpite."""
    m = re.search(rotulo + RE_MOMENTO.pattern, chave)
    if not m:
        return None, None, f"não achei a linha {rotulo.upper()}"
    dia, hora, fuso = m.group(1), m.group(2), (m.group(3) or "").strip()
    texto = f"{dia} {hora}" + (f" {fuso.upper()}" if fuso else "")
    formato = "%d/%m/%Y %H:%M:%S" if hora.count(":") == 2 else "%d/%m/%Y %H:%M"
    try:
        bruto = datetime.strptime(f"{dia} {hora}", formato)
    except ValueError:
        return texto, None, f"{rotulo.upper()} com data que eu não sei ler: {texto}"
    if fuso not in FUSOS:
        return texto, None, f"{rotulo.upper()} com fuso que eu não conheço: {fuso or 'nenhum'}"
    return texto, bruto.replace(tzinfo=timezone(timedelta(hours=FUSOS[fuso]))), None


def ler_verificador(caminho: Path):
    """
    Le o ULTIMO.txt do verificador. Nao roda nada: so le o que ja saiu.

    Campo que nao deu pra ler sai None E o motivo sai escrito em
    'erro_leitura'. Ausencia de numero nao pode falar por si: sem o motivo,
    "nao consegui ler o verificador" e "o verificador nao achou nada" chegam
    na tela como a mesma coisa, e uma delas vira zero no verde.
    """
    vazio = {
        "checagens": None,
        "reprovadas": None,
        "indeterminadas": None,
        "rodada": None,
        "valido_ate": None,
        "vencido": None,
        "falhas": [],
        "arquivo": caminho.name,
        "erro_leitura": None,
    }
    if not caminho.is_file():
        return {**vazio, "erro_leitura": f"o arquivo {caminho.name} não existe"}
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return {**vazio, "erro_leitura": f"não consegui ler {caminho.name}: {type(e).__name__}"}

    out = dict(vazio)
    # minusculo e sem acento, com o MESMO comprimento do original: assim
    # "VALIDO ATE" e "VÁLIDO ATÉ" casam, e os indices ainda servem no texto cru.
    chave = _chave(texto)
    motivos = []

    for campo in ("checagens", "reprovadas", "indeterminadas"):
        out[campo] = _numero_rotulado(campo, chave)
        if out[campo] is None:
            motivos.append(f"não achei {campo.upper()} no resumo")

    out["rodada"], _, motivo = _momento("rodada", chave)
    if motivo:
        motivos.append(motivo)
    out["valido_ate"], limite, motivo = _momento(r"valido ate", chave)
    if motivo:
        motivos.append(motivo)
    if limite is not None:
        out["vencido"] = agora_utc() > limite

    bloco = re.search(r"reprovadas \(e ha quanto tempo\):\n(.*?)(?:\n\n|\Z)", chave, re.S)
    if bloco:
        atual = None
        # fatia o texto CRU pelos indices da chave: o acento volta pra tela.
        for linha in texto[bloco.start(1):bloco.end(1)].splitlines():
            if linha.strip().startswith("x "):
                atual = {"o_que": _texto_de_tela(linha.strip()[2:]), "desde": None}
                out["falhas"].append(atual)
            elif atual and linha.strip().startswith("desde"):
                atual["desde"] = _texto_de_tela(linha.strip())
    elif out["reprovadas"]:
        motivos.append("achei o número de reprovadas mas não a lista delas")

    out["erro_leitura"] = " · ".join(motivos) or None
    return out


def contar_arquivos_linhas(pasta: Path, padrao="*"):
    if not pasta.is_dir():
        return {"arquivos": None, "linhas": None}
    arquivos, linhas = 0, 0
    for arq in pasta.glob(padrao):
        if not arq.is_file():
            continue
        arquivos += 1
        try:
            linhas += arq.read_text(encoding="utf-8", errors="replace").count("\n") + 1
        except OSError:
            pass
    return {"arquivos": arquivos, "linhas": linhas}


RE_CRON = re.compile(
    r"^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$"
)


RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")

# ---------------------------------------------------------------------------
# NÚMERO DE PESSOA CONTRA NÚMERO DE MÁQUINA
#
# O que havia aqui era `RE_DIGITOS = \d{6,}`: corrida CONTÍGUA de dígitos, e só
# isso. Medido em 10/09/2026, com os formatos reais: `5547999887766` virava
# `[num]`, e `(47) 99988-7766`, `55 47 99988 7766`, `+55 47 9 8888 7777`, o CPF
# `123.456.789-00` e o CNPJ `12.345.678/0001-99` passavam INTEIROS. Telefone
# escrito do jeito que gente escreve não era mascarado: a trava tinha cara de
# trava e segurava o formato que ninguém usa.
#
# A régua agora é a FORMA, não o comprimento da corrida, e ela é dos DOIS
# lados, porque trava que pune o certo é a que faz todo mundo desligar a trava:
#
#   PASSA  data (2026-09-10, 10/09/2026), hora (14:07, 08h07), dinheiro
#          (R$ 1.234,56), hash hexadecimal de md5/sha1/sha256, número de linha,
#          e id técnico de 15 dígitos ou mais (120247981563040686). Nenhum
#          telefone, CPF ou CNPJ do Brasil chega a 15 dígitos: acima disso a
#          corrida NÃO PODE ser gente.
#   MORRE  telefone em qualquer escrita (colado, com espaço, ponto, hífen,
#          parênteses, com ou sem +55, com ou sem DDD), CPF e CNPJ pontuados, e
#          a corrida contígua de 6 a 14 dígitos, que é a rede que segura o
#          formato que ninguém previu.
#
# A ORDEM é a trava: as formas SEGURAS são testadas primeiro e saem inteiras,
# senão `2026-09-10` viraria telefone fixo de oito dígitos, que é o falso
# positivo mais fácil de produzir aqui.
# ---------------------------------------------------------------------------

RE_NUMERO = re.compile(
    r"""
      (?P<seguro>
          # Carimbo ISO INTEIRO. O microssegundo é corrida de 6 dígitos, e a
          # régua velha comia justamente ele: `15:19:58.[num]+00:00`.
          \d{4}-\d{2}-\d{2}
          (?:[T\s]\d{2}:\d{2}(?::\d{2})?
             (?:[.,]\d+)?
             (?:Z|[+-]\d{2}:?\d{2})?
          )?
        | \d{1,2}/\d{1,2}(?:/\d{2,4})?                       # data brasileira
        | \d{1,2}[:h]\d{2}(?:[:m]\d{2})?                     # hora
        | R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?               # dinheiro
          # Hash, e SÓ nos comprimentos canônicos (md5, sha1, sha256), com pelo
          # menos uma letra. Aceitar hex de qualquer tamanho abriria buraco:
          # `abcd5547999887766` também é só hex, e esconderia um telefone.
        | (?<![0-9A-Za-z])
          (?=[0-9A-Fa-f]*[A-Fa-f])
          (?:[0-9A-Fa-f]{32}|[0-9A-Fa-f]{40}|[0-9A-Fa-f]{64})
          (?![0-9A-Za-z])
        | (?<![0-9A-Za-z])\d{15,}(?![0-9A-Za-z])             # id técnico longo
      )
    | (?P<cnpj>(?<!\d)\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}(?!\d))
    | (?P<cpf>(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d))
    | (?P<fone>                                              # com DDD
          (?<![0-9A-Za-z])
          (?:\+?\s?55[\s.\-]?)?                              # país opcional
          (?:\([1-9][1-9]\)|[1-9][1-9])                      # DDD não tem zero
          [\s.\-]?
          (?:9[\s.\-]?)?                                     # nono dígito
          \d{4}[\s.\-]?\d{4}
          (?![0-9A-Za-z])
      )
    | (?P<celular>(?<![0-9A-Za-z])9\d{4}[\s.\-]\d{4}(?![0-9A-Za-z]))
    | (?P<fixo>                                              # 3333-4444 sem DDD
          (?<![0-9A-Za-z])
          (?!19\d{2}|20\d{2})                                # 2020-2024 é ano
          [2-5]\d{3}[.\-]\d{4}
          (?![0-9A-Za-z])
      )
    | (?P<digitos>\d{6,14})                                  # a rede de baixo
    """,
    re.X,
)


def _apelido_do_numero(bruto: str) -> str:
    """Apelido ESTÁVEL do número, sem publicar dígito nenhum.

    Esta casa já concluiu que duas clientes DIFERENTES eram a mesma pessoa
    porque a máscara apagou justamente o que as distinguia. Máscara que colapsa
    todo mundo em `[num]` fabrica esse incidente: dois telefones viram a mesma
    tela. Aqui o mesmo número devolve sempre o mesmo apelido, e dois números
    diferentes quase nunca colidem, então dá pra dizer que são duas pessoas sem
    saber quem são.

    É hash e não os três últimos dígitos de propósito: o painel é servido num
    domínio público, e três dígitos reais confirmam um palpite. O apelido não
    volta pro número.
    """
    digitos = re.sub(r"\D", "", bruto)
    # O MESMO telefone com e sem o país tem que dar o mesmo apelido, senão
    # `5547999887766` e `(47) 99988-7766` parecem duas pessoas.
    if len(digitos) in (12, 13) and digitos.startswith("55"):
        digitos = digitos[2:]
    return hashlib.blake2s(digitos.encode(), digest_size=2).hexdigest()


# `_mascarar_numero(m)` morava aqui e foi apagada em 10/09/2026, junto com o
# `RE_NUMERO.sub(...)` que a chamava. Ela era a cara da porta e passou a NÃO
# ser a porta: quem chamasse `sub` com ela pularia a normalização de separador
# logo abaixo, e um telefone com hífen unicode sairia inteiro. Função morta com
# nome de entrada principal é convite pro próximo agente usar o caminho errado.


# ---------------------------------------------------------------------------
# O TRAÇO QUE NÃO É TRAÇO
#
# `47 99988‑7766` com hífen U+2011 saía SEM MÁSCARA NENHUMA, e é o buraco do
# telefone formatado reabrindo por um caractere. Não é hipótese: medido em
# 10/09/2026, 20 dos 40 arquivos de `memoria/` e `diario/` já contêm traço ou
# espaço fora do ASCII, porque a casa cola texto de WhatsApp e de Word.
#
# O espaço de largura zero era pior: partia o número em dois, mascarava metade
# e ainda MUDAVA O APELIDO, que é o defeito do discriminador voltando por outra
# porta (o mesmo número em duas escritas virava duas pessoas na tela).
#
# A tradução preserva o COMPRIMENTO, então a posição do match na chave é a
# mesma do texto original e só o trecho mascarado é substituído: travessão de
# prosa continua saindo como o autor escreveu. É o mesmo desenho do `_chave` da
# negação de nome, pelo mesmo motivo, e o apelido passa a ser calculado sobre a
# chave, então a escrita do separador deixa de mudar quem é a pessoa.
#
# ‼️ O QUE CONTINUA PASSANDO, medido e declarado: separador que ninguém usa
# para telefone no Brasil (`47·99988·7766`, `47/99988/7766`, `47_99988_7766`) e
# documento separado só por espaço (`3333 4444`, `123 456 789 00`,
# `12 345 678 0001 99`). Alargar para esses casos passa a comer lista de
# números soltos, e trava que pune o certo é a que faz todo mundo desligar a
# trava.
# ---------------------------------------------------------------------------

TABELA_SEPARADOR = {ord(c): "-" for c in "‐‑‒–—―−"}
TABELA_SEPARADOR.update({ord(c): " " for c in "      ​﻿"})


def redigir(texto: str) -> str:
    """
    Cinto de seguranca: nada que pareca dado de pessoa vai pra tela.
    Aqui e o unico lugar por onde texto livre da casa entra no painel.

    A regex roda sobre a CHAVE (separador unicode normalizado, mesmo
    comprimento); o que sai é o texto ORIGINAL com só os trechos de pessoa
    trocados.
    """
    texto = RE_EMAIL.sub("[e-mail]", texto)
    chave = texto.translate(TABELA_SEPARADOR)
    pedacos, fim = [], 0
    for m in RE_NUMERO.finditer(chave):
        if m.group("seguro") is not None:
            continue
        pedacos.append(texto[fim:m.start()])
        pedacos.append(f"[num:{_apelido_do_numero(m.group(0))}]")
        fim = m.end()
    pedacos.append(texto[fim:])
    return "".join(pedacos)


# ---------------------------------------------------------------------------
# NEGACAO EXPLICITA DE NOME DE CLIENTE
#
# O que havia aqui antes era corte por POSICAO: o rotulo era cortado no
# primeiro parentese, porque e depois dele que a casa anota o incidente. Em
# tres jobs o nome do cliente estava ANTES do parentese, entao o corte jogou
# fora o id tecnico e preservou a PESSOA (ex.: "lembrete consulta 24h Dr.
# Exemplo", nome ficticio ilustrando o formato real que vazava). Corte por
# posicao nao sabe o que e nome.
#
# Agora quem protege e a NEGACAO, sobre o rotulo inteiro: os nomes vem de
# memoria/clientes.md, cliente novo fica protegido assim que entra la, e o
# corte continua existindo so pra encurtar, nunca pra proteger.
# ---------------------------------------------------------------------------

# Nome de pessoa fisica de cliente mora FORA de memoria/ e conexoes/ de
# proposito (24/09/2026): e o unico jeito de clientes.md ficar limpo pro
# verificador de dado pessoal (grupo `pessoal`, que so varre essas duas
# pastas) sem o painel perder a capacidade de mascarar esses nomes. Ver o
# cabecalho do proprio arquivo.
#
# ‼️ 25/09/2026: este arquivo (coletar_estado.py) e o teste dele NUNCA citam
# o nome real de ninguem, nem em comentario. O repo e PUBLICO no GitHub; o
# nome real so mora em privacidade_nomes_cliente.txt, fora do repositorio.
_NOMES_PESSOA_FISICA = RAIZ / "luana/privacidade_nomes_cliente.txt"


def _carregar_nomes_pessoa_fisica(caminho: Path = _NOMES_PESSOA_FISICA) -> list:
    """Nome de pessoa fisica de cliente, um por linha, fora de memoria/ e
    conexoes/. Formato: 'Nome: contexto livre' ou so 'Nome'; '#' e comentario.

    Arquivo ausente NAO e erro: devolve lista vazia. clientes.md sozinho
    ainda cobre nome de empresa/marca, e a checagem `pessoal` continua limpa
    mesmo sem este arquivo — so o mascaramento de pessoa fisica no painel
    fica mais fraco, silenciosamente, ate alguem notar no proprio painel.
    """
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


_PADRAO_CLIENTES = RAIZ / "luana/memoria/clientes.md"
_ENV_CLIENTES = os.environ.get("PAINEL_OS_CLIENTES_MD")
if _ENV_CLIENTES:
    CLIENTES_MD = Path(_ENV_CLIENTES)
elif _PADRAO_CLIENTES.is_file():
    CLIENTES_MD = _PADRAO_CLIENTES
else:
    # Fallback para ambiente local de desenvolvimento / teste
    _LOCAL_CLIENTES = Path(__file__).resolve().parent.parent / "data" / "clientes.md"
    CLIENTES_MD = _LOCAL_CLIENTES if _LOCAL_CLIENTES.is_file() else _PADRAO_CLIENTES

# Os dois lugares, fora do negrito da primeira celula, onde clientes.md escreve
# uma PESSOA: o tratamento e a linha de contato. Sao forma de nome, nao de ramo.
RE_TRATAMENTO = re.compile(r"\b(?:Dr|Dra|Sr|Sra)\.?\s+([A-ZÁ-Ú][\wÀ-ÿ]+)")
RE_CONTATO = re.compile(r"\bContato:\s*([A-ZÁ-Ú][\wÀ-ÿ]+)")

# Palavras comuns de cabeçalhos de tabela, notas e metadados que não são clientes.
CABECALHOS_TABELA = {
    "cliente", "clientes", "nome", "nomes", "empresa", "empresas",
    "conta", "contas", "lead", "leads", "responsavel", "status",
    "situacao", "id", "projeto", "ramo", "cidade", "de", "do", "da",
    "e", "nota", "notas", "observacao", "observacoes", "total", "contato",
    "razao", "social", "tipo", "acao", "acoes", "detalhe", "detalhes",
}

# Bot, produto e persona da casa. NAO sao pessoa e continuam aparecendo de
# proposito: "reservas do Gramado -> painel" e nome de sistema, nao de gente.
PERMITIDOS = {
    "gramado", "nina", "agente24horas", "autonomia", "hermes", "gabi",
    "luana", "renato", "bia", "gastao", "gastaomatos", "casal", "trafego",
}

# Palavra de ramo/tratamento que sozinha nao identifica ninguem. Fica de fora
# da lista de tokens pra nao bloquear texto correto: trava que pune o certo e
# a que faz todo mundo desligar a trava.
GENERICOS = {
    "advogados", "advogado", "construtora", "clinica", "chef", "junior",
    "filho", "neto", "doutor", "dra", "plazza", "restaurante", "imf",
}

_ACENTOS = str.maketrans(
    "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ",
    "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC",
)


def _chave(texto: str) -> str:
    """Minusculo e sem acento, com o MESMO comprimento: a posicao do match no
    resultado e a mesma posicao no texto original."""
    return texto.translate(_ACENTOS).lower()


def _padrao_do_nome(nome: str) -> "re.Pattern[str]":
    """
    'Dr. Exemplo' pega 'Dr. Exemplo', 'dr-exemplo', 'drexemplo' e 'DR_EXEMPLO'.
    O separador entre as partes e curto de proposito: com '*' o padrao casaria
    duas palavras distantes uma da outra e viraria falso positivo.
    """
    partes = [re.escape(p) for p in re.split(r"[^a-z0-9]+", _chave(nome)) if p]
    corpo = r"[^a-z0-9]{0,3}".join(partes)
    return re.compile(rf"(?<![a-z0-9]){corpo}(?![a-z0-9])")


def carregar_nomes_de_cliente(caminho: Path = CLIENTES_MD, caminho_pessoa_fisica: Path = _NOMES_PESSOA_FISICA):
    """
    Le os nomes de cliente das linhas ESTRUTURADAS de clientes.md: primeira
    celula de linha de tabela e item de lista. So o negrito, e sem o que esta
    entre parenteses (la mora ramo e cidade, nao nome).

    `caminho_pessoa_fisica` (25/09/2026) existe pra teste poder provar a fusao
    com uma lista SINTETICA, sem tocar no arquivo real: o default continua
    sendo o arquivo real de producao, igual sempre foi.

    Devolve (padroes, diagnostico). Sem arquivo, padroes vem vazio e o
    diagnostico diz por que: quem chama e obrigado a tratar isso.
    """
    diag = {"arquivo": caminho.name, "carregada": False, "nomes": 0, "erro": None}
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        diag["erro"] = f"não consegui ler {caminho.name}: {type(e).__name__}"
        return [], diag

    brutos = []
    for linha in texto.splitlines():
        limpa = linha.strip()
        if limpa.startswith("|"):
            celula = limpa.strip("|").split("|")[0]
        elif limpa.startswith(("- ", "* ")):
            celula = limpa[2:]
        else:
            continue  # bloco de citacao, titulo e prosa nao listam cliente
        # ‼️ A PESSOA NEM SEMPRE ESTA NO NEGRITO DA PRIMEIRA CELULA, e um QA
        # achou duas de verdade em 10/09/2026 (exemplo ficticio equivalente:
        # `Dr. Exemplo` mora DENTRO do parenteses de "Rocha Advogados (Dr.
        # Exemplo, trabalhista, Cuiabá)", que o corte joga fora, e `Beltrano
        # Teste` mora na TERCEIRA coluna, em "Contato: Beltrano Teste"). Os
        # dois passavam inteiros por `rotulo_seguro`, e 13 arquivos
        # da casa os citam.
        #
        # A varredura e a LINHA toda, mas so por dois padroes que sao forma de
        # NOME: tratamento e "Contato:". Aceitar o parenteses inteiro traria
        # "trabalhista", "Cuiabá", "reservas" e "advocacia" pra lista de nomes
        # negados, e trava que pune o certo e a que faz todo mundo desligar a
        # trava. Medido: os dois padroes acham 3 nomes, 2 sao novos, e dao ZERO
        # falso positivo no payload servido.
        for achado in RE_TRATAMENTO.finditer(limpa):
            brutos.append(achado.group(1))
        for achado in RE_CONTATO.finditer(limpa):
            brutos.append(achado.group(1))
        # Nome do cliente na célula: aceita com negrito (**Nome**), link ([Nome](...))
        # ou texto puro (Nome), com ou sem parênteses adicionais.
        m = re.search(r"\*\*(.+?)\*\*", celula)
        if m:
            cand = m.group(1)
        else:
            m_link = re.search(r"\[(.+?)\]", celula)
            if m_link:
                cand = m_link.group(1)
            else:
                cand = celula

        nome = cand.split("(")[0].strip(" :.*·#_`~-")
        if not nome or set(nome) <= {"-", ":", " ", "|", "."}:
            continue
        if nome.startswith("@") or "=" in nome:
            continue
        chave_nome = _chave(nome)
        if chave_nome.startswith(("obs:", "observacao", "total:", "nota:")):
            continue
        palavras = [p for p in re.split(r"[^a-z0-9]+", chave_nome) if p]
        if not palavras or all(p in CABECALHOS_TABELA for p in palavras):
            continue
        if len(nome.split()) > 5 or len(nome) < 2:
            continue  # frase longa nao e nome de cliente
        brutos.append(nome)

    # Nome de pessoa fisica nao mora mais em clientes.md (24/09/2026): vem de
    # um arquivo a parte, fora de memoria/ e conexoes/. Mesmo pipeline dai pra
    # frente (permitidos, decomposicao por parte), so muda a origem do bruto.
    brutos.extend(_carregar_nomes_pessoa_fisica(caminho_pessoa_fisica))

    nomes = {}
    for nome in brutos:
        if _chave(nome) in PERMITIDOS:
            continue
        nomes[nome] = _padrao_do_nome(nome)
        # cada parte do nome tambem nega sozinha: um rotulo futuro que escreva
        # so "lucas" tem que ser pego. Errar pra REPROVAR custa um rotulo feio;
        # errar pra aprovar publica o nome da pessoa.
        for parte in re.split(r"[^a-z0-9]+", _chave(nome)):
            if len(parte) >= 4 and parte not in PERMITIDOS and parte not in GENERICOS:
                nomes.setdefault(parte, _padrao_do_nome(parte))

    diag["carregada"] = bool(nomes)
    diag["nomes"] = len(nomes)
    if not nomes:
        diag["erro"] = f"nenhum nome reconhecido em {caminho.name}"
    return sorted(nomes.items()), diag


NOMES_CLIENTE, NEGACAO = carregar_nomes_de_cliente()


def achou_nome_de_cliente(texto: str) -> list:
    """
    Os trechos do texto que sao nome de cliente. Lista vazia = limpo.

    Os trechos vem FUNDIDOS quando se sobrepoem: 'Dr. Exemplo' casa o nome
    inteiro e casa 'exemplo' dentro dele, e trocar os dois separadamente
    corrompia o texto ('[cliente]nte]').
    """
    chave = _chave(texto)
    cru = []
    for nome, padrao in NOMES_CLIENTE:
        for m in padrao.finditer(chave):
            cru.append((m.start(), m.end(), nome))

    fundidos = []
    for ini, fim, nome in sorted(cru):
        if fundidos and ini <= fundidos[-1][1]:
            ant = fundidos[-1]
            fundidos[-1] = (ant[0], max(ant[1], fim), ant[2])
        else:
            fundidos.append((ini, fim, nome))
    return fundidos


def rotulo_seguro(bruto: str, limite: int = 78):
    """
    A PORTA por onde todo texto livre passa antes de virar rotulo na tela.
    Devolve o texto limpo, ou None quando nao da pra garantir que ele esta
    limpo. Quem chama tem que tratar o None: nao existe caminho que devolva
    texto sem passar por aqui.
    """
    texto = redigir(bruto).strip()
    if not texto:
        return None
    if not NEGACAO["carregada"]:
        return None  # sem a lista de nomes nao ha como negar: nao emite

    achados = achou_nome_de_cliente(texto)
    for ini, fim, _ in reversed(achados):
        texto = texto[:ini] + "[cliente]" + texto[fim:]
    texto = texto.strip(" .:-")[:limite].strip(" .:-")

    # a trava confere a PROPRIA saida: se um nome sobreviveu, nao sai nada.
    if not texto or achou_nome_de_cliente(texto):
        return None
    return texto, len(achados)


def redigir_texto_livre(texto: str | None, limite: int = 400, manter_ultimos_4_tel: bool = False) -> str | None:
    """Sanitiza texto livre: remove caminhos do sistema, redige emails/telefones e mascara nomes de clientes.

    Se manter_ultimos_4_tel for True, substitui números de telefone preservando os 4 últimos dígitos
    (ex: '[tel:...4321]'), permitindo identificar leads em títulos de tarefas sem vazar o número completo.
    """
    if not texto or not isinstance(texto, str):
        return texto
    # 1. Sanitizar caminhos internos (/opt/..., /home/..., C:\...)
    limpo = re.sub(r"/(?:opt|home|root|etc|var|tmp|usr)/\S+", "[caminho]", texto)
    limpo = re.sub(r"[a-zA-Z]:\\[^\s'\":]+", "[caminho]", limpo)

    # 2. Redigir emails
    limpo = RE_EMAIL.sub("[e-mail]", limpo)

    # 3. Redigir telefones e números sensíveis
    chave = limpo.translate(TABELA_SEPARADOR)
    pedacos, fim = [], 0
    for m in RE_NUMERO.finditer(chave):
        if m.group("seguro") is not None:
            continue
        pedacos.append(limpo[fim:m.start()])
        bruto = m.group(0)
        digs = re.sub(r"\D", "", bruto)
        if manter_ultimos_4_tel and len(digs) >= 4:
            pedacos.append(f"[tel:...{digs[-4:]}]")
        else:
            pedacos.append(f"[num:{_apelido_do_numero(bruto)}]")
        fim = m.end()
    pedacos.append(limpo[fim:])
    limpo = "".join(pedacos)

    # 4. Mascarar nomes de clientes
    if callable(achou_nome_de_cliente) and isinstance(NEGACAO, dict) and NEGACAO.get("carregada"):
        try:
            achados = achou_nome_de_cliente(limpo)
            for ini, f, _ in reversed(achados):
                limpo = limpo[:ini] + "[cliente]" + limpo[f:]
        except Exception:
            pass

    return limpo[:limite].strip()


def _texto_de_tela(bruto: str) -> str:
    """
    Texto do verificador antes de virar tela. Passa pela MESMA porta do rotulo
    de cron: o comentario de `redigir` dizia que ele era o unico lugar por onde
    texto livre entrava no painel, e nao era — a lista de checagens reprovadas
    entrava sem passar por trava nenhuma.
    """
    bruto = re.sub(
        r"/(?:opt|home|root|etc|var|tmp|usr)/\S+",
        "[caminho interno]",
        bruto,
    )
    saida = rotulo_seguro(bruto, limite=300)
    if saida:
        return saida[0]
    return "[texto omitido: " + ("sem lista de clientes" if not NEGACAO["carregada"] else "nome de cliente") + "]"


def rotulo_do_job(comando: str) -> str:
    """
    Nome curto e legivel de um job, ja negado.

    O comentario da casa (' # o que isso faz') e a melhor fonte. Ele continua
    sendo cortado no primeiro parentese/colchete, mas isso agora e so pra
    ENCURTAR: quem protege e a negacao, que roda sobre o rotulo inteiro em
    TODOS os ramos, inclusive no do nome de script (que antes nem redigir
    passava).
    """
    global _MASCARADOS
    candidatos = []
    if " #" in comando:
        nota = comando.split(" #", 1)[1].strip()
        candidatos.append(nota.split("(")[0].split("[")[0])
    for pedaco in comando.split():
        limpo = pedaco.rstrip("'\"").split("/")[-1]
        if limpo.endswith((".py", ".sh")):
            candidatos.append(limpo)
            break
    for pedaco in comando.split():
        if "/" in pedaco and not pedaco.startswith("-"):
            nome = pedaco.rstrip("'\"").split("/")[-1]
            if nome and nome != "python3":
                candidatos.append(nome)
                break
    candidatos.append(comando.split()[0] if comando.split() else "")

    for bruto in candidatos:
        saida = rotulo_seguro(bruto)
        if saida:
            texto, mascarados = saida
            _MASCARADOS += mascarados
            return texto
    motivo = "sem lista de clientes" if not NEGACAO["carregada"] else "nome de cliente"
    return f"[rótulo omitido: {motivo}]"


_MASCARADOS = 0


def ler_cron():
    """
    Le o crontab e devolve as EXPRESSOES, nao um resultado calculado.

    A tela calcula sozinha o que dispara na proxima hora, toda vez que abre.
    Se o numero fosse calculado aqui, ele nasceria velho no instante seguinte,
    que e exatamente o defeito que este painel existe pra nao ter.
    O servidor roda em UTC: as expressoes estao em UTC.
    """
    negacao = dict(NEGACAO)
    try:
        saida = subprocess.run(
            ["crontab", "-l"], capture_output=True, text=True, timeout=20
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {"total": None, "por_agente": {}, "jobs": [], "fuso": None,
                "negacao": {**negacao, "mascarados": 0}}

    ativas = [l for l in saida.splitlines() if l.strip() and not l.lstrip().startswith("#")]
    por_agente = {}
    for item in SESSAO:
        alvo = f"/opt/gastaomatos/{item['id']}/"
        por_agente[item["id"]] = sum(1 for l in ativas if alvo in l)

    jobs = []
    for linha in ativas:
        m = RE_CRON.match(linha)
        if not m:
            continue
        minuto, hora, dia, mes, dow, comando = m.groups()
        if minuto.startswith("@"):
            continue  # @reboot e afins nao tem horario previsivel
        dono = None
        for item in SESSAO:
            if f"/opt/gastaomatos/{item['id']}/" in comando:
                dono = item["id"]
        jobs.append(
            {
                "expressao": f"{minuto} {hora} {dia} {mes} {dow}",
                "minuto": minuto,
                "hora": hora,
                "dia": dia,
                "mes": mes,
                "dow": dow,
                "rotulo": rotulo_do_job(comando),
                "dono": dono,
            }
        )

    return {
        "total": len(ativas),
        "por_agente": por_agente,
        "jobs": jobs,
        "fuso": "UTC",
        # Quantos nomes de cliente a negacao apagou, e se ela chegou a carregar.
        # Numero sem a ressalva do denominador engana: a lista mede o PISO.
        "negacao": {**negacao, "mascarados": _MASCARADOS},
    }


# `estado_service()` morava aqui e foi trocada por `motores.estado_dos_motores()`
# em 10/09/2026. Ela rodava `systemctl is-active` num nome fixo e tinha dois
# defeitos que se somavam:
#
#   1. o nome fixo era o do service PARADO, entao o painel dizia inativo com o
#      agente vivo;
#   2. `is-active` responde "inactive" tanto para service parado quanto para
#      service que NAO EXISTE (exit 3 contra 4, e o codigo de saida era jogado
#      fora). Zero de erro e zero de ausencia na mesma tela.
#
# O substituto descobre a lista, diz o MOTOR de cada um e separa
# indeterminado de inativo. Ver `coletor/motores.py`.


POSTS_JSON = RAIZ / "produtor_conteudo/data/posts.json"
CAPAS_PUBLIC = RAIZ / "luana/painel_os/web/public/capas"
CAPAS_DIST = RAIZ / "luana/painel_os/web/dist/capas"
CAPA_MAX_BYTES = 900_000
ESTUDIO_HTTPS_ATIVO = RAIZ / "luana/painel_os/servidor/.https-ativo"
ARTEFATOS_RAIZ = (RAIZ / "produtor_conteudo/out").resolve()
TIPOS_ARQUIVO_ESTUDIO = frozenset({
    "docx", "jpeg", "jpg", "json", "mp4", "pdf", "png", "python",
    "svg", "txt", "webp", "zip",
})
ORIGEM_DRIVE_ESTUDIO = "Google Drive compartilhado pelo Gastão"
OBSERVACAO_FONTE_ESTUDIO = {
    "recebido_nao_importado": (
        "Inventário registrado no recebimento. Este lote ainda não foi "
        "incorporado ao posts.json nem publicado."
    ),
    "importado": (
        "Inventário registrado no recebimento. O lote foi incorporado ao "
        "acervo, sem publicar conteúdo automaticamente."
    ),
}


def ler_fontes_estudio(caminho=ESTUDIO_FONTES_JSON):
    """Lê lotes recebidos sem fingir que já viraram peças do produtor.

    O manifesto guarda a proveniência e um inventário agregado. Caminho local,
    nome de arquivo e título não atravessam para o navegador. Uma fonte
    recebida não entra em ``total``, ``prontas`` ou ``com_video``: estes KPIs
    continuam medindo exclusivamente posts.json + out/.
    """
    try:
        bruto = json.loads(Path(caminho).read_text(encoding="utf-8"))
        if not isinstance(bruto, dict) or set(bruto) != {"versao", "fontes"} or bruto["versao"] != 1:
            raise ValueError("contrato ou versão inválida")
        if not isinstance(bruto["fontes"], list):
            raise ValueError("fontes não é lista")
        saida = []
        ids = set()
        campos = {"id", "tipo", "origem", "url", "recebido_em", "estado", "arquivos", "bytes", "conjuntos", "por_tipo", "assinatura_inventario_sha256", "observacao"}
        for item in bruto["fontes"]:
            if not isinstance(item, dict) or set(item) != campos:
                raise ValueError("item com campos inválidos")
            if item["id"] in ids or not re.fullmatch(r"[a-z0-9-]{3,40}", item["id"]):
                raise ValueError("id inválido ou repetido")
            ids.add(item["id"])
            if item["tipo"] != "google_drive" or not re.fullmatch(r"https://drive\.google\.com/drive/folders/[A-Za-z0-9_-]{10,128}", item["url"]):
                raise ValueError("fonte ou URL não autorizada")
            if item["origem"] != ORIGEM_DRIVE_ESTUDIO:
                raise ValueError("origem livre não é permitida")
            if not isinstance(item["recebido_em"], str):
                raise ValueError("recebimento não é texto")
            recebido = datetime.fromisoformat(item["recebido_em"].replace("Z", "+00:00"))
            if recebido.tzinfo is None:
                raise ValueError("recebimento sem fuso")
            if item["estado"] not in {"recebido_nao_importado", "importado"}:
                raise ValueError("estado desconhecido")
            if any(type(item[k]) is not int or item[k] < 0 for k in ("arquivos", "bytes", "conjuntos")):
                raise ValueError("contagem inválida")
            if (
                (item["arquivos"] == 0 and (item["bytes"] != 0 or item["conjuntos"] != 0))
                or (item["arquivos"] > 0 and (item["bytes"] <= 0 or not 1 <= item["conjuntos"] <= item["arquivos"]))
            ):
                raise ValueError("inventário agregado incoerente")
            if (
                not isinstance(item["por_tipo"], dict)
                or any(
                    tipo not in TIPOS_ARQUIVO_ESTUDIO
                    or type(quantidade) is not int
                    or quantidade <= 0
                    for tipo, quantidade in item["por_tipo"].items()
                )
                or sum(item["por_tipo"].values()) != item["arquivos"]
            ):
                raise ValueError("tipos não fecham com arquivos")
            if not re.fullmatch(r"[0-9a-f]{64}", item["assinatura_inventario_sha256"]):
                raise ValueError("assinatura inválida")
            if item["observacao"] != OBSERVACAO_FONTE_ESTUDIO[item["estado"]]:
                raise ValueError("observação livre não é permitida")
            saida.append({k: item[k] for k in ("id", "tipo", "origem", "url", "recebido_em", "estado", "arquivos", "bytes", "conjuntos", "por_tipo", "assinatura_inventario_sha256", "observacao")})
        return {"erro": None, "itens": saida}
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as e:
        return {"erro": f"manifesto de fontes indisponível ({type(e).__name__})", "itens": []}


def _peca_tem_artefato_seguro(p: dict, pasta: Path) -> bool:
    """Indício para a UI. A rota refaz toda a validação antes de entregar."""
    if p.get("marca") != "gastaomatos" or pasta.is_symlink():
        return False
    try:
        base = pasta.resolve(strict=True)
        if not base.is_relative_to(ARTEFATOS_RAIZ):
            return False
    except OSError:
        return False
    assets = p.get("assets") if isinstance(p.get("assets"), dict) else {}
    nomes = [assets.get("video_reel"), assets.get("video_reel_1x1")]
    if isinstance(assets.get("cards"), list):
        nomes.extend(assets["cards"])
    if not any(isinstance(x, str) for x in nomes):
        nomes.append(assets.get("cover"))
    validos = 0
    for nome in nomes:
        if not isinstance(nome, str) or Path(nome).name != nome:
            continue
        alvo = base / nome
        try:
            info = os.lstat(alvo)
            real = alvo.resolve(strict=True)
        except OSError:
            continue
        if stat_mod.S_ISREG(info.st_mode) and not stat_mod.S_ISLNK(info.st_mode) and real.is_relative_to(base):
            validos += 1
    return validos > 0


def _copiar_capa(origem: Path, numero: int):
    """
    Poe a capa onde o navegador alcanca, e devolve a URL, ou None.

    O ARQUIVO SAI COM O NUMERO DA PECA, NUNCA COM O SLUG. Slug de peca de
    cliente carrega o nome do cliente, e nome de cliente numa URL e nome de
    cliente em tela: a regra da casa nao abre excecao para barra de endereco.

    Escreve em `public/` E em `dist/`. `public/` e o que o proximo `npm run
    build` leva junto; `dist/` e o que o servidor serve AGORA. So `public/`
    deixaria a capa invisivel ate alguem lembrar de reconstruir, que e o passo
    manual escondido dentro do que parece automatico.
    """
    try:
        tam = origem.stat().st_size
    except OSError:
        return None
    if tam <= 0 or tam > CAPA_MAX_BYTES:
        return None
    nome = f"{numero}.jpg"
    for pasta in (CAPAS_PUBLIC, CAPAS_DIST):
        # `dist` pode nao existir (ninguem construiu ainda): nao se cria do
        # nada, senao o servidor passa a ter uma pasta orfa sem index.
        if pasta is CAPAS_DIST and not pasta.parent.is_dir():
            continue
        alvo = pasta / nome
        try:
            if alvo.exists() and alvo.stat().st_mtime >= origem.stat().st_mtime:
                continue
            pasta.mkdir(parents=True, exist_ok=True)
            alvo.write_bytes(origem.read_bytes())
            os.utime(alvo, (origem.stat().st_atime, origem.stat().st_mtime))
        except OSError:
            return None
    return f"/capas/{nome}"


def ler_pecas():
    """
    As pecas do produtor de conteudo: o que existe, em que pe esta, e o que de
    fato tem arquivo em disco.

    ‼️ "TER ASSET DECLARADO" E "TER ARQUIVO" SAO COISAS DIFERENTES, e esta
    funcao mede a segunda. O `posts.json` declara `cover` e `video_reel` em 131
    pecas; medido em 08/09, 129 pastas existem, 122 tem capa de verdade e 84
    tem video de verdade. Mostrar o numero declarado seria mostrar a intencao
    do produtor, nao o acervo.

    ⚠️ E o `_dir` envelhece: uma peca ainda aponta para
    `/opt/gastaomatos/ceo_gestor_ia/produtor-conteudo/out/`, que e a raiz de
    antes de a pasta ser movida. Pasta que nao existe entra em
    `pastas_ausentes` COM O NUMERO, em vez de sumir da conta: peca que some
    calada faz o total mentir para menos.
    """
    vazio = {
        "erro": None,
        "arquivo": POSTS_JSON.name,
        "total": None,
        "por_status": {},
        "com_capa": 0,
        "com_video": 0,
        "pastas_ausentes": 0,
        "capas_servidas": 0,
        "pastas_em_disco": None,
        "pastas_sem_capa": 0,
        "pastas_sem_capa_com_video": 0,
        "pastas_fora_do_posts_json": 0,
        "atualizado_em": None,
        "lista": [],
        "analitica": None,
        "acoes_habilitadas": ESTUDIO_HTTPS_ATIVO.is_file(),
        "acoes_bloqueio": None if ESTUDIO_HTTPS_ATIVO.is_file() else "aguardando HTTPS",
        "fontes_recebidas": ler_fontes_estudio(),
    }
    try:
        bruto = json.loads(POSTS_JSON.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        # Falha fechada E VISIVEL: sem isto, "nao consegui ler" e "nao ha peca"
        # chegariam na tela como o mesmo zero.
        vazio["erro"] = f"posts.json indisponível: {type(e).__name__}"
        return vazio

    posts = bruto.get("posts") if isinstance(bruto, dict) else None
    if not isinstance(posts, list):
        vazio["erro"] = "posts.json: não achei a lista 'posts'"
        return vazio

    saida = dict(vazio)
    saida["total"] = len(posts)
    saida["atualizado_em"] = datetime.fromtimestamp(
        POSTS_JSON.stat().st_mtime, tz=timezone.utc
    ).isoformat()
    por_status = {}
    lista = []

    for p in posts:
        if not isinstance(p, dict):
            continue
        status = p.get("status") or "sem status"
        por_status[status] = por_status.get(status, 0) + 1

        assets = p.get("assets")
        if not isinstance(assets, dict) or not assets.get("_dir"):
            continue
        pasta = Path(str(assets["_dir"]))
        if not pasta.is_dir():
            saida["pastas_ausentes"] += 1
            continue

        numero = p.get("n")
        if not isinstance(numero, int):
            continue

        capa = assets.get("cover")
        video = assets.get("video_reel")
        caminho_capa = pasta / capa if isinstance(capa, str) else None
        caminho_video = pasta / video if isinstance(video, str) else None
        tem_capa = bool(caminho_capa and caminho_capa.exists())
        tem_video = bool(caminho_video and caminho_video.exists())
        if tem_capa:
            saida["com_capa"] += 1
        if tem_video:
            saida["com_video"] += 1

        url_capa = _copiar_capa(caminho_capa, numero) if tem_capa else None
        if url_capa:
            saida["capas_servidas"] += 1

        # Texto livre passa pela MESMA porta do rotulo de cron. Titulo de peca
        # de cliente carrega nome de cliente, e nao existe caminho que devolva
        # texto sem passar por aqui.
        titulo_seguro = rotulo_seguro(str(p.get("titulo") or ""), limite=90)
        canais = p.get("canais")
        agenda = p.get("agenda") if isinstance(p.get("agenda"), dict) else {}
        agendado = None
        for canal, quando in (agenda or {}).items():
            if isinstance(quando, dict) and quando.get("data"):
                agendado = f"{quando['data']} {quando.get('hora') or ''} {canal}".strip()
                break

        lista.append(
            {
                "n": numero,
                "titulo": titulo_seguro[0] if titulo_seguro else "[rótulo omitido]",
                "formato": p.get("formato") or None,
                "status": status,
                "canais": canais if isinstance(canais, list) else [],
                "data": p.get("data") or None,
                "hora": p.get("hora_publicacao") or None,
                "agendado_para": agendado,
                "tem_capa": tem_capa,
                "tem_video": tem_video,
                "capa_url": url_capa,
                "atualizado": p.get("updated_at") or None,
                "artefato_disponivel": _peca_tem_artefato_seguro(p, pasta),
                "aprovacao_disponivel": _peca_tem_artefato_seguro(p, pasta) and status == "pendente",
            }
        )

    # O ACERVO EM DISCO E MAIOR QUE O QUE O posts.json CONHECE, e a diferenca e
    # a fila de trabalho. Medido aqui e nao repetido de segunda mao: numero que
    # vem de outro relatorio ou vai marcado com a fonte, ou vai remedido.
    raiz_out = RAIZ / "produtor_conteudo/out"
    conhecidas = {
        Path(str(p["assets"]["_dir"])).name
        for p in posts
        if isinstance(p, dict)
        and isinstance(p.get("assets"), dict)
        and p["assets"].get("_dir")
    }
    if raiz_out.is_dir():
        pastas = [d for d in raiz_out.iterdir() if d.is_dir()]
        saida["pastas_em_disco"] = len(pastas)
        saida["pastas_sem_capa"] = sum(1 for d in pastas if not (d / "cover.jpg").exists())
        saida["pastas_sem_capa_com_video"] = sum(
            1
            for d in pastas
            if not (d / "cover.jpg").exists() and any(d.glob("*.mp4"))
        )
        saida["pastas_fora_do_posts_json"] = sum(1 for d in pastas if d.name not in conhecidas)
    else:
        saida["pastas_em_disco"] = None

    saida["por_status"] = por_status
    saida["analitica"] = agregar_analitica(posts)
    # Mais novas primeiro: e a ordem em que o dono pensa no acervo dele.
    saida["lista"] = sorted(lista, key=lambda x: x["n"], reverse=True)
    return saida


def agregar_analitica(posts):
    """Contrato analítico isolado na marca própria, sem chamar Meta nem inferir desempenho."""
    proprios = [p for p in posts if isinstance(p, dict) and p.get("marca") == "gastaomatos"]
    por_status = {}
    formatos = {}
    canais = {}
    com_agenda = 0
    links = {"instagram": 0, "linkedin": 0}
    for p in proprios:
        status = str(p.get("status") or "sem status")
        por_status[status] = por_status.get(status, 0) + 1
        formato = str(p.get("formato") or "sem formato")
        formatos[formato] = formatos.get(formato, 0) + 1
        for canal in p.get("canais") if isinstance(p.get("canais"), list) else []:
            if canal in ("instagram", "linkedin"):
                canais[canal] = canais.get(canal, 0) + 1
        if isinstance(p.get("agenda"), dict) and any(isinstance(v, dict) and v.get("data") for v in p["agenda"].values()):
            com_agenda += 1
        publicados = p.get("links_publicados")
        if isinstance(publicados, dict):
            for canal in links:
                registro = publicados.get(canal)
                if ((isinstance(registro, str) and registro.strip()) or
                        (isinstance(registro, dict) and
                         any(isinstance(registro.get(k), str) and registro[k].strip()
                             for k in ("id", "permalink")))):
                    links[canal] += 1
    return {
        "escopo": "gastaomatos",
        "total": len(proprios),
        "por_status": por_status,
        "por_formato": formatos,
        "por_canal": canais,
        "com_agenda": com_agenda,
        "links_publicados": links,
        "meta": {
            "estado": "bloqueado",
            "metricas": None,
            "motivo": (
                "não há conector de insights orgânicos do Instagram disponível nesta sessão; "
                "o token local cobre só parte da frota e não será usado para varredura. Os links "
                "dão chave de vínculo, mas sem leitura da Meta não provam alcance nem engajamento"
            ),
        },
    }


RE_CAMINHO_PRIVADO = re.compile(
    r"(?:^|[\s='\"(])(?:/(?:opt|home|root|etc|var|tmp|usr)(?:/|\b)|~[/\\]|[A-Za-z]:[\\/])",
    re.IGNORECASE,
)
RE_SEGREDO_PUBLICO = re.compile(
    r"(?:\bBearer\s+[A-Za-z0-9._~+/-]{8,}|\bsk-[A-Za-z0-9_-]{8,}|"
    r"\bdk_live_[A-Za-z0-9_-]{6,}|\bEA[A-Za-z0-9]{30,})",
    re.IGNORECASE,
)
RE_CHAVE_SECRETA = re.compile(
    r"(?:auth[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?token|user[_-]?token|secret[_-]?token|\btoken\b|senha|password|secret|api[_-]?key|authorization)",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# NÚMERO DE PESSOA NA PORTA FINAL
#
# Esta porta reprovava e-mail, caminho de máquina e formato de segredo, e
# deixava passar telefone, CPF e CNPJ: justamente a classe que a régua velha
# (`\d{6,}`) também não segurava. Campo NOVO que nascesse com telefone cru era
# escrito no `estado.json` servido sem ninguém reprovar, e é para o campo novo
# que esta função existe.
#
# ‼️ SÓ NÚMERO PONTUADO, E A RAZÃO É QUE ESTA FUNÇÃO LEVANTA.
#
# A primeira versão desta porta reprovava os cinco grupos de pessoa da
# `RE_NUMERO`, inclusive corrida NUA de dígitos e faixa `NNNN-NNNN`. Um QA
# adversarial derrubou, e a remedição mostrou pior do que ele achou: essa régua
# PARA O COLETOR em texto correto da casa, e ninguém tem como desfazer, porque
# não há gente no meio.
#
# Medido em 10/09/2026 contra 6.999 linhas reais de `memoria/`, `diario/` e os
# dois `CLAUDE.md`:
#
#   régua com corrida nua .... para em 8 linhas. CINCO delas são id de conta e
#       de campanha do Google Ads (`6907685124`, `7709375454`, `7436734749`,
#       `7747749986`): dez dígitos que a régua lê como telefone sem DDD.
#   régua só com pontuado .... para em 1 linha, e essa é um telefone DE VERDADE
#       escrito no diário. Falso positivo zero.
#
# E as três bombas que a versão larga armava, todas desarmadas pela estreita:
#
#   `biblioteca.itens[].id` é `sha256(...)[:12]`. Quando os 12 hex saem só
#       dígitos começando em 55 mais DDD, viram `fone`: 9 em 400.000 sorteios,
#       0,56% com os 248 itens de hoje, e SUBINDO a cada pasta nova em `out/`.
#       Com a régua estreita: 0 em 400.000.
#   faixa de verba na diretiva, que o dono escreve no Telegram: `3000-4000` e
#       `2500-3500` casavam como `fixo` e matavam a coleta. `2000-3000` e
#       `6000-7000` passavam, então o defeito era imprevisível por desenho.
#   epoch em segundos (`1787766056`) casava como `fone` sem DDD.
#
# A régua que sobrou: o número tem que estar ESCRITO como número de gente, com
# pontuação. `cpf` e `cnpj` já são pontuados por definição; `fone` e `celular`
# exigem parêntese, mais, espaço, ponto ou hífen dentro do match. Isso é
# exatamente o buraco que esta trava veio fechar, porque a régua velha
# (`\d{6,}`) já pegava o colado e deixava passar o FORMATADO.
#
# ‼️ O QUE FICA DE FORA, DECLARADO E MEDIDO:
#   - corrida NUA (`5547999887766`, `47999887766`), CPF e CNPJ colados
#   - faixa `NNNN-NNNN` sem DDD (o grupo `fixo`, fora da lista de propósito)
#   Os quatro continuam morrendo em `redigir`, que é a porta por onde texto
#   livre entra (conferido: `redigir` altera os quatro). Esta aqui é a rede de
#   segurança do campo que nasce SEM passar por lá, e ela mede o PISO.
#   - a porta não olha NOME de cliente em lugar nenhum: quem nega nome é
#     `rotulo_seguro`, e campo que não passa por ele não tem rede.
# ---------------------------------------------------------------------------

GRUPOS_DE_PESSOA = ("cpf", "cnpj", "fone", "celular")

# O que separa "escreveram um telefone" de "saiu uma corrida de dígitos".
RE_PONTUACAO_DE_FONE = re.compile(r"[ .()+\-]")


def numero_de_pessoa(texto: str):
    """O primeiro número ESCRITO como número de gente, ou None quando não há.

    Lê pela mesma `RE_NUMERO` da máscara E sobre a mesma chave normalizada, ou
    seja: uma régua só, não duas que discordam. Isso não é zelo, é conserto de
    um defeito medido em 10/09/2026: a normalização de separador entrou em
    `redigir` e NÃO aqui, e por dez minutos `47 99988‑7766` com hífen U+2011
    era mascarado pela porta do texto livre e APROVADO pela porta final. Quem
    pegou foi o controle positivo do varredor, não a leitura do código.
    """
    for m in RE_NUMERO.finditer(texto.translate(TABELA_SEPARADOR)):
        if m.group("seguro") is not None:
            continue
        if m.group("cpf") is not None or m.group("cnpj") is not None:
            return m.group(0)
        if ((m.group("fone") is not None or m.group("celular") is not None)
                and RE_PONTUACAO_DE_FONE.search(m.group(0))):
            return m.group(0)
    return None


def _problemas_no_texto(texto: str, caminho: str, onde: str = "") -> list:
    """As quatro checagens de texto, num lugar só.

    Chave e valor de dicionário passam pelas MESMAS quatro. Duas listas que
    deviam ser iguais viram duas réguas que discordam na primeira edição, e a
    frouxa é sempre a que grava.
    """
    problemas = []
    if RE_CAMINHO_PRIVADO.search(texto):
        problemas.append(f"{caminho}: caminho privado{onde}")
    if RE_EMAIL.search(texto):
        problemas.append(f"{caminho}: e-mail{onde}")
    if numero_de_pessoa(texto):
        problemas.append(f"{caminho}: número com forma de pessoa{onde}")
    if RE_SEGREDO_PUBLICO.search(texto):
        problemas.append(f"{caminho}: formato de segredo{onde}")
    return problemas


def auditar_estado_publico(valor, caminho="estado"):
    """Varre o contrato inteiro; vazamento em campo novo também reprova.

    IDs técnicos, nomes de arquivo e rotas públicas continuam permitidos.
    Caminho de máquina, e-mail, número com forma de pessoa e material com
    formato de segredo nunca são enviados, e isso vale para a CHAVE do objeto
    tanto quanto para o valor: agregar por cliente, por lead ou por telefone
    põe o dado na chave, e só o nome de credencial era conferido ali.

    ‼️ Ela NÃO olha nome de cliente, em nenhum ramo. Quem nega nome é
    `rotulo_seguro`; campo que não passa por ele não tem rede aqui.

    O problema sai com o ENDEREÇO e o nome da classe, nunca com o valor: a
    mensagem vira texto de `RuntimeError` e não pode ser o novo lugar por onde
    o dado vaza.
    """
    problemas = []
    if isinstance(valor, dict):
        for chave, item in valor.items():
            onde = f"{caminho}.{chave}"
            if RE_CHAVE_SECRETA.search(str(chave)):
                problemas.append(f"{onde}: chave de credencial proibida")
            problemas.extend(_problemas_no_texto(str(chave), onde, " (na chave)"))
            problemas.extend(auditar_estado_publico(item, onde))
    elif isinstance(valor, list):
        for indice, item in enumerate(valor):
            problemas.extend(auditar_estado_publico(item, f"{caminho}[{indice}]"))
    elif isinstance(valor, str):
        problemas.extend(_problemas_no_texto(valor, caminho))
    return problemas


def main():
    agentes = descobrir_agentes()
    conv = ler_convocacoes()
    convocacoes = conv["por_agente"]
    ultima_vez = conv["ultima"]
    transcripts = conv["arquivos"]
    total_convocacoes = conv["total"]
    cron = ler_cron()
    pecas = ler_pecas()
    fiscal_comercial = ler_fiscal_comercial()
    aprovacoes = ler_aprovacoes()
    cofre = ler_cofre()
    ferramentas = ler_ferramentas()
    sops = ler_sops(agentes)
    cobrancas = ler_cobrancas()
    chamadas = ler_chamadas()
    biblioteca = ler_biblioteca()
    pipeline = ler_pipeline()
    followup = ler_followup()
    calendario = ler_calendario()
    uso_planos = ler_uso_planos()
    financeiro = ler_financeiro()
    redes = ler_redes_organicas()
    analytics = ler_analytics_ga4()
    diretiva = carregar_diretiva(DIRETIVA_JSON)
    if isinstance(diretiva, dict) and diretiva.get("objetivo"):
        limpo = rotulo_seguro(diretiva["objetivo"], limite=500)
        diretiva["objetivo"] = limpo[0] if limpo else "[objetivo omitido: não passou na trava de nome de cliente]"

    for ag in agentes:
        ag["convocacoes"] = convocacoes.get(ag["id"])
        ag["ultima_convocacao"] = ultima_vez.get(ag["id"])
        ag["convocacoes_24h"] = conv["por_agente_24h"].get(ag["id"], 0)
        ag["convocacoes_7d"] = conv["por_agente_7d"].get(ag["id"], 0)
        ag["retornos_registrados"] = conv["retornos_por_agente"].get(ag["id"], 0)

    sessao = []
    # UMA sonda para todos os agentes: a listagem de units do systemd e a mesma
    # para todo mundo e so precisa ser pedida uma vez (2,28s -> 1,37s medidos).
    sonda_motores = motores.Sonda()
    agora_sessao = agora_utc()
    processos_claude = ler_processos_claude_remotos()
    for item in SESSAO:
        pasta = item["pasta"]
        presenca = ler_presenca_sessao(item, agora=agora_sessao, processos_claude=processos_claude)
        sessao.append(
            {
                "id": item["id"],
                "nome": item["nome"],
                "papel": item["papel"],
                "camada": item["camada"],
                "resumo": item["resumo"],
                "cor": item["cor"],
                "pasta": f"operação:{item['id']}",
                "estado": presenca["estado"],
                "ultima_atividade": presenca["ultima_atividade"],
                "fonte_atividade": presenca["fonte_atividade"],
                "erro_atividade": presenca["erro_atividade"],
                "existe": pasta.is_dir(),
                "verificador": ler_verificador(item["verificador"]),
                "memoria": contar_arquivos_linhas(pasta / "memoria", "*.md"),
                "diario": contar_arquivos_linhas(pasta / "diario", "*.md"),
                "cron_linhas": cron["por_agente"].get(item["id"]),
                "service_prefixo": item["service_prefixo"],
                "motores": motores.estado_dos_motores(item["service_prefixo"], sonda_motores),
            }
        )

    # Convocacoes de nomes que NAO sao agentes da casa (embutidos do Claude Code).
    ids_casa = {a["id"] for a in agentes} | {s["id"] for s in sessao}
    de_fora = {k: v for k, v in convocacoes.items() if k not in ids_casa}

    squad_trafego = ler_squad_trafego()
    squad_bots = ler_squad_bots()

    salvar_mapas_quem_convoca_quem(janelas, agentes, squads)
    salvar_mapa_setor_comercial()
    salvar_mapa_setor_trafego()
    salvar_mapa_setor_bots()

    estado = {
        "gerado_em": agora_utc().isoformat(),
        "fonte": {
            "agentes": "frontmatter dos catálogos global e de squads operacionais",
            "convocacoes": (
                f"{total_convocacoes} chamadas únicas de subagente em {transcripts} transcripts "
                f"(transcrições da sessão, inclusive as de subagente), contadas por id da "
                f"chamada e não por linha; {conv['repetidas_descartadas']} repetidas descartadas. "
                f"RETORNO é o relatório do agente chegando (notificação de conclusão ou resultado "
                f"do agente síncrono), nunca o recibo de lançamento: é PISO, porque "
                f"{conv['retornos_sem_par']} notificações de agente concluído não trazem o id da "
                f"chamada e não casam com ninguém. "
                f"CONTADOR VIVO: muda enquanto a operação roda, então ele só vale com a hora ao lado"
            ),
            "convocacoes_por_modelo": (
                "resolvedModel do toolUseResult de cada chamada Agent nos transcripts Claude, "
                "contado por id da chamada; existe só para o motor Claude (Codex não expõe este "
                "campo) e é PISO, porque chamada sem resultado ainda medido fica de fora"
            ),
            "verificadores": "verificar_frota_ULTIMO.txt e verificar_bots_ULTIMO.txt, lidos, não rodados",
            "pecas": (
                f"produtor_conteudo/data/posts.json ({pecas['total']} registros) mais a "
                f"existência real de cada arquivo em out/: {pecas['com_capa']} capas e "
                f"{pecas['com_video']} vídeos conferidos no disco, não declarados"
                if pecas["erro"] is None
                else f"NÃO LIDO: {pecas['erro']}"
            ),
            "cron": (
                "crontab -l do usuário claude, em UTC; o que dispara na próxima hora é calculado na tela, a cada abertura"
                + (
                    f"; rótulo negado contra {cron['negacao']['nomes']} nomes de memoria/clientes.md"
                    if cron.get("negacao", {}).get("carregada")
                    else f"; ATENÇÃO: {cron.get('negacao', {}).get('erro')} — rótulo de comentário DESLIGADO"
                )
            ),
        },
        "resumo": {
            "agentes_casa": len(agentes),
            "agentes_sessao": len(sessao),
            "convocacoes_total": total_convocacoes,
            "convocacoes_casa": sum(v for k, v in convocacoes.items() if k in ids_casa),
            "convocacoes_pela_sessao": conv["pela_sessao"],
            "convocacoes_por_subagente": conv["por_subagente"],
            "convocacoes_repetidas_descartadas": conv["repetidas_descartadas"],
            "convocacoes_por_motor": conv["por_motor"],
            "convocacoes_por_modelo": conv["por_modelo"],
            "transcripts_por_motor": conv["arquivos_por_motor"],
            "transcripts_lidos": transcripts,
            "cron_ativo": cron["total"],
        },
        "verificadores": {
            s["id"]: {
                "checagens": s["verificador"].get("checagens"),
                "reprovadas": s["verificador"].get("reprovadas"),
                "indeterminadas": s["verificador"].get("indeterminadas"),
                "vencido": s["verificador"].get("vencido"),
                "arquivo": s["verificador"].get("arquivo"),
                "erro_leitura": s["verificador"].get("erro_leitura"),
                "falhas": s["verificador"].get("falhas", []),
            }
            for s in sessao
        },
        "cron": cron,
        "pecas": pecas,
        "comercial": fiscal_comercial,
        "aprovacoes": aprovacoes,
        "cofre": cofre,
        "ferramentas": ferramentas,
        "sops": sops,
        "cobrancas": cobrancas,
        "chamadas": chamadas,
        "biblioteca": biblioteca,
        "pipeline": pipeline,
        "followup": followup,
        "calendario": calendario,
        "diretiva": diretiva,
        "uso_planos": uso_planos,
        "financeiro": financeiro,
        "redes": redes,
        "analytics": analytics,
        "squad_trafego": squad_trafego,
        "squad_bots": squad_bots,
        "squads": SQUADS,
        "sessao": sessao,
        "agentes": agentes,
        "convocacoes_fora_da_casa": de_fora,
        "arestas": conv["arestas"],
        "janelas": janelas,
        "convocacoes_erro": conv["erro"],
        "chamador_nao_resolvido": conv["chamador_nao_resolvido"],
    }

    problemas_privacidade = auditar_estado_publico(estado)
    if problemas_privacidade:
        raise RuntimeError(
            "estado público reprovado pela trava de privacidade: "
            + " | ".join(problemas_privacidade[:8])
        )

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_saida = tempfile.mkstemp(prefix=".estado-", suffix=".json", dir=str(SAIDA.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f_saida:
            json.dump(estado, f_saida, ensure_ascii=False, indent=2)
            f_saida.write("\n")
            f_saida.flush()
            os.fsync(f_saida.fileno())
        os.replace(tmp_saida, SAIDA)
    finally:
        if os.path.exists(tmp_saida):
            try:
                os.unlink(tmp_saida)
            except OSError:
                pass
    print(f"escrito: {SAIDA}")
    print(
        f"  {len(agentes)} agentes da casa | {len(sessao)} de sessao | "
        f"{total_convocacoes} convocacoes em {transcripts} transcripts"
    )
    if pecas["erro"]:
        print(f"  pecas: NAO LIDAS -> {pecas['erro']}")
    else:
        print(
            f"  {len(pecas['lista'])} pecas com pasta viva | {pecas['com_capa']} capas | "
            f"{pecas['com_video']} videos | {pecas['capas_servidas']} capas servidas | "
            f"{pecas['pastas_ausentes']} pastas ausentes | "
            f"out/ tem {pecas['pastas_em_disco']} pastas, {pecas['pastas_sem_capa']} sem capa "
            f"({pecas['pastas_sem_capa_com_video']} delas com mp4)"
        )
    sem_numero = [a["id"] for a in agentes if a["convocacoes"] is None]
    if sem_numero:
        print(f"  sem convocacao registrada (campo fica vazio na tela): {', '.join(sem_numero)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
