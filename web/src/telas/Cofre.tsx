import { useEffect, useMemo, useRef, useState } from 'react'
import {
  arestasDoCaminho, caminhoMaisCurto, corDaArea, diagnosticarLayout, encurtar, escolherRotulos,
  posicionarCofre, raioDeToque, CAIXA_CELULAR, CAIXA_MESA, FONTE_ROTULO, type Caixa, type Posto,
} from '../dados/cofre'
import type { ArestaCofre, NoMemoria } from '../dados/tipos'
import { Parcial } from '../ui/SemDado'
import { Cabecalho, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'
import { Grafo3DCofre } from '../ui/Grafo3DCofre'
import { PainelInstrumentoCofre } from '../ui/PainelInstrumentoCofre'

/**
 * Hook para medir quadros por segundo (FPS) ao vivo via requestAnimationFrame.
 * Faz o painel parecer um instrumento de comando vivo em tempo real.
 */
function useFps(): number {
  const [fps, setFps] = useState(60)
  const quadrosRef = useRef(0)
  const ultimoTempoRef = useRef(performance.now())

  useEffect(() => {
    let handle: number
    const medir = () => {
      quadrosRef.current++
      const agora = performance.now()
      if (agora - ultimoTempoRef.current >= 1000) {
        setFps(Math.round((quadrosRef.current * 1000) / (agora - ultimoTempoRef.current)))
        quadrosRef.current = 0
        ultimoTempoRef.current = agora
      }
      handle = requestAnimationFrame(medir)
    }
    handle = requestAnimationFrame(medir)
    return () => cancelAnimationFrame(handle)
  }, [])

  return fps
}

/**
 * Fundo de Partículas / Rede de Sinapses (Canvas 2D).
 * Inspirado nas referências 21st.dev e Kimi (InteractiveSynapseNetwork).
 * Desenha pontos flutuantes conectando-se por linhas de proximidade sob o grafo.
 */
function SynapseCanvas({ modoComando }: { modoComando: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const largura = (canvas.width = canvas.parentElement?.clientWidth ?? 1000)
    const altura = (canvas.height = canvas.parentElement?.clientHeight ?? 600)

    const qtdParticulas = 45
    const particulas = Array.from({ length: qtdParticulas }, () => ({
      x: Math.random() * largura,
      y: Math.random() * altura,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      raio: Math.random() * 1.8 + 1,
      brilho: Math.random() * 0.5 + 0.3,
    }))

    const render = () => {
      ctx.clearRect(0, 0, largura, altura)

      // Atualiza e desenha partículas
      ctx.fillStyle = modoComando ? '#38BDF8' : '#7A4A0F'
      for (let i = 0; i < qtdParticulas; i++) {
        const p = particulas[i]
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0 || p.x > largura) p.vx *= -1
        if (p.y < 0 || p.y > altura) p.vy *= -1

        ctx.globalAlpha = p.brilho * (modoComando ? 0.7 : 0.25)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.raio, 0, Math.PI * 2)
        ctx.fill()

        // Desenha arestas de proximidade entre partículas
        for (let j = i + 1; j < qtdParticulas; j++) {
          const p2 = particulas[j]
          const dx = p2.x - p.x
          const dy = p2.y - p.y
          const dist = Math.hypot(dx, dy)
          if (dist < 85) {
            ctx.strokeStyle = modoComando ? '#A3E635' : '#3E6E8E'
            ctx.globalAlpha = (1 - dist / 85) * (modoComando ? 0.15 : 0.08)
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }
      }
      ctx.globalAlpha = 1
      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [modoComando])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-60"
    />
  )
}

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

const RAIO_COTO = 4.5

export type ModoLayout = 'multi-anel' | 'orbita' | 'hierarquia'

