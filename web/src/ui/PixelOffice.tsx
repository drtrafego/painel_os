import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgenteVivo } from '../dados/tipos'
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

export { chaveAgente, formatarRotulo, resolverAgenteNoCatalogo, construirMapaAgentesPorCatalogo, obterAtivosNoCatalogo }

interface PixelOfficeProps { agentes: AgenteVivo[]; catalogo?: PixelAgent[]; aoSelecionarAgente?: (agenteId: string) => void; agenteSelecionadoId?: string | null }
type Posicao = { x: number; y: number }
type FiltroOffice = PixelAgentSquad | 'todos' | 'ativos'
type EstadoVisual = 'executando' | 'ocioso' | 'fora'
const ZOOM_MIN = 0.3
const ZOOM_MAX = 3
const posicaoDe = (i: number): Posicao => ({ x: 80 + (i % 6) * 155, y: 112 + Math.floor(i / 6) * 100 })
function estadoDe(agente: AgenteVivo | undefined): EstadoVisual { return !agente ? 'fora' : agente.estado === 'trabalhando' ? 'executando' : 'ocioso' }
function arredondarZoom(valor: number) { return Number(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor)).toFixed(2)) }
/** Escritório pixel-art: catálogo estático + presença exclusivamente medida pela sonda. */
export function PixelOffice({ agentes, catalogo = PIXEL_AGENTS, aoSelecionarAgente, agenteSelecionadoId }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(0.6)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoArrasto, setPontoArrasto] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [foco, setFoco] = useState<string | null>(agenteSelecionadoId ?? null)
  const [squad, setSquad] = useState<FiltroOffice>(() => agentes.some((agente) => agente.estado === 'trabalhando') ? 'ativos' : 'todos')
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  const catalogoVisual = useMemo(() => mesclarRuntimesNoCatalogo(catalogo, agentes), [agentes, catalogo])
  const agentesPorCatalogo = useMemo(() => construirMapaAgentesPorCatalogo(agentes, catalogoVisual), [agentes, catalogoVisual])
  const ativos = useMemo(() => obterAtivosNoCatalogo(agentes, catalogoVisual), [agentes, catalogoVisual])

  const visiveis = useMemo(
    () =>
      catalogoVisual.filter(
        (agente) => squad === 'todos' || (squad === 'ativos' ? ativos.has(agente.id) : agente.squad === squad)
      ),
    [ativos, catalogoVisual, squad]
  )
  const ativosAnteriores = useRef(agentes.filter((agente) => agente.estado === 'trabalhando').length)

  useEffect(() => {
    const quantidade = agentes.filter((agente) => agente.estado === 'trabalhando').length
    if (ativosAnteriores.current === 0 && quantidade > 0) setSquad('ativos')
    ativosAnteriores.current = quantidade
  }, [agentes])

  const enquadrarCatalogo = () => {
    const container = containerRef.current
    if (!container) return
    setPan({ x: 0, y: 0 })
    setZoom(zoomParaEnquadrar(container.clientWidth, container.clientHeight, visiveis.length))
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    enquadrarCatalogo()
    const observer = new ResizeObserver(enquadrarCatalogo)
    observer.observe(container)
    return () => observer.disconnect()
  }, [squad, visiveis.length])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzirMovimento(media.matches)
    atualizar(); media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])
  useEffect(() => { if (agenteSelecionadoId !== undefined) setFoco(agenteSelecionadoId) }, [agenteSelecionadoId])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    let frame = 0; let tick = 0
    const render = () => {
      const container = containerRef.current
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      const larguraCss = container ? container.clientWidth : 600
      const alturaCss = container ? container.clientHeight : 440
      if (canvas.width !== Math.round(larguraCss * dpr) || canvas.height !== Math.round(alturaCss * dpr)) {
        canvas.width = Math.round(larguraCss * dpr)
        canvas.height = Math.round(alturaCss * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, larguraCss, alturaCss)
      ctx.save()
      const centro = boundsDoCatalogo(visiveis.length)
      ctx.translate(larguraCss / 2 + pan.x, alturaCss / 2 + pan.y); ctx.scale(zoom, zoom); ctx.translate(-centro.centroX, -centro.centroY)
      const colunas = 6; const linhas = Math.max(8, Math.ceil(visiveis.length / colunas))
      for (let row = 0; row < linhas * 5; row += 1) for (let col = 0; col < 40; col += 1) { ctx.fillStyle = (row + col) % 2 ? '#24324a' : '#1a263b'; ctx.fillRect(col * 24, row * 24, 24, 24) }
      ctx.fillStyle = '#0b1324'; ctx.fillRect(0, 0, 600, 34); ctx.fillStyle = '#334155'; ctx.fillRect(0, 34, 600, 4)
      ctx.fillStyle = '#0f1e35'; ctx.fillRect(20, 52, 74, 28); ctx.fillStyle = '#38bdf8'; ctx.fillRect(27, 59, 4, 4); ctx.fillRect(51, 66, 5, 5); ctx.fillRect(79, 58, 3, 3)
      ctx.fillStyle = '#8b5cf6'; ctx.fillRect(112, 52, 74, 28); ctx.fillStyle = '#c4b5fd'; ctx.fillRect(125, 60, 4, 4); ctx.fillRect(155, 65, 4, 4)
      ctx.fillStyle = '#7c2d12'; ctx.fillRect(530, 54, 38, 72); ctx.fillStyle = '#fb923c'; for (let i = 0; i < 5; i += 1) ctx.fillRect(536, 62 + i * 11, 4, 4)
      visiveis.forEach((agente, index) => {
        const pos = posicaoDe(index); const runtime = agentesPorCatalogo.get(agente.id); const estado = estadoDe(runtime)
        const selecionado = foco === agente.id || foco === runtime?.id; const trabalhando = estado === 'executando'; const pulse = !reduzirMovimento && trabalhando && Math.floor(tick / 12) % 2 === 0
        ctx.save(); ctx.translate(pos.x, pos.y)
        ctx.fillStyle = '#7c451b'; ctx.fillRect(-25, -12, 50, 26); ctx.fillStyle = '#0b1324'; ctx.fillRect(-13, -10, 26, 16); ctx.fillStyle = agente.cor; ctx.fillRect(-10, -7, 20, 10); ctx.fillStyle = '#0b1324'; ctx.fillRect(-7, -5, 11, 1); ctx.fillRect(-7, -1, 8, 1); ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-10, 5, 20, 4)
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-10, 18, 20, 4); ctx.fillStyle = agente.cor; ctx.fillRect(-7, -1, 14, 12); ctx.fillStyle = '#fed7aa'; ctx.fillRect(-6, -14, 12, 12); ctx.fillStyle = index % 2 ? '#78350f' : '#1e293b'; ctx.fillRect(-7, -17, 14, 6); ctx.fillStyle = '#0f172a'; ctx.fillRect(-4, -9, 2, 2); ctx.fillRect(2, -9, 2, 2)
        if (pulse) { ctx.fillStyle = '#facc15'; ctx.fillRect(8, -17, 4, 4) }; if (selecionado) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.strokeRect(-18, -22, 36, 46) }
        ctx.fillStyle = '#020617'; ctx.fillRect(-50, 25, 100, 16); ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'
        const tagDono = runtime?.dono ? `[${runtime.dono[0].toUpperCase()}] ` : ''
        ctx.fillStyle = runtime?.dono === 'luana' ? '#38bdf8' : runtime?.dono === 'renato' ? '#c084fc' : runtime?.dono === 'bia' ? '#f472b6' : '#f8fafc'
        ctx.fillText(formatarRotulo(agente.nome, tagDono, 21), 0, 33)
        ctx.font = '6px monospace'; ctx.fillStyle = estado === 'executando' ? '#a3e635' : estado === 'ocioso' ? '#facc15' : '#94a3b8'; ctx.fillText(estado === 'executando' ? 'EXECUTANDO' : estado === 'ocioso' ? 'OCIOSO' : 'FORA DA EXECUÇÃO', 0, 39)
        ctx.restore()
      })
      ctx.restore(); tick += 1; if (!reduzirMovimento) frame = requestAnimationFrame(render)
    }
    render(); return () => cancelAnimationFrame(frame)
  }, [agentesPorCatalogo, foco, pan, reduzirMovimento, visiveis, zoom])

  const selecionarNoCanvas = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect()
    const centro = boundsDoCatalogo(visiveis.length)
    const larguraCss = rect.width
    const alturaCss = rect.height
    const mundoX = (evento.clientX - rect.left - larguraCss / 2 - pan.x) / zoom + centro.centroX; const mundoY = (evento.clientY - rect.top - alturaCss / 2 - pan.y) / zoom + centro.centroY
    const encontrado = visiveis.find((_agente, index) => { const pos = posicaoDe(index); return Math.abs(pos.x - mundoX) < 58 && Math.abs(pos.y - mundoY) < 42 })
    setFoco(encontrado?.id ?? null); if (encontrado) aoSelecionarAgente?.(agentesPorCatalogo.get(encontrado.id)?.id ?? encontrado.id)
  }
  const iniciarArrasto = (evento: React.PointerEvent<HTMLCanvasElement>) => { if (evento.button !== 0) return; setArrastando(true); setPontoArrasto({ x: evento.clientX, y: evento.clientY, panX: pan.x, panY: pan.y }); evento.currentTarget.setPointerCapture(evento.pointerId) }
  const arrastar = (evento: React.PointerEvent<HTMLCanvasElement>) => { if (!arrastando || !pontoArrasto) return; setPan({ x: pontoArrasto.panX + evento.clientX - pontoArrasto.x, y: pontoArrasto.panY + evento.clientY - pontoArrasto.y }) }
  const finalizarArrasto = (evento: React.PointerEvent<HTMLCanvasElement>) => { setArrastando(false); setPontoArrasto(null); evento.currentTarget.releasePointerCapture?.(evento.pointerId) }

  return <div ref={containerRef} className="relative h-[440px] w-full overflow-hidden border-4 border-black bg-[#0f172a] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:h-[500px]" aria-label="Escritório virtual dos agentes">
    <canvas ref={canvasRef} onClick={selecionarNoCanvas} onPointerDown={iniciarArrasto} onPointerMove={arrastar} onPointerUp={finalizarArrasto} onPointerCancel={finalizarArrasto} onWheel={(e) => { e.preventDefault(); setZoom((valor) => arredondarZoom(valor * (e.deltaY < 0 ? 1.12 : 0.9))) }} className="h-full w-full cursor-grab touch-none active:cursor-grabbing" />
    <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2 pointer-events-none"><div className="pointer-events-auto border-2 border-black bg-[#0b1324]/95 px-3 py-2 text-[10px] text-white shadow-[3px_3px_0_#000]"><div className="font-black tracking-wider text-[#facc15]">PIXEL AGENTS / PRESENÇA REAL</div><div className="mt-1 text-slate-400">{agentes.filter((a) => a.estado === 'trabalhando').length} executando · {catalogoVisual.length} no catálogo</div></div><div className="pointer-events-auto flex gap-1 border-2 border-black bg-[#0b1324]/95 p-1 shadow-[3px_3px_0_#000]"><button type="button" onClick={() => setZoom((valor) => arredondarZoom(valor + .2))} className="size-7 border border-slate-600 text-white active:scale-95" aria-label="Aumentar zoom">+</button><button type="button" onClick={() => setZoom((valor) => arredondarZoom(valor - .2))} className="size-7 border border-slate-600 text-white active:scale-95">−</button><button type="button" onClick={enquadrarCatalogo} className="h-7 border border-slate-600 px-2 text-[9px] font-black text-[#38bdf8] active:scale-95">RESET</button></div></div>
    <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2 pointer-events-none"><div className="pointer-events-auto flex max-w-full flex-wrap gap-1 border-2 border-black bg-[#0b1324]/95 p-1.5 shadow-[3px_3px_0_#000]"><button type="button" onClick={() => setSquad('todos')} className={`px-2 py-1 text-[9px] font-black ${squad === 'todos' ? 'bg-white text-black' : 'text-slate-400'}`}>TODOS</button><button type="button" onClick={() => setSquad('ativos')} className={`px-2 py-1 text-[9px] font-black ${squad === 'ativos' ? 'bg-[#a3e635] text-black' : 'text-slate-400'}`}>ATIVOS ({ativos.size})</button>{PIXEL_AGENT_SQUADS.map((item) => <button key={item.id} type="button" onClick={() => setSquad(item.id)} className={`px-2 py-1 text-[9px] font-black ${squad === item.id ? 'text-black' : 'text-slate-400'}`} style={squad === item.id ? { backgroundColor: item.cor } : undefined}>{item.nome}</button>)}</div><div className="border-2 border-black bg-[#0b1324]/95 px-2 py-1 text-[9px] text-slate-300 shadow-[3px_3px_0_#000]">Arraste para mover · roda para zoom · clique para inspecionar</div></div>
  </div>
}
