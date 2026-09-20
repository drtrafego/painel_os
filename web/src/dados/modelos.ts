/**
 * Modelos de IA em uso, a partir de `resumo.convocacoes_por_modelo`.
 *
 * O coletor (`coletar_estado.py: ler_convocacoes`) já entrega a contagem por
 * rótulo de modelo, medida no `resolvedModel` de cada chamada de subagente
 * Claude. Esta função só ORDENA e calcula o percentual pra tela: nenhum
 * número novo nasce aqui.
 *
 * ‼️ Este contador é PISO, não total: só conta a chamada cujo resultado já
 * trouxe o modelo resolvido. Uma chamada em andamento, ou cujo resultado
 * ainda não foi medido, entra no total de convocações mas fica de fora
 * daqui. Por isso a soma deste array pode ser MENOR que
 * `resumo.convocacoes_por_motor.claude`, e a tela precisa dizer isso, nunca
 * fingir que os dois números têm que bater.
 *
 * E é exclusivo do motor Claude: o rollout Codex não expõe este campo, então
 * `resumo.convocacoes_por_motor.codex` nunca aparece aqui.
 */

import type { Estado } from './tipos'

export type UsoDeModelo = {
  modelo: string
  total: number
  percentual: number
}

export function porModelo(estado: Estado): UsoDeModelo[] {
  const mapa = estado.resumo.convocacoes_por_modelo
  if (!mapa || typeof mapa !== 'object') return []

  const entradas = Object.entries(mapa).filter(
    ([, total]) => typeof total === 'number' && Number.isFinite(total) && total > 0,
  )
  const total = entradas.reduce((soma, [, n]) => soma + n, 0)
  if (total <= 0) return []

  return entradas
    .map(([modelo, n]) => ({
      modelo,
      total: n,
      percentual: Math.round((n / total) * 1000) / 10,
    }))
    .sort((a, b) => b.total - a.total || a.modelo.localeCompare(b.modelo))
}

/**
 * Visão GERAL, ordem dele em 20/09: juntar Codex nessa mesma lista mesmo
 * sem saber qual modelo específico rodou dentro dele. Codex entra como UMA
 * categoria própria ("codex (motor inteiro)"), ao lado dos modelos Claude
 * já discriminados. Não inventa modelo pro Codex: soma o total do motor
 * (`convocacoes_por_motor.codex`) como um item a mais, com percentual
 * recalculado sobre o novo total (Claude discriminado + Codex agregado).
 */
export function porModeloGeral(estado: Estado): UsoDeModelo[] {
  const claude = porModelo(estado).map((item) => ({ ...item }))
  const codex = estado.resumo.convocacoes_por_motor?.codex
  const temCodex = typeof codex === 'number' && Number.isFinite(codex) && codex > 0

  if (!temCodex) return claude

  const somaClaude = claude.reduce((n, item) => n + item.total, 0)
  const totalGeral = somaClaude + codex
  if (totalGeral <= 0) return claude

  const todos = [...claude, { modelo: 'codex (motor inteiro)', total: codex, percentual: 0 }]
  return todos
    .map((item) => ({ ...item, percentual: Math.round((item.total / totalGeral) * 1000) / 10 }))
    .sort((a, b) => b.total - a.total || a.modelo.localeCompare(b.modelo))
}

/** Soma do array já ordenado, pra quem precisa só do piso medido. */
export function totalMedidoPorModelo(estado: Estado): number {
  return porModelo(estado).reduce((n, item) => n + item.total, 0)
}
