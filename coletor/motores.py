#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Qual service de cada agente está no ar, e por qual MOTOR.

O Gastão mantém mais de um service por agente e troca qual deles sobe para
alternar o motor (Claude Code ou Codex/GPT). Antes disto o painel olhava UM
nome fixo, escrito à mão em `coletar_estado.py`, e o nome escolhido era
justamente o que estava parado: a Luana aparecia inativa com a Luana viva.

TRÊS COISAS QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO:

1. NÃO confia no nome do arquivo. `luana.service` não quer dizer Claude nem
   Codex. O motor sai do que o service EXECUTA.

2. NÃO confia no fragmento `.service` do disco. Medido em 10/09/2026:
   `/etc/systemd/system/luana.service` manda rodar o `claude`, e o drop-in
   `luana.service.d/codex-engine.conf` zera esse ExecStart e põe o Codex no
   lugar. Quem lê o arquivo conclui o motor errado. A fonte é
   `systemctl show -p ExecStart`, que já é o valor efetivo, com drop-ins
   aplicados.

3. NÃO chuta. Sem sinal forte o motor sai `None` e a tela escreve "motor não
   identificado". O usuário do servidor se chama `claude` e o caminho
   `/home/claude/...` aparece em quase todo comando desta máquina, inclusive
   nos do Codex: procurar a palavra solta marcaria Codex como Claude. Cada
   padrão daqui ancora no executável ou numa flag exclusiva.

O QUE É "UM SINAL FORTE" quando o service está ATIVO: o processo. Ler o cgroup
do unit e olhar o que de fato roda vale mais que qualquer leitura de script,
porque um `.sh` pode ter mudado depois do boot (esta casa já perdeu três dias
com um processo carregado em código velho). Análise estática só entra quando
não há processo para olhar, e a saída diz qual das duas foi usada.

SITUAÇÃO POR AGENTE, e a terceira é a que importa:
    "um_ativo"      - normal, um service no ar
    "nenhum_ativo"  - o agente está fora do ar
    "varios_ativos" - DEFEITO. Duas sessões no mesmo bot do Telegram dão 409 e
                      o bot fica mudo. Nunca é "verde dobrado".
    "indeterminado" - alguma sonda não respondeu. Nunca vira "inativo".

O último ponto tem caso próprio: `systemctl is-active` responde `inactive` tanto
para service parado quanto para service que NÃO EXISTE (exit 3 contra 4, e o
código de saída era descartado). Por isso a sonda usa `systemctl show`, que
separa os dois em `LoadState=not-found`.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

TIMEOUT = 15
PROFUNDIDADE_MAX = 4

MOTOR_CLAUDE = "Claude Code"
MOTOR_CODEX = "Codex"

# Sinais FORTES, ancorados no executável ou numa flag que só aquele motor usa.
# `/home/claude/` NÃO casa aqui: o padrão exige que o nome termine o token.
#
# `/codex-service/` esteve nesta lista e SAIU: é nome de pasta, e nome é rótulo.
# O `luana.service` aponta para `codex-service/start.sh`, que é um DESPACHANTE e
# roda Claude quando `/etc/luana-engine` diz `claude`. Classificar pelo caminho
# acertava hoje e mentiria no dia da troca, que é justamente o dia que importa.
SINAIS = (
    (MOTOR_CLAUDE, re.compile(r"""(?:^|[\s'"=])/(?:[\w.-]+/)*claude(?=[\s'"]|$)""")),
    (MOTOR_CLAUDE, re.compile(r"--model\s+claude-")),
    (MOTOR_CODEX, re.compile(r"\bCODEX_HOME\b")),
    (MOTOR_CODEX, re.compile(r"""(?:^|[\s'"=])/(?:[\w.-]+/)*codex(?=[\s'"]|$)""")),
)

# engine=$(cat /etc/luana-engine)  -> o script é um despachante: o motor está
# escrito no arquivo, não no script, e os dois ramos convivem no mesmo texto.
DESPACHANTE = re.compile(r"^[^\S\n]*\w+=\$\(\s*cat\s+(?P<caminho>/[\w./-]+)\s*\)", re.M)

SCRIPT_CITADO = re.compile(r"(?<![\w.-])(/(?:[\w.-]+/)+[\w.-]+\.sh)(?![\w.-])")

