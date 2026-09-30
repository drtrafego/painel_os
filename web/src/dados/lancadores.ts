import type { AgenteVivo } from './tipos.ts'

export type LancadorId = 'luana' | 'renato' | 'bia' | 'nao-identificada'

export type GrupoLancador = {
  id: LancadorId
  nome: string
  agentes: AgenteVivo[]
}

export const LANCADORES: Array<{ id: Exclude<LancadorId, 'nao-identificada'>; nome: string }> = [
  { id: 'luana', nome: 'Luana' },
  { id: 'renato', nome: 'Renato' },
  { id: 'bia', nome: 'Bia' },
]

const NOMES_LANCADORES = new Map<string, Exclude<LancadorId, 'nao-identificada'>>(
  LANCADORES.map(({ id }) => [id, id]),
)

function idDoLancador(dono?: string | null): LancadorId {
  const chave = dono?.trim().toLowerCase()
  return (chave && NOMES_LANCADORES.get(chave)) || 'nao-identificada'
}

/**
 * Particiona a presença viva pela atribuição operacional declarada na sonda.
 * Não tenta descobrir o dono por identidade, nome, squad ou tipo do agente.
 */
export function agruparAgentesAtivosPorLancador(agentes: AgenteVivo[]): GrupoLancador[] {
  const grupos = new Map<LancadorId, AgenteVivo[]>()
  LANCADORES.forEach(({ id }) => grupos.set(id, []))
  grupos.set('nao-identificada', [])

  agentes
    .filter((agente) => agente.estado === 'trabalhando' || agente.estado === 'silencioso')
    .forEach((agente) => grupos.get(idDoLancador(agente.dono))?.push(agente))

  return [
    ...LANCADORES.map(({ id, nome }) => ({ id, nome, agentes: grupos.get(id) ?? [] })),
    { id: 'nao-identificada' as const, nome: 'Origem não identificada', agentes: grupos.get('nao-identificada') ?? [] },
  ]
}

export function totalDeAgentesAgrupados(grupos: GrupoLancador[]): number {
  return grupos.reduce((total, grupo) => total + grupo.agentes.length, 0)
}
