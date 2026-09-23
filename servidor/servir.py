#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor do PAINEL OS.

Seis funções:
  autenticação -> nenhum byte sai sem credencial certa, em TODA rota
  /api/estado  -> RODA o coletor na hora e devolve o estado recém-medido
  /            -> serve o painel construído (web/dist)
  decisão      -> registra aprovação, sem publicar, somente atrás do HTTPS
  download     -> entrega artefato próprio por ID técnico, somente atrás do HTTPS
  envio        -> põe peça pendente em Aprovações, sem publicar, atrás do HTTPS

Por que a API inicia o coletor em vez de servir só o arquivo salvo: número que
fica guardado envelhece sem ninguém perceber. A coleta é única e segue em
segundo plano; a API espera até 8s. Se ela ainda não acabou, devolve o snapshot
com ``calculado_ao_abrir: false`` e a hora original, nunca carimbado como novo.

AUTENTICAÇÃO (08/09/2026)
-------------------------
O painel mostra checagem reprovada com o texto inteiro, caminho absoluto do
servidor, a estrutura dos agentes e o crontab em forma de rótulo. Ele já ficou
servido em 0.0.0.0 SEM SENHA: `curl http://31.97.21.249:5199/` devolvia 200.
O conserto de emergência foi prender em 127.0.0.1, e isso tirou o painel do
navegador do dono, que é quem precisa dele.

Então a porta voltou a escutar fora do loopback, com a trava no lugar certo:

  * A checagem mora em `parse_request`, o ponto único por onde TODA requisição
    passa antes de qualquer despacho. Não é um `if` dentro do do_GET: verbo
    novo, rota nova e arquivo estático nascem protegidos, sem ninguém lembrar.
    (Regra da casa: a trava mora na PORTA, não na decisão.)
  * A credencial vem de um ARQUIVO fora desta pasta, lido a cada requisição,
    NUNCA de variável de ambiente. Trava de segurança não mora em env.
  * A comparação é em tempo constante (hmac.compare_digest sobre SHA-256, que
    também esconde o comprimento).
  * FALHA FECHADA: arquivo ausente, vazio, ilegível, com permissão frouxa ou
    com senha curta => 503 em TUDO, e o motivo no log do servidor. Nunca
    "sem senha configurada, então libera". E o servidor nem sobe nesse estado.

O que isto NÃO cobre: HTTP puro, sem TLS. A credencial trafega em base64
legível para quem estiver no caminho de rede. Ver o README.md, seção
"O que a senha ainda não protege".