NOME_SERVICE = re.compile(r"^[\w@.-]+\.service$")


def curto(caminho):
    """Só o nome do arquivo. O painel não manda caminho de máquina ao navegador.

    A trava de privacidade de `coletar_estado.py` varre o contrato inteiro e
    reprova qualquer `/opt`, `/etc` ou `/home` num campo público. Ela pegou a
    primeira versão desta fonte, que citava o caminho completo do script. O que
    o Gastão precisa ler é qual arquivo decidiu, não onde ele mora.
    """
    return str(caminho).rstrip("/").rsplit("/", 1)[-1] or str(caminho)


class Sonda:
    """Tudo que toca o sistema passa por aqui, para o teste poder injetar.

    Nenhum método daqui escreve, trava ou ocupa nada: a sonda não pode causar o
    dano que ela mede.
    """

    def __init__(self):
        # A listagem de units do systemd e IGUAL para todos os agentes, e o
        # coletor pergunta uma vez por agente. Medido: sem isto o bloco custava
        # 2,28s de uma coleta de 28,6s, quase tudo repetindo a mesma listagem.
        # So a LISTAGEM entra aqui: estado e processo mudam a cada instante e
        # nunca sao reaproveitados.
        self._listagens = {}

    def executar(self, argv):
        chave = tuple(argv) if ("list-units" in argv or "list-unit-files" in argv) else None
        if chave is not None and chave in self._listagens:
            return self._listagens[chave]
        try:
            r = subprocess.run(argv, capture_output=True, text=True, timeout=TIMEOUT)
            saida = (r.returncode, r.stdout, r.stderr)
        except (OSError, subprocess.SubprocessError) as erro:
            saida = (None, "", str(erro))
        if chave is not None:
            self._listagens[chave] = saida
        return saida

    def ler_texto(self, caminho):
        try:
            return Path(caminho).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None

    def pids_do_unit(self, control_group):
        if not control_group or control_group == "/":
            return None
        try:
            bruto = Path(f"/sys/fs/cgroup{control_group}/cgroup.procs").read_text()
        except OSError:
            return None
        return [linha.strip() for linha in bruto.splitlines() if linha.strip()]

    def cmdline(self, pid):
        try:
            bruto = Path(f"/proc/{pid}/cmdline").read_bytes()
        except OSError:
            # O processo pode ter morrido entre listar o cgroup e ler o cmdline.
            return None
        return bruto.replace(b"\0", b" ").decode("utf-8", "replace").strip()


def classificar(texto):
    """Motores que aparecem no texto. Vazio = não identificado; 2 = ambíguo."""
    if not texto:
        return set()
    return {motor for motor, padrao in SINAIS if padrao.search(texto)}


def _um(motores):
    return next(iter(motores)) if len(motores) == 1 else None


def _ramo_do_case(texto, valor):
    padrao = re.compile(
        r"^[^\S\n]*(?:[^)\n]*\|)?" + re.escape(valor) + r"\)(?P<corpo>.*?);;",
        re.S | re.M,
    )
    achado = padrao.search(texto)
    return achado.group("corpo") if achado else None


def motor_do_comando(comando, sonda, profundidade=0):
    """(motor, fonte). `motor` None quer dizer NÃO IDENTIFICADO, nunca um chute."""
    if not comando:
        return None, "comando vazio"

    achados = classificar(comando)
    if len(achados) == 1:
        return _um(achados), "comando do service"

    scripts = SCRIPT_CITADO.findall(comando)
    if not scripts or profundidade >= PROFUNDIDADE_MAX:
        if len(achados) > 1:
            return None, "comando cita mais de um motor e não há script para desempatar"
        return None, "nenhum sinal de motor no comando"

    return _motor_do_script(scripts[0], sonda, profundidade)


