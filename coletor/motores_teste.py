#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prova de `motores.py`. Rodar: python3 coletor/motores_teste.py

O QUE AQUI É REAL E O QUE É SIMULADO, para ninguém ler prova a mais do que ela
vale: nenhum service é parado ou subido por este teste. Não há sudo nesta conta,
e mexer no `luana-claude.service` derruba a conversa do Gastão. Os três estados
são provados por INJEÇÃO: uma sonda falsa devolve a saída que o `systemctl`
devolveria. O que foi medido contra o systemd de verdade é só o caso "um ativo",
e está no fim do arquivo, marcado.

O caso que mais importa é o `varios_ativos`: ele tem que sair VERMELHO, não
verde dobrado, porque duas sessões no mesmo bot do Telegram dão erro 409.

O último bloco é o CONTROLE: ele monta uma falha de propósito e exige que o
arnês REPROVE. Teste que só foi visto aprovando não distingue "está tudo certo"
de "eu parei de olhar".
"""

import motores


DESPACHANTE_SH = """#!/bin/bash
set -euo pipefail
engine=$(cat /etc/luana-engine)
case "$engine" in
  codex)
    export CODEX_HOME=/home/claude/.codex-luana
    exec /usr/bin/python3 /opt/gastaomatos/luana/codex-service/bridge.py
    ;;
  claude)
    exec /usr/bin/script -qfec '/usr/local/bin/claude --model claude-opus-5' /home/claude/luana-tty.log
    ;;
  *) echo 'Motor inválido' >&2; exit 1 ;;
