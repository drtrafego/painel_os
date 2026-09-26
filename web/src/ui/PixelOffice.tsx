import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgenteVivo, Estado } from '../dados/tipos'
import {
  chaveAgente,
  formatarRotulo,
  mesclarRuntimesNoCatalogo,
  obterAtivosNoCatalogo,
  PIXEL_AGENTS,
  PIXEL_AGENT_SQUADS,
  resolverAgenteNoCatalogo,
  type PixelAgent,
  type PixelAgentSquad,
} from '../dados/pixel-agents'
import {
  avancarEstadoAnimacao,
  criarEstadoInicialBoneco,
  type EstadoAnimacaoBoneco,
  type Posicao2D,
} from '../dados/escritorio-animacao'
import { useAgentesVivos } from '../dados/useAgentesVivos'

export { chaveAgente, formatarRotulo, resolverAgenteNoCatalogo, obterAtivosNoCatalogo }

interface PixelOfficeProps {
  agentes: AgenteVivo[]
  catalogo?: PixelAgent[]
  estado?: Estado
  aoSelecionarAgente?: (chaveExecucao: string) => void
  agenteSelecionadoId?: string | null
  soAtivos?: boolean
  aoAlternarSoAtivos?: (soAtivos: boolean) => void
  aoAbrirCerebro?: () => void
}

const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.2

interface MesaCalculada {
  id: string
  chave: string
  agente: PixelAgent
  squad: PixelAgentSquad
  x: number
  y: number
  largura: number
  altura: number
  execucao?: AgenteVivo
}

interface IlhaSquadCalculada {
  squad: PixelAgentSquad
  nome: string
  cor: string
  gx: number
  gy: number
  largura: number
  altura: number
}

// Configuração espacial dos clusters/departamentos no piso contínuo
const CLUSTERS_CONFIG: Array<{ id: PixelAgentSquad; nome: string; cor: string; gx: number; gy: number; largura: number; altura: number }> = [
  { id: 'coordenação', nome: 'COORDENAÇÃO · LUANA', cor: '#84cc16', gx: 0, gy: -210, largura: 300, altura: 170 },
  { id: 'bots', nome: 'RENATO / BOTS', cor: '#f97316', gx: 280, gy: -100, largura: 280, altura: 170 },
  { id: 'tráfego', nome: 'BIA / TRÁFEGO', cor: '#a855f7', gx: 280, gy: 140, largura: 280, altura: 170 },
  { id: 'comercial', nome: 'SQUAD COMERCIAL', cor: '#10b981', gx: 0, gy: 240, largura: 300, altura: 170 },
  { id: 'globais', nome: 'GLOBAIS', cor: '#06b6d4', gx: -280, gy: 140, largura: 280, altura: 170 },
  { id: 'conteúdo', nome: 'SQUAD CONTEÚDO', cor: '#f59e0b', gx: -280, gy: -100, largura: 280, altura: 170 },
]

