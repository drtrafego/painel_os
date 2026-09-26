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

type FaseVisual = 'walkIn' | 'sit' | 'work' | 'stand' | 'walkOut' | 'rest'

interface ExecucaoVisual {
  chave: string
  execucao: AgenteVivo
  nome: string
  rotulos: string[]
  squad: PixelAgentSquad
  squadNome: string
  cor: string
  corEscura: string
  ativa: boolean
  ordem: number
}

interface MesaVisual {
  execucao: ExecucaoVisual
  x: number
  y: number
  descanso: { x: number; y: number }
}

interface IlhaVisual {
  squad: PixelAgentSquad
  nome: string
  cor: string
  x: number
  y: number
  largura: number
  altura: number
  mesas: MesaVisual[]
}

interface LayoutSala {
  largura: number
  altura: number
  corredorX: number
  descansoY: number
  ilhas: IlhaVisual[]
  mesas: MesaVisual[]
}

const ZOOM_MIN = 0.38
const ZOOM_MAX = 1.6
const DURACAO_CICLO_S = 15

const CORES_SQUAD = new Map(PIXEL_AGENT_SQUADS.map((squad) => [squad.id, squad.cor]))
const NOMES_SQUAD = new Map(PIXEL_AGENT_SQUADS.map((squad) => [squad.id, squad.nome]))

const rotuloFase: Record<FaseVisual, string> = {
  walkIn: 'A caminho',
  sit: 'Sentando',
  work: 'Digitando',
  stand: 'Levantando',
  walkOut: 'Indo descansar',
  rest: 'No descanso',
}

const limitar = (valor: number, minimo = 0, maximo = 1) => Math.min(maximo, Math.max(minimo, valor))
const misturar = (a: number, b: number, t: number) => a + (b - a) * t

function escurecer(hex: string) {
  const limpo = hex.replace('#', '')
  if (limpo.length !== 6) return '#42534f'
  const canais = [0, 2, 4].map((i) => Math.round(Number.parseInt(limpo.slice(i, i + 2), 16) * 0.58))
  return `#${canais.map((canal) => canal.toString(16).padStart(2, '0')).join('')}`
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

/** Nome de operação em primeiro plano; o identificador técnico fica só no detalhe. */
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
  if (tipo && !TIPOS_GENERICOS.has(execucao.tipo?.toLowerCase() || '')) {
    return tipo.charAt(0).toUpperCase() + tipo.slice(1)
  }

  return 'Agente sem identidade'
}

function rotulosDaMesa(nome: string) {
  if (nome.startsWith('Codex · ')) {
    const partes = nome.split(' · ')
    return [formatarRotulo(partes.slice(0, 2).join(' · '), '', 22), formatarRotulo(partes.slice(2).join(' · '), '', 22)]
  }
  return [formatarRotulo(nome, '', 20)]
}

export function montarExecucoesVisuais(agentes: AgenteVivo[], catalogo: PixelAgent[]): ExecucaoVisual[] {
  const chavesVistas = new Set<string>()
  return agentes.filter((execucao) => {
    const chave = chaveAgente(execucao.dono, execucao.id)
    if (chavesVistas.has(chave)) return false
    chavesVistas.add(chave)
    return true
  }).map((execucao, ordem) => {
    const squad = squadDaExecucao(execucao, catalogo)
    const ficha = resolverAgenteNoCatalogo(execucao, catalogo)
    const nome = nomeLegivelDaExecucao(execucao, ficha)
    const cor = ficha?.cor || CORES_SQUAD.get(squad) || '#7bcaad'
    return {
      chave: chaveAgente(execucao.dono, execucao.id),
      execucao,
      nome,
      rotulos: rotulosDaMesa(nome).map((rotulo) => rotulo.toUpperCase()),
      squad,
      squadNome: NOMES_SQUAD.get(squad) || squad.toUpperCase(),
      cor,
      corEscura: escurecer(cor),
      ativa: execucao.estado === 'trabalhando',
      ordem,
    }
  })
}

