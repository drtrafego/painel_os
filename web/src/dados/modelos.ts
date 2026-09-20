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

/** Soma do array já ordenado, pra quem precisa só do piso medido. */
export function totalMedidoPorModelo(estado: Estado): number {
  return porModelo(estado).reduce((n, item) => n + item.total, 0)
}
