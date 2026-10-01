import type { UsoPlanos } from '../../dados/tipos'

export interface CotaJanela {
  horas: 5 | 168
  percentual: number | null
  reiniciaEm: string | number | null
  observacao: string
}
export interface CotaProvedor { id: string; nome: string; janelas: [CotaJanela, CotaJanela] }
export interface TarefaSolicitada { id: string; diretor: 'renato' | 'luana'; tarefa: string; dataSolicitada: string | null }
export interface QuadroTarefasSolicitadas {
  status: 'pronto' | 'erro' | 'nao_conectado'
  fonte: string | null
  atualizadoEm: string | null
  tarefas: readonly TarefaSolicitada[]
  erro?: string | null
}

export function percentualValido(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100 ? valor : null
}
export function dataCivilValida(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [ano, mes, dia] = valor.split('-').map(Number)
  if (ano < 1000 || ano > 9999) return false
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
}
/** Data civil: nunca passa por fuso horário e nunca ganha a data de hoje como fallback. */
export function formatarDataSolicitacao(valor: string | null | undefined): string {
  if (!dataCivilValida(valor)) return '—'
  const [ano, mes, dia] = valor.split('-'); return `${dia}/${mes}/${ano}`
}
const objeto = (valor: unknown): valor is Record<string, unknown> => Boolean(valor && typeof valor === 'object' && !Array.isArray(valor))
export function validarQuadroTarefas(valor: unknown): QuadroTarefasSolicitadas {
  const ausente: QuadroTarefasSolicitadas = { status: 'nao_conectado', fonte: null, atualizadoEm: null, tarefas: [] }
  if (valor === undefined || valor === null) return ausente
  const invalido: QuadroTarefasSolicitadas = { status: 'erro', fonte: null, atualizadoEm: null, tarefas: [], erro: 'Fonte de tarefas fora do contrato; nenhum dado foi inventado.' }
  if (!objeto(valor) || !['pronto', 'erro', 'nao_conectado'].includes(String(valor.status)) || !Array.isArray(valor.tarefas)) return invalido
  if (valor.status !== 'pronto') return { ...ausente, status: valor.status === 'erro' ? 'erro' : 'nao_conectado', erro: typeof valor.erro === 'string' ? valor.erro : null }
  if (typeof valor.fonte !== 'string' || !valor.fonte.trim()) return invalido
  const chaves = new Set<string>()
  const tarefas: TarefaSolicitada[] = []
  for (const item of valor.tarefas) {
    if (!objeto(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.tarefa !== 'string' || !item.tarefa.trim() || !['renato', 'luana'].includes(String(item.diretor)) || !(item.dataSolicitada === null || dataCivilValida(item.dataSolicitada))) return invalido
    const chave = `${item.diretor}:${item.id}`
    if (chaves.has(chave)) return { ...invalido, erro: 'A fonte contém tarefas duplicadas para o mesmo diretor.' }
    chaves.add(chave)
    tarefas.push({ id: item.id, diretor: item.diretor as TarefaSolicitada['diretor'], tarefa: item.tarefa, dataSolicitada: item.dataSolicitada as string | null })
  }
  return { status: 'pronto', fonte: valor.fonte, atualizadoEm: typeof valor.atualizadoEm === 'string' ? valor.atualizadoEm : null, tarefas }
}

/**
 * Não transforma tokens em dinheiro nem presume que primário/secundário significa 5h/semana.
 * Claude declara as duas janelas no contrato atual. Codex só declara a duração primária em dias.
 * A duração da secundária não existe em UsoPlanos: permanece ausente até o coletor informá-la.
 */
export function montarCotas(uso?: UsoPlanos): CotaProvedor[] {
  const leitura = uso?.status === 'pronto'
  const janela = (horas: 5 | 168, percentual: unknown, reiniciaEm: string | number | null | undefined, obs = ''): CotaJanela => ({
    horas, percentual: percentualValido(percentual), reiniciaEm: reiniciaEm ?? null,
    observacao: [!leitura ? 'Leitura não confirmada' : '', obs].filter(Boolean).join(' · '),
  })
  const dias = uso?.codex?.primario_janela_dias
  const cinco = typeof dias === 'number' && Math.abs(dias * 24 - 5) < 0.02
  const semanal = typeof dias === 'number' && Math.abs(dias - 7) < 0.001
  return [
    { id: 'claude', nome: 'Claude', janelas: [
      janela(5, uso?.claude?.sessao_5h_percentual, uso?.claude?.sessao_5h_reset, uso?.claude?.fonte_percentual_oficial ? 'Percentual oficial declarado pela fonte' : 'Origem oficial não confirmada'),
      janela(168, uso?.claude?.semana_7d_percentual, uso?.claude?.semana_7d_reset),
    ] },
    { id: 'codex', nome: 'Codex', janelas: [
      janela(5, cinco ? uso?.codex?.primario_percentual : null, cinco ? uso?.codex?.primario_reset : null, cinco ? 'Janela primária confirmada: 5h' : 'A fonte não identifica uma janela de 5h'),
      janela(168, semanal ? uso?.codex?.primario_percentual : null, semanal ? uso?.codex?.primario_reset : null, semanal ? 'Janela primária confirmada: 7 dias' : 'Duração semanal não informada pela fonte'),
    ] },
  ]
}
