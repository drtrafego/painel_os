import type { AgenteSessao } from '../dados/tipos'
import { corDaSessao } from './paleta.ts'

export function corDoCardComando(agenteId: string): string {
  return corDaSessao(agenteId)
}

type TomLeituraSessao = 'verde' | 'ambar' | 'neutro'

export type LeituraEstadoSessao = {
  texto: string
  tom: TomLeituraSessao
  titulo: string
}

function dataValida(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const data = new Date(iso)
  return Number.isFinite(data.getTime()) ? data : null
}

function formatarHorarioBrasilia(data: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data).replace(',', '') + ' BRT'
}

function formatarIdadeCurta(ms: number): string {
  const minutos = Math.max(0, Math.floor(ms / 60_000))
  if (minutos < 60) return `${minutos}min`
  return `${Math.floor(minutos / 60)}h`
}

export function leituraEstadoSessao(
  estado: AgenteSessao['estado'],
  ultimaAtividade: string | null | undefined,
  agora = new Date(),
): LeituraEstadoSessao {
  if (!estado || estado === 'sem_sessao' || estado === 'indeterminado') {
    return { texto: 'sem leitura', tom: 'neutro', titulo: 'sem leitura de atividade da sessão' }
  }

  const ultima = dataValida(ultimaAtividade)
  if (estado === 'ativo') {
    return {
      texto: 'trabalhando',
      tom: 'verde',
      titulo: ultima ? `última atividade ${formatarHorarioBrasilia(ultima)}` : 'sessão marcada como ativa',
    }
  }

  if (estado === 'ocioso' && ultima) {
    return {
      texto: `ociosa há ${formatarIdadeCurta(agora.getTime() - ultima.getTime())}`,
      tom: 'ambar',
      titulo: `última atividade ${formatarHorarioBrasilia(ultima)}`,
    }
  }

  return { texto: 'sem leitura', tom: 'neutro', titulo: 'sem leitura de atividade da sessão' }
}
