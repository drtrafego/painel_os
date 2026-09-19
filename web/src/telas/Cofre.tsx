import { useEffect, useMemo, useState } from 'react'
import {
  arestasDoCaminho, caminhoMaisCurto, corDaArea, diagnosticarLayout, encurtar, escolherRotulos,
  posicionarCofre, raioDeToque, CAIXA_CELULAR, CAIXA_MESA, FONTE_ROTULO, type Caixa,
} from '../dados/cofre'
import type { ArestaCofre, NoMemoria } from '../dados/tipos'
import { Parcial } from '../ui/SemDado'
import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'

/**
 * O COFRE: cada nó é um APRENDIZADO da operação, não um arquivo de memória.
 *
 * A troca do dado é de 10/09 e esta tela é a outra metade dela. O que mudou
 * aqui, item por item, contra o que estava escrito no README:
 *
 *  - o RODAPÉ prometia "conteúdo não é enviado ao navegador", e `corpo` e
 *    `caso` passaram a ir. Promessa de privacidade vencida em tela é pior que
 *    ausência de promessa: quem lê decide o que contar com base nela. A frase
 *    agora diz o que o coletor faz de verdade, que é passar todo texto pela
 *    trava de nome de cliente antes de emitir.
 *  - a FICHA desenha espécie, área, família, autor, data, peso, corpo e caso.
 *    O `autor` é o pedido do dono: sem ele a tela não responde QUEM aprendeu.
 *  - o MAPA usa raio por `grau`, cor por `area` e um setor por área. Com 45 nós
 *    numa elipse única os rótulos se cruzam: medido em 10/09, 38 pares no
 *    navegador, e 1 par já com os 5 registros de hoje.
 *  - o FILTRO de área esconde o resto e PRESERVA a ponte, porque é a ponte que
 *    carrega o conhecimento caro (o mesmo defeito num bot, num anúncio e numa
 *    fila de conteúdo). `transversal` nunca é filtrada.
 *  - `Shift`+clique em dois nós mostra o caminho mais curto entre eles, por BFS
 *    sobre as arestas tratadas como não dirigidas.
 *
 * A matemática (posição, raio, rótulo que cabe e BFS) mora em `dados/cofre.ts`,
 * fora do React, e é medida por `dados/cofre.teste.ts`.
 */

function usarEstreito(): boolean {
  const [estreito, setEstreito] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 1023px)')
    const ouvir = () => setEstreito(consulta.matches)
    consulta.addEventListener('change', ouvir)
    return () => consulta.removeEventListener('change', ouvir)
  }, [])
  return estreito
}

/** Raio do anel vazado da ponte. Usado no desenho E como obstáculo do rótulo:
 *  em dois lugares diferentes, os dois discordariam na primeira edição. */
const RAIO_COTO = 4.5