function Mapa({
  nos, arestas, caixa, ordemAreas, escolhido, alvo, areaFoco, sempreVisiveis, caminho,
  modoLayout, animarSinal, modoComando,
  aoEscolher, aoLigar,
}: {
  nos: NoMemoria[]
  arestas: ArestaCofre[]
  caixa: Caixa
  ordemAreas: string[]
  escolhido: string
  alvo: string | null
  areaFoco: string | null
  sempreVisiveis: string[]
  caminho: string[] | null
  modoLayout: ModoLayout
  animarSinal: boolean
  modoComando: boolean
  aoEscolher: (id: string) => void
  aoLigar: (id: string) => void
}) {
  // Posição base vinda do algoritmo de layout calibrado
  const postosBase = useMemo(
    () => posicionarCofre(nos, caixa, ordemAreas),
    [nos, caixa, ordemAreas],
  )

  // Adaptação opcional de layout conforme seleção no HUD (Orbita / Hierarquia)
  const postos = useMemo(() => {
    if (modoLayout === 'multi-anel') return postosBase

    const cx = caixa.largura / 2
    const cy = caixa.altura / 2
    const mapaAlt = new Map<string, Posto>()

    if (modoLayout === 'orbita') {
      // Distribuição radial concêntrica ordenada por grau de conexão
      const ordenados = [...nos].sort((a, b) => b.grau - a.grau)
      const maxGrau = Math.max(1, ...nos.map((n) => n.grau))
      const total = nos.length

      ordenados.forEach((n, i) => {
        const pBase = postosBase.get(n.id)
        if (!pBase) return
        const frac = 1 - (n.grau / maxGrau) * 0.7
        const rMax = Math.min(caixa.largura, caixa.altura) * 0.42
        const rOrbita = Math.max(40, rMax * (0.2 + frac * 0.8))
        const angulo = (i / total) * 2 * Math.PI - Math.PI / 2
        mapaAlt.set(n.id, {
          ...pBase,
          x: cx + Math.cos(angulo) * rOrbita,
          y: cy + Math.sin(angulo) * rOrbita,
        })
      })
      return mapaAlt
    }

    if (modoLayout === 'hierarquia') {
      // Agrupamento vertical/horizontal por espécie de aprendizado
      // ‼️ CORRIGIDO 21/09/2026: EU TINHA DITO NO README QUE ISSO JÁ ESTAVA
      // CORRIGIDO "NOS DOIS LUGARES" e não estava — só arrumei o
      // Grafo3DCofre.tsx (3D), esqueci esta cópia local do 2D. Achado só
      // porque ele mandou PRINT REAL do resultado (todos os 46 nós caindo
      // no bucket "outro", coluna única, círculos se encostando, o mapa
      // desistiu e caiu pro modo lista). Mesma lista errada, mesmo defeito:
      // zero overlap com as espécies reais (correcao/defeito/medicao/
      // ordem/padrao/trava, medido em data/cofre.json).
      const especies = ['padrao', 'ordem', 'trava', 'correcao', 'defeito', 'medicao']
      const colunas = new Map<string, NoMemoria[]>()
      nos.forEach((n) => {
        const esp = especies.includes(n.especie.toLowerCase()) ? n.especie.toLowerCase() : 'outro'
        const l = colunas.get(esp) ?? []
        l.push(n)
        colunas.set(esp, l)
      })

      const chaves = Array.from(colunas.keys())
      const nCols = chaves.length
      chaves.forEach((esp, colIdx) => {
        const lista = colunas.get(esp) ?? []
        const posX = 60 + (colIdx / Math.max(1, nCols - 1)) * (caixa.largura - 120)
        lista.forEach((n, rowIdx) => {
          const pBase = postosBase.get(n.id)
          if (!pBase) return
          const posY = 70 + (rowIdx / Math.max(1, lista.length)) * (caixa.altura - 140)
          mapaAlt.set(n.id, {
            ...pBase,
            x: posX,
            y: posY,
          })
        })
      })
      return mapaAlt
    }

    return postosBase
  }, [modoLayout, nos, caixa, postosBase])

  const noCaminho = useMemo(() => new Set(caminho ?? []), [caminho])
  const arestasMarcadas = useMemo(() => arestasDoCaminho(caminho), [caminho])
  const area = useMemo(() => new Map(nos.map((n) => [n.id, n.area])), [nos])

  const visivel = (id: string) =>
    areaFoco === null
    || area.get(id) === areaFoco
    || sempreVisiveis.includes(area.get(id) ?? '')
    || noCaminho.has(id)

  const ligados = new Set(
    arestas.filter((a) => a.de === escolhido || a.para === escolhido).flatMap((a) => [a.de, a.para]),
  )

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
  const comoCoube = diagnosticarLayout(postos, caixa)

  // Zoom e Pan
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
    if (Math.hypot(dx, dy) > 4) setMoveu(true)
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

  // Pulso de feixe de luz ao longo do tempo para arestas ativas
  const [fasePulso, setFasePulso] = useState(0)
  useEffect(() => {
    if (!animarSinal) return
    const interval = setInterval(() => {
      setFasePulso((f) => (f + 0.04) % 1)
    }, 30)
    return () => clearInterval(interval)
  }, [animarSinal])

  return (
    <>
      <div className={`relative overflow-hidden rounded border transition-colors duration-300 ${
        modoComando ? 'border-sky-500/30 bg-[#0B0F17]' : 'border-linha bg-carta'
      }`}>
        {/* Canvas 2D de partículas e sinapses */}
        <SynapseCanvas modoComando={modoComando} />

        {/* Controles de Zoom Flutuantes */}
        <div className={`absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded border p-1 shadow-md backdrop-blur-md transition-colors ${
          modoComando ? 'border-sky-500/30 bg-[#0B0F17]/90 text-sky-400' : 'border-linha bg-carta/90 text-tinta'
        }`}>
          <button
            type="button"
            title="Aumentar zoom"
            aria-label="Aumentar zoom"
            onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.25).toFixed(2))))}
            className="flex h-7 w-7 items-center justify-center rounded border border-linha/50 text-xs font-bold hover:bg-white/10 active:scale-95"
          >
            +
          </button>
          <button
            type="button"
            title="Diminuir zoom"
            aria-label="Diminuir zoom"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.25).toFixed(2))))}
            className="flex h-7 w-7 items-center justify-center rounded border border-linha/50 text-xs font-bold hover:bg-white/10 active:scale-95"
          >
            −
          </button>
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              title="Restaurar visualização original (100%)"
              aria-label="Restaurar visualização original"
              onClick={resetarNavegacao}
              className="rounded border border-linha/50 px-2 py-1 font-mono text-[10px] hover:bg-white/10 active:scale-95"
            >
              {Math.round(zoom * 100)}% · Reset
            </button>
          )}
        </div>

        <svg
          data-grafo-cofre
          role="group"
          aria-label="Mapa dos aprendizados da operação e das ligações declaradas entre eles"
          viewBox={`0 0 ${caixa.largura} ${caixa.altura}`}
          className="relative z-10 h-auto w-full touch-none select-none cursor-grab active:cursor-grabbing"
          onWheel={aoRolar}
          onPointerDown={aoIniciarArrasto}
          onPointerMove={aoArrastar}
          onPointerUp={aoFinalizarArrasto}
          onPointerCancel={aoFinalizarArrasto}
        >
          <defs>
            <marker id="seta-cofre" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={modoComando ? '#38BDF8' : 'var(--color-linha-forte)'} />
            </marker>
            <radialGradient id="brilho-cofre">
              <stop offset="0" stopColor={modoComando ? '#A3E635' : 'var(--color-lima)'} stopOpacity={modoComando ? '0.22' : '0.13'} />
              <stop offset="1" stopColor={modoComando ? '#38BDF8' : 'var(--color-lima)'} stopOpacity="0" />
            </radialGradient>
            <filter id="glow-neon" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          <g transform={zoom !== 1 || pan.x !== 0 || pan.y !== 0
            ? `translate(${caixa.largura / 2 + pan.x}, ${caixa.altura / 2 + pan.y}) scale(${zoom}) translate(${-caixa.largura / 2}, ${-caixa.altura / 2})`
            : undefined}
          >
            <circle cx={caixa.largura / 2} cy={caixa.altura / 2} r={Math.min(caixa.largura, caixa.altura) * 0.36} fill="url(#brilho-cofre)" />

            {/* Renderização das Arestas com Iluminação & Sinal Neon */}
            {arestasVisiveis.map((a) => {
              const de = posicao(a.de)
              const para = posicao(a.para)
              if (!de || !para) return null
              const emCaminho = arestasMarcadas.has(`${a.de}|${a.para}`)
              const ativa = a.de === escolhido || a.para === escolhido
              const cortada = !visivel(a.de) || !visivel(a.para)

              // Posição calculada do feixe itinerante de luz
              const pulseX = de.x + (para.x - de.x) * fasePulso
              const pulseY = de.y + (para.y - de.y) * fasePulso

              return (
                <g key={`${a.de}:${a.para}`}>
                  <line
                    data-aresta-cofre
                    data-de={a.de}
                    data-para={a.para}
                    data-ponte={String(a.ponte)}
                    data-de-area={area.get(a.de)}
                    data-para-area={area.get(a.para)}
                    data-no-caminho={String(emCaminho)}
                    x1={de.x} y1={de.y} x2={para.x} y2={para.y}
                    stroke={
                      emCaminho
                        ? (modoComando ? '#EF4444' : 'var(--color-vermelho)')
                        : ativa
                        ? (modoComando ? '#A3E635' : 'var(--color-lima)')
                        : (modoComando ? '#38BDF8' : 'var(--color-linha-forte)')
                    }
                    strokeOpacity={emCaminho ? 0.95 : ativa ? 0.85 : cortada ? 0.22 : (modoComando ? 0.45 : 0.3)}
                    strokeWidth={emCaminho ? 2.8 : ativa ? 2.0 : 1}
                    strokeDasharray={cortada ? '5 3' : undefined}
                    className={ativa || emCaminho ? 'glow-aresta' : undefined}
                    markerEnd={emCaminho ? undefined : 'url(#seta-cofre)'}
                  >
                    <title>{`${a.porque}${a.ponte ? ' (ponte entre áreas)' : ''}`}</title>
                  </line>

                  {/* Feixe de Luz / Pulso Neon Itinerante quando ativo ou no caminho */}
                  {animarSinal && (ativa || emCaminho) && !cortada && (
                    <circle
                      cx={pulseX}
                      cy={pulseY}
                      r={3}
                      fill={emCaminho ? '#EF4444' : '#A3E635'}
                      className="glow-no"
                    />
                  )}
                </g>
              )
            })}

            {/* Cotos de Ponte */}
            {[...cotos].map((id) => {
              const q = posicao(id)
              if (!q) return null
              return (
                <circle
                  data-ponte-coto key={`coto-${id}`} data-area={area.get(id)}
                  cx={q.x} cy={q.y} r={RAIO_COTO} fill={modoComando ? '#0B0F17' : 'var(--color-carta)'} opacity={0.8}
                  stroke={corDaArea(area.get(id) ?? '')} strokeWidth={1.3} strokeDasharray="3 2"
                >
                  <title>{`ponte para a área ${area.get(id)}, escondida pelo filtro`}</title>
                </circle>
              )
            })}

            {/* Renderização dos Nós com Halo & Brilho Neon */}
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
                  className="cursor-pointer"
                >
                  <title>{`${no.rotulo} · ${no.especie} · ${no.autor}, ${no.quando} · ${no.grau} ligações`}</title>

                  {/* Alvo de Toque WCAG 2.5.8 (invisível de até 24x24px / 12px raio) */}
                  <circle
                    data-alvo-toque cx={q.x} cy={q.y}
                    r={Number(raioDeToque(q.raio, comoCoube.menorDistancia).toFixed(2))}
                    fill="transparent"
                  />

                  {/* Halo Pulsante Neon quando selecionado ou alvo */}
                  {(ativo || ehAlvo || noCaminho.has(no.id)) && (
                    <circle
                      cx={q.x} cy={q.y} r={q.raio + 9}
                      fill={ehAlvo || noCaminho.has(no.id) ? '#EF4444' : cor}
                      opacity={modoComando ? 0.35 : 0.18}
                      className="glow-no animate-pulse"
                    />
                  )}

                  {/* Anel Externo de Destaque */}
                  {ativo && (
                    <circle
                      cx={q.x} cy={q.y} r={q.raio + 4}
                      fill="none"
                      stroke={modoComando ? '#A3E635' : 'var(--color-tinta)'}
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                    />
                  )}

                  {/* Círculo do Nó Desenhado (preserva o piso RAIO_MINIMO_CLICAVEL = 3.5) */}
                  <circle
                    data-corpo-no data-area={no.area} data-grau={no.grau}
                    cx={q.x} cy={q.y} r={Number(q.raio.toFixed(2))} fill={cor}
                    opacity={no.vencido ? 0.35 : ativo ? 1 : (modoComando ? 0.95 : 0.85)}
                    stroke={ativo ? (modoComando ? '#FFFFFF' : 'var(--color-tinta)') : (modoComando ? '#0B0F17' : 'var(--color-carta)')}
                    strokeWidth={ativo ? 2.2 : 1}
                    strokeDasharray={no.vencido ? '3 2' : undefined}
                    filter={ativo || modoComando ? 'url(#glow-neon)' : undefined}
                  />
                </g>
              )
            })}

            {/* Rótulos de Texto */}
            {rotulos.map((r) => {
              const ativo = r.id === escolhido || r.id === alvo || noCaminho.has(r.id)
              return (
                <text
                  data-rotulo-cofre data-id={r.id} key={`rotulo-${r.id}`}
                  x={r.x} y={r.y} textAnchor={r.ancora}
                  fill={
                    ativo
                      ? (modoComando ? '#FACC15' : 'var(--color-tinta)')
                      : (modoComando ? '#94A3B8' : 'var(--color-tinta-2)')
                  }
                  fontSize={caixa.fonteRotulo ?? FONTE_ROTULO} fontFamily="var(--font-mono)"
                  fontWeight={ativo ? '600' : '400'}
                  className="pointer-events-none select-none"
                >
                  {r.texto}
                </text>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Alerta de Ajuste Automático Residual */}
      <p className={`mt-1.5 font-mono text-[9px] leading-relaxed ${modoComando ? 'text-slate-400' : 'text-tinta-3'}`}>
        Tamanho do círculo = {areaFoco === null
          ? 'ligações declaradas'
          : 'TODAS as ligações declaradas, inclusive as que o filtro tirou do desenho'} · cor = área ·{' '}
        <kbd className={`rounded border px-1 ${modoComando ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-linha text-tinta'}`}>Shift</kbd>+clique num segundo nó mostra o caminho entre os dois.
        {' '}<span className={modoComando ? 'text-sky-300 font-semibold' : 'text-tinta-2'}>{rotulos.length} de {visiveis} nomes cabem neste tamanho</span>; o resto fica no título do nó e na ficha ao lado.
        {areaFoco !== null && (
          <> Com o filtro ligado, a ponte que <span className={modoComando ? 'text-sky-300 font-semibold' : 'text-tinta-2'}>sai desta área</span> continua desenhada e a ponta de fora vira anel vazado{cotos.size > 0 ? `: ${cotos.size} aprendizado(s) de outras áreas aparecem assim` : ''}. Ponte entre duas áreas que saíram volta quando o filtro sai.
            {' '}A ficha ao lado continua listando todas.</>
        )}
        {(comoCoube.colados > 0 || comoCoube.fora > 0) && (
          <span data-mapa-apertado className="mt-1 block text-ambar font-semibold">
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
  const fps = useFps()

  const [escolhido, setEscolhido] = useState('')
  const [alvo, setAlvo] = useState<string | null>(null)
  const [areaFoco, setAreaFoco] = useState<string | null>(null)
  const [termoBusca, setTermoBusca] = useState('')

  // Modos de Visualização Futuristas (Estilo Kimi/JARVIS)
  // ‼️ PADRÃO MUDOU PRA true EM 20/09/2026: o visual futurista (SynapseCanvas,
  // HUD, glow neon) só aparecia depois de clicar num botão, escondido atrás
  // de um toggle que nascia desligado. Ele nunca clicou, achou que "não tinha
  // nada de futurista implementado" quando na verdade já estava tudo pronto,
  // só nunca visível de cara. Agora é o padrão; quem quiser o modo sépia
  // original desliga manual, e a preferência continua salva por navegador.
  const [modoComando, setModoComando] = useState(() => {
    try {
      const salvo = localStorage.getItem('painel_os:cofre_modo_comando')
      return salvo === null ? true : salvo === 'true'
    } catch {
      return true
    }
  })
  const [modoLayout, setModoLayout] = useState<ModoLayout>('multi-anel')
  const [animarSinal, setAnimarSinal] = useState(true)

  // ‼️ SIDEBAR DE ÁREAS RECOLHÍVEL POR PADRÃO (item 3 do briefing, 20/09/2026):
  // o grafo é "a parte mais importante da tela" (cobrado pelo dono) e não pode
  // competir em pé de igualdade com painel de texto. Recolhida por padrão libera
  // ~140px pro grafo; expande com um clique e a preferência fica salva.
  const [areasAbertas, setAreasAbertas] = useState(() => {
    try {
      return localStorage.getItem('painel_os:cofre_areas_abertas') === 'true'
    } catch {
      return false
    }
  })
  const alternarAreasAbertas = () => {
    setAreasAbertas((prev) => {
      const prox = !prev
      try {
        localStorage.setItem('painel_os:cofre_areas_abertas', String(prox))
      } catch {}
      return prox
    })
  }

  const alternarModoComando = () => {
    setModoComando((prev) => {
      const prox = !prev
      try {
        localStorage.setItem('painel_os:cofre_modo_comando', String(prox))
      } catch {}
      return prox
    })
  }

  const nos = cofre?.nos ?? []
  useEffect(() => {
    if (!nos.length) return
    if (nos.some((n) => n.id === escolhido)) return
    const centro = [...nos].sort((a, b) => b.grau - a.grau || b.peso - a.peso)[0]
    setEscolhido(centro.id)
  }, [nos, escolhido])

  const caminho = useMemo(
    () => (alvo && escolhido && alvo !== escolhido
      ? caminhoMaisCurto(cofre?.arestas ?? [], escolhido, alvo)
      : null),
    [alvo, escolhido, cofre],
  )

  // Filtro de busca por texto
  const nosFiltradosBusca = useMemo(() => {
    if (!termoBusca.trim()) return []
    const q = termoBusca.toLowerCase()
    return nos.filter((n) =>
      n.rotulo.toLowerCase().includes(q)
      || n.autor.toLowerCase().includes(q)
      || n.especie.toLowerCase().includes(q)
      || n.caso.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [nos, termoBusca])

  if (!cofre || cofre.erro || cofre.conexoes === null || !nos.length) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
        <TituloDaTela titulo="Cofre de conhecimento." pergunta={vista.pergunta} mostrarSeletorData={false} />
        <div className="carta p-5 text-sm text-tinta-2">
          Não consegui medir o Cofre. {cofre?.erro ?? 'O estado ainda não tem a fonte dos aprendizados.'}
        </div>
      </div>
    )
  }

  const atual = nos.find((n) => n.id === escolhido) ?? nos[0]
  const alvoNo = alvo ? nos.find((n) => n.id === alvo) ?? null : null

  // Relações Dirigidas (PRE: de onde veio -> NEXT: o que destrava)
  const entram = cofre.arestas.filter((a) => a.para === atual.id) // PRE
  const saem = cofre.arestas.filter((a) => a.de === atual.id)   // NEXT

  const nome = (id: string) => nos.find((n) => n.id === id)?.rotulo ?? id
  const curto = (id: string) => encurtar(nome(id), 32)
  const baixa = cofre.cobertura !== null && cofre.cobertura < 25
  const familia = cofre.familias.find((f) => f.id === atual.familia)
  const truncado = cofre.truncados.includes(atual.id)
  const areaAtual = cofre.areas.find((a) => a.id === atual.area)

  const porqueDoSalto = (de: string, para: string) =>
    cofre.arestas
      .filter((a) => (a.de === de && a.para === para) || (a.de === para && a.para === de))
      .map((a) => `${nome(a.de)} → ${nome(a.para)}: ${a.porque}`)
      .join(' · ')

  // ‼️ CORRIGIDO 21/09/2026: autores/sempreVisiveis/ordemAreas eram arrays
  // NOVOS a cada render (mesmo problema já achado em Grafo3DCofre.graphData:
  // o useFps sozinho já causa ~1 render/segundo). sempreVisiveis e ordemAreas
  // alimentam o useMemo do graphData e do Mapa 2D — sem memoizar ESTAS aqui
  // também, aquele useMemo recomputava do mesmo jeito (dependência sempre
  // "nova" por referência), o que explica o "2D Multi-Anel ainda está
  // piscando" mesmo depois do primeiro conserto.
  const autores = useMemo(
    () => [...nos.reduce((m, n) => m.set(n.autor, (m.get(n.autor) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    [nos],
  )
  const sempreVisiveis = useMemo(
    () => cofre.areas.filter((a) => a.sempre_visivel === true || a.id === 'transversal').map((a) => a.id),
    [cofre.areas],
  )
  const ordemAreas = useMemo(() => cofre.areas.map((a) => a.id), [cofre.areas])
  const escolher = (id: string) => { setEscolhido(id); setAlvo(null) }
  const ligar = (id: string) => setAlvo((antigo) => (antigo === id || id === escolhido ? null : id))

  return (
    <div className={`mx-auto max-w-[1240px] px-4 py-5 sm:px-6 transition-colors duration-300 ${
      modoComando ? 'text-slate-100' : 'text-tinta'
    }`}>
      <TituloDaTela
        mostrarSeletorData={false}
        titulo="Cofre de conhecimento."
        pergunta="O que a operação aprendeu, quem aprendeu, e o que se liga a quê pela ligação escrita na fonte."
        direita={
          <span className="rotulo flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-verde animate-pulse" />
            medido {new Date(medidoEm).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc
          </span>
        }
      />

      <PainelInstrumentoCofre
        fps={fps}
        cofre={cofre}
        nos={nos}
        termoBusca={termoBusca}
        setTermoBusca={setTermoBusca}
        nosFiltradosBusca={nosFiltradosBusca}
        escolher={escolher}
        modoComando={modoComando}
        modoLayout={modoLayout}
        setModoLayout={setModoLayout}
        animarSinal={animarSinal}
        setAnimarSinal={setAnimarSinal}
        alternarModoComando={alternarModoComando}
        baixa={baixa}
        areasAbertas={areasAbertas}
        alternarAreasAbertas={alternarAreasAbertas}
        areas={cofre.areas}
        areaFoco={areaFoco}
        setAreaFoco={setAreaFoco}
        autores={autores}
        atual={atual}
        areaAtual={areaAtual}
        familia={familia}
        truncado={truncado}
        caminho={caminho}
        alvoNo={alvoNo}
        entram={entram}
        saem={saem}
        nome={nome}
        curto={curto}
        porqueDoSalto={porqueDoSalto}
        setAlvo={setAlvo}
        grafo={
          <>
            <Cabecalho cor="var(--color-lima)" meta={`${cofre.conexoes} ligações · ${modoComando ? '3D Force Graph' : '2D SVG'}`}>
              mapa dos aprendizados
            </Cabecalho>
            {modoComando ? (
              <Grafo3DCofre
                nos={nos}
                arestas={cofre.arestas}
                escolhido={atual.id}
                alvo={alvo}
                areaFoco={areaFoco}
                sempreVisiveis={sempreVisiveis}
                caminho={caminho}
                modoLayout={modoLayout}
                animarSinal={animarSinal}
                modoComando={modoComando}
                aoEscolher={escolher}
                aoLigar={ligar}
              />
            ) : (
              <Mapa
                nos={nos} arestas={cofre.arestas} caixa={estreito ? CAIXA_CELULAR : CAIXA_MESA}
                ordemAreas={ordemAreas}
                escolhido={atual.id} alvo={alvo} areaFoco={areaFoco} sempreVisiveis={sempreVisiveis}
                caminho={caminho} modoLayout={modoLayout} animarSinal={animarSinal} modoComando={modoComando}
                aoEscolher={escolher} aoLigar={ligar}
              />
            )}
          </>
        }
      />

      <Parcial dado={vista.dado} />
    </div>
  )
}
