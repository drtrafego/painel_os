import { useEffect, useMemo, useRef, useState } from 'react'
import { desenharEscritorioGold } from './PixelOffice.gold'
import { ParedeEscritorio } from './PixelOffice.wall'
import { montarTarefasParede, type GastosIA } from './PixelOffice.wall-data'
import type { QuadroTarefasSolicitadas } from './nucleo/dados'
import { useRota } from '../nav/useRota'
import { POR_ID, type VistaId } from '../nav/rotas'
import logoCasal from '../assets/casal-do-trafego.png'
import './PixelOffice.gold.css'
import type { AgenteSessao, AgenteVivo, Estado, TarefasDiretores } from '../dados/tipos'
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
import { ambienteForcadoDaUrl, resolverAmbiente, type AmbienteVisual } from '../dados/ambiente'
import { agruparAgentesAtivosPorLancador, totalDeAgentesAgrupados, type GrupoLancador } from '../dados/lancadores'

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
  /** Compatibilidade do pacote anterior. A parede de cotas desta versão não usa este campo. */
  gastosIA?: GastosIA | null
  tarefasDiretores?: TarefasDiretores | null
  /** Solicitações reais. Ausência nunca é preenchida com execução técnica da sonda. */
  tarefasSolicitadas?: QuadroTarefasSolicitadas | null
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
  tipo: 'squad' | 'coworking'
  compacta: boolean
  x: number
  y: number
  largura: number
  altura: number
  postos: Array<{ x: number; y: number }>
  mesas: MesaVisual[]
}

export interface LayoutSala {
  largura: number
  altura: number
  colunas: number
  zoomSugerido: number
  corredorX: number
  descansoY: number
  descansoAberto: boolean
  ocupantesDescanso: number
  ilhas: IlhaVisual[]
  mesas: MesaVisual[]
}

// O mínimo precisa continuar abaixo da escala que cabe no palco quando o
// navegador está ampliado. Um piso visual aqui faria o canvas escapar no celular.
const ZOOM_MIN = 0.05
const ZOOM_MAX = 2.4
const SALA_MISTA: PixelAgentSquad = 'sala mista'
const DURACAO_TRANSICAO_AMBIENTE_MS = 720