/** Um layout sem teto: cada execução ganha exatamente uma mesa e as linhas aumentam a sala. */
export function calcularLayoutSala(execucoes: ExecucaoVisual[], compacto = false): LayoutSala {
  const grupos = new Map<PixelAgentSquad, ExecucaoVisual[]>()
  execucoes.forEach((execucao) => grupos.set(execucao.squad, [...(grupos.get(execucao.squad) || []), execucao]))

  const ordemSquads = PIXEL_AGENT_SQUADS.map((squad) => squad.id).filter((id) => grupos.has(id))
  const largura = compacto ? 520 : 1040
  const margemX = compacto ? 30 : 55
  const vao = 34
  const larguraIlha = compacto ? largura - margemX * 2 : (largura - margemX * 2 - vao) / 2
  const ilhas: IlhaVisual[] = []
  const mesas: MesaVisual[] = []
  const cursoresY = compacto ? [158] : [158, 158]

  ordemSquads.forEach((squad) => {
    const lista = grupos.get(squad) || []
    const coluna = compacto ? 0 : cursoresY[0] <= cursoresY[1] ? 0 : 1
    const colunasMesa = lista.length === 1 ? 1 : lista.length <= 4 ? 2 : 3
    const linhasMesa = Math.ceil(lista.length / colunasMesa)
    const alturaIlha = 76 + linhasMesa * 112
    const x = margemX + coluna * (larguraIlha + vao)
    const y = cursoresY[coluna]
    const mesasIlha: MesaVisual[] = []

    lista.forEach((execucao, posicao) => {
      const colunaMesa = posicao % colunasMesa
      const linhaMesa = Math.floor(posicao / colunasMesa)
      const intervalo = larguraIlha / colunasMesa
      const mesa: MesaVisual = {
        execucao,
        x: x + intervalo * (colunaMesa + 0.5),
        y: y + 70 + linhaMesa * 112,
        descanso: { x: 0, y: 0 },
      }
      mesasIlha.push(mesa)
      mesas.push(mesa)
    })

    ilhas.push({
      squad,
      nome: lista[0]?.squadNome || squad.toUpperCase(),
      cor: CORES_SQUAD.get(squad) || lista[0]?.cor || '#7bcaad',
      x,
      y,
      largura: larguraIlha,
      altura: alturaIlha,
      mesas: mesasIlha,
    })
    cursoresY[coluna] += alturaIlha + 34
  })

  const descansoY = Math.max(...cursoresY, 340) + 28
  const porLinha = 12
  mesas.forEach((mesa, indice) => {
    const linha = Math.floor(indice / porLinha)
    const itensNaLinha = Math.min(porLinha, mesas.length - linha * porLinha)
    const intervalo = Math.min(74, (largura - 100) / Math.max(1, itensNaLinha))
    const inicio = (largura - intervalo * (itensNaLinha - 1)) / 2
    mesa.descanso = { x: inicio + (indice % porLinha) * intervalo, y: descansoY + 38 + linha * 55 }
  })
  const linhasDescanso = Math.max(1, Math.ceil(mesas.length / porLinha))

  return {
    largura,
    altura: descansoY + 88 + linhasDescanso * 55,
    corredorX: largura / 2,
    descansoY,
    ilhas,
    mesas,
  }
}

function faseDaExecucao(execucao: ExecucaoVisual, tempoS: number, reduzirMovimento: boolean): FaseVisual {
  if (!execucao.ativa) return 'rest'
  if (reduzirMovimento) return 'work'
  const local = ((tempoS + execucao.ordem * 2.5) % DURACAO_CICLO_S + DURACAO_CICLO_S) % DURACAO_CICLO_S
  if (local < 2.6) return 'walkIn'
  if (local < 3.1) return 'sit'
  if (local < 8.8) return 'work'
  if (local < 9.4) return 'stand'
  if (local < 12) return 'walkOut'
  return 'rest'
}

function pontoNoCaminho(pontos: Array<{ x: number; y: number }>, progresso: number) {
  const comprimentos = pontos.slice(1).map((ponto, indice) => Math.hypot(ponto.x - pontos[indice].x, ponto.y - pontos[indice].y))
  let distancia = limitar(progresso) * comprimentos.reduce((soma, atual) => soma + atual, 0)
  for (let i = 0; i < comprimentos.length; i += 1) {
    if (distancia <= comprimentos[i] || i === comprimentos.length - 1) {
      const trecho = comprimentos[i] === 0 ? 0 : limitar(distancia / comprimentos[i])
      return { x: misturar(pontos[i].x, pontos[i + 1].x, trecho), y: misturar(pontos[i].y, pontos[i + 1].y, trecho) }
    }
    distancia -= comprimentos[i]
  }
  return pontos[0]
}

