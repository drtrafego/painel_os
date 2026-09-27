import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgenteVivo, Estado } from '../dados/tipos'
import {
  chaveAgente,
  formatarRotulo,
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
  type FaseBoneco,
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

type ObjetoMesa = 'codigo' | 'texto' | 'arte' | 'radar' | 'metricas' | 'qualidade' | 'envio' | 'cafe'

export interface ExecucaoVisual {
  chave: string
  animacaoChave: string
  execucao: AgenteVivo
  ficha?: PixelAgent
  nome: string
  rotulos: string[]
  squad: PixelAgentSquad
  squadNome: string
  cor: string
  corEscura: string
  destaque: string
  cabelo: string
  pele: string
  acessorio: number
  objeto: ObjetoMesa
  ativa: boolean
  temporaria: boolean
  ordem: number
}

export interface MesaVisual {
  execucao: ExecucaoVisual
  x: number
  y: number
  descanso: { x: number; y: number }
}

export interface IlhaVisual {
  squad: PixelAgentSquad
  nome: string
  cor: string
  x: number
  y: number
  largura: number
  altura: number
  mesas: MesaVisual[]
}

export interface LayoutSala {
  largura: number
  altura: number
  corredorX: number
  descansoY: number
  ilhas: IlhaVisual[]
  mesas: MesaVisual[]
}

const ZOOM_MIN = 0.24
const ZOOM_MAX = 1.7
const CORES_SQUAD = new Map(PIXEL_AGENT_SQUADS.map((squad) => [squad.id, squad.cor]))
const NOMES_SQUAD = new Map(PIXEL_AGENT_SQUADS.map((squad) => [squad.id, squad.nome]))
const CABELOS = ['#302d29', '#5a3825', '#c08a48', '#1f2c36', '#6b3546', '#ded0ad']
const PELES = ['#f0c7a0', '#dca778', '#bd8059', '#8c5a40', '#f2d5bd']

const limitar = (valor: number, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, valor))

