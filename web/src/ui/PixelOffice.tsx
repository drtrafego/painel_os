import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgenteVivo, Estado } from '../dados/tipos'
import {
  chaveAgente,
  formatarRotulo,
  mesclarRuntimesNoCatalogo,
  obterAtivosNoCatalogo,
  PIXEL_AGENTS,
  resolverAgenteNoCatalogo,
  type PixelAgent,
  type PixelAgentSquad,
} from '../dados/pixel-agents'
import { COR_DA_SESSAO } from './paleta'

export { chaveAgente, formatarRotulo, resolverAgenteNoCatalogo, obterAtivosNoCatalogo }

interface TarefaItem {
  id: string
  texto: string
  departamento: string
  estado: 'aguardando' | 'em_andamento' | 'feito' | 'erro'
  criado_em: string
  progresso?: number
  resultado?: string | null
}

interface PixelOfficeProps {
  agentes: AgenteVivo[]
  catalogo?: PixelAgent[]
  estado?: Estado
  aoSelecionarAgente?: (agenteId: string) => void
  agenteSelecionadoId?: string | null
}

type FiltroStatus = 'ALL' | 'BACKLOG' | 'IN PROGRESS' | 'WAITING' | 'DONE'

const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.5

function arredondarZoom(valor: number) {
  return Number(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor)).toFixed(2))
}

const DEPARTAMENTOS_CONFIG: Array<{
  id: PixelAgentSquad
  nome: string
  cor: string
  gx: number
  gy: number
  largura: number
  altura: number
}> = [
  { id: 'coordenação', nome: 'COORDENAÇÃO', cor: '#84cc16', gx: -280, gy: -180, largura: 220, altura: 140 },
  { id: 'bots', nome: 'RENATO / BOTS', cor: '#c2410c', gx: 180, gy: -220, largura: 220, altura: 140 },
  { id: 'tráfego', nome: 'BIA / TRÁFEGO', cor: '#8b5cf6', gx: 280, gy: 20, largura: 220, altura: 140 },
  { id: 'conteúdo', nome: 'SQUAD CONTEÚDO', cor: '#d97706', gx: -320, gy: 40, largura: 240, altura: 160 },
  { id: 'comercial', nome: 'SQUAD COMERCIAL', cor: '#16a34a', gx: 140, gy: 220, largura: 240, altura: 160 },
  { id: 'globais', nome: 'GLOBAIS', cor: '#06b6d4', gx: -120, gy: 240, largura: 220, altura: 140 },
]

