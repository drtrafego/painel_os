import type { AgentesVivos, AgenteVivo } from './tipos'

type EstadoAgenteVivo = Pick<AgenteVivo, 'estado'>

export function contarAgentesExecutando(agentes: EstadoAgenteVivo[]): number {
  return agentes.filter((agente) => agente.estado === 'trabalhando').length
}

export function contarAgentesVivos(agentes: EstadoAgenteVivo[]): number {
  return agentes.filter((agente) => agente.estado === 'trabalhando' || agente.estado === 'silencioso').length
}

export function contarAgentesVivosNaContagem(contagem: AgentesVivos['contagem'] | null | undefined): number {
  return (contagem?.trabalhando ?? 0) + (contagem?.silencioso ?? 0)
}

export function rotuloPresencaPixelOffice(agentes: EstadoAgenteVivo[], totalCatalogo: number): string {
  return `${contarAgentesVivos(agentes)} vivos (${contarAgentesExecutando(agentes)} executando) · ${totalCatalogo} no catálogo`
}
