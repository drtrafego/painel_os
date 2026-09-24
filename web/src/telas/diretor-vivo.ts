import type { AgenteVivo } from '../dados/tipos'

export function acharAgenteAoVivoDoDiretor(agentes: AgenteVivo[], quem: string): AgenteVivo | undefined {
  return agentes.find((agente) => agente.dono === quem && agente.estado === 'trabalhando')
}
