import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgenteVivo, Estado } from '../dados/tipos'
import {
  chaveAgente,
  formatarRotulo,
  mesclarRuntimesNoCatalogo,
  normalizarDonoId,
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

type FiltroStatus = 'Todas' | 'Na fila' | 'Fazendo' | 'Esperando' | 'Feitas'

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

function desenharMesaEAgente(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  ag: PixelAgent,
  estadoAgente: 'TRABALHANDO' | 'OCIOSO' | 'PARADO',
  selecionado: boolean,
  tick: number,
  reduzirMovimento: boolean
) {
  ctx.save()
  ctx.translate(ax, ay)

  const corSetor = ag.cor || '#84cc16'
  const ehTrabalhando = estadoAgente === 'TRABALHANDO'
  const ehParado = estadoAgente === 'PARADO'

  // 1. Sombra da mesa no piso
  ctx.fillStyle = 'rgba(40, 30, 20, 0.12)'
  ctx.beginPath()
  ctx.ellipse(0, 8, 20, 9, 0, 0, Math.PI * 2)
  ctx.fill()

  // 2. Tampo da Mesa Isométrica
  ctx.fillStyle = '#e8dec9'
  ctx.strokeStyle = '#c5b89f'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(16, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(-16, -6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Espessura da mesa
  ctx.fillStyle = '#d4c5a9'
  ctx.beginPath()
  ctx.moveTo(-16, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(0, 5)
  ctx.lineTo(-16, -3)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(0, 2)
  ctx.lineTo(16, -6)
  ctx.lineTo(16, -3)
  ctx.lineTo(0, 5)
  ctx.closePath()
  ctx.fill()

  // Pés da mesa
  ctx.strokeStyle = '#8c7e66'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-14, -4)
  ctx.lineTo(-14, 7)
  ctx.moveTo(14, -4)
  ctx.lineTo(14, 7)
  ctx.stroke()

  // 3. Monitor no Tampo (virado para a frente da mesa, costas para o espectador)
  ctx.fillStyle = '#475569'
  ctx.fillRect(-3, -9, 6, 2)
  ctx.fillRect(-1, -12, 2, 3)

  // Carcaça do Monitor
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(-9, -20, 18, 9)

  // Tela do Monitor
  if (ehTrabalhando) {
    const pulso = !reduzirMovimento ? Math.sin(tick * 0.15) * 0.15 : 0
    ctx.fillStyle = corSetor
    ctx.fillRect(-8, -19, 16, 7)
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + pulso})`
    ctx.fillRect(-6, -18, 12, 2)
  } else if (!ehParado) {
    ctx.fillStyle = '#334155'
    ctx.fillRect(-8, -19, 16, 7)
  } else {
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(-8, -19, 16, 7)
  }

  // Teclado
  ctx.fillStyle = '#cbd5e1'
  ctx.fillRect(-5, -4, 10, 3)

  // 4. Cadeira de Escritório
  const chairY = 7
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-5, chairY + 5)
  ctx.lineTo(5, chairY + 5)
  ctx.moveTo(0, chairY + 2)
  ctx.lineTo(0, chairY + 5)
  ctx.stroke()

  ctx.fillStyle = '#334155'
  ctx.beginPath()
  ctx.ellipse(0, chairY + 2, 7, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Encosto da cadeira
  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.rect(-6, chairY - 5, 12, 7)
  ctx.fill()

  // 5. Pessoa de Costas (Cabeça, Ombros e Braços no teclado)
  if (!ehParado) {
    const animY = ehTrabalhando && !reduzirMovimento ? Math.sin(tick * 0.25) * 0.7 : 0

    // Camisa / Torso
    ctx.fillStyle = corSetor
    ctx.beginPath()
    ctx.rect(-7, chairY - 6 + animY, 14, 9)
    ctx.fill()

    // Braços estendidos até o teclado
    ctx.strokeStyle = corSetor
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-5, chairY - 2 + animY)
    ctx.lineTo(-4, -2)
    ctx.moveTo(5, chairY - 2 + animY)
    ctx.lineTo(4, -2)
    ctx.stroke()

    // Cabeça / Cabelo visto de trás
    ctx.fillStyle = '#334155'
    ctx.beginPath()
    ctx.arc(0, chairY - 10 + animY, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 6. Etiqueta com Nome do Agente
  const tagY = -32
  const nomeExibicao = ag.nome.slice(0, 10)
  ctx.font = 'bold 9px sans-serif'
  const larguraTexto = ctx.measureText(nomeExibicao).width
  const tagW = Math.max(34, larguraTexto + 10)
  const tagH = 13

  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = selecionado ? '#c2410c' : ehTrabalhando ? corSetor : '#94a3b8'
  ctx.lineWidth = selecionado ? 2 : 1
  ctx.fillRect(-tagW / 2, tagY, tagW, tagH)
  ctx.strokeRect(-tagW / 2, tagY, tagW, tagH)

  if (ehTrabalhando) {
    ctx.fillStyle = corSetor
    ctx.beginPath()
    ctx.arc(-tagW / 2 + 5, tagY + tagH / 2, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'center'
  ctx.fillText(nomeExibicao, ehTrabalhando ? 2 : 0, tagY + 9)

  ctx.restore()
}

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
  const [horaLocal, setHoraLocal] = useState<string>(() => {
    return new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  })

  // Estado da Barra de Tarefas & Painel Lateral
  const [departamentoTarefa, setDepartamentoTarefa] = useState<string>('luana')
  const [textoNovaTarefa, setTextoNovaTarefa] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('Todas')
  const [enviandoTarefa, setEnviandoTarefa] = useState<boolean>(false)
  const [tarefas, setTarefas] = useState<TarefaItem[]>([])

  // Relógio com hora real em tempo real
  useEffect(() => {
    const atualizarHora = () => {
      const agora = new Date()
      setHoraLocal(
        agora.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
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
          setTarefas((prev) => [resData.tarefa, ...prev])
        }
      } else {
        const localItem: TarefaItem = {
          id: `tar_local_${Date.now()}`,
          texto,
          departamento: dept,
          estado: 'aguardando',
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
        criado_em: new Date().toISOString(),
      }
      setTarefas((prev) => [localItem, ...prev])
    } finally {
      setTextoNovaTarefa('')
      setEnviandoTarefa(false)
    }
  }

  const catalogoVisual = useMemo(() => mesclarRuntimesNoCatalogo(catalogo, agentes), [agentes, catalogo])

  const { ativos, diretoresEstado } = useMemo(() => {
    const conjuntoAtivos = new Set<string>()
    const diretoresTrabalhando = new Set<string>()
    const diretoresVivos = new Set<string>()

    for (const ag of agentes) {
      const itemCat = resolverAgenteNoCatalogo(ag, catalogoVisual)
      const catId = itemCat?.id ?? ag.id
      const donoNorm = normalizarDonoId(ag.dono)

      if (ag.estado === 'trabalhando') {
        conjuntoAtivos.add(catId)
        if (donoNorm) diretoresTrabalhando.add(donoNorm)
        if (catId === 'luana' || catId === 'renato' || catId === 'bia') {
          diretoresTrabalhando.add(catId)
        }
      }
      if (ag.estado === 'trabalhando' || ag.estado === 'silencioso') {
        if (donoNorm) diretoresVivos.add(donoNorm)
        if (catId === 'luana' || catId === 'renato' || catId === 'bia') {
          diretoresVivos.add(catId)
        }
      }
    }

    diretoresTrabalhando.forEach((dirId) => conjuntoAtivos.add(dirId))

    const mapaEstado = new Map<string, 'TRABALHANDO' | 'OCIOSO' | 'PARADO'>()
    ;['luana', 'renato', 'bia'].forEach((dirId) => {
      if (diretoresTrabalhando.has(dirId)) {
        mapaEstado.set(dirId, 'TRABALHANDO')
      } else if (diretoresVivos.has(dirId)) {
        mapaEstado.set(dirId, 'OCIOSO')
      } else {
        mapaEstado.set(dirId, 'PARADO')
      }
    })

    return { ativos: conjuntoAtivos, diretoresEstado: mapaEstado }
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

  // Métricas do Estado por Squad (sem dados inventados)
  const metricasSquad = useMemo(() => {
    const res = new Map<PixelAgentSquad, { m1: string; m2: string; doing: number }>()

    DEPARTAMENTOS_CONFIG.forEach((dept) => {
      const ags = agentesPorSquad.get(dept.id) ?? []
      const doingCount = ags.filter((a) => ativos.has(a.id)).length

      let m1 = 'sem dado'
      let m2 = 'sem dado'

      if (dept.id === 'conteúdo') {
        const pecasTotal = estado?.pecas?.total != null ? `${estado.pecas.total}` : 'sem dado'
        const postado = estado?.pecas?.analitica?.por_status?.postado != null ? `${estado.pecas.analitica.por_status.postado}` : 'sem dado'
        m1 = `PEÇAS TOTAL ${pecasTotal}`
        m2 = `POSTADO ${postado}`
      } else if (dept.id === 'comercial') {
        const passa = estado?.comercial?.total_passa != null ? `${estado.comercial.total_passa}` : 'sem dado'
        const bloqueia = estado?.comercial?.total_bloqueia != null ? `${estado.comercial.total_bloqueia}` : 'sem dado'
        m1 = `PASSA ${passa}`
        m2 = `BLOQUEIA ${bloqueia}`
      } else if (dept.id === 'coordenação') {
        const totAprov = estado?.aprovacoes?.total != null ? `${estado.aprovacoes.total}` : 'sem dado'
        const totalCron = estado?.cron?.total != null ? `${estado.cron.total}` : 'sem dado'
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
      const nosCount = estado?.cofre?.nos?.length
      const textoHubNotas = nosCount != null ? `${nosCount} NOTAS` : 'sem dado'

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

      // Plataforma Isométrica do Hub Central
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
      ctx.fillText(`● O CÉREBRO  ${textoHubNotas}`, 0, -2)

      ctx.font = '9px sans-serif'
      ctx.fillStyle = '#78350f'
      ctx.fillText('BASE DE CONHECIMENTO', 0, 10)

      ctx.restore()

      // 2. DESENHO DAS ILHAS / PLATAFORMAS POR DEPARTAMENTO
      DEPARTAMENTOS_CONFIG.forEach((dept) => {
        const ags = agentesPorSquad.get(dept.id) ?? []
        const metric = metricasSquad.get(dept.id) ?? { m1: 'sem dado', m2: 'sem dado', doing: 0 }

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

        // DESENHO DOS AGENTES (BONECOS DE COSTAS EM CADAIRAS E MESAS)
        const maxDisplay = Math.min(ags.length, 6)
        ags.slice(0, maxDisplay).forEach((ag, idx) => {
          const col = idx % 3
          const row = Math.floor(idx / 3)
          const ax = -pw + 35 + col * 55
          const ay = -ph + 35 + row * 45

          const selecionado = foco === ag.id

          const estadoAgente: 'TRABALHANDO' | 'OCIOSO' | 'PARADO' =
            ag.id === 'luana' || ag.id === 'renato' || ag.id === 'bia'
              ? diretoresEstado.get(ag.id) ?? 'PARADO'
              : ativos.has(ag.id)
                ? 'TRABALHANDO'
                : 'OCIOSO'

          desenharMesaEAgente(ctx, ax, ay, ag, estadoAgente, selecionado, tick, reduzirMovimento)
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
        ctx.fillText('agentes', cardX + 26, cardY + 34)

        // Duas Linhas de Métrica
        ctx.font = '8px sans-serif'
        ctx.fillStyle = '#475569'
        ctx.fillText(metric.m1, cardX + 70, cardY + 26)
        ctx.fillText(metric.m2, cardX + 70, cardY + 36)

        // Rodapé Card: FAZENDO / PRÓXIMA / CONCLUÍDA
        ctx.fillStyle = '#f8fafc'
        ctx.fillRect(cardX, cardY + 46, 140, 18)
        ctx.strokeStyle = '#e2e8f0'
        ctx.strokeRect(cardX, cardY + 46, 140, 18)

        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = '#1e293b'
        ctx.fillText(`FAZENDO ${metric.doing} · PRÓXIMA 0 · FEITAS 0`, cardX + 8, cardY + 58)

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
  }, [agentesPorSquad, ativos, diretoresEstado, estado, foco, metricasSquad, pan, reduzirMovimento, zoom])

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
      if (filtroStatus === 'Todas') return true
      if (filtroStatus === 'Na fila') return t.estado === 'aguardando'
      if (filtroStatus === 'Fazendo') return t.estado === 'em_andamento'
      if (filtroStatus === 'Esperando') return t.estado === 'aguardando'
      if (filtroStatus === 'Feitas') return t.estado === 'feito'
      return true
    })
  }, [filtroStatus, tarefas])

  const nomeDiretorPorDept = (dept: string) => {
    const d = dept.toLowerCase()
    if (d === 'luana' || d === 'coordenação' || d === 'coordenacao') return 'a Luana'
    if (d === 'renato' || d === 'bots') return 'o Renato'
    if (d === 'bia' || d === 'tráfego' || d === 'trafego') return 'a Bia'
    if (d === 'conteúdo' || d === 'conteudo') return 'o conteúdo'
    if (d === 'comercial') return 'o comercial'
    return 'a Luana'
  }

  const nosCountRight = estado?.cofre?.nos?.length
  const textoBrainNotasRight = nosCountRight != null ? `${nosCountRight} NOTAS` : 'sem dado'

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
            <span className="font-medium">Conectado a</span>
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
            <span className="font-medium">Roda em</span>
            <span className="rounded bg-[#f59e0b]/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#b45309]">
              PAINEL OS
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-tinta">
            {horaLocal}
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
                placeholder={`Digite uma tarefa para ${departamentoTarefa}...`}
                className="w-full min-w-0 bg-transparent px-2 text-xs text-tinta placeholder:text-tinta-2 focus:outline-none"
              />
              <button
                type="submit"
                disabled={enviandoTarefa || !textoNovaTarefa.trim()}
                className="rounded-md bg-black px-3 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {enviandoTarefa ? '...' : 'Enviar'}
              </button>
            </div>
          </form>

          {/* CARTÃO DE DESTAQUE DO HUB CENTRAL (O CÉRABRO) */}
          <div className="rounded-lg border border-ambar/30 bg-ambar/10 p-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-tinta-forte">
                O CÉREBRO <span className="font-normal text-tinta-2">{textoBrainNotasRight}</span>
              </span>
            </div>
            <a
              href="#cofre"
              className="mt-2 inline-block font-bold text-xs text-ambar hover:underline"
            >
              Abrir o Cérebro →
            </a>
          </div>

          {/* TASK STATUS SELECTION & PILL FILTERS */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs tracking-wider text-tinta uppercase">
                  Tarefas
                </span>
              </div>
              <span className="text-[11px] font-bold text-tinta-2">Todo o escritório</span>
            </div>

            {/* FILTROS EM PÍLULA */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFiltroStatus('Todas')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Todas' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                Todas {tarefas.length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Na fila')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Na fila' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                Na fila {tarefas.filter((t) => t.estado === 'aguardando').length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Fazendo')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Fazendo' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                Fazendo {tarefas.filter((t) => t.estado === 'em_andamento').length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Esperando')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Esperando' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                Esperando 0
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Feitas')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Feitas' ? 'bg-black text-white' : 'bg-linha text-tinta-2 hover:bg-black/10'
                }`}
              >
                Feitas {tarefas.filter((t) => t.estado === 'feito').length}
              </button>
            </div>
          </div>

          {/* LISTA VERTICAL DE TAREFAS */}
          <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
            {tarefasFiltradas.length === 0 ? (
              <div className="p-4 text-center text-xs text-tinta-2">
                Nenhuma tarefa na fila ainda
              </div>
            ) : (
              tarefasFiltradas.map((item) => {
                const alvo = nomeDiretorPorDept(item.departamento)
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-linha bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#f59e0b]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#b45309]">
                          NA FILA
                        </span>
                        <span className="font-semibold text-xs text-tinta leading-snug">
                          {item.texto}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-medium text-tinta-2">
                      <span>aguardando {alvo}</span>
                      <span className="uppercase">TAREFA · {item.departamento}</span>
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