function poseDaExecucao(mesa: MesaVisual, layout: LayoutSala, tempoS: number, reduzirMovimento: boolean) {
  const fase = faseDaExecucao(mesa.execucao, tempoS, reduzirMovimento)
  const local = ((tempoS + mesa.execucao.ordem * 2.5) % DURACAO_CICLO_S + DURACAO_CICLO_S) % DURACAO_CICLO_S
  const assento = { x: mesa.x, y: mesa.y + 36 }
  const caminho = [mesa.descanso, { x: layout.corredorX, y: mesa.descanso.y - 18 }, { x: layout.corredorX, y: assento.y }, assento]
  let posicao = fase === 'rest' ? mesa.descanso : assento
  let sentado = fase === 'work' ? 1 : fase === 'sit' ? limitar((local - 2.6) / 0.5) : fase === 'stand' ? 1 - limitar((local - 8.8) / 0.6) : 0
  if (fase === 'walkIn') posicao = pontoNoCaminho(caminho, local / 2.6)
  if (fase === 'walkOut') posicao = pontoNoCaminho([...caminho].reverse(), (local - 9.4) / 2.6)
  if (reduzirMovimento) sentado = mesa.execucao.ativa ? 1 : 0
  return { ...posicao, sentado, fase, andando: fase === 'walkIn' || fase === 'walkOut' }
}

