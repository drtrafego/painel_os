export type AmbienteForcado = 'dia' | 'noite' | 'auto'
export type FaseAmbiente = 'dia' | 'noite' | 'transicao'

export type AmbienteVisual = {
  fase: FaseAmbiente
  progressoDia: number
  minutosBrasilia: number
  rotulo: string
}

const FUSO_BRASILIA = 'America/Sao_Paulo'
const INICIO_DIA = 6 * 60
const INICIO_NOITE = 18 * 60
const DURACAO_TRANSICAO = 30

export function minutosEmBrasilia(data: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_BRASILIA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(data)
  const hora = Number(partes.find((parte) => parte.type === 'hour')?.value ?? 0)
  const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value ?? 0)
  const segundo = Number(partes.find((parte) => parte.type === 'second')?.value ?? 0)
  return hora * 60 + minuto + segundo / 60
}

export function ambienteForcadoDaUrl(search: string): AmbienteForcado {
  const valor = new URLSearchParams(search).get('ambiente')?.toLowerCase()
  return valor === 'dia' || valor === 'noite' || valor === 'auto' ? valor : 'auto'
}

/**
 * Converte a hora de Brasília numa mistura contínua do cenário diurno (1) e
 * noturno (0). A faixa de 30 minutos termina às 06h e começa às 18h, então
 * 06:00 já é dia e 18:00 já começa a se despedir do dia.
 */
export function resolverAmbiente(data: Date, forcado: AmbienteForcado = 'auto'): AmbienteVisual {
  if (forcado === 'dia') return { fase: 'dia', progressoDia: 1, minutosBrasilia: minutosEmBrasilia(data), rotulo: 'DIA' }
  if (forcado === 'noite') return { fase: 'noite', progressoDia: 0, minutosBrasilia: minutosEmBrasilia(data), rotulo: 'NOITE' }

  const minutos = minutosEmBrasilia(data)
  if (minutos >= INICIO_DIA && minutos < INICIO_NOITE) {
    return { fase: 'dia', progressoDia: 1, minutosBrasilia: minutos, rotulo: 'DIA' }
  }
  if (minutos >= INICIO_DIA - DURACAO_TRANSICAO && minutos < INICIO_DIA) {
    return { fase: 'transicao', progressoDia: (minutos - (INICIO_DIA - DURACAO_TRANSICAO)) / DURACAO_TRANSICAO, minutosBrasilia: minutos, rotulo: 'AMANHECER' }
  }
  if (minutos >= INICIO_NOITE && minutos < INICIO_NOITE + DURACAO_TRANSICAO) {
    return { fase: 'transicao', progressoDia: 1 - (minutos - INICIO_NOITE) / DURACAO_TRANSICAO, minutosBrasilia: minutos, rotulo: 'ANOITECER' }
  }
  return { fase: 'noite', progressoDia: 0, minutosBrasilia: minutos, rotulo: 'NOITE' }
}