function Mapa({
  nos, arestas, caixa, ordemAreas, escolhido, alvo, areaFoco, sempreVisiveis, caminho,
  aoEscolher, aoLigar,
}: {
  nos: NoMemoria[]
  arestas: ArestaCofre[]
  caixa: Caixa
  /** Ordem dos setores, vinda do CATÁLOGO. Ver o comentário no `useMemo`. */
  ordemAreas: string[]
  escolhido: string
  alvo: string | null
  /** Área isolada pelo filtro: com ela ligada, o RESTO do mapa some. */
  areaFoco: string | null
  /** Áreas que o filtro nunca esconde (`transversal`). */
  sempreVisiveis: string[]
  caminho: string[] | null
  aoEscolher: (id: string) => void
  aoLigar: (id: string) => void
}) {
  // ‼️ O layout é calculado sobre TODOS os nós, inclusive os filtrados. Assim o
  // nó não pula de lugar quando o filtro entra, e a ponte que sai da área
  // escondida aponta para a posição real de quem está do outro lado.
  // ‼️ A ordem dos setores vem do CATÁLOGO (`cofre.areas`, que o coletor ordena
  // por total), não da ordem em que os nós aparecem no JSON. Com a ordem de
  // aparecimento, acrescentar um registro no meio do arquivo girava o mapa
  // inteiro sem nada ter mudado, e mapa que se remexe sozinho faz a pessoa
  // achar que o dado mudou.
  const postos = useMemo(
    () => posicionarCofre(nos, caixa, ordemAreas),
    [nos, caixa, ordemAreas],
  )
  const noCaminho = useMemo(() => new Set(caminho ?? []), [caminho])
  const arestasMarcadas = useMemo(() => arestasDoCaminho(caminho), [caminho])
  const area = useMemo(() => new Map(nos.map((n) => [n.id, n.area])), [nos])

  // ‼️ QUEM APARECE. Clicar numa área ESCONDE O RESTO (é o que o contrato pede
  // e o que o dono mediu na referência), não some com a área clicada. Ficam de
  // pé: a área em foco, as áreas sempre visíveis (transversal, que é ponte por
  // construção) e quem está no caminho desenhado, porque esconder um nó do
  // caminho faria a tela desenhar um salto no vazio.
  const visivel = (id: string) =>
    areaFoco === null
    || area.get(id) === areaFoco
    || sempreVisiveis.includes(area.get(id) ?? '')
    || noCaminho.has(id)

  const ligados = new Set(
    arestas.filter((a) => a.de === escolhido || a.para === escolhido).flatMap((a) => [a.de, a.para]),
  )

  // Aresta some junto com o nó, MENOS quando é ponte: ali ela continua, com a
  // ponta escondida virando um coto vazado. Filtro que apaga a ponte apaga o
  // achado.
  //
  // ‼️ A REGRA, ESCRITA DEPOIS DE MEDIR OS DOIS LADOS. O contrato dizia "o filtro
  // preserva ponte" sem dizer o que fazer quando as DUAS pontas estão
  // escondidas, e essa ambiguidade nunca tinha sido exercitada, porque na massa
  // antiga toda ponte tocava `transversal`, que fica sempre.
  //
  // A leitura literal (toda ponte fica) foi implementada e MEDIDA: com o filtro
  // em tráfego, o mapa virou 30 anéis vazados e sobraram 4 de 14 nomes
  // legíveis. O filtro deixava de filtrar, e a tela que existe pra responder
  // "o que aprendemos em tráfego" passava a mostrar tudo menos isso.
  //
  // "Ponte com ao menos uma ponta visível" também foi medida e também não serve:
  // como `transversal` fica sempre, TODA ponte de área escondida para um padrão
  // continuava no mapa, e o resultado era o mesmo (29 cotos, 4 nomes de 14).
  //
  // Fica valendo: PONTE QUE TOCA A ÁREA EM FOCO continua desenhada, com a ponta
  // de fora virando coto. É o que o filtro quer dizer — ver só esta área SEM
  // perder o que ela alcança fora. Ponte que não toca o foco não é sobre o que
  // se está olhando e volta assim que o filtro sai. Está escrito no contrato do
  // README e na frase embaixo do mapa, que é onde alguém procura.
  const arestasVisiveis = arestas.filter((a) => {
    const de = visivel(a.de)
    const para = visivel(a.para)
    if (de && para) return true
    if (arestasMarcadas.has(`${a.de}|${a.para}`)) return true
    return a.ponte && (area.get(a.de) === areaFoco || area.get(a.para) === areaFoco)
  })
  const cotos = new Set(
    arestasVisiveis.flatMap((a) => [a.de, a.para]).filter((id) => !visivel(id)),
  )

  const rotulos = useMemo(() => {
    const nome = new Map(nos.map((n) => [n.id, n.rotulo]))
    const grau = new Map(nos.map((n) => [n.id, n.grau]))
    const so = new Map([...postos].filter(([id]) => visivel(id)))
    // O anel vazado da ponte é desenhado e ocupa espaço. Sem passá-lo como
    // obstáculo, com o filtro ligado o rótulo caía por cima dele: 6 pares,
    // medidos pelo QA no bbox real.
    const obstaculos = [...cotos].map((id) => {
      const q = postos.get(id)
      return q ? { x: q.x - RAIO_COTO, y: q.y - RAIO_COTO, largura: RAIO_COTO * 2, altura: RAIO_COTO * 2 } : null
    }).filter((x): x is { x: number; y: number; largura: number; altura: number } => x !== null)
    return escolherRotulos(
      so,
      (id) => nome.get(id) ?? id,
      (id) => {
        if (id === escolhido) return 10_000
        if (id === alvo) return 9_000
        if (noCaminho.has(id)) return 8_000
        if (ligados.has(id)) return 1_000 + (grau.get(id) ?? 0)
        return grau.get(id) ?? 0
      },
      caixa,
      obstaculos,
    )
  }, [postos, nos, escolhido, alvo, caminho, areaFoco, caixa])

  const posicao = (id: string) => postos.get(id)
  const visiveis = nos.filter((n) => visivel(n.id)).length
  // ‼️ O DESENHO SE MEDE E DIZ O QUE NÃO COUBE. O aperto automático para num
  // piso de raio clicável, então acima de um volume os círculos voltam a se
  // encostar: 135 nós na mesa e 80 no celular, medidos em 10/09. Mapa
  // encavalado sem aviso é a mesma família do rótulo escondido sem aviso.
  const comoCoube = diagnosticarLayout(postos, caixa)

  // Zoom e Pan interativo para navegação e exploração de alta resolução
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoInicial, setPontoInicial] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [moveu, setMoveu] = useState(false)

  const resetarNavegacao = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const aoRolar = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 1.15 : 0.87
    setZoom((z) => Math.min(3.5, Math.max(0.7, Number((z * delta).toFixed(2)))))
  }

  const aoIniciarArrasto = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    setArrastando(true)
    setMoveu(false)
    setPontoInicial({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y })
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }

  const aoArrastar = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!arrastando || !pontoInicial) return
    const dx = e.clientX - pontoInicial.x
    const dy = e.clientY - pontoInicial.y
    if (Math.hypot(dx, dy) > 4) {
      setMoveu(true)
    }
    setPan({ x: pontoInicial.panX + dx, y: pontoInicial.panY + dy })
  }

  const aoFinalizarArrasto = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!arrastando) return
    setArrastando(false)
    setPontoInicial(null)
    try {
      ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    } catch {
      // noop
    }
  }

  return (
    <>
    <div className="relative overflow-hidden rounded border border-linha bg-carta">
      {/* Controles de Zoom Flutuantes */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded border border-linha bg-carta/90 p-1 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          title="Aumentar zoom"
          aria-label="Aumentar zoom"
          onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
          className="flex h-7 w-7 items-center justify-center rounded border border-linha bg-carta-forte text-xs font-bold text-tinta hover:bg-linha active:scale-95"
        >
          +
        </button>
        <button
          type="button"
          title="Diminuir zoom"
          aria-label="Diminuir zoom"
          onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.25).toFixed(2))))}
          className="flex h-7 w-7 items-center justify-center rounded border border-linha bg-carta-forte text-xs font-bold text-tinta hover:bg-linha active:scale-95"
        >
          −
        </button>
        {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
          <button
            type="button"
            title="Restaurar visualização original (100%)"
            aria-label="Restaurar visualização original"
            onClick={resetarNavegacao}
            className="rounded border border-linha bg-carta-forte px-2 py-1 font-mono text-[10px] text-tinta-2 hover:text-tinta hover:bg-linha active:scale-95"
          >
            {Math.round(zoom * 100)}% · Reset
          </button>
        )}
      </div>

    <svg
      data-grafo-cofre
      // `role="img"` torna os filhos apresentacionais, e aqui cada nó é um
      // botão com foco. Um mapa navegável é um GRUPO, não uma figura.
      role="group"
      aria-label="Mapa dos aprendizados da operação e das ligações declaradas entre eles"
      viewBox={`0 0 ${caixa.largura} ${caixa.altura}`}
      className="h-auto w-full touch-none select-none cursor-grab active:cursor-grabbing"
      onWheel={aoRolar}
      onPointerDown={aoIniciarArrasto}
      onPointerMove={aoArrastar}
      onPointerUp={aoFinalizarArrasto}
      onPointerCancel={aoFinalizarArrasto}
    >
      <defs>
        <marker id="seta-cofre" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-linha-forte)" />
        </marker>
        <radialGradient id="brilho-cofre">
          <stop offset="0" stopColor="var(--color-lima)" stopOpacity=".13" />
          <stop offset="1" stopColor="var(--color-lima)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform={zoom !== 1 || pan.x !== 0 || pan.y !== 0
        ? `translate(${caixa.largura / 2 + pan.x}, ${caixa.altura / 2 + pan.y}) scale(${zoom}) translate(${-caixa.largura / 2}, ${-caixa.altura / 2})`
        : undefined}
      >
      <circle cx={caixa.largura / 2} cy={caixa.altura / 2} r={Math.min(caixa.largura, caixa.altura) * 0.34} fill="url(#brilho-cofre)" />

      {arestasVisiveis.map((a) => {
        const de = posicao(a.de)
        const para = posicao(a.para)
        if (!de || !para) return null
        const emCaminho = arestasMarcadas.has(`${a.de}|${a.para}`)
        const ativa = a.de === escolhido || a.para === escolhido
        const cortada = !visivel(a.de) || !visivel(a.para)
        return (
          <line
            data-aresta-cofre
            // As pontas no DOM: sem elas, o roteiro só conseguia perguntar "há
            // ALGUMA ponte no mapa?", e a resposta era sim por causa de outra
            // aresta. Instrumento que não distingue o objeto mede outra coisa.
            data-de={a.de}
            data-para={a.para}
            data-ponte={String(a.ponte)}
            data-de-area={area.get(a.de)}
            data-para-area={area.get(a.para)}
            data-no-caminho={String(emCaminho)}
            key={`${a.de}:${a.para}`}
            x1={de.x} y1={de.y} x2={para.x} y2={para.y}
            stroke={emCaminho ? 'var(--color-vermelho)' : ativa ? 'var(--color-lima)' : 'var(--color-linha-forte)'}
            strokeOpacity={emCaminho ? 0.95 : ativa ? 0.8 : cortada ? 0.22 : 0.3}
            strokeWidth={emCaminho ? 2.6 : ativa ? 1.7 : 1}
            strokeDasharray={cortada ? '5 3' : undefined}
            markerEnd={emCaminho ? undefined : 'url(#seta-cofre)'}
          >
            <title>{`${a.porque}${a.ponte ? ' (ponte entre áreas)' : ''}`}</title>
          </line>
        )
      })}

      {/* A ponta escondida da ponte: anel vazado, na posição real do nó. Some o
          nó, fica o aviso de que há conhecimento ligado fora do filtro. */}
      {[...cotos].map((id) => {
        const q = posicao(id)
        if (!q) return null
        return (
          <circle
            data-ponte-coto key={`coto-${id}`} data-area={area.get(id)}
            cx={q.x} cy={q.y} r={RAIO_COTO} fill="var(--color-carta)" opacity={0.8}
            stroke={corDaArea(area.get(id) ?? '')} strokeWidth={1.3} strokeDasharray="3 2"
          >
            <title>{`ponte para a área ${area.get(id)}, escondida pelo filtro`}</title>
          </circle>
        )
      })}

      {nos.filter((n) => visivel(n.id)).map((no) => {
        const q = posicao(no.id)
        if (!q) return null
        const ativo = no.id === escolhido
        const ehAlvo = no.id === alvo
        const cor = corDaArea(no.area)
        return (
          <g
            data-no-cofre data-id={no.id} data-area={no.area}
            key={no.id} role="button" tabIndex={0}
            aria-label={`${no.rotulo}, ${no.especie} de ${no.autor}`}
            onClick={(e) => {
              if (moveu) return
              if (e.shiftKey) aoLigar(no.id)
              else aoEscolher(no.id)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              if (e.shiftKey) aoLigar(no.id)
              else aoEscolher(no.id)
            }}
            // ‼️ SEM `outline-none`: a classe apagava o anel de foco que o CSS
            // global desenha, e quem navega por teclado ficava sem saber onde
            // estava. Medido em 10/09: o `g` recebia `:focus-visible` e o
            // `outline-style` vinha `none`.
            className="cursor-pointer"
          >
            <title>{`${no.rotulo} · ${no.especie} · ${no.autor}, ${no.quando} · ${no.grau} ligações`}</title>
            {/* ‼️ O ALVO DE TOQUE NÃO É O DESENHO. O círculo visível tem 6,3px
                CSS de diâmetro no celular e a WCAG 2.5.8 pede 24; aumentar o
                desenho custa 11 dos 28 nomes do mapa (medido). Este círculo
                transparente cresce até a metade da menor distância entre
                centros, que é o limite onde dois alvos ainda não se encostam:
                21,4px CSS com 45 nós, sem perder um nome. */}
            <circle
              data-alvo-toque cx={q.x} cy={q.y}
              r={Number(raioDeToque(q.raio, comoCoube.menorDistancia).toFixed(2))}
              fill="transparent"
            />
            {(ativo || ehAlvo || noCaminho.has(no.id)) && (
              <circle cx={q.x} cy={q.y} r={q.raio + 8} fill={ehAlvo || noCaminho.has(no.id) ? 'var(--color-vermelho)' : cor} opacity={0.16} />
            )}
            <circle
              data-corpo-no data-area={no.area} data-grau={no.grau}
              cx={q.x} cy={q.y} r={Number(q.raio.toFixed(2))} fill={cor}
              opacity={no.vencido ? 0.35 : ativo ? 1 : 0.85}
              stroke={ativo ? 'var(--color-tinta)' : 'var(--color-carta)'}
              strokeWidth={ativo ? 2 : 1}
              strokeDasharray={no.vencido ? '3 2' : undefined}
            />
          </g>
        )
      })}

      {rotulos.map((r) => {
        const ativo = r.id === escolhido || r.id === alvo || noCaminho.has(r.id)
        return (
          <text
            data-rotulo-cofre data-id={r.id} key={`rotulo-${r.id}`}
            x={r.x} y={r.y} textAnchor={r.ancora}
            fill={ativo ? 'var(--color-tinta)' : 'var(--color-tinta-2)'}
            fontSize={caixa.fonteRotulo ?? FONTE_ROTULO} fontFamily="var(--font-mono)"
            className="pointer-events-none"
          >
            {r.texto}
          </text>
        )
      })}
      </g>
    </svg>
    </div>
    {/* ‼️ O NÚMERO DO QUE NÃO COUBE VAI JUNTO. Rótulo escondido sem aviso faz
        quem lê achar que o mapa está mostrando tudo, e é a mesma família da
        ressalva de cobertura sem percentual: quem vê a tela limpa conclui que
        está limpo. */}
    <p className="mt-1 font-mono text-[9px] leading-relaxed text-tinta-3">
      {/* ‼️ COM FILTRO, A PRIMEIRA ORAÇÃO MUDA, em vez de ganhar uma correção no
          fim. A versão anterior anexava o esclarecimento como quarta oração de
          um parágrafo de 450 caracteres em 9px, e a afirmação que ele corrige
          era a PRIMEIRA: quem lê bate na versão errada e acha a correção 350
          caracteres depois. Informação enterrada é informação ausente. */}
      Tamanho do círculo = {areaFoco === null
        ? 'ligações declaradas'
        : 'TODAS as ligações declaradas, inclusive as que o filtro tirou do desenho'} · cor = área ·{' '}
      <kbd className="rounded border border-linha px-1">Shift</kbd>+clique num segundo nó mostra o caminho entre os dois.
      {' '}<span className="text-tinta-2">{rotulos.length} de {visiveis} nomes cabem neste tamanho</span>; o resto fica no título do nó e na ficha ao lado.
      {areaFoco !== null && (
        <> Com o filtro ligado, a ponte que <span className="text-tinta-2">sai desta área</span> continua desenhada e a ponta de fora vira anel vazado{cotos.size > 0 ? `: ${cotos.size} aprendizado(s) de outras áreas aparecem assim` : ''}. Ponte entre duas áreas que saíram volta quando o filtro sai.
          {/* ‼️ O TAMANHO CONTINUA SENDO O TOTAL, e sem esta frase a tela se
              contradiz: com o filtro ligado aparece um círculo grande sem
              nenhuma linha saindo dele, debaixo de uma legenda dizendo que
              tamanho é ligação. O achado é do QA, medido com foco em conteúdo:
              `padrao-zero-calado`, grau 5, zero linhas no desenho. */}
          {' '}A ficha ao lado continua listando todas.</>
      )}
      {(comoCoube.colados > 0 || comoCoube.fora > 0) && (
        <span data-mapa-apertado className="mt-1 block text-ambar">
          Este tamanho de tela não comporta {visiveis} aprendizados: {comoCoube.colados > 0 ? `${comoCoube.colados} par(es) de círculos se encostam` : `${comoCoube.fora} círculo(s) passam da borda`}. O desenho parou de encolher no menor círculo que este mapa aceita, e daqui pra baixo a leitura confiável é a lista ao lado e a ficha, não o desenho.
        </span>
      )}
    </p>
    </>
  )
}

