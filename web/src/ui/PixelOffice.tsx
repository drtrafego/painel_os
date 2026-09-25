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
  { id: 'coordenação', nome: 'COORDENAÇÃO', cor: '#84cc16', gx: 0, gy: -220, largura: 260, altura: 165 },
  { id: 'bots', nome: 'RENATO / BOTS', cor: '#f97316', gx: 270, gy: -110, largura: 260, altura: 165 },
  { id: 'tráfego', nome: 'BIA / TRÁFEGO', cor: '#a855f7', gx: 270, gy: 150, largura: 260, altura: 165 },
  { id: 'comercial', nome: 'SQUAD COMERCIAL', cor: '#10b981', gx: 0, gy: 250, largura: 260, altura: 165 },
  { id: 'globais', nome: 'GLOBAIS', cor: '#06b6d4', gx: -270, gy: 150, largura: 260, altura: 165 },
  { id: 'conteúdo', nome: 'SQUAD CONTEÚDO', cor: '#f59e0b', gx: -270, gy: -110, largura: 260, altura: 165 },
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

  const corSetor = ag.cor || '#38bdf8'
  const ehTrabalhando = estadoAgente === 'TRABALHANDO'
  const ehParado = estadoAgente === 'PARADO'

  // 0. AURA NEON NO CHÃO PARA AGENTES ATIVOS (TRABALHANDO)
  if (ehTrabalhando) {
    const auraPulso = !reduzirMovimento ? 16 + Math.sin(tick * 0.12) * 6 : 16
    ctx.save()
    ctx.shadowColor = corSetor
    ctx.shadowBlur = auraPulso
    ctx.strokeStyle = corSetor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, 10, 28, 14, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // 1. Sombra da mesa no piso dark
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.beginPath()
  ctx.ellipse(0, 10, 24, 11, 0, 0, Math.PI * 2)
  ctx.fill()

  // 2. Tampo da Mesa Isométrica Dark Tech (Console Titânio)
  ctx.fillStyle = '#1e293b'
  ctx.strokeStyle = selecionado ? '#f59e0b' : ehTrabalhando ? corSetor : '#334155'
  ctx.lineWidth = selecionado ? 2.5 : 1.2
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(19, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(-19, -6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Borda frontal neon da mesa
  ctx.strokeStyle = ehTrabalhando ? corSetor : 'rgba(255, 255, 255, 0.15)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-19, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(19, -6)
  ctx.stroke()

  // Espessura / Chassis da mesa
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(-19, -6)
  ctx.lineTo(0, 2)
  ctx.lineTo(0, 6)
  ctx.lineTo(-19, -2)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(0, 2)
  ctx.lineTo(19, -6)
  ctx.lineTo(19, -2)
  ctx.lineTo(0, 6)
  ctx.closePath()
  ctx.fill()

  // Pés metálicos da mesa
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(-16, -3)
  ctx.lineTo(-16, 8)
  ctx.moveTo(16, -3)
  ctx.lineTo(16, 8)
  ctx.stroke()

  // 3. SETUP MULTI-MONITOR (Principal + Lateral Angulado) - Estilo Opção 1
  // Suporte do monitor central
  ctx.fillStyle = '#334155'
  ctx.fillRect(-3, -10, 6, 2)
  ctx.fillRect(-1, -13, 2, 4)

  // Carcaça dos monitores
  ctx.fillStyle = '#0a0f1d'
  // Monitor central
  ctx.fillRect(-11, -23, 22, 11)
  // Monitor lateral angulado (direita)
  ctx.save()
  ctx.translate(10, -21)
  ctx.rotate(0.2)
  ctx.fillStyle = '#0a0f1d'
  ctx.fillRect(0, 0, 10, 10)
  ctx.restore()

  // Telas dos monitores
  if (ehTrabalhando) {
    const pulso = !reduzirMovimento ? Math.sin(tick * 0.15) * 0.2 : 0
    ctx.shadowColor = corSetor
    ctx.shadowBlur = 12

    // Tela Principal com dados brilhantes
    ctx.fillStyle = corSetor
    ctx.fillRect(-10, -22, 20, 9)

    // Scanlines e blocos de código no monitor
    ctx.fillStyle = `rgba(255, 255, 255, ${0.8 + pulso})`
    ctx.fillRect(-8, -20, 12, 1.8)
    ctx.fillRect(-8, -17, 16, 1.5)
    ctx.fillRect(-8, -14, 9, 1.5)

    // Tela lateral com mini barras de dados
    ctx.save()
    ctx.translate(10, -21)
    ctx.rotate(0.2)
    ctx.fillStyle = corSetor
    ctx.fillRect(1, 1, 8, 8)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.fillRect(2, 3, 4, 1.2)
    ctx.fillRect(2, 5, 6, 1.2)
    ctx.restore()

    ctx.shadowBlur = 0

    // Feixe de luz cônica projetada pelo monitor na mesa
    const r = parseInt(corSetor.slice(1, 3), 16) || 56
    const g = parseInt(corSetor.slice(3, 5), 16) || 189
    const b = parseInt(corSetor.slice(5, 7), 16) || 248
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.18)`
    ctx.beginPath()
    ctx.moveTo(-10, -11)
    ctx.lineTo(10, -11)
    ctx.lineTo(15, -1)
    ctx.lineTo(-15, -1)
    ctx.closePath()
    ctx.fill()
  } else if (!ehParado) {
    // Modo Ocioso (standby console)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(-10, -22, 20, 9)
    ctx.fillStyle = '#38bdf8'
    ctx.fillRect(-8, -18, 5, 1.2)

    ctx.save()
    ctx.translate(10, -21)
    ctx.rotate(0.2)
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(1, 1, 8, 8)
    ctx.restore()
  } else {
    // Monitor totalmente desligado para PARADO
    ctx.fillStyle = '#050811'
    ctx.fillRect(-10, -22, 20, 9)
  }

  // Partículas de faíscas neon subindo se estiver TRABALHANDO
  if (ehTrabalhando && !reduzirMovimento) {
    ctx.save()
    for (let i = 0; i < 3; i++) {
      const pOffset = (tick * 1.5 + i * 18) % 25
      const px = Math.sin(tick * 0.1 + i * 2) * 7
      const py = -24 - pOffset
      const alpha = 1 - pOffset / 25
      ctx.fillStyle = corSetor
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(px, py, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // Teclado com iluminação LED
  ctx.fillStyle = ehTrabalhando ? corSetor : '#475569'
  ctx.fillRect(-7, -4, 14, 3)

  // 4. Cadeira Gamer / Ergonômica Sci-Fi
  const chairY = 8
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-6, chairY + 6)
  ctx.lineTo(6, chairY + 6)
  ctx.moveTo(0, chairY + 2)
  ctx.lineTo(0, chairY + 6)
  ctx.stroke()

  ctx.fillStyle = '#1e293b'
  ctx.beginPath()
  ctx.ellipse(0, chairY + 2, 8, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // Encosto alto da cadeira
  ctx.fillStyle = '#0f172a'
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.rect(-6, chairY - 6, 12, 8)
  ctx.fill()
  ctx.stroke()

  // 5. Operador Seated (Cadeira vazia se PARADO!)
  if (!ehParado) {
    const animY = ehTrabalhando && !reduzirMovimento ? Math.sin(tick * 0.25) * 0.8 : 0

    // Torso / Traje com cor do setor
    ctx.fillStyle = corSetor
    ctx.beginPath()
    ctx.rect(-7, chairY - 7 + animY, 14, 9)
    ctx.fill()

    // Braços no teclado
    ctx.strokeStyle = corSetor
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(-5, chairY - 3 + animY)
    ctx.lineTo(-4, -2)
    ctx.moveTo(5, chairY - 3 + animY)
    ctx.lineTo(4, -2)
    ctx.stroke()

    // Cabeça
    ctx.fillStyle = '#475569'
    ctx.beginPath()
    ctx.arc(0, chairY - 11 + animY, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 6. Etiqueta Holográfica HUD com Nome do Agente
  const tagY = -36
  const nomeExibicao = ag.nome.slice(0, 11)
  ctx.font = 'bold 9px sans-serif'
  const larguraTexto = ctx.measureText(nomeExibicao).width
  const tagW = Math.max(38, larguraTexto + 12)
  const tagH = 15

  // Fundo Dark Glassmorphism com borda neon
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
  ctx.strokeStyle = selecionado ? '#f59e0b' : ehTrabalhando ? corSetor : '#334155'
  ctx.lineWidth = selecionado ? 2 : 1
  ctx.fillRect(-tagW / 2, tagY, tagW, tagH)
  ctx.strokeRect(-tagW / 2, tagY, tagW, tagH)

  // Indicador de status neon
  ctx.fillStyle = ehTrabalhando ? corSetor : ehParado ? '#ef4444' : '#64748b'
  ctx.beginPath()
  ctx.arc(-tagW / 2 + 6, tagY + tagH / 2, 2.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f8fafc'
  ctx.textAlign = 'center'
  ctx.fillText(nomeExibicao, 3, tagY + 11)

  // 7. BADGE FLUTUANTE ⚡ ATIVO PARA AGENTES TRABALHANDO
  if (ehTrabalhando) {
    const badgeY = tagY - 14
    const badgePulso = !reduzirMovimento ? Math.sin(tick * 0.2) * 1.5 : 0
    ctx.save()
    ctx.shadowColor = '#eab308'
    ctx.shadowBlur = 8
    ctx.fillStyle = '#eab308'
    ctx.fillRect(-22, badgeY + badgePulso, 44, 12)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'extrabold 8px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('⚡ ATIVO', 0, badgeY + badgePulso + 9)
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

  const [zoom, setZoom] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      return 0.72
    }
    return 1.0
  })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const [pontoArrasto, setPontoArrasto] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [foco, setFoco] = useState<string | null>(agenteSelecionadoId ?? null)
  const [reduzirMovimento, setReduzirMovimento] = useState(false)

  // Estado da Barra de Tarefas & Painel Lateral
  const [departamentoTarefa, setDepartamentoTarefa] = useState<string>('luana')
  const [textoNovaTarefa, setTextoNovaTarefa] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('Todas')
  const [enviandoTarefa, setEnviandoTarefa] = useState<boolean>(false)
  const [tarefas, setTarefas] = useState<TarefaItem[]>([])

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

  // RESOLUÇÃO DE DADOS PARA O INSPETOR (RODADA 20)
  const agenteSelecionadoDados = useMemo(() => {
    if (!foco) return null

    const focoNorm = foco.toLowerCase().trim()
    const noCat = catalogoVisual.find((ag) => ag.id === foco || ag.aliases?.includes(foco))

    // Tenta encontrar o AgenteVivo exato no array de agentes ao vivo (/api/agentes-vivos)
    const noVivo = agentes.find((ag) => {
      if (!ag) return false
      const idAg = (ag.id || '').toLowerCase()
      const idenAg = (ag.identidade || '').toLowerCase()
      const papelAg = (ag.papel || '').toLowerCase()

      if (idAg === focoNorm || idenAg === focoNorm) return true
      if (noCat) {
        if (idAg === noCat.id || idenAg === noCat.id) return true
        if (noCat.aliases?.some((alias) => idAg.includes(alias.toLowerCase()) || idenAg.includes(alias.toLowerCase()))) return true
      }
      return idAg.includes(focoNorm) || idenAg.includes(focoNorm) || papelAg.includes(focoNorm)
    })

    const ehDiretor = foco === 'luana' || foco === 'renato' || foco === 'bia'

    if (ehDiretor) {
      const subagentesDoDiretor = agentes.filter((ag) => {
        const donoNorm = normalizarDonoId(ag.dono)
        return donoNorm === foco || (ag.dono === undefined && foco === 'luana')
      })

      const sessaoRaiz = agentes.find((ag) => {
        const donoNorm = normalizarDonoId(ag.dono)
        return (donoNorm === foco || ag.id === foco) && (ag.identidade === 'sessao-claude' || ag.tipo === 'sessao_claude' || ag.id === foco)
      }) || noVivo

      const temSubAtivo = subagentesDoDiretor.some((s) => s.estado === 'trabalhando')
      const sessaoAtiva = sessaoRaiz?.estado === 'trabalhando' || sessaoRaiz?.estado === 'silencioso' || temSubAtivo || subagentesDoDiretor.length > 0

      const estadoFinal = temSubAtivo || sessaoRaiz?.estado === 'trabalhando' ? 'trabalhando' : sessaoAtiva ? 'silencioso' : 'parado'
      const statusRotulo = estadoFinal === 'trabalhando' ? 'TRABALHANDO' : estadoFinal === 'silencioso' ? 'OCIOSO' : 'PARADO'

      const modelo = sessaoRaiz?.modelo_legivel || sessaoRaiz?.modelo || subagentesDoDiretor.find((s) => s.modelo)?.modelo_legivel || 'Claude 3.7 Sonnet (orquestrador)'
      const esforco = sessaoRaiz?.esforco || 'medium (padrão)'
      const dono = foco.charAt(0).toUpperCase() + foco.slice(1)
      const rodandoHa = sessaoRaiz?.rodando_ha || (sessaoRaiz?.inicio ? `desde ${sessaoRaiz.inicio}` : 'sessão ativa')
      const ultimaAtiv = sessaoRaiz?.silencio_s === 0 ? 'agora' : sessaoRaiz?.silencio_s != null ? `${sessaoRaiz.silencio_s}s atrás` : (sessaoRaiz?.ultima_atividade || 'atividade recente')
      const ferramentas = subagentesDoDiretor.reduce((acc, s) => acc + (s.ferramentas_usadas ?? 0), sessaoRaiz?.ferramentas_usadas ?? 0)
      const tokens = sessaoRaiz?.tokens_formatado || (sessaoRaiz?.tokens_total ? sessaoRaiz.tokens_total.toLocaleString('pt-BR') : 'sem dado de tokens para sessão principal')
      const tarefa = sessaoRaiz?.tarefa || subagentesDoDiretor.find((s) => s.tarefa)?.tarefa || `Orquestração de tarefas do setor ${foco}`
      const quemMandou = sessaoRaiz?.quem_mandou || `Painel OS / ${dono}`

      return {
        id: foco,
        nome: dono,
        papel: `Diretor(a) / Orquestrador(a)`,
        squad: foco === 'renato' ? 'bots' : foco === 'bia' ? 'tráfego' : 'coordenação',
        estado: estadoFinal,
        statusRotulo,
        modelo,
        esforco,
        dono,
        rodandoHa,
        ultimaAtiv,
        ferramentas: `${ferramentas} usadas`,
        tokens,
        tarefa,
        quemMandou,
        subagentes: subagentesDoDiretor,
        isDirector: true
      }
    }

    // Se for um agente/subagente comum
    const estadoAg = noVivo?.estado || (ativos.has(foco) ? 'trabalhando' : 'silencioso')
    const statusRotulo = estadoAg === 'trabalhando' ? 'TRABALHANDO' : estadoAg === 'silencioso' ? 'OCIOSO' : 'PARADO'

    const donoNorm = normalizarDonoId(noVivo?.dono)
    const donoFormatted = donoNorm ? donoNorm.charAt(0).toUpperCase() + donoNorm.slice(1) : noCat?.área || '—'

    return {
      id: foco,
      nome: noCat?.nome || noVivo?.papel || noVivo?.identidade || foco,
      papel: noCat?.papel || noVivo?.papel || 'Especialista',
      squad: noCat?.squad || 'globais',
      estado: estadoAg,
      statusRotulo,
      modelo: noVivo?.modelo_legivel || noVivo?.modelo || 'Claude 3.7 Sonnet',
      esforco: noVivo?.esforco || 'medium (padrão)',
      dono: donoFormatted,
      rodandoHa: noVivo?.rodando_ha || (noVivo?.inicio ? `desde ${noVivo.inicio}` : 'sessão recente'),
      ultimaAtiv: noVivo?.silencio_s === 0 ? 'agora' : noVivo?.silencio_s != null ? `${noVivo.silencio_s}s atrás` : (noVivo?.ultima_atividade || 'atividade recente'),
      ferramentas: `${noVivo?.ferramentas_usadas ?? 0} usadas`,
      tokens: noVivo?.tokens_formatado || (noVivo?.tokens_total ? noVivo.tokens_total.toLocaleString('pt-BR') : 'sem dado de tokens para este subagente'),
      tarefa: noVivo?.tarefa || noVivo?.etapa || noVivo?.descricao || (noVivo?.ferramenta ? `Executando ${noVivo.ferramenta}` : noCat?.papel || 'Pronto para execução'),
      quemMandou: noVivo?.quem_mandou || (donoNorm ? `Convocado por ${donoFormatted}` : 'Painel OS'),
      subagentes: [],
      isDirector: false
    }
  }, [foco, catalogoVisual, agentes, ativos])

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
      const larguraCss = container ? container.clientWidth : 800
      const alturaCss = container ? container.clientHeight : 540

      if (canvas.width !== Math.round(larguraCss * dpr) || canvas.height !== Math.round(alturaCss * dpr)) {
        canvas.width = Math.round(larguraCss * dpr)
        canvas.height = Math.round(alturaCss * dpr)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.clearRect(0, 0, larguraCss, alturaCss)

      // 1. FUNDO DARK SCI-FI CYBERPUNK (OPÇÃO 1)
      const bgGrad = ctx.createRadialGradient(
        larguraCss / 2,
        alturaCss / 2,
        60,
        larguraCss / 2,
        alturaCss / 2,
        Math.max(larguraCss, alturaCss) * 0.95
      )
      bgGrad.addColorStop(0, '#0a1024')
      bgGrad.addColorStop(1, '#050711')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, larguraCss, alturaCss)

      // Estrelas e partículas cósmicas cintilantes
      ctx.save()
      for (let i = 0; i < 55; i++) {
        const sx = (i * 157.3 + tick * 0.03) % larguraCss
        const sy = (i * 281.7) % alturaCss
        const size = i % 4 === 0 ? 1.8 : 1
        const alpha = 0.2 + Math.sin(tick * 0.04 + i) * 0.25
        ctx.fillStyle = i % 3 === 0 ? '#38bdf8' : '#ffffff'
        ctx.globalAlpha = Math.max(0.05, alpha)
        ctx.beginPath()
        ctx.arc(sx, sy, size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // Grid Isométrico Cyberpunk sutil em Cyan
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.06)'
      ctx.lineWidth = 1
      const step = 45
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

      // 2. CONDUTOS MULTI-VIAS DE ENERGIA & DADOS (OPÇÃO 1)
      const hubX = 0
      const hubY = 0
      const nosCount = estado?.cofre?.nos?.length
      const textoHubNotas = nosCount != null ? `${nosCount} NOTAS` : 'sem dado'

      DEPARTAMENTOS_CONFIG.forEach((dept, deptIdx) => {
        // Três cabos paralelos curvados por squad
        const offsets = [-4, 0, 4]
        offsets.forEach((offset, idx) => {
          ctx.save()
          ctx.strokeStyle = dept.cor
          ctx.lineWidth = idx === 1 ? 2 : 1
          ctx.shadowColor = dept.cor
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.moveTo(hubX + offset, hubY)
          ctx.bezierCurveTo(
            hubX + (dept.gx - hubX) * 0.35 + offset * 2,
            hubY + (dept.gy - hubY) * 0.1,
            hubX + (dept.gx - hubX) * 0.65,
            dept.gy - offset * 2,
            dept.gx,
            dept.gy
          )
          ctx.stroke()
          ctx.restore()
        })

        // Pulso de energia viajando no conduto central (animação viva)
        if (!reduzirMovimento) {
          const t = (tick * 0.012 + deptIdx * 0.18) % 1
          const p0 = { x: hubX, y: hubY }
          const p1 = { x: hubX + (dept.gx - hubX) * 0.35, y: hubY + (dept.gy - hubY) * 0.1 }
          const p2 = { x: hubX + (dept.gx - hubX) * 0.65, y: dept.gy }
          const p3 = { x: dept.gx, y: dept.gy }

          const px =
            Math.pow(1 - t, 3) * p0.x +
            3 * Math.pow(1 - t, 2) * t * p1.x +
            3 * (1 - t) * Math.pow(t, 2) * p2.x +
            Math.pow(t, 3) * p3.x
          const py =
            Math.pow(1 - t, 3) * p0.y +
            3 * Math.pow(1 - t, 2) * t * p1.y +
            3 * (1 - t) * Math.pow(t, 2) * p2.y +
            Math.pow(t, 3) * p3.y

          ctx.save()
          ctx.shadowColor = dept.cor
          ctx.shadowBlur = 10
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(px, py, 2.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      })

      // 3. HUB CENTRAL: CUBO HOLOGRÁFICO 3D ("O CÉREBRO" - OPÇÃO 1)
      ctx.save()
      ctx.translate(hubX, hubY)

      // Pedestal Hexagonal Dark com iluminação neon cyan
      ctx.fillStyle = '#080d1a'
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 2
      ctx.shadowColor = '#06b6d4'
      ctx.shadowBlur = 14
      ctx.beginPath()
      ctx.ellipse(0, 8, 48, 22, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0

      // Coluna / Feixe de luz holográfica vertical ascendente
      const beamGrad = ctx.createLinearGradient(0, 8, 0, -55)
      beamGrad.addColorStop(0, 'rgba(6, 182, 212, 0.4)')
      beamGrad.addColorStop(1, 'rgba(6, 182, 212, 0)')
      ctx.fillStyle = beamGrad
      ctx.beginPath()
      ctx.moveTo(-32, 8)
      ctx.lineTo(32, 8)
      ctx.lineTo(24, -55)
      ctx.lineTo(-24, -55)
      ctx.closePath()
      ctx.fill()

      // CUBO HOLOGRÁFICO 3D ISOMÉTRICO (Cérebro Central)
      const cubeSize = 22
      const pulsoCubo = !reduzirMovimento ? Math.sin(tick * 0.08) * 3 : 0
      const cy = -26 + pulsoCubo

      // Face Superior do Cubo (Losango)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)'
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1.8
      ctx.shadowColor = '#00f5ff'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(0, cy - cubeSize)
      ctx.lineTo(cubeSize * 1.1, cy - cubeSize * 0.5)
      ctx.lineTo(0, cy)
      ctx.lineTo(-cubeSize * 1.1, cy - cubeSize * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Face Esquerda do Cubo
      ctx.fillStyle = 'rgba(2, 132, 199, 0.4)'
      ctx.strokeStyle = '#0284c7'
      ctx.beginPath()
      ctx.moveTo(-cubeSize * 1.1, cy - cubeSize * 0.5)
      ctx.lineTo(0, cy)
      ctx.lineTo(0, cy + cubeSize)
      ctx.lineTo(-cubeSize * 1.1, cy + cubeSize * 0.5)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Face Direita do Cubo
      ctx.fillStyle = 'rgba(14, 165, 233, 0.3)'
      ctx.strokeStyle = '#38bdf8'
      ctx.beginPath()
      ctx.moveTo(0, cy)
      ctx.lineTo(cubeSize * 1.1, cy - cubeSize * 0.5)
      ctx.lineTo(cubeSize * 1.1, cy + cubeSize * 0.5)
      ctx.lineTo(0, cy + cubeSize)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      // Núcleo brilhante no interior do cubo
      ctx.fillStyle = '#ffffff'
      ctx.shadowColor = '#00f5ff'
      ctx.shadowBlur = 16
      ctx.beginPath()
      ctx.arc(0, cy, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Etiqueta Holográfica "O CÉREBRO"
      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#38bdf8'
      ctx.textAlign = 'center'
      ctx.fillText(`● O CÉREBRO  ${textoHubNotas}`, 0, cy - cubeSize - 8)

      ctx.font = 'bold 8.5px sans-serif'
      ctx.fillStyle = '#94a3b8'
      ctx.fillText('BASE DE CONHECIMENTO', 0, cy - cubeSize + 4)

      ctx.restore()

      // 4. DESENHO DAS PLATAFORMAS 3D FLUTUANTES (ISLANDS - OPÇÃO 1)
      DEPARTAMENTOS_CONFIG.forEach((dept) => {
        const ags = agentesPorSquad.get(dept.id) ?? []
        const metric = metricasSquad.get(dept.id) ?? { m1: 'sem dado', m2: 'sem dado', doing: 0, next: 0, done: 0, aguardando_d2: false }

        ctx.save()
        ctx.translate(dept.gx, dept.gy)

        const pw = dept.largura / 2
        const ph = dept.altura / 2

        // A. Brilho Neon Inferior no Vazio (Levitation Underglow)
        ctx.save()
        ctx.shadowColor = dept.cor
        ctx.shadowBlur = 24
        ctx.fillStyle = dept.cor
        ctx.globalAlpha = 0.22
        ctx.beginPath()
        ctx.ellipse(0, 32, pw * 0.95, ph * 0.95, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // B. Extrusão 3D Inferior da Plataforma (Chassis Metálico / Rocha Espacial)
        const altura3D = 22
        // Face lateral esquerda
        ctx.fillStyle = '#080d19'
        ctx.beginPath()
        ctx.moveTo(-pw, 0)
        ctx.lineTo(0, ph)
        ctx.lineTo(0, ph + altura3D)
        ctx.lineTo(-pw, altura3D)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#1e293b'
        ctx.lineWidth = 1
        ctx.stroke()

        // Face lateral direita
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.moveTo(0, ph)
        ctx.lineTo(pw, 0)
        ctx.lineTo(pw, altura3D)
        ctx.lineTo(0, ph + altura3D)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#1e293b'
        ctx.stroke()

        // C. Tampo Superior Isométrico (Titanium Dark Slab)
        ctx.fillStyle = '#0f172a'
        ctx.beginPath()
        ctx.moveTo(0, -ph)
        ctx.lineTo(pw, 0)
        ctx.lineTo(0, ph)
        ctx.lineTo(-pw, 0)
        ctx.closePath()
        ctx.fill()

        // D. Borda Neon Vibrante da Plataforma (Opção 1)
        ctx.save()
        ctx.shadowColor = dept.cor
        ctx.shadowBlur = 12
        ctx.strokeStyle = dept.cor
        ctx.lineWidth = 2.5
        ctx.stroke()
        ctx.restore()

        // E. Painéis de circuito internos da plataforma
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.lineWidth = 1
        for (let i = -pw + 30; i < pw; i += 34) {
          ctx.beginPath()
          ctx.moveTo(i, -ph / 2)
          ctx.lineTo(i + 22, ph / 2)
          ctx.stroke()
        }

        // F. Desenho dos Agentes nas Mesas
        const maxDisplay = Math.min(ags.length, 6)
        ags.slice(0, maxDisplay).forEach((ag, idx) => {
          const col = idx % 3
          const row = Math.floor(idx / 3)
          const ax = -pw + 42 + col * 65
          const ay = -ph + 40 + row * 52

          const selecionado = foco === ag.id

          const estadoAgente: 'TRABALHANDO' | 'OCIOSO' | 'PARADO' =
            ag.id === 'luana' || ag.id === 'renato' || ag.id === 'bia'
              ? diretoresEstado.get(ag.id) ?? 'PARADO'
              : ativos.has(ag.id)
                ? 'TRABALHANDO'
                : 'OCIOSO'

          desenharMesaEAgente(ctx, ax, ay, ag, estadoAgente, selecionado, tick, reduzirMovimento)
        })

        // G. CARTÃO FLUTUANTE HUD GLASSMORPHISM (OPÇÃO 1)
        const cardX = -pw - 6
        const cardY = -ph - 74
        const cardW = 168
        const cardH = 68

        // Sombra do cartão
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
        ctx.fillRect(cardX + 4, cardY + 4, cardW, cardH)

        // Fundo Dark Glassmorphism
        ctx.fillStyle = 'rgba(15, 23, 42, 0.90)'
        ctx.fillRect(cardX, cardY, cardW, cardH)

        // Borda neon do cartão com glow
        ctx.save()
        ctx.shadowColor = dept.cor
        ctx.shadowBlur = 6
        ctx.strokeStyle = dept.cor
        ctx.lineWidth = 1.5
        ctx.strokeRect(cardX, cardY, cardW, cardH)
        ctx.restore()

        // Header: Dot Neon + Squad Name + Active Pill (Estilo Opção 1: "22 Active | Lime")
        const executandoCount = ags.filter((a) => ativos.has(a.id)).length

        ctx.fillStyle = dept.cor
        ctx.beginPath()
        ctx.arc(cardX + 12, cardY + 14, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = 'bold 10px sans-serif'
        ctx.fillStyle = '#f8fafc'
        ctx.textAlign = 'left'
        ctx.fillText(dept.nome.toUpperCase(), cardX + 22, cardY + 17)

        // Pill Ativos no topo à direita
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.fillRect(cardX + cardW - 58, cardY + 6, 52, 14)
        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = executandoCount > 0 ? dept.cor : '#94a3b8'
        ctx.textAlign = 'center'
        ctx.fillText(`${executandoCount} Ativo${executandoCount !== 1 ? 's' : ''}`, cardX + cardW - 32, cardY + 16.5)

        // Contagem Total e Métricas
        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = '#f8fafc'
        ctx.textAlign = 'left'
        ctx.fillText(`${ags.length}`, cardX + 12, cardY + 37)

        ctx.font = 'bold 8px sans-serif'
        ctx.fillStyle = '#64748b'
        ctx.fillText('agentes', cardX + 28, cardY + 37)

        // Métricas
        ctx.font = '8px sans-serif'
        ctx.fillStyle = '#94a3b8'
        ctx.fillText(metric.m1, cardX + 68, cardY + 28)
        ctx.fillText(metric.m2, cardX + 68, cardY + 38)

        // Rodapé do Card: FAZENDO / PRÓXIMA / FEITAS
        ctx.fillStyle = metric.aguardando_d2 ? 'rgba(234, 88, 12, 0.25)' : 'rgba(30, 41, 59, 0.7)'
        ctx.fillRect(cardX, cardY + 48, cardW, 20)

        ctx.strokeStyle = metric.aguardando_d2 ? '#f97316' : 'rgba(51, 65, 85, 0.5)'
        ctx.strokeRect(cardX, cardY + 48, cardW, 20)

        const txtRodape = metric.aguardando_d2
          ? 'aguardando o dono (D2)'
          : `FAZENDO ${metric.doing} · PRÓXIMA ${metric.next} · FEITAS ${metric.done}`

        ctx.font = 'bold 8.5px sans-serif'
        ctx.fillStyle = metric.aguardando_d2 ? '#fb923c' : '#e2e8f0'
        ctx.fillText(txtRodape, cardX + (metric.aguardando_d2 ? 14 : 8), cardY + 62)

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

  // SELEÇÃO PRECISA DE MESA DE SUBAGENTE VS CARTÃO DE DEPARTAMENTO (RODADA 20)
  const selecionarNoCanvas = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const larguraCss = rect.width
    const alturaCss = rect.height

    const mundoX = (evento.clientX - rect.left - larguraCss / 2 - pan.x) / zoom
    const mundoY = (evento.clientY - rect.top - alturaCss / 2 - pan.y) / zoom

    // 1. CHECAGEM DIRETA NAS MESAS DE AGENTES (Raio amplo de toque ~35px)
    let agenteEncontrado: string | null = null

    for (const dept of DEPARTAMENTOS_CONFIG) {
      const ags = agentesPorSquad.get(dept.id) ?? []
      const pw = dept.largura / 2
      const ph = dept.altura / 2
      const maxDisplay = Math.min(ags.length, 6)

      for (let idx = 0; idx < maxDisplay; idx++) {
        const ag = ags[idx]
        const col = idx % 3
        const row = Math.floor(idx / 3)
        const ax = dept.gx - pw + 42 + col * 65
        const ay = dept.gy - ph + 42 + row * 52

        // Distância euclidiana para área de toque confortável na mesa
        const dist = Math.hypot(ax - mundoX, ay - mundoY)
        if (dist < 36) {
          agenteEncontrado = ag.id
          break
        }
      }

      if (agenteEncontrado) break
    }

    if (agenteEncontrado) {
      setFoco(agenteEncontrado)
      aoSelecionarAgente?.(agenteEncontrado)
      return
    }

    // 2. CHECAGEM EXCLUSIVA NO CARTÃO FLUTUANTE DE CABEÇALHO DO SQUAD (Não no piso inteiro!)
    let deptEncontrado: string | null = null
    for (const dept of DEPARTAMENTOS_CONFIG) {
      const pw = dept.largura / 2
      const ph = dept.altura / 2
      const cardX = dept.gx - pw - 6
      const cardY = dept.gy - ph - 74
      const cardW = 168
      const cardH = 68

      if (mundoX >= cardX && mundoX <= cardX + cardW && mundoY >= cardY && mundoY <= cardY + cardH) {
        deptEncontrado = dept.id
        break
      }
    }

    if (deptEncontrado) {
      const ags = agentesPorSquad.get(deptEncontrado as PixelAgentSquad) ?? []
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
    setZoom(typeof window !== 'undefined' && window.innerWidth < 640 ? 0.72 : 1.0)
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
      {/* ÁREA PRINCIPAL: CANVAS ISOMÉTRICO (ESQUERDA) + PAINEL LATERAL DIREITO */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* CANVAS INTERATIVO 2.5D DARK HUD (ESQUERDA - 8 colunas) */}
        <div
          ref={containerRef}
          tabIndex={0}
          role="region"
          aria-label="Escritório virtual dos agentes em 2.5D HUD"
          className="relative min-h-[520px] w-full overflow-hidden rounded-xl border border-slate-800 bg-[#070a12] shadow-xl lg:col-span-8 lg:min-h-[620px]"
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

          {/* INSPETOR FLUTUANTE EM MODAL/DRAWER DIREITO QUANDO UM AGENTE É SELECIONADO */}
          {agenteSelecionadoDados && (
            <div className="absolute top-3 right-3 max-w-sm w-full z-20 rounded-xl border-2 border-slate-700 bg-[#0f172a]/95 p-4 text-white shadow-2xl backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2.5 rounded-full ${
                      agenteSelecionadoDados.estado === 'trabalhando' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <h3 className="font-black text-xs uppercase text-[#facc15] tracking-wider">
                      INSPECTOR: {agenteSelecionadoDados.nome}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {agenteSelecionadoDados.papel} · ({agenteSelecionadoDados.id})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFoco(null)}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-slate-700"
                >
                  ✕ FECHAR
                </button>
              </div>

              {/* Grid de Métricas Ricas do Agente Selecionado */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Modelo</div>
                  <div className="font-bold text-sky-400 truncate mt-0.5" title={agenteSelecionadoDados.modelo}>
                    {agenteSelecionadoDados.modelo}
                  </div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Esforço</div>
                  <div className="font-bold text-slate-200 mt-0.5">{agenteSelecionadoDados.esforco}</div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Dono / Squad</div>
                  <div className="font-bold text-amber-400 mt-0.5">{agenteSelecionadoDados.dono}</div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Rodando há</div>
                  <div className="font-bold text-slate-200 mt-0.5">{agenteSelecionadoDados.rodandoHa}</div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Última atividade</div>
                  <div className="font-bold text-emerald-400 mt-0.5">{agenteSelecionadoDados.ultimaAtiv}</div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Ferramentas</div>
                  <div className="font-bold text-slate-200 mt-0.5">{agenteSelecionadoDados.ferramentas}</div>
                </div>
              </div>

              {/* Tokens & Quem Mandou */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Tokens Usados</div>
                  <div className="font-bold text-amber-300 mt-0.5">{agenteSelecionadoDados.tokens}</div>
                </div>

                <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                  <div className="text-[9px] uppercase font-bold text-slate-400">Quem Mandou</div>
                  <div className="font-bold text-slate-200 truncate mt-0.5">{agenteSelecionadoDados.quemMandou}</div>
                </div>
              </div>

              {/* Tarefa e Etapa */}
              <div className="rounded border border-slate-800 bg-slate-900/80 p-2">
                <div className="text-[9px] uppercase font-bold text-slate-400">Tarefa / Etapa Atual</div>
                <p className="mt-1 text-xs text-slate-200 leading-relaxed break-words">
                  {agenteSelecionadoDados.tarefa}
                </p>
              </div>

              {/* Subagentes Ativos Clicáveis se for Diretor */}
              {agenteSelecionadoDados.isDirector && (
                <div className="rounded border border-slate-800 bg-slate-900/80 p-2 space-y-1.5">
                  <div className="text-[9.5px] font-extrabold uppercase text-amber-400 tracking-wider">
                    ⚡ Subagentes do Setor ({agenteSelecionadoDados.subagentes.length})
                  </div>
                  {agenteSelecionadoDados.subagentes.length === 0 ? (
                    <div className="text-[10px] text-slate-400 italic">Nenhum subagente ativo no momento.</div>
                  ) : (
                    <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                      {agenteSelecionadoDados.subagentes.map((sub) => {
                        const targetId = sub.id || sub.identidade || sub.papel || 'subagente'
                        return (
                          <button
                            type="button"
                            key={sub.id}
                            onClick={() => {
                              setFoco(targetId)
                              aoSelecionarAgente?.(targetId)
                            }}
                            className="w-full text-left flex items-center justify-between text-[10px] border-b border-slate-800 pb-1 hover:bg-slate-800/60 p-1 rounded transition-colors"
                          >
                            <span className="font-bold text-sky-400 truncate max-w-[140px]">
                              ● {sub.papel || sub.identidade || sub.id}
                            </span>
                            <span className="font-mono text-emerald-400">{sub.etapa || sub.fase || 'trabalhando'} ↗</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* PAINEL DE ATIVIDADE DO ESCRITÓRIO (RODADAPÉ DO MAPA - ITEM 4) */}
          <div className="pointer-events-auto absolute bottom-3 left-3 right-16 flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-[#0f172a]/95 p-2.5 shadow-lg backdrop-blur-md max-w-xl">
            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-1">
              <span className="font-extrabold text-[10px] tracking-wider text-amber-400 uppercase flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                ATIVIDADE EM TEMPO REAL
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {ativos.size} agente(s) executando
              </span>
            </div>
            {/* Últimas Ações Vivas */}
            <div className="flex max-h-16 flex-col gap-1 overflow-y-auto pr-1 text-[10px] text-slate-300">
              {agentes.filter((ag) => ag.estado === 'trabalhando').length === 0 ? (
                <div className="py-0.5 text-slate-400 italic">
                  Nenhum agente em execução ativa neste instante.
                </div>
              ) : (
                agentes
                  .filter((ag) => ag.estado === 'trabalhando')
                  .slice(0, 3)
                  .map((ag) => (
                    <div key={ag.id} className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sky-400 truncate max-w-[140px]">
                        ● {ag.papel || ag.identidade || ag.id}
                      </span>
                      <span className="truncate text-slate-300 max-w-[200px]">
                        {ag.etapa || ag.ferramenta || ag.tarefa || 'executando'}
                      </span>
                      <span className="font-mono text-emerald-400 shrink-0">
                        {ag.silencio_s === 0 ? 'agora' : `${ag.silencio_s}s atrás`}
                      </span>
                    </div>
                  ))
              )}
            </div>
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

          {/* CARTÃO DE DESTAQUE DO HUB CENTRAL (O CÉREBRO) */}
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
