/**
 * Funções utilitárias e interpretação do estado dos agentes e do painel.
 */

import type { Agente, AgenteSessao, Aresta, Estado } from './tipos'

export const ORDEM_SQUAD = ['global', 'conteudo', 'comercial'] as const

export type SituacaoDiretiva =
  | { estado: 'sem-fonte'; porque: string }
  | { estado: 'ativa'; diasAteVencer: number }
  | { estado: 'vencida'; diasVencida: number }
  | { estado: 'encerrada'; rotulo: string }

export type FalhaReprovada = {
  o_que: string
  dono: string
  desde?: string
}

export function reprovadas(estado: Estado): FalhaReprovada[] {
  const falhas: FalhaReprovada[] = []
  if (!estado?.sessao) return falhas

  for (const s of estado.sessao) {
    if (s.verificador?.falhas && Array.isArray(s.verificador.falhas)) {
      for (const f of s.verificador.falhas) {
        falhas.push({
          o_que: f.o_que,
          dono: s.nome ?? s.id,
          desde: f.desde,
        })
      }
    }
  }

  return falhas
}

export function maisAntiga(estado: Estado): { falha: FalhaReprovada; dias: number } | null {
  const todas = reprovadas(estado)
  if (todas.length === 0) return null

  let maisVelha: FalhaReprovada | null = null
  let maiorDias = -1

  const agora = Date.now()

  for (const f of todas) {
    if (f.desde) {
      const match = f.desde.match(/\d{4}-\d{2}-\d{2}/)
      if (match) {
        const dataFalha = new Date(match[0]).getTime()
        const dias = Math.max(0, Math.floor((agora - dataFalha) / (1000 * 60 * 60 * 24)))
        if (dias > maiorDias) {
          maiorDias = dias
          maisVelha = f
        }
      }
    }
  }

  if (maisVelha && maiorDias >= 0) {
    return { falha: maisVelha, dias: maiorDias }
  }

  return { falha: todas[0], dias: 1 }
}

export function encostados(estado: Estado, agoraMs: number): Agente[] {
  if (!estado?.agentes) return []
  return estado.agentes.filter((a) => {
    if (a.convocacoes === null || a.convocacoes === 0) return true
    return diasParado(a, agoraMs) > 7
  })
}

export function diasParado(agente: Agente, agoraMs: number): number {
  const referencia = agente.ultima_convocacao ?? agente.modificado
  if (!referencia) return 99
  const ts = new Date(referencia).getTime()
  if (isNaN(ts)) return 99
  return Math.max(0, Math.floor((agoraMs - ts) / (1000 * 60 * 60 * 24)))
}

export function atividade(agente: Agente, agoraMs: number): { nivel: 'recente' | 'semana' | 'parado' | 'nunca'; texto: string } {
  if (!agente.ultima_convocacao && (!agente.convocacoes || agente.convocacoes === 0)) {
    return { nivel: 'nunca', texto: 'nunca chamado' }
  }
  const dias = diasParado(agente, agoraMs)
  if (dias <= 1) return { nivel: 'recente', texto: 'ativo hoje' }
  if (dias <= 7) return { nivel: 'semana', texto: `${dias}d atrás` }
  return { nivel: 'parado', texto: `${dias}d parado` }
}

export function funcaoCurta(agente: Agente): string {
  if (!agente.descricao) return ''
  const primeiraFrase = agente.descricao.split(/[.\n]/)[0]
  return primeiraFrase.trim()
}

export function acharAgente(estado: Estado, id: string): Agente | null {
  return estado.agentes?.find((a) => a.id === id) ?? null
}

export function acharSessao(estado: Estado, id: string): AgenteSessao | null {
  return estado.sessao?.find((s) => s.id === id) ?? null
}

export function convocadores(estado: Estado, id: string): Aresta[] {
  return (estado.arestas ?? []).filter((a) => a.para === id)
}

export function convocados(estado: Estado, id: string): Aresta[] {
  return (estado.arestas ?? []).filter((a) => a.de === id)
}

export function arestas(estado: Estado): Aresta[] {
  return estado.arestas ?? []
}

export function porSquad(estado: Estado, squadId: string): Agente[] {
  return (estado.agentes ?? []).filter((a) => a.squad === squadId)
}

export function squadsComAgentes(estado: Estado): string[] {
  const idsComAgentes = new Set((estado.agentes ?? []).map((a) => a.squad))
  const squads = estado.squads ?? {}
  const prioridade = new Set<string>(ORDEM_SQUAD)
  const fixos = ORDEM_SQUAD.filter((id) => id in squads && idsComAgentes.has(id))
  const extras = Object.keys(squads).filter((id) => !prioridade.has(id) && idsComAgentes.has(id)).sort()
  return [...fixos, ...extras]
}

export function temCargo(estado: Estado, nome: string): boolean {
  const emAgentes = (estado.agentes ?? []).some((a) => a.id === nome || a.nome === nome)
  const emSessao = (estado.sessao ?? []).some((s) => s.id === nome || s.nome === nome)
  return emAgentes || emSessao
}

export function situacaoDaDiretiva(diretiva: Estado['diretiva'] | undefined, agoraMs: number): SituacaoDiretiva {
  if (!diretiva || !diretiva.objetivo || !diretiva.prazo) {
    return { estado: 'sem-fonte', porque: 'diretiva ainda não foi definida ou fonte indisponível' }
  }

  if (diretiva.status === 'concluida' || diretiva.status === 'cancelada') {
    return { estado: 'encerrada', rotulo: diretiva.status }
  }

  // Parse YYYY-MM-DD
  const [ano, mes, dia] = diretiva.prazo.split('-').map(Number)
  if (!ano || !mes || !dia) {
    return { estado: 'sem-fonte', porque: 'prazo da diretiva inválido' }
  }

  // Fim do dia do prazo no fuso de São Paulo / local
  const fimDoPrazo = new Date(ano, mes - 1, dia, 23, 59, 59, 999).getTime()
  const diffDias = Math.floor((fimDoPrazo - agoraMs) / (1000 * 60 * 60 * 24))

  if (fimDoPrazo < agoraMs) {
    const diasVencida = Math.max(1, Math.floor((agoraMs - fimDoPrazo) / (1000 * 60 * 60 * 24)))
    return { estado: 'vencida', diasVencida }
  }

  return { estado: 'ativa', diasAteVencer: Math.max(0, diffDias) }
}