export function Cofre({ estado, medidoEm, vista }: PropsTela) {
  const cofre = estado.cofre
  const estreito = usarEstreito()
  const [escolhido, setEscolhido] = useState('')
  const [alvo, setAlvo] = useState<string | null>(null)
  const [areaFoco, setAreaFoco] = useState<string | null>(null)

  const nos = cofre?.nos ?? []
  useEffect(() => {
    if (!nos.length) return
    if (nos.some((n) => n.id === escolhido)) return
    // Abre no mais ligado: é o que responde primeiro "o que a casa aprendeu".
    const centro = [...nos].sort((a, b) => b.grau - a.grau || b.peso - a.peso)[0]
    setEscolhido(centro.id)
  }, [nos, escolhido])

  const caminho = useMemo(
    () => (alvo && escolhido && alvo !== escolhido
      ? caminhoMaisCurto(cofre?.arestas ?? [], escolhido, alvo)
      : null),
    [alvo, escolhido, cofre],
  )

  if (!cofre || cofre.erro || cofre.conexoes === null || !nos.length) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        <TituloDaTela titulo="Cofre de conhecimento." pergunta={vista.pergunta} />
        <div className="carta p-5 text-sm text-tinta-2">
          Não consegui medir o Cofre. {cofre?.erro ?? 'O estado ainda não tem a fonte dos aprendizados.'}
        </div>
      </div>
    )
  }

  const atual = nos.find((n) => n.id === escolhido) ?? nos[0]
  const alvoNo = alvo ? nos.find((n) => n.id === alvo) ?? null : null
  const saem = cofre.arestas.filter((a) => a.de === atual.id)
  const entram = cofre.arestas.filter((a) => a.para === atual.id)
  const nome = (id: string) => nos.find((n) => n.id === id)?.rotulo ?? id
  // Título inteiro dentro de uma pílula vira três linhas centralizadas e ilegível.
  // Encurta na pílula, com o texto completo no `title` e um clique de distância.
  const curto = (id: string) => encurtar(nome(id), 34)
  const baixa = cofre.cobertura !== null && cofre.cobertura < 25
  const familia = cofre.familias.find((f) => f.id === atual.familia)
  const truncado = cofre.truncados.includes(atual.id)
  const areaAtual = cofre.areas.find((a) => a.id === atual.area)
  // O caminho é não dirigido, então o par pode ter ligação nos DOIS sentidos,
  // cada uma com o seu `porque` escrito numa fonte diferente. Mostrar só a
  // primeira que aparece esconderia metade do que a casa escreveu.
  const porqueDoSalto = (de: string, para: string) =>
    cofre.arestas
      .filter((a) => (a.de === de && a.para === para) || (a.de === para && a.para === de))
      // Quem ESCREVEU a razão vai junto: com ligação nos dois sentidos, duas
      // frases lado a lado sem dono deixam a fonte ambígua.
      .map((a) => `${nome(a.de)} → ${nome(a.para)}: ${a.porque}`)
      .join(' · ')

  // Quem aprendeu, contado aqui: é a pergunta que motivou a troca do dado, e ela
  // não pode depender de o dono clicar em 45 nós pra descobrir.
  const autores = [...nos.reduce((m, n) => m.set(n.autor, (m.get(n.autor) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))

  // A área que o filtro nunca esconde sai do catálogo, não de uma constante:
  // área nova marcada `sempre_visivel` no `cofre.json` já nasce protegida.
  const sempreVisiveis = cofre.areas.filter((a) => a.sempre_visivel === true || a.id === 'transversal').map((a) => a.id)
  const ordemAreas = cofre.areas.map((a) => a.id)
  const escolher = (id: string) => { setEscolhido(id); setAlvo(null) }
  const ligar = (id: string) => setAlvo((antigo) => (antigo === id || id === escolhido ? null : id))

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
      <TituloDaTela
        titulo="Cofre de conhecimento."
        pergunta="O que a operação aprendeu, quem aprendeu, e o que se liga a quê pela ligação escrita na fonte."
        direita={<span className="rotulo">medido {new Date(medidoEm).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc</span>}
      />

      {baixa && (
        <div data-cobertura-baixa className="mb-3 rounded-lg border border-ambar/30 bg-ambar/8 px-3 py-2.5 text-[11px] leading-relaxed text-tinta-2">
          <span className="font-mono uppercase tracking-[.16em] text-ambar">Cobertura baixa.</span> Só {cofre.cobertura}% dos aprendizados estão amarrados a algum outro. O mapa mostra essa lacuna, não completa por semelhança.
        </div>
      )}
      {/* ‼️ AS QUATRO LISTAS DA CONFERÊNCIA, não duas. `truncados` e
          `arestas_recusadas` eram medidos pelo coletor e não chegavam à tela:
          um bloco truncado mostrava `linhas: 60` como se fosse medida, e uma
          ligação que o coletor recusou sumia sem uma linha em lugar nenhum. */}
      {(cofre.vencidos.length > 0 || cofre.recusados.length > 0
        || cofre.truncados.length > 0 || cofre.arestas_recusadas.length > 0) && (
        <div data-cofre-vencidos className="mb-3 rounded-lg border border-vermelho/30 bg-vermelho/8 px-3 py-2.5 text-[11px] leading-relaxed text-tinta-2">
          <span className="font-mono uppercase tracking-[.16em] text-vermelho">Conferência.</span>{' '}
          {cofre.vencidos.length > 0 && `${cofre.vencidos.length} registro(s) com âncora que não confere mais na fonte; ficam no mapa em traço interrompido, porque cofre que encolhe sozinho esconde o erro. `}
          {cofre.recusados.length > 0 && `${cofre.recusados.length} registro(s) recusado(s) na leitura. `}
          {cofre.truncados.length > 0 && `${cofre.truncados.length} bloco(s) bateram no teto de 60 linhas: ali o número de linhas é o LIMITE, não a medida. `}
          {cofre.arestas_recusadas.length > 0 && `${cofre.arestas_recusadas.length} ligação(ões) declarada(s) e recusada(s), por não estarem escritas na fonte de quem liga.`}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi rotulo="aprendizados" valor={nos.length} nota={cofre.arquivos === null ? undefined : `de ${cofre.arquivos} arquivo(s) de origem`} />
        {/* "ligações declaradas" era cortado em "LIGAÇÕES DECLARAD…" em 390px:
            o rótulo do cartão trunca. O que qualifica o número foi pra nota. */}
        <Kpi rotulo="ligações" valor={cofre.conexoes} nota={`declaradas na fonte · ${cofre.arestas.filter((a) => a.ponte).length} atravessam áreas`} />
        <Kpi rotulo="grau médio" valor={cofre.grau_medio} nota="ligações por aprendizado" />
        <Kpi rotulo="famílias" valor={cofre.familias.length} nota={`${cofre.areas.length} áreas`} />
        <Kpi rotulo="amarrados" valor={cofre.cobertura === null ? null : `${cofre.cobertura}%`} cor={baixa ? 'text-ambar' : 'text-verde'} nota="têm ao menos uma ligação" />
      </div>

      {/* `items-start` porque as três colunas têm alturas naturais bem
          diferentes: esticadas, o mapa ganhava um vazio do tamanho da ficha. */}
      <div className="grid items-start gap-3 lg:grid-cols-[168px_minmax(0,1fr)_296px]">
        <aside className="carta p-3.5">
          <Cabecalho cor="var(--color-lima)" meta={areaFoco ? 'filtrando' : undefined}>áreas</Cabecalho>
          <ul className="space-y-1">
            {cofre.areas.map((a) => {
              const fixa = a.sempre_visivel === true || a.id === 'transversal'
              const so = areaFoco === a.id
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    data-filtro-area={fixa ? undefined : ''} data-area={a.id}
                    aria-pressed={so}
                    disabled={fixa}
                    title={fixa ? 'transversal nunca é filtrada: é a ponte entre as áreas' : so ? 'mostrar o mapa inteiro' : 'ver só esta área, preservando as pontes'}
                    onClick={() => !fixa && setAreaFoco(so ? null : a.id)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors duration-200 ${so ? 'border-lima/45 bg-lima/10' : 'border-transparent hover:border-linha'} ${fixa ? 'cursor-default opacity-90' : ''}`}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: corDaArea(a.id) }} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-tinta-2">{a.nome}</span>
                    <span className="font-mono text-[10px] text-tinta-3">{a.total}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-tinta-3">
            Clique numa área para ver só ela. Transversal fica sempre, e a ponte para fora continua no mapa, em traço interrompido com a outra ponta vazada.
          </p>

          <div className="mt-4 border-t border-linha pt-3">
            <Cabecalho cor="var(--color-ciano)">quem aprendeu</Cabecalho>
            <ul className="space-y-1">
              {autores.map(([quem, quantos]) => (
                <li key={quem} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-tinta-2">{quem}</span>
                  <span className="font-mono text-[10px] text-tinta-3">{quantos}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="carta overflow-hidden p-3">
          <Cabecalho cor="var(--color-lima)" meta={`${cofre.conexoes} ligações`}>
            mapa dos aprendizados
          </Cabecalho>
          <Mapa
            nos={nos} arestas={cofre.arestas} caixa={estreito ? CAIXA_CELULAR : CAIXA_MESA}
            ordemAreas={ordemAreas}
            escolhido={atual.id} alvo={alvo} areaFoco={areaFoco} sempreVisiveis={sempreVisiveis}
            caminho={caminho} aoEscolher={escolher} aoLigar={ligar}
          />
        </section>

        <aside data-ficha-cofre className="carta p-4">
          <Cabecalho cor="var(--color-ciano)" meta={<span data-ficha-especie>{atual.especie}</span>}>
            ficha do aprendizado
          </Cabecalho>
          <h2 className="font-serif text-[23px] leading-tight text-tinta">{atual.rotulo}</h2>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-ficha-autor className="text-[12px] text-tinta">
              <span className="rotulo mr-1.5">quem</span>{atual.autor}
            </span>
            <span data-ficha-quando className="font-mono text-[10px] text-tinta-3">
              {atual.quando.split('-').reverse().join('/')}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* A pílula da área leva a MESMA cor do círculo no mapa: sem isso a
                pessoa precisa decorar a legenda pra ligar ficha e desenho. */}
            <span data-ficha-area className="inline-flex items-center gap-1.5 rounded-full border border-linha-forte px-2 py-[3px]">
              <span className="size-[5px] rounded-full" style={{ background: corDaArea(atual.area) }} />
              <span className="font-mono text-[9px] leading-none uppercase tracking-[0.14em] text-tinta-2">{areaAtual?.nome ?? atual.area}</span>
            </span>
            <span data-ficha-familia><Pilula tom="lima">{familia?.nome ?? atual.familia}</Pilula></span>
            {atual.vencido && <Pilula tom="vermelho">âncora vencida</Pilula>}
          </div>

          <div className="my-3.5 grid grid-cols-3 gap-2">
            <div data-ficha-peso className="poco p-2.5">
              <div className="rotulo mb-1.5">peso</div>
              <div className="font-serif text-xl">{atual.peso}<span className="text-[11px] text-tinta-3">/5</span></div>
            </div>
            <div className="poco p-2.5">
              <div className="rotulo mb-1.5">ligações</div>
              <div className="font-serif text-xl">{atual.grau}</div>
            </div>
            <div className="poco p-2.5">
              <div className="rotulo mb-1.5">linhas</div>
              <div className="font-serif text-xl">
                {atual.linhas || '—'}
                {truncado && <span className="ml-1 text-[10px] text-ambar" title="o bloco bateu no teto de 60 linhas: este número é o limite, não a medida">no teto</span>}
              </div>
            </div>
          </div>

          <p data-ficha-corpo className="text-[12px] leading-relaxed text-tinta-2">{atual.corpo}</p>
          <div data-ficha-caso className="mt-3 rounded-md border border-linha bg-white/3 p-2.5">
            <div className="rotulo mb-1.5">o caso</div>
            <p className="text-[11px] leading-relaxed text-tinta-2">{atual.caso}</p>
          </div>
          <p className="mt-2 break-all font-mono text-[10px] text-tinta-3">{atual.arquivo}</p>

          {caminho !== null && alvoNo && (
            <div data-caminho-cofre className="mt-3.5 rounded-md border border-vermelho/30 bg-vermelho/6 p-2.5">
              <div className="rotulo mb-1.5 text-vermelho">caminho até {alvoNo.rotulo}</div>
              <ol className="space-y-1.5">
                {caminho.slice(1).map((id, i) => (
                  <li data-caminho-salto key={id} className="text-[11px] leading-relaxed text-tinta-2">
                    <button type="button" className="text-left font-medium text-tinta underline decoration-linha-forte underline-offset-2" onClick={() => escolher(id)}>
                      {nome(id)}
                    </button>
                    <span className="block font-mono text-[9px] text-tinta-3">porque: {porqueDoSalto(caminho[i], id)}</span>
                  </li>
                ))}
              </ol>
              <button type="button" className="rotulo mt-2 underline underline-offset-2" onClick={() => setAlvo(null)}>limpar caminho</button>
            </div>
          )}
          {caminho === null && alvoNo && (
            <div data-caminho-cofre className="mt-3.5 rounded-md border border-ambar/30 bg-ambar/8 p-2.5 text-[11px] leading-relaxed text-tinta-2">
              Não há ligação declarada entre este aprendizado e <span className="text-tinta">{alvoNo.rotulo}</span>. A tela não aproxima por semelhança: sem caminho escrito na fonte, não há caminho.
              <button type="button" className="rotulo mt-2 block underline underline-offset-2" onClick={() => setAlvo(null)}>limpar</button>
            </div>
          )}

          <div className="mt-4 space-y-3.5">
            <div>
              <div className="rotulo mb-2">conecta com</div>
              <div className="flex flex-wrap gap-1.5">
                {saem.length ? saem.map((a) => (
                  <button type="button" key={`${a.de}:${a.para}`} title={a.porque} onClick={() => escolher(a.para)}>
                    <Pilula tom="lima">{curto(a.para)}</Pilula>
                  </button>
                )) : <span className="text-xs text-tinta-3">não liga em nenhum outro</span>}
              </div>
            </div>
            <div>
              <div className="rotulo mb-2">citado por</div>
              <div className="flex flex-wrap gap-1.5">
                {entram.length ? entram.map((a) => (
                  <button type="button" key={`${a.de}:${a.para}`} title={a.porque} onClick={() => escolher(a.de)}>
                    <Pilula tom="neutro">{curto(a.de)}</Pilula>
                  </button>
                )) : <span className="text-xs text-tinta-3">ninguém liga aqui ainda</span>}
              </div>
            </div>
            {/* ‼️ ESTA FRASE JÁ FOI FALSA TRÊS VEZES, e as três pelo mesmo
                mecanismo: alguém descreve a INTENÇÃO da trava em vez do que ela
                faz. A primeira dizia "conteúdo não é enviado ao navegador",
                quando `corpo` e `caso` passaram a ir. A segunda dizia que TODO
                texto passa pela trava e que o reprovado vira registro recusado:
                o QA mediu e eram três exageros, um deles que o `porque` não
                passava pela trava (verdade na época), mais o que ela pega virar
                nó MASCARADO (recusa é a exceção) e o corte de 96/420 acontecer
                sem reticência. A TERCEIRA foi essa ressalva SOBREVIVENDO ao
                conserto: em 10/09/2026, 16:19 UTC, `_cofre_razao` passou a
                chamar `_cofre_texto`, e a nota seguiu avisando que a razão NÃO
                passava, que é promessa de privacidade ao contrário (o leitor
                desconfia da trava certa, ou escreve nome achando que não vai
                pra tela nenhuma). Medido no coletor em 10/09: no campo
                `porque`, nome da lista vira `[cliente]`, e-mail vira
                `[e-mail]`, dígito longo vira `[num:...]`, e o corte é em 420.
                O que está escrito abaixo é o que dá pra medir hoje no coletor,
                não o que a trava pretende. */}
            <div className="border-t border-linha pt-3 font-mono text-[10px] leading-relaxed text-tinta-3">
              Sai daqui o registro e o endereço dele na fonte (arquivo e linha, logo acima), não o arquivo. Título, corpo, caso e autor passam pela trava de nome de cliente do coletor, que troca nome por <span className="text-tinta-2">[cliente]</span>, número longo colado por <span className="text-tinta-2">[num]</span> e e-mail por <span className="text-tinta-2">[e-mail]</span>, e corta em 96, 420 e 40 caracteres sem avisar no texto.
              <span className="mt-1.5 block text-ambar">A razão da ligação também passa por essa trava, com uma diferença de ordem: a prova de que a frase está escrita na fonte roda contra o texto cru, e a máscara vem depois, senão nenhuma ligação casaria com o arquivo. O que a trava não alcança é nome que não está na lista de clientes do coletor: esse sai inteiro. E como a razão é citação literal da fonte, quem escreve o registro responde pelo que põe ali.</span>
            </div>
          </div>
        </aside>
      </div>

      {/* A fronteira da tela vem de `nav/rotas.ts`, como nas outras parciais: o
          Cofre só sabe o que alguém declarou em `cofre.json`. */}
      <Parcial dado={vista.dado} />
    </div>
  )
}
