#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
O COFRE COM 45 NÓS, PRA MEDIR O LAYOUT ANTES DE ELE EXISTIR.

    python3 provas/cofre_sintetico.py  > /tmp/cofre-45.json

O dado de hoje tem 5 registros e o arquiteto volta com ~45. Defeito de layout
só aparece no volume: com 5 nós qualquer desenho passa. Este script fabrica 45
aprendizados SINTÉTICOS e os faz atravessar `ler_cofre` DE VERDADE, com fonte
real em disco, âncora conferida e ligação declarada. Assim o payload que vai
pro navegador tem exatamente a forma do payload real, incluindo `grau`,
`ponte`, `areas` e `familias` calculados pelo coletor, e não a forma que eu
acho que ele tem.

‼️ NADA AQUI TOCA `data/cofre.json` NEM `coletor/`. A fonte sintética nasce e
morre numa pasta temporária, e o catálogo de áreas e famílias é COPIADO do
arquivo real: se o arquiteto acrescentar uma área, ela aparece aqui sozinha.

‼️ A MASSA TEM QUE EXERCITAR O QUE O ROTEIRO AFIRMA, e a primeira versão não
exercitava. O QA mediu, em 10/09, três buracos que faziam asserção passar pela
FORMA DA MASSA e não pela regra:

  - **nenhuma ponte entre duas áreas não transversais** (as 37 pontes tocavam
    `transversal`, que nunca é filtrada). Com isso, "a ponte sobrevive ao
    filtro" passava sem nunca exercitar o caso em que as DUAS pontas somem;
  - **`conteudo` sem nenhuma ligação interna**, e o roteiro usava justamente
    `conteudo` pra provar que ligação interna de área escondida some: comparava
    zero com zero;
  - **o grafo tinha dois componentes** (23 e 22 nós), e o roteiro afirmava por
    escrito que a massa era conexa. Afirmação sobre a massa também é afirmação,
    e essa não tinha sido medida.

Cada caso abaixo está marcado com o que ele existe pra provar. O texto é
sintético e genérico de propósito: nome de pessoa e de cliente não entram numa
massa de teste que vira screenshot.
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "coletor"))
import coletar_estado as c  # noqa: E402

CATALOGO = json.loads((RAIZ / "data" / "cofre.json").read_text(encoding="utf-8"))
AREAS = [a["id"] for a in CATALOGO["areas"] if a["id"] != "transversal"]
FAMILIAS = [f["id"] for f in CATALOGO["familias"]]
AUTORES = ["Luana", "dev", "QA", "Renato", "gestor", "analista", "Cleo", "designer", "arquiteto"]

# Títulos com o COMPRIMENTO dos reais (30 a 96 caracteres), que é o que decide
# se o rótulo cabe. Frase curta demais faria o teste de layout passar de graça.
TITULOS = [
    "Zero de erro e zero de ausência são a mesma tela",
    "A trava mora na porta, não na decisão",
    "Média não é piso, e o pior item é o que decide",
    "O instrumento pode narrar o próprio ponto cego",
    "Sonda que atravessa shell devolve vazio, não erro",
    "Registro que o sistema cria sozinho mede o esforço",
    "Correção que não alcança todas as cópias volta",
    "Processo vivo lê o código uma vez, no boot",
    "Detector certo ligado no atuador errado reporta sucesso",
    "Frequência sem data ranqueia o já resolvido",
    "A janela de análise é uma decisão silenciosa",
    "Checagem circular devolve sim por construção",
    "Ausência de registro não é prova de falha",
    "Unidade misturada infla qualquer razão",
    "Trava de interface não alcança o cron",
    "Documento que promete mais do que cobre",
    "A ordem literal não resolve o problema que a gerou",
    "Fallback educado é o pior lugar pra dado faltando",
    "Instrumento calibrado contra a resposta",
    "Uma fila, um dono, e o mux não herda o lock",
    "Nome ambíguo manda o agente pro objeto errado",
    "Paralelo que move o chão do outro nasce velho",
    "O revisor também erra, e se derruba com medição",
    "Achado solto não vira diagnóstico sozinho",
    "Briefing sem fonte vira caçada ao que não existe",
    "Editar anúncio destrói aprendizado, criar não",
    "Palavra-chave ativa não é palavra que gasta",
    "Negativa não é palavra comprada",
    "Duas séries idênticas são a mesma métrica contada duas vezes",
    "Alvo de grupo sobrepõe alvo de campanha",
    "A senha morre quando a legenda entrega o material",
    "Capa fora da coluna central some no feed",
    "Piso de sete segundos não se mede por média",
    "Cover ausente publica o frame zero em branco",
    "Sincronizador que leva dado e deixa código",
    "Regra no disco que nunca chega ao prompt",
    "Idioma que vazou num bot e não viajou pro irmão",
    "Comentário meio certo passa em leitura rápida",
    "Contexto por turno não protege subprocesso",
    "Lead sem origem capturada não se reconstrói depois",
    "Resposta não é interesse, e contato não é lead",
    "O e-mail sem link é desenho, não defeito",
    "Modo de teste que não lê de volta não é teste",
    "Trava em variável de ambiente o modelo desliga",
    "Passar no validador é o piso, não o pronto",
]