Rodar:
    python3 /opt/gastaomatos/luana/painel_os/servidor/servir.py
    (porta 5199; abrir em http://31.97.21.249:5199/ e informar a credencial)

Este servidor NÃO publica nada. Escreve o estado coletado e, nas rotas humanas
de decisão e envio, `data/aprovacoes.json` por substituição atômica.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import shutil
import stat as stat_mod
import subprocess
import sys
import threading
import time
import tempfile
import zipfile
from urllib.parse import urlsplit
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    # Quando este arquivo é carregado como módulo pelo servidor/testes, o
    # pacote está disponível a partir da raiz do painel.
    from servidor.agentes_vivos import ler_agentes, ler_agentes_da_casa
except ModuleNotFoundError:
    try:
        # Execução direta (python servidor/servir.py), em que o diretório do
        # script é a entrada do sys.path.
        from agentes_vivos import ler_agentes, ler_agentes_da_casa
    except ModuleNotFoundError:
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from agentes_vivos import ler_agentes, ler_agentes_da_casa

RAIZ = Path(__file__).resolve().parent.parent

try:
    from coletor.coletar_estado import redigir, achou_nome_de_cliente, NEGACAO
except ModuleNotFoundError:
    try:
        from coletar_estado import redigir, achou_nome_de_cliente, NEGACAO
    except ModuleNotFoundError:
        import sys
        sys.path.insert(0, str(RAIZ / "coletor"))
        try:
            from coletar_estado import redigir, achou_nome_de_cliente, NEGACAO
        except Exception:
            redigir = None
            achou_nome_de_cliente = None
            NEGACAO = {"carregada": False}
DIST = RAIZ / "web" / "dist"
COLETOR = RAIZ / "coletor" / "coletar_estado.py"
# 20/09/2026: o snapshot REAL vive em `data/`, igual aprovacoes.json e
# cofre.json (fora do git, permissao 700). NUNCA apontar de volta para
# `web/src/dados/estado.json`: aquele arquivo e a fixture sintetica que o
# build importa, e ficou sendo sobrescrita com dado real a cada request,
# inclusive um commit que subiu essa versao suja para o GitHub publico.
ESTADO = RAIZ / "data" / "estado.json"
# Antes do HTTPS, mantém o acesso legado autenticado na porta pública. O
# instalador TLS cria o marcador somente DEPOIS de certificado + nginx válidos;
# a partir daí reinícios prendem o backend ao loopback.
PORTA = int(os.environ.get("PAINEL_OS_PORTA", "5199"))
ENDERECO = os.environ.get(
    "PAINEL_OS_ENDERECO",
    "127.0.0.1" if (RAIZ / "servidor/.https-ativo").is_file() else "0.0.0.0",
)

# A credencial mora FORA de painel_os, no mesmo lugar dos outros segredos da
# casa, com modo 600. Formato: uma linha "usuario:senha".
CREDENCIAL = Path("/opt/gastaomatos/luana/.painel_os.credencial")
SENHA_MINIMA = 12  # baixado de 16 pra 12 por pedido dele em 21/09/2026
# Custo por tentativa errada. Não é proteção séria (a senha é longa), é só para
# tornar caro varrer a porta. Cada requisição roda na própria thread.
ATRASO_FALHA = 0.4

# Um F5 seguido não pode disparar dois coletores em cima do mesmo arquivo.
# A coleta roda fora da trava: arquivos estáticos e as demais rotas continuam
# respondendo enquanto ela mede as fontes lentas.
_trava = threading.Lock()
_coleta_pronta = threading.Condition(_trava)
_coleta_em_andamento = False
_cache: dict[str, object] = {"quando": 0.0, "corpo": b""}
JANELA_CACHE = 15.0
# O navegador nunca espera os 120s máximos do subprocesso. Se a medição ainda
# estiver rodando, recebe o snapshot com a idade original e uma falha explícita.
LIMITE_ESPERA_COLETA = 8.0
APROVACOES = RAIZ / "data" / "aprovacoes.json"
POSTS_JSON = Path("/opt/gastaomatos/produtor_conteudo/data/posts.json")
ARTEFATOS_RAIZ = Path("/opt/gastaomatos/produtor_conteudo/out").resolve()
HTTPS_ATIVO = RAIZ / "servidor" / ".https-ativo"
APROVACAO_ESTADOS_FINAIS = {"aprovado", "reprovado", "cancelado"}
APROVACAO_TIPOS = {"conteudo", "documento", "campanha", "outro"}
ROTAS_API_VALIDAS = {
    "/api/estado",
    "/api/agentes-vivos",
    "/api/ferramentas/acessos",
    "/api/estudio/artefato",
}
_trava_aprovacoes = threading.Lock()
MAXIMO_REQUISICOES = 32
ARTEFATO_MAX_BYTES = 300_000_000
PACOTE_MAX_BYTES = 1_000_000_000


class CredencialQuebrada(RuntimeError):
    """O servidor não consegue saber quem é quem. Recusa tudo, e diz por quê."""


def ler_credencial() -> tuple[bytes, bytes]:
    """Devolve (usuario, senha) do arquivo, ou LEVANTA. Nunca devolve default.

    Lido a cada requisição de propósito: apagar o arquivo com o servidor no ar
    tem que fechar o painel na hora, não na próxima reinicialização.
    """
    try:
        info = os.lstat(CREDENCIAL)
    except OSError as e:
        raise CredencialQuebrada(
            f"{CREDENCIAL}: não deu para ler ({type(e).__name__}: {e.strerror})"
        ) from e

    if stat_mod.S_ISLNK(info.st_mode):
        raise CredencialQuebrada(
            f"{CREDENCIAL}: é link simbólico, e o alvo pode ter permissão frouxa"
        )
    if not stat_mod.S_ISREG(info.st_mode):
        raise CredencialQuebrada(f"{CREDENCIAL}: não é arquivo comum")
    if os.name != "nt" and (info.st_mode & 0o077):
        raise CredencialQuebrada(
            f"{CREDENCIAL}: legível por grupo ou outros "
            f"(modo {info.st_mode & 0o777:o}). Conserto: chmod 600 {CREDENCIAL}"
        )

    try:
        bruto = CREDENCIAL.read_bytes()
    except OSError as e:
        raise CredencialQuebrada(
            f"{CREDENCIAL}: não deu para ler ({type(e).__name__}: {e.strerror})"
        ) from e

    for linha in bruto.split(b"\n"):
        linha = linha.rstrip(b"\r")
        if not linha.strip() or linha.lstrip().startswith(b"#"):
            continue
        usuario, separador, senha = linha.partition(b":")
        if not separador:
            raise CredencialQuebrada(
                f"{CREDENCIAL}: a primeira linha útil não tem ':' "
                "(formato esperado: usuario:senha)"
            )
        usuario = usuario.strip()
        if not usuario:
            raise CredencialQuebrada(f"{CREDENCIAL}: usuário vazio")
        if len(senha) < SENHA_MINIMA:
            raise CredencialQuebrada(
                f"{CREDENCIAL}: senha com {len(senha)} caracteres, "
                f"o mínimo é {SENHA_MINIMA}"
            )
        return usuario, senha

    raise CredencialQuebrada(
        f"{CREDENCIAL}: nenhuma linha de credencial (vazio ou só comentário)"
    )


def _igual(recebido: bytes, esperado: bytes) -> bool:
    """Tempo constante, e sobre o digest para não vazar nem o comprimento."""
    return hmac.compare_digest(
        hashlib.sha256(recebido).digest(), hashlib.sha256(esperado).digest()
    )


def credencial_confere(cabecalho: str, usuario_ok: bytes, senha_ok: bytes) -> bool:
    esquema, _, blob = (cabecalho or "").partition(" ")
    if esquema.lower() != "basic":
        return False
    try:
        cru = base64.b64decode(blob.strip(), validate=True)
    except ValueError:
        return False
    usuario, separador, senha = cru.partition(b":")
    if not separador:
        return False
    # Os dois são calculados SEMPRE: nada de curto-circuito no `and`.
    certo_usuario = _igual(usuario, usuario_ok)
    certa_senha = _igual(senha, senha_ok)
    return certo_usuario and certa_senha


def _ler_estado() -> dict:
    dados = json.loads(ESTADO.read_text(encoding="utf-8"))
    if not isinstance(dados, dict):
        raise ValueError("o estado salvo não é um objeto")
    return dados


def _sanitizar_erro_publico(texto: str) -> str:
    """Remove caminhos absolutos e detalhes privados do sistema antes de expor ao navegador."""
    if not texto:
        return ""
    limpo = re.sub(r"(/[a-zA-Z0-9_.-]+)+/[a-zA-Z0-9_.-]+\.py", "[arquivo.py]", texto)
    limpo = re.sub(r"(/opt|/home|/etc|/var|/usr|/tmp|~)[^\s'\":]+", "[caminho-omitido]", limpo)
    limpo = re.sub(r"[a-zA-Z]:\\[^\s'\":]+", "[caminho-omitido]", limpo)
    return limpo.strip()


def _medir_estado() -> bytes:
    """Executa uma medição. Chamada somente pelo worker único."""
    inicio = time.monotonic()
    erro = None
    try:
        r = subprocess.run(
            [sys.executable, str(COLETOR)],
            capture_output=True, text=True, timeout=120,
        )
        if r.returncode != 0:
            erro_bruto = (r.stderr or "coletor falhou sem mensagem").strip()[:400]
            erro = _sanitizar_erro_publico(erro_bruto)
    except (OSError, subprocess.SubprocessError) as e:
        erro = _sanitizar_erro_publico(f"{type(e).__name__}: {e}"[:400])

    try:
        dados = _ler_estado()
    except (OSError, ValueError) as e:
        return json.dumps(
            {"erro": f"não consegui ler o estado: {_sanitizar_erro_publico(str(e))}"}, ensure_ascii=False
        ).encode("utf-8")

    # A hora vai COLADA no dado: número sem hora de coleta não entra.
    dados["calculado_em"] = datetime.now(timezone.utc).isoformat()
    dados["calculo_ms"] = round((time.monotonic() - inicio) * 1000)
    dados["calculado_ao_abrir"] = erro is None
    if erro:
        dados["erro_coletor"] = erro
    return json.dumps(dados, ensure_ascii=False).encode("utf-8")


def _worker_coleta() -> None:
    global _coleta_em_andamento
    try:
        corpo = _medir_estado()
    except Exception as e:  # o flag não pode ficar preso se o worker tropeçar
        corpo = json.dumps(
            {"erro": f"falha inesperada na coleta: {type(e).__name__}: {e}"},
            ensure_ascii=False,
        ).encode("utf-8")
    with _coleta_pronta:
        _cache.update(quando=time.monotonic(), corpo=corpo)
        _coleta_em_andamento = False
        _coleta_pronta.notify_all()


def _snapshot_enquanto_mede(espera_ms: int) -> bytes:
    """Snapshot honesto: conserva ``gerado_em`` e nunca finge ser novo."""
    try:
        dados = _ler_estado()
    except (OSError, ValueError) as e:
        return json.dumps(
            {"erro": f"coleta em andamento e não consegui ler o estado salvo: {e}"},
            ensure_ascii=False,
        ).encode("utf-8")
    dados["calculado_ao_abrir"] = False
    dados["erro_coletor"] = (
        "a coleta continua em segundo plano; esta resposta é o último snapshot salvo"
    )
    dados["coleta_em_andamento"] = True
    dados["espera_ms"] = espera_ms
    # Um ``calculado_em`` deixado pelo servidor numa resposta anterior poderia
    # parecer a idade destes números. O instante válido aqui é ``gerado_em``.
    dados.pop("calculado_em", None)
    dados.pop("calculo_ms", None)
    return json.dumps(dados, ensure_ascii=False).encode("utf-8")


def coletar(limite_espera: float = LIMITE_ESPERA_COLETA) -> bytes:
    """Single-flight com espera limitada e fallback explicitamente datado."""
    global _coleta_em_andamento
    inicio = time.monotonic()
    with _coleta_pronta:
        idade = time.monotonic() - float(_cache["quando"])
        if _cache["corpo"] and idade < JANELA_CACHE:
            return _cache["corpo"]  # type: ignore[return-value]
        if not _coleta_em_andamento:
            _coleta_em_andamento = True
            threading.Thread(target=_worker_coleta, name="painel-coletor", daemon=True).start()
        prazo = inicio + max(0.0, limite_espera)
        while _coleta_em_andamento:
            restante = prazo - time.monotonic()
            if restante <= 0:
                break
            _coleta_pronta.wait(restante)
        if not _coleta_em_andamento and _cache["corpo"]:
            return _cache["corpo"]  # type: ignore[return-value]
    return _snapshot_enquanto_mede(round((time.monotonic() - inicio) * 1000))


def _invalidar_cache() -> None:
    with _coleta_pronta:
        _cache.update(quando=0.0, corpo=b"")


_cache_vivos: dict[str, object] = {"quando": 0.0, "corpo": b""}
_trava_vivos = threading.Lock()
JANELA_CACHE_VIVOS = 2.0


def redigir_texto_livre(texto: str | None, limite: int = 400) -> str | None:
    """Sanitiza texto livre: remove caminhos do sistema, redige emails/telefones e mascara nomes de clientes."""
    if not texto or not isinstance(texto, str):
        return texto
    # 1. Sanitizar caminhos internos (/opt/..., /home/..., C:\...)
    limpo = re.sub(r"/(?:opt|home|root|etc|var|tmp|usr)/\S+", "[caminho]", texto)
    limpo = re.sub(r"[a-zA-Z]:\\[^\s'\":]+", "[caminho]", limpo)

    # 2. Redigir emails e telefones
    if callable(redigir):
        try:
            limpo = redigir(limpo)
        except Exception:
            pass

    # 3. Mascarar nomes de clientes
    if callable(achou_nome_de_cliente) and isinstance(NEGACAO, dict) and NEGACAO.get("carregada"):
        try:
            achados = achou_nome_de_cliente(limpo)
            for ini, fim, _ in reversed(achados):
                limpo = limpo[:ini] + "[cliente]" + limpo[fim:]
        except Exception:
            pass

    return limpo[:limite].strip()


def redigir_dados_agentes(dados: dict) -> dict:
    """Passa todos os campos de texto livre da resposta dos agentes vivos pela redação de clientes e caminhos."""
    if not isinstance(dados, dict):
        return dados
    agentes_redigidos = []
    for ag in dados.get("agentes", []):
        if not isinstance(ag, dict):
            continue
        copia = dict(ag)
        for campo in ("descricao", "etapa", "tarefa", "problema", "quem_mandou", "status", "esforco", "modelo", "modelo_legivel"):
            if campo in copia and isinstance(copia[campo], str):
                copia[campo] = redigir_texto_livre(copia[campo])
        agentes_redigidos.append(copia)

    avisos_redigidos = []
    for av in dados.get("avisos", []):
        if isinstance(av, str):
            avisos_redigidos.append(redigir_texto_livre(av, limite=300))
        else:
            avisos_redigidos.append(av)

    return {
        **dados,
        "agentes": agentes_redigidos,
        "avisos": avisos_redigidos,
    }


def obter_agentes_vivos() -> bytes:
    """Serializa a leitura agregada da sonda viva (/api/agentes-vivos) com cache curto e redação estrita."""
    agora = time.monotonic()
    if _cache_vivos["corpo"] and (agora - float(_cache_vivos["quando"])) < JANELA_CACHE_VIVOS:
        return _cache_vivos["corpo"]  # type: ignore[return-value]
    with _trava_vivos:
        agora = time.monotonic()
        if _cache_vivos["corpo"] and (agora - float(_cache_vivos["quando"])) < JANELA_CACHE_VIVOS:
            return _cache_vivos["corpo"]  # type: ignore[return-value]
        bruto = ler_agentes_da_casa()
        redigido = redigir_dados_agentes(bruto)
        corpo = json.dumps(redigido, ensure_ascii=False).encode("utf-8")
        _cache_vivos.update(quando=time.monotonic(), corpo=corpo)
        return corpo

def coletar_skills_acessos(raiz: Path = Path("/opt/gastaomatos")) -> dict:
    """Lê skills e conexões de Luana e Renato no servidor e classifica estados reais sem expor segredos."""
    itens = []
    fontes = [
        ("Luana", raiz / "luana/.claude/skills", raiz / "luana/conexoes", raiz / "luana"),
        ("Renato", raiz / "renato/.claude/skills", raiz / "renato/conexoes", raiz / "renato"),
    ]
    for resp, pasta_skills, pasta_conexoes, pasta_agente in fontes:
        # 1. Skills
        if pasta_skills.is_dir():
            for p in sorted(pasta_skills.glob("*/SKILL.md")):
                try:
                    texto = p.read_text(encoding="utf-8", errors="replace")
                    nome = p.parent.name
                    desc = "Skill registrada no playbook"
                    # parsing básico de frontmatter sem importar libs extras
                    if texto.startswith("---"):
                        partes = texto.split("---", 2)
                        if len(partes) >= 3:
                            for linha in partes[1].splitlines():
                                if linha.startswith("name:"):
                                    nome = linha.split("name:", 1)[1].strip()
                                elif linha.startswith("description:"):
                                    desc = linha.split("description:", 1)[1].strip()
                    st = p.stat()
                    mod = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
                    
                    # Diferenciação de estado: documentada vs configurada vs disponível
                    estado = "documentada"
                    if len(texto.strip()) > 100:
                        estado = "disponível"
                    
                    itens.append({
                        "id": f"skill-{resp.lower()}-{p.parent.name}",
                        "responsavel": resp,
                        "nome": nome,
                        "tipo": "Skill",
                        "finalidade": desc[:180],
                        "sistema": "Claude / Agent Runtime",
                        "origem": str(p),
                        "estado": estado,
                        "ultima_verificacao": mod,
                    })
                except Exception:
                    pass

        # 2. Conexões / Acessos
        if pasta_conexoes.is_dir():
            for p in sorted(pasta_conexoes.glob("*.md")):
                try:
                    st = p.stat()
                    mod = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat()
                    nome = p.stem.replace("_", " ").title()
                    texto = p.read_text(encoding="utf-8", errors="replace")
                    
                    # Verificação de arquivos de segredos/env associados sem ler seus conteúdos
                    env_associado = None
                    for candidato in (f".env.{p.stem}", f".env.{p.stem.lower()}", f".{p.stem}.json"):
                        if (pasta_agente / candidato).is_file():
                            env_associado = candidato
                            break

                    estado = "documentada"
                    if env_associado:
                        estado = "configurada"
                    elif len(texto) > 100:
                        estado = "disponível"

                    itens.append({
                        "id": f"conexao-{resp.lower()}-{p.stem}",
                        "responsavel": resp,
                        "nome": f"Conexão {nome}",
                        "tipo": "Acesso",
                        "finalidade": f"Manual de integração de {nome}",
                        "sistema": nome,
                        "origem": str(p),
                        "estado": estado,
                        "ultima_verificacao": mod,
                    })
                except Exception:
                    pass

    return {
        "ok": True,
        "coletado_em": datetime.now(timezone.utc).isoformat(),
        "total": len(itens),
        "itens": itens,
    }


_cache_acessos = {"quando": 0.0, "corpo": b""}
_trava_acessos = threading.Lock()


def obter_skills_acessos() -> bytes:
    """Retorna inventário em tempo real de skills e conexões com cache de 15s."""
    global _cache_acessos
    agora = time.monotonic()
    if _cache_acessos["corpo"] and (agora - float(_cache_acessos["quando"])) < 15.0:
        return _cache_acessos["corpo"]
    with _trava_acessos:
        agora = time.monotonic()
        if _cache_acessos["corpo"] and (agora - float(_cache_acessos["quando"])) < 15.0:
            return _cache_acessos["corpo"]
        dados = coletar_skills_acessos()
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        _cache_acessos.update(quando=time.monotonic(), corpo=corpo)
        return corpo


class ErroDecisao(RuntimeError):
    def __init__(self, codigo: int, mensagem: str):
        super().__init__(mensagem)
        self.codigo = codigo


def canal_decisao_seguro(endereco_servidor: str, endereco_cliente: str,
                         proto: str, marcador: Path = HTTPS_ATIVO) -> bool:
    """HTTPS só é confiável porque a porta aceita exclusivamente o proxy local.

    O header isolado é falsificável numa porta pública. A conjunção exige o
    marcador criado após o Certbot, socket preso ao loopback, cliente loopback
    e o header que o nginx sobrescreve com ``$scheme``.
    """
    loopbacks = {"127.0.0.1", "::1"}
    return (
        marcador.is_file()
        and endereco_servidor in loopbacks
        and endereco_cliente in loopbacks
        and proto.strip().lower() == "https"
    )


def _ler_fila_decisao(caminho: Path = APROVACOES) -> dict:
    try:
        fila = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ErroDecisao(503, "fila indisponível") from exc
    if not isinstance(fila, dict) or fila.get("versao") != 1 or not isinstance(fila.get("itens"), list):
        raise ErroDecisao(503, "fila inválida")
    if "auditoria" in fila and not isinstance(fila["auditoria"], list):
        raise ErroDecisao(503, "auditoria inválida")
    if "entradas" in fila and not isinstance(fila["entradas"], list):
        raise ErroDecisao(503, "entradas inválidas")
    for evento in fila.get("entradas", []):
        if not isinstance(evento, dict) or set(evento) != {"chave", "item_id", "em", "ator"}:
            raise ErroDecisao(503, "entrada de auditoria inválida")
        if not re.fullmatch(r"[0-9a-f]{24}", str(evento["chave"])) or not re.fullmatch(r"peca_[0-9]{1,10}", str(evento["item_id"])):
            raise ErroDecisao(503, "identificador de entrada inválido")
        if evento["ator"] != "painel":
            raise ErroDecisao(503, "ator de entrada inválido")
        try:
            instante = datetime.fromisoformat(str(evento["em"]).replace("Z", "+00:00"))
            if instante.tzinfo is None:
                raise ValueError
        except ValueError as exc:
            raise ErroDecisao(503, "data de entrada inválida") from exc
    for evento in fila.get("auditoria", []):
        if not isinstance(evento, dict) or set(evento) != {"chave", "item_id", "de", "para", "em", "ator"}:
            raise ErroDecisao(503, "evento de auditoria inválido")
        if not re.fullmatch(r"[0-9a-f]{24}", str(evento["chave"])) or not re.fullmatch(r"[A-Za-z0-9_-]{6,80}", str(evento["item_id"])):
            raise ErroDecisao(503, "identificador de auditoria inválido")
        if evento["de"] != "aguardando" or evento["para"] not in APROVACAO_ESTADOS_FINAIS or evento["ator"] != "painel":
            raise ErroDecisao(503, "transição de auditoria inválida")
        try:
            datetime.fromisoformat(str(evento["em"]).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ErroDecisao(503, "data de auditoria inválida") from exc
    ids = set()
    for item in fila["itens"]:
        if not isinstance(item, dict) or set(item) != {"id", "estado", "tipo", "criado_em", "origem"}:
            raise ErroDecisao(503, "item inválido")
        if not isinstance(item["id"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{6,80}", item["id"]) or item["id"] in ids:
            raise ErroDecisao(503, "id de item inválido")
        if item["estado"] not in {"aguardando", *APROVACAO_ESTADOS_FINAIS} or item["tipo"] not in APROVACAO_TIPOS:
            raise ErroDecisao(503, "estado ou tipo inválido")
        if not isinstance(item["origem"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{2,60}", item["origem"]):
            raise ErroDecisao(503, "origem inválida")
        try:
            datetime.fromisoformat(str(item["criado_em"]).replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ErroDecisao(503, "data inválida") from exc
        ids.add(item["id"])
    return fila


def _gravar_atomico(caminho: Path, dados: dict) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd, temporario = tempfile.mkstemp(prefix=".aprovacoes-", suffix=".tmp", dir=caminho.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(dados, f, ensure_ascii=False, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        if os.name != "nt":
            os.chmod(temporario, 0o600)
        os.replace(temporario, caminho)
        if hasattr(os, "O_DIRECTORY"):
            dirfd = os.open(caminho.parent, os.O_DIRECTORY)
            try:
                os.fsync(dirfd)
            finally:
                os.close(dirfd)
    finally:
        if os.path.exists(temporario):
            os.unlink(temporario)


def decidir_aprovacao(pedido: object, caminho: Path = APROVACOES) -> tuple[int, dict]:
    if not isinstance(pedido, dict) or set(pedido) != {"id", "decisao", "esperado", "chave_idempotencia"}:
        raise ErroDecisao(400, "campos inválidos")
    ident, decisao, esperado, chave = (pedido[x] for x in ("id", "decisao", "esperado", "chave_idempotencia"))
    if not isinstance(ident, str) or not re.fullmatch(r"[A-Za-z0-9_-]{6,80}", ident):
        raise ErroDecisao(400, "id inválido")
    if decisao not in APROVACAO_ESTADOS_FINAIS or esperado != "aguardando":
        raise ErroDecisao(400, "transição inválida")
    if not isinstance(chave, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", chave):
        raise ErroDecisao(400, "chave de idempotência inválida")
    chave_hash = hashlib.sha256(chave.encode()).hexdigest()[:24]
    with _trava_aprovacoes:
        fila = _ler_fila_decisao(caminho)
        auditoria = fila.setdefault("auditoria", [])
        anterior = next((x for x in auditoria if isinstance(x, dict) and x.get("chave") == chave_hash), None)
        if anterior:
            if anterior.get("item_id") == ident and anterior.get("para") == decisao:
                return 200, {"id": ident, "estado": decisao, "idempotente": True, "publicado": False}
            raise ErroDecisao(409, "chave de idempotência já usada")
        item = next((x for x in fila["itens"] if x["id"] == ident), None)
        if item is None:
            raise ErroDecisao(404, "item não encontrado")
        if item["estado"] != esperado:
            raise ErroDecisao(409, "estado atual conflita com o esperado")
        item["estado"] = decisao
        auditoria.append({"chave": chave_hash, "item_id": ident, "de": esperado, "para": decisao, "em": datetime.now(timezone.utc).isoformat(), "ator": "painel"})
        _gravar_atomico(caminho, fila)
        _invalidar_cache()
        return 200, {"id": ident, "estado": decisao, "idempotente": False, "publicado": False}


def _post_proprio(numero: int, caminho: Path = POSTS_JSON) -> dict:
    try:
        bruto = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ErroDecisao(503, "acervo indisponível") from exc
    posts = bruto.get("posts") if isinstance(bruto, dict) else None
    if not isinstance(posts, list):
        raise ErroDecisao(503, "acervo inválido")
    post = next((p for p in posts if isinstance(p, dict) and p.get("n") == numero), None)
    if post is None:
        raise ErroDecisao(404, "peça não encontrada")
    if post.get("marca") != "gastaomatos":
        raise ErroDecisao(403, "peça fora do escopo autorizado")
    return post


def resolver_artefatos(numero: int, caminho_posts: Path = POSTS_JSON,
                       raiz: Path = ARTEFATOS_RAIZ) -> list[Path]:
    post = _post_proprio(numero, caminho_posts)
    assets = post.get("assets")
    if not isinstance(assets, dict) or not isinstance(assets.get("_dir"), str):
        raise ErroDecisao(404, "peça sem artefato")
    base = Path(assets["_dir"])
    try:
        base_real = base.resolve(strict=True)
        raiz_real = raiz.resolve(strict=True)
    except OSError as exc:
        raise ErroDecisao(404, "artefato indisponível") from exc
    if not base_real.is_relative_to(raiz_real) or base.is_symlink():
        raise ErroDecisao(403, "origem de artefato não autorizada")
    nomes = []
    for chave in ("video_reel", "video_reel_1x1"):
        if isinstance(assets.get(chave), str):
            nomes.append(assets[chave])
    if isinstance(assets.get("cards"), list):
        nomes.extend(x for x in assets["cards"] if isinstance(x, str))
    if not nomes and isinstance(assets.get("cover"), str):
        nomes.append(assets["cover"])
    saida, total = [], 0
    for nome in dict.fromkeys(nomes):
        if Path(nome).name != nome or nome in {".", ".."}:
            raise ErroDecisao(403, "nome de artefato inválido")
        alvo = base_real / nome
        try:
            info = os.lstat(alvo)
            real = alvo.resolve(strict=True)
        except OSError as exc:
            raise ErroDecisao(404, "artefato indisponível") from exc
        if stat_mod.S_ISLNK(info.st_mode) or not stat_mod.S_ISREG(info.st_mode) or not real.is_relative_to(base_real):
            raise ErroDecisao(403, "artefato inseguro")
        if info.st_size <= 0 or info.st_size > ARTEFATO_MAX_BYTES:
            raise ErroDecisao(413, "artefato fora do limite")
        total += info.st_size
        if total > PACOTE_MAX_BYTES:
            raise ErroDecisao(413, "pacote fora do limite")
        saida.append(real)
    if not saida:
        raise ErroDecisao(404, "peça sem artefato")
    return saida


def enviar_aprovacao(pedido: object, caminho: Path = APROVACOES,
                     caminho_posts: Path = POSTS_JSON,
                     raiz_artefatos: Path = ARTEFATOS_RAIZ) -> tuple[int, dict]:
    if not isinstance(pedido, dict) or set(pedido) != {"id", "chave_idempotencia"}:
        raise ErroDecisao(400, "campos inválidos")
    numero, chave = pedido["id"], pedido["chave_idempotencia"]
    if isinstance(numero, bool) or not isinstance(numero, int) or numero < 1 or numero > 9_999_999_999:
        raise ErroDecisao(400, "id inválido")
    if not isinstance(chave, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,100}", chave):
        raise ErroDecisao(400, "chave de idempotência inválida")
    post = _post_proprio(numero, caminho_posts)
    if post.get("status") != "pendente":
        raise ErroDecisao(409, "somente peça pendente pode entrar em aprovação")
    resolver_artefatos(numero, caminho_posts, raiz_artefatos)
    item_id = f"peca_{numero}"
    chave_hash = hashlib.sha256(chave.encode()).hexdigest()[:24]
    with _trava_aprovacoes:
        fila = _ler_fila_decisao(caminho)
        entradas = fila.setdefault("entradas", [])
        anterior = next((x for x in entradas if x.get("chave") == chave_hash), None)
        if anterior:
            if anterior["item_id"] == item_id:
                return 200, {"id": item_id, "estado": "aguardando", "idempotente": True, "publicado": False}
            raise ErroDecisao(409, "chave de idempotência já usada")
        existente = next((x for x in fila["itens"] if x["id"] == item_id), None)
        if existente:
            return 200, {"id": item_id, "estado": existente["estado"], "idempotente": True, "publicado": False}
        agora = datetime.now(timezone.utc).isoformat()
        fila["itens"].append({"id": item_id, "estado": "aguardando", "tipo": "conteudo", "criado_em": agora, "origem": "estudio"})
        entradas.append({"chave": chave_hash, "item_id": item_id, "em": agora, "ator": "painel"})
        _gravar_atomico(caminho, fila)
        _invalidar_cache()
        return 201, {"id": item_id, "estado": "aguardando", "idempotente": False, "publicado": False}


class Manipulador(SimpleHTTPRequestHandler):

    server_version = "PainelOS"
    sys_version = ""

    def version_string(self) -> str:
        return "PainelOS"

    # ------------------------------------------------------------------ auth
    def parse_request(self) -> bool:
        """A trava fica AQUI: todo verbo e toda rota passam por este ponto.

        Devolver False faz o handler parar sem despachar nada, então nenhum
        byte de conteúdo é escrito para quem não passou.
        """
        if not super().parse_request():
            return False
        try:
            usuario_ok, senha_ok = ler_credencial()
        except CredencialQuebrada as e:
            # Falha FECHADA: sem credencial válida no servidor, ninguém entra.
            self._recusar(503, str(e))
            return False
        if not credencial_confere(
            self.headers.get("Authorization", ""), usuario_ok, senha_ok
        ):
            time.sleep(ATRASO_FALHA)
            self._recusar(401, None)
            return False
        return True

    def _recusar(self, codigo: int, motivo: str | None) -> None:
        corpo = f"{codigo}\n".encode("ascii")  # sem detalhe: nada a colher aqui
        self._sem_cache = True
        self.send_response(codigo)
        if codigo == 401:
            # realm genérico de propósito: não nomeia o que está atrás da porta.
            self.send_header(
                "WWW-Authenticate", 'Basic realm="restrito", charset="UTF-8"'
            )
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)
        self.close_connection = True
        # O header Authorization NUNCA é logado. Só código, origem e rota.
        origem = self.client_address[0] if self.client_address else "?"
        rota = getattr(self, "path", "?")
        sys.stderr.write(
            f"[{datetime.now(timezone.utc):%H:%M:%S}] RECUSADO {codigo} "
            f"{origem} {rota}" + (f" :: {motivo}" if motivo else "") + "\n"
        )
        sys.stderr.flush()

    # --------------------------------------------------------------- rotas
    def do_HEAD(self):  # noqa: N802
        # As rotas /api/* não existem como arquivo: sem isto, HEAD cai no
        # handler de arquivo estático da classe base e devolve 404 falso
        # para uma rota que responde 200 em GET.
        caminho = urlsplit(self.path).path
        if caminho in ROTAS_API_VALIDAS:
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        if caminho.startswith("/api/"):
            self.send_response(404)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        super().do_HEAD()

    def do_GET(self):  # noqa: N802
        rota = urlsplit(self.path)
        if rota.path == "/api/estado":
            try:
                corpo = coletar()
            except Exception as e:  # falha alto, não devolve estado vazio calado
                corpo = json.dumps({"erro": f"{type(e).__name__}: {e}"}, ensure_ascii=False).encode()
                self.send_response(500)
            else:
                self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corpo)
            return
        if rota.path == "/api/agentes-vivos":
            try:
                corpo = obter_agentes_vivos()
                self.send_response(200)
            except Exception as e:
                corpo = json.dumps(
                    {"ok": False, "motivo": f"{type(e).__name__}: {e}", "agentes": []},
                    ensure_ascii=False,
                ).encode("utf-8")
                self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corpo)
            return
        if rota.path == "/api/ferramentas/acessos":
            try:
                corpo = obter_skills_acessos()
                self.send_response(200)
            except Exception as e:
                corpo = json.dumps(
                    {"ok": False, "erro": f"{type(e).__name__}: {e}", "itens": []},
                    ensure_ascii=False,
                ).encode("utf-8")
                self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corpo)
            return
        if rota.path == "/api/estudio/artefato":
            if not canal_decisao_seguro(
                str(self.server.server_address[0]),
                str(self.client_address[0]) if self.client_address else "",
                self.headers.get("X-Forwarded-Proto", ""),
                HTTPS_ATIVO,
            ):
                self._json(503, {"erro": "download indisponível até o HTTPS estar ativo"})
                return
            if not re.fullmatch(r"id=[1-9][0-9]{0,9}", rota.query):
                self._json(400, {"erro": "id técnico inválido"})
                return
            numero = int(rota.query[3:])
            temporario = None
            try:
                arquivos = resolver_artefatos(numero, POSTS_JSON, ARTEFATOS_RAIZ)
                if len(arquivos) == 1:
                    alvo = arquivos[0]
                    nome = f"peca-{numero}{alvo.suffix.lower()}"
                else:
                    fd, temporario = tempfile.mkstemp(prefix=f".peca-{numero}-", suffix=".zip")
                    os.close(fd)
                    with zipfile.ZipFile(temporario, "w", compression=zipfile.ZIP_STORED) as pacote:
                        for i, arquivo in enumerate(arquivos, 1):
                            pacote.write(arquivo, arcname=f"artefato-{i}{arquivo.suffix.lower()}")
                    alvo = Path(temporario)
                    nome = f"peca-{numero}.zip"
                tamanho = alvo.stat().st_size
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f'attachment; filename="{nome}"')
                self.send_header("Content-Length", str(tamanho))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                with alvo.open("rb") as fonte:
                    shutil.copyfileobj(fonte, self.wfile, length=1024 * 1024)
            except ErroDecisao as exc:
                self._json(exc.codigo, {"erro": str(exc)})
            finally:
                if temporario:
                    try:
                        os.unlink(temporario)
                    except OSError:
                        pass
            return
        super().do_GET()

    def _json(self, codigo: int, dados: dict) -> None:
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):  # noqa: N802
        rota = self.path.split("?")[0]
        if rota not in {"/api/aprovacoes/decidir", "/api/estudio/aprovacoes"}:
            self._json(404, {"erro": "rota não encontrada"})
            return
        servidor_endereco = str(self.server.server_address[0])
        cliente_endereco = str(self.client_address[0]) if self.client_address else ""
        if not canal_decisao_seguro(
            servidor_endereco, cliente_endereco,
            self.headers.get("X-Forwarded-Proto", ""),
            HTTPS_ATIVO,
        ):
            self._json(503, {"erro": "ação indisponível até o HTTPS estar ativo"})
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            self._json(415, {"erro": "Content-Type deve ser application/json"})
            return
        intencao = "decisao-humana" if rota == "/api/aprovacoes/decidir" else "enviar-aprovacao"
        if self.headers.get("X-Painel-Intent") != intencao:
            self._json(400, {"erro": "intenção humana ausente"})
            return
        try:
            tamanho = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._json(411, {"erro": "Content-Length obrigatório"})
            return
        if tamanho < 2 or tamanho > 4096:
            self._json(413, {"erro": "corpo fora do limite"})
            return
        try:
            pedido = json.loads(self.rfile.read(tamanho).decode("utf-8"))
            if rota == "/api/aprovacoes/decidir":
                codigo, resposta = decidir_aprovacao(pedido)
            else:
                codigo, resposta = enviar_aprovacao(pedido, APROVACOES, POSTS_JSON, ARTEFATOS_RAIZ)
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"erro": "JSON inválido"})
            return
        except ErroDecisao as exc:
            self._json(exc.codigo, {"erro": str(exc)})
            return
        self._json(codigo, resposta)

    def end_headers(self):
        caminho = urlsplit(getattr(self, "path", "")).path
        if getattr(self, "_sem_cache", False) or caminho.endswith(".html") or caminho == "/":
            self.send_header("Cache-Control", "no-store")
            self._sem_cache = False  # não duplicar o header
        # Valem também no acesso temporário por HTTP direto. O nginx repete as
        # mesmas defesas depois do TLS; proteção não pode depender de uma rota.
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        # A Biblioteca usa um mapa HTML servido pelo próprio painel. SAMEORIGIN
        # libera somente esse embedding; a CSP continua vedando terceiros.
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        politica = (
            "default-src 'self'; base-uri 'none'; frame-ancestors 'self'; "
            "form-action 'self'; object-src 'none'; img-src 'self' data:; "
            "font-src 'self' https://fonts.gstatic.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "script-src 'self'; connect-src 'self'"
        )
        if caminho.startswith("/mapas/") and caminho.endswith(".html"):
            # O Archify versionado é um documento autocontido com scripts
            # inline e fontes embutidas. O relaxamento não alcança o painel.
            politica = politica.replace(
                "font-src 'self' https://fonts.gstatic.com", "font-src 'self' data: https://fonts.gstatic.com"
            ).replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        self.send_header("Content-Security-Policy", politica)
        super().end_headers()

    def log_message(self, formato, *args):
        # SimpleHTTPRequestHandler chama este metodo com assinaturas diferentes:
        # a linha comum traz a rota em args[0], enquanto send_error pode trazer
        # um HTTPStatus. Tratar tudo como texto evita que uma rota 404 derrube a
        # thread que estava atendendo a requisicao.
        primeiro = str(args[0]) if args else ""
        if "/api/estado" in primeiro:
            sys.stderr.write(f"[{datetime.now(timezone.utc):%H:%M:%S}] {formato % args}\n")


class ServidorPainel(ThreadingHTTPServer):
    """Servidor concorrente com teto, para tentativa em massa não criar threads sem fim."""

    daemon_threads = True
    request_queue_size = MAXIMO_REQUISICOES

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._vagas = threading.BoundedSemaphore(MAXIMO_REQUISICOES)

    def process_request(self, request, client_address):
        if not self._vagas.acquire(blocking=False):
            self.close_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._vagas.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._vagas.release()

    def handle_error(self, request, client_address):
        # Navegadores cancelam fetches ao recarregar ou fechar uma aba. Isso é
        # desconexão do cliente, não falha do painel, e não merece traceback.
        erro = sys.exc_info()[1]
        if isinstance(erro, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


def main():
    # Ordem de propósito: sem credencial válida o painel NÃO SOBE. Um painel no
    # ar sem saber quem é quem é exatamente o que se está consertando aqui.
    try:
        ler_credencial()
    except CredencialQuebrada as e:
        print("ERRO: o painel não sobe sem credencial válida.", file=sys.stderr)
        print(f"       {e}", file=sys.stderr)
        return 2

    if not DIST.is_dir():
        print(f"ERRO: {DIST} não existe. Rode antes:  cd {RAIZ}/web && npm run build")
        return 1

    manipulador = partial(Manipulador, directory=str(DIST))
    servidor = ServidorPainel((ENDERECO, PORTA), manipulador)
    print(f"painel de pé em http://{ENDERECO}:{PORTA}/  (coleta única, espera máxima de {LIMITE_ESPERA_COLETA:g}s)")
    print(f"credencial exigida em toda rota; vem de {CREDENCIAL} (lida a cada requisição)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado")
    return 0


if __name__ == "__main__":
    sys.exit(main())