export function PixelOffice({
  agentes,
  catalogo = PIXEL_AGENTS,
  estado,
  aoSelecionarAgente,
  agenteSelecionadoId,
}: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoArrasto, setPontoArrasto] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [foco, setFoco] = useState<string | null>(agenteSelecionadoId ?? null)
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  const [horaLocal, setHoraLocal] = useState<string>('')

  // Estado da Barra de Tarefas & Painel Lateral
  const [departamentoTarefa, setDepartamentoTarefa] = useState<string>('luana')
  const [textoNovaTarefa, setTextoNovaTarefa] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('ALL')
  const [enviandoTarefa, setEnviandoTarefa] = useState<boolean>(false)
  const [tarefas, setTarefas] = useState<TarefaItem[]>([
    {
      id: 'tar_demo_1',
      texto: 'Data retention check, 3 systems',
      departamento: 'comercial',
      estado: 'em_andamento',
      progresso: 12,
      criado_em: new Date().toISOString(),
    },
    {
      id: 'tar_demo_2',
      texto: 'Verify mobiles on the AU batch',
      departamento: 'comercial',
      estado: 'em_andamento',
      progresso: 15,
      criado_em: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: 'tar_demo_3',
      texto: 'Refresh the fatigued ad set',
      departamento: 'tráfego',
      estado: 'em_andamento',
      progresso: 21,
      criado_em: new Date(Date.now() - 120000).toISOString(),
    },
    {
      id: 'tar_demo_4',
      texto: 'Rebuild the welcome sequence, email 2',
      departamento: 'conteúdo',
      estado: 'em_andamento',
      progresso: 28,
      criado_em: new Date(Date.now() - 180000).toISOString(),
    },
    {
      id: 'tar_demo_5',
      texto: 'Weekly competitor pricing scan',
      departamento: 'conteúdo',
      estado: 'em_andamento',
      progresso: 32,
      criado_em: new Date(Date.now() - 300000).toISOString(),
    },
  ])

  // Relógio
  useEffect(() => {
    const atualizarHora = () => {
      const agora = new Date()
      setHoraLocal(
        agora.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }).toLowerCase()
      )
    }
    atualizarHora()
    const intv = setInterval(atualizarHora, 1000)
    return () => clearInterval(intv)
  }, [])

  // Buscar Tarefas do Servidor (/api/tarefas)
  useEffect(() => {
    let cancelado = false
    const carregarTarefas = async () => {
      try {
        const resp = await fetch('/api/tarefas')
        if (resp.ok) {
          const dados = await resp.json()
          if (dados.tarefas && Array.isArray(dados.tarefas) && !cancelado) {
            if (dados.tarefas.length > 0) {
              setTarefas((prev) => {
                const idsExistentes = new Set(prev.map((t) => t.id))
                const novas = dados.tarefas.filter((t: TarefaItem) => !idsExistentes.has(t.id))
                return [...novas, ...prev]
              })
            }
          }
        }
      } catch {
        // Fallback silencioso
      }
    }
    carregarTarefas()
    const timer = setInterval(carregarTarefas, 15000)
    return () => {
      cancelado = true
      clearInterval(timer)
    }
  }, [])

  // Inserir Nova Tarefa via POST /api/tarefas
  const adicionarTarefa = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const texto = textoNovaTarefa.trim()
    if (!texto || enviandoTarefa) return

    setEnviandoTarefa(true)
    const dept = departamentoTarefa.toLowerCase()

    try {
      const resp = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, departamento: dept }),
      })
      if (resp.ok) {
        const resData = await resp.json()
        if (resData.ok && resData.tarefa) {
          setTarefas((prev) => [
            {
              ...resData.tarefa,
              progresso: 5,
            },
            ...prev,
          ])
        }
      } else {
        // Fallback local se offline
        const localItem: TarefaItem = {
          id: `tar_local_${Date.now()}`,
          texto,
          departamento: dept,
          estado: 'aguardando',
          progresso: 5,
          criado_em: new Date().toISOString(),
        }
        setTarefas((prev) => [localItem, ...prev])
      }
    } catch {
      const localItem: TarefaItem = {
        id: `tar_local_${Date.now()}`,
        texto,
        departamento: dept,
        estado: 'aguardando',
        progresso: 5,
        criado_em: new Date().toISOString(),
      }
      setTarefas((prev) => [localItem, ...prev])
    } finally {
      setTextoNovaTarefa('')
      setEnviandoTarefa(false)
    }
  }

  const catalogoVisual = useMemo(() => mesclarRuntimesNoCatalogo(catalogo, agentes), [agentes, catalogo])

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

  // Agrupamento dos agentes por Squad/Departamento
  const agentesPorSquad = useMemo(() => {
    const mapa = new Map<PixelAgentSquad, PixelAgent[]>()
    DEPARTAMENTOS_CONFIG.forEach((d) => mapa.set(d.id, []))

    catalogoVisual.forEach((ag) => {
      let squadKey = ag.squad
      if (ag.id === 'renato') squadKey = 'bots'
      if (ag.id === 'bia') squadKey = 'tráfego'
      if (ag.id === 'luana') squadKey = 'coordenação'

      const lista = mapa.get(squadKey) ?? mapa.get('coordenação')!
      lista.push(ag)
    })

    // GARANTIR QUE OS 3 DIRETORES FIQUEM SEMPRE PRESENTES
    const diretoresIDs = ['luana', 'renato', 'bia']
    diretoresIDs.forEach((dirId) => {
      const existe = Array.from(mapa.values()).some((arr) => arr.some((a) => a.id === dirId))
      if (!existe) {
        const donoCor = COR_DA_SESSAO[dirId] ?? '#84cc16'
        const papel = dirId === 'renato' ? 'Dono dos bots' : dirId === 'bia' ? 'Diretora de Tráfego e IA' : 'Super funcionária'
        const squadTarget: PixelAgentSquad = dirId === 'renato' ? 'bots' : dirId === 'bia' ? 'tráfego' : 'coordenação'
        const itemDir: PixelAgent = {
          id: dirId,
          nome: dirId.charAt(0).toUpperCase() + dirId.slice(1),
          papel,
          squad: squadTarget,
          área: 'Diretoria',
          abreviação: dirId.slice(0, 2).toUpperCase(),
          cor: donoCor,
        }
        mapa.get(squadTarget)?.push(itemDir)
      }
    })

    return mapa
  }, [catalogoVisual])

  // Métricas do Estado por Squad
  const metricasSquad = useMemo(() => {
    const res = new Map<PixelAgentSquad, { m1: string; m2: string; doing: number }>()

    DEPARTAMENTOS_CONFIG.forEach((dept) => {
      const ags = agentesPorSquad.get(dept.id) ?? []
      const doingCount = ags.filter((a) => ativos.has(a.id)).length

      let m1 = '—'
      let m2 = '—'

      if (dept.id === 'conteúdo') {
        const pecasTotal = estado?.pecas?.total ?? 244
        const postado = estado?.pecas?.analitica?.por_status?.postado ?? 118
        m1 = `PEÇAS TOTAL ${pecasTotal}`
        m2 = `POSTADO ${postado}`
      } else if (dept.id === 'comercial') {
        const passa = estado?.comercial?.total_passa ?? 18
        const bloqueia = estado?.comercial?.total_bloqueia ?? 4
        m1 = `PASSA ${passa}`
        m2 = `BLOQUEIA ${bloqueia}`
      } else if (dept.id === 'coordenação') {
        const totAprov = estado?.aprovacoes?.total ?? 12
        const totalCron = estado?.cron?.total ?? 31
        m1 = `APROVAÇÕES ${totAprov}`
        m2 = `DISPAROS CRON ${totalCron}`
      } else if (dept.id === 'bots') {
        m1 = `SESSÃO ATIVA`
        m2 = `HERMES BOTS`
      } else if (dept.id === 'tráfego') {
        m1 = `META ADS`
        m2 = `MÍDIA PAGA`
      }

      res.set(dept.id, { m1, m2, doing: doingCount })
    })

    return res
  }, [agentesPorSquad, ativos, estado])

  // Desenho Canvas Isometric 2.5D
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
      const larguraCss = container ? container.clientWidth : 750
      const alturaCss = container ? container.clientHeight : 520

      if (canvas.width !== Math.round(larguraCss * dpr) || canvas.height !== Math.round(alturaCss * dpr)) {
        canvas.width = Math.round(larguraCss * dpr)
        canvas.height = Math.round(alturaCss * dpr)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.clearRect(0, 0, larguraCss, alturaCss)

      // Fundo Neutro Claro Creme (#f7f1e6)
      ctx.fillStyle = '#f7f1e6'
      ctx.fillRect(0, 0, larguraCss, alturaCss)

      ctx.save()
      ctx.translate(larguraCss / 2 + pan.x, alturaCss / 2 + pan.y)
      ctx.scale(zoom, zoom)

      // 1. HUB CENTRAL ("O CÉREBRO")
      const hubX = 0
      const hubY = 0
      const totalNotas = estado?.cofre?.nos?.length ?? 37

      // Raio pontilhado ligando o Hub Central às Ilhas
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 5])
      DEPARTAMENTOS_CONFIG.forEach((dept) => {
        ctx.strokeStyle = dept.cor
        ctx.beginPath()
        ctx.moveTo(hubX, hubY)
        ctx.lineTo(dept.gx, dept.gy)
        ctx.stroke()
      })
      ctx.setLineDash([])

      // Desenho do Nó Hub Central
      ctx.save()
      ctx.translate(hubX, hubY)

      // Sombra do Hub
      ctx.fillStyle = 'rgba(44, 40, 37, 0.12)'
      ctx.beginPath()
      ctx.ellipse(0, 15, 75, 30, 0, 0, Math.PI * 2)
      ctx.fill()

      // Plataforma Isométrica do Hub Central (#fdfaf3)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#d97706'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, 70, 26, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Rótulo do Hub
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#92400e'
      ctx.textAlign = 'center'
      ctx.fillText(`● O CÉREBRO  ${totalNotas} NOTAS`, 0, -2)

      ctx.font = '9px sans-serif'
      ctx.fillStyle = '#78350f'
      ctx.fillText('BASE DE CONHECIMENTO', 0, 10)

      ctx.restore()

      // 2. DESENHO DAS ILHAS / PLATAFORMAS POR DEPARTAMENTO
      DEPARTAMENTOS_CONFIG.forEach((dept) => {
        const ags = agentesPorSquad.get(dept.id) ?? []
        const metric = metricasSquad.get(dept.id) ?? { m1: '—', m2: '—', doing: 0 }

        ctx.save()
        ctx.translate(dept.gx, dept.gy)

        // Sombra da Plataforma
        ctx.fillStyle = 'rgba(44, 40, 37, 0.10)'
        ctx.beginPath()
        ctx.ellipse(0, 25, dept.largura / 1.8, dept.altura / 2.2, 0, 0, Math.PI * 2)
        ctx.fill()

        // Corpo 3D da Plataforma (Base & Topo)
        const pw = dept.largura / 2
        const ph = dept.altura / 2

        // Paredes laterais da plataforma
        ctx.fillStyle = '#e6dbc9'
        ctx.beginPath()
        ctx.moveTo(-pw, 0)
        ctx.lineTo(0, ph)
        ctx.lineTo(pw, 0)
        ctx.lineTo(pw, 12)
        ctx.lineTo(0, ph + 12)
        ctx.lineTo(-pw, 12)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#d9ccb6'
        ctx.stroke()

        // Piso Superior Isométrico (#fdfaf3)
        ctx.fillStyle = '#fdfaf3'
        ctx.beginPath()
        ctx.moveTo(0, -ph)
        ctx.lineTo(pw, 0)
        ctx.lineTo(0, ph)
        ctx.lineTo(-pw, 0)
        ctx.closePath()
        ctx.fill()

        // Borda Colorida do Piso
        ctx.strokeStyle = dept.cor
        ctx.lineWidth = 2
        ctx.stroke()

        // Textura do Grid do Piso
        ctx.strokeStyle = '#f3e8d7'
        ctx.lineWidth = 1
        for (let i = -pw + 20; i < pw; i += 30) {
          ctx.beginPath()
          ctx.moveTo(i, -ph / 2)
          ctx.lineTo(i + 20, ph / 2)
          ctx.stroke()
        }

        // DESENHO DOS AGENTES / MESAS DENTRO DA PLATAFORMA
        const maxDisplay = Math.min(ags.length, 6)
        ags.slice(0, maxDisplay).forEach((ag, idx) => {
          const col = idx % 3
          const row = Math.floor(idx / 3)
          const ax = -pw + 35 + col * 55
          const ay = -ph + 35 + row * 45

          const selecionado = foco === ag.id
          const ehAtivo = ativos.has(ag.id)

          // Cor do Dono / Identidade
          const donoCor = ag.id === 'luana' ? '#84cc16' : ag.id === 'renato' ? '#c2410c' : ag.id === 'bia' ? '#8b5cf6' : ag.cor || dept.cor

          ctx.save()
          ctx.translate(ax, ay)

          // Mesa + Computador Simplificado
          ctx.fillStyle = '#e2e8f0'
          ctx.fillRect(-12, -4, 24, 12)
          ctx.strokeStyle = '#cbd5e1'
          ctx.strokeRect(-12, -4, 24, 12)

          // Monitor
          ctx.fillStyle = '#334155'
          ctx.fillRect(-6, -12, 12, 8)
          ctx.fillStyle = ehAtivo ? '#38bdf8' : '#94a3b8'
          ctx.fillRect(-5, -11, 10, 6)

          // Bonequinho / Figura 2D-3D
          ctx.fillStyle = donoCor
          ctx.beginPath()
          ctx.arc(0, 4, 5, 0, Math.PI * 2)
          ctx.fill()

          // Etiqueta com Nome do Agente
          ctx.fillStyle = selecionado ? '#ffffff' : '#f8fafc'
          ctx.strokeStyle = selecionado ? '#c2410c' : donoCor
          ctx.lineWidth = selecionado ? 1.5 : 1
          ctx.fillRect(-22, -24, 44, 12)
          ctx.strokeRect(-22, -24, 44, 12)

          ctx.font = 'bold 8px sans-serif'
          ctx.fillStyle = '#1e293b'
          ctx.textAlign = 'center'
          ctx.fillText(ag.nome.slice(0, 8), 0, -15)

          ctx.restore()
        })

        // CARTÃO FLUTUANTE DO DEPARTAMENTO (Top-Left da Plataforma)
        const cardX = -pw - 10
        const cardY = -ph - 65

        // Sombra do Cartão
        ctx.fillStyle = 'rgba(44, 40, 37, 0.10)'
        ctx.fillRect(cardX + 3, cardY + 3, 140, 64)

        // Fundo do Cartão Flutuante (#ffffff)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(cardX, cardY, 140, 64)

        // Borda + Cor do Departamento
        ctx.strokeStyle = dept.cor
        ctx.lineWidth = 1.5
        ctx.strokeRect(cardX, cardY, 140, 64)

        // Top Header Card: Dot + Nome
        ctx.fillStyle = dept.cor
        ctx.beginPath()
        ctx.arc(cardX + 10, cardY + 11, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = 'bold 9px sans-serif'
        ctx.fillStyle = '#334155'
        ctx.textAlign = 'left'
        ctx.fillText(dept.nome.toUpperCase(), cardX + 18, cardY + 14)

        // Agentes Contagem Grande
        ctx.font = 'bold 16px sans-serif'
        ctx.fillStyle = '#0f172a'
        ctx.fillText(`${ags.length}`, cardX + 10, cardY + 34)

        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = '#64748b'
        ctx.fillText('AGENTS', cardX + 26, cardY + 34)

        // Duas Linhas de Métrica
        ctx.font = '8px sans-serif'
        ctx.fillStyle = '#475569'
        ctx.fillText(metric.m1, cardX + 70, cardY + 26)
        ctx.fillText(metric.m2, cardX + 70, cardY + 36)

        // Rodapé Card: DOING / NEXT / DONE
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(cardX, cardY + 46, 140, 18)
        ctx.strokeStyle = '#e2e8f0'
        ctx.strokeRect(cardX, cardY + 46, 140, 18)

        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = '#1e293b'
        ctx.fillText(`DOING ${metric.doing}   NEXT —   DONE —`, cardX + 10, cardY + 58)

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
  }, [agentesPorSquad, ativos, estado, foco, metricasSquad, pan, reduzirMovimento, zoom])

  const selecionarNoCanvas = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const larguraCss = rect.width
    const alturaCss = rect.height

    const mundoX = (evento.clientX - rect.left - larguraCss / 2 - pan.x) / zoom
    const mundoY = (evento.clientY - rect.top - alturaCss / 2 - pan.y) / zoom

    // Verificar se clicou perto de algum departamento
    const clicado = DEPARTAMENTOS_CONFIG.find(
      (dept) => Math.abs(dept.gx - mundoX) < dept.largura / 2 && Math.abs(dept.gy - mundoY) < dept.altura / 2
    )

    if (clicado) {
      const ags = agentesPorSquad.get(clicado.id) ?? []
      if (ags.length > 0) {
        setFoco(ags[0].id)
        aoSelecionarAgente?.(ags[0].id)
      }
    } else {
      setFoco(null)
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

  const resetView = () => {
    setPan({ x: 0, y: 0 })
    setZoom(0.75)
  }

  // Filtragem de Tarefas para o Painel Lateral
  const tarefasFiltradas = useMemo(() => {
    return tarefas.filter((t) => {
      if (filtroStatus === 'ALL') return true
      if (filtroStatus === 'BACKLOG') return t.estado === 'aguardando'
      if (filtroStatus === 'IN PROGRESS') return t.estado === 'em_andamento'
      if (filtroStatus === 'WAITING') return t.estado === 'aguardando'
      if (filtroStatus === 'DONE') return t.estado === 'feito'
      return true
    })
  }, [filtroStatus, tarefas])

  return (
    <div className="flex flex-col gap-4 font-sans text-tinta">
      {/* BARRA SUPERIOR (TOP BAR) */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linha bg-[#fdfaf3] px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xs tracking-wider text-tinta uppercase">
            AGENTS OFFICE <span className="text-tinta-2 font-normal">v3</span>
          </span>
          <span className="hidden text-tinta-2 text-xs sm:inline">·</span>
          <div className="flex items-center gap-1.5 text-xs text-tinta-2">
            <span className="size-2 rounded-full bg-verde animate-pulse" />
            <span className="font-medium">CONNECTED TO</span>
            <div className="flex items-center gap-1">
              <span className="rounded bg-[#0284c7]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0284c7]">Meta</span>
              <span className="rounded bg-[#16a34a]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#16a34a]">OpenAI</span>
              <span className="rounded bg-[#d97706]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#d97706]">Claude</span>
              <span className="rounded bg-[#8b5cf6]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8b5cf6]">Composio</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-tinta-2">
            <span className="size-2 rounded-full bg-verde" />
            <span className="font-medium">RUNS HEADLESS ON</span>
            <span className="rounded bg-[#f59e0b]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#b45309]">
              PAINEL OS
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-tinta">
            {horaLocal || '05:44:10 pm'}
          </span>
        </div>
      </header>

      {/* ÁREA PRINCIPAL: CANVAS ISOMÉTRICO (ESQUERDA) + PAINEL LATERAL DIREITO */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* CANVAS INTERATIVO 2.5D (ESQUERDA - 8 colunas) */}
        <div
          ref={containerRef}
          tabIndex={0}
          role="region"
          aria-label="Escritório virtual dos agentes em 2.5D"
          className="relative min-h-[480px] w-full overflow-hidden rounded-xl border border-linha bg-[#f7f1e6] shadow-sm lg:col-span-8 lg:min-h-[580px]"
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

          {/* LEGENDAS DE INSTRUÇÃO NO CANTO INFERIOR ESQUERDO */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-linha bg-[#fdfaf3]/90 px-3 py-1.5 text-[10px] text-tinta-2 shadow-sm backdrop-blur-sm">
            Arraste para mover · Roda do mouse para Zoom · Clique nas plataformas
          </div>

          {/* CONTROLES DE CANVAS (CANTO INFERIOR DIREITO: +, -, RESET) */}
          <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border border-linha bg-[#fdfaf3] p-1 shadow-md">
            <button
              type="button"
              onClick={() => setZoom((v) => arredondarZoom(v + 0.15))}
              className="flex size-7 items-center justify-center rounded border border-linha bg-fundo text-xs font-bold text-tinta hover:bg-white active:scale-95"
              title="Aumentar Zoom"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom((v) => arredondarZoom(v - 0.15))}
              className="flex size-7 items-center justify-center rounded border border-linha bg-fundo text-xs font-bold text-tinta hover:bg-white active:scale-95"
              title="Diminuir Zoom"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetView}
              className="flex size-7 items-center justify-center rounded border border-linha bg-fundo text-[12px] font-bold text-tinta hover:bg-white active:scale-95"
              title="Resetar Visão"
            >
              ⌂
            </button>
          </div>
        </div>

        {/* PAINEL LATERAL DIREITO (STATUS DE TAREFAS & BARRA DE BUSCA - 4 colunas) */}
        <aside className="flex flex-col gap-3 rounded-xl border border-linha bg-[#fdfaf3] p-4 shadow-sm lg:col-span-4">
          {/* BARRA DE TAREFAS (TASK SEARCH / INPUT BAR) */}
          <form onSubmit={adicionarTarefa} className="flex flex-col gap-2">
            <div className="flex items-center rounded-lg border border-linha bg-white p-1 shadow-sm">
              <select
                value={departamentoTarefa}
                onChange={(e) => setDepartamentoTarefa(e.target.value)}
                className="cursor-pointer bg-transparent px-2 text-xs font-bold text-tinta focus:outline-none"
              >
                <option value="luana">● LUANA</option>
                <option value="conteúdo">● CONTEÚDO</option>
                <option value="comercial">● COMERCIAL</option>
                <option value="bots">● BOTS</option>
                <option value="tráfego">● TRÁFEGO</option>
                <option value="globais">● GLOBAIS</option>
              </select>
              <input
                type="text"
                value={textoNovaTarefa}
                onChange={(e) => setTextoNovaTarefa(e.target.value)}
                placeholder={`Type a task for ${departamentoTarefa}...`}
                className="w-full min-w-0 bg-transparent px-2 text-xs text-tinta placeholder:text-tinta-2 focus:outline-none"
              />
              <button
                type="submit"
                disabled={enviandoTarefa || !textoNovaTarefa.trim()}
                className="rounded-md bg-black px-3 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {enviandoTarefa ? '...' : 'ADD'}
              </button>
            </div>
          </form>

          {/* CARTÃO DE DESTAQUE DO HUB CENTRAL (THE BRAIN) */}
          <div className="rounded-lg border border-ambar/30 bg-ambar/10 p-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-tinta-forte">
                THE BRAIN <span className="font-normal text-tinta-2">{estado?.cofre?.nos?.length ?? 37} NOTES</span>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-tinta-2">
              Last read icp by CLIENT EMAILS · 5:44 pm
            </p>
            <a
              href="#cofre"
              className="mt-2 inline-block font-bold text-xs text-ambar hover:underline"
            >
              Open the Brain →
            </a>
          </div>

          {/* TASK STATUS SELECTION & PILL FILTERS */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs tracking-wider text-tinta uppercase">
                  TASK STATUS
                </span>
                <span className="rounded bg-linha px-1.5 py-0.5 font-mono text-[9px] font-bold text-tinta-2">
                  DEMO
                </span>
              </div>
              <span className="text-[11px] font-bold text-tinta-2">WHOLE OFFICE</span>
            </div>

            {/* FILTROS EM PÍLULA */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFiltroStatus('ALL')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'ALL' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                ALL {tarefas.length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('BACKLOG')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'BACKLOG' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                BACKLOG {tarefas.filter((t) => t.estado === 'aguardando').length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('IN PROGRESS')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'IN PROGRESS' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                IN PROGRESS {tarefas.filter((t) => t.estado === 'em_andamento').length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('WAITING')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'WAITING' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                WAITING 0
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('DONE')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'DONE' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                DONE {tarefas.filter((t) => t.estado === 'feito').length}
              </button>
            </div>
          </div>

          {/* LISTA VERTICAL DE TAREFAS */}
          <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
            {tarefasFiltradas.length === 0 ? (
              <div className="p-4 text-center text-xs text-tinta-2">
                Nenhuma tarefa encontrada neste filtro.
              </div>
            ) : (
              tarefasFiltradas.map((item) => {
                const pct = item.progresso ?? 15
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-linha bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-linha bg-fundo px-1.5 py-0.5 font-mono text-[10px] font-bold text-tinta">
                          {pct}%
                        </span>
                        <span className="font-semibold text-xs text-tinta leading-snug">
                          {item.texto}
                        </span>
                      </div>
                      <span className="whitespace-nowrap font-mono text-[10px] text-tinta-3">
                        just now
                      </span>
                    </div>

                    {/* Barra de Progresso Fina */}
                    <div className="h-1 w-full overflow-hidden rounded-full bg-linha">
                      <div
                        className="h-full bg-black transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-medium text-tinta-2 uppercase">
                      <span>TAREFA · {item.departamento}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
