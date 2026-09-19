/**
 * Validação rigorosa em runtime do JSON de estado recebido pela API ou build.
 *
 * Não substitui campo ausente por zero: se a estrutura estiver corrompida,
 * falha alto e aponta exatamente o caminho do campo defeituoso.
 */

import type { Estado } from './tipos'

export type ResultadoValidacao =
  | { ok: true; estado: Estado }
  | { ok: false; problemas: string[] }

export function validarEstado(dado: unknown): ResultadoValidacao {
  const problemas: string[] = []

  if (!dado || typeof dado !== 'object') {
    return { ok: false, problemas: ['o JSON raiz não é um objeto'] }
  }

  const e = dado as Partial<Estado>

  if (typeof e.gerado_em !== 'string') {
    problemas.push('gerado_em: esperado texto ISO 8601')
  }

  if (!Array.isArray(e.agentes)) {
    problemas.push('agentes: esperado array de agentes')
  } else {
    e.agentes.forEach((a, idx) => {
      if (!a || typeof a !== 'object') {
        problemas.push(`agentes[${idx}]: esperado objeto`)
      } else {
        if (typeof a.id !== 'string') problemas.push(`agentes[${idx}].id: esperado texto`)
        if (typeof a.nome !== 'string') problemas.push(`agentes[${idx}].nome: esperado texto`)
        if (typeof a.squad !== 'string') problemas.push(`agentes[${idx}].squad: esperado texto`)
      }
    })
  }

  if (!Array.isArray(e.sessao)) {
    problemas.push('sessao: esperado array de sessao')
  } else {
    e.sessao.forEach((s, idx) => {
      if (!s || typeof s !== 'object') {
        problemas.push(`sessao[${idx}]: esperado objeto`)
      } else {
        if (typeof s.id !== 'string') problemas.push(`sessao[${idx}].id: esperado texto`)
        if (typeof s.nome !== 'string') problemas.push(`sessao[${idx}].nome: esperado texto`)
        if (!s.verificador || typeof s.verificador !== 'object') {
          problemas.push(`sessao[${idx}].verificador: esperado objeto de verificador`)
        }
      }
    })
  }

  if (!e.resumo || typeof e.resumo !== 'object') {
    problemas.push('resumo: esperado objeto de resumo')
  }

  if (!e.cron || typeof e.cron !== 'object') {
    problemas.push('cron: esperado objeto cron')
  }

  if (!e.squads || typeof e.squads !== 'object') {
    problemas.push('squads: esperado objeto de squads')
  }

  if (problemas.length > 0) {
    return { ok: false, problemas }
  }

  return { ok: true, estado: e as Estado }
}
