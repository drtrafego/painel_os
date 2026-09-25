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
  { id: 'coordenação', nome: 'COORDENAÇÃO', cor: '#84cc16', gx: -280, gy: -180, largura: 230, altura: 150 },
  { id: 'bots', nome: 'RENATO / BOTS', cor: '#c2410c', gx: 180, gy: -220, largura: 230, altura: 150 },
  { id: 'tráfego', nome: 'BIA / TRÁFEGO', cor: '#8b5cf6', gx: 280, gy: 20, largura: 230, altura: 150 },
  { id: 'conteúdo', nome: 'SQUAD CONTEÚDO', cor: '#d97706', gx: -320, gy: 40, largura: 250, altura: 165 },
  { id: 'comercial', nome: 'SQUAD COMERCIAL', cor: '#16a34a', gx: 140, gy: 220, largura: 250, altura: 165 },
  { id: 'globais', nome: 'GLOBAIS', cor: '#06b6d4', gx: -120, gy: 240, largura: 230, altura: 150 },
]

function desenharMesaEAgente(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  ag: PixelAgent,
  estadoAgente: 'TRABALHANDO' | 'OCIOSO' | 'PARADO',
  selecionado: boolean,
  tick: number,
  reduzirMovimento: boolean,
  dimmed: boolean = false
) {
  ctx.save()
  ctx.translate(ax, ay)

  if (dimmed) {
    ctx.globalAlpha = 0.25
  }

  const corSetor = ag.cor || '#38bdf8'
  const ehTrabalhando = estadoAgente === 'TRABALHANDO'
  const ehParado = estadoAgente === 'PARADO'

  // 0. AURA NEON NO CHÃO PARA AGENTES ATIVOS (TRABALHANDO)
  if (ehTrabalhando && !dimmed) {
    const auraPulso = !reduzirMovimento ? 14 + Math.sin(tick * 0.12) * 6 : 14
    ctx.save()
    ctx.shadowColor = corSetor
    ctx.shadowBlur = auraPulso
    ctx.strokeStyle = corSetor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 8, 26, 13, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // 1. Sombra da mesa no piso escuro
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.beginPath()
  ctx.ellipse(0, 8, 22, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  // 2. Tampo da Mesa Isométrica (Metal Slate HUD)
  ctx.fillStyle = '#1e293b'
  ctx.strokeStyle = selecionado ? '#f59e0b' : '#334155'
  ctx.lineWidth = selecionado ? 1.5 : 1
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(17, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(-17, -6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Espessura da mesa
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(-17, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(0, 5)
  ctx.lineTo(-17, -3)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(0, 2)
  ctx.lineTo(17, -6)
  ctx.lineTo(17, -3)
  ctx.lineTo(0, 5)
  ctx.closePath()
  ctx.fill()

  // Pés da mesa
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-15, -4)
  ctx.lineTo(-15, 7)
  ctx.moveTo(15, -4)
  ctx.lineTo(15, 7)
  ctx.stroke()

  // 3. Monitor no Tampo (Visto de trás)
  ctx.fillStyle = '#334155'
  ctx.fillRect(-3, -9, 6, 2)
  ctx.fillRect(-1, -12, 2, 3)

  // Carcaça do Monitor
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(-10, -21, 20, 10)

  // Tela do Monitor Neon Cyberpunk
  if (ehTrabalhando) {
    const pulso = !reduzirMovimento ? Math.sin(tick * 0.15) * 0.2 : 0
    ctx.shadowColor = corSetor
    ctx.shadowBlur = 10
    ctx.fillStyle = corSetor
    ctx.fillRect(-9, -20, 18, 8)

    ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + pulso})`
    ctx.fillRect(-7, -19, 14, 2.5)
    ctx.shadowBlur = 0
  } else if (!ehParado) {
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(-9, -20, 18, 8)
  } else {
    ctx.fillStyle = '#020617'
    ctx.fillRect(-9, -20, 18, 8)
  }

  // Partículas de faíscas neon subindo do monitor se estiver TRABALHANDO
  if (ehTrabalhando && !reduzirMovimento && !dimmed) {
    ctx.save()
    for (let i = 0; i < 3; i++) {
      const pOffset = (tick * 1.5 + i * 18) % 25
      const px = Math.sin(tick * 0.1 + i * 2) * 6
      const py = -22 - pOffset
      const alpha = 1 - pOffset / 25
      ctx.fillStyle = corSetor
      ctx.globalAlpha = alpha * (dimmed ? 0.25 : 1)
      ctx.beginPath()
      ctx.arc(px, py, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // Teclado Neon
  ctx.fillStyle = ehTrabalhando ? corSetor : '#475569'
  ctx.fillRect(-6, -4, 12, 3)

  // 4. Cadeira de Escritório
  const chairY = 7
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-5, chairY + 5)
  ctx.lineTo(5, chairY + 5)
  ctx.moveTo(0, chairY + 2)
  ctx.lineTo(0, chairY + 5)
  ctx.stroke()

  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.ellipse(0, chairY + 2, 7, 3.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Encosto da cadeira
  ctx.fillStyle = '#0f172a'
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

    // Braços no teclado
    ctx.strokeStyle = corSetor
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-5, chairY - 2 + animY)
    ctx.lineTo(-4, -2)
    ctx.moveTo(5, chairY - 2 + animY)
    ctx.lineTo(4, -2)
    ctx.stroke()

    // Cabeça
    ctx.fillStyle = '#334155'
    ctx.beginPath()
    ctx.arc(0, chairY - 10 + animY, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 6. Etiqueta Glassmorphism HUD com Nome do Agente
  const tagY = -34
  const nomeExibicao = ag.nome.slice(0, 10)
  ctx.font = 'bold 9px sans-serif'
  const larguraTexto = ctx.measureText(nomeExibicao).width
  const tagW = Math.max(36, larguraTexto + 10)
  const tagH = 14

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
  ctx.strokeStyle = selecionado ? '#f59e0b' : ehTrabalhando ? corSetor : '#334155'
  ctx.lineWidth = selecionado ? 2 : 1
  ctx.fillRect(-tagW / 2, tagY, tagW, tagH)
  ctx.strokeRect(-tagW / 2, tagY, tagW, tagH)

  if (ehTrabalhando) {
    ctx.fillStyle = corSetor
    ctx.beginPath()
    ctx.arc(-tagW / 2 + 5, tagY + tagH / 2, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'center'
  ctx.fillText(nomeExibicao, ehTrabalhando ? 2 : 0, tagY + 10)

  // 7. BADGE FLUTUANTE ⚡ ATIVO PARA AGENTES TRABALHANDO
  if (ehTrabalhando && !dimmed) {
    const badgeY = tagY - 13
    const badgePulso = !reduzirMovimento ? Math.sin(tick * 0.2) * 1.5 : 0
    ctx.save()
    ctx.shadowColor = '#eab308'
    ctx.shadowBlur = 6
    ctx.fillStyle = '#eab308'
    ctx.fillRect(-22, badgeY + badgePulso, 44, 11)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'extrabold 8px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⚡ ATIVO', 0, badgeY + badgePulso + 8.5)
    ctx.restore()
  }

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
  const [filtroAgentes, setFiltroAgentes] = useState<'todos' | 'vivos' | 'ativos'>('todos')
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

  // Métricas do Estado por Squad
  const metricasSquad = useMemo(() => {
    const res = new Map<
      PixelAgentSquad,
      { m1: string; m2: string; doing: number; next: number; done: number; aguardando_d2?: boolean }
    >()

    DEPARTAMENTOS_CONFIG.forEach((dept) => {
      const ags = agentesPorSquad.get(dept.id) ?? []
      const doingCount = ags.filter((a) => ativos.has(a.id)).length

      let m1 = 'sem dado'
      let m2 = 'sem dado'
      let doing = doingCount
      let next = 0
      let done = 0
      let aguardando_d2 = false

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
        m1 = `HEITOR (REGENTE)`
        m2 = `VITOR (FISCAL)`
        doing = estado?.squad_bots?.fazendo ?? doingCount
        next = estado?.squad_bots?.proxima ?? 0
        done = estado?.squad_bots?.done ?? 0
      } else if (dept.id === 'tráfego') {
        m1 = `TEREZA (REGENTE)`
        m2 = `JADE (FISCAL)`
        doing = estado?.squad_trafego?.fazendo ?? doingCount
        next = estado?.squad_trafego?.proxima ?? 0
        done = estado?.squad_trafego?.done ?? 0
        aguardando_d2 = estado?.squad_trafego?.aguardando_dono_d2 === true
      }

      res.set(dept.id, { m1, m2, doing, next, done, aguardando_d2 })
    })

    return res
  }, [agentesPorSquad, ativos, estado])

  // Desenho Canvas Isometric 2.5D Cyberpunk HUD (Opção 1)
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

      // Fundo Dark Mode HUD (#070a12)
      ctx.fillStyle = '#070a12'
      ctx.fillRect(0, 0, larguraCss, alturaCss)

      // Grid Isométrico de Fundo Cyberpunk
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)'
      ctx.lineWidth = 1
      const step = 40
      for (let x = -larguraCss; x < larguraCss * 2; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + alturaCss, alturaCss)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(x, alturaCss)
        ctx.lineTo(x + alturaCss, 0)
        ctx.stroke()
      }

      ctx.save()
      ctx.translate(larguraCss / 2 + pan.x, alturaCss / 2 + pan.y)
      ctx.scale(zoom, zoom)

      // 1. HUB CENTRAL ("O CÉREBRO" NEON CORE)
      const hubX = 0
      const hubY = 0
      const nosCount = estado?.cofre?.nos?.length
      const textoHubNotas = nosCount != null ? `${nosCount} NOTAS` : 'sem dado'

      // Cabos / Raios Neon ligando o Hub Central às Ilhas
      ctx.lineWidth = 2
      DEPARTAMENTOS_CONFIG.forEach((dept) => {
        ctx.shadowColor = dept.cor
        ctx.shadowBlur = 8
        ctx.strokeStyle = dept.cor
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(hubX, hubY)
        ctx.lineTo(dept.gx, dept.gy)
        ctx.stroke()
      })
      ctx.setLineDash([])
      ctx.shadowBlur = 0

      // Desenho do Core do Hub Central (Cubo 3D Neon)
      ctx.save()
      ctx.translate(hubX, hubY)

      ctx.shadowColor = '#0284c7'
      ctx.shadowBlur = 18
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, 75, 28, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      ctx.shadowBlur = 0

      // Rótulo do Hub Central
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#38bdf8'
      ctx.textAlign = 'center'
      ctx.fillText(`● O CÉREBRO  ${textoHubNotas}`, 0, -2)

      ctx.font = '9px sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('CORE KNOWLEDGE HUD', 0, 10)

      ctx.restore()

      // 1.5. SETAS/RAIOS DE FLUXO NEON ENTRE DIRETORES E REGENTES
      ctx.save()
      ctx.lineWidth = 1.5
      ctx.setLineDash([3, 3])

      ctx.shadowColor = '#8b5cf6'
      ctx.shadowBlur = 6
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)'
      ctx.beginPath()
      ctx.moveTo(-280 + 50, -180 + 30)
      ctx.lineTo(280 - 50, 20 - 20)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(280 - 20, 20 - 25)
      ctx.lineTo(280 + 20, 20 + 15)
      ctx.stroke()

      ctx.shadowColor = '#c2410c'
      ctx.strokeStyle = 'rgba(194, 65, 12, 0.7)'
      ctx.beginPath()
      ctx.moveTo(180 - 20, -220 - 25)
      ctx.lineTo(180 + 20, -220 + 15)
      ctx.stroke()

      ctx.setLineDash([])
      ctx.shadowBlur = 0
      ctx.restore()

      // 2. DESENHO DAS ILHAS / PLATAFORMAS POR DEPARTAMENTO
      DEPARTAMENTOS_CONFIG.forEach((dept) => {
        const ags = agentesPorSquad.get(dept.id) ?? []
        const metric = metricasSquad.get(dept.id) ?? { m1: 'sem dado', m2: 'sem dado', doing: 0, next: 0, done: 0, aguardando_d2: false }

        ctx.save()
        ctx.translate(dept.gx, dept.gy)

        // Sombra da Plataforma
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.beginPath()
        ctx.ellipse(0, 25, dept.largura / 1.7, dept.altura / 2.1, 0, 0, Math.PI * 2)
        ctx.fill()

        // Corpo 3D da Plataforma (Modo Dark HUD)
        const pw = dept.largura / 2
        const ph = dept.altura / 2

        // Paredes laterais da plataforma
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.moveTo(-pw, 0)
        ctx.lineTo(0, ph)
        ctx.lineTo(pw, 0)
        ctx.lineTo(pw, 14)
        ctx.lineTo(0, ph + 14)
        ctx.lineTo(-pw, 14)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#1e293b'
        ctx.stroke()

        // Piso Superior Isométrico (#111827)
        ctx.fillStyle = '#111827'
        ctx.beginPath()
        ctx.moveTo(0, -ph)
        ctx.lineTo(pw, 0)
        ctx.lineTo(0, ph)
        ctx.lineTo(-pw, 0)
        ctx.closePath()
        ctx.fill()

        // Borda Neon da Plataforma com Glow
        ctx.shadowColor = dept.cor
        ctx.shadowBlur = 12
        ctx.strokeStyle = dept.cor
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.shadowBlur = 0

        // Grid do Piso Dark
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
        ctx.lineWidth = 1
        for (let i = -pw + 20; i < pw; i += 30) {
          ctx.beginPath()
          ctx.moveTo(i, -ph / 2)
          ctx.lineTo(i + 20, ph / 2)
          ctx.stroke()
        }

        // DESENHO DOS AGENTES (BONECOS 2.5D DE COSTAS)
        const maxDisplay = Math.min(ags.length, 6)
        ags.slice(0, maxDisplay).forEach((ag, idx) => {
          const col = idx % 3
          const row = Math.floor(idx / 3)
          const ax = -pw + 38 + col * 60
          const ay = -ph + 38 + row * 48

          const selecionado = foco === ag.id

          const estadoAgente: 'TRABALHANDO' | 'OCIOSO' | 'PARADO' =
            ag.id === 'luana' || ag.id === 'renato' || ag.id === 'bia'
              ? diretoresEstado.get(ag.id) ?? 'PARADO'
              : ativos.has(ag.id)
                ? 'TRABALHANDO'
                : 'OCIOSO'

          const dimmed =
            (filtroAgentes === 'vivos' && estadoAgente === 'PARADO') ||
            (filtroAgentes === 'ativos' && estadoAgente !== 'TRABALHANDO')

          desenharMesaEAgente(ctx, ax, ay, ag, estadoAgente, selecionado, tick, reduzirMovimento, dimmed)
        })

        // CARTÃO FLUTUANTE GLASSMORPHISM HUD DO DEPARTAMENTO
        const cardX = -pw - 10
        const cardY = -ph - 72
        const cardW = 150
        const cardH = 64

        // Sombra do Cartão
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
        ctx.fillRect(cardX + 3, cardY + 3, cardW, cardH)

        // Fundo Glassmorphism Fosco (#0f172a / 90%)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
        ctx.fillRect(cardX, cardY, cardW, cardH)

        // Borda Neon do Cartão
        ctx.strokeStyle = dept.cor
        ctx.lineWidth = 1.5
        ctx.strokeRect(cardX, cardY, cardW, cardH)

        // Top Header: Neon Dot + Nome
        ctx.fillStyle = dept.cor
        ctx.beginPath()
        ctx.arc(cardX + 10, cardY + 11, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = 'bold 9px sans-serif'
        ctx.fillStyle = '#f8fafc'
        ctx.textAlign = 'left'
        ctx.fillText(dept.nome.toUpperCase(), cardX + 18, cardY + 14)

        // Agentes Contagem Grande
        ctx.font = 'bold 16px sans-serif'
        ctx.fillStyle = '#f8fafc'
        ctx.fillText(`${ags.length}`, cardX + 10, cardY + 34)

        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText('agentes', cardX + 26, cardY + 34)

        // Linhas de Métrica
        ctx.font = '8px sans-serif'
        ctx.fillStyle = '#cbd5e1'
        ctx.fillText(metric.m1, cardX + 75, cardY + 26)
        ctx.fillText(metric.m2, cardX + 75, cardY + 36)

        // Rodapé Card: FAZENDO / PRÓXIMA / CONCLUÍDA
        ctx.fillStyle = metric.aguardando_d2 ? 'rgba(194, 65, 12, 0.25)' : '#1e293b'
        ctx.fillRect(cardX, cardY + 46, cardW, 18)
        ctx.strokeStyle = metric.aguardando_d2 ? '#f97316' : '#334155'
        ctx.strokeRect(cardX, cardY + 46, cardW, 18)

        const txtRodape = metric.aguardando_d2
          ? 'aguardando o dono (D2)'
          : `FAZENDO ${metric.doing} · PRÓXIMA ${metric.next} · FEITAS ${metric.done}`

        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = metric.aguardando_d2 ? '#fb923c' : '#f8fafc'
        ctx.fillText(txtRodape, cardX + (metric.aguardando_d2 ? 16 : 8), cardY + 58)

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
  }, [agentesPorSquad, ativos, diretoresEstado, estado, filtroAgentes, foco, metricasSquad, pan, reduzirMovimento, zoom])

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
    <div className="flex flex-col gap-4 font-sans text-slate-100">
      {/* BARRA SUPERIOR (TOP BAR DARK HUD) */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0f172a]/90 px-4 py-2.5 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xs tracking-wider text-white uppercase">
            AGENTS OFFICE <span className="text-cyan-400 font-normal">v3 HUD</span>
          </span>
          <span className="hidden text-slate-500 text-xs sm:inline">·</span>
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Conectado a</span>
            <div className="flex items-center gap-1">
              <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/30">Meta</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">OpenAI</span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">Claude</span>
              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-400 border border-purple-500/30">Composio</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="size-2 rounded-full bg-emerald-400" />
            <span className="font-medium">Roda em</span>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-400 border border-amber-500/30">
              PAINEL OS
            </span>
          </div>
          <span className="font-mono text-xs font-bold text-white">
            {horaLocal}
          </span>
        </div>
      </header>

      {/* ÁREA PRINCIPAL: CANVAS ISOMÉTRICO (ESQUERDA) + PAINEL LATERAL DIREITO */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* CANVAS INTERATIVO 2.5D DARK HUD (ESQUERDA - 8 colunas) */}
        <div
          ref={containerRef}
          tabIndex={0}
          role="region"
          aria-label="Escritório virtual dos agentes em 2.5D HUD"
          className="relative min-h-[480px] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#070a12] shadow-xl lg:col-span-8 lg:min-h-[580px]"
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

          {/* SELETOR DE FILTRO DE AGENTES (CANTO SUPERIOR ESQUERDO) */}
          <div className="pointer-events-auto absolute top-3 left-3 flex items-center gap-1.5 rounded-lg border border-slate-800 bg-[#0f172a]/95 p-1.5 shadow-lg backdrop-blur-md">
            <span className="px-1 font-extrabold text-[10px] tracking-wider text-slate-400 uppercase">Ver Agentes:</span>
            <button
              type="button"
              onClick={() => setFiltroAgentes('todos')}
              className={`rounded px-2.5 py-1 font-extrabold text-[10px] transition-colors ${
                filtroAgentes === 'todos'
                  ? 'bg-sky-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Todos ({catalogoVisual.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAgentes('vivos')}
              className={`rounded px-2.5 py-1 font-extrabold text-[10px] transition-colors ${
                filtroAgentes === 'vivos'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Vivos ({catalogoVisual.filter((ag) => ativos.has(ag.id) || ['luana', 'renato', 'bia'].includes(ag.id)).length})
            </button>
            <button
              type="button"
              onClick={() => setFiltroAgentes('ativos')}
              className={`rounded px-2.5 py-1 font-extrabold text-[10px] transition-colors ${
                filtroAgentes === 'ativos'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm animate-pulse'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
              }`}
            >
              ⚡ Somente Ativos ({ativos.size})
            </button>
          </div>

          {/* LEGENDAS DE INSTRUÇÃO NO CANTO INFERIOR ESQUERDO */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-slate-800 bg-[#0f172a]/90 px-3 py-1.5 text-[10px] text-slate-300 shadow-lg backdrop-blur-md">
            Arraste para mover · Roda do mouse para Zoom · Clique nas plataformas
          </div>

          {/* CONTROLES DE CANVAS (CANTO INFERIOR DIREITO: +, -, RESET) */}
          <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border border-slate-800 bg-[#0f172a] p-1 shadow-xl">
            <button
              type="button"
              onClick={() => setZoom((v) => arredondarZoom(v + 0.15))}
              className="flex size-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 active:scale-95"
              title="Aumentar Zoom"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom((v) => arredondarZoom(v - 0.15))}
              className="flex size-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 active:scale-95"
              title="Diminuir Zoom"
            >
              −
            </button>
            <button
              type="button"
              onClick={resetView}
              className="flex size-7 items-center justify-center rounded border border-slate-700 bg-slate-900 text-[12px] font-bold text-white hover:bg-slate-800 active:scale-95"
              title="Resetar Visão"
            >
              ⌂
            </button>
          </div>
        </div>

        {/* PAINEL LATERAL DIREITO (STATUS DE TAREFAS & BARRA DE BUSCA - 4 colunas) */}
        <aside className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-[#0f172a]/90 p-4 shadow-xl backdrop-blur-md lg:col-span-4">
          {/* BARRA DE TAREFAS (TASK SEARCH / INPUT BAR) */}
          <form onSubmit={adicionarTarefa} className="flex flex-col gap-2">
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-inner">
              <select
                value={departamentoTarefa}
                onChange={(e) => setDepartamentoTarefa(e.target.value)}
                className="cursor-pointer bg-transparent px-2 text-xs font-bold text-amber-400 focus:outline-none"
              >
                <option value="luana" className="bg-slate-900 text-white">● LUANA</option>
                <option value="conteúdo" className="bg-slate-900 text-white">● CONTEÚDO</option>
                <option value="comercial" className="bg-slate-900 text-white">● COMERCIAL</option>
                <option value="bots" className="bg-slate-900 text-white">● BOTS</option>
                <option value="tráfego" className="bg-slate-900 text-white">● TRÁFEGO</option>
                <option value="globais" className="bg-slate-900 text-white">● GLOBAIS</option>
              </select>
              <input
                type="text"
                value={textoNovaTarefa}
                onChange={(e) => setTextoNovaTarefa(e.target.value)}
                placeholder={`Digite uma tarefa para ${departamentoTarefa}...`}
                className="w-full min-w-0 bg-transparent px-2 text-xs text-white placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={enviandoTarefa || !textoNovaTarefa.trim()}
                className="rounded-md bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {enviandoTarefa ? '...' : 'Enviar'}
              </button>
            </div>
          </form>

          {/* CARTÃO DE DESTAQUE DO HUB CENTRAL (O CÉRABRO) */}
          <div className="rounded-lg border border-sky-500/30 bg-sky-950/40 p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-sky-400">
                O CÉREBRO <span className="font-normal text-slate-400">{textoBrainNotasRight}</span>
              </span>
            </div>
            <a
              href="#cofre"
              className="mt-2 inline-block font-bold text-xs text-sky-400 hover:underline"
            >
              Abrir o Cérebro →
            </a>
          </div>

          {/* TASK STATUS SELECTION & PILL FILTERS */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs tracking-wider text-white uppercase">
                  Tarefas
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-400">Todo o escritório</span>
            </div>

            {/* FILTROS EM PÍLULA */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setFiltroStatus('Todas')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Todas' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Todas {tarefas.length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Na fila')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Na fila' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Na fila {tarefas.filter((t) => t.estado === 'aguardando').length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Fazendo')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Fazendo' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Fazendo {tarefas.filter((t) => t.estado === 'em_andamento').length}
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Esperando')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Esperando' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Esperando 0
              </button>
              <button
                type="button"
                onClick={() => setFiltroStatus('Feitas')}
                className={`rounded-full px-2.5 py-0.5 font-bold text-[10px] ${
                  filtroStatus === 'Feitas' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Feitas {tarefas.filter((t) => t.estado === 'feito').length}
              </button>
            </div>
          </div>

          {/* LISTA VERTICAL DE TAREFAS */}
          <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
            {tarefasFiltradas.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                Nenhuma tarefa na fila ainda
              </div>
            ) : (
              tarefasFiltradas.map((item) => {
                const alvo = nomeDiretorPorDept(item.departamento)
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-400">
                          NA FILA
                        </span>
                        <span className="font-semibold text-xs text-slate-200 leading-snug">
                          {item.texto}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
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