ESPECIES = ["trava", "ordem", "correcao", "medicao", "defeito", "padrao"]


def montar(pasta=None):
    pasta = Path(pasta or tempfile.mkdtemp(prefix="cofre-sintetico-"))
    registros, linhas_fonte = [], ["# fonte sintética do teste de layout", ""]

    def bloco(ancora, extras=()):
        """Escreve o bloco da âncora na fonte e devolve a linha em que ele caiu."""
        linhas_fonte.append(f"‼️ **{ancora}**")
        linha = len(linhas_fonte)
        linhas_fonte.append("Corpo do bloco sintético, uma linha.")
        linhas_fonte.extend(extras)
        linhas_fonte.append("")
        return linha

    # As cabeças de família são `padrao` e moram em `transversal`: é o que faz a
    # ponte existir e o filtro ter o que preservar.
    cabecas = {}
    for i, familia in enumerate(FAMILIAS):
        ident = f"padrao-{familia}"
        cabecas[familia] = ident
        titulo = TITULOS[i % len(TITULOS)]
        ancora = f"PADRAO {i:02d} {titulo}"
        linha = bloco(ancora)
        registros.append({
            "id": ident, "especie": "padrao", "area": "transversal", "familia": familia,
            "titulo": titulo, "corpo": f"A família {familia} nomeada: o mecanismo que se repete "
            "em sistemas diferentes e por isso custa caro quando ninguém liga um caso ao outro.",
            "caso": "Massa sintética de teste de layout, sem caso real.",
            "autor": AUTORES[i % len(AUTORES)], "quando": "2026-09-0%d" % (1 + i % 9),
            "fonte": "SINTETICO.md", "linha": linha,
            "ancora": ancora, "peso": 5, "conecta": [],
        })

    # ‼️ A FAMÍLIA NÃO PODE ANDAR NA MESMA PARIDADE DA ÁREA. Era `i % 8` contra
    # `i % 6`: as duas mudam de dois em dois, então família par só recebia área
    # par e o grafo nascia em dois pedaços sem ninguém pedir. Qualquer conta
    # LINEAR em `i` mantém o acoplamento (medido: `(i*5) % 8` ainda dá dois
    # componentes), por isso entra o `i // 2`, que muda de um em um a cada dois.
    for i, titulo in enumerate(TITULOS):
        if len(registros) >= 43:
            break
        familia = FAMILIAS[(i + i // 2) % len(FAMILIAS)]
        area = AREAS[i % len(AREAS)]
        ident = f"no-{i:02d}-{area}"
        ancora = f"ACHADO {i:02d} {titulo}"
        porque = f"É a mesma família {familia} do achado {i:02d}"
        vizinho = f"no-{(i - len(AREAS)):02d}-{area}" if i >= len(AREAS) else None
        porque_vizinho = f"O achado {i:02d} repete o {(i - len(AREAS)):02d} na mesma área"
        conecta = [{"para": cabecas[familia], "porque": porque}]
        extras = [f"{porque}, e por isso a ligação está escrita aqui.", f"{porque_vizinho}."]
        # Uma ligação em cada três é interna à área: sem elas o filtro não teria
        # o que esconder, e o teste da ponte passaria de graça.
        if vizinho and i % 3 == 0:
            conecta.append({"para": vizinho, "porque": porque_vizinho})
        linha = bloco(ancora, extras)
        registros.append({
            "id": ident, "especie": ESPECIES[i % len(ESPECIES)], "area": area, "familia": familia,
            "titulo": titulo,
            "corpo": "Corpo sintético do aprendizado, com o tamanho aproximado de um real para "
                     "a ficha ser medida com texto de verdade e não com uma linha curta.",
            "caso": "Caso sintético: o defeito apareceu, foi medido e a regra ficou escrita.",
            "autor": AUTORES[i % len(AUTORES)], "quando": "2026-09-%02d" % (1 + i % 9),
            "fonte": "SINTETICO.md", "linha": linha,
            "ancora": ancora, "peso": 1 + (i % 5), "conecta": conecta,
        })

    # ‼️ CASO 1: PONTE ENTRE DUAS ÁREAS NÃO TRANSVERSAIS.
    # Sem ela, "o filtro preserva a ponte" nunca via o caso em que as DUAS
    # pontas somem, porque toda ponte tocava `transversal`, que fica sempre.
    porque_ponte = "O mesmo defeito apareceu em conteúdo e em bots no mesmo dia"
    ancora_ponte = "PONTE ENTRE AREAS: o achado que atravessa a operação"
    linha = bloco(ancora_ponte, [f"{porque_ponte}, e está escrito aqui."])
    registros.append({
        "id": "no-ponte-conteudo", "especie": "correcao", "area": "conteudo",
        "familia": FAMILIAS[1], "titulo": "O mesmo defeito em conteúdo e em bots",
        "corpo": "Aprendizado sintético que liga DUAS áreas sem passar pelo miolo transversal.",
        "caso": "Existe pra provar que o filtro não apaga ponte com as duas pontas escondidas.",
        "autor": "QA", "quando": "2026-09-10", "fonte": "SINTETICO.md", "linha": linha,
        "ancora": ancora_ponte, "peso": 4,
        "conecta": [{"para": "no-02-bots", "porque": porque_ponte}],
    })

    # ‼️ CASO 2: NÓ SOLTO, de grau 0.
    # Prova o ramo "não há caminho declarado" (que antes não era exercitado no
    # navegador), prova o piso do raio, e prova que cobertura não é sempre 100%.
    ancora_solto = "ACHADO SOLTO: ninguém escreveu ligação nenhuma pra este"
    linha = bloco(ancora_solto)
    registros.append({
        "id": "no-solto", "especie": "defeito", "area": "mineracao", "familia": FAMILIAS[0],
        "titulo": "Achado que ninguém amarrou em nada ainda",
        # O corpo passa dos 420 do coletor de PROPÓSITO: é o único jeito de ver
        # na tela o que o corte faz com um texto real.
        "corpo": ("Corpo deliberadamente longo para atravessar o limite de 420 caracteres do "
                  "coletor e mostrar na ficha o que o corte faz com um texto de verdade. "
                  "Ele segue falando sem dizer nada de novo, porque o que importa aqui é o "
                  "comprimento e não o conteúdo, e porque um teste que usa texto curto nunca "
                  "vê o corte acontecer. Repetindo mais uma vez para garantir a ultrapassagem "
                  "do limite com folga suficiente, e assim provar o comportamento real. "
                  "Fim do corpo longo."),
        "caso": "Também carrega telefone 5511987654321 e email teste@exemplo.com "
                "pra provar que a trava do coletor mascara dígito e e-mail.",
        "autor": "dev", "quando": "2026-09-10", "fonte": "SINTETICO.md", "linha": linha,
        "ancora": ancora_solto, "peso": 1, "conecta": [],
    })

    (pasta / "SINTETICO.md").write_text("\n".join(linhas_fonte) + "\n", encoding="utf-8")
    alvo = pasta / "cofre.json"
    alvo.write_text(json.dumps({
        "versao": 1, "areas": CATALOGO["areas"], "familias": CATALOGO["familias"],
        "registros": registros,
    }, ensure_ascii=False), encoding="utf-8")
    return c.ler_cofre(alvo, pasta)


if __name__ == "__main__":
    # A pasta temporária é APAGADA no fim. Antes ficava uma por execução, e o
    # QA achou 49 delas em `/tmp`: script de prova que suja a máquina vira o
    # próximo mistério de disco cheio.
    pasta = Path(tempfile.mkdtemp(prefix="cofre-sintetico-"))
    try:
        cofre = montar(pasta)
        # Falha alto: cofre sintético com recusa é massa de teste quebrada, e
        # massa quebrada aprova layout que nunca viu 45 nós.
        problemas = []
        if cofre["erro"] or cofre["recusados"] or cofre["arestas_recusadas"]:
            problemas.append("registro ou aresta recusada")
        if len(cofre["nos"]) != 45:
            problemas.append(f"{len(cofre['nos'])} nós, esperava 45")
        area = {n["id"]: n["area"] for n in cofre["nos"]}
        if not any(a["ponte"] and "transversal" not in (area[a["de"]], area[a["para"]])
                   for a in cofre["arestas"]):
            problemas.append("nenhuma ponte entre duas áreas não transversais")
        if not any(n["grau"] == 0 for n in cofre["nos"]):
            problemas.append("nenhum nó de grau 0")
        if problemas:
            print(json.dumps({"massa_invalida": problemas, "erro": cofre.get("erro"),
                              "recusados": cofre["recusados"][:5],
                              "arestas_recusadas": cofre["arestas_recusadas"][:5]},
                             ensure_ascii=False, indent=2), file=sys.stderr)
            sys.exit(1)
        print(json.dumps(cofre, ensure_ascii=False))
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
