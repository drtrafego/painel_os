import { useEffect, useMemo, useRef, useState } from 'react'
import { ALFA_PARADA, montarGrafo, moldura, passo, raioDoPeso, type Grafo as GrafoDados, type No } from '../dados/grafo'
import { IDENTIDADE, SUPERFICIE } from './paleta'
import type { Aresta } from '../dados/tipos'

const COR_DO_TIPO: Record<No['tipo'], string> = {
  sessao: IDENTIDADE.lima,
  agente: IDENTIDADE.ciano,
  'sem-cargo': IDENTIDADE.pervinca,
  desconhecido: SUPERFICIE.tinta2,
}

/**
 * O grafo de quem convoca quem, em SVG escrito a mao.
 *
 * O layout e `dados/grafo.ts`; aqui so se desenha. O rAF PARA quando a energia
 * cai: grafo que roda pra sempre gasta bateria numa tela que ja parou.
 *
 * ‼️ O QUE ESTE GRAFO NAO DIZ: para QUE cada chamada foi feita. A descricao que
 * o chamador escreve nao descreve o assunto de verdade (uma descrita como
 * "vale juntar os agentes num so?" era sobre outra coisa inteiramente). Entao
 * daqui sai QUEM chamou QUEM e QUANTAS vezes, e nada mais. Nao existe rotulo
 * de intencao neste componente, e nao e esquecimento.
 */
