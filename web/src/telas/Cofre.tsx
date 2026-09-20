import { useEffect, useMemo, useRef, useState } from 'react'
import {
  arestasDoCaminho, caminhoMaisCurto, corDaArea, diagnosticarLayout, encurtar, escolherRotulos,
  posicionarCofre, raioDeToque, CAIXA_CELULAR, CAIXA_MESA, FONTE_ROTULO, type Caixa, type Posto,
} from '../dados/cofre'
import type { ArestaCofre, NoMemoria } from '../dados/tipos'
import { Parcial } from '../ui/SemDado'
import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'

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
      const especies = ['regra', 'dor', 'gancho', 'métrica', 'decisão', 'conceito', 'sinal', 'alerta', 'lead']
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
  const [modoComando, setModoComando] = useState(() => {
    try {
      return localStorage.getItem('painel_os:cofre_modo_comando') !== 'false'
    } catch {
      return true
    }
  })
  const [modoLayout, setModoLayout] = useState<ModoLayout>('multi-anel')
  const [animarSinal, setAnimarSinal] = useState(true)

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
        <TituloDaTela titulo="Cofre de conhecimento." pergunta={vista.pergunta} />
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

  const autores = [...nos.reduce((m, n) => m.set(n.autor, (m.get(n.autor) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))

  const sempreVisiveis = cofre.areas.filter((a) => a.sempre_visivel === true || a.id === 'transversal').map((a) => a.id)
  const ordemAreas = cofre.areas.map((a) => a.id)
  const escolher = (id: string) => { setEscolhido(id); setAlvo(null) }
  const ligar = (id: string) => setAlvo((antigo) => (antigo === id || id === escolhido ? null : id))

  return (
    <div className={`mx-auto max-w-[1240px] px-4 py-5 sm:px-6 transition-colors duration-300 ${
      modoComando ? 'text-slate-100' : 'text-tinta'
    }`}>
      <TituloDaTela
        titulo="Cofre de conhecimento."
        pergunta="O que a operação aprendeu, quem aprendeu, e o que se liga a quê pela ligação escrita na fonte."
        direita={
          <span className="rotulo flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-verde animate-pulse" />
            medido {new Date(medidoEm).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc
          </span>
        }
      />

      {/* BARRA HUD DE CENTRO DE COMANDO (Estilo Kimi Concept Map / JARVIS) */}
      <div className={`mb-4 overflow-hidden rounded-lg border p-3 shadow-lg backdrop-blur-md transition-all ${
        modoComando
          ? 'border-sky-500/40 bg-[#0B0F17]/90 text-slate-200 shadow-sky-950/40'
          : 'border-linha bg-carta text-tinta'
      }`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Operacional & FPS ao vivo */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
              SISTEMA OPERACIONAL
            </span>
            <span className="font-mono text-[11px] font-bold text-sky-400">
              {fps} <span className="text-[9px] text-slate-400">FPS</span>
            </span>
            <span className="hidden font-mono text-[10px] text-slate-400 sm:inline">
              | {nos.length} NÓS VISÍVEIS · {cofre.conexoes} ARESTAS · GRAU MÉDIO {cofre.grau_medio}
            </span>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="🔍 Buscar nó, autor ou caso..."
              className={`w-full rounded border px-3 py-1 font-mono text-[11px] transition-all outline-none ${
                modoComando
                  ? 'border-sky-500/40 bg-slate-900/90 text-slate-100 placeholder-slate-500 focus:border-sky-400'
                  : 'border-linha bg-white/80 text-tinta placeholder-tinta-3 focus:border-linha-forte'
              }`}
            />
            {nosFiltradosBusca.length > 0 && (
              <ul className={`absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded border p-1 shadow-xl backdrop-blur-md ${
                modoComando ? 'border-sky-500/40 bg-slate-900 text-slate-200' : 'border-linha bg-carta text-tinta'
              }`}>
                {nosFiltradosBusca.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        escolher(n.id)
                        setTermoBusca('')
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[11px] hover:bg-white/10"
                    >
                      <span className="truncate font-medium">{n.rotulo}</span>
                      <span className="font-mono text-[9px] opacity-70">{n.area}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Controles de Modo & Tema */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            {/* Seletor de Modo Layout */}
            <div className="flex items-center rounded border border-linha/40 p-0.5">
              {(['multi-anel', 'orbita', 'hierarquia'] as ModoLayout[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModoLayout(m)}
                  className={`rounded px-2 py-0.5 capitalize transition-all ${
                    modoLayout === m
                      ? (modoComando ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-lima/30 text-tinta font-bold')
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {m === 'multi-anel' ? '2D Multi-Anel' : m === 'orbita' ? 'Órbita' : 'Camadas'}
                </button>
              ))}
            </div>

            {/* Alternador de Animação do Feixe de Luz */}
            <button
              type="button"
              onClick={() => setAnimarSinal((a) => !a)}
              className={`rounded border px-2 py-1 transition-all ${
                animarSinal
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-semibold'
                  : 'border-linha/40 opacity-60'
              }`}
            >
              {animarSinal ? '⚡ Sinal: ON' : '⚡ Sinal: OFF'}
            </button>

            {/* Alternador de Tema Centro de Comando Noturno */}
            <button
              type="button"
              onClick={alternarModoComando}
              className={`rounded border px-2.5 py-1 font-bold transition-all ${
                modoComando
                  ? 'border-sky-400 bg-sky-500/20 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                  : 'border-linha bg-carta-forte text-tinta'
              }`}
            >
              {modoComando ? '🌙 Modo Comando (Dark)' : '☀️ Modo Sépia'}
            </button>
          </div>
        </div>
      </div>

      {baixa && (
        <div data-cobertura-baixa className="mb-3 rounded-lg border border-ambar/30 bg-ambar/8 px-3 py-2.5 text-[11px] leading-relaxed text-tinta-2">
          <span className="font-mono uppercase tracking-[.16em] text-ambar">Cobertura baixa.</span> Só {cofre.cobertura}% dos aprendizados estão amarrados a algum outro. O mapa mostra essa lacuna, não completa por semelhança.
        </div>
      )}

      {(cofre.vencidos.length > 0 || cofre.recusados.length > 0
        || cofre.truncados.length > 0 || cofre.arestas_recusadas.length > 0) && (
        <div data-cofre-vencidos className="mb-3 rounded-lg border border-vermelho/30 bg-vermelho/8 px-3 py-2.5 text-[11px] leading-relaxed text-tinta-2">
          <span className="font-mono uppercase tracking-[.16em] text-vermelho">Conferência.</span>{' '}
          {cofre.vencidos.length > 0 && `${cofre.vencidos.length} registro(s) com âncora que não confere mais na fonte; ficam no mapa em traço interrompido. `}
          {cofre.recusados.length > 0 && `${cofre.recusados.length} registro(s) recusado(s) na leitura. `}
          {cofre.truncados.length > 0 && `${cofre.truncados.length} bloco(s) bateram no teto de 60 linhas. `}
          {cofre.arestas_recusadas.length > 0 && `${cofre.arestas_recusadas.length} ligação(ões) declarada(s) e recusada(s).`}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi rotulo="aprendizados" valor={nos.length} nota={cofre.arquivos === null ? undefined : `de ${cofre.arquivos} arquivo(s) de origem`} />
        <Kpi rotulo="ligações" valor={cofre.conexoes} nota={`declaradas na fonte · ${cofre.arestas.filter((a) => a.ponte).length} atravessam áreas`} />
        <Kpi rotulo="grau médio" valor={cofre.grau_medio} nota="ligações por aprendizado" />
        <Kpi rotulo="famílias" valor={cofre.familias.length} nota={`${cofre.areas.length} áreas`} />
        <Kpi rotulo="amarrados" valor={cofre.cobertura === null ? null : `${cofre.cobertura}%`} cor={baixa ? 'text-ambar' : 'text-verde'} nota="têm ao menos uma ligação" />
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[168px_minmax(0,1fr)_310px]">
        {/* Coluna Esquerda: Filtro de Áreas & Quem Aprendeu */}
        <aside className={`carta p-3.5 transition-colors ${modoComando ? 'bg-[#0B0F17]/90 border-sky-500/30' : ''}`}>
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
                    title={fixa ? 'transversal nunca é filtrada' : so ? 'mostrar o mapa inteiro' : 'ver só esta área'}
                    onClick={() => !fixa && setAreaFoco(so ? null : a.id)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors duration-200 ${so ? 'border-lima/45 bg-lima/10' : 'border-transparent hover:border-linha'} ${fixa ? 'cursor-default opacity-90' : ''}`}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: corDaArea(a.id) }} />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{a.nome}</span>
                    <span className="font-mono text-[10px] opacity-70">{a.total}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 font-mono text-[9px] leading-relaxed opacity-70">
            Clique numa área para ver só ela. Transversal fica sempre e pontes mantêm anéis vazados.
          </p>

          <div className="mt-4 border-t border-linha pt-3">
            <Cabecalho cor="var(--color-ciano)">quem aprendeu</Cabecalho>
            <ul className="space-y-1">
              {autores.map(([quem, quantos]) => (
                <li key={quem} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px]">{quem}</span>
                  <span className="font-mono text-[10px] opacity-70">{quantos}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Coluna Central: O Grafo Interativo com Fundo Sináptico */}
        <section className={`carta overflow-hidden p-3 transition-colors ${modoComando ? 'bg-[#0B0F17]/90 border-sky-500/30' : ''}`}>
          <Cabecalho cor="var(--color-lima)" meta={`${cofre.conexoes} ligações`}>
            mapa dos aprendizados
          </Cabecalho>
          <Mapa
            nos={nos} arestas={cofre.arestas} caixa={estreito ? CAIXA_CELULAR : CAIXA_MESA}
            ordemAreas={ordemAreas}
            escolhido={atual.id} alvo={alvo} areaFoco={areaFoco} sempreVisiveis={sempreVisiveis}
            caminho={caminho} modoLayout={modoLayout} animarSinal={animarSinal} modoComando={modoComando}
            aoEscolher={escolher} aoLigar={ligar}
          />
        </section>

        {/* Coluna Direita: Ficha do Aprendizado (Com Relações Dirigidas PRE & NEXT Clicáveis) */}
        <aside data-ficha-cofre className={`carta p-4 transition-colors ${modoComando ? 'bg-[#0B0F17]/90 border-sky-500/30' : ''}`}>
          <Cabecalho cor="var(--color-ciano)" meta={<span data-ficha-especie>{atual.especie}</span>}>
            ficha do aprendizado
          </Cabecalho>
          <h2 className="font-serif text-[22px] leading-tight font-bold">{atual.rotulo}</h2>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span data-ficha-autor className="text-[12px]">
              <span className="rotulo mr-1.5">quem</span>{atual.autor}
            </span>
            <span data-ficha-quando className="font-mono text-[10px] opacity-70">
              {atual.quando.split('-').reverse().join('/')}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span data-ficha-area className="inline-flex items-center gap-1.5 rounded-full border border-linha-forte px-2 py-[3px]">
              <span className="size-[5px] rounded-full" style={{ background: corDaArea(atual.area) }} />
              <span className="font-mono text-[9px] leading-none uppercase tracking-[0.14em] opacity-80">{areaAtual?.nome ?? atual.area}</span>
            </span>
            <span data-ficha-familia><Pilula tom="lima">{familia?.nome ?? atual.familia}</Pilula></span>
            {atual.vencido && <Pilula tom="vermelho">âncora vencida</Pilula>}
          </div>

          <div className="my-3.5 grid grid-cols-3 gap-2">
            <div data-ficha-peso className="poco p-2.5">
              <div className="rotulo mb-1.5">peso</div>
              <div className="font-serif text-xl">{atual.peso}<span className="text-[11px] opacity-70">/5</span></div>
            </div>
            <div className="poco p-2.5">
              <div className="rotulo mb-1.5">ligações</div>
              <div className="font-serif text-xl">{atual.grau}</div>
            </div>
            <div className="poco p-2.5">
              <div className="rotulo mb-1.5">linhas</div>
              <div className="font-serif text-xl">
                {atual.linhas || '—'}
                {truncado && <span className="ml-1 text-[10px] text-ambar" title="o bloco bateu no teto de 60 linhas">no teto</span>}
              </div>
            </div>
          </div>

          <p data-ficha-corpo className="text-[12px] leading-relaxed opacity-90">{atual.corpo}</p>
          <div data-ficha-caso className="mt-3 rounded-md border border-linha bg-white/5 p-2.5">
            <div className="rotulo mb-1.5">o caso</div>
            <p className="text-[11px] leading-relaxed opacity-85">{atual.caso}</p>
          </div>
          <p className="mt-2 break-all font-mono text-[10px] opacity-60">{atual.arquivo}</p>

          {/* ROTA / CAMINHO SELECIONADO */}
          {caminho !== null && alvoNo && (
            <div data-caminho-cofre className="mt-3.5 rounded-md border border-vermelho/30 bg-vermelho/10 p-2.5">
              <div className="rotulo mb-1.5 text-vermelho">caminho até {alvoNo.rotulo}</div>
              <ol className="space-y-1.5">
                {caminho.slice(1).map((id, i) => (
                  <li data-caminho-salto key={id} className="text-[11px] leading-relaxed">
                    <button type="button" className="text-left font-medium underline underline-offset-2" onClick={() => escolher(id)}>
                      {nome(id)}
                    </button>
                    <span className="block font-mono text-[9px] opacity-70">porque: {porqueDoSalto(caminho[i], id)}</span>
                  </li>
                ))}
              </ol>
              <button type="button" className="rotulo mt-2 underline underline-offset-2" onClick={() => setAlvo(null)}>limpar caminho</button>
            </div>
          )}

          {/* RELAÇÕES DIRIGIDAS ESTILO KIMI (PRE: ANTECEDENTES -> NEXT: DESTRAVA) */}
          <div className="mt-4 space-y-3.5 border-t border-linha pt-3">
            {/* PRE / ANTECEDENTES */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="rotulo flex items-center gap-1">
                  <span className="rounded bg-amber-500/20 px-1 font-bold text-amber-400">PRE</span>
                  antecedentes (de onde veio)
                </span>
                <span className="font-mono text-[10px] opacity-60">{entram.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entram.length ? entram.map((a) => (
                  <button
                    type="button"
                    key={`${a.de}:${a.para}`}
                    title={`PRE: ${a.porque}`}
                    onClick={() => escolher(a.de)}
                    className="group transition-transform active:scale-95"
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-left font-mono text-[10.5px] hover:border-amber-400">
                      <span className="size-1.5 rounded-full" style={{ background: corDaArea(nos.find((n) => n.id === a.de)?.area ?? '') }} />
                      <span className="truncate max-w-[190px]">{curto(a.de)}</span>
                    </span>
                  </button>
                )) : <span className="text-xs opacity-50">nenhum antecedente declarado</span>}
              </div>
            </div>

            {/* NEXT / DESTRAVA */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="rotulo flex items-center gap-1">
                  <span className="rounded bg-sky-500/20 px-1 font-bold text-sky-400">NEXT</span>
                  destrava / consequências
                </span>
                <span className="font-mono text-[10px] opacity-60">{saem.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {saem.length ? saem.map((a) => (
                  <button
                    type="button"
                    key={`${a.de}:${a.para}`}
                    title={`NEXT: ${a.porque}`}
                    onClick={() => escolher(a.para)}
                    className="group transition-transform active:scale-95"
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-left font-mono text-[10.5px] hover:border-sky-400">
                      <span className="size-1.5 rounded-full" style={{ background: corDaArea(nos.find((n) => n.id === a.para)?.area ?? '') }} />
                      <span className="truncate max-w-[190px]">{curto(a.para)}</span>
                    </span>
                  </button>
                )) : <span className="text-xs opacity-50">não destrava outro registro diretamente</span>}
              </div>
            </div>

            {/* Nota de Privacidade & Auditoria */}
            <div className="border-t border-linha pt-3 font-mono text-[10px] leading-relaxed opacity-60">
              Registro auditado na fonte. Título, corpo, caso e autor passam pela trava sanitizadora de PII do coletor.
            </div>
          </div>
        </aside>
      </div>

      <Parcial dado={vista.dado} />
    </div>
  )
}
