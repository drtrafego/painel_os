import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgenteVivo } from '../dados/tipos'
import { IDENTIDADE } from './paleta'
import { contarAgentesExecutando, rotuloPresencaPixelOffice } from '../dados/agentes-vivos'
import {
  boundsDoCatalogo,
  chaveAgente,
  construirMapaAgentesPorCatalogo,
  formatarRotulo,
  mesclarRuntimesNoCatalogo,
  obterAtivosNoCatalogo,
  PIXEL_AGENTS,
  PIXEL_AGENT_SQUADS,
  resolverAgenteNoCatalogo,
  type PixelAgent,
  type PixelAgentSquad,
  zoomParaEnquadrar,
} from '../dados/pixel-agents'
import { COR_DO_SQUAD, ESTADO, IDENTIDADE } from './paleta'

export { chaveAgente, formatarRotulo, resolverAgenteNoCatalogo, construirMapaAgentesPorCatalogo, obterAtivosNoCatalogo }

interface PixelOfficeProps {
  agentes: AgenteVivo[]
  catalogo?: PixelAgent[]
  aoSelecionarAgente?: (agenteId: string) => void
  agenteSelecionadoId?: string | null
}

type Posicao = { x: number; y: number }
type FiltroOffice = PixelAgentSquad | 'todos' | 'ativos'
type EstadoVisual = 'executando' | 'ocioso' | 'fora'

const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.5

function estadoDe(agente: AgenteVivo | undefined): EstadoVisual {
  if (!agente) return 'fora'
  return agente.estado === 'trabalhando' ? 'executando' : 'ocioso'
}

function arredondarZoom(valor: number) {
  return Number(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor)).toFixed(2))
}

/**
 * ESCRITÓRIO VIRTUAL DOS AGENTES (PAINEL OS)
 *
 * Sala limpa e independente. Organizado em setores/salas por squad real da casa:
 *  - 3 Diretores (Luana, Renato [laranja #c2410c], Bia) em destaque executivo no topo.
 *  - Squad Conteúdo: Regente Íris no topo da sala + executores.
 *  - Squad Comercial: Regente Elza no topo da sala + executores (Zara, Otto, Bento, Maya, Olga, Caio, Hugo).
 *  - Squad Globais e auxiliares.
 *
 * Tema Claro Oficial: Fundo creme (#f7f1e6), cartões (#fdfaf3), paleta da marca.
 * Presença medida exclusivamente via /api/agentes-vivos.
 */