export function Grafo({
  arestas,
  temCargo,
  selecionado,
  aoSelecionar,
  altura = 380,
}: {
  arestas: Aresta[]
  temCargo: (nome: string) => boolean
  selecionado: string | null
  aoSelecionar: (id: string | null) => void
  altura?: number
}) {
  const [, redesenhar] = useState(0)
  const grafo = useRef<GrafoDados | null>(null)
  const quadro = useRef(0)

  // Remonta so quando as arestas mudam de verdade: com a identidade do array,
  // cada busca do estado reiniciaria o layout e os nos pulariam de lugar,
  // fazendo parecer que o dado mudou quando so a referencia mudou.
  const assinatura = useMemo(
    () => arestas.map((a) => `${a.de}>${a.para}:${a.vezes}`).join('|'),
    [arestas],
  )

  useEffect(() => {
    grafo.current = montarGrafo(arestas, temCargo)
    const g = grafo.current
    const maior = Math.max(...g.nos.map((n) => n.peso), 1)
    const raio = (p: number) => raioDoPeso(p, maior)
    let vivos = 0
    const girar = () => {
      const alfa = passo(g, raio)
      redesenhar((n) => n + 1)
      vivos += 1
      // Para pelo alfa OU por teto de quadros. O alfa esfria por construcao,
      // entao a parada e garantida; o teto e o segundo freio, pra um caso
      // patologico nao girar o rAF a noite inteira.
      if (alfa > ALFA_PARADA && vivos < 900) quadro.current = requestAnimationFrame(girar)
    }
    quadro.current = requestAnimationFrame(girar)
    return () => cancelAnimationFrame(quadro.current)
    // `assinatura` e o que decide; `arestas` e `temCargo` entram por ela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura])

  const g = grafo.current
  if (!g || g.nos.length === 0) {
    return (
      <p className="carta p-4 text-[12px] leading-[1.55] text-tinta-2">
        Não há nenhuma aresta para desenhar. Isso quer dizer que o estado é anterior a 08/09/2026,
        quando o coletor passou a registrar quem convocou quem, e não que ninguém convocou ninguém.
      </p>
    )
  }

  const maior = Math.max(...g.nos.map((n) => n.peso), 1)
  const caixa = moldura(g)
  const vizinhos = new Set<string>()
  if (selecionado) {
    for (const a of g.arestas) {
      if (a.de === selecionado) vizinhos.add(a.para)
      if (a.para === selecionado) vizinhos.add(a.de)
    }
  }
  const porId = new Map(g.nos.map((n) => [n.id, n]))
  const maiorAresta = Math.max(...g.arestas.map((a) => a.vezes), 1)

  return (
    <div className="w-full">
      <svg
        viewBox={`${caixa.x} ${caixa.y} ${caixa.w} ${caixa.h}`}
        style={{ height: altura }}
        className="w-full touch-none"
        role="img"
        aria-label={`Grafo de convocação com ${g.nos.length} agentes e ${g.arestas.length} ligações`}
      >
        <defs>
          {/* Papel milimetrado tênue + brilho radial no Azul Fumaça oficial.
              Sem essas duas camadas o canvas fica chapado e morto. */}
          <pattern id="milimetrado" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0V26" fill="none" stroke="var(--color-linha)" strokeWidth="0.6" opacity="0.5" />
          </pattern>
          <radialGradient id="brilho-grafo" cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor={IDENTIDADE.ciano} stopOpacity="0.2" />
            <stop offset="100%" stopColor={IDENTIDADE.ciano} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x={caixa.x} y={caixa.y} width={caixa.w} height={caixa.h} fill="url(#milimetrado)" />
        <rect x={caixa.x} y={caixa.y} width={caixa.w} height={caixa.h} fill="url(#brilho-grafo)" />

        {g.arestas.map((a) => {
          const de = porId.get(a.de)
          const para = porId.get(a.para)
          if (!de || !para) return null
          const nela = selecionado === a.de || selecionado === a.para
          return (
            <line
              key={`${a.de}>${a.para}`}
              x1={de.x}
              y1={de.y}
              x2={para.x}
              y2={para.y}
              stroke={nela ? 'var(--color-tinta)' : COR_DO_TIPO[de.tipo]}
              strokeWidth={0.5 + (a.vezes / maiorAresta) * 2.6}
              strokeLinecap="round"
              opacity={selecionado ? (nela ? 0.8 : 0.07) : 0.24}
            />
          )
        })}

        {g.nos.map((n) => {
          const r = raioDoPeso(n.peso, maior)
          const eu = selecionado === n.id
          const perto = eu || vizinhos.has(n.id)
          const apagado = selecionado !== null && !perto
          const rotulo = perto || (!selecionado && r > 13)
          return (
            <g
              key={n.id}
              transform={`translate(${n.x} ${n.y})`}
              opacity={apagado ? 0.2 : 1}
              tabIndex={0}
              role="button"
              aria-pressed={eu}
              aria-label={`${n.id}, ${n.peso} convocações`}
              className="cursor-pointer outline-none focus-visible:opacity-100"
              onClick={() => aoSelecionar(eu ? null : n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  aoSelecionar(eu ? null : n.id)
                }
              }}
            >
              {eu && <circle r={r + 5} fill="none" stroke="var(--color-tinta)" strokeWidth="1.4" opacity="0.85" />}
              <circle
                r={eu ? r + 1.5 : r}
                fill={COR_DO_TIPO[n.tipo]}
                fillOpacity={eu ? 0.95 : 0.66}
                stroke={COR_DO_TIPO[n.tipo]}
                strokeWidth="1"
              />
              {rotulo && (
                <g transform={`translate(0 ${r + 13})`}>
                  <rect
                    x={-(n.id.length * 3.1 + 6)}
                    y={-8}
                    width={n.id.length * 6.2 + 12}
                    height={14}
                    rx={4}
                    fill="var(--color-topo)"
                    opacity={eu ? 0.95 : 0.72}
                  />
                  <text
                    textAnchor="middle"
                    y={2}
                    fontSize="9"
                    fontFamily="var(--font-mono)"
                    fill={eu ? 'var(--color-tinta)' : 'var(--color-tinta-2)'}
                  >
                    {n.id}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
      <p className="rotulo mt-2">
        toque num nó para ver quem ele convoca e quem convoca ele
        {selecionado ? ' · toque de novo para soltar' : ''}
      </p>
    </div>
  )
}
