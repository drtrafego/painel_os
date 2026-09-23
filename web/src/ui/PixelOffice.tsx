import { useEffect, useRef, useState } from 'react'
import type { AgenteVivo } from '../dados/tipos'

interface PixelOfficeProps {
  agentes: AgenteVivo[]
  aoSelecionarAgente?: (agenteId: string) => void
  agenteSelecionadoId?: string | null
}

interface PosicaoPersonagem {
  x: number
  y: number
  targetX: number
  targetY: number
  deskX: number
  deskY: number
  estado: 'sentado' | 'andando' | 'digitando' | 'cafe'
  olhandoPara: 'baixo' | 'cima' | 'esquerda' | 'direita'
  frameAnim: number
  corCamisa: string
  corCabelo: string
  nome: string
  id: string
}

const CORES_CAMISA = ['#38bdf8', '#a3e635', '#facc15', '#c084fc', '#fb923c', '#f43f5e']
const CORES_CABELO = ['#1e293b', '#78350f', '#d97706', '#0f172a', '#475569', '#ca8a04']

/**
 * PixelOffice - Motor Canvas 2D estilo "pixel-agents-hq/pixel-agents".
 * Renderiza um escritório virtual pixel-art com mesas, computadores, lâmpadas,
 * servidores e os agentes em execução viva andando, digitando e pensando.
 */