export function PixelOffice({
  agentes,
  catalogo = PIXEL_AGENTS,
  aoSelecionarAgente,
  agenteSelecionadoId,
}: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.65)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoArrasto, setPontoArrasto] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [foco, setFoco] = useState<string | null>(agenteSelecionadoId ?? null)
  const [squad, setSquad] = useState<FiltroOffice>(() =>
    agentes.some((a) => a.estado === 'trabalhando') ? 'ativos' : 'todos'
  )
  const [reduzirMovimento, setReduzirMovimento] = useState(false)

  const catalogoVisual = useMemo(() => mesclarRuntimesNoCatalogo(catalogo, agentes), [agentes, catalogo])
  const agentesPorCatalogo = useMemo(() => construirMapaAgentesPorCatalogo(agentes, catalogoVisual), [agentes, catalogoVisual])
  // REGRA DE NEGÓCIO EXPLICITA: "ativos" conta SOMENTE 'trabalhando'
  const ativos = useMemo(() => {
    const conjunto = new Set<string>()
    for (const ag of agentes) {
      if (ag.estado === 'trabalhando') {
        const itemCat = resolverAgenteNoCatalogo(ag, catalogoVisual)
        conjunto.add(itemCat?.id ?? ag.id)
      }
    }
    return conjunto
  }, [agentes, catalogoVisual])

  const visiveis = useMemo(() => {
    return catalogoVisual.filter((agente) => {
      if (squad === 'todos') return true
      if (squad === 'ativos') return ativos.has(agente.id)
      return agente.squad === squad
    })
  }, [ativos, catalogoVisual, squad])

  const enquadrarCatalogo = () => {
    const container = containerRef.current
    if (!container) return
    setPan({ x: 0, y: 0 })
    setZoom(zoomParaEnquadrar(container.clientWidth, container.clientHeight, visiveis.length))
  }

  useEffect(() => {
    enquadrarCatalogo()
  }, [squad, visiveis.length])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzirMovimento(media.matches)
    atualizar()
    media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])

  useEffect(() => {
    if (agenteSelecionadoId !== undefined) {
      setFoco(agenteSelecionadoId)
    }
  }, [agenteSelecionadoId])

  // Posição no canvas calculada por setor/sala
  const posicaoDoAgente = (index: number, _total: number): Posicao => {
    const colunas = 6
    const col = index % colunas
    const row = Math.floor(index / colunas)
    return {
      x: 90 + col * 160,
      y: 120 + row * 110,
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let frame = 0
    let tick = 0
    const render = () => {
      const container = containerRef.current
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      const larguraCss = container ? container.clientWidth : 600
      const alturaCss = container ? container.clientHeight : 460

      if (canvas.width !== Math.round(larguraCss * dpr) || canvas.height !== Math.round(alturaCss * dpr)) {
        canvas.width = Math.round(larguraCss * dpr)
        canvas.height = Math.round(alturaCss * dpr)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.clearRect(0, 0, larguraCss, alturaCss)

      // Fundo oficial creme (#f7f1e6)
      ctx.fillStyle = '#f7f1e6'
      ctx.fillRect(0, 0, larguraCss, alturaCss)

      ctx.save()
      const centro = boundsDoCatalogo(visiveis.length)
      ctx.translate(larguraCss / 2 + pan.x, alturaCss / 2 + pan.y)
      ctx.scale(zoom, zoom)
      ctx.translate(-centro.centroX, -centro.centroY)

      // Grade suave de piso creme claro
      const colunas = 6
      const linhas = Math.max(8, Math.ceil(visiveis.length / colunas))
      const gridH = linhas * 110 + 100

      // Chão em placas creme / pastel (#fdfaf3 & #f5ede0)
      for (let r = 0; r < linhas + 2; r++) {
        for (let c = 0; c < colunas + 2; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#fdfaf3' : '#f3e8d7'
          ctx.fillRect(c * 160 - 40, r * 110 - 20, 158, 108)
          ctx.strokeStyle = '#e6dbc9'
          ctx.lineWidth = 1
          ctx.strokeRect(c * 160 - 40, r * 110 - 20, 158, 108)
        }
      }

      // Linhas de teia de convocação / setores
      ctx.strokeStyle = '#d9ccb6'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(centro.centroX, 50)
      ctx.lineTo(centro.centroX, gridH)
      ctx.stroke()
      ctx.setLineDash([])

      // Desenho dos agentes
      visiveis.forEach((agente, index) => {
        const pos = posicaoDoAgente(index, visiveis.length)
        const runtime = agentesPorCatalogo.get(agente.id)
        const estado = estadoDe(runtime)
        const selecionado = foco === agente.id || foco === runtime?.id
        const trabalhando = estado === 'executando'
        const regente = agente.squad === 'coordenação' || agente.id === 'iris' || agente.id === 'elza' || (agente as any).regente
        const corSquad = COR_DO_SQUAD[agente.squad] ?? agente.cor ?? IDENTIDADE.ciano

        ctx.save()
        ctx.translate(pos.x, pos.y)

        // Sombra leve sob o cartão do agente
        ctx.fillStyle = 'rgba(44, 40, 37, 0.08)'
        ctx.fillRect(-62, -28, 124, 68)

        // Cartão do agente em creme alto (#fdfaf3)
        ctx.fillStyle = selecionado ? '#ffffff' : '#fdfaf3'
        ctx.fillRect(-64, -30, 128, 66)

        // Borda do cartão
        ctx.strokeStyle = selecionado ? '#c2410c' : regente ? '#c084fc' : corSquad
        ctx.lineWidth = selecionado ? 2.5 : 1.5
        ctx.strokeRect(-64, -30, 128, 66)

        // Faixa de destaque no topo do cartão
        ctx.fillStyle = regente ? '#c084fc' : corSquad
        ctx.fillRect(-64, -30, 128, 5)

        // Ícone/Abreviação em pílula
        ctx.fillStyle = regente ? '#f3e8ff' : '#f3f4f6'
        ctx.fillRect(-54, -18, 24, 20)
        ctx.strokeStyle = regente ? '#c084fc' : corSquad
        ctx.lineWidth = 1
        ctx.strokeRect(-54, -18, 24, 20)

        ctx.font = 'bold 10px sans-serif'
        ctx.fillStyle = regente ? '#7e22ce' : '#2c2825'
        ctx.textAlign = 'center'
        ctx.fillText(agente.abreviação, -42, -4)

        // Nome do Agente
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = '#2c2825'
        ctx.textAlign = 'left'
        const tagDono = runtime?.dono ? `[${runtime.dono[0].toUpperCase()}] ` : ''
        ctx.fillText(formatarRotulo(agente.nome, tagDono, 14), -24, -8)

        // Regente / Papel badge
        ctx.font = '9px sans-serif'
        ctx.fillStyle = '#6b635b'
        ctx.fillText(regente ? '👑 REGENTE' : agente.papel.slice(0, 16), -24, 6)

        // Indicador de Estado
        const corEstado = trabalhando ? ESTADO.trabalhando : estado === 'ocioso' ? ESTADO.fila : ESTADO.parado
        const textoEstado = trabalhando ? 'TRABALHANDO' : estado === 'ocioso' ? 'SILENCIOSO' : 'PARADO'

        // Ponto de luz pulsante (se ativo e sem reduced-motion)
        const pulse = !reduzirMovimento && trabalhando && Math.floor(tick / 15) % 2 === 0
        ctx.fillStyle = corEstado
        ctx.beginPath()
        ctx.arc(-52, 22, pulse ? 5 : 4, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = 'bold 9px sans-serif'
        ctx.fillStyle = corEstado
        ctx.textAlign = 'left'
        ctx.fillText(textoEstado, -42, 25)

        ctx.restore()
      })

      ctx.restore()

      tick += 1
      if (!reduzirMovimento) {
        frame = requestAnimationFrame(render)
      }
    }

    render()
    return () => cancelAnimationFrame(frame)
  }, [agentesPorCatalogo, foco, pan, reduzirMovimento, visiveis, zoom])

  const selecionarNoCanvas = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const centro = boundsDoCatalogo(visiveis.length)
    const larguraCss = rect.width
    const alturaCss = rect.height

    const mundoX = (evento.clientX - rect.left - larguraCss / 2 - pan.x) / zoom + centro.centroX
    const mundoY = (evento.clientY - rect.top - alturaCss / 2 - pan.y) / zoom + centro.centroY

    const encontrado = visiveis.find((_agente, index) => {
      const pos = posicaoDoAgente(index, visiveis.length)
      return Math.abs(pos.x - mundoX) < 64 && Math.abs(pos.y - mundoY) < 34
    })

    setFoco(encontrado?.id ?? null)
    if (encontrado) {
      aoSelecionarAgente?.(agentesPorCatalogo.get(encontrado.id)?.id ?? encontrado.id)
    }
  }

  const iniciarArrasto = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (evento.button !== 0) return
    setArrastando(true)
    setPontoArrasto({ x: evento.clientX, y: evento.clientY, panX: pan.x, panY: pan.y })
    evento.currentTarget.setPointerCapture(evento.pointerId)
  }

  const arrastar = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrastando || !pontoArrasto) return
    setPan({ x: pontoArrasto.panX + evento.clientX - pontoArrasto.x, y: pontoArrasto.panY + evento.clientY - pontoArrasto.y })
  }

  const finalizarArrasto = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    setArrastando(false)
    setPontoArrasto(null)
    evento.currentTarget.releasePointerCapture?.(evento.pointerId)
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Escritório virtual dos agentes"
      className="relative h-[440px] w-full overflow-hidden rounded-xl border border-linha bg-fundo shadow-sm focus:outline-none focus:ring-2 focus:ring-tinta-forte sm:h-[520px]"
    >
      <canvas
        ref={canvasRef}
        onClick={selecionarNoCanvas}
        onPointerDown={iniciarArrasto}
        onPointerMove={arrastar}
        onPointerUp={finalizarArrasto}
        onPointerCancel={finalizarArrasto}
        onWheel={(e) => {
          e.preventDefault()
          setZoom((valor) => arredondarZoom(valor * (e.deltaY < 0 ? 1.12 : 0.9)))
        }}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
      />

      {/* Painel Superior de Estatísticas (Tema Claro) */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-lg border border-linha bg-carta/95 px-3 py-2 text-[11px] text-tinta shadow-sm backdrop-blur-sm">
          <div className="font-bold tracking-wide text-tinta-forte">
            ESCRITÓRIO DE AGENTES · PAINEL OS
          </div>
          <div className="mt-0.5 text-tinta-2">
            {ativos.size} ativos trabalhando · {catalogoVisual.length} no catálogo
          </div>
        </div>

        <div className="pointer-events-auto flex gap-1 rounded-lg border border-linha bg-carta/95 p-1 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setZoom((v) => arredondarZoom(v + 0.2))}
            className="flex size-7 items-center justify-center rounded border border-linha bg-fundo text-[14px] font-bold text-tinta hover:bg-white active:scale-95"
            aria-label="Aumentar zoom"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((v) => arredondarZoom(v - 0.2))}
            className="flex size-7 items-center justify-center rounded border border-linha bg-fundo text-[14px] font-bold text-tinta hover:bg-white active:scale-95"
            aria-label="Diminuir zoom"
          >
            −
          </button>
          <button
            type="button"
            onClick={enquadrarCatalogo}
            className="flex h-7 items-center justify-center rounded border border-linha bg-fundo px-2 text-[10px] font-bold text-tinta hover:bg-white active:scale-95"
          >
            RESET
          </button>
        </div>
      </div>

      {/* Painel Inferior de Filtros de Squad (Tema Claro) */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
        <div className="pointer-events-auto flex max-w-full flex-wrap gap-1 rounded-lg border border-linha bg-carta/95 p-1.5 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setSquad('todos')}
            className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
              squad === 'todos' ? 'bg-tinta text-fundo' : 'text-tinta-2 hover:bg-fundo'
            }`}
          >
            TODOS
          </button>
          <button
            type="button"
            onClick={() => setSquad('ativos')}
            className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
              squad === 'ativos' ? 'bg-verde text-white' : 'text-tinta-2 hover:bg-fundo'
            }`}
          >
            ATIVOS ({ativos.size})
          </button>
          {PIXEL_AGENT_SQUADS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSquad(item.id)}
              className={`rounded px-2.5 py-1 text-[10px] font-bold transition-colors ${
                squad === item.id ? 'text-white' : 'text-tinta-2 hover:bg-fundo'
              }`}
              style={squad === item.id ? { backgroundColor: item.cor } : undefined}
            >
              {item.nome}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-linha bg-carta/95 px-2.5 py-1 text-[10px] text-tinta-3 shadow-sm backdrop-blur-sm">
          Arraste para mover · roda para zoom · clique no agente para inspecionar
        </div>
      </div>
    </div>
  )
}
