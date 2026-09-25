#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste do coletor: a negacao de nome de cliente e a leitura do verificador.

    python3 /opt/gastaomatos/luana/painel_os/coletor/coletor.teste.py

Metade dos casos existe pra REPROVAR: trava que so foi vista aprovando nao
distingue "esta certo" de "parei de olhar". Se um caso "x " passar a sair
limpo, e porque a trava morreu numa edicao, e o teste tem que gritar.
"""

import importlib
import datetime
import io
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import coletar_estado as c  # noqa: E402

falhas = 0


def conferir(nome, obtido, esperado):
    global falhas
    ok = obtido == esperado
    if not ok:
        falhas += 1
    print(f"{'ok  ' if ok else 'FALHOU'} {nome}\n       obtido={obtido!r}\n       esperado={esperado!r}")


def sem_nome(nome, comando):
    """O rotulo pode ser qualquer coisa, menos conter nome de cliente."""
    global falhas
    rotulo = c.rotulo_do_job(comando)
    sujo = c.achou_nome_de_cliente(rotulo)
    if sujo:
        falhas += 1
    print(f"{'ok  ' if not sujo else 'FALHOU'} {nome}\n       rotulo={rotulo!r}"
          + (f"  <-- VAZOU {[s[2] for s in sujo]}" if sujo else ""))
    return rotulo


print(f"lista carregada de {c.NEGACAO['arquivo']}: {c.NEGACAO['nomes']} nomes\n")
assert c.NEGACAO["carregada"], "sem a lista o teste nao mede nada"

print("--- os tres jobs reais que vazavam (medidos no crontab de 08/09/2026),")
print("    reproduzidos com nome FICTICIO numa lista TEMPORARIA (25/09/2026,")
print("    repo publico: o nome real nunca aparece aqui, so o formato dele)")
tmp_cli_vazamento = Path(tempfile.mkdtemp()) / "clientes.md"
tmp_cli_vazamento.write_text(
    "| cliente | conta |\n|---|---|\n| **Dr. Exemplo** | act_teste |\n",
    encoding="utf-8")
guarda_vazamento = (c.NOMES_CLIENTE, c.NEGACAO)
c.NOMES_CLIENTE, c.NEGACAO = c.carregar_nomes_de_cliente(tmp_cli_vazamento)

sem_nome("comentario com o nome ANTES do parentese",
         "/opt/gastaomatos/hermes/lembretes/run-lembretes.sh  # lembrete consulta 24h Dr. Exemplo (hermes2_drexemplo)")
sem_nome("comentario com o nome no formato de id",
         "/opt/gastaomatos/hermes/crm-sync/run.sh # CRM kanban reconcile dr-exemplo [minuto deslocado 30/08]")
sem_nome("comentario com o nome no meio da frase",
         "/opt/gastaomatos/hermes/agendamentos-sync/run.sh  # agendamentos do bot Dr. Exemplo -> painel (drexemplo.agendamentos)")

print("\n--- o ramo do NOME DE SCRIPT, que antes nao passava por trava nenhuma")
sem_nome("nome de cliente dentro do nome do script",
         "/usr/bin/python3 /opt/gastaomatos/hermes/backup_dr_exemplo.py")
sem_nome("nome colado, sem separador", "/opt/x/exporta_drexemplo.sh")
# redigir e guloso de proposito e come o nome do script junto com o e-mail.
# O que este caso prova e que ele PASSA a correr neste ramo: antes o basename
# saia cru, com o endereco inteiro na tela.
conferir("e-mail no ramo do script some (redigir corre aqui agora)",
         "@" in c.rotulo_do_job("/opt/x/envia_para_contato@cliente.com.br.sh"),
         False)
conferir("e telefone longo no ramo do script tambem",
         c.rotulo_do_job("/opt/x/dispara_5547999887766.sh"),
         "dispara_[num:af1f].sh")

print("\n--- variacoes de escrita do MESMO nome")
for variante in ["Dr. Exemplo", "dr-exemplo", "drexemplo", "DR_EXEMPLO", "dr exemplo", "Dr Exemplo"]:
    sem_nome(f"variante {variante!r}", f"/opt/x/roda.sh # sincroniza {variante} com o painel")

c.NOMES_CLIENTE, c.NEGACAO = guarda_vazamento
shutil.rmtree(tmp_cli_vazamento.parent, ignore_errors=True)

print("\n--- CONTROLE: texto correto NAO pode ser bloqueado")
conferir("rotulo limpo passa inteiro",
         c.rotulo_do_job("/opt/x/run.sh # mantem front atualizado"),
         "mantem front atualizado")
conferir("Gramado e produto da casa, continua aparecendo",
         c.rotulo_do_job("/opt/gastaomatos/hermes/reservas-sync/run.sh  # reservas do Gramado -> painel"),
         "reservas do Gramado -> painel")
conferir("Nina e bot da casa, continua aparecendo",
         c.rotulo_do_job("/opt/x/run_nina.sh # CRM kanban reconcile AutonomIA"),
         "CRM kanban reconcile AutonomIA")
conferir("sem comentario, o nome do script continua sendo o rotulo",
         c.rotulo_do_job("/usr/bin/python3 /opt/gastaomatos/luana/verificar_frota.py"),
         "verificar_frota.py")

print("\n--- NUMERO DE PESSOA contra NUMERO DE MAQUINA (a regua tem dois lados)")
# A regex antiga era `\d{6,}`: so corrida CONTIGUA. Telefone escrito do jeito
# que gente escreve passava inteiro, e a trava tinha cara de trava. Metade
# destes casos existe pra provar que ela REPROVA; a outra metade existe porque
# trava que pune o certo e a que faz todo mundo desligar a trava.


def mascara(nome, cru):
    """Tem que morrer: nenhum digito do numero sobrevive na tela."""
    global falhas
    saida = c.redigir(cru)
    ok = "[num:" in saida and not any(p in saida for p in _pedacos(cru))
    if not ok:
        falhas += 1
    print(f"{'ok  ' if ok else 'FALHOU'} {nome}\n       {cru!r} -> {saida!r}")


def _pedacos(cru):
    """Corridas de 4+ digitos do original: se alguma sobreviver, vazou."""
    import re as _re
    return [p for p in _re.findall(r"\d{4,}", cru)]


def intacto(nome, cru):
    """Tem que passar inteiro: nao e gente, e a tela precisa do numero."""
    conferir(nome, c.redigir(cru), cru)


print("  telefone, CPF e CNPJ: todo formato que a casa escreve")
mascara("colado com pais", "cliente 5547999887766 confirmou")
mascara("colado sem pais", "cliente 47999887766 confirmou")
mascara("parenteses e hifen", "ligar (47) 99988-7766 hoje")
mascara("parenteses colado", "ligar (11)98888-7777 hoje")
mascara("tudo separado por espaco", "numero 55 47 99988 7766 ok")
mascara("+55 com nono digito solto", "numero +55 47 9 8888 7777 ok")
mascara("+55 colado", "numero +5547999887766 ok")
mascara("ddd, espaco e hifen", "numero 47 99988-7766 ok")
mascara("separado por ponto", "numero 47.99988.7766 ok")
mascara("celular sem ddd", "recado no 99988-7766 ok")
mascara("fixo sem ddd", "recado no 3333-4444 ok")
mascara("fixo com ddd", "recado no (11) 3333-4444 ok")
mascara("CPF pontuado", "doc 123.456.789-00 ok")
mascara("CPF colado", "doc 12345678900 ok")
mascara("CNPJ pontuado", "doc 12.345.678/0001-99 ok")
mascara("CNPJ colado", "doc 12345678000199 ok")

print("  CONTROLE: numero de maquina tem que passar INTEIRO")
intacto("data ISO", "medido em 2026-09-10 pelo QA")
intacto("carimbo ISO", "criado 2026-09-10T14:07:00 no cron")
intacto("data brasileira", "medido em 10/09/2026 de novo")
intacto("data curta", "o post de 10/09 saiu")
intacto("hora", "roda as 14:07 todo dia")
intacto("hora com h", "roda as 08h07 e 20h07")
intacto("dinheiro", "gastou R$ 1.234,56 no mes")
intacto("dinheiro sem milhar", "gastou R$ 671,22 no mes")
intacto("id tecnico de 18 digitos", "o anuncio 120247981563040686 ficou ativo")
intacto("id de conta de anuncio", "conta act_1429173142386128 aprovada")
intacto("md5", "md5 d41d8cd98f00b204e9800998ecf8427e confere")
intacto("sha1", "sha1 da3f5c1e9b7a2d4f6081c3e5a7b9d1f3054682ae confere")
intacto("numero de linha", "README.md:1234 tem a regra")
intacto("intervalo de ano", "a serie de 2020-2024 mostra")
intacto("nome de arquivo com numero", "provas/v5-390-cofre.png conferido")
intacto("percentual", "cobertura de 95,5% dos nos")
intacto("contagem", "9 de 9 pecas no piso de 7s")

print("  o DISCRIMINADOR: mascarar nao pode fundir duas pessoas numa so")
# Esta casa ja concluiu que duas clientes DIFERENTES eram a mesma pessoa porque
# a mascara apagou o que as distinguia. `[num]` puro fabricava esse incidente.
conferir("o MESMO numero em quatro escritas da o mesmo apelido",
         len({c.redigir(t) for t in ["5547999887766", "(47) 99988-7766",
                                     "47 99988-7766", "+55 47 9 9988 7766"]}), 1)
conferir("dois numeros que diferem num digito NAO se fundem",
         c.redigir("47999887766") == c.redigir("47999887767"), False)
conferir("e o apelido e estavel entre coletas, nao aleatorio",
         c.redigir("47999887766"), "[num:af1f]")

print("  o TRACO QUE NAO E TRACO: telefone colado de WhatsApp e de Word")
# `47 99988‑7766` com hifen U+2011 saia SEM MASCARA NENHUMA. 20 dos 40 arquivos
# de memoria/ e diario/ ja tem traco ou espaco fora do ASCII.
mascara("hifen unicode U+2011", "ligar 47 99988‑7766 hoje")
mascara("figure dash U+2012", "ligar 47 99988‒7766 hoje")
mascara("en dash U+2013", "ligar 47 99988–7766 hoje")
mascara("em dash U+2014", "ligar 47 99988—7766 hoje")
mascara("sinal de menos U+2212", "ligar 47 99988−7766 hoje")
mascara("espaco duro U+00A0", "ligar 47 99988-7766 hoje")
mascara("espaco fino U+202F", "ligar 47 99988-7766 hoje")
mascara("largura zero U+200B partindo o numero", "ligar 4799988​7766 hoje")
# ‼️ E o discriminador de novo: a ESCRITA do separador nao pode mudar quem e a
# pessoa. Antes, o largura-zero dava um apelido diferente do mesmo numero.
conferir("o mesmo numero em seis separadores da UM apelido so",
         len({c.redigir(t) for t in ["47 99988-7766", "47 99988‑7766",
                                     "47 99988–7766", "4799988​7766",
                                     "(47) 99988-7766", "5547999887766"]}), 1)
# CONTROLE: normalizar e pra MEDIR, nao pra reescrever o texto do autor.
conferir("travessao de prosa sai como foi escrito",
         c.redigir("a casa nao usa travessao — mas a memoria tem"),
         "a casa nao usa travessao — mas a memoria tem")
conferir("intervalo de ano com en dash tambem",
         c.redigir("a serie de 2020–2024 mostra"), "a serie de 2020–2024 mostra")
# ‼️ O QUE FICA DE FORA, declarado: separador que ninguem usa pra telefone, e
# documento separado so por espaco. Sem estes casos escritos, o proximo agente
# le a lista de cima e conclui que a casa pega tudo.
for rotulo, texto in [("ponto medio", "47·99988·7766"),
                      ("barra", "47/99988/7766"),
                      ("underscore", "47_99988_7766"),
                      ("fixo separado por espaco", "recado no 3333 4444 aqui"),
                      ("CPF separado por espaco", "doc 123 456 789 00 aqui")]:
    conferir(f"{rotulo}: passa inteiro (limite declarado)", c.redigir(texto), texto)

print("  MISTURA: forma segura e telefone no mesmo texto, em toda posicao")
# `redigir` deixou de ser um `sub` e virou costura manual (regex na chave
# normalizada, saida montada do texto original). Estes casos existem porque foi
# exatamente isso que a reescrita podia quebrar: o trecho seguro entre dois
# mascarados, e o mascarado na primeira e na ultima posicao.
conferir("seguro antes e depois do telefone",
         c.redigir("em 2026-09-10 as 14:07 o cliente (47) 99988-7766 ligou, gastou R$ 1.234,56"),
         "em 2026-09-10 as 14:07 o cliente [num:af1f] ligou, gastou R$ 1.234,56")
conferir("id tecnico sobrevive ao lado de telefone",
         c.redigir("anuncio 120247981563040686 e telefone 47 99988-7766 no mesmo texto"),
         "anuncio 120247981563040686 e telefone [num:af1f] no mesmo texto")
conferir("telefone na PRIMEIRA posicao, seguro na ultima",
         c.redigir("47 99988-7766 no comeco e 2026-09-10 no fim"),
         "[num:af1f] no comeco e 2026-09-10 no fim")
conferir("dois telefones DIFERENTES nao se fundem no mesmo texto",
         c.redigir("dois telefones: (11) 98888-7777 e (47) 99988-7766"),
         "dois telefones: [num:d2eb] e [num:af1f]")
conferir("texto sem numero nenhum sai identico", c.redigir("nada de numero aqui"),
         "nada de numero aqui")
conferir("texto vazio nao estoura", c.redigir(""), "")

print("\n--- a PESSOA fora do negrito: tratamento e linha de contato")
# Um QA achou duas de verdade em 10/09/2026, no mesmo formato dos exemplos
# ficticios abaixo: um nome dentro do parenteses (que o corte joga fora) e
# outro na terceira coluna ("Contato: <nome>").
tmp_cli = Path(tempfile.mkdtemp()) / "clientes.md"
tmp_cli.write_text(
    "| cliente | conta | nota |\n|---|---|---|\n"
    "| **Escritorio Teste** (Dr. Anselmo, trabalhista, Cuiabá) | act_1 | nada |\n"
    "| **Pousada Teste** (recepcao, reservas) | proprio | Contato: Belarmino |\n",
    encoding="utf-8")
pad_cli, diag_cli = c.carregar_nomes_de_cliente(tmp_cli)
achados_cli = {n for n, _ in pad_cli}
conferir("o nome do tratamento entra na lista", "Anselmo" in achados_cli, True)
conferir("o nome da linha de contato entra na lista", "Belarmino" in achados_cli, True)
# CONTROLE, e e o que impede a lista de virar lixeira: ramo, cidade e funcao
# moram no MESMO parenteses e NAO podem entrar. Trava que nega "reservas"
# apaga meia tela.
for palavra in ("trabalhista", "Cuiabá", "recepcao", "reservas", "Dr", "Dra"):
    conferir(f"{palavra!r} NAO vira nome negado", palavra in achados_cli, False)
shutil.rmtree(tmp_cli.parent, ignore_errors=True)

# ‼️ LIMITE DECLARADO, e ele e da familia que esta casa ja apanhou: GRAFIA.
# Nome com L dobrado que ESTA na lista entra; a mesma grafia com um L so
# (como ja aconteceu de verdade num nome real, fora deste teste) NAO casa
# com o padrao e passa inteiro. A lista mede o PISO. O instrumento que
# resolve a classe e por FORMA de nome mais lista de excecao, como o
# `_RE_NOME_CAND` do verificar_frota.py, nao por enumeracao.
# Lista TEMPORARIA, nome ficticio (25/09/2026, repo publico).
tmp_graf = Path(tempfile.mkdtemp()) / "clientes.md"
tmp_graf.write_text("| cliente | conta |\n|---|---|\n| **Wellington** (teste) | act_1 |\n", encoding="utf-8")
guarda_graf = (c.NOMES_CLIENTE, c.NEGACAO)
c.NOMES_CLIENTE, c.NEGACAO = c.carregar_nomes_de_cliente(tmp_graf)
conferir("grafia diferente do mesmo nome passa (a lista mede o PISO)",
         bool(c.achou_nome_de_cliente("avisa o Welington por favor")), False)
conferir("mas a grafia que esta no arquivo e negada",
         bool(c.achou_nome_de_cliente("avisa o Wellington por favor")), True)
c.NOMES_CLIENTE, c.NEGACAO = guarda_graf
shutil.rmtree(tmp_graf.parent, ignore_errors=True)

print("\n--- cliente NOVO fica protegido so por entrar em clientes.md")
tmp = Path(tempfile.mkdtemp()) / "clientes.md"
tmp.write_text("| cliente | conta |\n|---|---|\n| **Padaria Zilda Nogueira** (teste) | act_1 |\n", encoding="utf-8")
guarda = (c.NOMES_CLIENTE, c.NEGACAO)
c.NOMES_CLIENTE, c.NEGACAO = c.carregar_nomes_de_cliente(tmp)
sem_nome("nome que so existe no arquivo de teste",
         "/opt/x/run.sh # fecha o mes da Padaria Zilda Nogueira")
conferir("e um nome que so existiria no arquivo de verdade NAO esta na lista (prova que trocou)",
         c.achou_nome_de_cliente("Fulana Exemplo") == [], True)
# ‼️ 24/09/2026: nome de PESSOA FISICA de cliente saiu do texto livre de
# clientes.md e passou a viver num arquivo a parte, fora de memoria/ e
# conexoes/ (o verificador de dado pessoal so varre essas duas pastas, e
# clientes.md tinha que ficar limpo). Esse arquivo protege pessoa fisica em
# QUALQUER clientes.md, inclusive um de teste que nunca ouviu falar dela.
# 25/09/2026: pra provar isto sem citar o arquivo real (repo publico), o
# teste cria a PROPRIA lista temporaria e usa o parametro
# `caminho_pessoa_fisica` (adicionado pra isso) em vez do default de producao.
tmp_pessoa_fisica = Path(tempfile.mkdtemp()) / "privacidade_nomes_cliente_teste.txt"
tmp_pessoa_fisica.write_text(
    "Beltrano Teste: pessoa ficticia usada so neste teste\n", encoding="utf-8")
c.NOMES_CLIENTE, c.NEGACAO = c.carregar_nomes_de_cliente(tmp, caminho_pessoa_fisica=tmp_pessoa_fisica)
conferir("mas nome de pessoa fisica (arquivo externo, aqui SINTETICO) "
         "continua mascarado mesmo com o clientes.md trocado",
         bool(c.achou_nome_de_cliente("Beltrano Teste")), True)
shutil.rmtree(tmp_pessoa_fisica.parent, ignore_errors=True)

print("\n--- SEM a lista, nada de texto livre sai (falha FECHADA)")
c.NOMES_CLIENTE, c.NEGACAO = c.carregar_nomes_de_cliente(Path("/nao/existe/clientes.md"))
conferir("negacao nao carregou", c.NEGACAO["carregada"], False)
conferir("rotulo limpo tambem e omitido",
         c.rotulo_do_job("/opt/x/run.sh # mantem front atualizado"),
         "[rótulo omitido: sem lista de clientes]")
conferir("nome de script tambem e omitido",
         c.rotulo_do_job("/usr/bin/python3 /opt/gastaomatos/luana/verificar_frota.py"),
         "[rótulo omitido: sem lista de clientes]")
c.NOMES_CLIENTE, c.NEGACAO = guarda

print("\n--- cofre: aprendizado conferido contra a fonte, e ligação só se declarada")
tmp_cofre = Path(tempfile.mkdtemp())
(tmp_cofre / "FONTE.md").write_text(
    "# fonte de mentira\n"
    "‼️ **A TRAVA MORA NA PORTA**, e quem chama nao decide nada.\n"
    "Segunda linha do mesmo bloco.\n"
    "**É a mesma família do zero calado.**\n"
    "\n"
    "‼️ **OUTRO BLOCO** que nao entra na medida do primeiro.\n",
    encoding="utf-8")


AREAS_TESTE = [{"id": "bots", "nome": "Bots"}, {"id": "trafego", "nome": "Tráfego"},
               {"id": "transversal", "nome": "Transversal", "sempre_visivel": True}]
FAMILIAS_TESTE = [{"id": "zero-calado", "nome": "O zero calado"},
                  {"id": "onde-a-regra-mora", "nome": "Onde a regra mora"}]


def _cofre_de_teste(registros, pasta=tmp_cofre, areas=AREAS_TESTE, familias=FAMILIAS_TESTE):
    alvo = pasta / "cofre.json"
    alvo.write_text(json.dumps({"versao": 1, "areas": areas, "familias": familias,
                                "registros": registros}, ensure_ascii=False), encoding="utf-8")
    return c.ler_cofre(alvo, pasta)


BOM = {"id": "trava-mora-na-porta", "especie": "trava", "area": "bots",
       "familia": "onde-a-regra-mora", "titulo": "A trava mora na porta",
       "corpo": "Regra que mora onde alguem decide, a proxima edicao apaga.",
       "caso": "A trava vivia no meio do main de um arquivo editado toda semana.",
       "autor": "dev", "quando": "2026-09-07", "fonte": "FONTE.md", "linha": 2,
       "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada", "peso": 5,
       "conecta": []}
HUB = {"id": "padrao-zero-calado", "especie": "padrao", "area": "transversal",
       "familia": "zero-calado", "titulo": "O zero calado",
       "corpo": "Valor que pode nascer de falha carrega a falha junto.",
       "caso": "Apareceu em quatro sistemas no mesmo dia.",
       "autor": "Renato", "quando": "2026-09-08", "fonte": "FONTE.md", "linha": 5,
       "ancora": "É a mesma família do zero calado", "peso": 5, "conecta": []}

cofre = _cofre_de_teste([BOM, HUB])
conferir("âncora presente vira nó vivo", cofre["vencidos"], [])
conferir("o endereço sai da ÂNCORA, não da linha que o registro declarou",
         cofre["nos"][0]["arquivo"], "FONTE.md:2")
conferir("o bloco é medido até o próximo marcador, não até o teto",
         cofre["nos"][0]["linhas"], 3)
conferir("espécie e autor chegam na tela",
         (cofre["nos"][0]["especie"], cofre["nos"][0]["autor"]), ("trava", "dev"))

# ‼️ o caso que PRECISA reprovar: âncora que sumiu da fonte.
cofre = _cofre_de_teste([{**BOM, "ancora": "frase que nunca existiu neste arquivo"}])
conferir("âncora ausente marca o nó como vencido, e ele NÃO some calado",
         (cofre["vencidos"], len(cofre["nos"])), (["trava-mora-na-porta"], 1))
conferir("nó vencido não finge endereço",
         cofre["nos"][0]["arquivo"].startswith("âncora não confere"), True)

# ligação declarada na fonte entra; ligação que alguém achou parecida, não.
cofre = _cofre_de_teste([{**BOM, "conecta": [
    {"para": "padrao-zero-calado", "porque": "É a mesma família do zero calado"}]}, HUB])
conferir("ligação escrita na fonte vira aresta", cofre["conexoes"], 1)
conferir("aresta que troca de área é marcada como PONTE, e o filtro não pode escondê-la",
         cofre["arestas"][0]["ponte"], True)
conferir("o grau conta os dois sentidos: quem só recebe é tão central quanto quem emite",
         {n["id"]: n["grau"] for n in cofre["nos"]},
         {"trava-mora-na-porta": 1, "padrao-zero-calado": 1})
conferir("a barra lateral só lista área que tem registro, nunca cluster vazio",
         [(a["id"], a["total"]) for a in cofre["areas"]],
         [("bots", 1), ("transversal", 1)])
# área fora do catálogo REPROVA o teste do coletor: o registro é recusado e não entra nos nós
recusa = _cofre_de_teste([{**BOM, "area": "inventada"}])
conferir("área fora do catálogo é RECUSADA na porta", (len(recusa["nos"]), len(recusa["recusados"])), (0, 1))
conferir("área fora do catálogo é anotada em recusados",
         any("área fora do catálogo" in r for r in recusa["recusados"]),
         True)
cofre = _cofre_de_teste([{**BOM, "conecta": [
    {"para": "padrao-zero-calado", "porque": "os dois falam de coisa parecida"}]}, HUB])
conferir("ligação que não está escrita na fonte é RECUSADA", cofre["conexoes"], 0)
conferir("e a recusa aparece, não some", len(cofre["arestas_recusadas"]), 1)

# a porta: nome de cliente no texto derruba o registro inteiro.
guarda = (c.NOMES_CLIENTE, c.NEGACAO)
c.NOMES_CLIENTE = [("Fulano da Silva", c._padrao_do_nome("Fulano da Silva"))]
c.NEGACAO = {"carregada": True, "nomes": 1, "erro": None, "arquivo": "teste"}
cofre = _cofre_de_teste([{**BOM, "caso": "O Fulano da Silva pediu isso por telefone."}])
conferir("nome de cliente no caso não vira nó com o nome",
         "Fulano" in json.dumps(cofre, ensure_ascii=False), False)
# sem a lista de nomes, o Cofre NÃO sai vazio: ele diz que não conseguiu conferir.
c.NEGACAO = {"carregada": False, "nomes": 0, "erro": "lista ausente", "arquivo": "teste"}
cofre = _cofre_de_teste([BOM])
conferir("sem lista de nomes o Cofre falha ALTO, não devolve zero", cofre["erro"] is not None, True)
c.NOMES_CLIENTE, c.NEGACAO = guarda

# fonte fora da raiz não é lida.
cofre = _cofre_de_teste([{**BOM, "fonte": "../../../etc/hosts"}])
conferir("fonte que escapa da raiz é recusada", (len(cofre["nos"]), len(cofre["recusados"])), (0, 1))

# Skills e Ferramentas: injeção catalogada, sem fallback cinza e conectada aos aprendizados
BOM_APIFY = {
    **BOM,
    "id": "trava-apify-timeout",
    "titulo": "A skill Apify precisa de timeout",
    "corpo": "Chamadas à API da Apify sem timeout travam a fila de mineração.",
    "caso": "Apify caiu e a coleta ficou presa por 4 horas.",
    "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada",
}
skills_teste = [
    {
        "id": "skill-luana-apify",
        "nome": "Apify",
        "tipo": "Skill",
        "responsavel": "Luana",
        "sistema": "Apify",
        "finalidade": "Automação e extração via Apify",
        "origem": "luana/.claude/skills/apify/SKILL.md",
        "estado": "disponível",
        "ultima_verificacao": "2026-09-23T12:00:00+00:00",
    }
]
_cofre_de_teste([BOM_APIFY])
cofre_com_skills = c.ler_cofre(tmp_cofre / "cofre.json", tmp_cofre, skills_acessos_extras=skills_teste)
area_op = next((a for a in cofre_com_skills["areas"] if a["id"] == "operacao"), None)
conferir("área operacao está catalogada sem fallback", (area_op is not None, area_op.get("fallback") if area_op else False), (True, None))
conferir("nome legível para a área de skills", area_op.get("nome") if area_op else None, "Skills e ferramentas")
conferir("nenhuma área catalogada fica em fallback cinza", [a["id"] for a in cofre_com_skills["areas"] if a.get("fallback")], [])

# Verificar que a skill tem grau > 0 e ligou ao aprendizado que cita Apify
no_skill = next((n for n in cofre_com_skills["nos"] if n["id"] == "skill-luana-apify"), None)
conferir("nó de skill foi injetado", no_skill is not None, True)
conferir("skill tem grau > 0 amarrada na rede", (no_skill.get("grau") or 0) > 0, True)
arestas_skill = [a for a in cofre_com_skills["arestas"] if a["de"] == "trava-apify-timeout" or a["para"] == "trava-apify-timeout"]
conferir("aprendizado que cita Apify ganha aresta para a skill/sistema", len(arestas_skill) > 0, True)

# Teste dos 54 nós de skill/sistema: sinônimos ligam à rede e o teste lista os que ficaram sem
APRENDIZADOS_CONECTADOS = [
    {**BOM_APIFY, "id": "trava-apify-timeout", "titulo": "A skill Apify precisa de timeout", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "ordem-meta-anuncio", "titulo": "Nunca edite anúncio em campanha Meta: sempre crie outro", "corpo": "Tráfego pago no Instagram e Facebook.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "medicao-whatsapp-bot", "titulo": "Bot de restaurante no WhatsApp e Uazapi", "corpo": "Mensagens de clientes no zap.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-google-minerador", "titulo": "Minerador do Google Ads e palavras-chave", "corpo": "Busca e mineração de termos negativos.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-crm-leads", "titulo": "CRM e origem dos leads no funil", "corpo": "Contatos capturados no HubSpot.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-financeiro-faturas", "titulo": "Cobrança de faturas e PIX no financeiro", "corpo": "Integração Asaas e boletos.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "ordem-contratos-juridico", "titulo": "Contratos com clientes e assinatura", "corpo": "Gestão de contratos e termos.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-tarefas-backlog", "titulo": "Gerenciador de tarefas e backlog", "corpo": "Tarefas abertas no cron da casa.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-video-reels", "titulo": "Edição de vídeo Reels e capa no estúdio", "corpo": "Frame zero e cover no AI Video Studio.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-tts-audio", "titulo": "Voz sintética e áudio TTS", "corpo": "Geração de voz e fala no ElevenLabs.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-transcritor-whisper", "titulo": "Transcritor remoto e áudio", "corpo": "Degravação e transcrição Whisper.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-produtor-conteudo", "titulo": "Produtor de conteúdo e posts", "corpo": "Carrossel, copy e feed do Instagram.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-verificador-frota", "titulo": "Verificador da frota e checagem", "corpo": "Sonda de agentes e validação.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-dashboard-painel", "titulo": "Painel de métricas e conversas", "corpo": "Dashboard da operação no ar.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-portal-sac", "titulo": "Portal de clientes e SAC", "corpo": "Atendimento e conversas multicanal.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-dev-codigo", "titulo": "Dev e código vivo no boot", "corpo": "Processo e engenharia de software.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-qa-validador", "titulo": "QA e validador de regras", "corpo": "Revisor de testes e checagens.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-designer-layout", "titulo": "Designer de layout e capas", "corpo": "Contraste de tags e artes.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-copy-roteiro", "titulo": "Copywriter e legendas de posts", "corpo": "Copy e roteiros de vídeos.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-analista-credito", "titulo": "Analista de dados e relatórios", "corpo": "Análise operacional e crédito.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-gestor-ordem", "titulo": "Gestor de diretivas e ordens", "corpo": "Diretiva do gestor e comando.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
    {**BOM, "id": "trava-telegram-bot", "titulo": "Bot do Telegram e avisos", "corpo": "Mensagens de canais no Telegram.", "ancora": "A TRAVA MORA NA PORTA, e quem chama nao decide nada"},
]
SKILLS_54_TESTE = [
    {"id": "skill-luana-minerador-google", "nome": "Minerador Google", "tipo": "Skill", "responsavel": "Luana", "sistema": "Google Ads", "finalidade": "Mineração Google", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-google_ads", "nome": "Conexão Google Ads", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Google Ads", "finalidade": "Acesso Google Ads", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-uazapi", "nome": "Conexão Uazapi", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Uazapi", "finalidade": "WhatsApp API", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-renato-uazapi", "nome": "Conexão Uazapi", "tipo": "Acesso", "responsavel": "Renato", "sistema": "Uazapi", "finalidade": "WhatsApp API", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-meta_ads", "nome": "Conexão Meta Ads", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Meta Ads", "finalidade": "Meta Ads / Tráfego", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-renato-meta_ads", "nome": "Conexão Meta Ads", "tipo": "Acesso", "responsavel": "Renato", "sistema": "Meta Ads", "finalidade": "Meta Ads / Tráfego", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-apify", "nome": "Apify", "tipo": "Skill", "responsavel": "Luana", "sistema": "Apify", "finalidade": "Scraping Apify", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-crm", "nome": "Conexão CRM", "tipo": "Acesso", "responsavel": "Luana", "sistema": "CRM", "finalidade": "HubSpot CRM", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-renato-crm", "nome": "Conexão CRM", "tipo": "Acesso", "responsavel": "Renato", "sistema": "CRM", "finalidade": "HubSpot CRM", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-financeiro", "nome": "Conexão Financeiro", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Financeiro", "finalidade": "Asaas / Stripe", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-renato-financeiro", "nome": "Conexão Financeiro", "tipo": "Acesso", "responsavel": "Renato", "sistema": "Financeiro", "finalidade": "Asaas / Stripe", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-contratos", "nome": "Conexão Contratos", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Contratos", "finalidade": "Gestor de Contratos", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-portal", "nome": "Conexão Portal", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Portal", "finalidade": "Portal do Cliente / SAC", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-tarefas", "nome": "Conexão Tarefas", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Tarefas", "finalidade": "Gerenciador de Tarefas", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-tts", "nome": "TTS Voz", "tipo": "Skill", "responsavel": "Luana", "sistema": "TTS", "finalidade": "Voz Sintética ElevenLabs", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-video", "nome": "AI Video", "tipo": "Skill", "responsavel": "Luana", "sistema": "AI Video Studio", "finalidade": "Edição de Vídeo Reels", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-transcritor", "nome": "Transcritor", "tipo": "Skill", "responsavel": "Luana", "sistema": "Transcritor", "finalidade": "Transcrição Whisper", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-produtor", "nome": "Produtor Conteudo", "tipo": "Skill", "responsavel": "Luana", "sistema": "Produtor Conteudo", "finalidade": "Criação de Conteúdo e Posts", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-verificador", "nome": "Verificador Frota", "tipo": "Skill", "responsavel": "Luana", "sistema": "Verificador", "finalidade": "Sonda e checagem da frota", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-dashboard", "nome": "Conexão Dashboard", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Dashboard", "finalidade": "Painel e Métricas", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-analista", "nome": "Skill Analista", "tipo": "Skill", "responsavel": "Luana", "sistema": "Analista", "finalidade": "Análise e crédito", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-copy", "nome": "Skill Copy", "tipo": "Skill", "responsavel": "Luana", "sistema": "Copy", "finalidade": "Copywriting e roteiros", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-designer", "nome": "Skill Designer", "tipo": "Skill", "responsavel": "Luana", "sistema": "Designer", "finalidade": "Design e layouts", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-dev", "nome": "Skill Dev", "tipo": "Skill", "responsavel": "Luana", "sistema": "Dev", "finalidade": "Desenvolvimento e código", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-qa", "nome": "Skill QA", "tipo": "Skill", "responsavel": "Luana", "sistema": "QA", "finalidade": "Validação e testes", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-gestor", "nome": "Skill Gestor", "tipo": "Skill", "responsavel": "Luana", "sistema": "Gestor", "finalidade": "Gestão e ordens operacionais", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-luana-telegram", "nome": "Conexão Telegram", "tipo": "Acesso", "responsavel": "Luana", "sistema": "Telegram", "finalidade": "Bot Telegram e alertas", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-renato-telegram", "nome": "Conexão Telegram", "tipo": "Acesso", "responsavel": "Renato", "sistema": "Telegram Renato", "finalidade": "Canais Telegram", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "skill-luana-notion", "nome": "Skill Notion", "tipo": "Skill", "responsavel": "Luana", "sistema": "Notion", "finalidade": "Notas e docs isolados", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
    {"id": "conexao-renato-notion", "nome": "Conexão Notion", "tipo": "Acesso", "responsavel": "Renato", "sistema": "Notion", "finalidade": "Base externa", "origem": "s", "estado": "disponível", "ultima_verificacao": "2026-09-23T00:00:00Z"},
]
_cofre_de_teste(APRENDIZADOS_CONECTADOS)
cofre_54 = c.ler_cofre(tmp_cofre / "cofre.json", tmp_cofre, skills_acessos_extras=SKILLS_54_TESTE)
nos_skill_sistema = [n for n in cofre_54["nos"] if n.get("area") == "operacao" and n.get("tipo") in ("skill", "sistema")]
ids_skill_sistema = {n["id"] for n in nos_skill_sistema}
ids_apr = {n["id"] for n in cofre_54["nos"] if n.get("area") != "operacao"}
ligados_a_apr = set()
for a in cofre_54["arestas"]:
    if a["de"] in ids_apr and a["para"] in ids_skill_sistema:
        ligados_a_apr.add(a["para"])
    if a["para"] in ids_apr and a["de"] in ids_skill_sistema:
        ligados_a_apr.add(a["de"])
sem_aresta_apr = sorted(list(ids_skill_sistema - ligados_a_apr))
print(f"       nós de skill/sistema conectados a aprendizado: {len(ligados_a_apr)} de {len(nos_skill_sistema)}")
if sem_aresta_apr:
    print(f"       nós que ficaram sem aresta ({len(sem_aresta_apr)}): {sem_aresta_apr}")
conferir("total de nós de skill/sistema no teste é pelo menos 54", len(nos_skill_sistema) >= 54, True)
conferir("pelo menos metade dos nós de skill/sistema liga a aprendizado", len(ligados_a_apr) >= (len(nos_skill_sistema) / 2), True)
conferir("teste lista explicitamente os nós que ficaram sem aresta", isinstance(sem_aresta_apr, list), True)
conferir("nenhum nó com mais de 20 arestas", all(n.get("grau", 0) <= 20 for n in cofre_54["nos"]), True)
SEM_APRENDIZADO_ESPERADAS = {"conexao-renato-notion", "sistema-notion", "skill-luana-notion"}
conferir("nenhuma skill com grau 0 em aprendizados sem estar listada no teste", set(sem_aresta_apr).issubset(SEM_APRENDIZADO_ESPERADAS), True)


# ---------------------------------------------------------------------------
# AS TRÊS PORTAS QUE O CofRE DEIXAVA ABERTAS (medidas pelo QA em 10/09/2026)
#
# As três tinham a mesma forma: campo que NINGUÉM revisou indo pro JSON
# servido. A razão da ligação é citação literal de arquivo sob `luana/`, e
# `memoria/` casa o padrão de fonte aceito; as listas de recusa carregam o
# valor cru de quem falhou na validação. Hoje as duas estão limpas: era risco
# armado, não incidente, e é por isso que estes casos existem.
# ---------------------------------------------------------------------------
print("\n--- cofre: a RAZÃO da ligação e as listas de RECUSA também são saída")
(tmp_cofre / "FONTE-SUJA.md").write_text(
    "# fonte com gente dentro\n"
    "‼️ **A TRAVA MORA NA PORTA**, e quem chama nao decide nada.\n"
    "Fulano da Silva ligou do 47999887766 e escreveu de fulano@cliente.com.br\n"
    "\n"
    "‼️ **OUTRO BLOCO** que fecha o de cima.\n",
    encoding="utf-8")

RAZAO_LITERAL = "Fulano da Silva ligou do 47999887766 e escreveu de fulano@cliente.com.br"
SUJO = "Fulano da Silva 47999887766 fulano@cliente.com.br"


def sem_pessoa(nome, texto):
    """Nem nome, nem telefone, nem e-mail. E a marca certa no lugar."""
    global falhas
    vazou = [p for p in ("Fulano", "Silva", "47999887766", "999887766",
                         "@cliente.com.br") if p in texto]
    if vazou:
        falhas += 1
    print(f"{'ok  ' if not vazou else 'FALHOU'} {nome}\n       {texto!r}"
          + (f"  <-- VAZOU {vazou}" if vazou else ""))


guarda = (c.NOMES_CLIENTE, c.NEGACAO)
c.NOMES_CLIENTE = [("Fulano da Silva", c._padrao_do_nome("Fulano da Silva"))]
c.NEGACAO = {"carregada": True, "nomes": 1, "erro": None, "arquivo": "teste"}

cofre = _cofre_de_teste([
    {**BOM, "fonte": "FONTE-SUJA.md",
     "conecta": [{"para": "padrao-zero-calado", "porque": RAZAO_LITERAL}]},
    HUB])
# ‼️ O caso que separa o conserto certo do errado. Mascarar ANTES de conferir
# contra a fonte faria `[cliente]` nunca casar com o arquivo, e a aresta seria
# RECUSADA: o vazamento viraria um zero calado. A prova roda no texto cru, a
# máscara roda depois, e por isso a ligação continua existindo.
conferir("a ligação continua nascendo, mesmo com nome de cliente na razão",
         cofre["conexoes"], 1)
sem_pessoa("e a razão chega na tela mascarada", cofre["arestas"][0]["porque"])
conferir("com as três marcas no lugar do que foi tirado",
         all(m in cofre["arestas"][0]["porque"] for m in ("[cliente]", "[num:", "[e-mail]")),
         True)
sem_pessoa("e nada sobrou no JSON inteiro", json.dumps(cofre, ensure_ascii=False))
# o ramo de falha da máscara também precisa de um caso que o dispare pelo nome,
# senão metade da trava pode ter morrido numa edição e o teste continua verde.
conferir("razão que a máscara não consegue limpar vira marca, e não texto cru",
         c._cofre_razao("... ... ..."),
         "[razão omitida: não passou na trava de nome de cliente]")

# 3. as listas de recusa: o registro que ninguém revisou é justamente este.
recusa = _cofre_de_teste([{**BOM, "especie": SUJO}])
conferir("registro inválido continua sendo recusado e contado",
         (len(recusa["nos"]), len(recusa["recusados"])), (0, 1))
sem_pessoa("e o motivo da recusa sai sem a pessoa", recusa["recusados"][0])
recusa = _cofre_de_teste([{**BOM, "conecta": [
    {"para": SUJO, "porque": "É a mesma família do zero calado"}]}])
conferir("aresta com destino inexistente continua recusada",
         len(recusa["arestas_recusadas"]), 1)
sem_pessoa("e o destino cru não viaja no motivo", recusa["arestas_recusadas"][0])
# CONTROLE: sanear não pode virar apagar. O motivo tem que continuar servindo
# pra alguém consertar o registro.
recusa = _cofre_de_teste([{**BOM, "area": "inventada"}])
conferir("motivo limpo de recusa continua legível, com o valor que causou a recusa",
         any("área fora do catálogo" in r and "inventada" in r for r in recusa["recusados"]),
         True)
c.NOMES_CLIENTE, c.NEGACAO = guarda

shutil.rmtree(tmp_cofre, ignore_errors=True)

# e o registro DE VERDADE, contra as fontes de verdade.
vivo = c.ler_cofre()
conferir("o Cofre da casa lê sem erro", vivo["erro"], None)
conferir("nenhum registro da casa está com âncora vencida", vivo["vencidos"], [])
conferir("nenhum registro da casa foi recusado na porta", vivo["recusados"], [])

print("\n--- ferramentas: estados separados e saída sem segredo")
ferramentas = c.ler_ferramentas()
conferir("inventário tem itens", ferramentas["medidos"] > 0, True)
conferir("as três classes estão contadas", set(ferramentas["contagem"]), {"disponível", "fallback", "ausente"})
conferir("Meta é fallback, não disponibilidade completa", next(x for x in ferramentas["itens"] if x["id"] == "integracao-meta")["estado"], "fallback")
conferir("inventário é maior que os três MCPs", ferramentas["medidos"] > ferramentas["por_tipo"]["MCP"], True)
conferir("cada item declara proveniência", all(x["proveniencias"] for x in ferramentas["itens"]), True)
serializado = str(ferramentas).lower()
conferir("não serializa chave, token ou caminho privado", not any(x in serializado for x in ["21st_sk_", "/home/", "/opt/"]), True)

pasta_cfg = Path(tempfile.mkdtemp())
codex_cfg = pasta_cfg / "codex.toml"
claude_cfg = pasta_cfg / "claude.json"
runtime_cfg = pasta_cfg / "runtime"
runtime_cfg.mkdir()
codex_cfg.write_text('[mcp_servers.teste]\nurl = "https://example.invalid/mcp"\n', encoding="utf-8")
claude_cfg.write_text(json.dumps({"mcpServers": {"teste": {"url": "https://example.invalid/mcp"}, "segundo": {"url": "https://example.invalid/outro"}}}), encoding="utf-8")
(runtime_cfg / "catalogo.json").write_text(json.dumps({"schema_version": 4, "tools": [{"server_name": "runtime_extra", "tool_name": "ler"}, {"server_name": "runtime_extra", "tool_name": "buscar"}]}), encoding="utf-8")
somente_codex = c.ler_ferramentas(configs_codex=(codex_cfg,), configs_claude=(), mcp_runtime_tools=pasta_cfg / "runtime-ausente", plugins_codex=pasta_cfg / "plugins", plugins_claude=pasta_cfg / "plugins.json")
somente_claude = c.ler_ferramentas(configs_codex=(), configs_claude=(claude_cfg,), mcp_runtime_tools=pasta_cfg / "runtime-ausente", plugins_codex=pasta_cfg / "plugins", plugins_claude=pasta_cfg / "plugins.json")
com_runtime = c.ler_ferramentas(configs_codex=(codex_cfg,), configs_claude=(claude_cfg,), mcp_runtime_tools=runtime_cfg, plugins_codex=pasta_cfg / "plugins", plugins_claude=pasta_cfg / "plugins.json")
ids_codex = {x["id"] for x in somente_codex["itens"] if x["tipo"] != "MCP"}
ids_claude = {x["id"] for x in somente_claude["itens"] if x["tipo"] != "MCP"}
conferir("catálogo operacional não muda com a LLM", ids_codex, ids_claude)
conferir("MCP equivalente é normalizado no mesmo id", {x["id"] for x in somente_codex["itens"] if x["tipo"] == "MCP"}, {"mcp-teste"})
conferir("inventário MCP cresce pelas fontes, sem lista fixa de três", {x["id"] for x in com_runtime["itens"] if x["tipo"] == "MCP"}, {"mcp-teste", "mcp-segundo", "mcp-runtime-extra"})
shutil.rmtree(pasta_cfg, ignore_errors=True)

print("\n--- SOPs: só fontes e relações existentes")
sops = c.ler_sops()
conferir("catálogo real fica pronto", sops["status"], "pronto")
conferir("um item por playbook declarado", sops["total"], len(c.SOPS_DECLARADOS))
conferir("todo SOP tem fonte rastreável", all(x["fontes"] and x["fontes"][0].startswith("skill:") for x in sops["itens"]), True)
conferir("toda aresta carrega evidência", all(x["evidencia"] for x in sops["arestas"]), True)
conferir("frequência só aparece quando declarada", [(x["id"], x["frequencia"]) for x in sops["itens"] if x["frequencia"]], [("dashboard", "sincronização automática às 8h, 12h e 20h de São Paulo")])
tmp_sops = Path(tempfile.mkdtemp())
falha_sops = c.ler_sops(pasta_skills=tmp_sops)
conferir("playbook ausente fecha o catálogo", (falha_sops["status"], falha_sops["total"], falha_sops["itens"], falha_sops["arestas"]), ("erro", None, [], []))
shutil.rmtree(tmp_sops, ignore_errors=True)

print("\n--- estado público: trava global recursiva")
conferir("rótulos técnicos e basename preservam rastreabilidade",
         c.auditar_estado_publico({"arquivo": "agente:global/dev.md", "fonte": "posts.json"}), [])
conferir("caminho absoluto reprova em qualquer profundidade",
         bool(c.auditar_estado_publico({"novo": [{"campo": "/opt/segredo/arquivo.txt"}]})), True)
conferir("home abreviado também reprova",
         bool(c.auditar_estado_publico({"campo": "ler ~/.config/privado"})), True)
conferir("e-mail reprova em qualquer campo",
         bool(c.auditar_estado_publico({"novo": {"texto": "pessoa@exemplo.com"}})), True)
conferir("valor com formato de token reprova",
         bool(c.auditar_estado_publico({"campo": "Bearer segredo123456789"})), True)
conferir("chave nova de credencial reprova mesmo com valor mascarado",
         bool(c.auditar_estado_publico({"integracao": {"api_key": "mascarada"}})), True)

print("  a porta FINAL e o numero de pessoa: campo NOVO com telefone cru")
# Esta porta reprovava e-mail, caminho e segredo, e APROVAVA telefone, CPF e
# CNPJ. Era o mesmo buraco da regua velha (`\d{6,}`), uma camada acima: campo
# novo que nascesse com telefone ia pro `estado.json` servido sem reprovar.


def porta_reprova(nome, texto):
    conferir(nome, bool(c.auditar_estado_publico({"campo_novo": texto})), True)


def porta_aprova(nome, texto):
    conferir(nome, c.auditar_estado_publico({"campo_novo": texto}), [])


porta_reprova("telefone com parenteses e hifen", "ligar (47) 99988-7766 hoje")
porta_reprova("telefone com parenteses colado", "ligar (11)98888-7777 hoje")
porta_reprova("telefone separado por espaco", "numero 55 47 99988 7766 aqui")
porta_reprova("telefone com +55 e nono digito solto", "numero +55 47 9 8888 7777 aqui")
porta_reprova("telefone com +55 colado", "numero +5547999887766 aqui")
porta_reprova("telefone separado por ponto", "numero 47.99988.7766 aqui")
porta_reprova("telefone com DDD e hifen", "numero 47 99988-7766 aqui")
porta_reprova("celular sem DDD", "recado no 99988-7766 aqui")
porta_reprova("fixo com DDD", "recado no (11) 3333-4444 aqui")
porta_reprova("fixo com DDD separado por espaco", "me liga no 47 3333-4444 quando terminar")
porta_reprova("CPF pontuado", "doc 123.456.789-00 aqui")
porta_reprova("CNPJ pontuado", "doc 12.345.678/0001-99 aqui")

# ‼️ AS DUAS PORTAS TEM QUE ENXERGAR A MESMA COISA. Por dez minutos em 10/09 a
# normalizacao de separador estava so no `redigir`: o telefone com hifen unicode
# era mascarado la e APROVADO aqui. Regua que existe em duas versoes so precisa
# de uma edicao pra divergir, e a frouxa e sempre a que grava.
for rotulo, texto in [("hifen U+2011", "ligar 47 99988‑7766 hoje"),
                      ("en dash U+2013", "ligar 47 99988–7766 hoje"),
                      ("largura zero U+200B", "ligar 4799988​7766 hoje")]:
    conferir(f"{rotulo}: redigir mascara E a porta reprova",
             (c.redigir(texto) != texto,
              bool(c.auditar_estado_publico({"campo_novo": texto}))),
             (True, True))

print("  e a MESMA regua na CHAVE do objeto, nao so no valor")
# Agregar por cliente, por lead ou por telefone poe o dado na CHAVE, e ali so
# o nome de credencial era conferido. Medido: 0 das 364 chaves vivas reprovam.
for rotulo, chave in [("telefone como chave", "(47) 99988-7766"),
                      ("e-mail como chave", "contato@cliente.com.br"),
                      ("CPF como chave", "123.456.789-00"),
                      ("caminho de maquina como chave", "/opt/gastaomatos/luana/memoria/x.md"),
                      ("segredo como chave", "Bearer abcdefgh12345678")]:
    conferir(rotulo, bool(c.auditar_estado_publico({"agregado": {chave: 3}})), True)

print("  CONTROLE: a porta nao pode punir o certo, senao alguem desliga a porta")
porta_aprova("data ISO", "medido em 2026-09-10 pelo QA")
porta_aprova("carimbo ISO com microssegundo", "gerado 2026-09-10T16:14:17.611431+00:00")
porta_aprova("data brasileira", "medido em 10/09/2026 de novo")
porta_aprova("hora", "roda as 14:07 e as 08h07")
porta_aprova("dinheiro", "gastou R$ 1.234,56 no mes")
porta_aprova("id tecnico de 18 digitos", "o anuncio 120247981563040686 ficou ativo")
porta_aprova("id de conta de anuncio", "conta act_1429173142386128 aprovada")
porta_aprova("md5", "md5 d41d8cd98f00b204e9800998ecf8427e confere")
porta_aprova("numero de linha", "README.md:1234 tem a regra")
porta_aprova("expressao de cron", "roda 1-56/5 * * * * no servidor")
porta_aprova("id hexadecimal de 12 da biblioteca", "item 189371dfc9f6 catalogado")

print("  as TRES bombas que a primeira versao desta porta armou (QA, 10/09/2026)")
# A primeira regua reprovava tambem corrida NUA e faixa `NNNN-NNNN`. Isso nao
# vazava nada: PARAVA O COLETOR, sem gente no meio pra desfazer. Cada caso aqui
# e um estado que ja existe na casa, nao um cenario inventado.
porta_aprova("id da biblioteca que sorteou 55+DDD (9 em 400.000 por item)",
             "554749789013")
porta_aprova("outro sorteio do mesmo formato", "553391943739")
porta_aprova("faixa de verba, que o dono escreve no Telegram",
             "Subir a verba do cliente de 3000-4000 por mes")
porta_aprova("outra faixa de verba", "Testar orcamento 2500-3500 nesta semana")
porta_aprova("epoch em segundos", "ancora 1787766056 no followup")
porta_aprova("id de conta do Google Ads", "Google Ads, conta 6907685124")
porta_aprova("id de campanha do Google Ads", "orcamento compartilhado 7709375454")

# ‼️ E o outro lado, que so vale escrito: essas quatro formas NAO reprovam aqui
# de propósito, e continuam morrendo em `redigir`. Sem este par de casos, a
# proxima pessoa le a lista de cima e conclui que a casa nao mascara telefone.
for rotulo, texto in [("telefone colado com pais", "cliente 5547999887766 ligou"),
                      ("telefone colado sem pais", "cliente 47999887766 ligou"),
                      ("CPF colado", "doc 12345678900 aqui"),
                      ("fixo sem DDD", "recado no 3333-4444 aqui")]:
    conferir(f"{rotulo}: passa na porta E morre em redigir",
             (c.auditar_estado_publico({"campo_novo": texto}), c.redigir(texto) != texto),
             ([], True))

# ‼️ A PROVA QUE VALE MAIS QUE AS DE CIMA: o payload REAL tem que continuar
# passando. Trava que reprova o estado de hoje nao e trava, e um coletor
# parado, porque `main()` LEVANTA quando esta funcao acha problema.
servido = c.SAIDA
if servido.is_file():
    conferir("o estado.json SERVIDO passa inteiro na porta apertada",
             c.auditar_estado_publico(json.loads(servido.read_text(encoding="utf-8")))[:5], [])
else:
    print(f"AVISO  estado servido ausente em {servido.name}: a prova de regressao NAO rodou")

# ‼️ E o CORPUS REAL DA CASA, que foi quem derrubou a primeira regua: a porta
# nao pode parar a coleta por causa de texto que ja esta escrito em `memoria/`
# e `diario/`. Medido em 10/09/2026: a regua larga parava em 8 linhas, cinco
# delas id de conta do Google Ads; esta para em 1, e essa 1 e um telefone DE
# VERDADE escrito no diario, ou seja acerto, nao falso positivo.
casa = [p for pasta in ("memoria", "diario")
        for p in sorted((Path("/opt/gastaomatos/luana") / pasta).glob("*.md"))]
if casa:
    param = [(p.name, ln.strip()[:60]) for p in casa
             for ln in p.read_text(encoding="utf-8", errors="replace").splitlines()
             if ln.strip() and c.numero_de_pessoa(ln)]
    # 1 linha e o telefone real do diario de 31/08. Mais que isso e regressao.
    conferir(f"corpus da casa ({len(casa)} arquivos): no maximo 1 linha para a coleta",
             len(param) <= 1, True)
    if param:
        print(f"       (a que para: {param[0][0]} -> {param[0][1]!r})")
else:
    print("AVISO  corpus da casa nao encontrado: a prova de regressao NAO rodou")

# E o outro lado do limite: `redigir` erra pra MASCARAR, e come digito de id
# hexadecimal curto. Nenhum caminho vivo manda esses ids por ela (medido em
# 10/09/2026: os 248 ids de `biblioteca.itens` chegam inteiros no servido), mas
# o dia em que alguem mandar, o id sai corrompido, e nao calado.
conferir("redigir mascara digito dentro de hex de 12 (limite conhecido)",
         c.redigir("189371dfc9f6"), "[num:14f5]dfc9f6")

print("\n--- sessões Codex: dono, retorno real e privacidade")
tmp_codex = Path(tempfile.mkdtemp())


def linha_codex(tipo, payload, timestamp):
    return json.dumps({"timestamp": timestamp, "type": tipo, "payload": payload}) + "\n"


raiz_id = "01a00000-0000-7000-8000-000000000001"
pai_id = "01a00000-0000-7000-8000-000000000002"
filho_id = "01a00000-0000-7000-8000-000000000003"
(tmp_codex / f"rollout-{raiz_id}.jsonl").write_text(
    linha_codex("session_meta", {"id": raiz_id}, "2026-09-09T10:00:00Z")
    + linha_codex("response_item", {
        "type": "function_call", "namespace": "collaboration", "name": "spawn_agent",
        "call_id": "chamada-pai", "arguments": json.dumps({"task_name": "pai"}),
    }, "2026-09-09T10:00:10Z"),
    encoding="utf-8",
)
(tmp_codex / f"rollout-{pai_id}.jsonl").write_text(
    linha_codex("session_meta", {
        "id": pai_id, "agent_path": "/root/pai", "agent_nickname": "Curie",
    }, "2026-09-09T10:01:00Z")
    + linha_codex("session_meta", {"id": raiz_id}, "2026-09-09T10:01:00Z")
    + linha_codex("response_item", {
        "type": "function_call", "namespace": "collaboration", "name": "spawn_agent",
        "call_id": "chamada-filho", "arguments": json.dumps({"task_name": "filho"}),
    }, "2026-09-09T10:01:10Z")
    + linha_codex("event_msg", {
        "type": "task_complete", "completed_at": 1788948090,
    }, "2026-09-09T10:01:30Z"),
    encoding="utf-8",
)
(tmp_codex / f"rollout-{filho_id}.jsonl").write_text(
    linha_codex("session_meta", {
        "id": filho_id, "agent_path": "/root/pai/filho", "agent_nickname": "Galileo",
    }, "2026-09-09T10:02:00Z")
    + linha_codex("session_meta", {
        "id": pai_id, "agent_path": "/root/pai", "agent_nickname": "Curie",
    }, "2026-09-09T10:02:00Z")
    + linha_codex("session_meta", {"id": raiz_id}, "2026-09-09T10:02:00Z")
    # O fork herdou a conclusão do pai e redatou a linha. completed_at continua
    # anterior ao nascimento do filho, portanto NÃO é retorno do filho.
    + linha_codex("event_msg", {
        "type": "task_complete", "completed_at": 1788948090,
    }, "2026-09-09T10:02:00Z"),
    encoding="utf-8",
)
codex = c._ler_convocacoes_codex(tmp_codex)
conferir("o primeiro session_meta identifica o filho, não o pai herdado",
         set(codex["chamadas"]), {"Curie", "Galileo"})
conferir("task_complete herdado não fabrica retorno de agente ainda ativo",
         (codex["retornos"].get("Curie"), codex["retornos"].get("Galileo")), (1, 0))
conferir("a aresta do segundo nível sai do dono verdadeiro do rollout",
         codex["arestas"].get(("Curie", "agente", "Galileo")), 1)
conferir("caminhos internos dos agentes não chegam ao estado público",
         "/root/" in str(codex), False)
shutil.rmtree(tmp_codex, ignore_errors=True)

print("\n--- retorno de agente: o que conta é o RELATÓRIO, não o lançamento")
# ‼️ O CASO QUE ESTE BLOCO EXISTE PRA REPROVAR é o primeiro: até 10/09/2026 o
# coletor contava como retorno QUALQUER tool_result da chamada, e 936 dos 1.020
# resultados medidos eram o recibo `Async agent launched successfully`. A tela
# escrevia 99,7% de retorno medindo LANÇAMENTO. Se o primeiro caso voltar a
# passar, a régua morreu de novo e este teste tem que gritar.
tmp_claude = Path(tempfile.mkdtemp())
tmp_sem_codex = Path(tempfile.mkdtemp())
projeto_teste = tmp_claude / "-projeto-de-teste"
projeto_teste.mkdir()


def chamada(ident, alvo, quando="2026-09-10T10:00:00Z"):
    return json.dumps({
        "timestamp": quando, "type": "assistant",
        "message": {"role": "assistant", "content": [
            {"type": "tool_use", "id": ident, "name": "Agent",
             "input": {"subagent_type": alvo, "description": "x"}},
        ]},
    }) + "\n"


def resultado(ident, texto, erro=False):
    return json.dumps({
        "timestamp": "2026-09-10T10:00:01Z", "type": "user",
        "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": ident, "is_error": erro,
             "content": texto},
        ]},
    }) + "\n"


def notificacao(ident, status="completed", de_agente=True):
    usa = "<usage><subagent_tokens>900</subagent_tokens></usage>" if de_agente else ""
    corpo = (
        "<task-notification>"
        + (f"<tool-use-id>{ident}</tool-use-id>" if ident else "")
        + f"<status>{status}</status><summary>x</summary><result>relatório</result>"
        + usa + "</task-notification>"
    )
    return json.dumps({
        "timestamp": "2026-09-10T10:30:00Z", "type": "user",
        "message": {"role": "user", "content": [{"type": "text", "text": corpo}]},
    }) + "\n"


RECIBO = (
    "Async agent launched successfully. (This tool result is internal metadata)\n"
    "agentId: abc123def456 (internal ID)\n"
)
(projeto_teste / "sessao.jsonl").write_text(
    # 1. lançou e NUNCA voltou: é o caso que o instrumento antigo contava
    chamada("toolu_soLancou", "so-lancou") + resultado("toolu_soLancou", RECIBO)
    # 2. lançou e o relatório chegou depois, por notificação
    + chamada("toolu_voltou", "voltou") + resultado("toolu_voltou", RECIBO)
    + notificacao("toolu_voltou")
    # 3. agente síncrono: o relatório chega no próprio tool_result, e essa linha
    #    não cita subagent_type nem agentId. Sem a quarta porta do prefiltro ela
    #    nem seria aberta, e este retorno de verdade sumiria.
    + chamada("toolu_sincrono", "sincrono")
    + resultado("toolu_sincrono", "Análise completa. Segue o relatório para operação.")
    # 4. a chamada falhou na largada: resultado existe e é erro, não é retorno
    + chamada("toolu_erro", "com-erro")
    + resultado("toolu_erro", "Agent failed to start", erro=True)
    # 5. o agente foi morto: a notificação existe e o status não é completed
    + chamada("toolu_morto", "morto") + resultado("toolu_morto", RECIBO)
    + notificacao("toolu_morto", status="killed")
    # 6. comando de fundo que terminou: notificação sem subagent_tokens. Ela cita
    #    o id de uma chamada de agente e mesmo assim não pode virar retorno.
    + chamada("toolu_bash", "com-bash") + resultado("toolu_bash", RECIBO)
    + notificacao("toolu_bash", de_agente=False)
    # 7. notificação de agente SEM id de chamada: não casa com ninguém e vira o
    #    tamanho declarado do buraco, nunca um retorno atribuído a chute
    + notificacao(None),
    encoding="utf-8",
)
conv = c.ler_convocacoes(projetos=tmp_claude, sessoes_codex=tmp_sem_codex)
ret = conv["retornos_por_agente"]
conferir("‼️ recibo de lançamento NÃO é retorno", ret.get("so-lancou", 0), 0)
conferir("notificação de agente concluído É retorno", ret.get("voltou"), 1)
conferir("relatório de agente síncrono É retorno", ret.get("sincrono"), 1)
conferir("resultado com is_error NÃO é retorno", ret.get("com-erro", 0), 0)
conferir("agente morto NÃO é retorno", ret.get("morto", 0), 0)
conferir("notificação de comando de fundo NÃO é retorno", ret.get("com-bash", 0), 0)
conferir("notificação sem id vira buraco declarado, não retorno",
         (conv["retornos_sem_par"], sum(ret.values())), (1, 2))
conferir("as sete chamadas continuam contadas como convocação",
         conv["por_agente"], {"so-lancou": 1, "voltou": 1, "sincrono": 1,
                              "com-erro": 1, "morto": 1, "com-bash": 1})
conferir("fixture Agent não deixa o total de convocações zerar",
         conv["total"], sum(conv["por_agente"].values()))
shutil.rmtree(tmp_claude, ignore_errors=True)
shutil.rmtree(tmp_sem_codex, ignore_errors=True)

print("\n--- modelo resolvido: contagem por rótulo, e o piso quando falta")
# `resolvedModel` mora no `toolUseResult` DA LINHA (nao dentro do bloco
# tool_result), entao o teste escreve o campo no nivel certo, do jeito que o
# harness de verdade escreve. Se este teste passasse com o campo no lugar
# errado, ele nao provaria nada sobre o coletor real.
tmp_modelo = Path(tempfile.mkdtemp())
tmp_sem_codex_modelo = Path(tempfile.mkdtemp())
projeto_modelo = tmp_modelo / "-projeto-modelo"
projeto_modelo.mkdir()


def resultado_agente(ident, texto, modelo=None, erro=False):
    linha = {
        "timestamp": "2026-09-19T10:00:01Z", "type": "user",
        "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": ident, "is_error": erro, "content": texto},
        ]},
    }
    if modelo is not None:
        linha["toolUseResult"] = {"resolvedModel": modelo}
    return json.dumps(linha) + "\n"


(projeto_modelo / "sessao.jsonl").write_text(
    # 1 e 2: dois modelos distintos não podem se misturar num rótulo só
    chamada("toolu_m_sonnet", "com-sonnet")
    + resultado_agente("toolu_m_sonnet", "ok", modelo="claude-sonnet-5")
    + chamada("toolu_m_opus", "com-opus")
    + resultado_agente("toolu_m_opus", "ok", modelo="claude-opus-5")
    # 3: carimbo de data no id do modelo tem que cair na MESMA família de
    #    quem não tem data, senão o snapshot do dia vira "modelo novo" sozinho
    + chamada("toolu_m_haiku", "com-haiku")
    + resultado_agente("toolu_m_haiku", "ok", modelo="claude-haiku-4-5-20251001")
    # 4: resultado sem toolUseResult nenhum. Conta no total de convocações,
    #    mas fica de fora do por_modelo: é o PISO que o docstring declara.
    + chamada("toolu_m_sem_modelo", "sem-modelo")
    + resultado("toolu_m_sem_modelo", "ok, sem toolUseResult.resolvedModel")
    # 5: toolUseResult existe mas é de outra coisa (ex.: metadado de outra
    #    ferramenta) — não pode virar rótulo "None" nem quebrar a coleta.
    + chamada("toolu_m_invalido", "com-invalido")
    + json.dumps({
        "timestamp": "2026-09-19T10:00:01Z", "type": "user",
        "message": {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "toolu_m_invalido", "content": "ok"},
        ]},
        "toolUseResult": {"stdout": "isto não é resolvedModel"},
    }) + "\n",
    encoding="utf-8",
)
conv_modelo = c.ler_convocacoes(projetos=tmp_modelo, sessoes_codex=tmp_sem_codex_modelo)
conferir("cada modelo simples vira o próprio rótulo, sem se misturar",
         (conv_modelo["por_modelo"].get("sonnet-5"), conv_modelo["por_modelo"].get("opus-5")), (1, 1))
conferir("carimbo de data some do rótulo (mesma família de modelo)",
         conv_modelo["por_modelo"].get("haiku-4-5"), 1)
conferir("chamada sem resolvedModel conta no total e fica de fora do por_modelo",
         ("sem-modelo" in conv_modelo["por_agente"], conv_modelo["por_modelo"].get("sem-modelo")),
         (True, None))
conferir("toolUseResult de outra coisa não vira rótulo nenhum (só 3 rótulos reais)",
         sum(conv_modelo["por_modelo"].values()), 3)
conferir("_rotulo_modelo nunca esconde um id fora do formato esperado",
         c._rotulo_modelo("gpt-5-mini"), "gpt-5-mini")
shutil.rmtree(tmp_modelo, ignore_errors=True)
shutil.rmtree(tmp_sem_codex_modelo, ignore_errors=True)

print("\n--- cobranças: agrega e descarta identificação")
amostra_cobrancas = lambda: {"overdueInvoices": [{"id": "inv-secreta", "clientName": "Pessoa Teste", "phone": "5511999999999", "amount": "100.50", "currency": "BRL", "dueDate": "2026-09-01"}, {"id": "inv-2", "clientName": "Outra Pessoa", "amount": 20, "currency": "BRL", "dueDate": "2026-08-01"}], "overdueClients": [{"name": "Pessoa Teste"}, {"name": "Outra Pessoa"}]}
cobrancas = c.ler_cobrancas(amostra_cobrancas)
conferir("conta faturas e clientes", (cobrancas["faturas_atrasadas"], cobrancas["clientes_atrasados"]), (2, 2))
conferir("soma somente o total agregado", cobrancas["por_moeda"][0]["total"], 120.5)
saida_cobrancas = str(cobrancas)
conferir("não leva nome, telefone ou id para o estado", not any(x in saida_cobrancas for x in ["Pessoa Teste", "Outra Pessoa", "5511999999999", "inv-secreta"]), True)
falha_cobrancas = c.ler_cobrancas(lambda: (_ for _ in ()).throw(TimeoutError()))
conferir("falha de acesso não vira zero", (falha_cobrancas["status"], falha_cobrancas["faturas_atrasadas"]), ("erro", None))

print("\n--- follow-up: estado interno não se disfarça de entrega")
tmp_followup = Path(tempfile.mkdtemp())
estado_followup = tmp_followup / "estado.json"
log_followup = tmp_followup / "followup.log"
estado_followup.write_text(json.dumps({
    "5511999999999": {"enviados": ["30min", "3h", "fora_da_janela_24h"], "recusou": "sim"},
    "5511888888888": {"enviados": ["30min", "carimbado_corte_25_08"], "despediu": "sim"},
    "_ritmo": {"ultimo_envio": 1},
}), encoding="utf-8")
log_followup.write_text(
    "2026-09-08T10:00:00 5511*****9999: toque 30min enviado (morno)\n"
    "2026-09-08T10:01:00 5511*****8888: toque 30min barrado\n",
    encoding="utf-8",
)
followup = c.ler_followup(estado_followup, log_followup)
conferir("conta contatos sem publicar identificadores", followup["contatos_no_estado"], 2)
conferir("separa etapa consumida de envio confirmado no log", (followup["etapas_consumidas"], followup["envios_registrados_no_log"]), (3, 1))
conferir("resume recusas e despedidas", (followup["recusas_registradas"], followup["despedidas_registradas"]), (1, 1))
conferir("nenhum telefone chega ao estado", "5511" in str(followup), False)
falha_followup = c.ler_followup(tmp_followup / "ausente", log_followup)
conferir("falha de leitura não vira zero", (falha_followup["status"], falha_followup["contatos_no_estado"]), ("erro", None))
shutil.rmtree(tmp_followup, ignore_errors=True)
shutil.rmtree(tmp.parent, ignore_errors=True)

print("\n--- e a trava tem que REPROVAR de verdade: caso de controle negativo")
c.NOMES_CLIENTE, c.NEGACAO = c.carregar_nomes_de_cliente(Path("/nao/existe/clientes.md"))
c.NEGACAO["carregada"] = True  # lista vazia fingindo estar carregada
vazou = c.rotulo_do_job("/opt/x/run.sh # lembrete consulta 24h Dr. Exemplo")
conferir("com a lista VAZIA o nome passa (e por isso a lista nao pode falhar calada)",
         vazou, "lembrete consulta 24h Dr. Exemplo")
c.NOMES_CLIENTE, c.NEGACAO = guarda


# ---------------------------------------------------------------------------
# LEITURA DO VERIFICADOR
# O parse era UM regex so: faltar INDETERMINADAS, trocar a ordem, escrever
# "VALIDO ATE" com acento ou a hora em BRT apagava os tres numeros de uma vez,
# em silencio, e a Topbar pintava a ausencia de verde.
# ---------------------------------------------------------------------------
print("\n--- leitura do verificador")

MOLDE = """VERIFICADOR - ultimo resultado
RODADA .....: 08/09/2026 10:46:10 UTC
VALIDO ATE .: {ate}
{resumo}