export function PixelOffice({ agentes, aoSelecionarAgente, agenteSelecionadoId }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [zoom, setZoom] = useState(1.5)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoArrasto, setPontoArrasto] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [agenteFoco, setAgenteFoco] = useState<string | null>(agenteSelecionadoId ?? null)
  const [somLigado, setSomLigado] = useState(false)

  // Estado interno dos personagens no escritório
  const personagensRef = useRef<Map<string, PosicaoPersonagem>>(new Map())

  // Configuração das mesas do escritório
  const mesas = [
    { x: 100, y: 130, ocupadaPor: '' },
    { x: 220, y: 130, ocupadaPor: '' },
    { x: 340, y: 130, ocupadaPor: '' },
    { x: 100, y: 240, ocupadaPor: '' },
    { x: 220, y: 240, ocupadaPor: '' },
    { x: 340, y: 240, ocupadaPor: '' },
    { x: 460, y: 130, ocupadaPor: '' },
    { x: 460, y: 240, ocupadaPor: '' },
  ]

  // Atualiza ou adiciona personagens conforme agentes vivos
  useEffect(() => {
    const mapa = personagensRef.current

    // Garante que há pelo menos personagens representativos se a lista estiver vazia
    const listaTrabalho = agentes.length > 0
      ? agentes
      : [
          { id: 'luana', estado: 'trabalhando' as const, etapa: 'Orquestrando tarefas e squads', ferramenta: 'dispatcher', silencio_s: 2, fase: 'execução', etapa_e_description: 'Coordenando pipeline de produção' },
          { id: 'renato', estado: 'trabalhando' as const, etapa: 'Validando regras de automação', ferramenta: 'verificador', silencio_s: 5, fase: 'auditoria', etapa_e_description: 'Checando conformidade e credenciais' },
          { id: 'gastao', estado: 'silencioso' as const, etapa: 'Supervisionando operações', ferramenta: null, silencio_s: 14, fase: 'supervisão', etapa_e_description: 'Aguardando novas diretivas' },
        ]

    listaTrabalho.forEach((ag, idx) => {
      if (!mapa.has(ag.id)) {
        const mesa = mesas[idx % mesas.length]
        mapa.set(ag.id, {
          id: ag.id,
          nome: ag.id.toUpperCase(),
          x: mesa.x,
          y: mesa.y + 10,
          targetX: mesa.x,
          targetY: mesa.y + 10,
          deskX: mesa.x,
          deskY: mesa.y,
          estado: ag.estado === 'trabalhando' ? 'digitando' : 'sentado',
          olhandoPara: 'cima',
          frameAnim: 0,
          corCamisa: CORES_CAMISA[idx % CORES_CAMISA.length],
          corCabelo: CORES_CABELO[idx % CORES_CABELO.length],
        })
      } else {
        const p = mapa.get(ag.id)!
        p.estado = ag.estado === 'trabalhando' ? 'digitando' : 'sentado'
      }
    })
  }, [agentes])

  // Loop de Renderização Principal (60 FPS)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let tick = 0

    const render = () => {
      tick++
      
      // Ajuste de DPI e tamanho
      const container = containerRef.current
      if (container) {
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
          canvas.width = container.clientWidth
          canvas.height = container.clientHeight
        }
      }

      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.save()
      
      // Centro da cena e Pan / Zoom
      ctx.translate(canvas.width / 2 + pan.x, canvas.height / 2 + pan.y)
      ctx.scale(zoom, zoom)
      ctx.translate(-300, -200) // Centro do escritório (600x400)

      // 1. CHÃO DO ESCRITÓRIO (Piso xadrez retrô)
      const gridSize = 24
      for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 25; c++) {
          const px = c * gridSize
          const py = r * gridSize
          ctx.fillStyle = (r + c) % 2 === 0 ? '#1e293b' : '#334155'
          ctx.fillRect(px, py, gridSize, gridSize)
          
          // Detalhe de textura pixel
          ctx.fillStyle = 'rgba(0,0,0,0.15)'
          ctx.fillRect(px, py + gridSize - 1, gridSize, 1)
          ctx.fillRect(px + gridSize - 1, py, 1, gridSize)
        }
      }

      // 2. PAREDES SUPERIORES
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, 600, 32)
      ctx.fillStyle = '#475569'
      ctx.fillRect(0, 32, 600, 4) // Rodapé da parede

      // Janelas na parede com horizonte noturno/cyberpunk
      for (let w = 0; w < 4; w++) {
        const wx = 60 + w * 140
        ctx.fillStyle = '#020617'
        ctx.fillRect(wx, 4, 80, 24)
        // Vidro com estrelas/cidade
        ctx.fillStyle = '#38bdf8'
        ctx.fillRect(wx + 10, 8, 4, 4)
        ctx.fillRect(wx + 35, 14, 6, 6)
        ctx.fillRect(wx + 60, 10, 3, 3)
        // Moldura
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = 2
        ctx.strokeRect(wx, 4, 80, 24)
      }

      // 3. QUADRO DE TAREFAS GTD NA PAREDE (Whiteboard)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(490, 6, 90, 22)
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2
      ctx.strokeRect(490, 6, 90, 22)
      // Mini post-its coloridos
      ctx.fillStyle = '#facc15'
      ctx.fillRect(495, 10, 8, 8)
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(507, 10, 8, 8)
      ctx.fillStyle = '#a3e635'
      ctx.fillRect(519, 10, 8, 8)
      ctx.fillStyle = '#f43f5e'
      ctx.fillRect(531, 10, 8, 8)
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 6px monospace'
      ctx.fillText('GTD SPRINT', 545, 17)

      // 4. MÁQUINA DE CAFÉ & WATER COOLER
      // Máquina de Café
      ctx.fillStyle = '#b91c1c'
      ctx.fillRect(20, 60, 22, 28)
      ctx.fillStyle = '#000000'
      ctx.fillRect(24, 68, 14, 10)
      ctx.fillStyle = '#facc15'
      ctx.fillRect(28, 72, 6, 4) // Xícara
      // Water Cooler
      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(20, 110, 20, 32)
      ctx.fillStyle = '#38bdf8'
      ctx.fillRect(23, 94, 14, 16) // Garrafão azul
      if (Math.floor(tick / 20) % 2 === 0) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(28, 102, 3, 3) // Bolha d'água
      }

      // 5. SERVER RACK COM LEDS PISCANTES
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(550, 60, 32, 65)
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 2
      ctx.strokeRect(550, 60, 32, 65)
      for (let s = 0; s < 5; s++) {
        const sy = 66 + s * 11
        ctx.fillStyle = '#1e293b'
        ctx.fillRect(554, sy, 24, 8)
        // LEDs piscantes
        ctx.fillStyle = (tick + s * 15) % 30 < 15 ? '#a3e635' : '#15803d'
        ctx.fillRect(556, sy + 2, 3, 3)
        ctx.fillStyle = (tick + s * 23) % 40 < 20 ? '#38bdf8' : '#0369a1'
        ctx.fillRect(562, sy + 2, 3, 3)
        ctx.fillStyle = (tick + s * 7) % 50 < 25 ? '#facc15' : '#a16207'
        ctx.fillRect(568, sy + 2, 3, 3)
      }

      // 6. VASO DE PLANTA PIXEL
      ctx.fillStyle = '#b45309'
      ctx.fillRect(20, 340, 22, 20) // Vaso
      ctx.fillStyle = '#15803d'
      ctx.fillRect(16, 310, 30, 30) // Folhagem
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(22, 316, 18, 18)

      // 7. MESAS DE TRABALHO & COMPUTADORES
      mesas.forEach((mesa, idx) => {
        // Tampo da mesa (Madeira)
        ctx.fillStyle = '#92400e'
        ctx.fillRect(mesa.x - 24, mesa.y - 14, 48, 28)
        ctx.fillStyle = '#78350f'
        ctx.fillRect(mesa.x - 24, mesa.y + 10, 48, 4) // Borda

        // Monitor CRT / LED
        const monitorX = mesa.x - 12
        const monitorY = mesa.y - 10
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(monitorX, monitorY, 24, 16)
        
        // Tela com código passando (Scanlines verdes/azuis)
        const telaCor = idx % 2 === 0 ? '#38bdf8' : '#a3e635'
        ctx.fillStyle = telaCor
        ctx.fillRect(monitorX + 2, monitorY + 2, 20, 12)
        // Linhas de código animadas
        ctx.fillStyle = '#0f172a'
        const offsetLinha = (Math.floor(tick / 10) + idx) % 4
        ctx.fillRect(monitorX + 4, monitorY + 3 + offsetLinha * 2, 12, 1)
        ctx.fillRect(monitorX + 4, monitorY + 7, 8, 1)

        // Teclado
        ctx.fillStyle = '#cbd5e1'
        ctx.fillRect(mesa.x - 10, mesa.y + 4, 20, 6)

        // Cadeira de Escritório
        ctx.fillStyle = '#1e293b'
        ctx.beginPath()
        ctx.arc(mesa.x, mesa.y + 24, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#475569'
        ctx.beginPath()
        ctx.arc(mesa.x, mesa.y + 24, 6, 0, Math.PI * 2)
        ctx.fill()
      })

      // 8. RENDERIZAÇÃO DOS PERSONAGENS (PIXEL AGENTS)
      personagensRef.current.forEach((p) => {
        const isFoco = agenteFoco === p.id
        const isTrabalhando = p.estado === 'digitando'

        // Efeito de movimento dos braços ao digitar
        const bracoAnim = isTrabalhando ? (Math.floor(tick / 8) % 2 === 0 ? 1 : -1) : 0
        
        ctx.save()
        ctx.translate(p.x, p.y)

        // Halo / Indicador de Seleção
        if (isFoco) {
          ctx.strokeStyle = '#facc15'
          ctx.lineWidth = 2
          ctx.setLineDash([4, 2])
          ctx.strokeRect(-16, -22, 32, 42)
          ctx.setLineDash([])
        }

        // Sombra do Personagem
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.ellipse(0, 16, 10, 4, 0, 0, Math.PI * 2)
        ctx.fill()

        // Pernas / Calça
        ctx.fillStyle = '#1e293b'
        ctx.fillRect(-6, 8, 4, 8)
        ctx.fillRect(2, 8, 4, 8)
        // Sapatos
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(-7, 14, 5, 3)
        ctx.fillRect(2, 14, 5, 3)

        // Tronco / Camisa
        ctx.fillStyle = p.corCamisa
        ctx.fillRect(-7, -2, 14, 11)

        // Braços (Digitando na mesa)
        ctx.fillStyle = p.corCamisa
        ctx.fillRect(-10, -1 + bracoAnim, 3, 7)
        ctx.fillRect(7, -1 - bracoAnim, 3, 7)
        // Mãos (Tom de pele)
        ctx.fillStyle = '#fed7aa'
        ctx.fillRect(-10, 5 + bracoAnim, 3, 3)
        ctx.fillRect(7, 5 - bracoAnim, 3, 3)

        // Cabeça
        ctx.fillStyle = '#fed7aa'
        ctx.fillRect(-6, -14, 12, 12)

        // Cabelo
        ctx.fillStyle = p.corCabelo
        ctx.fillRect(-7, -17, 14, 6)
        ctx.fillRect(-7, -13, 3, 4)
        ctx.fillRect(4, -13, 3, 4)

        // Olhos (Piscam a cada ~3 segundos)
        const piscando = tick % 180 > 172
        if (!piscando) {
          ctx.fillStyle = '#0f172a'
          ctx.fillRect(-4, -9, 2, 3)
          ctx.fillRect(2, -9, 2, 3)
        } else {
          ctx.fillStyle = '#0f172a'
          ctx.fillRect(-4, -8, 2, 1)
          ctx.fillRect(2, -8, 2, 1)
        }

        // BALÃO DE FALA / STATUS PIXEL FLUTUANTE
        const agenteDado = agentes.find((a) => a.id === p.id)
        const ferramenta = agenteDado?.ferramenta
        const etapa = agenteDado?.etapa

        const balaoY = -28
        const textoBalao = isTrabalhando
          ? ferramenta ? `⚡ ${ferramenta}` : etapa ? `⚡ ${etapa.slice(0, 14)}` : '⚡ EXECUTANDO'
          : '☕ AGUARDANDO'

        ctx.font = 'bold 9px monospace'
        const textWidth = ctx.measureText(textoBalao).width
        const bw = Math.max(textWidth + 12, 54)
        const bh = 16

        // Balão de diálogo estilo RPG
        ctx.fillStyle = isTrabalhando ? '#0f172a' : '#1e293b'
        ctx.fillRect(-bw / 2, balaoY - bh, bw, bh)
        ctx.strokeStyle = isTrabalhando ? '#a3e635' : '#94a3b8'
        ctx.lineWidth = 1.5
        ctx.strokeRect(-bw / 2, balaoY - bh, bw, bh)

        // Triângulo do balão apontando para a cabeça
        ctx.fillStyle = isTrabalhando ? '#0f172a' : '#1e293b'
        ctx.beginPath()
        ctx.moveTo(-3, balaoY)
        ctx.lineTo(3, balaoY)
        ctx.lineTo(0, balaoY + 4)
        ctx.fill()

        // Texto do balão
        ctx.fillStyle = isTrabalhando ? '#a3e635' : '#f8fafc'
        ctx.textAlign = 'center'
        ctx.fillText(textoBalao, 0, balaoY - 5)

        // TAG DO NOME DO AGENTE
        ctx.fillStyle = '#000000'
        ctx.fillRect(-22, 21, 44, 11)
        ctx.fillStyle = '#facc15'
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(p.nome, 0, 29)

        ctx.restore()
      })

      ctx.restore()
      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [zoom, pan, agentes, agenteFoco])

  // Trata cliques no canvas para selecionar personagens
  const aoClicarCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Converte coordenada da tela para o espaço do escritório
    const cx = canvas.width / 2 + pan.x
    const cy = canvas.height / 2 + pan.y
    const worldX = (mouseX - cx) / zoom + 300
    const worldY = (mouseY - cy) / zoom + 200

    let clicouEm: string | null = null
    personagensRef.current.forEach((p) => {
      const dist = Math.hypot(p.x - worldX, p.y - worldY)
      if (dist < 32) {
        clicouEm = p.id
      }
    })

    setAgenteFoco(clicouEm)
    if (clicouEm && aoSelecionarAgente) {
      aoSelecionarAgente(clicouEm)
    }
  }

  // Pan com arrasto do mouse
  const iniciarArrasto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    setArrastando(true)
    setPontoArrasto({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y })
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }

  const aoArrastar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrastando || !pontoArrasto) return
    const dx = e.clientX - pontoArrasto.x
    const dy = e.clientY - pontoArrasto.y
    setPan({ x: pontoArrasto.panX + dx, y: pontoArrasto.panY + dy })
  }

  const finalizarArrasto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrastando) return
    setArrastando(false)
    setPontoArrasto(null)
    try {
      ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    } catch {}
  }

  const aoRolarZoom = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 1.15 : 0.88
    setZoom((z) => Math.min(3.0, Math.max(0.7, Number((z * delta).toFixed(2)))))
  }

  return (
    <div
      ref={containerRef}
      className="relative h-[380px] w-full select-none overflow-hidden border-4 border-black bg-[#0f172a] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:h-[460px] lg:h-[520px]"
    >
      <canvas
        ref={canvasRef}
        onClick={aoClicarCanvas}
        onPointerDown={iniciarArrasto}
        onPointerMove={aoArrastar}
        onPointerUp={finalizarArrasto}
        onWheel={aoRolarZoom}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Barra de HUD Superior do Escritório Pixel */}
      <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 border-2 border-black bg-[#1e293b]/90 px-3 py-1.5 backdrop-blur-md shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <span className="inline-block size-3 bg-[#a3e635] shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] animate-ping" />
          <span className="font-mono text-xs font-black uppercase tracking-wider text-[#facc15]">
            PIXEL AGENTS VIRTUAL OFFICE
          </span>
          <span className="font-mono text-[10px] text-slate-300">
            · {personagensRef.current.size} AGENTES NO ESCRITÓRIO
          </span>
        </div>

        {/* Controles de Zoom & Som */}
        <div className="pointer-events-auto flex items-center gap-1.5 border-2 border-black bg-[#1e293b]/90 p-1 backdrop-blur-md shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <button
            type="button"
            title="Aumentar zoom"
            onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.25).toFixed(2))))}
            className="flex size-6 items-center justify-center border border-black bg-[#0f172a] text-xs font-black text-white hover:bg-slate-700 active:scale-95"
          >
            +
          </button>
          <button
            type="button"
            title="Diminuir zoom"
            onClick={() => setZoom((z) => Math.max(0.7, Number((z - 0.25).toFixed(2))))}
            className="flex size-6 items-center justify-center border border-black bg-[#0f172a] text-xs font-black text-white hover:bg-slate-700 active:scale-95"
          >
            -
          </button>
          <button
            type="button"
            title="Resetar câmera"
            onClick={() => { setZoom(1.5); setPan({ x: 0, y: 0 }) }}
            className="flex h-6 px-2 items-center justify-center border border-black bg-[#0f172a] text-[10px] font-black text-[#38bdf8] hover:bg-slate-700 active:scale-95"
          >
            RESET
          </button>
          <button
            type="button"
            title={somLigado ? 'Mutar sons' : 'Ativar efeitos sonoros 8-bit'}
            onClick={() => setSomLigado((s) => !s)}
            className={`flex h-6 px-2 items-center justify-center border border-black text-[10px] font-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
              somLigado ? 'bg-[#a3e635] text-black' : 'bg-[#0f172a] text-slate-400'
            }`}
          >
            {somLigado ? '🔊 SFX ON' : '🔇 SFX OFF'}
          </button>
        </div>
      </div>

      {/* Banner de Ajuda no Rodapé do Canvas */}
      <div className="absolute bottom-3 left-3 z-10 border-2 border-black bg-[#0f172a]/90 px-3 py-1.5 font-mono text-[10.5px] text-slate-300 backdrop-blur-md shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
        <span>🖱️ <strong>Arrasta</strong> para mover o escritório · <strong>Roda do mouse</strong> para Zoom · <strong>Clique</strong> no agente para inspecionar</span>
      </div>
    </div>
  )
}
