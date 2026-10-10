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
      modelo: sessao.motores?.modelo ?? null,
      modelo_legivel: sessao.motores?.modelo ?? null,
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
  const hoverIdRef = useRef<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [dimensoesPalco, setDimensoesPalco] = useState({ largura: 900, altura: 600, dpr: 1, larguraFisica: 900 })
  const [pausado, setPausado] = useState(false)
  const [reduzirMovimento, setReduzirMovimento] = useState(false)
  const [relogioDetalhe, setRelogioDetalhe] = useState(0)
  const [agoraAmbiente, setAgoraAmbiente] = useState(() => new Date())
  const { dados: dadosSonda, statusLeitura, recebidoEm, falhouHaSegundos, erro: erroSonda } = useAgentesVivos()

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

  const [termoBusca, setTermoBusca] = useState('')
  const [abaEscritorio, setAbaEscritorio] = useState<'escritorio' | 'lista' | 'desempenho'>('escritorio')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativos' | 'descanso' | 'ociosos'>(soAtivos ? 'ativos' : 'todos')

  useEffect(() => {
    if (soAtivos && filtroStatus !== 'ativos') {
      setFiltroStatus('ativos')
    } else if (!soAtivos && filtroStatus === 'ativos') {
      setFiltroStatus('todos')
    }
  }, [soAtivos])

  const todasExecucoes = useMemo(() => montarExecucoesVisuais(agentes, catalogo, estado), [agentes, catalogo, estado])
  const { abertos: squadsSobDemandaAbertos, saindo: squadsSobDemandaSaindo } = useSquadsSobDemanda(todasExecucoes)
  const execucoesVisiveis = useMemo(() => {
    let filtradas = todasExecucoes
    if (filtroStatus === 'ativos' || soAtivos) {
      filtradas = filtradas.filter((execucao) => execucao.ativa)
    } else if (filtroStatus === 'descanso') {
      filtradas = filtradas.filter((execucao) => execucao.execucao.estado === 'parado')
    } else if (filtroStatus === 'ociosos') {
      filtradas = filtradas.filter((execucao) => execucao.execucao.estado === 'silencioso')
    }

    if (termoBusca.trim()) {
      const termo = termoBusca.toLowerCase().trim()
      filtradas = filtradas.filter((execucao) =>
        execucao.nome.toLowerCase().includes(termo) ||
        execucao.squadNome.toLowerCase().includes(termo) ||
        Boolean(execucao.execucao.papel && execucao.execucao.papel.toLowerCase().includes(termo))
      )
    }

    return filtrarSquadsSobDemanda(filtradas, squadsSobDemandaAbertos)
  }, [filtroStatus, soAtivos, squadsSobDemandaAbertos, termoBusca, todasExecucoes])
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
  const totalDescanso = todasExecucoes.filter((execucao) => execucao.execucao.estado === 'parado').length
  const totalOciosos = todasExecucoes.filter((execucao) => execucao.execucao.estado === 'silencioso').length
  const totalGeral = todasExecucoes.length
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
    let ativo = true
    let quadro = 0
    let anterior = performance.now()
    let ultimoDetalhe = 0
    const progressosDoQuadro = new Map<PixelAgentSquad, number>()
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
      try {
        hitsRef.current = desenharEscritorioGold(ctx, {
          layout,
          personagens: estados.map(({ mesa, estado }) => ({ mesa, pose: poseDoEstado(estado, layout.corredorX) })),
          progressoDia: ambiente.progressoDia,
          tempo: tempoRef.current,
          reduzirMovimento,
          selecionadoId: agenteSelecionadoId,
          hoverId: hoverIdRef.current,
          progressos: progressosDoQuadro,
        })
      } catch (erroVisual) {
        console.warn('PixelOffice: erro na renderização visual CT.', erroVisual)
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
  const tratarMovimento = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = evento.currentTarget.getBoundingClientRect()
    const x = (evento.clientX - rect.left) / zoom
    const y = (evento.clientY - rect.top) / zoom
    const hit = [...hitsRef.current].reverse().find((item) => x >= item.x && x <= item.x + item.largura && y >= item.y && y <= item.y + item.altura)
    if (hit) {
      evento.currentTarget.style.cursor = 'pointer'
      hoverIdRef.current = hit.chave
    } else {
      evento.currentTarget.style.cursor = 'default'
      hoverIdRef.current = null
    }
  }
  const tratarSaida = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    evento.currentTarget.style.cursor = 'default'
    hoverIdRef.current = null
  }
  const tratarTeclado = (evento: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '].includes(evento.key) || execucoesVisiveis.length === 0) return
    evento.preventDefault(); let indice = execucoesVisiveis.findIndex((execucao) => execucao.chave === agenteSelecionadoId); if (indice < 0) indice = 0
    if (evento.key.startsWith('Arrow')) { const direcao = evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 1; indice = (indice + direcao + execucoesVisiveis.length) % execucoesVisiveis.length }
    selecionar(execucoesVisiveis[indice].chave)
  }

  const descricaoSonda = statusLeitura === 'confirmado' ? `Leitura ao vivo${recebidoEm ? ` · ${Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s` : ''}` : statusLeitura === 'consultando' ? 'Consultando dados vivos' : statusLeitura === 'leitura_vencida' ? `Leitura vencida · ${falhouHaSegundos ?? 0}s` : erroSonda || 'Sonda indisponível'

  // Cada item vem de uma checagem própria, nunca de um único booleano da sonda.
  // Sem fonte real pra uma afirmação, o item fica indeterminado: nunca inventa sucesso.
  const saudeOperacao = useMemo(() => {
    type EstadoChecagem = 'ok' | 'alerta' | 'falha' | 'indeterminado'
    const severidade: Record<EstadoChecagem, number> = { ok: 0, indeterminado: 1, alerta: 2, falha: 3 }
    const piorDe = (a: EstadoChecagem, b: EstadoChecagem): EstadoChecagem => (severidade[b] > severidade[a] ? b : a)

    const instanteLeitura = recebidoEm ? `${Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s atrás` : null

    const apiItem: { estado: EstadoChecagem; texto: string } =
      statusLeitura === 'confirmado'
        ? { estado: 'ok', texto: `APIs conectadas${instanteLeitura ? ` · ${instanteLeitura}` : ''}` }
        : statusLeitura === 'consultando'
        ? { estado: 'indeterminado', texto: 'APIs: consultando agora' }
        : statusLeitura === 'leitura_vencida'
        ? { estado: 'alerta', texto: `APIs com leitura vencida · ${falhouHaSegundos ?? 0}s` }
        : { estado: 'falha', texto: `APIs indisponíveis${erroSonda ? ` · ${erroSonda}` : ''}` }

    // 'confirmado' é a única leitura fresca. 'leitura_vencida' ainda tem dado, mas
    // desatualizado: nenhuma afirmação derivada dele pode sair como 'ok'.
    const pisoFrescor: EstadoChecagem = statusLeitura === 'confirmado' ? 'ok' : statusLeitura === 'leitura_vencida' ? 'alerta' : 'indeterminado'
    const temDados = Boolean(dadosSonda) && statusLeitura !== 'indisponivel'

    // Ausência do campo é diferente de zero confirmado: payload sem 'avisos' ou
    // sem 'contagem' não prova que não há problema, só que ninguém checou.
    const temContagem = Boolean(dadosSonda?.contagem)
    const temAvisos = Array.isArray(dadosSonda?.avisos)
    const avisosSonda = temAvisos ? (dadosSonda!.avisos as string[]).length : 0
    const indeterminados = temContagem ? dadosSonda!.contagem.indeterminados ?? 0 : 0
    const listaAgentes = Array.isArray(dadosSonda?.agentes) ? dadosSonda!.agentes : []
    // Saúde agregada não basta: um agente pode ter contagem zerada no todo e
    // ainda assim trazer problema/status de erro individual.
    const agentesComProblema = listaAgentes.filter(
      (agente) => Boolean(agente?.problema) || agente?.status === 'erro' || agente?.status === 'falha'
    ).length
    // Cada sinal (aviso, indeterminado, problema individual) é lido se o campo
    // que o carrega estiver presente, mesmo que outro campo falte: campo ausente
    // nunca é promovido a zero, mas também não apaga um alerta que outro campo
    // já confirmou. Só a afirmação final de 'saudável' exige os três presentes.
    const agentesItem: { estado: EstadoChecagem; texto: string } = !temDados
      ? { estado: 'indeterminado', texto: 'Agentes: não verificado' }
      : agentesComProblema > 0
      ? { estado: 'falha', texto: `${agentesComProblema} agente(s) com problema reportado` }
      : temAvisos && avisosSonda > 0
      ? { estado: piorDe('alerta', pisoFrescor), texto: `Agentes com ${avisosSonda} aviso${avisosSonda > 1 ? 's' : ''} da sonda` }
      : temContagem && indeterminados > 0
      ? { estado: piorDe('alerta', pisoFrescor), texto: `${indeterminados} agente(s) com estado indeterminado` }
      : !temContagem || !temAvisos
      ? { estado: 'indeterminado', texto: 'Agentes: não verificado' }
      : { estado: pisoFrescor, texto: pisoFrescor === 'alerta' ? 'Agentes saudáveis (leitura vencida)' : 'Agentes saudáveis' }

    const contagem = dadosSonda?.contagem
    const fluxosItem: { estado: EstadoChecagem; texto: string } = !temDados || !contagem
      ? { estado: 'indeterminado', texto: 'Fluxos: não verificado' }
      : { estado: pisoFrescor, texto: `${contagem.trabalhando} em execução · ${contagem.silencioso} em espera${pisoFrescor === 'alerta' ? ' (leitura vencida)' : ''}` }

    // Nenhuma fonte de infraestrutura (CPU, disco, uptime de serviço) chega
    // a este componente. Afirmar aqui seria inventar sucesso sem checagem.
    const infraItem: { estado: EstadoChecagem; texto: string } = { estado: 'indeterminado', texto: 'Infraestrutura: não verificado' }

    const itens = [apiItem, agentesItem, fluxosItem, infraItem]
    const pior = itens.reduce<EstadoChecagem>((acc, item) => piorDe(acc, item.estado), 'ok')
    return { itens, pior }
  }, [dadosSonda, erroSonda, falhouHaSegundos, recebidoEm, statusLeitura])

  const PILL_POR_ESTADO: Record<string, { texto: string; classe: string; dot: string }> = {
    ok: { texto: 'Tudo verificado, sem alertas', classe: '', dot: 'ct-dot-green' },
    alerta: { texto: 'Atenção: alerta ativo', classe: 'ct-health-pill-alerta', dot: 'ct-dot-amber' },
    falha: { texto: 'Falha detectada', classe: 'ct-health-pill-falha', dot: 'ct-dot-falha' },
    indeterminado: { texto: 'Parcialmente verificado', classe: 'ct-health-pill-indeterminado', dot: 'ct-dot-indeterminado' },
  }
  const SIMBOLO_POR_ESTADO: Record<string, string> = { ok: '✓', alerta: '⚠', falha: '✕', indeterminado: '–' }
  const CLASSE_CHECK_POR_ESTADO: Record<string, string> = { ok: 'ct-check', alerta: 'ct-check-alerta', falha: 'ct-check-falha', indeterminado: 'ct-check-indeterminado' }
  const pillSaude = PILL_POR_ESTADO[saudeOperacao.pior]

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
            <div className="ct-toolbar-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={abaEscritorio === 'escritorio'}
                className={`ct-tab-btn ${abaEscritorio === 'escritorio' ? 'ct-tab-active' : ''}`}
                onClick={() => setAbaEscritorio('escritorio')}
              >
                <span aria-hidden="true">💺</span> Escritório IA
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={abaEscritorio === 'lista'}
                className={`ct-tab-btn ${abaEscritorio === 'lista' ? 'ct-tab-active' : ''}`}
                onClick={() => setAbaEscritorio('lista')}
              >
                <span aria-hidden="true">☰</span> Lista de Agentes
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={abaEscritorio === 'desempenho'}
                className={`ct-tab-btn ${abaEscritorio === 'desempenho' ? 'ct-tab-active' : ''}`}
                onClick={() => setAbaEscritorio('desempenho')}
              >
                <span aria-hidden="true">📊</span> Desempenho
              </button>
            </div>

            <div className="ct-filter-pills" role="radiogroup" aria-label="Filtrar por status">
              <button
                type="button"
                role="radio"
                aria-checked={filtroStatus === 'todos'}
                className={`ct-pill ${filtroStatus === 'todos' ? 'ct-pill-active-gold' : ''}`}
                onClick={() => {
                  setFiltroStatus('todos')
                  aoAlternarSoAtivos?.(false)
                }}
              >
                Todos ({totalGeral})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={filtroStatus === 'ativos'}
                className={`ct-pill ${filtroStatus === 'ativos' ? 'ct-pill-active-dark' : ''}`}
                onClick={() => {
                  setFiltroStatus('ativos')
                  aoAlternarSoAtivos?.(true)
                }}
              >
                <i className="ct-dot ct-dot-green" /> Ativos ({totalAtivos})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={filtroStatus === 'descanso'}
                className={`ct-pill ${filtroStatus === 'descanso' ? 'ct-pill-active-dark' : ''}`}
                onClick={() => {
                  setFiltroStatus('descanso')
                  aoAlternarSoAtivos?.(false)
                }}
              >
                <i className="ct-dot ct-dot-amber" /> Em descanso ({totalDescanso})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={filtroStatus === 'ociosos'}
                className={`ct-pill ${filtroStatus === 'ociosos' ? 'ct-pill-active-dark' : ''}`}
                onClick={() => {
                  setFiltroStatus('ociosos')
                  aoAlternarSoAtivos?.(false)
                }}
              >
                <i className="ct-dot" style={{ backgroundColor: '#94a3b8' }} /> Ociosos ({totalOciosos})
              </button>
            </div>

            <div className="ct-search-box">
              <span className="ct-search-icon" aria-hidden="true">🔍</span>
              <input
                type="text"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
                placeholder="Buscar agente..."
                aria-label="Buscar agente pelo nome ou squad"
                className="ct-search-input"
              />
              {termoBusca && (
                <button type="button" onClick={() => setTermoBusca('')} className="ct-search-clear">×</button>
              )}
            </div>

            <div className="ct-toolbar-actions">
              <button
                type="button"
                className="ct-button"
                onClick={() => aoAlternarSoAtivos?.(!soAtivos)}
                aria-pressed={soAtivos}
              >
                Só ativos
              </button>
              <button
                type="button"
                className="ct-button"
                onClick={() => setPausado((valor) => !valor)}
                aria-pressed={pausado}
              >
                {pausado ? 'Retomar' : 'Pausar'}
              </button>
              <div className="ct-zoom">
                <button
                  type="button"
                  aria-label="Afastar sala"
                  onClick={() => setZoom((valor) => limitar(valor - 0.1, ZOOM_MIN, zoomMaximoSeguro))}
                >
                  −
                </button>
                <button
                  type="button"
                  title="Repor enquadramento"
                  onClick={() => setZoom(zoomAutomaticoRef.current)}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  aria-label="Aproximar sala"
                  onClick={() => setZoom((valor) => limitar(valor + 0.1, ZOOM_MIN, zoomMaximoSeguro))}
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <section className="ct-room" aria-label="Sala interativa em perspectiva">
            <div
              ref={palcoRef}
              className="ct-room-scroll"
              data-testid="office-scroll-room"
              style={{ display: abaEscritorio === 'escritorio' ? 'block' : 'none' }}
            >
              <canvas
                ref={canvasRef}
                tabIndex={0}
                role="group"
                aria-label={`Escritório com ${execucoesVisiveis.length} agentes. Use as setas para escolher ou toque um boneco.`}
                onClick={tratarClique}
                onMouseMove={tratarMovimento}
                onMouseLeave={tratarSaida}
                onKeyDown={tratarTeclado}
              />
            </div>

            {abaEscritorio === 'lista' && (
              <div className="ct-tab-list-view" data-testid="office-agent-list">
                <table className="ct-agent-table">
                  <thead>
                    <tr>
                      <th scope="col">Agente</th>
                      <th scope="col">Squad</th>
                      <th scope="col">Status</th>
                      <th scope="col">Ferramenta</th>
                      <th scope="col">Modelo</th>
                      <th scope="col">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucoesVisiveis.map((item) => (
                      <tr key={item.chave} className={item.chave === agenteSelecionadoId ? 'ct-row-selected' : ''}>
                        <td>
                          <strong>{item.nome}</strong>
                          {item.execucao.tarefa && <small title={item.execucao.tarefa}>{item.execucao.tarefa}</small>}
                        </td>
                        <td>
                          <span className="ct-squad-badge" style={{ borderColor: item.cor }}>
                            <i style={{ backgroundColor: item.cor }} /> {item.squadNome}
                          </span>
                        </td>
                        <td>
                          <span className={`ct-status-pill ${item.ativa ? 'ct-pill-active' : item.execucao.estado === 'silencioso' ? 'ct-pill-idle' : 'ct-pill-rest'}`}>
                            {item.ativa ? 'Ativo' : item.execucao.estado === 'silencioso' ? 'Silencioso' : 'Em descanso'}
                          </span>
                        </td>
                        <td>{item.execucao.ferramenta || '—'}</td>
                        <td>{item.execucao.modelo_legivel || item.execucao.modelo || '—'}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => selecionar(item.chave)}
                            className="ct-inspect-btn"
                          >
                            Inspecionar ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!execucoesVisiveis.length && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                          Nenhum agente corresponde aos filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {abaEscritorio === 'desempenho' && (
              <div className="ct-tab-perf-view" data-testid="office-perf-view">
                <div className="ct-perf-grid">
                  <div className="ct-perf-card">
                    <span className="ct-perf-kicker">TAXA DE ATIVIDADE</span>
                    <strong>{totalGeral > 0 ? Math.round((totalAtivos / totalGeral) * 100) : 0}%</strong>
                    <p>{totalAtivos} de {totalGeral} agentes ativos na operação</p>
                  </div>
                  <div className="ct-perf-card">
                    <span className="ct-perf-kicker">EM DESCANSO</span>
                    <strong>{totalDescanso}</strong>
                    <p>Agentes no lounge aguardando novas demandas</p>
                  </div>
                  <div className="ct-perf-card">
                    <span className="ct-perf-kicker">SILENCIOSOS</span>
                    <strong>{totalOciosos}</strong>
                    <p>Postos de prontidão sem processos ativos</p>
                  </div>
                  <div className="ct-perf-card">
                    <span className="ct-perf-kicker">SQUADS ATIVOS</span>
                    <strong>{layout.ilhas.length}</strong>
                    <p>Ambientes estruturados em funcionamento</p>
                  </div>
                </div>
                <div className="ct-perf-breakdown">
                  <h4>Distribuição de postos por squad</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                    {layout.ilhas.map((ilha) => (
                      <div key={ilha.squad} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ilha.cor }} />
                          <strong>{ilha.nome}</strong>
                        </span>
                        <span style={{ fontFamily: 'monospace', color: '#facc15' }}>{ilha.mesas.length} posições</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
          <footer className="ct-room-footer">
            <span>{layout.ilhas.length} ambientes visíveis · {totalFixos} fixos{totalExtras ? ` · ${totalExtras} extras` : ''} · {layout.colunas} colunas</span>
            <span className="ct-legend" aria-label="Legenda de cores dos ambientes" data-testid="office-squad-legend">{squadsVisiveis.map((squad) => <span key={squad.id}><i style={{ backgroundColor: squad.cor }} />{squad.nome}</span>)}</span>
            <span>Selecione pelo nome ou pelo boneco · Aproximar mantém a sala rolável</span>
          </footer>
        </div>
        <aside className="ct-inspector" aria-label="Detalhe do agente">
          <span className="ct-kicker">OPERAÇÃO / AGENTES</span>
          <h3>Inteligência<br />em movimento.</h3>
          <p className="ct-inspector-subtitle">AGENTES TRABALHAM ENQUANTO VOCÊ VAI MAIS LONGE.</p>

          <div className="ct-section-summary">
            <div className="ct-summary-title">
              <span>Agentes</span>
              <span className="ct-summary-total">{totalGeral} posições totais</span>
            </div>
            <div className="ct-status-breakdown">
              <div><i className="ct-dot ct-dot-green" /> <span>{totalAtivos} ativos</span></div>
              <div><i className="ct-dot ct-dot-amber" /> <span>{totalDescanso} em descanso</span></div>
              <div><i className="ct-dot" style={{ backgroundColor: '#94a3b8' }} /> <span>{totalOciosos} ociosos</span></div>
            </div>
          </div>

          <div className="ct-section-summary">
            <div className="ct-summary-title">
              <span>Squads</span>
              <span className="ct-summary-total">{layout.ilhas.length}</span>
            </div>
            <div className="nx-squad-list">
              {layout.ilhas.map(ilha => (
                <div key={ilha.squad} className="ct-squad-item">
                  <span><i style={{ backgroundColor: ilha.cor }} />{ilha.nome}</span>
                  <b>{ilha.mesas.length} <span>›</span></b>
                </div>
              ))}
            </div>
          </div>

          <div className="ct-section-summary ct-op-health">
            <div className="ct-summary-title">
              <span>Status da operação</span>
            </div>
            <div className="ct-health-status">
              <span className={`ct-health-pill ${pillSaude.classe}`} title={descricaoSonda}><i className={`ct-dot ${pillSaude.dot}`} /> {pillSaude.texto}</span>
              <ul className="ct-health-list">
                {saudeOperacao.itens.map((item, indice) => (
                  <li key={indice}><span className={CLASSE_CHECK_POR_ESTADO[item.estado]}>{SIMBOLO_POR_ESTADO[item.estado]}</span> {item.texto}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="ct-quote-box">
            <p>“Disciplina hoje.<br />Liberdade amanhã.”</p>
          </div>

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
          <p className="ct-inspector-note">Trabalhando: vai à mesa e permanece digitando.<br />Silencioso: permanece na mesa.<br />Parado: segue o descanso configurado.<br />Abertura dos ambientes e presença vêm da operação, não do desenho.</p>
        </aside>
      </div>
      <div className="ct-sr-only" role="region" aria-label="Lista acessível de agentes do escritório"><ul>{execucoesVisiveis.map((execucao) => <li key={execucao.animacaoChave}><button type="button" onClick={() => selecionar(execucao.chave)}>{execucao.nome} — {execucao.execucao.estado} — {execucao.squadNome}</button></li>)}</ul></div>
      <span className="ct-sr-only" aria-live="polite">{relogioDetalhe ? '' : ''}</span>
    </div>
  )
}