function hashTexto(valor: string) {
  let hash = 2166136261
  for (let i = 0; i < valor.length; i += 1) {
    hash ^= valor.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function escurecer(hex: string, fator = 0.55) {
  const limpo = hex.replace('#', '')
  if (limpo.length !== 6) return '#42534f'
  const canais = [0, 2, 4].map((i) => Math.round(Number.parseInt(limpo.slice(i, i + 2), 16) * fator))
  return `#${canais.map((canal) => canal.toString(16).padStart(2, '0')).join('')}`
}

function rgba(hex: string, alfa: number) {
  const limpo = hex.replace('#', '')
  if (limpo.length !== 6) return `rgba(80, 110, 105, ${alfa})`
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(limpo.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alfa})`
}

function squadDaExecucao(execucao: AgenteVivo, catalogo: PixelAgent[]): PixelAgentSquad {
  const encontrado = resolverAgenteNoCatalogo(execucao, catalogo)
  if (encontrado) return encontrado.squad
  const dono = execucao.dono?.toLowerCase()
  if (dono === 'renato') return 'bots'
  if (dono === 'bia') return 'tráfego'
  if (dono === 'luana') return 'coordenação'
  if (execucao.motor === 'codex' || execucao.tipo === 'codex') return 'pipeline Codex'
  return 'globais'
}

const IDENTIDADES_GENERICAS = new Set(['sessao-codex', 'sessao-claude', 'sessão codex', 'sessão claude code'])
const TIPOS_GENERICOS = new Set(['codex', 'subagente', 'sessao_claude', 'sessão claude code'])

function textoLegivel(valor?: string | null) {
  const limpo = valor?.replace(/\s+/g, ' ').trim()
  return limpo && !IDENTIDADES_GENERICAS.has(limpo.toLowerCase()) ? limpo : null
}

function encurtarTarefa(valor?: string | null, limite = 28) {
  const limpo = valor?.replace(/\s+/g, ' ').trim() || 'tarefa em andamento'
  if (limpo.length <= limite) return limpo
  const trecho = limpo.slice(0, limite - 1)
  const ultimoEspaco = trecho.lastIndexOf(' ')
  return `${trecho.slice(0, ultimoEspaco >= Math.floor(limite * 0.6) ? ultimoEspaco : limite - 1)}…`
}

/** Nome humano em primeiro plano; IDs técnicos ficam apenas no detalhe. */
export function nomeLegivelDaExecucao(execucao: AgenteVivo, ficha?: PixelAgent) {
  const identidade = textoLegivel(execucao.identidade)
  if (identidade) return ficha?.nome || identidade
  const papel = textoLegivel(execucao.papel)
  if (papel) return papel
  if (ficha) return ficha.nome
  const ehCodex = execucao.motor === 'codex' || execucao.tipo === 'codex'
  if (ehCodex) {
    const modelo = execucao.modelo_legivel?.replace(/\s+/g, ' ').trim() || 'modelo indisponível'
    const tarefa = encurtarTarefa(execucao.tarefa || execucao.descricao || execucao.etapa)
    return `Codex · ${modelo} · ${tarefa}`
  }
  const nome = textoLegivel(execucao.nome)
  if (nome && nome !== execucao.id) return nome
  const tipo = execucao.tipo?.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (tipo && !TIPOS_GENERICOS.has(execucao.tipo?.toLowerCase() || '')) return tipo.charAt(0).toUpperCase() + tipo.slice(1)
  return 'Agente sem identidade'
}

function rotulosDaMesa(nome: string) {
  if (nome.startsWith('Codex · ')) {
    const partes = nome.split(' · ')
    return [formatarRotulo(partes.slice(0, 2).join(' · '), '', 19), formatarRotulo(partes.slice(2).join(' · '), '', 19)]
  }
  if (nome.length > 17 && nome.includes(' ')) {
    const partes = nome.split(' ')
    const meio = Math.ceil(partes.length / 2)
    return [formatarRotulo(partes.slice(0, meio).join(' '), '', 17), formatarRotulo(partes.slice(meio).join(' '), '', 17)]
  }
  return [formatarRotulo(nome, '', 17)]
}

function objetoDaFuncao(ficha: PixelAgent | undefined, execucao: AgenteVivo): ObjetoMesa {
  const texto = `${ficha?.papel || ''} ${ficha?.área || ''} ${execucao.papel || ''} ${execucao.tipo || ''}`.toLowerCase()
  if (/dev|cód|codigo|engenh|bot/.test(texto)) return 'codigo'
  if (/design|arte/.test(texto)) return 'arte'
  if (/copy|roteiro|conteúdo|conteudo|correç|revis/.test(texto)) return 'texto'
  if (/radar|miner|explor|sinal/.test(texto)) return 'radar'
  if (/anal|métrica|metrica/.test(texto)) return 'metricas'
  if (/qa|qualidade|fiscal|guard/.test(texto)) return 'qualidade'
  if (/public|envio|anúncio|anuncio|gestor/.test(texto)) return 'envio'
  return 'cafe'
}

function execucaoParada(ficha: PixelAgent): AgenteVivo {
  return {
    id: ficha.id,
    nome: ficha.nome,
    identidade: ficha.id,
    papel: ficha.papel,
    descricao: ficha.descricao,
    tipo: 'catálogo',
    estado: 'parado',
    fase: ficha.área,
    etapa: ficha.descricao || ficha.papel,
    ferramenta: null,
    arquivo: 'catálogo operacional',
  }
}

function criarVisual(execucao: AgenteVivo, ficha: PixelAgent | undefined, squad: PixelAgentSquad, ordem: number, temporaria: boolean, nomeForcado?: string): ExecucaoVisual {
  const squadCor = CORES_SQUAD.get(squad) || '#7bcaad'
  const ehChefe = ficha ? ['luana', 'renato', 'bia'].includes(ficha.id) : false
  const corRoupa = ehChefe ? ficha?.cor || squadCor : squadCor
  const semente = hashTexto(`${ficha?.id || execucao.id}:${ordem}`)
  const nome = nomeForcado || nomeLegivelDaExecucao(execucao, ficha)
  return {
    chave: temporaria || execucao.estado !== 'parado' ? chaveAgente(execucao.dono, execucao.id) : ficha?.id || execucao.id,
    animacaoChave: ficha && !temporaria ? `catalogo:${ficha.id}` : `temporario:${chaveAgente(execucao.dono, execucao.id)}`,
    execucao,
    ficha,
    nome,
    rotulos: rotulosDaMesa(nome).map((rotulo) => rotulo.toUpperCase()),
    squad,
    squadNome: NOMES_SQUAD.get(squad) || squad.toUpperCase(),
    cor: corRoupa,
    corEscura: escurecer(corRoupa),
    destaque: ficha?.cor || squadCor,
    cabelo: CABELOS[semente % CABELOS.length],
    pele: PELES[Math.floor(semente / 7) % PELES.length],
    acessorio: Math.floor(semente / 13) % 5,
    objeto: objetoDaFuncao(ficha, execucao),
    ativa: execucao.estado === 'trabalhando',
    temporaria,
    ordem,
  }
}

/** Materializa o catálogo inteiro; execuções paralelas viram extras temporários na ilha. */
export function montarExecucoesVisuais(agentes: AgenteVivo[], catalogo: PixelAgent[]): ExecucaoVisual[] {
  const runtimes = agentes.filter((execucao, indice, todos) => {
    const chave = chaveAgente(execucao.dono, execucao.id)
    return todos.findIndex((item) => chaveAgente(item.dono, item.id) === chave) === indice
  })
  const porFicha = new Map<string, AgenteVivo[]>()
  const semFicha: AgenteVivo[] = []
  runtimes.forEach((runtime) => {
    const ficha = resolverAgenteNoCatalogo(runtime, catalogo)
    if (!ficha) { semFicha.push(runtime); return }
    porFicha.set(ficha.id, [...(porFicha.get(ficha.id) || []), runtime])
  })

  const visuais: ExecucaoVisual[] = []
  catalogo.forEach((ficha) => {
    const execucoes = porFicha.get(ficha.id) || []
    const squadVisual = ['luana', 'renato', 'bia'].includes(ficha.id) ? 'coordenação' : ficha.squad
    visuais.push(criarVisual(execucoes[0] || execucaoParada(ficha), ficha, squadVisual, visuais.length, false, ficha.nome))
    execucoes.slice(1).forEach((execucao, indice) => {
      visuais.push(criarVisual(execucao, ficha, squadVisual, visuais.length, true, `${ficha.nome} · extra ${indice + 2}`))
    })
  })
  semFicha.forEach((execucao) => visuais.push(criarVisual(execucao, undefined, squadDaExecucao(execucao, catalogo), visuais.length, true)))
  return visuais
}

/** Layout compacto em até três colunas; o enquadramento padrão considera largura e altura. */
export function calcularLayoutSala(execucoes: ExecucaoVisual[], _compacto = false): LayoutSala {
  const grupos = new Map<PixelAgentSquad, ExecucaoVisual[]>()
  execucoes.forEach((execucao) => grupos.set(execucao.squad, [...(grupos.get(execucao.squad) || []), execucao]))
  const ordemSquads = PIXEL_AGENT_SQUADS.map((squad) => squad.id).filter((id) => grupos.has(id))
  const colunasIlhas = Math.max(1, Math.min(3, ordemSquads.length))
  const larguraIlha = 282
  const margemX = 24
  const vaoX = 18
  const largura = margemX * 2 + colunasIlhas * larguraIlha + (colunasIlhas - 1) * vaoX
  const cursoresY = Array.from({ length: colunasIlhas }, () => 90)
  const ilhas: IlhaVisual[] = []
  const mesas: MesaVisual[] = []

  ordemSquads.forEach((squad) => {
    const lista = grupos.get(squad) || []
    const coluna = squad === 'coordenação' && colunasIlhas === 3 ? 1 : cursoresY.indexOf(Math.min(...cursoresY))
    const colunasMesa = Math.min(4, Math.max(1, lista.length))
    const linhasMesa = Math.ceil(lista.length / colunasMesa)
    const alturaIlha = 42 + linhasMesa * 73
    const x = margemX + coluna * (larguraIlha + vaoX)
    const y = cursoresY[coluna]
    const mesasIlha: MesaVisual[] = []
    lista.forEach((execucao, posicao) => {
      const colunaMesa = posicao % colunasMesa
      const linhaMesa = Math.floor(posicao / colunasMesa)
      const intervalo = larguraIlha / colunasMesa
      const mesa: MesaVisual = { execucao, x: x + intervalo * (colunaMesa + 0.5), y: y + 49 + linhaMesa * 73, descanso: { x: 0, y: 0 } }
      mesasIlha.push(mesa); mesas.push(mesa)
    })
    ilhas.push({ squad, nome: lista[0]?.squadNome || squad.toUpperCase(), cor: CORES_SQUAD.get(squad) || '#7bcaad', x, y, largura: larguraIlha, altura: alturaIlha, mesas: mesasIlha })
    cursoresY[coluna] += alturaIlha + 16
  })

  const descansoY = Math.max(...cursoresY, 280) + 8
  const porLinha = Math.max(8, Math.floor((largura - 70) / 34))
  mesas.forEach((mesa, indice) => {
    const linha = Math.floor(indice / porLinha)
    const itensNaLinha = Math.min(porLinha, mesas.length - linha * porLinha)
    const intervalo = Math.min(34, (largura - 76) / Math.max(1, itensNaLinha))
    const inicio = (largura - intervalo * (itensNaLinha - 1)) / 2
    mesa.descanso = { x: inicio + (indice % porLinha) * intervalo, y: descansoY + 36 + linha * 35 }
  })
  const linhasDescanso = Math.max(1, Math.ceil(mesas.length / porLinha))
  return { largura, altura: descansoY + 63 + linhasDescanso * 35, corredorX: largura / 2, descansoY, ilhas, mesas }
}

function alvoDaExecucao(execucao: ExecucaoVisual): 'trabalhando' | 'silencioso' | 'parado' {
  if (execucao.execucao.estado === 'trabalhando') return 'trabalhando'
  if (execucao.execucao.estado === 'silencioso') return 'silencioso'
  return 'parado'
}

function rotuloFase(fase: FaseBoneco | undefined, ativa: boolean) {
  if (!fase) return ativa ? 'Digitando' : 'No descanso'
  const rotulos: Record<FaseBoneco, string> = {
    descanso: 'No descanso', caminhando_para_mesa: 'A caminho da mesa', sentando: 'Sentando', trabalhando: 'Digitando', silencioso: 'Parado na mesa', levantando: 'Levantando', caminhando_para_descanso: 'Indo descansar',
  }
  return rotulos[fase]
}

function poseDoEstado(estado: EstadoAnimacaoBoneco, corredorX: number) {
  const sentado = estado.fase === 'trabalhando' || estado.fase === 'silencioso' || estado.fase === 'descanso'
    ? 1 : estado.fase === 'sentando' ? estado.progressoFase : estado.fase === 'levantando' ? 1 - estado.progressoFase : 0
  return { x: estado.x + corredorX, y: estado.y, sentado, andando: estado.fase === 'caminhando_para_mesa' || estado.fase === 'caminhando_para_descanso', fase: estado.fase }
}

export function PixelOffice({ agentes, catalogo = PIXEL_AGENTS, aoSelecionarAgente, agenteSelecionadoId, soAtivos = false, aoAlternarSoAtivos }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const palcoRef = useRef<HTMLDivElement | null>(null)
  const hitsRef = useRef<Array<{ chave: string; x: number; y: number; largura: number; altura: number }>>([])
  const animacoesRef = useRef(new Map<string, EstadoAnimacaoBoneco>())
  const fasesRef = useRef(new Map<string, FaseBoneco>())
  const tempoRef = useRef(0)
  const zoomAutomaticoRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [pausado, setPausado] = useState(false)
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  const [relogioDetalhe, setRelogioDetalhe] = useState(0)
  const { statusLeitura, recebidoEm, falhouHaSegundos, erro: erroSonda } = useAgentesVivos()

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzirMovimento(media.matches)
    atualizar(); media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])

  const todasExecucoes = useMemo(() => montarExecucoesVisuais(agentes, catalogo), [agentes, catalogo])
  const execucoesVisiveis = useMemo(() => soAtivos ? todasExecucoes.filter((execucao) => execucao.ativa) : todasExecucoes, [soAtivos, todasExecucoes])
  const layout = useMemo(() => calcularLayoutSala(execucoesVisiveis), [execucoesVisiveis])
  const totalAtivos = todasExecucoes.filter((execucao) => execucao.ativa).length
  const totalFixos = todasExecucoes.filter((execucao) => !execucao.temporaria).length
  const totalExtras = todasExecucoes.filter((execucao) => execucao.temporaria).length
  const selecionada = todasExecucoes.find((execucao) => execucao.chave === agenteSelecionadoId) || execucoesVisiveis[0]
  const faseSelecionada = selecionada ? fasesRef.current.get(selecionada.animacaoChave) : undefined
  const squadsVisiveis = useMemo(() => PIXEL_AGENT_SQUADS.filter((squad) => layout.ilhas.some((ilha) => ilha.squad === squad.id)), [layout.ilhas])

  useEffect(() => {
    const palco = palcoRef.current
    if (!palco) return
    const ajustar = () => {
      const larguraDisponivel = Math.max(260, palco.clientWidth - 2)
      const alturaDisponivel = Math.max(300, palco.clientHeight - 2)
      const automatico = limitar(Math.min(larguraDisponivel / layout.largura, alturaDisponivel / layout.altura) * 0.985, ZOOM_MIN, 1)
      zoomAutomaticoRef.current = automatico; setZoom(automatico)
    }
    ajustar()
    const observador = new ResizeObserver(ajustar); observador.observe(palco)
    return () => observador.disconnect()
  }, [layout.altura, layout.largura])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let quadro = 0
    let anterior = performance.now()
    let ultimoDetalhe = 0
    let ativo = true

    const poligono = (pontos: number[][], preenchimento: string) => {
      ctx.fillStyle = preenchimento; ctx.beginPath()
      pontos.forEach((ponto, indice) => indice ? ctx.lineTo(ponto[0], ponto[1]) : ctx.moveTo(ponto[0], ponto[1]))
      ctx.closePath(); ctx.fill()
    }
    const bloco = (x: number, y: number, largura: number, profundidade: number, altura: number, topo: string, frente: string, lado: string) => {
      const a = [x - largura / 2 - profundidade * 0.15, y - profundidade * 0.32 - altura]
      const b = [x + largura / 2 - profundidade * 0.15, y - profundidade * 0.32 - altura]
      const e = [x + largura / 2 + profundidade * 0.15, y + profundidade * 0.32 - altura]
      const f = [x - largura / 2 + profundidade * 0.15, y + profundidade * 0.32 - altura]
      poligono([f, e, [e[0], e[1] + altura], [f[0], f[1] + altura]], frente)
      poligono([b, e, [e[0], e[1] + altura], [b[0], b[1] + altura]], lado)
      poligono([a, b, e, f], topo)
    }
    const texto = (valor: string, x: number, y: number, tamanho: number, cor = '#d6e4da', alinhamento: CanvasTextAlign = 'center', peso = 500) => {
      ctx.fillStyle = cor; ctx.textAlign = alinhamento; ctx.font = `${peso} ${tamanho}px monospace`; ctx.fillText(valor, x, y)
    }
    const cadeira = (x: number, y: number) => {
      bloco(x, y, 18, 17, 5, '#5a777a', '#31484f', '#263c43'); bloco(x, y + 5, 19, 4, 16, '#779295', '#405d65', '#2c474f')
    }
    const desenharObjeto = (mesa: MesaVisual) => {
      const { x, y, execucao } = mesa; const ox = x + 17; const oy = y - 6; ctx.fillStyle = execucao.destaque
      if (execucao.objeto === 'radar') { ctx.beginPath(); ctx.arc(ox, oy - 4, 4, 0, Math.PI * 2); ctx.strokeStyle = execucao.destaque; ctx.lineWidth = 2; ctx.stroke(); ctx.fillRect(ox + 3, oy, 6, 2) }
      else if (execucao.objeto === 'qualidade') texto('✓', ox, oy, 9, execucao.destaque, 'center', 900)
      else if (execucao.objeto === 'arte') { ctx.fillRect(ox - 6, oy - 8, 5, 5); ctx.fillStyle = '#facc15'; ctx.fillRect(ox, oy - 8, 5, 5); ctx.fillStyle = '#38bdf8'; ctx.fillRect(ox - 3, oy - 2, 5, 5) }
      else if (execucao.objeto === 'texto') { ctx.save(); ctx.translate(ox, oy - 3); ctx.rotate(-0.55); ctx.fillRect(-1, -7, 3, 13); ctx.restore() }
      else if (execucao.objeto === 'metricas') { ctx.fillRect(ox - 6, oy - 3, 3, 5); ctx.fillRect(ox - 1, oy - 7, 3, 9); ctx.fillRect(ox + 4, oy - 11, 3, 13) }
      else if (execucao.objeto === 'envio') poligono([[ox - 7, oy - 7], [ox + 7, oy - 3], [ox - 4, oy + 2]], execucao.destaque)
      else if (execucao.objeto === 'codigo') texto('</>', ox, oy - 1, 5.5, execucao.destaque, 'center', 800)
      else { ctx.fillRect(ox - 4, oy - 7, 7, 7); ctx.fillRect(ox + 3, oy - 6, 3, 4) }
    }
    const desenharMesa = (mesa: MesaVisual) => {
      const { x, y, execucao } = mesa
      ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.ellipse(x + 3, y + 14, 29, 15, 0, 0, Math.PI * 2); ctx.fill()
      bloco(x - 18, y + 3, 5, 6, 19, '#d6b181', '#705037', '#58422f'); bloco(x + 18, y + 4, 5, 6, 19, '#d6b181', '#705037', '#58422f')
      bloco(x, y, 48, 27, 6, '#ceac7b', '#9a7650', '#755435'); bloco(x - 3, y - 8, 23, 4, 20, '#516e72', '#1b303b', '#10232b')
      ctx.fillStyle = execucao.ativa ? '#163d48' : '#112328'; ctx.fillRect(x - 13, y - 27, 20, 13)
      if (execucao.ativa) { ctx.shadowColor = execucao.cor; ctx.shadowBlur = 8; ctx.fillStyle = execucao.cor; ctx.fillRect(x - 10, y - 24, 12, 2); ctx.shadowBlur = 0; ctx.fillStyle = '#82aaa5'; ctx.fillRect(x - 10, y - 20, 8, 1) }
      bloco(x - 2, y + 4, 17, 8, 2, '#c1cfb9', '#7a8d84', '#4d655f'); desenharObjeto(mesa); cadeira(x, y + 24)
      execucao.rotulos.forEach((rotulo, indice) => texto(rotulo, x, y + 42 + indice * 7, 5.8, indice === 0 ? '#f4ead0' : '#c7d5cf', 'center', 700))
      if (execucao.temporaria) texto('+ TEMP', x, y + 57, 5.2, '#f7cb73', 'center', 800)
    }
    const desenharSala = () => {
      const { largura, altura } = layout
      ctx.fillStyle = '#183237'; ctx.fillRect(0, 0, largura, altura); ctx.fillStyle = '#244249'; ctx.fillRect(8, 10, largura - 16, 62)
      ctx.fillStyle = '#2b4a4d'; ctx.fillRect(10, 11, largura - 20, 3)
      for (let x = 18; x < largura; x += 43) { ctx.fillStyle = '#1f393e'; ctx.fillRect(x, 17, 1, 50) }
      texto('G4ST4OVIB3', largura / 2, 38, 16, '#dfd6b4', 'center', 900); texto('TODOS OS AGENTES · CADA SQUAD NA SUA ILHA', largura / 2, 55, 6.5, '#a9bbb0', 'center', 650)
      ctx.fillStyle = '#947951'; ctx.fillRect(8, 72, largura - 16, altura - 80)
      for (let y = 72; y < altura - 7; y += 18) { ctx.fillStyle = Math.round(y / 18) % 2 ? '#a78b60' : '#aa916c'; ctx.fillRect(10, y, largura - 20, 16); ctx.fillStyle = '#846c49'; for (let x = 10 + (Math.round(y / 18) % 2) * 27; x < largura - 10; x += 54) ctx.fillRect(x, y, 1, 16) }
      layout.ilhas.forEach((ilha) => {
        ctx.fillStyle = rgba(ilha.cor, 0.23); ctx.fillRect(ilha.x, ilha.y, ilha.largura, ilha.altura); ctx.strokeStyle = rgba(ilha.cor, 0.82); ctx.lineWidth = 1; ctx.strokeRect(ilha.x + 0.5, ilha.y + 0.5, ilha.largura - 1, ilha.altura - 1)
        ctx.fillStyle = ilha.cor; ctx.fillRect(ilha.x, ilha.y, ilha.largura, 24); texto(ilha.nome, ilha.x + 9, ilha.y + 16, 7.2, '#081819', 'left', 900); texto(`${ilha.mesas.length}`, ilha.x + ilha.largura - 9, ilha.y + 16, 7, '#081819', 'right', 900)
      })
      layout.mesas.forEach(desenharMesa)
      ctx.fillStyle = '#214747'; ctx.fillRect(18, layout.descansoY, largura - 36, layout.altura - layout.descansoY - 10); ctx.fillStyle = '#496b63'; ctx.fillRect(21, layout.descansoY - 2, largura - 42, 5); texto('DESCANSO', largura - 30, layout.descansoY + 17, 6.5, '#e0d5af', 'right', 800)
    }
    const desenharBoneco = (mesa: MesaVisual, estadoAnimacao: EstadoAnimacaoBoneco) => {
      const personagem = mesa.execucao; const pose = poseDoEstado(estadoAnimacao, layout.corredorX); const selecionado = personagem.chave === agenteSelecionadoId
      const passo = pose.andando ? Math.sin(tempoRef.current * 13 + personagem.ordem) * 2.5 : 0; const flutuar = pose.andando ? Math.abs(Math.sin(tempoRef.current * 13 + personagem.ordem)) * 0.7 : 0; const deslocamento = pose.sentado * 5
      const digitando = pose.fase === 'trabalhando' && !reduzirMovimento ? Math.sin(tempoRef.current * 17 + personagem.ordem) * 1.35 : 0
      ctx.save(); ctx.translate(pose.x, pose.y - flutuar); ctx.fillStyle = '#12252770'; ctx.beginPath(); ctx.ellipse(0, 3, 12, 4, 0, 0, Math.PI * 2); ctx.fill()
      if (selecionado) { ctx.strokeStyle = '#fff1b2'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 3, 15, 6, 0, 0, Math.PI * 2); ctx.stroke() }
      bloco(-4, 1 + passo, 5, 7, pose.sentado ? 6 : 12, '#607783', '#314653', '#213541'); bloco(4, 1 - passo, 5, 7, pose.sentado ? 6 : 12, '#607783', '#314653', '#213541')
      bloco(-4, 3 + passo, 6, 8, 3, '#d5d9c8', '#8e9b93', '#64796c'); bloco(4, 3 - passo, 6, 8, 3, '#d5d9c8', '#8e9b93', '#64796c'); bloco(0, -10 + deslocamento, 15, 11, 14, personagem.cor, personagem.corEscura, personagem.corEscura)
      for (const lado of [-1, 1]) { const bracoY = pose.sentado ? -17 + deslocamento + digitando * lado : -8 + passo * lado; bloco(lado * 9, bracoY, 4, 8, pose.sentado ? 8 : 11, personagem.cor, personagem.corEscura, personagem.corEscura); bloco(lado * 9, bracoY - 1, 4, 5, 3, personagem.pele, escurecer(personagem.pele, 0.83), '#9a684c') }
      bloco(0, -25 + deslocamento, 13, 12, 12, personagem.pele, escurecer(personagem.pele, 0.83), '#9a684c'); bloco(0, -33 + deslocamento, 14, 13, 6, personagem.cabelo, escurecer(personagem.cabelo, 0.68), escurecer(personagem.cabelo, 0.58))
      if (personagem.acessorio === 0) { ctx.fillStyle = personagem.destaque; ctx.fillRect(-9, -31 + deslocamento, 18, 2) }
      if (personagem.acessorio === 1) { ctx.strokeStyle = '#d8efe7'; ctx.lineWidth = 1; ctx.strokeRect(-6, -26 + deslocamento, 5, 3); ctx.strokeRect(1, -26 + deslocamento, 5, 3) }
      if (personagem.acessorio === 2) { ctx.fillStyle = personagem.destaque; ctx.fillRect(6, -23 + deslocamento, 3, 7) }
      if (personagem.acessorio === 3) { ctx.fillStyle = '#e8d8a9'; ctx.fillRect(-7, -36 + deslocamento, 14, 2) }
      if (personagem.acessorio === 4) { ctx.fillStyle = personagem.destaque; ctx.fillRect(-2, -12 + deslocamento, 4, 5) }
      if (personagem.ativa) { ctx.fillStyle = '#d4f79f'; ctx.fillRect(11, -28 + deslocamento, 3, 3) }
      if (selecionado) texto('▼', 0, -45 + deslocamento, 8, '#fff0ae')
      if (pose.fase === 'trabalhando' && personagem.execucao.ferramenta) { const ferramenta = formatarRotulo(personagem.execucao.ferramenta, '', 13); const larguraBalao = Math.max(34, ferramenta.length * 4.4 + 8); ctx.fillStyle = '#102529ee'; ctx.fillRect(-larguraBalao / 2, -51 + deslocamento, larguraBalao, 12); ctx.fillStyle = personagem.cor; ctx.fillRect(-larguraBalao / 2, -51 + deslocamento, 2, 12); texto(ferramenta, 0, -43 + deslocamento, 5.2, '#e8f0ec', 'center', 700) }
      ctx.restore(); hitsRef.current.push({ chave: personagem.chave, x: pose.x - 18, y: pose.y - 58, largura: 36, altura: 66 })
    }
    const estadoDaMesa = (mesa: MesaVisual, agoraMs: number) => {
      const posMesa = { x: mesa.x - layout.corredorX, y: mesa.y + 24 }; const posDescanso = { x: mesa.descanso.x - layout.corredorX, y: mesa.descanso.y }; const alvo = alvoDaExecucao(mesa.execucao)
      const anteriorEstado = animacoesRef.current.get(mesa.execucao.animacaoChave)
      const proximo = anteriorEstado ? avancarEstadoAnimacao(anteriorEstado, alvo, posMesa, posDescanso, agoraMs, reduzirMovimento, mesa.execucao.execucao.ferramenta) : criarEstadoInicialBoneco(mesa.execucao.animacaoChave, alvo, posMesa, posDescanso, agoraMs, mesa.execucao.execucao.ferramenta)
      animacoesRef.current.set(mesa.execucao.animacaoChave, proximo); fasesRef.current.set(mesa.execucao.animacaoChave, proximo.fase); return proximo
    }
    const desenhar = (agora: number) => {
      if (!ativo) return
      const delta = Math.min(60, agora - anterior); anterior = agora
      if (!pausado && !document.hidden) tempoRef.current += delta / 1000
      const agoraAnimacaoMs = tempoRef.current * 1000
      if (agora - ultimoDetalhe > 400) { ultimoDetalhe = agora; setRelogioDetalhe((valor) => valor + 1) }
      const dpr = Math.min(window.devicePixelRatio || 1, 2); const larguraCss = Math.round(layout.largura * zoom); const alturaCss = Math.round(layout.altura * zoom)
      if (canvas.width !== Math.round(larguraCss * dpr) || canvas.height !== Math.round(alturaCss * dpr)) { canvas.width = Math.round(larguraCss * dpr); canvas.height = Math.round(alturaCss * dpr); canvas.style.width = `${larguraCss}px`; canvas.style.height = `${alturaCss}px` }
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0); ctx.clearRect(0, 0, layout.largura, layout.altura); desenharSala(); hitsRef.current = []
      const estados = layout.mesas.map((mesa) => ({ mesa, estado: estadoDaMesa(mesa, agoraAnimacaoMs) })); estados.sort((a, b) => a.estado.y - b.estado.y).forEach(({ mesa, estado }) => desenharBoneco(mesa, estado))
      canvas.dataset.officeActiveAway = String(estados.filter(({ mesa, estado }) => mesa.execucao.ativa && estado.fase !== 'trabalhando').length); canvas.dataset.officeWorking = String(estados.filter(({ estado }) => estado.fase === 'trabalhando').length); canvas.dataset.officeAgents = String(estados.length)
      quadro = requestAnimationFrame(desenhar)
    }
    quadro = requestAnimationFrame(desenhar)
    return () => { ativo = false; cancelAnimationFrame(quadro) }
  }, [agenteSelecionadoId, layout, pausado, reduzirMovimento, zoom])

  const selecionar = (chave: string) => aoSelecionarAgente?.(chave)
  const tratarClique = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = evento.currentTarget.getBoundingClientRect(); const x = (evento.clientX - rect.left) / zoom; const y = (evento.clientY - rect.top) / zoom
    const hit = [...hitsRef.current].reverse().find((item) => x >= item.x && x <= item.x + item.largura && y >= item.y && y <= item.y + item.altura); if (hit) selecionar(hit.chave)
  }
  const tratarTeclado = (evento: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '].includes(evento.key) || execucoesVisiveis.length === 0) return
    evento.preventDefault(); let indice = execucoesVisiveis.findIndex((execucao) => execucao.chave === agenteSelecionadoId); if (indice < 0) indice = 0
    if (evento.key.startsWith('Arrow')) { const direcao = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 1; indice = (indice + direcao + execucoesVisiveis.length) % execucoesVisiveis.length }
    selecionar(execucoesVisiveis[indice].chave)
  }

  const descricaoSonda = statusLeitura === 'confirmado' ? `Leitura ao vivo${recebidoEm ? ` · ${Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s` : ''}` : statusLeitura === 'consultando' ? 'Consultando dados vivos' : statusLeitura === 'leitura_vencida' ? `Leitura vencida · ${falhouHaSegundos ?? 0}s` : erroSonda || 'Sonda indisponível'

  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-[#0a151a] p-3 text-[#e8f0ec] sm:p-5 font-sans" data-testid="pixel-office">
      <header className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-[10px] tracking-[0.17em] text-[#b1c2bd]">G4ST4OVIB3 / PAINEL OS</div><h2 className="mt-1 text-[23px] font-bold leading-none tracking-[-0.04em] sm:text-2xl">O escritório inteiro, ao vivo.</h2></div><span className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] sm:text-[10px] ${statusLeitura === 'confirmado' ? 'border-[#63735e] text-[#c6e98a]' : 'border-[#785f45] text-[#e8c575]'}`} title={descricaoSonda}>{statusLeitura === 'confirmado' ? 'AO VIVO' : 'SONDA'}</span></header>
      <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={() => aoAlternarSoAtivos?.(!soAtivos)} aria-pressed={soAtivos} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold ${soAtivos ? 'border-[#c1ec86] bg-[#c1ec86] text-[#1a2a1b]' : 'border-[#42534f] bg-[#162a2a] text-[#e7f0e7]'}`}>Só ativos</button>
        <button type="button" onClick={() => setPausado((valor) => !valor)} aria-pressed={pausado} className="min-h-11 rounded-lg border border-[#42534f] bg-[#162a2a] px-3 text-xs font-semibold text-[#e7f0e7]">{pausado ? 'Retomar' : 'Pausar'}</button>
        <div className="flex items-center overflow-hidden rounded-lg border border-[#42534f] bg-[#162a2a]"><button type="button" aria-label="Afastar sala" onClick={() => setZoom((valor) => limitar(valor - 0.1, ZOOM_MIN, ZOOM_MAX))} className="min-h-11 min-w-10 px-2 text-base text-[#e7f0e7]">−</button><button type="button" title="Repor enquadramento" onClick={() => setZoom(zoomAutomaticoRef.current)} className="min-h-11 border-x border-[#42534f] px-2 font-mono text-[10px] text-[#aebfb8]">{Math.round(zoom * 100)}%</button><button type="button" aria-label="Aproximar sala" onClick={() => setZoom((valor) => limitar(valor + 0.1, ZOOM_MIN, ZOOM_MAX))} className="min-h-11 min-w-10 px-2 text-base text-[#e7f0e7]">+</button></div>
        <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-[#aebfb8] sm:text-[11px]"><b className="text-[#c1ec86]">{totalAtivos}</b> trabalhando · {totalFixos} fixos{totalExtras ? ` + ${totalExtras} extras` : ''}</span>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_270px] xl:gap-4">
        <section className="relative min-w-0 overflow-hidden rounded-xl border border-[#405655] bg-[#163032]" aria-label="Sala voxel interativa">
          <span className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[9px] tracking-[0.12em] text-[#afc8c4]">VISÃO GERAL / CABER TUDO</span>
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 max-w-[58%] rounded-md border border-[#526865] bg-[#0d1e22e8] p-1.5 shadow-lg" aria-label="Legenda de cores dos squads" data-testid="office-squad-legend"><div className="mb-1 font-mono text-[7px] font-bold tracking-[0.12em] text-[#c8d8d2] sm:text-[8px]">CORES DOS SQUADS</div><div className="grid grid-cols-2 gap-x-2 gap-y-0.5">{squadsVisiveis.map((squad) => <span key={squad.id} className="flex min-w-0 items-center gap-1 font-mono text-[6px] text-[#c5d2ce] sm:text-[7px]"><i className="size-1.5 shrink-0 rounded-[1px]" style={{ backgroundColor: squad.cor }} /><b className="truncate font-medium">{squad.nome}</b></span>)}</div></div>
          <div ref={palcoRef} className="h-[420px] w-full overflow-auto overscroll-contain sm:h-[600px]" data-testid="office-scroll-room">{execucoesVisiveis.length > 0 ? <canvas ref={canvasRef} tabIndex={0} role="group" aria-label={`Escritório com ${execucoesVisiveis.length} agentes. Use as setas para escolher ou toque um boneco.`} onClick={tratarClique} onKeyDown={tratarTeclado} className="block max-w-none cursor-pointer touch-pan-x touch-pan-y focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#e8c575]" /> : <div className="flex h-full min-h-[360px] items-center justify-center p-6 text-center text-sm text-[#aebfb8]">Nenhum agente está trabalhando agora.</div>}</div>
        </section>
        <aside className="min-w-0 self-start rounded-lg border-t-2 border-[#c1ec86] bg-[#142426] p-3 sm:p-4 xl:sticky xl:top-3" aria-label="Detalhe do agente">
          {selecionada ? <><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-semibold leading-5 sm:text-base" data-testid="office-agent-name">{selecionada.nome}</h3><p className="mt-0.5 font-mono text-[9px] text-[#718a82]">{selecionada.squadNome}{selecionada.temporaria ? ' · TEMPORÁRIO' : ' · MESA FIXA'}</p></div><span className="shrink-0 font-mono text-[10px] text-[#c1ec86] sm:text-[11px]">{rotuloFase(faseSelecionada, selecionada.ativa)}</span></div><p className="my-2 break-words text-[13px] leading-5 text-[#d4e4dc] sm:my-3 sm:text-sm">{selecionada.execucao.tarefa || selecionada.execucao.descricao || selecionada.execucao.etapa || selecionada.ficha?.papel || 'Sem tarefa no momento'}</p><dl className="grid grid-cols-2 gap-2"><div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1]">Ferramenta</dt><dd className="mt-1 truncate text-xs" title={selecionada.execucao.ferramenta || '—'}>{selecionada.execucao.ferramenta || '—'}</dd></div><div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1]">Estado</dt><dd className="mt-1 truncate text-xs">{selecionada.ativa ? 'Trabalhando' : 'Parado'}</dd></div><div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1]">Modelo</dt><dd className="mt-1 truncate text-xs" title={selecionada.execucao.modelo_legivel || selecionada.execucao.modelo || '—'}>{selecionada.execucao.modelo_legivel || selecionada.execucao.modelo || '—'}</dd></div><div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1]">Função</dt><dd className="mt-1 truncate text-xs" title={selecionada.ficha?.papel || selecionada.execucao.papel || '—'}>{selecionada.ficha?.papel || selecionada.execucao.papel || '—'}</dd></div></dl></> : <p className="text-sm text-[#9cb0a9]">Selecione um boneco para ver tarefa, ferramenta e função.</p>}
          <p className="mt-3 font-mono text-[9px] leading-4 text-[#869c94] sm:text-[10px]"><span className="text-[#c1ec86]">●</span> Trabalhando: vai à mesa uma vez e permanece digitando.<br />○ Parado: monitor apagado, sem ciclo automático.</p>
        </aside>
      </div>
      <footer className="mt-2 font-mono text-[9px] leading-4 text-[#839a90] sm:text-[10px]">{execucoesVisiveis.length} {execucoesVisiveis.length === 1 ? 'agente visível' : 'agentes visíveis'} · {layout.ilhas.length} ilhas · roupas e faixas por squad · padrão “caber tudo”.</footer>
      <div className="sr-only" role="region" aria-label="Lista acessível de agentes do escritório"><ul>{execucoesVisiveis.map((execucao) => <li key={execucao.animacaoChave}><button type="button" onClick={() => selecionar(execucao.chave)}>{execucao.nome} — {execucao.ativa ? 'trabalhando' : 'parado'} — {execucao.squadNome}</button></li>)}</ul></div>
      <span className="sr-only" aria-live="polite">{relogioDetalhe ? '' : ''}</span>
    </div>
  )
}
