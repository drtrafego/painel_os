/** Adaptadores de LEITURA. Não criam tarefas, agentes, cobranças ou estimativas. */
import type { AgenteVivo, UsoPlanos } from '../dados/tipos'
import type { GrupoLancador } from '../dados/lancadores'

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
  titulo: string
  estado: AgenteVivo['estado']
  ferramenta: string | null
}
export interface ColunaTarefas {
  id: 'renato' | 'luana'
  nome: string
  tarefas: TarefaParede[]
}
export interface UsoParede {
  id: string
  nome: string
  janela: string
  percentual: number | null
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
      observado: uso?.status === 'pronto' && claude?.fonte_percentual_oficial === true,
      nota: claude?.fonte_percentual_oficial ? 'Percentual oficial do plano' : 'Origem oficial não confirmada' },
    { id: 'codex', nome: 'Codex', janela: codex?.primario_janela_dias ? `Janela · ${codex.primario_janela_dias} dias` : 'Janela primária',
      percentual: numeroMedido(codex?.primario_percentual), tokens: numeroMedido(codex?.tokens_24h_estimativa),
      observado: uso?.status === 'pronto', nota: codex?.conta_compartilhada ? 'Conta compartilhada' : textoMedido(codex?.plano) || 'Plano não informado' },
  ]
}
/** Usa os grupos do algoritmo EXISTENTE; nunca infere o lançador pelo nome. */
export function montarTarefasParede(
  grupos: readonly GrupoLancador[],
  resolver: (agente: AgenteVivo) => { chave: string; nome: string } | undefined,
): ColunaTarefas[] {
  return (['renato', 'luana'] as const).map(id => {
    const grupo = grupos.find(g => g.id === id)
    const vistas = new Set<string>()
    const tarefas: TarefaParede[] = []
    for (const agente of grupo?.agentes || []) {
      const visual = resolver(agente)
      // Sem visual identificável não inventamos um alvo clicável.
      if (!visual || vistas.has(visual.chave)) continue
      vistas.add(visual.chave)
      tarefas.push({ chave: visual.chave, nome: visual.nome,
        titulo: textoMedido(agente.tarefa) || textoMedido(agente.descricao) || textoMedido(agente.etapa) || 'Tarefa não informada',
        estado: agente.estado, ferramenta: textoMedido(agente.ferramenta) })
    }
    return { id, nome: id === 'renato' ? 'Renato' : 'Luana', tarefas }
  })
}