esac
"""

WRAPPER_CLAUDE_SH = """#!/usr/bin/env bash
PROJ="/home/claude/.claude/projects/-opt-gastaomatos-luana"
exec /usr/bin/script -qfec "/usr/local/bin/claude --model claude-opus-5 --continue" /home/claude/luana-tty.log
"""

EXEC_DESPACHANTE = "{ path=/opt/gastaomatos/luana/codex-service/start.sh ; argv[]=/opt/gastaomatos/luana/codex-service/start.sh ; ignore_errors=no }"
EXEC_WRAPPER = "{ path=/opt/gastaomatos/luana/iniciar_luana.sh ; argv[]=/opt/gastaomatos/luana/iniciar_luana.sh ; ignore_errors=no }"

CMD_CLAUDE = "/usr/bin/script -qfec /usr/local/bin/claude --model claude-opus-5 --continue /home/claude/luana-tty.log"
CMD_CODEX = "/usr/bin/python3 /opt/gastaomatos/luana/codex-service/bridge.py"


class SondaFalsa(motores.Sonda):
    """Devolve o que o systemd devolveria. Nada aqui toca o sistema."""

    def __init__(self, units, arquivos=None, processos=None, show_falha=False, listar_falha=False):
        self.units = units
        self.arquivos = arquivos or {}
        self.processos = processos or {}
        self.show_falha = show_falha
        self.listar_falha = listar_falha

    def executar(self, argv):
        if "list-unit-files" in argv or "list-units" in argv:
            if self.listar_falha:
                return 1, "", "falhou"
            linhas = [f"{nome} enabled disabled" for nome in self.units]
            return 0, "\n".join(linhas) + "\n", ""
        if "show" in argv:
            if self.show_falha:
                return 1, "", "falhou"
            pedidos = [a for a in argv if a.endswith(".service")]
            blocos = []
            for nome in pedidos:
                d = self.units.get(nome)
                if d is None:
                    continue
                blocos.append(
                    f"Id={nome}\nLoadState={d.get('load', 'loaded')}\n"
                    f"ActiveState={d.get('estado', 'inactive')}\nSubState={d.get('sub', 'dead')}\n"
                    f"ExecStart={d.get('exec', '')}\nControlGroup={d.get('cgroup', '')}"
                )
            return 0, "\n\n".join(blocos) + "\n", ""
        return 1, "", "comando não simulado"

    def ler_texto(self, caminho):
        return self.arquivos.get(str(caminho))

    def pids_do_unit(self, control_group):
        if not control_group:
            return None
        return list(self.processos.get(control_group, {}).keys()) or None

    def cmdline(self, pid):
        for mapa in self.processos.values():
            if pid in mapa:
                return mapa[pid]
        return None


ARQUIVOS = {
    "/opt/gastaomatos/luana/codex-service/start.sh": DESPACHANTE_SH,
    "/opt/gastaomatos/luana/iniciar_luana.sh": WRAPPER_CLAUDE_SH,
    "/etc/luana-engine": "codex\n",
}


def unidades(estado_claude="inactive", estado_codex="inactive"):
    return {
        "luana-claude.service": {
            "estado": estado_claude, "sub": "running" if estado_claude == "active" else "dead",
            "exec": EXEC_WRAPPER, "cgroup": "/system.slice/luana-claude.service",
        },
        "luana.service": {
            "estado": estado_codex, "sub": "running" if estado_codex == "active" else "dead",
            "exec": EXEC_DESPACHANTE, "cgroup": "/system.slice/luana.service",
        },
    }


PROCESSOS = {
    "/system.slice/luana-claude.service": {"1001": CMD_CLAUDE},
    "/system.slice/luana.service": {"2002": CMD_CODEX},
}

falhas = []


def checar(nome, condicao, detalhe=""):
    if condicao:
        print(f"  ok    {nome}")
    else:
        falhas.append(f"{nome} {detalhe}".strip())
        print(f"  FALHA {nome} {detalhe}")


print("\n[1] UM ATIVO (simulado) - o Claude no ar, o Codex parado")
e = motores.estado_dos_motores("luana", SondaFalsa(unidades("active", "inactive"), ARQUIVOS, PROCESSOS))
checar("situação é um_ativo", e["situacao"] == "um_ativo", e["situacao"])
checar("motor no ar é Claude Code", e["motor"] == motores.MOTOR_CLAUDE, str(e["motor"]))
checar("o parado aparece como Codex",
       [s for s in e["servicos"] if s["service"] == "luana.service"][0]["motor"] == motores.MOTOR_CODEX)
checar("os dois services aparecem", len(e["servicos"]) == 2)

print("\n[2] NENHUM ATIVO (simulado) - agente fora do ar")
e = motores.estado_dos_motores("luana", SondaFalsa(unidades("inactive", "inactive"), ARQUIVOS, PROCESSOS))
checar("situação é nenhum_ativo", e["situacao"] == "nenhum_ativo", e["situacao"])
checar("não inventa motor no ar", e["motor"] is None, str(e["motor"]))
checar("motivo explica", "nenhum" in (e["motivo"] or ""), str(e["motivo"]))

print("\n[3] VÁRIOS ATIVOS (simulado) - o caso que tem que REPROVAR")
e = motores.estado_dos_motores("luana", SondaFalsa(unidades("active", "active"), ARQUIVOS, PROCESSOS))
checar("situação é varios_ativos", e["situacao"] == "varios_ativos", e["situacao"])
checar("lista os dois culpados pelo nome", sorted(e["ativos"]) == ["luana-claude.service", "luana.service"])
checar("motivo cita o 409 do Telegram", "409" in (e["motivo"] or ""), str(e["motivo"]))
checar("NÃO escolhe um motor vencedor", e["motor"] is None, str(e["motor"]))

print("\n[4] INDETERMINADO - a sonda falhou, e isso não vira 'inativo'")
e = motores.estado_dos_motores("luana", SondaFalsa(unidades(), ARQUIVOS, show_falha=True))
checar("systemctl show falhou -> indeterminado", e["situacao"] == "indeterminado", e["situacao"])
e = motores.estado_dos_motores("luana", SondaFalsa(unidades(), ARQUIVOS, listar_falha=True))
checar("não consegui listar -> indeterminado", e["situacao"] == "indeterminado", e["situacao"])

print("\n[5] INDETERMINADO - service APAGADO não pode parecer service parado")
# systemctl is-active responde "inactive" para unit inexistente (exit 4). A sonda
# antiga jogava fora o código de saída, então apagar um service ficava invisível.
apagado = unidades()
apagado["luana.service"]["load"] = "not-found"
e = motores.estado_dos_motores("luana", SondaFalsa(apagado, ARQUIVOS, PROCESSOS))
morto = [s for s in e["servicos"] if s["service"] == "luana.service"][0]
checar("marca existe=False", morto["existe"] is False, str(morto["existe"]))
checar("não diz 'inactive' para o que não existe", morto["estado"] is None, str(morto["estado"]))
checar("situação vira indeterminado", e["situacao"] == "indeterminado", e["situacao"])

print("\n[6] A TROCA DO MOTOR - mesmo service, mesmo nome, motor diferente")
# É o pedido do Gastão: ele troca o engine e o painel tem que acompanhar sozinho.
# Só o conteúdo de /etc/luana-engine muda entre os dois casos.
sonda_codex = SondaFalsa(unidades(), {**ARQUIVOS, "/etc/luana-engine": "codex\n"}, PROCESSOS)
sonda_claude = SondaFalsa(unidades(), {**ARQUIVOS, "/etc/luana-engine": "claude\n"}, PROCESSOS)
m_codex, _ = motores.motor_do_comando(EXEC_DESPACHANTE, sonda_codex)
m_claude, fonte = motores.motor_do_comando(EXEC_DESPACHANTE, sonda_claude)
checar("engine=codex  -> Codex", m_codex == motores.MOTOR_CODEX, str(m_codex))
checar("engine=claude -> Claude Code", m_claude == motores.MOTOR_CLAUDE, str(m_claude))
checar("a fonte declara de onde saiu", "luana-engine=claude" in fonte, fonte)
# A fonte cita o NOME do arquivo, sem o caminho: a trava de privacidade do
# painel reprova /etc, /opt e /home em campo que vai para o navegador, e ela
# barrou a primeira versão disto.
checar("e não vaza caminho de máquina", "/etc/" not in fonte and "/opt/" not in fonte, fonte)

print("\n[7] NÃO INVENTA O MOTOR quando não dá para saber")
m, fonte = motores.motor_do_comando(EXEC_DESPACHANTE, SondaFalsa(unidades(), {}))
checar("script ilegível -> motor None", m is None, str(m))
checar("e diz por quê", "ilegível" in fonte, fonte)
sem_ramo = {**ARQUIVOS, "/etc/luana-engine": "gemini\n"}
m, fonte = motores.motor_do_comando(EXEC_DESPACHANTE, SondaFalsa(unidades(), sem_ramo))
checar("engine desconhecido -> motor None", m is None, str(m))
checar("e diz qual valor não tem ramo", "gemini" in fonte, fonte)

print("\n[8] O FALSO POSITIVO PERIGOSO - o usuário desta máquina se chama 'claude'")
checar("/home/claude/ não vira Claude Code",
       motores.classificar("export CODEX_HOME=/home/claude/.codex-luana") == {motores.MOTOR_CODEX})
checar("caminho de log não vira motor",
       motores.classificar("/usr/bin/python3 bridge.py /home/claude/luana-tty.log") == set())
checar("o binário claude vira Claude Code",
       motores.classificar("/usr/local/bin/claude --continue") == {motores.MOTOR_CLAUDE})

print("\n[9] O PROCESSO MANDA MAIS QUE O SCRIPT (script pode ter mudado depois do boot)")
mentiroso = unidades("active", "inactive")
mentiroso["luana-claude.service"]["exec"] = EXEC_DESPACHANTE  # script diria Codex
e = motores.estado_dos_motores("luana", SondaFalsa(mentiroso, ARQUIVOS, PROCESSOS))
no_ar = [s for s in e["servicos"] if s["ativo"]][0]
checar("motor vem do processo, não do script", no_ar["motor"] == motores.MOTOR_CLAUDE, str(no_ar["motor"]))
checar("a fonte diz que foi o processo", "processo" in no_ar["motor_fonte"], no_ar["motor_fonte"])

print("\n[10] SERVICE NOVO aparece sozinho, sem ninguém editar lista")
novo = unidades()
novo["luana-gemini.service"] = {"estado": "active", "sub": "running", "exec": "{ path=/opt/x/g.sh }", "cgroup": ""}
e = motores.estado_dos_motores("luana", SondaFalsa(novo, ARQUIVOS, PROCESSOS))
checar("o service que ninguém cadastrou aparece",
       any(s["service"] == "luana-gemini.service" for s in e["servicos"]))
achado = [s for s in e["servicos"] if s["service"] == "luana-gemini.service"][0]
checar("e o motor dele sai não identificado, não chutado", achado["motor"] is None, str(achado["motor"]))
checar("mas ele conta como ativo", e["situacao"] == "um_ativo", e["situacao"])

print("\n[11] MEDIDO CONTRA O SYSTEMD DE VERDADE (não é simulação)")
real = motores.estado_dos_motores("luana")
checar("a Luana tem mais de um service instalado", len(real["servicos"]) >= 2, str(len(real["servicos"])))
checar("a situação real é conhecida",
       real["situacao"] in ("um_ativo", "nenhum_ativo", "varios_ativos", "indeterminado"), real["situacao"])
print(f"        luana: {real['situacao']} | motor no ar: {real['motor']}")
for s in real["servicos"]:
    print(f"        {s['service']:24} {str(s['estado']):9} motor={s['motor']}")

print("\n[12] CONTROLE - o arnês precisa saber REPROVAR")
antes = len(falhas)
checar("(controle) esta linha TEM que falhar", 1 == 2, "proposital")
if len(falhas) == antes + 1:
    falhas.pop()
    print("  ok    o arnês reprovou o caso ruim, então ele está olhando")
else:
    falhas.append("o CONTROLE não reprovou: o arnês não está medindo nada")

print()
if falhas:
    print(f"REPROVADO: {len(falhas)} falha(s)")
    for f in falhas:
        print("  -", f)
    raise SystemExit(1)
print("APROVADO: 12 blocos, nenhum service foi parado ou subido para provar isto.")