export function PixelOffice({
  agentes,
  catalogo = PIXEL_AGENTS,
  aoSelecionarAgente,
  agenteSelecionadoId,
  soAtivos = false,
  aoAlternarSoAtivos,
  aoAbrirCerebro,
}: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const estadosBonecosRef = useRef<Map<string, EstadoAnimacaoBoneco>>(new Map())
  const ultimoTimestampRef = useRef<number>(performance.now())

  // Sonda de Agentes Vivos Compartilhada
  const { statusLeitura, recebidoEm, falhouHaSegundos, erro: erroSonda } = useAgentesVivos()

  // Controle de Câmera (Pan & Zoom)
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoArrasto, setPontoArrasto] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const vistaManualRef = useRef(false)

  // Respeita preferência do usuário por movimento reduzido
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduzirMovimento(media.matches)
    const listener = (e: MediaQueryListEvent) => setReduzirMovimento(e.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  // Mesclagem do catálogo com agentes em tempo de execução
  const catalogoVisual = useMemo(() => {
    return mesclarRuntimesNoCatalogo(catalogo, agentes)
  }, [catalogo, agentes])

  // Agrupamento por squad
  const agentesPorSquad = useMemo(() => {
    const mapa = new Map<PixelAgentSquad, PixelAgent[]>()
    PIXEL_AGENT_SQUADS.forEach((s) => mapa.set(s.id, []))
    catalogoVisual.forEach((ag) => {
      const lista = mapa.get(ag.squad) ?? []
      lista.push(ag)
      mapa.set(ag.squad, lista)
    })
    return mapa
  }, [catalogoVisual])

  // Mapa de execuções ativas
  const mapaExecucoes = useMemo(() => {
    const mapa = new Map<string, AgenteVivo>()
    agentes.forEach((a) => {
      const chave = a.dono ? `${a.dono}:${a.id}` : a.id
      mapa.set(chave, a)
      mapa.set(a.id, a)
    })
    return mapa
  }, [agentes])

  // Cálculo das ilhas e posições dinâmicas de mesas (sem limite rígido de 6 mesas)
  const { ilhasCalculadas, todasMesas } = useMemo(() => {
    const ilhas: IlhaSquadCalculada[] = []
    const mesas: MesaCalculada[] = []

    CLUSTERS_CONFIG.forEach((cfg) => {
      const ags = agentesPorSquad.get(cfg.id) ?? []
      const nAgentes = ags.length
      const colunas = nAgentes > 8 ? 4 : 3
      const linhas = Math.max(2, Math.ceil(nAgentes / colunas))

      // Dimensões dinâmicas do piso do cluster
      const largura = Math.max(cfg.largura, colunas * 72 + 50)
      const altura = Math.max(cfg.altura, linhas * 56 + 60)

      ilhas.push({
        squad: cfg.id,
        nome: cfg.nome,
        cor: cfg.cor,
        gx: cfg.gx,
        gy: cfg.gy,
        largura,
        altura,
      })

      // Distribuição das mesas dentro da área do squad
      const meioW = largura / 2
      const meioH = altura / 2
      const espacoX = (largura - 40) / colunas
      const espacoY = (altura - 50) / linhas

      ags.forEach((ag, idx) => {
        const col = idx % colunas
        const row = Math.floor(idx / colunas)
        const mx = cfg.gx - meioW + 28 + col * espacoX + espacoX / 2
        const my = cfg.gy - meioH + 34 + row * espacoY + espacoY / 2
        const chave = chaveAgente(undefined, ag.id)
        const execucao = mapaExecucoes.get(chave) || mapaExecucoes.get(ag.id)

        mesas.push({
          id: ag.id,
          chave,
          agente: ag,
          squad: cfg.id,
          x: mx,
          y: my,
          largura: 54,
          altura: 42,
          execucao,
        })
      })
    })

    return { ilhasCalculadas: ilhas, todasMesas: mesas }
  }, [agentesPorSquad, mapaExecucoes])

  // Posição de descanso/lounge dos agentes inativos
  const posicaoDescanso: Posicao2D = useMemo(() => ({ x: 0, y: 380 }), [])

  // Enquadramento automático na câmera (Auto-frame)
  useEffect(() => {
    if (vistaManualRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    const largura = canvas.clientWidth || 800
    const altura = canvas.clientHeight || 500

    if (soAtivos) {
      const mesasAtivas = todasMesas.filter((m) => m.execucao && m.execucao.estado === 'trabalhando')
      if (mesasAtivas.length > 0) {
        let minX = Infinity
        let maxX = -Infinity
        let minY = Infinity
        let maxY = -Infinity
        mesasAtivas.forEach((m) => {
          minX = Math.min(minX, m.x - 40)
          maxX = Math.max(maxX, m.x + 40)
          minY = Math.min(minY, m.y - 40)
          maxY = Math.max(maxY, m.y + 40)
        })
        const boundingW = Math.max(220, maxX - minX)
        const boundingH = Math.max(180, maxY - minY)
        const centroX = (minX + maxX) / 2
        const centroY = (minY + maxY) / 2

        const zoomDesejado = Math.min(
          ZOOM_MAX,
          Math.max(ZOOM_MIN, Math.min((largura * 0.75) / boundingW, (altura * 0.75) / boundingH))
        )
        setZoom(zoomDesejado)
        setPan({ x: -centroX * zoomDesejado, y: -centroY * zoomDesejado })
        return
      }
    }

    // Visão Geral Padrão
    const zoomPadrao = largura < 640 ? 0.65 : largura < 1024 ? 0.85 : 1.0
    setZoom(zoomPadrao)
    setPan({ x: 0, y: 20 })
  }, [soAtivos, todasMesas])

  // Total de agentes trabalhando no momento
  const totalTrabalhando = useMemo(() => {
    return agentes.filter((a) => a.estado === 'trabalhando').length
  }, [agentes])

  // Loop de Renderização e Animação no Canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let rodando = true

    const desenhar = (timestamp: number) => {
      if (!rodando) return
      ultimoTimestampRef.current = timestamp

      // Ajusta resolução do canvas
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)

      // Fundo Escuro Voxel/Isométrico
      ctx.fillStyle = '#05070e'
      ctx.fillRect(0, 0, w, h)

      // Aplica Câmera (Pan & Zoom a partir do centro do canvas)
      ctx.save()
      ctx.translate(w / 2 + pan.x, h / 2 + pan.y)
      ctx.scale(zoom, zoom)

      // 1. Grade Isométrica Sutil no Fundo
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 1
      const gradeTam = 40
      for (let x = -500; x <= 500; x += gradeTam) {
        ctx.beginPath()
        ctx.moveTo(x, -400)
        ctx.lineTo(x, 450)
        ctx.stroke()
      }
      for (let y = -400; y <= 450; y += gradeTam) {
        ctx.beginPath()
        ctx.moveTo(-500, y)
        ctx.lineTo(500, y)
        ctx.stroke()
      }

      // 2. Corredores e Caminhos Conectando os Squads
      ctx.fillStyle = '#0a1020'
      ctx.fillRect(-320, -10, 640, 30) // Corredor horizontal principal
      ctx.fillRect(-15, -240, 30, 490) // Corredor vertical principal

      // 3. Marca Voxel na Parede: G4ST40VIB3 / casaldotrafego.com
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(-190, -325, 380, 48)
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 2
      ctx.strokeRect(-190, -325, 380, 48)

      ctx.fillStyle = '#facc15'
      ctx.font = 'bold 15px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('G4ST40VIB3', 0, -305)

      ctx.fillStyle = '#38bdf8'
      ctx.font = 'bold 11px monospace'
      ctx.fillText('casaldotrafego.com', 0, -289)

      // 4. Pisos dos Squads
      ilhasCalculadas.forEach((ilha) => {
        const x = ilha.gx - ilha.largura / 2
        const y = ilha.gy - ilha.altura / 2

        // Piso do departamento
        ctx.fillStyle = '#0d1322'
        ctx.fillRect(x, y, ilha.largura, ilha.altura)

        // Borda superior colorida do squad
        ctx.fillStyle = ilha.cor
        ctx.fillRect(x, y, ilha.largura, 4)

        // Contorno fino
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, ilha.largura, ilha.altura)

        // Nome do Squad
        ctx.fillStyle = ilha.cor
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'left'
        ctx.fillText(ilha.nome, x + 10, y + 18)
      })

      // 5. Mesas, Computadores e Cadeiras
      todasMesas.forEach((mesa) => {
        const mx = mesa.x
        const my = mesa.y
        const ehSelecionado = agenteSelecionadoId === mesa.chave || agenteSelecionadoId === mesa.id
        const ehAtivo = mesa.execucao?.estado === 'trabalhando'

        // Sombra da Mesa
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
        ctx.fillRect(mx - 22, my - 14, 44, 28)

        // Tampo da Mesa Voxel
        ctx.fillStyle = ehSelecionado ? '#1e3a8a' : '#1e293b'
        ctx.fillRect(mx - 20, my - 16, 40, 24)
        ctx.strokeStyle = ehSelecionado ? '#38bdf8' : ehAtivo ? '#a3e635' : '#334155'
        ctx.lineWidth = ehSelecionado ? 2 : 1
        ctx.strokeRect(mx - 20, my - 16, 40, 24)

        // Monitor do Computador
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(mx - 9, my - 13, 18, 10)
        // Tela acesa se trabalhando
        ctx.fillStyle = ehAtivo ? '#38bdf8' : '#334155'
        ctx.fillRect(mx - 7, my - 11, 14, 6)

        // Teclado
        ctx.fillStyle = '#475569'
        ctx.fillRect(mx - 7, my - 1, 14, 4)

        // Cadeira
        ctx.fillStyle = '#090d16'
        ctx.fillRect(mx - 8, my + 6, 16, 7)
        ctx.strokeStyle = '#1e293b'
        ctx.strokeRect(mx - 8, my + 6, 16, 7)

        // Nome Curto do Agente sob a mesa
        ctx.fillStyle = ehSelecionado ? '#38bdf8' : ehAtivo ? '#a3e635' : '#94a3b8'
        ctx.font = 'bold 9px monospace'
        ctx.textAlign = 'center'
        const rotuloCurto = formatarRotulo(mesa.agente.nome || mesa.agente.id, '', 12)
        ctx.fillText(rotuloCurto, mx, my + 23)
      })

      // 6. Atualização e Desenho dos Personagens (State Machine RAF)
      todasMesas.forEach((mesa) => {
        const chave = mesa.chave
        const estadoApi = mesa.execucao?.estado ?? 'parado'
        const ferramenta = mesa.execucao?.ferramenta ?? null
        const posicaoMesa: Posicao2D = { x: mesa.x, y: mesa.y + 4 }

        let boneco = estadosBonecosRef.current.get(chave)
        if (!boneco) {
          boneco = criarEstadoInicialBoneco(chave, estadoApi, posicaoMesa, posicaoDescanso, timestamp, ferramenta)
          estadosBonecosRef.current.set(chave, boneco)
        }

        // Avança a máquina de estados determinística
        boneco = avancarEstadoAnimacao(
          boneco,
          estadoApi,
          posicaoMesa,
          posicaoDescanso,
          timestamp,
          reduzirMovimento,
          ferramenta
        )
        estadosBonecosRef.current.set(chave, boneco)

        // Se o modo for "Só Ativos" e o agente estiver completamente no descanso/inativo, omite do desenho
        if (soAtivos && estadoApi === 'parado' && boneco.fase === 'descanso') {
          return
        }

        // Desenho do Boneco Voxel
        const bx = boneco.x
        const by = boneco.y
        const postura = boneco.fase === 'caminhando_para_mesa' || boneco.fase === 'caminhando_para_descanso'
          ? 'andando'
          : boneco.posturaTrabalho
        const ehTrabalhando = estadoApi === 'trabalhando'
        const ehSelecionado = agenteSelecionadoId === mesa.chave || agenteSelecionadoId === mesa.id

        ctx.save()
        ctx.translate(bx, by)

        // Destaque se selecionado
        if (ehSelecionado) {
          ctx.strokeStyle = '#38bdf8'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(0, 0, 15, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Cabeça
        ctx.fillStyle = '#fde047' // tom de pele/amarelo pixel
        ctx.fillRect(-4, -13, 8, 8)
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1
        ctx.strokeRect(-4, -13, 8, 8)

        // Cabelo / Boné
        ctx.fillStyle = mesa.squad === 'coordenação' ? '#38bdf8' : mesa.squad === 'bots' ? '#ea580c' : '#7c3aed'
        ctx.fillRect(-5, -15, 10, 4)

        // Corpo / Camiseta
        const corRoupa = mesa.execucao?.dono === 'luana' ? '#0284c7' : mesa.execucao?.dono === 'renato' ? '#f97316' : '#a855f7'
        ctx.fillStyle = corRoupa
        ctx.fillRect(-5, -5, 10, 8)
        ctx.strokeRect(-5, -5, 10, 8)

        // Posturas dos Braços
        if (postura === 'digitando') {
          // Braços esticados para o teclado com animação sutil
          const animOffset = Math.sin(timestamp * 0.018) * 1.5
          ctx.fillStyle = '#fde047'
          ctx.fillRect(-6, -3 + animOffset, 3, 5)
          ctx.fillRect(3, -3 - animOffset, 3, 5)
        } else if (postura === 'lendo') {
          // Braços erguidos na altura do monitor
          ctx.fillStyle = '#fde047'
          ctx.fillRect(-6, -6, 3, 5)
          ctx.fillRect(3, -6, 3, 5)
        } else if (postura === 'andando') {
          // Balanço ao caminhar
          const passo = Math.sin(timestamp * 0.012) * 3
          ctx.fillStyle = corRoupa
          ctx.fillRect(-7, -4 + passo, 3, 7)
          ctx.fillRect(4, -4 - passo, 3, 7)
          // Pernas
          ctx.fillStyle = '#1e293b'
          ctx.fillRect(-4, 3 + passo, 3, 5)
          ctx.fillRect(1, 3 - passo, 3, 5)
        } else {
          // Silencioso ou Descanso (mãos no colo)
          ctx.fillStyle = corRoupa
          ctx.fillRect(-6, -2, 3, 5)
          ctx.fillRect(3, -2, 3, 5)
        }

        // Balãozinho de status para ativos
        if (ehTrabalhando) {
          ctx.fillStyle = '#a3e635'
          ctx.beginPath()
          ctx.arc(6, -16, 3, 0, Math.PI * 2)
          ctx.fill()
        }

        ctx.restore()
      })

      ctx.restore()
      ctx.restore()

      animFrameRef.current = requestAnimationFrame(desenhar)
    }

    animFrameRef.current = requestAnimationFrame(desenhar)

    return () => {
      rodando = false
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [
    ilhasCalculadas,
    todasMesas,
    pan,
    zoom,
    soAtivos,
    agenteSelecionadoId,
    reduzirMovimento,
    posicaoDescanso,
  ])

  // Tratamento de clique no canvas para selecionar agente
  const tratarCliqueCanvas = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = evento.clientX - rect.left
    const clientY = evento.clientY - rect.top

    const w = canvas.clientWidth
    const h = canvas.clientHeight

    // Converte coordenada da tela para coordenadas do mundo
    const mundoX = (clientX - (w / 2 + pan.x)) / zoom
    const mundoY = (clientY - (h / 2 + pan.y)) / zoom

    // Busca a mesa mais próxima clicada
    let mesaEncontrada: MesaCalculada | null = null
    for (const mesa of todasMesas) {
      const dist = Math.hypot(mesa.x - mundoX, mesa.y - mundoY)
      if (dist < 32) {
        mesaEncontrada = mesa
        break
      }
    }

    if (mesaEncontrada) {
      aoSelecionarAgente?.(mesaEncontrada.chave)
    }
  }

  // Interações de Pan com Ponteiro
  const iniciarArrasto = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (evento.button !== 0) return
    vistaManualRef.current = true
    setArrastando(true)
    setPontoArrasto({ x: evento.clientX, y: evento.clientY, panX: pan.x, panY: pan.y })
    evento.currentTarget.setPointerCapture(evento.pointerId)
  }

  const arrastar = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrastando || !pontoArrasto) return
    setPan({
      x: pontoArrasto.panX + evento.clientX - pontoArrasto.x,
      y: pontoArrasto.panY + evento.clientY - pontoArrasto.y,
    })
  }

  const finalizarArrasto = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    setArrastando(false)
    setPontoArrasto(null)
    evento.currentTarget.releasePointerCapture?.(evento.pointerId)
  }

  return (
    <div className="flex flex-col gap-3 font-mono">
      {/* Barra de Controles Superiores do Escritório */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded border-2 border-black bg-[#0f172a] p-2.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Filtro Só Ativos */}
          <button
            type="button"
            onClick={() => aoAlternarSoAtivos?.(!soAtivos)}
            aria-pressed={soAtivos}
            className={`flex items-center gap-2 border-2 border-black px-3 py-1 text-xs font-black uppercase transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
              soAtivos
                ? 'bg-[#a3e635] text-black hover:bg-[#bef264]'
                : 'bg-[#1e293b] text-slate-300 hover:bg-[#334155]'
            }`}
          >
            <span
              className={`size-2.5 rounded-full ${
                soAtivos ? 'bg-black animate-ping' : 'bg-[#a3e635]'
              }`}
            />
            <span>{soAtivos ? 'SÓ ATIVOS (LIGADO)' : 'FILTRAR: SÓ ATIVOS'}</span>
            <span className="rounded bg-black/20 px-1 text-[10px]">
              {totalTrabalhando}
            </span>
          </button>

          {/* Botão para abrir o Cérebro */}
          {aoAbrirCerebro && (
            <button
              type="button"
              onClick={aoAbrirCerebro}
              className="flex items-center gap-1.5 border-2 border-black bg-[#0284c7] px-3 py-1 text-xs font-black uppercase text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#0369a1]"
            >
              <span>🧠 CÉREBRO</span>
            </button>
          )}
        </div>

        {/* Controles de Câmera (Zoom e Reset) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              vistaManualRef.current = true
              setZoom((z) => Math.min(ZOOM_MAX, z + 0.2))
            }}
            title="Aproximar Câmera"
            className="border-2 border-black bg-[#1e293b] px-2.5 py-1 text-xs font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#334155]"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              vistaManualRef.current = true
              setZoom((z) => Math.max(ZOOM_MIN, z - 0.2))
            }}
            title="Afastar Câmera"
            className="border-2 border-black bg-[#1e293b] px-2.5 py-1 text-xs font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#334155]"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => {
              vistaManualRef.current = false
              setZoom(1.0)
              setPan({ x: 0, y: 20 })
            }}
            title="Resetar Enquadramento"
            className="border-2 border-black bg-[#1e293b] px-2.5 py-1 text-xs font-bold text-slate-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#334155]"
          >
            ↺ RESET
          </button>
        </div>
      </div>

      {/* Estado da Sonda no Topo da Cena */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-slate-400">
        <div>
          {statusLeitura === 'confirmado' && recebidoEm && (
            <span className="text-[#a3e635]">
              ✓ Leitura confirmada · resposta recebida há {Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s
            </span>
          )}
          {statusLeitura === 'consultando' && (
            <span className="text-[#38bdf8] animate-pulse">
              ⏳ Consultando sonda de agentes ao vivo...
            </span>
          )}
          {statusLeitura === 'leitura_vencida' && (
            <span className="text-[#facc15]">
              ⚠️ Leitura vencida (última resposta há {falhouHaSegundos ?? 25}s)
            </span>
          )}
          {statusLeitura === 'indisponivel' && (
            <span className="text-[#ef4444]">
              ❌ Não foi possível confirmar os agentes ativos ({erroSonda || 'sonda indisponível'})
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500">
          Clique em qualquer agente/mesa para inspecionar
        </div>
      </div>

      {/* Aviso de Nenhum Agente Trabalhando em 'Só Ativos' */}
      {soAtivos && totalTrabalhando === 0 && statusLeitura !== 'indisponivel' && (
        <div className="rounded border-2 border-black bg-[#1e293b] p-3 text-center text-xs text-slate-300 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <span>Nenhum agente trabalhando agora</span>
          {recebidoEm && (
            <span className="ml-1.5 text-slate-400 font-mono text-[10.5px]">
              (última leitura: {recebidoEm.toLocaleTimeString('pt-BR')})
            </span>
          )}
          <button
            type="button"
            onClick={() => aoAlternarSoAtivos?.(false)}
            className="ml-3 border border-black bg-[#0f172a] px-2 py-0.5 text-[11px] font-bold text-[#38bdf8] hover:bg-slate-800"
          >
            Ver sala completa ↗
          </button>
        </div>
      )}

      {/* Canvas da Cena Voxel Interativa */}
      <div className="relative h-[min(70vh,560px)] min-h-[380px] w-full overflow-hidden rounded-lg border-4 border-black bg-[#03050a] shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <canvas
          ref={canvasRef}
          onClick={tratarCliqueCanvas}
          onPointerDown={iniciarArrasto}
          onPointerMove={arrastar}
          onPointerUp={finalizarArrasto}
          onPointerCancel={finalizarArrasto}
          className="h-full w-full cursor-grab active:cursor-grabbing touch-none select-none"
        />
      </div>
    </div>
  )
}