def _motor_do_script(caminho, sonda, profundidade):
    texto = sonda.ler_texto(caminho)
    if texto is None:
        return None, f"script {curto(caminho)} ilegível"

    # O DESPACHANTE VEM PRIMEIRO, antes de classificar o texto. Ele é a decisão;
    # o resto do arquivo são os ramos que ele não escolheu.
    #
    # Medido em 10/09/2026, e por pouco não passou: o `renato/codex-service/
    # start.sh` tem `CODEX_HOME` escrito no ramo codex e, no ramo claude, apenas
    # um `exec` de outro script, sem citar motor. Classificar o texto inteiro
    # achava UM motor só, respondia "Codex" com cara de certeza, e continuaria
    # respondendo "Codex" depois de o Gastão trocar o engine para claude. Acertar
    # por o outro ramo ser silencioso não é medir.
    marca = DESPACHANTE.search(texto)
    if marca:
        seletor = marca.group("caminho")
        valor = sonda.ler_texto(seletor)
        if valor is None:
            return None, f"despachante {curto(caminho)} lê {curto(seletor)}, que está ilegível"
        valor = valor.strip()
        if not valor:
            return None, f"despachante {curto(caminho)} lê {curto(seletor)}, que está vazio"
        ramo = _ramo_do_case(texto, valor)
        if ramo is None:
            return None, f"{curto(seletor)}={valor}, sem ramo correspondente em {curto(caminho)}"
        motor, _ = motor_do_comando(ramo, sonda, profundidade + 1)
        fonte = f"despachante {curto(caminho)} com {curto(seletor)}={valor}"
        return motor, fonte if motor else fonte + ", e o ramo não declara motor"

    achados = classificar(texto)
    if len(achados) == 1:
        return _um(achados), f"script {curto(caminho)}"

    if len(achados) > 1:
        return None, f"script {curto(caminho)} cita mais de um motor, sem despachante"

    seguintes = [s for s in SCRIPT_CITADO.findall(texto) if s != caminho]
    if seguintes and profundidade < PROFUNDIDADE_MAX:
        return _motor_do_script(seguintes[0], sonda, profundidade + 1)
    return None, f"nenhum sinal de motor em {curto(caminho)}"


def motor_do_processo(unit, control_group, sonda):
    """O que o unit ATIVO de fato executa. Prova mais forte que ler script."""
    pids = sonda.pids_do_unit(control_group)
    if pids is None:
        return None, f"não consegui listar os processos de {unit}"
    if not pids:
        return None, f"{unit} está ativo e sem processo no cgroup"

    achados = set()
    for pid in pids:
        linha = sonda.cmdline(pid)
        if linha:
            achados |= classificar(linha)
    if len(achados) == 1:
        return _um(achados), f"processo em execução ({len(pids)} no cgroup)"
    if len(achados) > 1:
        return None, f"{unit} tem processos de mais de um motor: {sorted(achados)}"
    return None, f"nenhum processo de {unit} declara motor conhecido"


CAMPOS = ("Id", "LoadState", "ActiveState", "SubState", "ExecStart", "ControlGroup")


def _blocos(saida):
    bloco, blocos = {}, []
    for linha in saida.splitlines():
        if not linha.strip():
            if bloco:
                blocos.append(bloco)
                bloco = {}
            continue
        chave, _, valor = linha.partition("=")
        bloco[chave.strip()] = valor
    if bloco:
        blocos.append(bloco)
    return blocos


def ler_services(nomes, sonda):
    """Estado efetivo de cada unit. `None` = a sonda falhou, não "inativo"."""
    if not nomes:
        return {}
    codigo, saida, _ = sonda.executar(
        ["systemctl", "show", "--no-pager", *[f"-p{c}" for c in CAMPOS], *nomes]
    )
    if codigo != 0:
        return None
    lidos = {}
    for bloco in _blocos(saida):
        ident = bloco.get("Id", "").strip()
        if ident:
            lidos[ident] = bloco
    return lidos


def _nomes_da_saida(saida, prefixo):
    exato = f"{prefixo}.service"
    inicio = f"{prefixo}-"
    achados = set()
    for linha in saida.splitlines():
        primeiro = linha.strip().split()
        if not primeiro:
            continue
        nome = primeiro[0].lstrip("●").strip()
        if not NOME_SERVICE.match(nome):
            continue
        if nome == exato or (nome.startswith(inicio) and nome.count("@") == 0):
            achados.add(nome)
    return achados


