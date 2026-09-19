/**
 * Parser de expressões cron e cálculo dos próximos disparos.
 */

export type Job = {
  expressao: string
  rotulo: string
  dono?: string
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

function parseCampo(campo: string, min: number, max: number): Set<number> | null {
  const valores = new Set<number>()
  if (campo === '*') {
    for (let i = min; i <= max; i++) valores.add(i)
    return valores
  }

  const partes = campo.split(',')
  for (const parte of partes) {
    const stepMatch = parte.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/)
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10)
      if (isNaN(step) || step <= 0) return null
      let start = min
      let end = max
      if (stepMatch[1] !== '*') {
        if (stepMatch[1].includes('-')) {
          const [r1, r2] = stepMatch[1].split('-').map(Number)
          start = r1
          end = r2
        } else {
          start = parseInt(stepMatch[1], 10)
        }
      }
      for (let i = start; i <= end; i += step) {
        if (i >= min && i <= max) valores.add(i)
      }
      continue
    }

    const rangeMatch = parte.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10)
      const end = parseInt(rangeMatch[2], 10)
      if (isNaN(start) || isNaN(end) || start > end) return null
      for (let i = start; i <= end; i++) {
        if (i >= min && i <= max) valores.add(i)
      }
      continue
    }

    if (/^\d+$/.test(parte)) {
      const num = parseInt(parte, 10)
      if (num >= min && num <= max) valores.add(num)
      else return null
      continue
    }

    return null
  }

  return valores.size > 0 ? valores : null
}

export function proximosDisparos(jobs: Job[], agora: Date, janelaMinutos: number): ResultadoProximosDisparos {
  const disparos: Disparo[] = []
  const ilegiveis: Job[] = []
  let lidas = 0

  for (const job of jobs) {
    const tokens = job.expressao.trim().split(/\s+/)
    if (tokens.length < 5) {
      ilegiveis.push(job)
      continue
    }

    const [minStr, horaStr, domStr, mesStr, dowStr] = tokens
    const minutos = parseCampo(minStr, 0, 59)
    const horas = parseCampo(horaStr, 0, 23)
    const doms = parseCampo(domStr, 1, 31)
    const meses = parseCampo(mesStr, 1, 12)
    const dows = parseCampo(dowStr, 0, 7) // 0 e 7 = domingo

    if (!minutos || !horas || !doms || !meses || !dows) {
      ilegiveis.push(job)
      continue
    }

    lidas++

    let primeiro: Date | null = null
    let vezes = 0

    // Avança minuto a minuto dentro da janela em UTC (pois crontab no servidor roda em UTC)
    const inicioMs = Math.floor(agora.getTime() / 60000) * 60000
    for (let offset = 0; offset <= janelaMinutos; offset++) {
      const t = new Date(inicioMs + offset * 60000)
      const m = t.getUTCMinutes()
      const h = t.getUTCHours()
      const dom = t.getUTCDate()
      const mes = t.getUTCMonth() + 1
      let dow = t.getUTCDay()
      if (dow === 0 && dows.has(7)) dow = 7

      if (minutos.has(m) && horas.has(h) && doms.has(dom) && meses.has(mes) && (dows.has(dow) || dows.has(t.getUTCDay()))) {
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