REPROVADAS (e ha quanto tempo):
  x nenhum post saiu mais de 15min fora da hora agendada
      desde 07/09/2026 18:02 (0.7 dia(s), 21 rodada(s))
"""


def ler(nome, resumo="CHECAGENS ..: 51   REPROVADAS: 6   INDETERMINADAS: 0",
        ate="08/09/2026 15:07 UTC", corpo=None):
    arq = Path(tempfile.mkdtemp()) / "ULTIMO.txt"
    arq.write_text(MOLDE.format(resumo=resumo, ate=ate) if corpo is None else corpo,
                   encoding="utf-8")
    v = c.ler_verificador(arq)
    print(f"       [{nome}] checagens={v['checagens']} reprovadas={v['reprovadas']} "
          f"indet={v['indeterminadas']} vencido={v['vencido']} erro={v['erro_leitura']!r}")
    shutil.rmtree(arq.parent, ignore_errors=True)
    return v

v = ler("formato de hoje")
conferir("formato de hoje: os tres numeros", (v["checagens"], v["reprovadas"], v["indeterminadas"]), (51, 6, 0))
conferir("formato de hoje: sem erro de leitura", v["erro_leitura"], None)
conferir("formato de hoje: a falha veio com o texto", len(v["falhas"]), 1)

v = ler("VALIDO ATE acentuado", ate="08/09/2026 15:07 UTC".replace("08", "08"))
v = ler("acentuado", corpo=MOLDE.format(resumo="CHECAGENS ..: 51   REPROVADAS: 6   INDETERMINADAS: 0",
                                        ate="09/09/2026 15:07 UTC").replace("VALIDO ATE", "VÁLIDO ATÉ"))
conferir("VÁLIDO ATÉ acentuado ainda e lido", v["valido_ate"], "09/09/2026 15:07 UTC")
conferir("e os numeros continuam de pe", v["checagens"], 51)

v = ler("ordem trocada", resumo="REPROVADAS: 6   INDETERMINADAS: 0   CHECAGENS ..: 51")
conferir("ordem trocada: os tres numeros", (v["checagens"], v["reprovadas"], v["indeterminadas"]), (51, 6, 0))

v = ler("sem INDETERMINADAS", resumo="CHECAGENS ..: 51   REPROVADAS: 6")
conferir("sem INDETERMINADAS os outros dois sobrevivem", (v["checagens"], v["reprovadas"]), (51, 6))
conferir("e o motivo sai escrito", "INDETERMINADAS" in (v["erro_leitura"] or ""), True)

# BRT tem que DECIDIR diferente de UTC, senao o teste passa por empate.
# O instante e sempre "daqui a 2h", entao a resposta nao depende do relogio:
# lido como BRT (-03) ainda nao venceu; lido como UTC, venceu ha 1h.
daqui_2h = c.agora_utc() + datetime.timedelta(hours=2)
em_brt = (daqui_2h - datetime.timedelta(hours=3)).strftime("%d/%m/%Y %H:%M")
conferir("hora em BRT nao venceu", ler("BRT", ate=f"{em_brt} BRT")["vencido"], False)
conferir("a MESMA hora lida como UTC teria vencido (a regua distingue)",
         ler("mesmo numero, marcado UTC", ate=f"{em_brt} UTC")["vencido"], True)

v = ler("fuso desconhecido", ate="08/09/2026 15:07 XPTO")
conferir("fuso que eu nao conheco nao vira UTC por conta propria", v["vencido"], None)
conferir("e diz por que", "fuso" in (v["erro_leitura"] or ""), True)

v = ler("arquivo em branco", corpo="")
conferir("arquivo vazio: numero nenhum", (v["checagens"], v["reprovadas"], v["indeterminadas"]), (None, None, None))
conferir("arquivo vazio: e o motivo NAO e None", bool(v["erro_leitura"]), True)

v = c.ler_verificador(Path("/nao/existe/ULTIMO.txt"))
conferir("arquivo que nao existe diz que nao existe", bool(v["erro_leitura"]), True)
conferir("e nao inventa numero", v["checagens"], None)

print("\n--- isolamento de tarefas pessoais: ler_tarefas e TAREFAS_BASE removidos")
conferir("ler_tarefas foi removido do coletor", hasattr(c, "ler_tarefas"), False)
conferir("TAREFAS_BASE foi removido do coletor", hasattr(c, "TAREFAS_BASE"), False)
conferir("redigir_texto_livre mascara telefone com 4 últimos dígitos", c.redigir_texto_livre("Ligar (11) 98765-4321", manter_ultimos_4_tel=True), "Ligar [tel:...4321]")
conferir("redigir_texto_livre sanitiza caminhos absolutos", c.redigir_texto_livre("Salvar em /opt/gastaomatos/dados"), "Salvar em [caminho]")

print("\n--- descoberta de agentes: mapeamento de squads e comercial-squad")
pasta_temp_ag = Path(tempfile.mkdtemp())
try:
    pasta_global_fake = pasta_temp_ag / "global"
    pasta_global_fake.mkdir()
    (pasta_global_fake / "agente_raiz.md").write_text("---\nname: raiz\ndescription: Agente raiz global\n---\nCorpo", encoding="utf-8")

    # Subpasta comercial-squad
    com_sq = pasta_global_fake / "comercial-squad" / "agents"
    com_sq.mkdir(parents=True)
    (com_sq / "elza.md").write_text("---\nname: elza\ndescription: Diretora comercial e orquestração\n---\nCorpo", encoding="utf-8")
    (com_sq / "otto-radar.md").write_text("---\nname: otto-radar\ndescription: Radar comercial\n---\nCorpo", encoding="utf-8")
    (com_sq / "zara-triagem.md").write_text("---\nname: zara-triagem\ndescription: Triagem comercial\n---\nCorpo", encoding="utf-8")

    # Subpasta desconhecida
    desc_sq = pasta_global_fake / "outro-squad" / "agents"
    desc_sq.mkdir(parents=True)
    (desc_sq / "novo-agente.md").write_text("---\nname: novo-agente\ndescription: Agente outro\n---\nCorpo", encoding="utf-8")

    # Pasta sem frontmatter name
    (com_sq / "sem-name.md").write_text("---\ndescription: Sem name\n---\nCorpo", encoding="utf-8")

    codex_arquivado = pasta_temp_ag / "codex-arquivado"
    codex_arquivado.mkdir()
    (codex_arquivado / "cont-arquivado.toml").write_text(
        'name = "cont_arquivado"\ndescription = "Agente arquivado"\n',
        encoding="utf-8",
    )

    desc_achados = c.descobrir_agentes(pasta_codex=codex_arquivado, pasta_global=pasta_global_fake)
    mapa_achados = {a["id"]: a for a in desc_achados}

    conferir("elza classificada como squad comercial", mapa_achados.get("elza", {}).get("squad"), "comercial")
    conferir("elza marcada como regente", mapa_achados.get("elza", {}).get("regente"), True)
    conferir("otto-radar classificado como squad comercial", mapa_achados.get("otto-radar", {}).get("squad"), "comercial")
    conferir("zara-triagem classificado como squad comercial", mapa_achados.get("zara-triagem", {}).get("squad"), "comercial")
    conferir("total de agentes sem duplicação", len(desc_achados), 5)
    conferir("pasta desconhecida classificada como desconhecido", mapa_achados.get("novo-agente", {}).get("squad"), "desconhecido")
    conferir("agente da raiz classificado como global", mapa_achados.get("raiz", {}).get("squad"), "global")
    conferir("arquivo sem name: descartado", "sem-name" in mapa_achados, False)
    squad_arquivado = "pipeline" + "-luana"
    conferir("squad arquivado saiu da fonte canônica", squad_arquivado in c.SQUADS, False)
    conferir("manifesto Codex local arquivado não entra no catálogo", "cont-arquivado" in mapa_achados, False)
    conferir("nenhum agente sai no squad arquivado", any(a.get("squad") == squad_arquivado for a in desc_achados), False)
    squads_publicados = c.squads_com_agentes(desc_achados)
    conferir("squad sem agentes não é emitido", "conteudo" in squads_publicados, False)
    # ‼️ CORRIGIDO 25/09/2026 (commit 0ab0066): esta lista costumava ser
    # ["comercial", "global"], sem "desconhecido", porque a chave "desconhecido"
    # ainda nao existia em SQUADS e squads_com_agentes so itera o CATALOGO
    # (nao a lista de agentes). O agente "novo-agente" (pasta nao mapeada) saia
    # com squad="desconhecido" mas esse squad nunca aparecia em estado.squads —
    # e web/src/dados/validar.ts:58 rejeita o estado INTEIRO quando o squad de
    # um agente nao esta entre as chaves de estado.squads ("esquadrao
    # desconhecido"). Ou seja: o teste antigo aprovava exatamente o formato que
    # derrubava o painel. Agora "desconhecido" tem entrada propria em SQUADS
    # ("Não catalogado"), entao ela E EMITIDA quando tem agente — e tem que
    # ser, e o teste abaixo prova o motivo.
    conferir("squad com agentes continua emitido",
             sorted(squads_publicados), ["comercial", "desconhecido", "global"])

    # NOVO 25/09/2026: pasta de squad nao mapeada nao pode mais derrubar o
    # painel. O par que a trava do validador exige (visto em validar.ts):
    # (1) todo agente com squad="desconhecido" existe de verdade aqui, e
    # (2) esse squad aparece em estado.squads (senao vira "esquadrao
    # desconhecido" e o validador recusa o estado todo).
    conferir("pasta de squad nao mapeada gera agente com squad desconhecido",
             mapa_achados.get("novo-agente", {}).get("squad"), "desconhecido")
    conferir("e esse squad aparece em estado.squads, senao o validador recusa",
             "desconhecido" in squads_publicados, True)
    conferir("com o rotulo 'Não catalogado' (o validador so exige a chave, "
             "mas o rotulo e o que garante que ele nao fica emitido mudo)",
             squads_publicados.get("desconhecido", {}).get("nome"), "Não catalogado")
finally:
    shutil.rmtree(pasta_temp_ag)

print("\n--- fiscal comercial: métricas agregadas sem texto, lead ou PII")
# Caso 1: sem arquivos (falha suave sem zero inventado)
f_vazio = c.ler_fiscal_comercial(caminho_agregado=Path("/nao/existe/agregado.json"), caminho_pipeline=Path("/nao/existe/pipeline.jsonl"))
conferir("sem arquivos: status sem_dado", f_vazio["status"], "sem_dado")
conferir("sem arquivos: meta sem dado explicito", f_vazio["meta_agendamentos"]["texto"], "sem dado, Hugo ainda não mediu")
conferir("sem arquivos: totais são None e não zero", (f_vazio["total_passa"], f_vazio["total_bloqueia"]), (None, None))

# Caso 2: com pipeline.jsonl fixture contendo dados e textos que NÃO podem vazar
pasta_temp_fisc = Path(tempfile.mkdtemp())
try:
    pipe_fake = pasta_temp_fisc / "pipeline.jsonl"
    linhas_pipe = [
        # Linha normal de fiscal com checagens
        json.dumps({
            "etapa": "fiscal",
            "status": "PASSA",
            "texto": "Texto proibido da peça do lead João da Silva (11) 98765-4321",
            "lead": {"nome": "João da Silva", "telefone": "11987654321"},
            "checagens": [
                {"checagem": "C1", "status": "PASSA"},
                {"checagem": "C2", "status": "PASSA"},
                {"checagem": "S1", "status": "PASSA"},
            ]
        }),
        # Linha com BLOQUEIA
        json.dumps({
            "etapa": "fiscal",
            "status": "BLOQUEIA",
            "texto": "Outro texto confidencial",
            "correcoes_pedidas": ["Remover promessa exagerada"],
            "checagens": [
                {"checagem": "C1", "status": "PASSA"},
                {"checagem": "C2", "status": "BLOQUEIA"},
            ]
        }),
        # Linha de outra etapa (não deve ser contada no fiscal)
        json.dumps({
            "etapa": "operador",
            "status": "PASSA",
            "texto": "Etapa operador"
        })
    ]
    pipe_fake.write_text("\n".join(linhas_pipe), encoding="utf-8")

    f_pipe = c.ler_fiscal_comercial(caminho_pipeline=pipe_fake)
    conferir("pipeline: status pronto", f_pipe["status"], "pronto")
    conferir("pipeline: total_passa = 1", f_pipe["total_passa"], 1)
    conferir("pipeline: total_bloqueia = 1", f_pipe["total_bloqueia"], 1)
    conferir("pipeline: checagem_mais_disparada é C2", f_pipe["checagem_mais_disparada"], "C2")

    # Auditoria de privacidade e vazamento
    dump_pipe = json.dumps(f_pipe)
    conferir("NENHUM texto de peça vaza no fiscal", "Texto proibido" in dump_pipe or "Outro texto" in dump_pipe, False)
    conferir("NENHUM nome de lead vaza no fiscal", "João" in dump_pipe or "Silva" in dump_pipe, False)
    conferir("NENHUM telefone vaza no fiscal", "98765" in dump_pipe, False)
    conferir("NENHUMA chave texto ou correcoes_pedidas", "correcoes_pedidas" in dump_pipe, False)
    conferir("auditar_estado_publico aprova o retorno do fiscal", c.auditar_estado_publico(f_pipe), [])
    conferir("meta de agendamentos continua com aviso do Hugo", f_pipe["meta_agendamentos"]["texto"], "sem dado, Hugo ainda não mediu")

    # Caso 3: com agregado.json
    agregado_fake = pasta_temp_fisc / "agregado.json"
    agregado_fake.write_text(json.dumps({
        "por_checagem": [
            {"checagem": "C1", "passa": 10, "bloqueia": 1},
            {"checagem": "C2", "passa": 8, "bloqueia": 3}
        ],
        "total_passa": 18,
        "total_bloqueia": 4,
        "checagem_mais_disparada": "C2"
    }), encoding="utf-8")
    f_agr = c.ler_fiscal_comercial(caminho_agregado=agregado_fake)
    conferir("agregado: status pronto", f_agr["status"], "pronto")
    conferir("agregado: total_passa = 18", f_agr["total_passa"], 18)
    conferir("agregado: total_bloqueia = 4", f_agr["total_bloqueia"], 4)
    conferir("agregado: checagem_mais_disparada = C2", f_agr["checagem_mais_disparada"], "C2")
finally:
    shutil.rmtree(pasta_temp_fisc)

print("\n--- mapa interativo horizontal do setor comercial")
wf_com = c.gerar_workflow_setor_comercial()
conferir("workflow comercial schema_version é 2", wf_com.get("schema_version"), 2)
conferir("workflow comercial tem 5 fases", len(wf_com.get("phases", [])), 5)
conferir("workflow comercial tem os 2 gates de segurança do Gastão",
         any(n.get("id") == "gastao_plano" for n in wf_com.get("nodes", [])) and
         any(n.get("id") == "gastao_textos" for n in wf_com.get("nodes", [])), True)
html_com = c.renderizar_html_workflow_setor_comercial(wf_com)
conferir("mapa comercial html gerado é documento válido", "<!DOCTYPE html>" in html_com and "Setor comercial" in html_com, True)

print("\n--- fila persistente de aprovações")
pasta_ap = Path(tempfile.mkdtemp())
fila_ap = pasta_ap / "aprovacoes.json"
fila_ap.write_text('{"versao":1,"itens":[]}', encoding="utf-8")
ap = c.ler_aprovacoes(fila_ap)
conferir("vazio real tem total zero e sem erro", (ap["total"], ap["erro"]), (0, None))
fila_ap.write_text(json.dumps({"versao": 1, "itens": [{"id": "teste_isolado_1", "estado": "aguardando", "tipo": "conteudo", "criado_em": "2026-09-08T22:00:00Z", "origem": "teste"}]}), encoding="utf-8")
ap = c.ler_aprovacoes(fila_ap)
conferir("item isolado entra aguardando, sem mudar estado", (ap["total"], ap["por_estado"].get("aguardando"), ap["itens"][0]["estado"]), (1, 1, "aguardando"))
fila_ap.write_text('{"versao":1,"itens":[{"id":"curto","estado":"inventado"}]}', encoding="utf-8")
ap = c.ler_aprovacoes(fila_ap)
conferir("contrato inválido falha fechado, sem zero", (ap["total"], bool(ap["erro"]), ap["itens"]), (None, True, []))
shutil.rmtree(pasta_ap)

print("\n--- contrato analítico isolado por marca")
an = c.agregar_analitica([
    {"marca": "gastaomatos", "status": "postado", "formato": "reel", "canais": ["instagram"], "links_publicados": {"instagram": "https://exemplo/1"}},
    {"marca": "cliente-a", "status": "postado", "formato": "imagem", "canais": ["instagram"], "links_publicados": {"instagram": "https://exemplo/2"}},
    {"status": "postado", "formato": "carrossel", "canais": ["linkedin"]},
])
conferir("só a marca própria entra", (an["total"], an["por_formato"]), (1, {"reel": 1}))
conferir("link é cobertura, não insight inventado", (an["links_publicados"]["instagram"], an["meta"]["metricas"]), (1, None))
conferir("Meta sem conector falha fechado", an["meta"]["estado"], "bloqueado")

print("\n--- diretiva: fonte canônica e falha fechada")
from diretiva import carregar as carregar_diretiva, gravar_atomico
pasta_di = Path(tempfile.mkdtemp())
arquivo_di = pasta_di / "diretiva.json"
diretiva_teste = {"versao": 1, "status": "ativa", "objetivo": "Concluir o painel", "prazo": "2026-09-09", "criada_em": "2026-09-08T22:11:23Z", "atualizada_em": "2026-09-08T22:11:23Z", "origem": {"canal": "telegram", "mensagem_id": "9412"}}
gravar_atomico(arquivo_di, diretiva_teste)
di = carregar_diretiva(arquivo_di)
conferir("diretiva válida preserva objetivo, prazo e origem", (di["objetivo"], di["prazo"], di["origem"]["mensagem_id"]), ("Concluir o painel", "2026-09-09", "9412"))
antes = arquivo_di.read_text(encoding="utf-8")
try:
    gravar_atomico(arquivo_di, {**diretiva_teste, "status": "qualquer"})
except ValueError:
    pass
conferir("atualização inválida não toca na diretiva anterior", arquivo_di.read_text(encoding="utf-8"), antes)
arquivo_di.write_text('{"versao":1,"status":"qualquer"}', encoding="utf-8")
di = carregar_diretiva(arquivo_di)
conferir("diretiva inválida falha fechado", (di["status"], di["objetivo"], bool(di["erro"])), ("erro", None, True))
shutil.rmtree(pasta_di)

print("\n--- janelas de convocações e mapa interativo")
agora_ref = datetime.datetime(2026, 9, 24, 15, 0, 0, tzinfo=c.FUSO_SP)
chamadas_teste = [
    # Hoje (2h atrás)
    ("luana", "agente", "copywriter", (agora_ref - datetime.timedelta(hours=2)).isoformat()),
    # 3 dias atrás
    ("renato", "agente", "designer", (agora_ref - datetime.timedelta(days=3)).isoformat()),
    # 15 dias atrás
    ("bia", "agente", "estrategista", (agora_ref - datetime.timedelta(days=15)).isoformat()),
    # 45 dias atrás
    ("luana", "agente", "copywriter", (agora_ref - datetime.timedelta(days=45)).isoformat()),
]
ids_casa = {"luana", "renato", "bia", "copywriter", "designer", "estrategista"}
janelas = c.agregar_janelas_convocacoes(chamadas_teste, ids_casa, agora_referencia=agora_ref)

conferir("hoje conta menos que total no resumo", janelas["hoje"]["total"] < janelas["total"]["total"], True)
conferir("hoje conta menos que total no por_agente", janelas["hoje"]["por_agente"]["copywriter"] < janelas["total"]["por_agente"]["copywriter"], True)
conferir("hoje tem menos arestas que total", len(janelas["hoje"]["arestas"]) < len(janelas["total"]["arestas"]), True)
conferir("janelas passa na trava de privacidade sem vazar", c.auditar_estado_publico(janelas), [])

agentes_teste = [
    {"id": "luana", "nome": "Luana", "papel": "CEO"},
    {"id": "renato", "nome": "Renato", "papel": "CRO"},
    {"id": "bia", "nome": "Bia", "papel": "Diretora"},
    {"id": "copywriter", "nome": "Copywriter", "papel": "Copy", "squad": "conteudo"},
    {"id": "designer", "nome": "Designer", "papel": "Artes", "squad": "design"},
]
squads_teste = {
    "conteudo": {"nome": "Conteúdo"},
    "design": {"nome": "Design"},
}
wf_hoje = c.gerar_workflow_quem_convoca_quem("hoje", janelas["hoje"], agentes_teste, squads_teste)
conferir("workflow schema_version é 2", wf_hoje.get("schema_version"), 2)
conferir("arestas sem chamadas não aparecem no workflow", all(not str(e.get("label", "")).startswith("0 chamada") for e in wf_hoje.get("edges", [])), True)
conferir("workflow mantém os três diretores mesmo com zero chamadas na janela",
         [n["id"] for n in wf_hoje.get("nodes", []) if n.get("lane") == "diretoria"],
         ["luana", "renato", "bia"])
renato_wf = next((n for n in wf_hoje.get("nodes", []) if n.get("id") == "renato"), {})
conferir("workflow mantém Renato na diretoria", renato_wf.get("lane"), "diretoria")
html_hoje = c.renderizar_html_workflow_quem_convoca_quem(wf_hoje)
conferir("mapa html gerado é documento válido", "<!DOCTYPE html>" in html_hoje and "<svg" in html_hoje, True)
conferir("mapa html colore Renato de laranja", f'stroke="{c.COR_RENATO}"' in html_hoje, True)

janela_origem_luana = {
    "rotulo": "Origem capitalizada",
    "total": 2,
    "por_agente": {"copywriter": 2},
    "convocacoes_fora_da_casa": {},
    "arestas": [{"de": "Luana", "de_tipo": "sessao", "para": "copywriter", "vezes": 2}],
}
wf_origem_luana = c.gerar_workflow_quem_convoca_quem("teste", janela_origem_luana, agentes_teste, squads_teste)
conferir("workflow não zera arestas de sessão Luana capitalizada",
         [(e.get("from"), e.get("to"), e.get("label")) for e in wf_origem_luana.get("edges", [])],
         [("luana", "copywriter", "2 chamadas")])

agentes_mapa_largo = [
    {"id": "luana", "nome": "Luana", "papel": "CEO"},
    {"id": "renato", "nome": "Renato", "papel": "CRO"},
    {"id": "bia", "nome": "Bia", "papel": "Diretora"},
]
agentes_mapa_largo.extend({"id": f"global-{i}", "nome": f"Global {i}", "squad": "global"} for i in range(18))
agentes_mapa_largo.extend({"id": f"conteudo-{i}", "nome": f"Conteúdo {i}", "squad": "conteudo"} for i in range(8))
agentes_mapa_largo.extend({"id": f"comercial-{i}", "nome": f"Comercial {i}", "squad": "comercial"} for i in range(6))
janela_mapa_largo = {
    "rotulo": "Teste largo",
    "total": len(agentes_mapa_largo),
    "por_agente": {},
    "convocacoes_fora_da_casa": {"fora": 2},
    "arestas": [{"de": "luana", "de_tipo": "sessao", "para": ag["id"], "vezes": 1} for ag in agentes_mapa_largo if ag["id"] not in {"luana", "renato", "bia"}],
}
wf_largo = c.gerar_workflow_quem_convoca_quem("teste", janela_mapa_largo, agentes_mapa_largo, c.SQUADS)
cols_largas = {}
for node in wf_largo.get("nodes", []):
    if node.get("lane") != "diretoria":
        cols_largas[node.get("col")] = cols_largas.get(node.get("col"), 0) + 1
conferir("workflow horizontal usa as cinco colunas à direita", sorted(cols_largas), [1, 2, 3, 4, 5])
conferir("workflow evita coluna vertical comprida", max(cols_largas.values()), 8)

print("\n--- sessões de diretoras sempre visíveis")
conferir("catálogo de sessão tem os três diretores", [s["id"] for s in c.SESSAO], ["luana", "renato", "bia"])
tmp_sessao = Path(tempfile.mkdtemp())
try:
    pasta_bia = tmp_sessao / "casa" / "bia"
    projetos = tmp_sessao / "projects"
    projeto_bia = projetos / c._projeto_claude_da_pasta(pasta_bia)
    projeto_bia.mkdir(parents=True)
    antigo = projeto_bia / "antigo.jsonl"
    velho = projeto_bia / "velho.jsonl"
    novo = projeto_bia / "novo.jsonl"
    antigo.write_text("{}\n", encoding="utf-8")
    velho.write_text("{}\n", encoding="utf-8")
    novo.write_text("{}\n", encoding="utf-8")
    t_antigo = agora_ref.timestamp() - 7200
    t_velho = agora_ref.timestamp() - 3600
    t_novo = agora_ref.timestamp() - 900
    os.utime(antigo, (t_antigo, t_antigo))
    os.utime(velho, (t_velho, t_velho))
    os.utime(novo, (t_novo, t_novo))
    presenca = c.ler_presenca_sessao({"id": "bia", "pasta": pasta_bia}, projetos=projetos, agora=agora_ref, processos_claude=({"bia"}, None))
    esperado_ultima = datetime.datetime.fromtimestamp(t_novo, tz=datetime.timezone.utc).isoformat()
    conferir("presença usa só o jsonl raiz mais novo e processo vivo", (presenca["estado"], presenca["ultima_atividade"]), ("ativo", esperado_ultima))
    sem_processo = c.ler_presenca_sessao({"id": "bia", "pasta": pasta_bia}, projetos=projetos, agora=agora_ref, processos_claude=(set(), None))
    conferir("jsonl recente sem processo remoto não vira ativo", sem_processo["estado"], "ocioso")
    proc_indeterminado = c.ler_presenca_sessao({"id": "bia", "pasta": pasta_bia}, projetos=projetos, agora=agora_ref, processos_claude=(None, "falha sintética"))
    conferir("falha de /proc não vira ativo", (proc_indeterminado["estado"], proc_indeterminado["erro_atividade"]), ("indeterminado", "falha sintética"))
    conferir("presença não publica caminho", c.auditar_estado_publico(presenca), [])
finally:
    shutil.rmtree(tmp_sessao, ignore_errors=True)

print("\n--- leitura real de /proc: script-wrapper não engana, cmdline não é grepado")
tmp_proc = Path(tempfile.mkdtemp())
try:
    def _pid_fake(pid: int, argv: list[str]):
        d = tmp_proc / str(pid)
        d.mkdir()
        (d / "cmdline").write_bytes(b"\x00".join(a.encode("utf-8") for a in argv) + b"\x00")

    # Igual ao processo real da casa: script -qfec embrulha o comando inteiro
    # numa ÚNICA string (não dá pra casar "--remote-control" nela por espaço),
    # e o processo filho claude de verdade tem os args separados por NUL.
    _pid_fake(9001, [
        "/usr/bin/script", "-qfec",
        "/usr/local/bin/claude --model claude-sonnet-5 --continue --remote-control bia --channels plugin:telegram@x --dangerously-skip-permissions --debug",
        "/home/claude/bia-tty.log",
    ])
    _pid_fake(9002, [
        "/usr/local/bin/claude", "--model", "claude-sonnet-5", "--continue",
        "--remote-control", "bia", "--channels", "plugin:telegram@x",
        "--dangerously-skip-permissions", "--debug",
    ])
    # Renato só com o wrapper vivo (filho morreu): não pode contar como vivo,
    # senão o wrapper sozinho (que nunca casa por espaço) mascara um processo morto.
    _pid_fake(9003, [
        "/usr/bin/script", "-qfec",
        "/usr/local/bin/claude --model claude-sonnet-5 --continue --remote-control renato --channels plugin:telegram@x",
        "/home/claude/renato-tty.log",
    ])
    # Ruído: outro processo qualquer no /proc fake, não pode virar falso positivo.
    _pid_fake(9004, ["/usr/bin/bash", "-c", "sleep 100"])

    vivos, erro = c.ler_processos_claude_remotos(proc=tmp_proc)
    conferir("script-wrapper não confunde: só o processo filho claude real conta", vivos, {"bia"})
    conferir("leitura de /proc fake não erra", erro, None)
finally:
    shutil.rmtree(tmp_proc, ignore_errors=True)

print("\n--- uso do plano codex: parser de event_msg e isolamento de credits")
tmp_codex_dir = Path(tempfile.mkdtemp())
sess_dir = tmp_codex_dir / ".codex-luana" / "sessions"
sess_dir.mkdir(parents=True)
sess_file = sess_dir / "2026-09-25.jsonl"
linha_codex_event_msg = json.dumps({
    "type": "event_msg",
    "payload": {
        "type": "token_count",
        "info": {
            "total_token_usage": {"total_tokens": 4500},
            "last_token_usage": {"input_tokens": 300, "output_tokens": 150}
        },
        "rate_limits": {
            "primary": {"used_percent": 16.0, "window_minutes": 10080, "resets_at": 1790400000},
            "secondary": {"used_percent": 5.0, "window_minutes": 1440, "resets_at": 1790400000},
            "credits": {"balance": 99.99, "account_id": "segredo_vivos_nao_vaza"}
        }
    }
})
sess_file.write_text(linha_codex_event_msg + "\n", encoding="utf-8")

res_codex = c.ler_uso_planos_codex(pastas_sessoes=[sess_dir, tmp_codex_dir / "vazio2", tmp_codex_dir / "vazio3"])
conferir("codex primario_percentual lido de event_msg.payload", res_codex["primario_percentual"], 16.0)
conferir("codex tokens_24h_estimativa lido de info.total_token_usage", res_codex["tokens_24h_estimativa"], 4500)
conferir("codex credits vaza apenas has_credits (True)", res_codex["has_credits"], True)
conferir("uso_planos.codex passa na trava de privacidade sem vazar", c.auditar_estado_publico({"uso_planos_codex": res_codex}), [])

shutil.rmtree(tmp_codex_dir)

print("\n--- financeiro: allowlist e isolamento de PII (rodada 8)")
dados_sinteticos_financeiro = {
    "mrr": 15000.0,
    "periodToReceive": 8000.0,
    "periodReceived": 12000.0,
    "overdueAmount": 1500.0,
    "activeClients": 12,
    "overdueClients": 1,
    "contratosNovos": 2,
    "contratosEncerrados": 0,
    "displayCurrency": "BRL",
    "clientes_detalhados": [{"nome": "Cliente Vazado S.A.", "cnpj": "12.345.678/0001-99", "email": "contato@vazado.com"}],
    "recentInvoices": [{"id": "inv_123", "valor": 5000, "cliente_id": "cli_99"}],
    "secret_api_key": "sk_live_1234567890"
}
res_fin = c.ler_financeiro(buscar=lambda: dados_sinteticos_financeiro)
conferir("financeiro status é pronto com mock", res_fin["status"], "pronto")
conferir("financeiro mrr_atual lido corretamente", res_fin["mrr_atual"], 15000.0)
conferir("financeiro descarta clientes_detalhados (PII)", "clientes_detalhados" in res_fin, False)
conferir("financeiro descarta recentInvoices (PII)", "recentInvoices" in res_fin, False)
conferir("financeiro descarta secret_api_key", "secret_api_key" in res_fin, False)
conferir("financeiro passa 100% na trava de privacidade public-repo", c.auditar_estado_publico({"financeiro": res_fin}), [])

print("\n--- redes orgânicas: composio v3.1 e motivo linkedin (rodada 14)")
dados_sinteticos_redes = {
    "status": "pronto",
    "atualizado_em": "2026-09-25T12:00:00Z",
    "erro": None,
    "instagram": {
        "seguidores": 3500,
        "alcance_agregado": 1200,
        "salvamentos_agregado": None,
        "metricas_obtidas": ["followers_count", "reach"],
        "posts": [],
    },
    "linkedin": {
        "status": "sem_permissao",
        "motivo": "leitura de posts pessoais exige escopo r_member_social / Community Management API, não concedido nesta conexão",
        "metricas": None,
    },
}
res_redes = c.ler_redes_organicas(buscar=lambda: dados_sinteticos_redes)
conferir("redes status é pronto com mock", res_redes["status"], "pronto")
conferir("redes instagram seguidores lido", res_redes["instagram"]["seguidores"], 3500)
conferir("redes linkedin motivo atualizado", "r_member_social" in res_redes["linkedin"]["motivo"], True)
conferir("redes passa 100% na trava de privacidade public-repo", c.auditar_estado_publico({"redes": res_redes}), [])

print("\n--- GA4 (casaldotrafego.com): ok, sem credencial, erro de API e cache (rodada 25/09)")

# Números iguais aos medidos AO VIVO na entrega de 25/09/2026 (120/128/186 em
# 7 dias). São públicos (métrica agregada do próprio site do Gastão), servem
# de mock estável e continuam batendo com a execução real feita mais abaixo.
dados_sinteticos_ga4_ok = {
    "totais_7d": {"rows": [{"metricValues": [{"value": "120"}, {"value": "128"}, {"value": "186"}]}]},
    "totais_30d": {"rows": [{"metricValues": [{"value": "420"}, {"value": "460"}, {"value": "610"}]}]},
    "serie_diaria_30d": {
        "rows": [
            {"dimensionValues": [{"value": "20260902"}], "metricValues": [{"value": "15"}, {"value": "16"}, {"value": "22"}]},
            {"dimensionValues": [{"value": "20260901"}], "metricValues": [{"value": "12"}, {"value": "13"}, {"value": "19"}]},
        ]
    },
    "top_paginas": {
        "rows": [
            {"dimensionValues": [{"value": "/blog/como-usar-claude-code?utm_source=ig"}], "metricValues": [{"value": "85"}]},
            {"dimensionValues": [{"value": "/"}], "metricValues": [{"value": "60"}]},
        ]
    },
    "top_origens": {
        "rows": [
            {"dimensionValues": [{"value": "google"}], "metricValues": [{"value": "210"}]},
            {"dimensionValues": [{"value": "(direct)"}], "metricValues": [{"value": "90"}]},
        ]
    },
}
res_ga4_ok = c.ler_analytics_ga4(buscar=lambda: dados_sinteticos_ga4_ok)
conferir("GA4 ok: status pronto", res_ga4_ok["status"], "pronto")
conferir("GA4 ok: usuarios_ativos_7d", res_ga4_ok["usuarios_ativos_7d"], 120)
conferir("GA4 ok: sessoes_7d", res_ga4_ok["sessoes_7d"], 128)
conferir("GA4 ok: visualizacoes_7d", res_ga4_ok["visualizacoes_7d"], 186)
conferir("GA4 ok: usuarios_ativos_30d", res_ga4_ok["usuarios_ativos_30d"], 420)
conferir("GA4 ok: série diária ordenada por data crescente", [d["data"] for d in res_ga4_ok["serie_diaria_30d"]], ["2026-09-01", "2026-09-02"])
conferir("GA4 ok: top página SEM query string", res_ga4_ok["top_paginas"][0]["caminho"], "/blog/como-usar-claude-code")
conferir("GA4 ok: top página com visualizações", res_ga4_ok["top_paginas"][0]["visualizacoes"], 85)
conferir("GA4 ok: top origem", res_ga4_ok["top_origens"][0]["origem"], "google")
conferir("GA4 ok: passa 100% na trava de privacidade public-repo", c.auditar_estado_publico({"analytics": res_ga4_ok}), [])

ambiente_ga4_guardado = os.environ.pop("PAINEL_GA4_CREDENCIAL", None)
try:
    tmp_ga4_sem_cred = Path(tempfile.mkdtemp())
    res_ga4_sem_cred = c.ler_analytics_ga4(
        caminho_cache=tmp_ga4_sem_cred / "cache-inexistente.json",
        caminho_config_ga4=tmp_ga4_sem_cred / "sem-config.env",
    )
    conferir("GA4 sem credencial: status sem_dado (nunca erro mudo)", res_ga4_sem_cred["status"], "sem_dado")
    conferir("GA4 sem credencial: usuarios_ativos_7d fica None, nunca 0", res_ga4_sem_cred["usuarios_ativos_7d"], None)
    conferir("GA4 sem credencial: motivo cita a variável certa", "PAINEL_GA4_CREDENCIAL" in (res_ga4_sem_cred["motivo"] or ""), True)

    print("\n--- GA4: cache de 1h evita nova consulta (usa a mesma ausência de credencial acima)")
    tmp_cache_ga4 = tmp_ga4_sem_cred / "cache_analytics.json"
    tmp_cache_ga4.write_text(json.dumps(res_ga4_ok), encoding="utf-8")
    res_ga4_cache_fresco = c.ler_analytics_ga4(caminho_cache=tmp_cache_ga4, caminho_config_ga4=tmp_ga4_sem_cred / "ainda-sem-config.env")
    conferir("GA4 cache fresco (<1h): devolve o cache sem tentar credencial", res_ga4_cache_fresco["usuarios_ativos_7d"], 120)

    antigo = datetime.datetime.now().timestamp() - 4000
    os.utime(tmp_cache_ga4, (antigo, antigo))
    res_ga4_cache_velho = c.ler_analytics_ga4(caminho_cache=tmp_cache_ga4, caminho_config_ga4=tmp_ga4_sem_cred / "continua-sem-config.env")
    conferir("GA4 cache velho (>1h): não usa, busca de novo (sem credencial aqui, vira sem_dado)", res_ga4_cache_velho["status"], "sem_dado")
finally:
    if ambiente_ga4_guardado is not None:
        os.environ["PAINEL_GA4_CREDENCIAL"] = ambiente_ga4_guardado
    shutil.rmtree(tmp_ga4_sem_cred, ignore_errors=True)


def _ga4_explode():
    raise RuntimeError("timeout simulado na Analytics Data API")


res_ga4_erro = c.ler_analytics_ga4(buscar=_ga4_explode)
conferir("GA4 erro de API: status sem_dado (nunca zero)", res_ga4_erro["status"], "sem_dado")
conferir("GA4 erro de API: motivo cita o tipo do erro", "RuntimeError" in (res_ga4_erro["motivo"] or ""), True)

res_ga4_vazio = c.ler_analytics_ga4(buscar=lambda: {"totais_7d": {"rows": []}, "totais_30d": {}, "serie_diaria_30d": {}, "top_paginas": {}, "top_origens": {}})
conferir("GA4 resposta 200 mas sem métrica nenhuma: sem_dado, não pronto com zero", res_ga4_vazio["status"], "sem_dado")

print("\n--- LinkedIn via Apify: ok, sem credencial, erro de API, teto de gasto e cache (rodada 25/09)")

dados_sinteticos_linkedin_ok = {
    "posts": [
        {
            "postedAt": "2026-09-20T10:00:00Z",
            "text": "Hoje eu testei um jeito novo de configurar hooks no Claude Code e o resultado surpreendeu todo mundo na call de squad.",
            "likeCount": 42,
            "commentCount": 5,
            "repostCount": 2,
        },
        {
            "postedAt": "2026-09-18T09:00:00Z",
            "text": "Como eu uso MCP pra conectar minha agência inteira num painel só.",
            "likeCount": 18,
            "commentCount": 1,
            "repostCount": 0,
        },
    ],
    "custo_usd": 0.0042,
}
res_li_ok = c.ler_linkedin_apify(buscar=lambda: dados_sinteticos_linkedin_ok)
conferir("linkedin apify ok: status", res_li_ok["status"], "ok_apify")
conferir("linkedin apify ok: 2 posts extraídos", len(res_li_ok["posts"]), 2)
conferir("linkedin apify ok: curtidas do primeiro post", res_li_ok["posts"][0]["curtidas"], 42)
conferir("linkedin apify ok: início do texto truncado em até 12 palavras", len(res_li_ok["posts"][0]["inicio_texto"].split()) <= 12, True)
conferir("linkedin apify ok: custo registrado no estado", res_li_ok["custo_usd"], 0.0042)
conferir("linkedin apify ok: aviso fixo cita a lacuna de impressões", "impress" in res_li_ok["aviso_cobertura"].lower(), True)
conferir("linkedin apify ok: passa 100% na trava de privacidade public-repo", c.auditar_estado_publico({"linkedin": res_li_ok}), [])

token_apify_guardado = os.environ.pop("APIFY_TOKEN", None)
try:
    tmp_li_sem_token = Path(tempfile.mkdtemp())
    res_li_sem_token = c.ler_linkedin_apify(
        caminho_cache=tmp_li_sem_token / "cache-inexistente.json",
        caminho_bloqueio=tmp_li_sem_token / "bloqueio-inexistente.json",
        caminho_config_apify=tmp_li_sem_token / "sem-apify.env",
    )
    conferir("linkedin sem token: status sem_dado (nunca zero)", res_li_sem_token["status"], "sem_dado")
    conferir("linkedin sem token: motivo cita APIFY_TOKEN", "APIFY_TOKEN" in (res_li_sem_token["motivo"] or ""), True)

    print("\n--- linkedin: cache de 24h evita nova consulta")
    tmp_cache_li = tmp_li_sem_token / "cache_linkedin.json"
    tmp_bloqueio_li = tmp_li_sem_token / "bloqueio.json"
    tmp_cache_li.write_text(json.dumps(res_li_ok), encoding="utf-8")
    res_li_cache_fresco = c.ler_linkedin_apify(
        caminho_cache=tmp_cache_li, caminho_bloqueio=tmp_bloqueio_li, caminho_config_apify=tmp_li_sem_token / "ainda-sem-apify.env"
    )
    conferir("linkedin cache fresco (<24h): devolve cache sem tentar token", res_li_cache_fresco["posts"][0]["curtidas"], 42)

    antigo_li = datetime.datetime.now().timestamp() - 90000
    os.utime(tmp_cache_li, (antigo_li, antigo_li))
    res_li_cache_velho = c.ler_linkedin_apify(
        caminho_cache=tmp_cache_li, caminho_bloqueio=tmp_bloqueio_li, caminho_config_apify=tmp_li_sem_token / "continua-sem-apify.env"
    )
    conferir("linkedin cache velho (>24h): não usa, cai em sem_dado", res_li_cache_velho["status"], "sem_dado")
finally:
    if token_apify_guardado is not None:
        os.environ["APIFY_TOKEN"] = token_apify_guardado
    shutil.rmtree(tmp_li_sem_token, ignore_errors=True)


def _li_explode():
    raise TimeoutError("apify sem resposta")


res_li_erro = c.ler_linkedin_apify(buscar=_li_explode)
conferir("linkedin erro de API: status erro", res_li_erro["status"], "erro")
conferir("linkedin erro de API: motivo cita o tipo do erro", "TimeoutError" in (res_li_erro["motivo"] or ""), True)

dados_sinteticos_linkedin_caro = {"posts": [{"text": "post caro de testar", "likeCount": 1}], "custo_usd": 0.53}
res_li_caro = c.ler_linkedin_apify(buscar=lambda: dados_sinteticos_linkedin_caro)
conferir("linkedin teto de gasto: status erro quando custo > US$ 0,10", res_li_caro["status"], "erro")
conferir("linkedin teto de gasto: motivo cita o teto", "0,10" in res_li_caro["motivo"], True)
conferir("linkedin teto de gasto: não devolve post nenhum no erro", res_li_caro["posts"], [])

tmp_bloqueio_persistido = Path(tempfile.mkdtemp()) / "bloqueio.json"
tmp_bloqueio_persistido.write_text(
    json.dumps({"motivo": "custo passou do teto em execução anterior", "bloqueado_em": "2026-09-25T00:00:00Z", "custo_usd": 0.53}),
    encoding="utf-8",
)
res_li_bloqueado = c.ler_linkedin_apify(
    caminho_cache=tmp_bloqueio_persistido.parent / "cache-nao-existe.json",
    caminho_bloqueio=tmp_bloqueio_persistido,
)
conferir("linkedin bloqueado por teto anterior: status erro sem tentar de novo", res_li_bloqueado["status"], "erro")
conferir("linkedin bloqueado: motivo vem do arquivo de bloqueio", "teto" in res_li_bloqueado["motivo"], True)
shutil.rmtree(tmp_bloqueio_persistido.parent, ignore_errors=True)

print("\n" + ("TODOS PASSARAM" if falhas == 0 else f"{falhas} FALHA(S)"))
sys.exit(0 if falhas == 0 else 1)