/** Squads que só ocupam espaço quando a operação os convoca. */
export const SQUADS_SOB_DEMANDA: ReadonlyArray<{
  id: PixelAgentSquad
  permanenciaAposUltimoAtivoMs: number
}> = [
  { id: 'bots', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'tráfego', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'radar', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'conteúdo', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'comercial', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'destinos', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'análise', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
  { id: 'sala mista', permanenciaAposUltimoAtivoMs: 3 * 60 * 1000 },
]

const IDS_CATALOGO_SALA_MISTA = new Set(['dev', 'qa', 'explore'])
const PAPEIS_SALA_MISTA = new Set([
  'copy', 'designer', 'social', 'closer', 'frank', 'lex', 'arquiteto',
  'deployer', 'dev', 'qa', 'explore', 'general-purpose', 'general purpose',
])
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

function misturarHex(noite: string, dia: string, progressoDia: number) {
  const ler = (hex: string) => {
    const limpo = hex.replace('#', '')
    return [0, 2, 4].map((i) => Number.parseInt(limpo.slice(i, i + 2), 16))
  }
  const a = ler(noite); const b = ler(dia); const t = limitar(progressoDia)
  return `#${a.map((canal, indice) => Math.round(canal + (b[indice] - canal) * t).toString(16).padStart(2, '0')).join('')}`
}

function normalizarPapel(valor?: string | null) {
  return (valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizarReferenciaLancador(valor?: string | null) {
  return normalizarPapel(valor).replace(/\s*:\s*/g, ':')
}

function referenciasDoAgente(agente: AgenteVivo) {
  return new Set([
    agente.id,
    agente.nome,
    agente.identidade,
    agente.dono && agente.id ? `${agente.dono}:${agente.id}` : null,
  ].map(normalizarReferenciaLancador).filter(Boolean))
}

function referenciaDoLancador(agente: AgenteVivo) {
  return normalizarReferenciaLancador(agente.quem_mandou || agente.pai)
}

export type NoAgenteLancado = {
  agente: AgenteVivo
  filhos: NoAgenteLancado[]
}

/** Monta a árvore usando somente o vínculo declarado pela sonda, sem inferir pelo squad/dono. */
export function montarArvoreLancadosPor(agentes: AgenteVivo[], referenciasRaiz: Iterable<string>): NoAgenteLancado[] {
  const vivos = agentes.filter((agente) => agente.estado === 'trabalhando' || agente.estado === 'silencioso')
  const raiz = new Set(Array.from(referenciasRaiz, normalizarReferenciaLancador).filter(Boolean))
  const usados = new Set<AgenteVivo>()

  const montarNivel = (referenciasPai: Set<string>, caminho: Set<AgenteVivo>): NoAgenteLancado[] => {
    const nivel: NoAgenteLancado[] = []
    for (const agente of vivos) {
      if (usados.has(agente) || caminho.has(agente)) continue
      const lancador = referenciaDoLancador(agente)
      if (!lancador || !referenciasPai.has(lancador)) continue
      usados.add(agente)
      const proximoCaminho = new Set(caminho).add(agente)
      nivel.push({ agente, filhos: montarNivel(referenciasDoAgente(agente), proximoCaminho) })
    }
    return nivel
  }

  return montarNivel(raiz, new Set())
}

function rotuloEstadoAgente(estado: AgenteVivo['estado']) {
  if (estado === 'trabalhando') return 'Trabalhando'
  if (estado === 'silencioso') return 'Silencioso'
  return 'Encerrado'
}

function nomeParaListaDeLancador(agente: AgenteVivo, visual?: ExecucaoVisual, ficha?: PixelAgent) {
  const nome = agente.nome?.replace(/\s+/g, ' ').trim()
  if (nome && nome !== agente.id) return nome
  const identidade = agente.identidade?.replace(/\s+/g, ' ').trim()
  const identidadeGenerica = !identidade || ['sessao-codex', 'sessao-claude', 'sessão codex', 'sessão claude'].includes(identidade.toLowerCase())
  const tarefa = agente.tarefa?.replace(/\s+/g, ' ').trim()
  if (identidade && !identidadeGenerica) return identidade
  if (tarefa) return `${identidade || visual?.nome || ficha?.nome || 'Agente'} · ${tarefa}`
  return visual?.nome || ficha?.nome || identidade || agente.tipo || 'Agente sem identidade'
}

function ListaDeLancadores({ grupos, catalogo, execucoes, aoSelecionar }: {
  grupos: GrupoLancador[]
  catalogo: PixelAgent[]
  execucoes: ExecucaoVisual[]
  aoSelecionar: (chave: string) => void
}) {
  const total = totalDeAgentesAgrupados(grupos)
  const visualDoAgente = (agente: AgenteVivo) => execucoes.find((visual) => visual.execucao === agente)
  return (
    <section className="mt-3 rounded-md border border-[#405655] bg-[#102124] p-2" aria-label="Agentes ativos por lançador" data-testid="office-launchers-overview">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-[#c1ec86]">Agentes ativos por lançador</h4>
        <span className="shrink-0 font-mono text-[9px] text-[#8fa7a1]" data-testid="office-launchers-total">{total} vivos</span>
      </div>
      <div className="max-h-80 space-y-1.5 overflow-y-auto pr-0.5">
        {grupos.map((grupo) => (
          <details key={grupo.id} open={grupo.agentes.length > 0 && grupo.id !== 'nao-identificada'} className="rounded-md border border-[#405655] bg-[#0d1e22]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 text-[10px] font-semibold text-[#e8f0ec] [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate">{grupo.nome}</span>
              <span className="shrink-0 font-mono text-[#c1ec86]">{grupo.agentes.length}</span>
            </summary>
            {grupo.agentes.length > 0 && (
              <ul className="space-y-1 border-t border-[#405655] p-1.5">
                {grupo.agentes.map((agente) => {
                  const visual = visualDoAgente(agente)
                  const ficha = resolverAgenteNoCatalogo(agente, catalogo)
                  const nome = nomeParaListaDeLancador(agente, visual, ficha)
                  const tarefa = agente.tarefa || agente.descricao || agente.etapa || 'Sem tarefa no momento'
                  return (
                    <li key={`${grupo.id}:${agente.id}`} data-testid={`office-launcher-agent-${grupo.id}-${agente.id}`}>
                      <button
                        type="button"
                        onClick={() => visual && aoSelecionar(visual.chave)}
                        className="block w-full min-w-0 rounded border border-transparent p-1.5 text-left hover:border-[#c1ec86] focus:outline-none focus:ring-1 focus:ring-[#c1ec86]"
                      >
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[10px] font-semibold text-[#e8f0ec]" title={nome}>{nome}</span>
                          <span className={`shrink-0 font-mono text-[8px] uppercase ${agente.estado === 'trabalhando' ? 'text-[#c1ec86]' : 'text-[#e8c575]'}`}>{rotuloEstadoAgente(agente.estado)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[9px] leading-4 text-[#aebfb8]" title={tarefa}>{tarefa}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </details>
        ))}
      </div>
      <p className="mt-2 font-mono text-[8px] leading-3.5 text-[#718a82]">Cada agente vivo aparece uma vez. A origem vem do campo operacional dono.</p>
    </section>
  )
}

export function fichaUsaSalaMista(ficha?: PixelAgent) {
  if (!ficha) return true
  return ficha.squad === 'globais' || ficha.squad === 'pipeline Codex' || IDS_CATALOGO_SALA_MISTA.has(normalizarPapel(ficha.id))
}

/** Execuções genéricas nunca "herdam" por alias a mesa fixa de uma pessoa. */
export function execucaoUsaSalaMista(execucao: AgenteVivo, ficha?: PixelAgent) {
  // Uma execução reconhecida no catálogo conserva a ilha do próprio squad.
  // Só a execução sem identidade catalogada, ou os papéis globais/dev/qa,
  // cai no coworking. Assim uma Copy da ilha de conteúdo não some para a
  // sala mista apenas porque a API também informa `tipo: copy`.
  if (ficha && !fichaUsaSalaMista(ficha)) return false
  if (ficha && fichaUsaSalaMista(ficha)) return true
  const identidade = normalizarPapel(execucao.identidade)
  const tipo = normalizarPapel(execucao.tipo)
  const papel = normalizarPapel(execucao.papel)
  if ([identidade, tipo, papel].some((valor) => PAPEIS_SALA_MISTA.has(valor))) return true
  const semIdentidade = !identidade || identidade === 'sessao codex' || identidade === 'sessao claude' || identidade === 'sessao claude code'
  if ((execucao.motor === 'codex' || tipo === 'codex') && semIdentidade) return true
  return fichaUsaSalaMista(ficha)
}

const IDENTIDADES_GENERICAS = new Set(['sessao-codex', 'sessao-claude', 'sessão codex', 'sessão claude code'])
const TIPOS_GENERICOS = new Set(['codex', 'subagente', 'sessao_claude', 'sessão claude code'])
const ETAPAS_CODEX_SEM_TAREFA = new Set([
  'atividade codex detectada',
  'nenhuma ferramenta na cauda lida',
  'nunca escreveu no transcript',
  'fora da janela de leitura (historico)',
  'nao foi possivel ler',
])

function textoLegivel(valor?: string | null) {
  const limpo = valor?.replace(/\s+/g, ' ').trim()
  return limpo && !IDENTIDADES_GENERICAS.has(limpo.toLowerCase()) ? limpo : null
}

function primeiraLinhaUtilDoPedido(valor?: string | null) {
  return valor
    ?.split(/\r?\n/)
    .map((linha) => linha.replace(/\s+/g, ' ').trim())
    .find((linha) => linha && !ETAPAS_CODEX_SEM_TAREFA.has(normalizarPapel(linha))) || null
}

function encurtarTarefa(valor: string, limite = 28) {
  const limpo = valor.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const trecho = limpo.slice(0, limite - 1)
  const ultimoEspaco = trecho.lastIndexOf(' ')
  return `${trecho.slice(0, ultimoEspaco >= Math.floor(limite * 0.6) ? ultimoEspaco : limite - 1)}…`
}

/** Nome humano em primeiro plano; IDs técnicos ficam apenas no detalhe. */
export function nomeLegivelDaExecucao(execucao: AgenteVivo, ficha?: PixelAgent) {
  const ehCodex = execucao.motor === 'codex' || execucao.tipo === 'codex'
  const identidade = textoLegivel(execucao.identidade)
  if (identidade) return ficha?.nome || identidade
  const papel = textoLegivel(execucao.papel)
  if (papel && !(ehCodex && normalizarPapel(papel) === 'sessao codex')) return papel
  if (ficha && !(ehCodex && ficha.squad === 'pipeline Codex')) return ficha.nome
  if (ehCodex) {
    const modelo = execucao.modelo_legivel?.replace(/\s+/g, ' ').trim() || execucao.modelo?.replace(/\s+/g, ' ').trim() || 'modelo indisponível'
    // No Codex, `tarefa`/`descricao` podem ser o nome técnico do arquivo de
    // sessão. `etapa` é a primeira linha útil do pedido já extraída pela sonda.
    const tarefa = execucao.etapa_e_description ? null : primeiraLinhaUtilDoPedido(execucao.etapa)
    return tarefa ? `Codex · ${modelo} · ${encurtarTarefa(tarefa)}` : `Codex · ${modelo}`
  }
  if (ficha) return ficha.nome
  const nome = textoLegivel(execucao.nome)
  if (nome && nome !== execucao.id) return nome
  const tipo = execucao.tipo?.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (tipo && !TIPOS_GENERICOS.has(execucao.tipo?.toLowerCase() || '')) return tipo.charAt(0).toUpperCase() + tipo.slice(1)
  return 'Agente sem identidade'
}

export function funcaoLegivelDaExecucao(execucao: AgenteVivo, ficha?: PixelAgent) {
  const cadastrada = textoLegivel(ficha?.papel || execucao.papel)
  if (cadastrada) return cadastrada
  if (execucao.motor === 'codex' || execucao.tipo === 'codex') return 'Execução técnica (Codex)'
  return 'Execução operacional'
}

function capitalizarNome(valor: string) {
  return valor ? valor.charAt(0).toLocaleUpperCase('pt-BR') + valor.slice(1) : valor
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

type EstadoSessoes = { sessao: Array<Pick<AgenteSessao, 'id' | 'nome' | 'papel' | 'resumo' | 'estado' | 'motores'>> }

export function sessaoEstáNoAr(sessao: Pick<AgenteSessao, 'estado' | 'motores'>) {
  return sessao.estado === 'ativo' || Boolean(
    sessao.motores?.servicos?.some((servico) =>
      servico.ativo === true || servico.estado === 'active' || servico.sub === 'running',
    ) || (sessao.motores?.situacao === 'um_ativo' && (sessao.motores.ativos?.length || 0) > 0),
  )
}

function completarSessoesVivas(agentes: AgenteVivo[], catalogo: PixelAgent[], estado?: EstadoSessoes) {
  const diretores = new Set(['luana', 'renato', 'bia'])
  const presentes = new Set(
    agentes
      .map((agente) => resolverAgenteNoCatalogo(agente, catalogo)?.id)
      .filter((id): id is string => Boolean(id && diretores.has(id))),
  )
  const complementos = (estado?.sessao || [])
    .filter((sessao) => diretores.has(sessao.id) && sessaoEstáNoAr(sessao) && !presentes.has(sessao.id))
    .map((sessao): AgenteVivo => ({
      id: `sessao-estado-${sessao.id}`,
      nome: sessao.nome,
      dono: sessao.id,
      identidade: 'sessao-claude',
      papel: sessao.papel,
      descricao: sessao.resumo,
      tipo: 'sessao_claude',
      estado: 'silencioso',
      fase: 'sessao_viva',
      etapa: 'sessão viva · aguardando ferramenta',
      ferramenta: null,
      silencio_s: null,
      status: 'executando',
    }))
  return [...agentes, ...complementos]
}

/** Materializa ilhas fixas e manda executores sem squad próprio para o coworking. */
export function montarExecucoesVisuais(agentes: AgenteVivo[], catalogo: PixelAgent[], estado?: EstadoSessoes): ExecucaoVisual[] {
  const runtimes = completarSessoesVivas(agentes, catalogo, estado).filter((execucao, indice, todos) => {
    const chave = chaveAgente(execucao.dono, execucao.id)
    return todos.findIndex((item) => chaveAgente(item.dono, item.id) === chave) === indice
  })
  const porFicha = new Map<string, AgenteVivo[]>()
  const coworking: Array<{ execucao: AgenteVivo; ficha?: PixelAgent }> = []
  runtimes.forEach((runtime) => {
    const ficha = resolverAgenteNoCatalogo(runtime, catalogo)
    if (!ficha || execucaoUsaSalaMista(runtime, ficha)) { coworking.push({ execucao: runtime, ficha }); return }
    porFicha.set(ficha.id, [...(porFicha.get(ficha.id) || []), runtime])
  })

  const visuais: ExecucaoVisual[] = []
  catalogo.forEach((ficha) => {
    if (fichaUsaSalaMista(ficha)) return
    const execucoes = porFicha.get(ficha.id) || []
    const squadVisual = ['luana', 'renato', 'bia'].includes(ficha.id) ? 'coordenação' : ficha.squad
    visuais.push(criarVisual(execucoes[0] || execucaoParada(ficha), ficha, squadVisual, visuais.length, false, ficha.nome))
    execucoes.slice(1).forEach((execucao, indice) => {
      visuais.push(criarVisual(execucao, ficha, squadVisual, visuais.length, true, `${ficha.nome} · extra ${indice + 2}`))
    })
  })
  const bases = coworking.map(({ execucao, ficha }) => capitalizarNome(nomeLegivelDaExecucao(execucao, ficha)))
  const totais = new Map<string, number>()
  bases.forEach((nome) => totais.set(nome, (totais.get(nome) || 0) + 1))
  const ocorrencias = new Map<string, number>()
  coworking.forEach(({ execucao, ficha }, indice) => {
    const base = bases[indice]
    const ocorrencia = (ocorrencias.get(base) || 0) + 1
    ocorrencias.set(base, ocorrencia)
    const nome = (totais.get(base) || 0) > 1 ? `${base} · ${ocorrencia}` : base
    visuais.push(criarVisual(execucao, ficha, SALA_MISTA, visuais.length, true, nome))
  })
  return visuais
}

export function filtrarSquadsSobDemanda(execucoes: ExecucaoVisual[], squadsAbertos: ReadonlySet<PixelAgentSquad>) {
  const sobDemanda = new Set(SQUADS_SOB_DEMANDA.map((item) => item.id))
  return execucoes.filter((execucao) => !sobDemanda.has(execucao.squad) || squadsAbertos.has(execucao.squad))
}

type OpcoesLayoutSala = {
  larguraDisponivel?: number
  alturaDisponivel?: number
  /** Piso de zoom escolhido pela tela para preservar a leitura física. */
  zoomMinimo?: number
}

/** Escolhe a planta cuja escala uniforme é a maior que cabe nos dois eixos. */
export function calcularLayoutSala(execucoes: ExecucaoVisual[], compactoOuOpcoes: boolean | OpcoesLayoutSala = false): LayoutSala {
  const opcoes = typeof compactoOuOpcoes === 'object' ? compactoOuOpcoes : {}
  const grupos = new Map<PixelAgentSquad, ExecucaoVisual[]>()
  execucoes.forEach((execucao) => grupos.set(execucao.squad, [...(grupos.get(execucao.squad) || []), execucao]))
  const ordemSquads = [
    ...PIXEL_AGENT_SQUADS.map((squad) => squad.id).filter((id) => id !== SALA_MISTA && grupos.has(id)),
    ...(grupos.has(SALA_MISTA) ? [SALA_MISTA] : []),
  ]
  const larguraIlha = 400
  const margemX = 24
  const vaoX = 18
  const margemTopo = 128
  const alturas = new Map<PixelAgentSquad, number>()
  ordemSquads.forEach((squad) => {
    const quantidade = squad === SALA_MISTA ? Math.max(3, grupos.get(squad)?.length || 0) : grupos.get(squad)?.length || 0
    const colunasMesa = squad === SALA_MISTA ? Math.min(3, quantidade) : Math.min(4, Math.max(1, quantidade))
    const linhasMesa = Math.ceil(quantidade / colunasMesa)
    alturas.set(squad, 76 + linhasMesa * 112 + (squad === SALA_MISTA ? 72 : 0))
  })

  const distribuir = (colunas: number) => {
    const cursores = Array.from({ length: colunas }, () => margemTopo)
    const posicoes: Array<{ squad: PixelAgentSquad; coluna: number; y: number }> = []
    ordemSquads.forEach((squad) => {
      const menor = Math.min(...cursores)
      const coluna = squad === 'coordenação' && cursores.every((cursor) => cursor === margemTopo)
        ? Math.floor((colunas - 1) / 2)
        : cursores.indexOf(menor)
      posicoes.push({ squad, coluna, y: cursores[coluna] })
      cursores[coluna] += (alturas.get(squad) || 0) + 16
    })
    // A faixa de descanso já tem respiro próprio; somar outro vão externo
    // deixava uma borda morta no fundo quando a largura limitava a escala.
    const descansoY = Math.max(...cursores, 280)
    const paradas = execucoes.filter((execucao) => execucao.squad !== SALA_MISTA && execucao.execucao.estado === 'parado').length
    const larguraNatural = margemX * 2 + colunas * larguraIlha + (colunas - 1) * vaoX
    const larguraDescanso = Math.min(larguraNatural - 60, 140 + paradas * 44)
    const porLinha = Math.max(1, Math.floor((larguraDescanso - 36) / 44))
    const linhasDescanso = paradas > 0 ? Math.ceil(paradas / porLinha) : 0
    const alturaDescanso = paradas > 0 ? 40 + linhasDescanso * 44 : 26
    return { posicoes, descansoY, larguraNatural, altura: descansoY + alturaDescanso }
  }

  const larguraDisponivel = Math.max(0, opcoes.larguraDisponivel || 0)
  const alturaDisponivel = Math.max(0, opcoes.alturaDisponivel || 0)
  let melhor = { colunas: 1, ...distribuir(1), escala: Number.NEGATIVE_INFINITY }
  let melhorComAltura: typeof melhor | null = null
  for (let colunas = 1; colunas <= Math.min(6, ordemSquads.length); colunas += 1) {
    const candidato = distribuir(colunas)
    const escala = larguraDisponivel && alturaDisponivel
      ? Math.min(larguraDisponivel / candidato.larguraNatural, alturaDisponivel / candidato.altura)
      : colunas === Math.min(3, ordemSquads.length) ? 1 : 0
    const avaliado = { colunas, ...candidato, escala }
    if (escala > melhor.escala + 0.001 || (Math.abs(escala - melhor.escala) <= 0.001 && colunas > melhor.colunas)) {
      melhor = avaliado
    }
    // Quando há espaço vertical sobrando, prefira a planta mais ampliada que
    // também preenche pelo menos 90% da altura. A escala continua uniforme e
    // a largura final continua limitada pelo palco, sem criar rolagem lateral.
    const preencheAltura = !alturaDisponivel || escala * candidato.altura >= alturaDisponivel * 0.9
    if (preencheAltura && (!melhorComAltura || escala > melhorComAltura.escala + 0.001 || (Math.abs(escala - melhorComAltura.escala) <= 0.001 && colunas > melhorComAltura.colunas))) {
      melhorComAltura = avaliado
    }
  }
  if (melhorComAltura) melhor = melhorComAltura

  const zoomSugeridoNatural = larguraDisponivel && alturaDisponivel
    ? Math.min(larguraDisponivel / melhor.larguraNatural, alturaDisponivel / melhor.altura)
    : 1
  // A margem de dois pixels da medição do palco já protege o arredondamento do
  // canvas. Não reduza esta escala com uma "folga" percentual: em 200% ela
  // virava vazio vertical mensurável e um piso alto causava overflow horizontal.
  const zoomSugerido = limitar(zoomSugeridoNatural, opcoes.zoomMinimo ?? ZOOM_MIN, ZOOM_MAX)
  const largura = larguraDisponivel ? Math.max(melhor.larguraNatural, larguraDisponivel / zoomSugerido) : melhor.larguraNatural
  const larguraIlhaFinal = (largura - margemX * 2 - (melhor.colunas - 1) * vaoX) / melhor.colunas
  const ilhas: IlhaVisual[] = []
  const mesas: MesaVisual[] = []

  melhor.posicoes.forEach(({ squad, coluna, y }) => {
    const lista = grupos.get(squad) || []
    const coworking = squad === SALA_MISTA
    const capacidade = coworking ? Math.max(3, lista.length) : lista.length
    const colunasMesa = coworking ? Math.min(3, capacidade) : Math.min(4, Math.max(1, capacidade))
    const alturaIlha = alturas.get(squad) || 0
    const x = margemX + coluna * (larguraIlhaFinal + vaoX)
    const mesasIlha: MesaVisual[] = []
    const postos: Array<{ x: number; y: number }> = []
    for (let posicao = 0; posicao < capacidade; posicao += 1) {
      const colunaMesa = posicao % colunasMesa
      const linhaMesa = Math.floor(posicao / colunasMesa)
      const intervalo = larguraIlhaFinal / colunasMesa
      postos.push({ x: x + intervalo * (colunaMesa + 0.5), y: y + 70 + linhaMesa * 112 })
    }
    lista.forEach((execucao, posicao) => {
      const posto = postos[posicao]
      const mesa: MesaVisual = { execucao, x: posto.x, y: posto.y, descanso: { x: 0, y: 0 } }
      mesasIlha.push(mesa); mesas.push(mesa)
    })
    ilhas.push({ squad, nome: lista[0]?.squadNome || NOMES_SQUAD.get(squad) || squad.toUpperCase(), cor: CORES_SQUAD.get(squad) || '#7bcaad', tipo: coworking ? 'coworking' : 'squad', compacta: coworking && lista.length === 0, x, y, largura: larguraIlhaFinal, altura: alturaIlha, postos, mesas: mesasIlha })
  })

  const descansoY = melhor.descansoY
  const mesasFixas = mesas.filter((mesa) => mesa.execucao.squad !== SALA_MISTA)
  const mesasEmDescanso = mesasFixas.filter((mesa) => mesa.execucao.execucao.estado === 'parado')
  const larguraDescanso = Math.min(largura - 60, 140 + mesasEmDescanso.length * 44)
  const porLinha = Math.max(1, Math.floor((larguraDescanso - 36) / 44))
  mesasFixas.forEach((mesa) => {
    mesa.descanso = { x: largura / 2, y: descansoY + 16 }
  })
  mesasEmDescanso.forEach((mesa, indice) => {
    const linha = Math.floor(indice / porLinha)
    const itensNaLinha = Math.min(porLinha, mesasEmDescanso.length - linha * porLinha)
    const intervalo = Math.min(44, (larguraDescanso - 36) / Math.max(1, itensNaLinha - 1 || 1))
    const inicio = (largura - intervalo * (itensNaLinha - 1)) / 2
    mesa.descanso = { x: inicio + (indice % porLinha) * intervalo, y: descansoY + 30 + linha * 44 }
  })
  const ilhaMista = ilhas.find((ilha) => ilha.squad === SALA_MISTA)
  ilhaMista?.mesas.forEach((mesa, indice) => {
    mesa.descanso = { x: ilhaMista.x + ilhaMista.largura - 18, y: ilhaMista.y + ilhaMista.altura - 24 - (indice % 2) * 12 }
  })
  const linhasDescanso = mesasEmDescanso.length > 0 ? Math.ceil(mesasEmDescanso.length / porLinha) : 0
  const alturaDescanso = mesasEmDescanso.length > 0 ? 40 + linhasDescanso * 44 : 26
  return {
    largura,
    altura: descansoY + alturaDescanso,
    colunas: melhor.colunas,
    zoomSugerido,
    corredorX: largura / 2,
    descansoY,
    descansoAberto: mesasEmDescanso.length > 0,
    ocupantesDescanso: mesasEmDescanso.length,
    ilhas,
    mesas,
  }
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

function squadsAtivosSobDemanda(execucoes: ExecucaoVisual[]) {
  const configurados = new Set(SQUADS_SOB_DEMANDA.map((item) => item.id))
  return new Set(execucoes.filter((item) => item.ativa && configurados.has(item.squad)).map((item) => item.squad))
}

function useSquadsSobDemanda(execucoes: ExecucaoVisual[]) {
  const [abertos, setAbertos] = useState<Set<PixelAgentSquad>>(() => squadsAtivosSobDemanda(execucoes))
  const [saindo, setSaindo] = useState<Set<PixelAgentSquad>>(() => new Set())
  const timersEsconder = useRef(new Map<PixelAgentSquad, number>())
  const timersRemover = useRef(new Map<PixelAgentSquad, number>())
  const ativos = squadsAtivosSobDemanda(execucoes)
  const assinaturaAtivos = [...ativos].sort().join('|')

  useEffect(() => {
    SQUADS_SOB_DEMANDA.forEach((configuracao) => {
      const squad = configuracao.id
      if (ativos.has(squad)) {
        const timerEsconder = timersEsconder.current.get(squad)
        const timerRemover = timersRemover.current.get(squad)
        if (timerEsconder) window.clearTimeout(timerEsconder)
        if (timerRemover) window.clearTimeout(timerRemover)
        timersEsconder.current.delete(squad)
        timersRemover.current.delete(squad)
        setSaindo((atuais) => {
          if (!atuais.has(squad)) return atuais
          const proximos = new Set(atuais); proximos.delete(squad); return proximos
        })
        setAbertos((atuais) => {
          if (atuais.has(squad)) return atuais
          const proximos = new Set(atuais); proximos.add(squad); return proximos
        })
        return
      }
      if (!abertos.has(squad) || timersEsconder.current.has(squad) || saindo.has(squad)) return
      const timer = window.setTimeout(() => {
        timersEsconder.current.delete(squad)
        setSaindo((atuais) => new Set(atuais).add(squad))
        const remover = window.setTimeout(() => {
          timersRemover.current.delete(squad)
          setSaindo((atuais) => { const proximos = new Set(atuais); proximos.delete(squad); return proximos })
          setAbertos((atuais) => { const proximos = new Set(atuais); proximos.delete(squad); return proximos })
        }, DURACAO_TRANSICAO_AMBIENTE_MS)
        timersRemover.current.set(squad, remover)
      }, configuracao.permanenciaAposUltimoAtivoMs)
      timersEsconder.current.set(squad, timer)
    })
  }, [abertos, assinaturaAtivos, saindo])

  useEffect(() => () => {
    timersEsconder.current.forEach((timer) => window.clearTimeout(timer))
    timersRemover.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  return { abertos, saindo }
}

export function PixelOffice({ agentes, catalogo = PIXEL_AGENTS, estado, aoSelecionarAgente, agenteSelecionadoId, soAtivos = false, aoAlternarSoAtivos, aoAbrirCerebro, gastosIA, tarefasDiretores, tarefasSolicitadas }: PixelOfficeProps) {
  const { ir: abrirModulo } = useRota()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const palcoRef = useRef<HTMLDivElement | null>(null)
  const hitsRef = useRef<Array<{ chave: string; x: number; y: number; largura: number; altura: number; modulo?: string }>>([])
  const animacoesRef = useRef(new Map<string, EstadoAnimacaoBoneco>())
  const fasesRef = useRef(new Map<string, FaseBoneco>())
  const progressoIlhasRef = useRef(new Map<PixelAgentSquad, number>())
  const tempoRef = useRef(0)
  const zoomAutomaticoRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [dimensoesPalco, setDimensoesPalco] = useState({ largura: 900, altura: 600, dpr: 1, larguraFisica: 900 })
  const [pausado, setPausado] = useState(false)
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  const [relogioDetalhe, setRelogioDetalhe] = useState(0)
  const [agoraAmbiente, setAgoraAmbiente] = useState(() => new Date())
  const { statusLeitura, recebidoEm, falhouHaSegundos, erro: erroSonda } = useAgentesVivos()

  const modoAmbienteForcado = typeof window === 'undefined' ? 'auto' : ambienteForcadoDaUrl(window.location.search)
  const ambiente = useMemo<AmbienteVisual>(() => resolverAmbiente(agoraAmbiente, modoAmbienteForcado), [agoraAmbiente, modoAmbienteForcado])

  useEffect(() => {
    const id = window.setInterval(() => setAgoraAmbiente(new Date()), 15000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzirMovimento(media.matches)
    atualizar(); media.addEventListener('change', atualizar)
    return () => media.removeEventListener('change', atualizar)
  }, [])

  const todasExecucoes = useMemo(() => montarExecucoesVisuais(agentes, catalogo, estado), [agentes, catalogo, estado])
  const { abertos: squadsSobDemandaAbertos, saindo: squadsSobDemandaSaindo } = useSquadsSobDemanda(todasExecucoes)
  const execucoesVisiveis = useMemo(() => {
    const porAtividade = soAtivos ? todasExecucoes.filter((execucao) => execucao.ativa) : todasExecucoes
    return filtrarSquadsSobDemanda(porAtividade, squadsSobDemandaAbertos)
  }, [soAtivos, squadsSobDemandaAbertos, todasExecucoes])
  // O nome principal da mesa é desenhado com 7,5 px no canvas. Em tela física
  // de celular, sua escala nunca pode deixá-lo abaixo de 9 px. A sobra vira
  // rolagem DENTRO do palco, não overflow da página. A conta inclui o DPR,
  // portanto continua válida entre 50% e 200% de zoom do navegador.
  const zoomMinimoLegivel = dimensoesPalco.larguraFisica < 700
    ? limitar(9 / (7.5 * dimensoesPalco.dpr), ZOOM_MIN, ZOOM_MAX)
    : ZOOM_MIN
  const layout = useMemo(() => calcularLayoutSala(execucoesVisiveis, {
    larguraDisponivel: dimensoesPalco.largura,
    alturaDisponivel: dimensoesPalco.altura,
    zoomMinimo: zoomMinimoLegivel,
  }), [dimensoesPalco.altura, dimensoesPalco.largura, execucoesVisiveis, zoomMinimoLegivel])
  // O palco é deliberadamente rolável. Limitar a aproximação à própria largura
  // obrigaria o desenho a voltar a encolher e tornaria os nomes ilegíveis.
  const zoomMaximoSeguro = ZOOM_MAX
  const totalAtivos = todasExecucoes.filter((execucao) => execucao.ativa).length
  const totalFixos = todasExecucoes.filter((execucao) => !execucao.temporaria).length
  const totalExtras = todasExecucoes.filter((execucao) => execucao.temporaria).length
  const selecionada = todasExecucoes.find((execucao) => execucao.chave === agenteSelecionadoId) || execucoesVisiveis[0]
  const faseSelecionada = selecionada ? fasesRef.current.get(selecionada.animacaoChave) : undefined
  const squadsVisiveis = useMemo(() => PIXEL_AGENT_SQUADS.filter((squad) => layout.ilhas.some((ilha) => ilha.squad === squad.id)), [layout.ilhas])
  const gruposLancadores = useMemo(() => agruparAgentesAtivosPorLancador(agentes), [agentes])
  const tarefasDaParede = useMemo(() => montarTarefasParede(tarefasDiretores), [tarefasDiretores])

  useEffect(() => {
    const palco = palcoRef.current
    if (!palco) return
    let quadro = 0
    let mediaResolucao: MediaQueryList | null = null
    const ajustar = () => {
      // O palco, e não um mínimo de layout, é a fonte da escala. Em zoom alto
      // o celular pode ter menos de 260 px CSS disponíveis.
      const larguraDisponivel = Math.max(1, palco.clientWidth - 2)
      const alturaDisponivel = Math.max(1, palco.clientHeight - 2)
      const dpr = window.devicePixelRatio || 1
      const larguraFisica = Math.round(larguraDisponivel * dpr)
      setDimensoesPalco((atuais) => atuais.largura === larguraDisponivel && atuais.altura === alturaDisponivel && atuais.dpr === dpr && atuais.larguraFisica === larguraFisica
        ? atuais
        : { largura: larguraDisponivel, altura: alturaDisponivel, dpr, larguraFisica })
    }
    const ajustarDepoisDoLayout = () => {
      window.cancelAnimationFrame(quadro)
      quadro = window.requestAnimationFrame(() => {
        ajustar()
        quadro = window.requestAnimationFrame(ajustar)
      })
    }
    const aoMudarResolucao = () => {
      mediaResolucao?.removeEventListener('change', aoMudarResolucao)
      mediaResolucao = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      mediaResolucao.addEventListener('change', aoMudarResolucao)
      ajustarDepoisDoLayout()
    }
    aoMudarResolucao()
    const observador = new ResizeObserver(ajustarDepoisDoLayout); observador.observe(palco)
    window.addEventListener('resize', ajustarDepoisDoLayout)
    return () => {
      observador.disconnect()
      window.removeEventListener('resize', ajustarDepoisDoLayout)
      mediaResolucao?.removeEventListener('change', aoMudarResolucao)
      window.cancelAnimationFrame(quadro)
    }
  }, [])

  useEffect(() => {
    zoomAutomaticoRef.current = layout.zoomSugerido
    setZoom(layout.zoomSugerido)
  }, [layout.zoomSugerido])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let quadro = 0
    let anterior = performance.now()
    let ultimoDetalhe = 0
    let ativo = true
    let goldDisponivel = true

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
      ctx.fillStyle = cor; ctx.textAlign = alinhamento; ctx.font = `${peso} ${tamanho}px "JetBrains Mono", ui-monospace, monospace`; ctx.fillText(valor, x, y)
    }
    const cadeira = (x: number, y: number) => {
      bloco(x, y, 27, 26, 9, '#5a777a', '#31484f', '#263c43'); bloco(x, y + 9, 28, 6, 26, '#779295', '#405d65', '#2c474f')
    }
    const desenharObjeto = (mesa: MesaVisual) => {
      const { x, y, execucao } = mesa; const ox = x + 24; const oy = y - 8; ctx.fillStyle = execucao.destaque
      if (execucao.objeto === 'radar') { ctx.beginPath(); ctx.arc(ox, oy - 6, 5.6, 0, Math.PI * 2); ctx.strokeStyle = execucao.destaque; ctx.lineWidth = 2.8; ctx.stroke(); ctx.fillRect(ox + 4, oy, 8, 3) }
      else if (execucao.objeto === 'qualidade') texto('✓', ox, oy, 12, execucao.destaque, 'center', 900)
      else if (execucao.objeto === 'arte') { ctx.fillRect(ox - 8, oy - 11, 7, 7); ctx.fillStyle = '#facc15'; ctx.fillRect(ox, oy - 11, 7, 7); ctx.fillStyle = '#38bdf8'; ctx.fillRect(ox - 4, oy - 3, 7, 7) }
      else if (execucao.objeto === 'texto') { ctx.save(); ctx.translate(ox, oy - 4); ctx.rotate(-0.55); ctx.fillRect(-1, -10, 4, 18); ctx.restore() }
      else if (execucao.objeto === 'metricas') { ctx.fillRect(ox - 8, oy - 4, 4, 7); ctx.fillRect(ox - 1, oy - 10, 4, 13); ctx.fillRect(ox + 6, oy - 15, 4, 18) }
      else if (execucao.objeto === 'envio') poligono([[ox - 10, oy - 10], [ox + 10, oy - 4], [ox - 6, oy + 3]], execucao.destaque)
      else if (execucao.objeto === 'codigo') texto('</>', ox, oy - 1, 7.5, execucao.destaque, 'center', 800)
      else { ctx.fillRect(ox - 6, oy - 10, 10, 10); ctx.fillRect(ox + 4, oy - 8, 4, 6) }
    }
    const desenharMesa = (mesa: Pick<MesaVisual, 'x' | 'y'> & { execucao?: ExecucaoVisual }) => {
      const { x, y, execucao } = mesa
      const t = ambiente.progressoDia
      ctx.fillStyle = `rgba(0,0,0,${0.22 + 0.08 * t})`; ctx.beginPath(); ctx.ellipse(x + 5, y + 20, 43, 23, 0, 0, Math.PI * 2); ctx.fill()
      bloco(x - 25, y + 3, 7, 9, 28, '#d6b181', '#705037', '#58422f'); bloco(x + 25, y + 5, 7, 9, 28, '#d6b181', '#705037', '#58422f')
      bloco(x, y, 68, 42, 9, '#ceac7b', '#9a7650', '#755435'); bloco(x, y - 11, 33, 6, 30, '#516e72', '#1b303b', '#10232b')
      ctx.fillStyle = execucao?.ativa ? '#163d48' : '#112328'; ctx.fillRect(x - 14, y - 38, 26, 19)
      if (execucao?.ativa) {
        for (let linha = 0; linha < 3; linha += 1) { ctx.fillStyle = linha === 0 ? execucao.cor : '#77a6a0'; ctx.fillRect(x - 10, y - 34 + linha * 5, 14 - linha * 3, 2) }
      } else if (execucao?.execucao.estado === 'silencioso' && Math.floor(tempoRef.current * 2) % 2 === 0) { ctx.fillStyle = '#82aaa5'; ctx.fillRect(x - 10, y - 29, 3, 3) }
      bloco(x, y + 5, 22, 12, 3, '#c1cfb9', '#7a8d84', '#4d655f'); if (execucao) desenharObjeto(mesa as MesaVisual); cadeira(x, y + 34)
      if (execucao) {
        execucao.rotulos.forEach((rotulo, indice) => texto(rotulo, x, y + 62 + indice * 9, indice === 0 ? 7.5 : 6.5, indice === 0 ? misturarHex('#f4ead0', '#1f2d2e', t) : misturarHex('#c7d5cf', '#43575a', t), 'center', 650))
        if (execucao.temporaria && execucao.squad !== SALA_MISTA) texto('+ TEMP', x, y + 81, 7, '#76501b', 'center', 800)
      } else texto('LIVRE', x, y + 64, 7, '#43575a', 'center', 800)
    }
    const progressosDoQuadro = new Map<PixelAgentSquad, number>()
    const comTransformacaoDoAmbiente = (ilha: IlhaVisual, desenharConteudo: () => void) => {
      const progresso = progressosDoQuadro.get(ilha.squad) ?? 1
      if (progresso >= 0.999) { desenharConteudo(); return }
      const escalaX = 0.72 + progresso * 0.28
      const escalaY = 0.18 + progresso * 0.82
      const centroX = ilha.x + ilha.largura / 2
      const baseY = ilha.y + ilha.altura
      ctx.save(); ctx.globalAlpha *= 0.12 + progresso * 0.88; ctx.translate(centroX, baseY); ctx.scale(escalaX, escalaY); ctx.translate(-centroX, -baseY)
      desenharConteudo(); ctx.restore()
    }
    const desenharPlanta = (x: number, y: number, escala = 1) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(escala, escala)
      bloco(0, 0, 19, 20, 18, '#859487', '#56665c', '#37483f')
      bloco(-4, -17, 21, 22, 20, '#8ab77a', '#567f4e', '#395c43')
      bloco(7, -24, 14, 16, 20, '#9acb82', '#6a935c', '#456c49')
      ctx.restore()
    }
    const desenharSala = () => {
      const { largura, altura } = layout
      const t = ambiente.progressoDia
      const parede = misturarHex('#071a21', '#c9a77b', t)
      const piso = misturarHex('#303943', '#a9bec7', t)
      ctx.fillStyle = piso; ctx.fillRect(0, 0, largura, altura)
      ctx.fillStyle = parede; ctx.fillRect(8, 10, largura - 16, 100)

      // Noite: janelões, cidade iluminada e concreto polido.
      ctx.save(); ctx.globalAlpha = 1 - t
      ctx.fillStyle = '#08131c'; ctx.fillRect(10, 14, largura - 20, 94)
      for (let x = 12; x < largura - 10; x += 70) {
        const alturaPredio = 13 + (hashTexto(`predio:${x}`) % 27)
        ctx.fillStyle = '#122b3c'; ctx.fillRect(x, 106 - alturaPredio, 48, alturaPredio)
        for (let janelaY = 106 - alturaPredio + 6; janelaY < 104; janelaY += 8) for (let janelaX = x + 7; janelaX < x + 42; janelaX += 12) {
          ctx.fillStyle = (hashTexto(`${x}:${janelaY}:${janelaX}`) % 3 === 0) ? '#f6c765' : '#467ba0'; ctx.fillRect(janelaX, janelaY, 4, 3)
        }
      }
      ctx.strokeStyle = '#294555'; ctx.lineWidth = 3
      for (let x = 10; x < largura; x += 82) { ctx.beginPath(); ctx.moveTo(x, 13); ctx.lineTo(x, 108); ctx.stroke() }
      ctx.beginPath(); ctx.moveTo(10, 106); ctx.lineTo(largura - 10, 106); ctx.stroke(); ctx.restore()

      // Dia: lambris de madeira clara, prateleiras, plantas e lousa.
      ctx.save(); ctx.globalAlpha = t
      ctx.fillStyle = '#d4b285'; ctx.fillRect(10, 14, largura - 20, 94)
      for (let x = 12; x < largura - 10; x += 18) { ctx.fillStyle = x % 36 ? '#bd986b' : '#e0c395'; ctx.fillRect(x, 15, 2, 91) }
      for (const shelfX of [44, largura / 2 - 150, largura / 2 + 110, largura - 115]) {
        ctx.fillStyle = '#906843'; ctx.fillRect(shelfX, 30, 74, 4); ctx.fillStyle = '#ecd9b5'; ctx.fillRect(shelfX + 4, 25, 12, 5); ctx.fillStyle = '#6f9d68'; ctx.fillRect(shelfX + 24, 21, 12, 9); ctx.fillStyle = '#a57843'; ctx.fillRect(shelfX + 50, 22, 15, 8)
      }
      const lousaX = Math.max(96, largura / 2 - 250); ctx.fillStyle = '#eee6d5'; ctx.fillRect(lousaX, 50, 110, 36); ctx.strokeStyle = '#a68b68'; ctx.lineWidth = 2; ctx.strokeRect(lousaX, 50, 110, 36)
      for (const [x, y, cor] of [[lousaX + 12, 58, '#ef8d61'], [lousaX + 37, 70, '#62a9ca'], [lousaX + 67, 58, '#f0bf3e']] as Array<[number, number, string]>) { ctx.fillStyle = cor; ctx.fillRect(x, y, 11, 8) }
      ctx.restore()

      const ladrilhoA = misturarHex('#2c353e', '#aebfc6', t); const ladrilhoB = misturarHex('#29313a', '#a8bac1', t)
      for (let y = 110; y < altura - 8; y += 96) for (let x = 10; x < largura - 10; x += 96) { ctx.fillStyle = (Math.floor(x / 96) + Math.floor(y / 96)) % 2 ? ladrilhoA : ladrilhoB; ctx.fillRect(x, y, 95, 95) }
      ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1
      for (let y = 110; y < altura - 8; y += 96) { ctx.beginPath(); ctx.moveTo(10, y + 0.5); ctx.lineTo(largura - 10, y + 0.5); ctx.stroke() }
      for (let x = 10; x < largura - 10; x += 96) { ctx.beginPath(); ctx.moveTo(x + 0.5, 110); ctx.lineTo(x + 0.5, altura - 8); ctx.stroke() }
      if (t > 0) poligono([[18, 110], [90, 110], [210, altura - 15], [80, altura - 15]], `rgba(255,246,216,${0.10 * t})`)
      ctx.fillStyle = misturarHex('#172b30', '#9c7a55', t); ctx.fillRect(12, 110, 6, altura - 120); ctx.fillRect(largura - 18, 110, 6, altura - 120)
      desenharPlanta(38, altura - 37, 1.1); desenharPlanta(largura - 38, altura - 37, 1.1)
      if (t > 0.5) { desenharPlanta(84, 42, 0.42); desenharPlanta(largura - 88, 42, 0.42); desenharPlanta(largura * 0.25, 42, 0.38) }
      const corNeon = misturarHex('#59b9ff', '#51412a', t)
      if (t < 0.9) { ctx.save(); ctx.shadowColor = '#47b8ff'; ctx.shadowBlur = 10 * (1 - t); texto('G4ST4OVIB3', largura / 2, 58, 21, corNeon, 'center', 900); ctx.restore() }
      else texto('G4ST4OVIB3', largura / 2, 58, 21, '#3b2f22', 'center', 900)
      texto('casaldotrafego.com', largura / 2, 80, 9, misturarHex('#9eb9ba', '#6e5b43', t), 'center', 650)
      layout.ilhas.forEach((ilha) => {
        comTransformacaoDoAmbiente(ilha, () => {
          const baseTapete = misturarHex('#26383b', '#c3cfd2', t)
          ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(ilha.x + 4, ilha.y + 6, ilha.largura, ilha.altura)
          ctx.fillStyle = ilha.compacta ? misturarHex('#42686b', baseTapete, 0.85) : misturarHex(ilha.cor, baseTapete, 0.72); ctx.fillRect(ilha.x, ilha.y, ilha.largura, ilha.altura)
          ctx.strokeStyle = rgba(escurecer(ilha.cor, 0.7), 0.55); ctx.lineWidth = 1; ctx.strokeRect(ilha.x + 0.5, ilha.y + 0.5, ilha.largura - 1, ilha.altura - 1)
          if (ilha.tipo === 'coworking') { ctx.fillStyle = '#193b3e'; ctx.fillRect(ilha.x - 5, ilha.y, 5, ilha.altura); ctx.fillStyle = '#90a69d'; ctx.fillRect(ilha.x - 3, ilha.y + 28, 1, ilha.altura - 34) }
          ctx.fillStyle = ilha.compacta ? '#42686b' : ilha.cor; ctx.fillRect(ilha.x, ilha.y, ilha.largura, 6)
          const corRotuloIlha = misturarHex('#e7dec3', '#1f2d2e', t)
          texto(ilha.nome, ilha.x + 13, ilha.y + 22, 9, corRotuloIlha, 'left', 750); texto(ilha.tipo === 'coworking' ? `${ilha.mesas.length} / ${ilha.postos.length}` : `${ilha.mesas.length}`, ilha.x + ilha.largura - 13, ilha.y + 22, 9, corRotuloIlha, 'right', 750)
          ilha.postos.forEach((posto, indice) => desenharMesa({ ...posto, execucao: ilha.mesas[indice]?.execucao }))
          if (ilha.tipo === 'coworking') {
            const sofaX = ilha.x + ilha.largura / 2; const sofaY = ilha.y + ilha.altura - 24
            bloco(sofaX, sofaY, 92, 28, 12, '#688b83', '#355953', '#294a47'); bloco(sofaX, sofaY - 12, 88, 8, 21, '#779991', '#42645e', '#31534e')
            texto(ilha.compacta ? 'COWORKING DISPONÍVEL' : 'SOFÁ / PAUSA', sofaX, sofaY + 12, 5.3, ilha.compacta ? '#86a6a2' : '#cde1d8', 'center', 800)
          }
          if (SQUADS_SOB_DEMANDA.some((item) => item.id === ilha.squad)) {
            const progresso = progressosDoQuadro.get(ilha.squad) ?? 1; const centro = ilha.x + ilha.largura / 2; const base = ilha.y + ilha.altura - 2; const painel = 31 * (1 - progresso)
            if (progresso < 0.999) { ctx.fillStyle = '#13282b'; ctx.fillRect(centro - 32, base - 38, painel, 38); ctx.fillRect(centro + 32 - painel, base - 38, painel, 38); ctx.strokeStyle = rgba(ilha.cor, 0.9); ctx.strokeRect(centro - 33, base - 39, 66, 39) }
          }
        })
      })
      const larguraDescanso = Math.min(largura - 60, 140 + layout.ocupantesDescanso * 44)
      const xDescanso = (largura - larguraDescanso) / 2
      const alturaDescanso = layout.altura - layout.descansoY - 10
      ctx.fillStyle = '#214747'; ctx.fillRect(xDescanso, layout.descansoY, larguraDescanso, alturaDescanso); ctx.fillStyle = '#496b63'; ctx.fillRect(xDescanso + 3, layout.descansoY - 2, larguraDescanso - 6, 5); texto(layout.descansoAberto ? 'DESCANSO' : 'DESCANSO · VAZIO', xDescanso + larguraDescanso - 12, layout.descansoY + 17, 7, '#e0d5af', 'right', 800)
    }
    const desenharBoneco = (mesa: MesaVisual, estadoAnimacao: EstadoAnimacaoBoneco) => {
      const personagem = mesa.execucao; const pose = poseDoEstado(estadoAnimacao, layout.corredorX); const selecionado = personagem.chave === agenteSelecionadoId
      const passo = pose.andando ? Math.sin(tempoRef.current * 13 + personagem.ordem) * 4 : 0; const flutuar = pose.andando ? Math.abs(Math.sin(tempoRef.current * 13 + personagem.ordem)) * 0.9 : 0; const deslocamento = pose.sentado * 7
      const digitando = pose.fase === 'trabalhando' && !reduzirMovimento ? Math.sin(tempoRef.current * 17 + personagem.ordem) * 2 : 0
      ctx.save(); ctx.translate(pose.x, pose.y - flutuar); ctx.fillStyle = '#12252760'; ctx.beginPath(); ctx.ellipse(0, 4, 17, 6, 0, 0, Math.PI * 2); ctx.fill()
      if (selecionado) { ctx.strokeStyle = '#fff1b2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 5, 21, 8, 0, 0, Math.PI * 2); ctx.stroke() }
      bloco(-6, 1 + passo, 8, 10, pose.sentado ? 9 : 17, '#607783', '#314653', '#213541'); bloco(6, 1 - passo, 8, 10, pose.sentado ? 9 : 17, '#607783', '#314653', '#213541')
      bloco(-6, 4 + passo, 9, 13, 4, '#d5d9c8', '#8e9b93', '#64796c'); bloco(6, 4 - passo, 9, 13, 4, '#d5d9c8', '#8e9b93', '#64796c'); bloco(0, -15 + deslocamento, 22, 17, 20, personagem.cor, personagem.corEscura, personagem.corEscura)
      for (const lado of [-1, 1]) { const bracoY = pose.sentado ? -25 + deslocamento + digitando * lado : -12 + passo * lado; bloco(lado * 14, bracoY, 6, 12, pose.sentado ? 12 : 16, personagem.cor, personagem.corEscura, personagem.corEscura); bloco(lado * 14, bracoY - 1, 6, 7, 4, personagem.pele, escurecer(personagem.pele, 0.83), '#9a684c') }
      bloco(0, -36 + deslocamento, 19, 18, 17, personagem.pele, escurecer(personagem.pele, 0.83), '#9a684c'); bloco(0, -47 + deslocamento, 20, 19, 9, personagem.cabelo, escurecer(personagem.cabelo, 0.68), escurecer(personagem.cabelo, 0.58))
      if (personagem.acessorio === 0) { ctx.fillStyle = personagem.destaque; ctx.fillRect(-10, -43 + deslocamento, 20, 3) }
      if (personagem.acessorio === 1) { ctx.strokeStyle = '#d8efe7'; ctx.lineWidth = 1.4; ctx.strokeRect(-8, -37 + deslocamento, 7, 4); ctx.strokeRect(1, -37 + deslocamento, 7, 4) }
      if (personagem.acessorio === 2) { ctx.fillStyle = personagem.destaque; ctx.fillRect(9, -33 + deslocamento, 4, 10) }
      if (personagem.acessorio === 3) { ctx.fillStyle = '#e8d8a9'; ctx.fillRect(-10, -51 + deslocamento, 20, 3) }
      if (personagem.acessorio === 4) { ctx.fillStyle = personagem.destaque; ctx.fillRect(-3, -17 + deslocamento, 5, 7) }
      if (personagem.ativa) { ctx.fillStyle = '#d4f79f'; ctx.fillRect(16, -41 + deslocamento, 4, 4) }
      if (selecionado) texto('▼', 0, -64 + deslocamento, 11, '#fff0ae')
      if (selecionado && pose.fase === 'trabalhando' && personagem.execucao.ferramenta) { const ferramenta = formatarRotulo(personagem.execucao.ferramenta, '', 13); const larguraBalao = Math.max(44, ferramenta.length * 5.5 + 10); ctx.fillStyle = '#102529ee'; ctx.fillRect(-larguraBalao / 2, -72 + deslocamento, larguraBalao, 14); ctx.fillStyle = personagem.cor; ctx.fillRect(-larguraBalao / 2, -72 + deslocamento, 2, 14); texto(ferramenta, 0, -62 + deslocamento, 7, '#e8f0ec', 'center', 700) }
      ctx.restore(); hitsRef.current.push({ chave: personagem.chave, x: pose.x - 25, y: pose.y - 70, largura: 50, altura: 82 })
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
      layout.ilhas.forEach((ilha) => {
        const ehSobDemanda = SQUADS_SOB_DEMANDA.some((item) => item.id === ilha.squad)
        const alvo = ehSobDemanda && squadsSobDemandaSaindo.has(ilha.squad) ? 0 : 1
        const inicial = progressoIlhasRef.current.get(ilha.squad) ?? (ehSobDemanda ? 0 : 1)
        const passo = reduzirMovimento ? 1 : delta / DURACAO_TRANSICAO_AMBIENTE_MS
        const proximo = alvo > inicial ? Math.min(alvo, inicial + passo) : Math.max(alvo, inicial - passo)
        progressoIlhasRef.current.set(ilha.squad, proximo); progressosDoQuadro.set(ilha.squad, proximo)
      })
      const dpr = Math.min(dimensoesPalco.dpr, 2); const larguraCss = Math.round(layout.largura * zoom); const alturaCss = Math.round(layout.altura * zoom)
      const larguraBacking = Math.round(larguraCss * dpr); const alturaBacking = Math.round(alturaCss * dpr)
      if (canvas.width !== larguraBacking) canvas.width = larguraBacking
      if (canvas.height !== alturaBacking) canvas.height = alturaBacking
      if (canvas.style.width !== `${larguraCss}px`) canvas.style.width = `${larguraCss}px`
      if (canvas.style.height !== `${alturaCss}px`) canvas.style.height = `${alturaCss}px`
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0); ctx.clearRect(0, 0, layout.largura, layout.altura)
      const estados = layout.mesas.map((mesa) => ({ mesa, estado: estadoDaMesa(mesa, agoraAnimacaoMs) }))
      estados.sort((a, b) => a.estado.y - b.estado.y)
      if (goldDisponivel) {
        try {
          hitsRef.current = desenharEscritorioGold(ctx, {
            layout,
            personagens: estados.map(({ mesa, estado }) => ({ mesa, pose: poseDoEstado(estado, layout.corredorX) })),
            progressoDia: ambiente.progressoDia,
            tempo: tempoRef.current,
            reduzirMovimento,
            selecionadoId: agenteSelecionadoId,
            progressos: progressosDoQuadro,
          })
        } catch (erroVisual) {
          // Falha visual não deve afetar agentes, dados ou a navegação do painel.
          goldDisponivel = false
          console.warn('PixelOffice: desenho CT indisponível; usando desenho anterior.', erroVisual)
        }
      }
      if (!goldDisponivel) {
        ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0)
        ctx.clearRect(0, 0, layout.largura, layout.altura)
        desenharSala(); hitsRef.current = []
        estados.forEach(({ mesa, estado }) => {
          const ilha = layout.ilhas.find((item) => item.squad === mesa.execucao.squad)
          if (ilha) comTransformacaoDoAmbiente(ilha, () => desenharBoneco(mesa, estado)); else desenharBoneco(mesa, estado)
        })
      }
      canvas.dataset.officeActiveAway = String(estados.filter(({ mesa, estado }) => mesa.execucao.ativa && estado.fase !== 'trabalhando').length); canvas.dataset.officeWorking = String(estados.filter(({ estado }) => estado.fase === 'trabalhando').length); canvas.dataset.officeAgents = String(estados.length); canvas.dataset.officeColumns = String(layout.colunas); canvas.dataset.officeZoom = String(Math.round(zoom * 100)); canvas.dataset.officeNamePx = String((7.5 * zoom * dpr).toFixed(2)); canvas.dataset.officeCommercial = layout.ilhas.some((ilha) => ilha.squad === 'comercial') ? (squadsSobDemandaSaindo.has('comercial') ? 'saindo' : 'aberto') : 'fechado'; canvas.dataset.officeCoworking = String(layout.ilhas.find((ilha) => ilha.squad === SALA_MISTA)?.mesas.length || 0); canvas.dataset.officeRest = layout.descansoAberto ? 'aberto' : 'encolhido'; canvas.dataset.officeResting = String(layout.ocupantesDescanso); canvas.dataset.officeEnvironment = ambiente.fase; canvas.dataset.officeDayProgress = ambiente.progressoDia.toFixed(3); canvas.dataset.officeDemandSquads = layout.ilhas.filter((ilha) => SQUADS_SOB_DEMANDA.some((item) => item.id === ilha.squad)).map((ilha) => ilha.squad).join('|')
      quadro = requestAnimationFrame(desenhar)
    }
    quadro = requestAnimationFrame(desenhar)
    return () => { ativo = false; cancelAnimationFrame(quadro) }
  }, [agenteSelecionadoId, ambiente, dimensoesPalco.dpr, layout, pausado, reduzirMovimento, squadsSobDemandaSaindo, zoom])

  const selecionar = (chave: string) => aoSelecionarAgente?.(chave)
  const visualDoAgente = (agente: AgenteVivo) => todasExecucoes.find((visual) => visual.execucao === agente)
  const renderizarArvoreLancados = (nos: NoAgenteLancado[], nivel = 0) => (
    <ul className={nivel ? 'ml-3 border-l border-[#405655] pl-2' : 'space-y-1.5'} data-testid={nivel ? undefined : 'office-launched-tree'}>
      {nos.map((no) => {
        const visual = visualDoAgente(no.agente)
        const nome = visual?.nome || nomeLegivelDaExecucao(no.agente, resolverAgenteNoCatalogo(no.agente, catalogo))
        const tarefa = no.agente.tarefa || no.agente.descricao || no.agente.etapa || 'Sem tarefa no momento'
        const modelo = no.agente.modelo_legivel || no.agente.modelo || 'Modelo não informado'
        const esforco = no.agente.esforco || 'Esforço não informado'
        return (
          <li key={chaveAgente(no.agente.dono, no.agente.id)} className={nivel ? 'mt-1.5' : ''} data-testid={`office-launched-node-${no.agente.id}`}>
            <button
              type="button"
              onClick={() => visual && selecionar(visual.chave)}
              className="block w-full min-w-0 rounded-md border border-[#405655] bg-[#0d1e22] p-2 text-left hover:border-[#c1ec86] focus:outline-none focus:ring-2 focus:ring-[#c1ec86]"
              data-testid={`office-launched-agent-${no.agente.id}`}
            >
              <span className="block truncate text-xs font-semibold text-[#e8f0ec]" title={nome}>{nome}</span>
              <span className="mt-0.5 block break-words text-[10px] leading-4 text-[#aebfb8]">{tarefa}</span>
              <span className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 font-mono text-[9px] text-[#8fa7a1]">
                <span className="truncate" title={modelo}>{modelo}</span>
                <span>{esforco}</span>
              </span>
            </button>
            {no.filhos.length > 0 && renderizarArvoreLancados(no.filhos, nivel + 1)}
          </li>
        )
      })}
    </ul>
  )
  const tratarClique = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = evento.currentTarget.getBoundingClientRect(); const x = (evento.clientX - rect.left) / zoom; const y = (evento.clientY - rect.top) / zoom
    const hit = [...hitsRef.current].reverse().find((item) => x >= item.x && x <= item.x + item.largura && y >= item.y && y <= item.y + item.altura)
    if (hit?.modulo && hit.modulo in POR_ID) { abrirModulo(hit.modulo as VistaId); return }
    if (hit) selecionar(hit.chave)
  }
  const tratarTeclado = (evento: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '].includes(evento.key) || execucoesVisiveis.length === 0) return
    evento.preventDefault(); let indice = execucoesVisiveis.findIndex((execucao) => execucao.chave === agenteSelecionadoId); if (indice < 0) indice = 0
    if (evento.key.startsWith('Arrow')) { const direcao = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 1; indice = (indice + direcao + execucoesVisiveis.length) % execucoesVisiveis.length }
    selecionar(execucoesVisiveis[indice].chave)
  }

  const descricaoSonda = statusLeitura === 'confirmado' ? `Leitura ao vivo${recebidoEm ? ` · ${Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s` : ''}` : statusLeitura === 'consultando' ? 'Consultando dados vivos' : statusLeitura === 'leitura_vencida' ? `Leitura vencida · ${falhouHaSegundos ?? 0}s` : erroSonda || 'Sonda indisponível'

  return (
    <div className="ct-office" data-testid="pixel-office" data-office-visual="ct-gold" data-office-columns={layout.colunas} data-office-environment={ambiente.fase} data-office-day-progress={ambiente.progressoDia.toFixed(3)} data-office-commercial={layout.ilhas.some((ilha) => ilha.squad === 'comercial') ? 'aberto' : 'fechado'} data-office-rest={layout.descansoAberto ? 'aberto' : 'encolhido'} data-office-resting={layout.ocupantesDescanso}>
      <header className="ct-header">
        <div className="ct-brand"><img src={logoCasal} alt="Casal do Tráfego — CT" width={54} height={54} /><div><span className="ct-kicker">CASAL DO TRÁFEGO / PAINEL OS</span><h2>O escritório da sua operação.</h2></div></div>
        <div className="ct-header-status"><span className="ct-tag" data-testid="office-environment">{ambiente.rotulo}</span><span className={`ct-tag ${statusLeitura === 'confirmado' ? 'ct-tag-live' : ''}`} title={descricaoSonda}><i className={`ct-dot ${statusLeitura === 'confirmado' ? 'ct-dot-green' : 'ct-dot-amber'}`} />{statusLeitura === 'confirmado' ? 'AO VIVO' : 'VERIFICAR SONDA'}</span>{aoAbrirCerebro && <button type="button" className="ct-button" onClick={aoAbrirCerebro}>Cérebro ↗</button>}</div>
      </header>
      <div className="ct-body">
        <div role="region" className="ct-main" aria-label="Escritório e painéis operacionais">
          <ParedeEscritorio uso={estado?.uso_planos} gastos={gastosIA} tarefas={tarefasDaParede} tarefasSolicitadas={tarefasSolicitadas} descricaoSonda={descricaoSonda} leituraConfirmada={statusLeitura === 'confirmado'} />
          <div className="ct-toolbar" role="toolbar" aria-label="Controles do escritório">
            <span className="ct-room-label"><i className="ct-dot ct-dot-amber" />Escritório vivo <span className="ct-tag">{execucoesVisiveis.length} visíveis</span></span>
            <button type="button" className="ct-button" onClick={() => aoAlternarSoAtivos?.(!soAtivos)} aria-pressed={soAtivos}>Só ativos</button>
            <button type="button" className="ct-button" onClick={() => setPausado((valor) => !valor)} aria-pressed={pausado}>{pausado ? 'Retomar' : 'Pausar'}</button>
            <div className="ct-zoom"><button type="button" aria-label="Afastar sala" onClick={() => setZoom((valor) => limitar(valor - 0.1, ZOOM_MIN, zoomMaximoSeguro))}>−</button><button type="button" title="Repor enquadramento" onClick={() => setZoom(zoomAutomaticoRef.current)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="Aproximar sala" onClick={() => setZoom((valor) => limitar(valor + 0.1, ZOOM_MIN, zoomMaximoSeguro))}>+</button></div>
          </div>
          <section className="ct-room" aria-label="Sala interativa em perspectiva">
            <div ref={palcoRef} className="ct-room-scroll" data-testid="office-scroll-room"><canvas ref={canvasRef} tabIndex={0} role="group" aria-label={`Escritório com ${execucoesVisiveis.length} agentes. Use as setas para escolher ou toque um boneco.`} onClick={tratarClique} onKeyDown={tratarTeclado} /></div>
          </section>
          <footer className="ct-room-footer">
            <span>{layout.ilhas.length} ambientes visíveis · {totalFixos} fixos{totalExtras ? ` · ${totalExtras} extras` : ''} · {layout.colunas} colunas</span>
            <span className="ct-legend" aria-label="Legenda de cores dos ambientes" data-testid="office-squad-legend">{squadsVisiveis.map((squad) => <span key={squad.id}><i style={{ backgroundColor: squad.cor }} />{squad.nome}</span>)}</span>
            <span>Selecione pelo nome ou pelo boneco · Aproximar mantém a sala rolável</span>
          </footer>
        </div>
        <aside className="ct-inspector" aria-label="Detalhe do agente">
          <span className="ct-kicker">OPERAÇÃO / AGENTES</span><h3>Inteligência<br />em movimento.</h3>
          <div className="ct-stats"><div className="ct-stat"><strong>{totalAtivos}</strong><span>Trabalhando / catálogo vivo</span></div><div className="ct-stat"><strong>{layout.ocupantesDescanso}</strong><span>Descansando / sala visível</span></div><div className="ct-stat"><strong>{execucoesVisiveis.length}</strong><span>Agentes visíveis</span></div><div className="ct-stat"><strong>{layout.ilhas.length}</strong><span>Ambientes abertos</span></div></div>
          {selecionada && agenteSelecionadoId ? <div className="ct-selection">
            <div className="ct-selection-header"><span className="ct-director-avatar" style={{ borderColor: selecionada.cor }} aria-hidden="true">{selecionada.nome.slice(0, 1)}</span><div><h4 data-testid="office-agent-name">{selecionada.nome}</h4><div className="ct-squad">{selecionada.squadNome}{selecionada.squad === SALA_MISTA ? ' · COMPARTILHADO' : selecionada.temporaria ? ' · TEMPORÁRIO' : ' · FIXO'}</div></div></div>
            <div className="ct-phase">{rotuloFase(faseSelecionada, selecionada.ativa)}</div>
            <p>{selecionada.execucao.tarefa || selecionada.execucao.descricao || selecionada.execucao.etapa || selecionada.ficha?.papel || 'Sem tarefa no momento'}</p>
            <dl className="ct-fields">
              <div><dt>Ferramenta</dt><dd>{selecionada.execucao.ferramenta || '—'}</dd></div>
              <div><dt>Estado da sonda</dt><dd>{selecionada.execucao.estado === 'trabalhando' ? 'Trabalhando' : selecionada.execucao.estado === 'silencioso' ? 'Silencioso' : 'Parado'}</dd></div>
              <div><dt>Modelo</dt><dd>{selecionada.execucao.modelo_legivel || selecionada.execucao.modelo || '—'}</dd></div>
              <div><dt>Esforço</dt><dd>{selecionada.execucao.esforco || '—'}</dd></div>
              <div><dt>Função</dt><dd>{funcaoLegivelDaExecucao(selecionada.execucao, selecionada.ficha)}</dd></div>
            </dl>
            <details className="ct-relations"><summary>Agentes lançados por esta execução</summary>{renderizarArvoreLancados(montarArvoreLancadosPor(agentes, referenciasDoAgente(selecionada.execucao)))}</details>
          </div> : <div className="ct-selection"><p>Selecione um boneco para ver sua execução aqui. Os detalhes aparecem uma única vez, sem substituir as tarefas solicitadas.</p></div>}
          <details className="nx-launchers"><summary>Execuções por lançador</summary><ListaDeLancadores grupos={gruposLancadores} catalogo={catalogo} execucoes={todasExecucoes} aoSelecionar={selecionar} /></details>
          <div className="nx-squad-list"><h4>Ambientes abertos</h4>{layout.ilhas.map(ilha => <div key={ilha.squad}><span><i style={{ backgroundColor: ilha.cor }} />{ilha.nome}</span><b>{ilha.mesas.length}</b></div>)}</div>
          <p className="ct-inspector-note">Trabalhando: vai à mesa e permanece digitando.<br />Silencioso: permanece na mesa.<br />Parado: segue o descanso configurado.<br />Abertura dos ambientes e presença vêm da operação, não do desenho.</p>
        </aside>
      </div>
      <div className="ct-sr-only" role="region" aria-label="Lista acessível de agentes do escritório"><ul>{execucoesVisiveis.map((execucao) => <li key={execucao.animacaoChave}><button type="button" onClick={() => selecionar(execucao.chave)}>{execucao.nome} — {execucao.execucao.estado} — {execucao.squadNome}</button></li>)}</ul></div>
      <span className="ct-sr-only" aria-live="polite">{relogioDetalhe ? '' : ''}</span>
    </div>
  )
}
