/**
 * Parser de expressões cron e cálculo dos próximos disparos.
 */

export type Job = {
  expressao: string
  rotulo: string
  dono?: string | null
}

export type Disparo = {
  job: Job
  primeiro: Date
  vezes: number
}

export type ResultadoProximosDisparos = {
  disparos: Disparo[]
  ilegiveis: Job[]
  lidas: number
}

const MESES_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const DOW_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

/** Formata data para HH:MM em UTC */
export function horaUtc(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Formata data para HH:MM no fuso do Gastão (America/Sao_Paulo) */
export function horaGastao(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  })
}

function normalizarToken(tok: string, nomes?: Record<string, number>): number | null {
  if (nomes) {
    const low = tok.toLowerCase()
    if (low in nomes) return nomes[low]
  }
  if (/^\d+$/.test(tok)) return parseInt(tok, 10)
  return null
}

export function expandir(
  campo: string,
  min: number,
  max: number,
  nomes?: Record<string, number>
): Set<number> | null {
  if (!campo || typeof campo !== 'string') return null
  const campoTrim = campo.trim()
  if (!campoTrim) return null
  if (campoTrim === '*') {
    const set = new Set<number>()
    for (let i = min; i <= max; i++) set.add(i)
    return set
  }

  const partes = campoTrim.split(',')
  const valores = new Set<number>()

  for (const parte of partes) {
    if (!parte) return null // ex: 1,,3
    const stepMatch = parte.match(/^(\*|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?)\/(\d+)$/)
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10)
      if (isNaN(step) || step <= 0) return null
      let start = min
      let end = max
      if (stepMatch[1] !== '*') {
        if (stepMatch[1].includes('-')) {
          const [r1, r2] = stepMatch[1].split('-')
          const v1 = normalizarToken(r1, nomes)
          const v2 = normalizarToken(r2, nomes)
          if (v1 === null || v2 === null || v1 > v2 || v1 < min || v2 > max) return null
          start = v1
          end = v2
        } else {
          const v = normalizarToken(stepMatch[1], nomes)
          if (v === null || v < min || v > max) return null
          start = v
        }
      }
      for (let i = start; i <= end; i += step) {
        valores.add(i)
      }
      continue
    }

    if (parte.includes('-')) {
      const [r1, r2, ...extra] = parte.split('-')
      if (extra.length > 0) return null
      const v1 = normalizarToken(r1, nomes)
      const v2 = normalizarToken(r2, nomes)
      if (v1 === null || v2 === null || v1 > v2 || v1 < min || v2 > max) return null
      for (let i = v1; i <= v2; i++) valores.add(i)
      continue
    }

    const v = normalizarToken(parte, nomes)
    if (v === null || v < min || v > max) return null
    valores.add(v)
  }

  return valores.size > 0 ? valores : null
}

export function disparaEm(job: Job, d: Date): boolean | null {
  const expr = (job.expressao ?? '').trim().split(/\s+/)
  if (expr.length !== 5) return null
  const [minStr, horaStr, domStr, mesStr, dowStr] = expr
  const min = expandir(minStr, 0, 59)
  const hora = expandir(horaStr, 0, 23)
  const dom = expandir(domStr, 1, 31)
  const mes = expandir(mesStr, 1, 12, MESES_MAP)
  const dow = expandir(dowStr, 0, 7, DOW_MAP)
  if (!min || !hora || !dom || !mes || !dow) return null

  if (dow.has(7)) dow.add(0)
  if (dow.has(0)) dow.add(7)

  const mMatch = min.has(d.getUTCMinutes())
  const hMatch = hora.has(d.getUTCHours())
  const mesMatch = mes.has(d.getUTCMonth() + 1)
  const dDay = d.getUTCDate()
  const dDow = d.getUTCDay()

  const domRestrito = domStr !== '*'
  const dowRestrito = dowStr !== '*'

  let diaMatch = false
  if (domRestrito && dowRestrito) {
    diaMatch = dom.has(dDay) || dow.has(dDow)
  } else {
    diaMatch = dom.has(dDay) && dow.has(dDow)
  }

  return mMatch && hMatch && mesMatch && diaMatch
}

export function proximosDisparos(
  jobs: Job[],
  agora: Date = new Date(),
  janelaMinutos: number = 60
): ResultadoProximosDisparos {
  const disparos: Disparo[] = []
  const ilegiveis: Job[] = []
  let lidas = 0

  for (const job of jobs) {
    // Validação prévia
    const expr = (job.expressao ?? '').trim().split(/\s+/)
    if (expr.length !== 5) {
      ilegiveis.push(job)
      continue
    }

    const testValido = disparaEm(job, agora)
    if (testValido === null) {
      ilegiveis.push(job)
      continue
    }

    lidas++

    let primeiro: Date | null = null
    let vezes = 0

    // Avança minuto a minuto dentro da janela em UTC a partir do início do minuto de agora + 1
    const inicioMs = (Math.floor(agora.getTime() / 60000) + 1) * 60000
    for (let offset = 0; offset <= janelaMinutos; offset++) {
      const t = new Date(inicioMs + offset * 60000)
      if (t.getTime() > agora.getTime() + janelaMinutos * 60000) break
      if (disparaEm(job, t)) {
        if (!primeiro) primeiro = t
        vezes++
      }
    }

    if (primeiro && vezes > 0) {
      disparos.push({ job, primeiro, vezes })
    }
  }

  disparos.sort((a, b) => a.primeiro.getTime() - b.primeiro.getTime())

  return { disparos, ilegiveis, lidas }
}
