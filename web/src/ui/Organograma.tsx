import { useMemo } from 'react'
import type { Aresta } from '../dados/tipos'

type No = {
  id: string
  tipo: 'sessao' | 'agente' | 'sem-cargo'
  peso: number
  x: number
  y: number
}

const COR = {
  sessao: 'var(--color-lima)',
  agente: 'var(--color-ciano)',
  'sem-cargo': 'var(--color-pervinca)',
}

/**
 * A mesma rede medida nos transcripts, organizada em camadas legiveis.
 *
 * Isto nao e uma cadeia de mando inventada. As sessoes ficam na capa, os
 * cargos da casa na camada seguinte e os nomes sem cargo na ultima. As linhas
 * continuam sendo as convocacoes reais, inclusive quando ligam dois agentes
 * da mesma camada.
 */
export function Organograma({
  arestas,
  temCargo,
  selecionado,
  aoSelecionar,
}: {
  arestas: Aresta[]
  temCargo: (nome: string) => boolean
  selecionado: string | null
  aoSelecionar: (id: string | null) => void
}) {
  const desenho = useMemo(() => montar(arestas, temCargo), [arestas, temCargo])

  if (desenho.nos.length === 0) {
    return (
      <p className="p-4 text-[12px] leading-[1.55] text-tinta-2">
        Não há nenhuma ligação para organizar. O estado é anterior à coleta de quem convocou quem,
        não uma prova de que ninguém trabalhou.
      </p>
    )
  }

  const porId = new Map(desenho.nos.map((no) => [no.id, no]))
  const vizinhos = new Set<string>()
  if (selecionado) {
    for (const a of arestas) {
      if (a.de === selecionado) vizinhos.add(a.para)
      if (a.para === selecionado) vizinhos.add(a.de)
    }
  }
  const maior = Math.max(...arestas.map((a) => a.vezes), 1)

  return (
    <div className="w-full overflow-x-auto pb-2" data-organograma>
      <svg
        viewBox={`0 0 ${desenho.largura} ${desenho.altura}`}
        className="min-w-[760px] w-full"
        style={{ aspectRatio: `${desenho.largura} / ${desenho.altura}` }}
        role="img"
        aria-label={`Organograma de convocação com ${desenho.nos.length} nomes e ${arestas.length} ligações`}
      >
        <defs>
          <pattern id="grade-organograma" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0V26" fill="none" stroke="var(--color-linha)" strokeWidth="0.6" opacity="0.45" />
          </pattern>
          <radialGradient id="brilho-organograma" cx="50%" cy="8%" r="78%">
            <stop offset="0%" stopColor="var(--color-ciano)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-ciano)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={desenho.largura} height={desenho.altura} rx="10" fill="url(#grade-organograma)" />
        <rect width={desenho.largura} height={desenho.altura} rx="10" fill="url(#brilho-organograma)" />

        {arestas.map((a) => {
          const de = porId.get(a.de)
          const para = porId.get(a.para)
          if (!de || !para || de.id === para.id) return null
          const ativa = selecionado === a.de || selecionado === a.para
          const meio = (de.y + para.y) / 2 + 25
          return (
            <path
              data-ligacao
              key={`${a.de}>${a.para}`}
              d={`M ${de.x} ${de.y + 52} V ${meio} H ${para.x} V ${para.y}`}
              fill="none"
              stroke={ativa ? 'var(--color-tinta)' : COR[de.tipo]}
              strokeWidth={0.7 + (a.vezes / maior) * 2.3}
              opacity={selecionado ? (ativa ? 0.8 : 0.055) : 0.22}
            />
          )
        })}

        {desenho.nos.map((no) => {
          const eu = no.id === selecionado
          const apagado = selecionado !== null && !eu && !vizinhos.has(no.id)
          return (
            <g
              data-no-organograma
              key={no.id}
              transform={`translate(${no.x - 58} ${no.y})`}
              opacity={apagado ? 0.2 : 1}
              role="button"
              tabIndex={0}
              aria-pressed={eu}
              aria-label={`${no.id}, ${no.peso} convocações`}
              className="cursor-pointer outline-none"
              onClick={() => aoSelecionar(eu ? null : no.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  aoSelecionar(eu ? null : no.id)
                }
              }}
            >
              <rect
                width="116"
                height="52"
                rx="7"
                fill={eu ? 'var(--color-carta-heroi)' : 'var(--color-carta)'}
                stroke={eu ? 'var(--color-tinta)' : COR[no.tipo]}
                strokeWidth={eu ? 1.5 : 0.8}
              />
              <circle cx="12" cy="13" r="3" fill={COR[no.tipo]} />
              <text x="21" y="16" fontSize="8" fontFamily="var(--font-mono)" fill="var(--color-tinta-3)">
                {no.tipo === 'sessao' ? 'CAPA' : no.tipo === 'agente' ? 'AGENTE' : 'SEM CARGO'}
              </text>
              <text x="10" y="33" fontSize="10" fontWeight="600" fill="var(--color-tinta)">
                {encurtar(no.id, 17)}
              </text>
              <text x="10" y="45" fontSize="7.5" fontFamily="var(--font-mono)" fill="var(--color-tinta-2)">
                {no.peso} chamada{no.peso === 1 ? '' : 's'}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="rotulo mt-2">arraste para os lados · toque numa ficha para abrir as ligações</p>
    </div>
  )
}

function encurtar(texto: string, limite: number) {
  return texto.length <= limite ? texto : `${texto.slice(0, limite - 1)}…`
}

function montar(arestas: Aresta[], temCargo: (nome: string) => boolean) {
  const tipos = new Map<string, No['tipo']>()
  const pesos = new Map<string, number>()
  for (const a of arestas) {
    tipos.set(a.de, a.de_tipo === 'sessao' ? 'sessao' : temCargo(a.de) ? 'agente' : 'sem-cargo')
    if (!tipos.has(a.para)) tipos.set(a.para, temCargo(a.para) ? 'agente' : 'sem-cargo')
    pesos.set(a.de, (pesos.get(a.de) ?? 0) + a.vezes)
    pesos.set(a.para, (pesos.get(a.para) ?? 0) + a.vezes)
  }

  const grupos = (['sessao', 'agente', 'sem-cargo'] as const).map((tipo) =>
    [...tipos.entries()]
      .filter(([, t]) => t === tipo)
      .map(([id]) => id)
      .sort((a, b) => (pesos.get(b) ?? 0) - (pesos.get(a) ?? 0) || a.localeCompare(b)),
  )
  const largura = 1040
  const colunas = 8
  const nos: No[] = []
  let topo = 24
  grupos.forEach((ids, grupo) => {
    if (ids.length === 0) return
    const cols = grupo === 0 ? Math.min(ids.length, 4) : Math.min(ids.length, colunas)
    const linhas = Math.ceil(ids.length / cols)
    ids.forEach((id, i) => {
      const linha = Math.floor(i / cols)
      const nestaLinha = Math.min(cols, ids.length - linha * cols)
      const coluna = i % cols
      const passo = largura / nestaLinha
      nos.push({
        id,
        tipo: tipos.get(id) ?? 'sem-cargo',
        peso: pesos.get(id) ?? 0,
        x: passo * (coluna + 0.5),
        y: topo + linha * 72,
      })
    })
    topo += linhas * 72 + 54
  })
  return { nos, largura, altura: Math.max(topo - 20, 220) }
}