def descobrir_services(prefixo, sonda):
    """Todo service do agente, DESCOBERTO, nunca escrito à mão.

    O Gastão vai criar mais services, e lista chumbada faz o próximo nascer
    invisível, que é pior que reprovado. Duas fontes porque nenhuma sozinha
    basta: `list-unit-files` vê o que está instalado no disco mas não vê unit
    transitório; `list-units --all` vê o que o systemd carregou mas não vê
    arquivo instalado que nunca subiu.
    """
    achados, falhou = set(), False
    for argv in (
        ["systemctl", "list-unit-files", "--type=service", "--no-pager", "--plain", "--no-legend"],
        ["systemctl", "list-units", "--type=service", "--all", "--no-pager", "--plain", "--no-legend"],
    ):
        codigo, saida, _ = sonda.executar(argv)
        if codigo != 0:
            falhou = True
            continue
        achados |= _nomes_da_saida(saida, prefixo)
    if falhou and not achados:
        return None
    return sorted(achados)


def estado_dos_motores(prefixo, sonda=None):
    """O contrato que o painel desenha. Ver o docstring do módulo."""
    sonda = sonda or Sonda()
    nomes = descobrir_services(prefixo, sonda)
    if nomes is None:
        return {
            "situacao": "indeterminado",
            "motivo": "não consegui listar os services do systemd",
            "motor": None,
            "ativos": [],
            "servicos": [],
        }
    if not nomes:
        return {
            "situacao": "indeterminado",
            "motivo": f"nenhum service com o nome {prefixo} está instalado",
            "motor": None,
            "ativos": [],
            "servicos": [],
        }

    lidos = ler_services(nomes, sonda)
    if lidos is None:
        return {
            "situacao": "indeterminado",
            "motivo": "systemctl show não respondeu",
            "motor": None,
            "ativos": [],
            "servicos": [{"service": n, "existe": None, "estado": None,
                          "motor": None, "motor_fonte": "não medido"} for n in nomes],
        }

    servicos, ativos, indeterminados = [], [], []
    for nome in nomes:
        bloco = lidos.get(nome)
        if bloco is None:
            indeterminados.append(nome)
            servicos.append({"service": nome, "existe": None, "estado": None,
                             "motor": None, "motor_fonte": "systemctl não devolveu este unit"})
            continue

        carga = bloco.get("LoadState", "").strip()
        estado = bloco.get("ActiveState", "").strip() or None
        # not-found respondia "inactive" na sonda antiga: service apagado ficava
        # igual a service parado.
        if carga == "not-found":
            servicos.append({"service": nome, "existe": False, "estado": None,
                             "motor": None, "motor_fonte": "o systemd não conhece este service"})
            indeterminados.append(nome)
            continue

        ativo = estado == "active"
        if ativo:
            motor, fonte = motor_do_processo(nome, bloco.get("ControlGroup", "").strip(), sonda)
            if motor is None:
                estatico, fonte_estatica = motor_do_comando(bloco.get("ExecStart", ""), sonda)
                if estatico is not None:
                    motor, fonte = estatico, f"{fonte_estatica} (processo não respondeu)"
            ativos.append(nome)
        else:
            motor, fonte = motor_do_comando(bloco.get("ExecStart", ""), sonda)

        servicos.append({
            "service": nome,
            "existe": True,
            "estado": estado,
            "sub": bloco.get("SubState", "").strip() or None,
            "ativo": ativo,
            "motor": motor,
            "motor_fonte": fonte,
        })

    if len(ativos) > 1:
        situacao, motivo = "varios_ativos", (
            f"{len(ativos)} services do mesmo agente estão no ar ao mesmo tempo: "
            + ", ".join(ativos)
            + ". Duas sessões no mesmo bot do Telegram dão erro 409 e o bot fica mudo."
        )
    elif len(ativos) == 1:
        situacao, motivo = "um_ativo", None
    elif indeterminados:
        situacao, motivo = "indeterminado", (
            "nenhum service respondeu como ativo, e não deu para medir: "
            + ", ".join(indeterminados)
        )
    else:
        situacao, motivo = "nenhum_ativo", (
            f"nenhum dos {len(nomes)} services do agente está no ar"
        )

    no_ar = [s for s in servicos if s.get("ativo")]
    return {
        "situacao": situacao,
        "motivo": motivo,
        "motor": no_ar[0]["motor"] if len(no_ar) == 1 else None,
        "ativos": ativos,
        "servicos": servicos,
    }
