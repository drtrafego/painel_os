/** Adaptadores de LEITURA. Não criam tarefas, agentes, cobranças ou estimativas. */
import type { TarefasDiretores, UsoPlanos } from '../dados/tipos'

export interface GastoIA {
  id: string
  nome: string
  valor: number | null
  /** ISO 4217 fornecido pela fonte. Moedas diferentes nunca são somadas. */
  moeda: string
}
export interface GastosIA {
  periodo: string
  atualizadoEm: string | null
  itens: readonly GastoIA[]
  /** Descrição da origem real (fatura, API de billing etc.). */
  fonte: string
}
export interface TarefaParede {
  chave: string
  nome: string
  ordem: number
  titulo: string
  prioridade: 'P0' | 'P1' | 'P2' | 'P3'
  data: string | null
  dependeDe: string | null
  estado: 'ativa' | 'bloqueada' | 'concluida'
  emAndamento: boolean
  semProximoPasso: boolean
  subtarefas: Array<{ titulo: string; ordem: number; estado: 'ativa' | 'bloqueada' | 'concluida' }>
}
export interface ColunaTarefas {
  id: 'renato' | 'luana'
  nome: string
  tarefas: TarefaParede[]
  avisos: string[]
  lidoEm: string | null
  restantes: number
}
export interface UsoParede {
  id: string
  nome: string
  janela: string
  percentual: number | null
  semanaPercentual?: number | null
  semanaJanelaDias?: number | null
  semanaOficial?: boolean
  tokens: number | null
  observado: boolean
  nota: string
}
export function numeroMedido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : null
}
export function textoMedido(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}
export function formatarNumero(valor: number | null): string {
  const n = numeroMedido(valor)
  return n === null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, notation: n >= 10000 ? 'compact' : 'standard' }).format(n)
}
export function formatarDinheiro(valor: number | null, moeda: string): string {
  const n = numeroMedido(valor)
  if (n === null) return '—'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda.trim().toUpperCase(), maximumFractionDigits: 2 }).format(n)
  } catch { return `${formatarNumero(n)} ${moeda}` }
}
export function totalizarGastos(dados?: GastosIA | null): Array<{ moeda: string; valor: number | null }> {
  const totais = new Map<string, number | null>()
  for (const item of dados?.itens || []) {
    const moeda = textoMedido(item.moeda)?.toUpperCase()
    if (!moeda) continue
    const valor = numeroMedido(item.valor)
    const anterior = totais.get(moeda)
    totais.set(moeda, anterior === null || valor === null ? null : (anterior ?? 0) + valor)
  }
  return Array.from(totais, ([moeda, valor]) => ({ moeda, valor }))
}
export function montarUsoParede(uso?: UsoPlanos): UsoParede[] {
  const claude = uso?.claude, codex = uso?.codex
  return [
    { id: 'claude', nome: 'Claude', janela: 'Sessão · 5 horas',
      percentual: numeroMedido(claude?.sessao_5h_percentual), tokens: numeroMedido(claude?.tokens_24h_estimativa),
      semanaPercentual: numeroMedido(claude?.semana_7d_percentual),
      semanaJanelaDias: numeroMedido(claude?.semana_7d_janela_dias) ?? 7,
      semanaOficial: claude?.semana_7d_fonte_percentual_oficial === true,
      observado: uso?.status === 'pronto' && claude?.fonte_percentual_oficial === true,
      nota: claude?.fonte_percentual_oficial ? 'Percentual oficial do plano' : 'Origem oficial não confirmada' },
    { id: 'codex', nome: 'Codex', janela: codex?.primario_janela_dias ? `Janela · ${codex.primario_janela_dias} dias` : 'Janela primária',
      percentual: numeroMedido(codex?.primario_percentual), tokens: numeroMedido(codex?.tokens_24h_estimativa),
      observado: uso?.status === 'pronto', nota: codex?.conta_compartilhada ? 'Conta compartilhada' : textoMedido(codex?.plano) || 'Plano não informado' },
  ]
}
/** A parede de tarefas lê o contrato próprio, separado da presença dos agentes. */
export function montarTarefasParede(tarefas?: TarefasDiretores | null): ColunaTarefas[] {
  return (['renato', 'luana'] as const).map(id => {
    const pacote = tarefas?.[id]
    return {
      id,
      nome: id === 'renato' ? 'Renato' : 'Luana',
      tarefas: (pacote?.itens || []).map(item => ({
        chave: item.chave,
        nome: item.responsavel,
        ordem: item.ordem,
        titulo: item.titulo,
        prioridade: item.prioridade,
        data: item.data,
        dependeDe: item.depende_de,
        estado: item.estado_tarefa,
        emAndamento: item.em_andamento,
        semProximoPasso: item.sem_proximo_passo === true,
        subtarefas: (item.subtarefas || []).map((subtarefa) => ({
          titulo: subtarefa.titulo,
          ordem: subtarefa.ordem,
          estado: subtarefa.estado,
        })),
      })),
      avisos: pacote?.avisos || [],
      lidoEm: pacote?.lido_em || null,
      restantes: numeroMedido(pacote?.restantes) ?? 0,
    }
  })
}