export function PixelOffice({ agentes, catalogo = PIXEL_AGENTS, aoSelecionarAgente, agenteSelecionadoId, soAtivos = false, aoAlternarSoAtivos }: PixelOfficeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const palcoRef = useRef<HTMLDivElement | null>(null)
  const hitsRef = useRef<Array<{ chave: string; x: number; y: number; largura: number; altura: number }>>([])
  const tempoRef = useRef(0)
  const zoomAutomaticoRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [pausado, setPausado] = useState(false)
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  const [relogioDetalhe, setRelogioDetalhe] = useState(0)
  const [compacto, setCompacto] = useState(() => window.innerWidth < 650)
  const { statusLeitura, recebidoEm, falhouHaSegundos, erro: erroSonda } = useAgentesVivos()

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzirMovimento(media.matches)
    atualizar()
    media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])

  useEffect(() => {
    const atualizar = () => setCompacto(window.innerWidth < 650)
    window.addEventListener('resize', atualizar)
    return () => window.removeEventListener('resize', atualizar)
  }, [])

  const todasExecucoes = useMemo(() => montarExecucoesVisuais(agentes, catalogo), [agentes, catalogo])
  const execucoesVisiveis = useMemo(() => (soAtivos ? todasExecucoes.filter((execucao) => execucao.ativa) : todasExecucoes), [soAtivos, todasExecucoes])
  const layout = useMemo(() => calcularLayoutSala(execucoesVisiveis, compacto), [compacto, execucoesVisiveis])
  const totalAtivos = todasExecucoes.filter((execucao) => execucao.ativa).length
  const selecionada = todasExecucoes.find((execucao) => execucao.chave === agenteSelecionadoId) || execucoesVisiveis[0]
  const faseSelecionada = selecionada ? faseDaExecucao(selecionada, relogioDetalhe, reduzirMovimento) : 'rest'

  useEffect(() => {
    const palco = palcoRef.current
    if (!palco) return
    const ajustar = () => {
      const disponivel = Math.max(280, palco.clientWidth - 2)
      const automatico = limitar(disponivel / layout.largura, ZOOM_MIN, 1)
      zoomAutomaticoRef.current = automatico
      setZoom(automatico)
    }
    ajustar()
    const observador = new ResizeObserver(ajustar)
    observador.observe(palco)
    return () => observador.disconnect()
  }, [layout.largura])

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
      ctx.fillStyle = preenchimento
      ctx.beginPath()
      pontos.forEach((ponto, indice) => (indice ? ctx.lineTo(ponto[0], ponto[1]) : ctx.moveTo(ponto[0], ponto[1])))
      ctx.closePath()
      ctx.fill()
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
      ctx.fillStyle = cor
      ctx.textAlign = alinhamento
      ctx.font = `${peso} ${tamanho}px monospace`
      ctx.fillText(valor, x, y)
    }
    const cadeira = (x: number, y: number) => {
      bloco(x, y, 27, 26, 9, '#5a777a', '#31484f', '#263c43')
      bloco(x, y + 9, 28, 6, 26, '#779295', '#405d65', '#2c474f')
    }
    const planta = (x: number, y: number) => {
      bloco(x, y, 19, 20, 18, '#859487', '#56665c', '#37483f')
      bloco(x - 4, y - 17, 21, 22, 20, '#8ab77a', '#567f4e', '#395c43')
      bloco(x + 7, y - 24, 14, 16, 20, '#9acb82', '#6a935c', '#456c49')
    }
    const desenharMesa = (mesa: MesaVisual) => {
      const { x, y, execucao } = mesa
      ctx.fillStyle = '#0003'
      ctx.beginPath()
      ctx.ellipse(x + 5, y + 20, 43, 23, 0, 0, Math.PI * 2)
      ctx.fill()
      bloco(x - 25, y + 3, 7, 9, 28, '#d6b181', '#705037', '#58422f')
      bloco(x + 25, y + 5, 7, 9, 28, '#d6b181', '#705037', '#58422f')
      bloco(x, y, 68, 42, 9, '#ceac7b', '#9a7650', '#755435')
      bloco(x, y - 11, 33, 6, 30, '#516e72', '#1b303b', '#10232b')
      ctx.fillStyle = execucao.ativa ? '#193b45' : '#182b30'
      ctx.fillRect(x - 14, y - 38, 26, 19)
      for (let linha = 0; linha < 3; linha += 1) {
        ctx.fillStyle = execucao.ativa ? (linha === 0 ? execucao.cor : '#77a6a0') : '#385451'
        ctx.fillRect(x - 10, y - 34 + linha * 5, 14 - linha * 3, 2)
      }
      bloco(x, y + 5, 22, 12, 3, '#c1cfb9', '#7a8d84', '#4d655f')
      bloco(x + 25, y - 2, 7, 7, 10, execucao.cor, execucao.corEscura, '#475853')
      cadeira(x, y + 34)
      execucao.rotulos.forEach((rotulo, indice) => texto(rotulo, x, y + 62 + indice * 9, 7.5, indice === 0 ? '#e4dac1' : '#b9c9c0', 'center', 650))
    }
    const desenharSala = () => {
      const { largura, altura } = layout
      ctx.fillStyle = '#183237'
      ctx.fillRect(0, 0, largura, altura)
      ctx.fillStyle = '#244249'
      ctx.fillRect(10, 15, largura - 20, 106)
      ctx.fillStyle = '#2b4a4d'
      ctx.fillRect(12, 16, largura - 24, 4)
      for (let x = 20; x < largura; x += 48) {
        ctx.fillStyle = '#1f393e'
        ctx.fillRect(x, 23, 1, 91)
      }
      texto('G4ST4OVIB3', largura / 2, 57, 21, '#dfd6b4', 'center', 900)
      texto('casaldotrafego.com', largura / 2, 76, 9, '#a9bbb0', 'center', 650)
      ctx.fillStyle = '#947951'
      ctx.fillRect(10, 112, largura - 20, altura - 122)
      for (let y = 112; y < altura - 9; y += 22) {
        ctx.fillStyle = Math.round(y / 22) % 2 ? '#a78b60' : '#aa916c'
        ctx.fillRect(12, y, largura - 24, 20)
        ctx.fillStyle = '#846c49'
        for (let x = 12 + (Math.round(y / 22) % 2) * 30; x < largura - 12; x += 60) ctx.fillRect(x, y, 1, 20)
      }
      ctx.fillStyle = '#233f3c'
      ctx.fillRect(12, 111, 6, altura - 122)
      ctx.fillRect(largura - 18, 111, 6, altura - 122)
      poligono([[18, 112], [72, 112], [170, altura - 15], [65, altura - 15]], '#eedb9a13')
      layout.ilhas.forEach((ilha) => {
        ctx.fillStyle = '#314b4cbb'
        ctx.fillRect(ilha.x, ilha.y, ilha.largura, ilha.altura)
        ctx.fillStyle = ilha.cor
        ctx.fillRect(ilha.x, ilha.y, ilha.largura, 4)
        ctx.strokeStyle = '#172f31'
        ctx.lineWidth = 1
        ctx.strokeRect(ilha.x + 0.5, ilha.y + 0.5, ilha.largura - 1, ilha.altura - 1)
        texto(ilha.nome, ilha.x + 13, ilha.y + 23, 9, '#e7dec3', 'left', 750)
      })
      layout.mesas.forEach(desenharMesa)
      ctx.fillStyle = '#214747'
      ctx.fillRect(30, layout.descansoY, largura - 60, layout.altura - layout.descansoY - 18)
      ctx.fillStyle = '#496b63'
      ctx.fillRect(33, layout.descansoY - 3, largura - 66, 7)
      texto('DESCANSO', largura - 48, layout.descansoY + 25, 8, '#e0d5af', 'right', 700)
      planta(41, layout.descansoY - 3)
      planta(largura - 39, 111)
    }
    const desenharBoneco = (mesa: MesaVisual) => {
      const personagem = mesa.execucao
      const pose = poseDaExecucao(mesa, layout, tempoRef.current, reduzirMovimento)
      const selecionado = personagem.chave === agenteSelecionadoId
      const passo = pose.andando ? Math.sin(tempoRef.current * 13 + personagem.ordem) * 4 : 0
      const flutuar = pose.andando ? Math.abs(Math.sin(tempoRef.current * 13 + personagem.ordem)) * 0.9 : 0
      const deslocamento = pose.sentado * 7
      ctx.save()
      ctx.translate(pose.x, pose.y - flutuar)
      ctx.fillStyle = '#12252760'
      ctx.beginPath()
      ctx.ellipse(0, 4, 17, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      if (selecionado) {
        ctx.strokeStyle = '#fff1b2'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(0, 5, 21, 8, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      bloco(-6, 1 + passo, 8, 10, pose.sentado ? 9 : 17, '#607783', '#314653', '#213541')
      bloco(6, 1 - passo, 8, 10, pose.sentado ? 9 : 17, '#607783', '#314653', '#213541')
      bloco(-6, 4 + passo, 9, 13, 4, '#d5d9c8', '#8e9b93', '#64796c')
      bloco(6, 4 - passo, 9, 13, 4, '#d5d9c8', '#8e9b93', '#64796c')
      bloco(0, -15 + deslocamento, 22, 17, 20, personagem.cor, personagem.corEscura, personagem.corEscura)
      const digitando = pose.fase === 'work' && !reduzirMovimento ? Math.sin(tempoRef.current * 17 + personagem.ordem) * 2 : 0
      for (const lado of [-1, 1]) {
        const bracoY = pose.sentado ? -25 + deslocamento + digitando * lado : -12 + passo * lado
        bloco(lado * 14, bracoY, 6, 12, pose.sentado ? 12 : 16, personagem.cor, personagem.corEscura, personagem.corEscura)
        bloco(lado * 14, bracoY - 1, 6, 7, 4, '#eed0a7', '#cca47e', '#a47857')
      }
      bloco(0, -36 + deslocamento, 19, 18, 17, '#f0c7a0', '#d6a778', '#b68259')
      bloco(0, -47 + deslocamento, 20, 19, 9, '#4b493e', '#303a35', '#25332f')
      ctx.fillStyle = '#354139'
      ctx.fillRect(-10, -43 + deslocamento, 20, 5)
      if (personagem.ativa) {
        ctx.fillStyle = '#d4f79f'
        ctx.fillRect(16, -41 + deslocamento, 4, 4)
      }
      if (selecionado) texto('▼', 0, -64 + deslocamento, 11, '#fff0ae')
      ctx.restore()
      hitsRef.current.push({ chave: personagem.chave, x: pose.x - 25, y: pose.y - 70, largura: 50, altura: 82 })
    }
    const desenhar = (agora: number) => {
      if (!ativo) return
      const delta = Math.min(60, agora - anterior)
      anterior = agora
      if (!pausado && !reduzirMovimento && !document.hidden) tempoRef.current += delta / 1000
      if (agora - ultimoDetalhe > 400) {
        ultimoDetalhe = agora
        setRelogioDetalhe(tempoRef.current)
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const larguraCss = Math.round(layout.largura * zoom)
      const alturaCss = Math.round(layout.altura * zoom)
      if (canvas.width !== Math.round(larguraCss * dpr) || canvas.height !== Math.round(alturaCss * dpr)) {
        canvas.width = Math.round(larguraCss * dpr)
        canvas.height = Math.round(alturaCss * dpr)
        canvas.style.width = `${larguraCss}px`
        canvas.style.height = `${alturaCss}px`
      }
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0)
      ctx.clearRect(0, 0, layout.largura, layout.altura)
      desenharSala()
      hitsRef.current = []
      layout.mesas.map((mesa) => ({ mesa, y: poseDaExecucao(mesa, layout, tempoRef.current, reduzirMovimento).y })).sort((a, b) => a.y - b.y).forEach(({ mesa }) => desenharBoneco(mesa))
      quadro = requestAnimationFrame(desenhar)
    }
    quadro = requestAnimationFrame(desenhar)
    return () => {
      ativo = false
      cancelAnimationFrame(quadro)
    }
  }, [agenteSelecionadoId, layout, pausado, reduzirMovimento, zoom])

  const selecionar = (chave: string) => aoSelecionarAgente?.(chave)
  const tratarClique = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = evento.currentTarget.getBoundingClientRect()
    const x = (evento.clientX - rect.left) / zoom
    const y = (evento.clientY - rect.top) / zoom
    const hit = [...hitsRef.current].reverse().find((item) => x >= item.x && x <= item.x + item.largura && y >= item.y && y <= item.y + item.altura)
    if (hit) selecionar(hit.chave)
  }
  const tratarTeclado = (evento: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '].includes(evento.key) || execucoesVisiveis.length === 0) return
    evento.preventDefault()
    let indice = execucoesVisiveis.findIndex((execucao) => execucao.chave === agenteSelecionadoId)
    if (indice < 0) indice = 0
    if (evento.key.startsWith('Arrow')) {
      const direcao = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 1
      indice = (indice + direcao + execucoesVisiveis.length) % execucoesVisiveis.length
    }
    selecionar(execucoesVisiveis[indice].chave)
  }

  const descricaoSonda = statusLeitura === 'confirmado'
    ? `Leitura ao vivo${recebidoEm ? ` · ${Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s` : ''}`
    : statusLeitura === 'consultando'
      ? 'Consultando dados vivos'
      : statusLeitura === 'leitura_vencida'
        ? `Leitura vencida · ${falhouHaSegundos ?? 0}s`
        : erroSonda || 'Sonda indisponível'

  return (
    <div className="min-w-0 rounded-xl bg-[#0a151a] p-3 text-[#e8f0ec] sm:p-5 font-sans">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] tracking-[0.17em] text-[#b1c2bd]">G4ST4OVIB3 / PAINEL OS</div>
          <h2 className="mt-1 text-[23px] font-bold leading-none tracking-[-0.04em] sm:text-2xl">O escritório está vivo.</h2>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 font-mono text-[9px] sm:text-[10px] ${statusLeitura === 'confirmado' ? 'border-[#63735e] text-[#c6e98a]' : 'border-[#785f45] text-[#e8c575]'}`} title={descricaoSonda}>
          {statusLeitura === 'confirmado' ? 'AO VIVO' : 'SONDA'}
        </span>
      </header>
      <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={() => aoAlternarSoAtivos?.(!soAtivos)} aria-pressed={soAtivos} className={`min-h-11 rounded-lg border px-3 text-xs font-semibold ${soAtivos ? 'border-[#c1ec86] bg-[#c1ec86] text-[#1a2a1b]' : 'border-[#42534f] bg-[#162a2a] text-[#e7f0e7]'}`}>Só ativos</button>
        <button type="button" onClick={() => setPausado((valor) => !valor)} aria-pressed={pausado} className="min-h-11 rounded-lg border border-[#42534f] bg-[#162a2a] px-3 text-xs font-semibold text-[#e7f0e7]">{pausado ? 'Retomar' : 'Pausar'}</button>
        <div className="flex items-center overflow-hidden rounded-lg border border-[#42534f] bg-[#162a2a]">
          <button type="button" aria-label="Afastar sala" onClick={() => setZoom((valor) => limitar(valor - 0.1, ZOOM_MIN, ZOOM_MAX))} className="min-h-11 min-w-10 px-2 text-base text-[#e7f0e7]">−</button>
          <button type="button" title="Repor enquadramento" onClick={() => setZoom(zoomAutomaticoRef.current)} className="min-h-11 border-x border-[#42534f] px-2 font-mono text-[10px] text-[#aebfb8]">{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Aproximar sala" onClick={() => setZoom((valor) => limitar(valor + 0.1, ZOOM_MIN, ZOOM_MAX))} className="min-h-11 min-w-10 px-2 text-base text-[#e7f0e7]">+</button>
        </div>
        <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-[#aebfb8] sm:text-[11px]"><b className="text-[#c1ec86]">{totalAtivos}</b> em atividade</span>
      </div>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_285px] xl:gap-4">
        <section className="relative min-w-0 overflow-hidden rounded-xl border border-[#405655] bg-[#163032]" aria-label="Sala voxel interativa">
          <span className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] tracking-[0.15em] text-[#afc8c4]">CASA / OPERAÇÃO</span>
          <div ref={palcoRef} className="h-[510px] w-full overflow-auto overscroll-contain sm:h-[600px]" data-testid="office-scroll-room">
            {execucoesVisiveis.length > 0 ? (
              <canvas ref={canvasRef} tabIndex={0} role="group" aria-label={`Escritório com ${execucoesVisiveis.length} execuções. Use as setas para escolher ou toque um boneco.`} onClick={tratarClique} onKeyDown={tratarTeclado} className="block max-w-none cursor-pointer touch-pan-x touch-pan-y focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#e8c575]" />
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center p-6 text-center text-sm text-[#aebfb8]">{soAtivos ? 'Nenhuma execução está trabalhando agora.' : 'Nenhuma execução viva foi recebida.'}</div>
            )}
          </div>
        </section>
        <aside className="min-w-0 self-start rounded-lg border-t-2 border-[#c1ec86] bg-[#142426] p-3 sm:p-4 xl:sticky xl:top-3" aria-label="Detalhe da execução">
          {selecionada ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold leading-5 sm:text-base" data-testid="office-agent-name">{selecionada.nome}</h3>
                  <p className="mt-0.5 truncate font-mono text-[9px] text-[#718a82]" title={selecionada.execucao.id}>sessão {selecionada.execucao.id}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-[#c1ec86] sm:text-[11px]">{rotuloFase[faseSelecionada]}</span>
              </div>
              <p className="my-2 break-words text-[13px] leading-5 text-[#d4e4dc] sm:my-3 sm:text-sm">{selecionada.execucao.tarefa || selecionada.execucao.descricao || selecionada.execucao.etapa || 'Sem descrição da tarefa atual'}</p>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
                <div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1] sm:text-[10px]">Ferramenta</dt><dd className="mt-1 truncate text-xs" title={selecionada.execucao.ferramenta || '—'}>{selecionada.execucao.ferramenta || '—'}</dd></div>
                <div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1] sm:text-[10px]">Tempo</dt><dd className="mt-1 truncate text-xs">{selecionada.execucao.rodando_ha || '—'}</dd></div>
                <div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1] sm:text-[10px]">Modelo</dt><dd className="mt-1 truncate text-xs" title={selecionada.execucao.modelo_legivel || selecionada.execucao.modelo || '—'}>{selecionada.execucao.modelo_legivel || selecionada.execucao.modelo || '—'}</dd></div>
                <div className="min-w-0"><dt className="text-[9px] uppercase tracking-wide text-[#8fa7a1] sm:text-[10px]">Esforço</dt><dd className="mt-1 truncate text-xs" title={selecionada.execucao.esforco || '—'}>{selecionada.execucao.esforco || '—'}</dd></div>
              </dl>
            </>
          ) : <p className="text-sm text-[#9cb0a9]">Selecione um boneco para ver tarefa, ferramenta, tempo e modelo.</p>}
          <p className="mt-3 font-mono text-[9px] leading-4 text-[#869c94] sm:text-[10px]"><span className="text-[#c1ec86]">●</span> Em atividade: anda, senta, digita e levanta.<br />○ Ocioso: permanece no descanso.</p>
        </aside>
      </div>
      <footer className="mt-2 font-mono text-[9px] leading-4 text-[#839a90] sm:text-[10px]">{execucoesVisiveis.length} {execucoesVisiveis.length === 1 ? 'execução na sala' : 'execuções na sala'} · mesas agrupadas por squad · controles de zoom e rolagem.</footer>
      <div className="sr-only" role="region" aria-label="Lista acessível de execuções do escritório"><ul>{execucoesVisiveis.map((execucao) => <li key={execucao.chave}><button type="button" onClick={() => selecionar(execucao.chave)}>{execucao.nome} — {execucao.ativa ? 'em atividade' : 'ocioso'}</button></li>)}</ul></div>
    </div>
  )
}
