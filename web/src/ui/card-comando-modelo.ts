import type { AgenteSessao, AgenteVivo } from '../dados/tipos'
import { corDaSessao, generoDaSessao } from './paleta.ts'

export function corDoCardComando(agenteId: string): string {
  return corDaSessao(agenteId)
}

export type LlmDoCardComando = {
  modelo: string | null
  esforco: string | null
  medido: boolean
}

function textoLegivel(valor: string | null | undefined): string | null {
  const texto = valor?.replace(/\s+/g, ' ').trim()
  return texto ? texto.slice(0, 40) : null
}

/**
 * O cartão representa a sessão coordenadora do dono, não um subagente.
 * Quando há mais de uma sessão raiz, a evidência com menor silêncio é a mais
 * recente. O modelo e o esforço vêm da sonda viva, nunca do catálogo estático.
 */
export function llmDoCardComando(agentes: AgenteVivo[] | null | undefined, dono: string): LlmDoCardComando {
  const candidatos = (agentes ?? [])
    .filter((agente) => agente.dono?.toLowerCase() === dono.toLowerCase())
    .sort((a, b) => {
      const modeloA = a.modelo_legivel || a.modelo ? 0 : 1
      const modeloB = b.modelo_legivel || b.modelo ? 0 : 1
      if (modeloA !== modeloB) return modeloA - modeloB
      const raizA = a.pai == null && (a.profundidade == null || a.profundidade === 0) ? 0 : 1
      const raizB = b.pai == null && (b.profundidade == null || b.profundidade === 0) ? 0 : 1
      if (raizA !== raizB) return raizA - raizB
      const estadoA = a.estado === 'trabalhando' ? 0 : a.estado === 'silencioso' ? 1 : 2
      const estadoB = b.estado === 'trabalhando' ? 0 : b.estado === 'silencioso' ? 1 : 2
      if (estadoA !== estadoB) return estadoA - estadoB
      return (a.silencio_s ?? Number.POSITIVE_INFINITY) - (b.silencio_s ?? Number.POSITIVE_INFINITY)
    })
  const atual = candidatos[0]
  if (!atual) return { modelo: null, esforco: null, medido: false }
  return {
    modelo: textoLegivel(atual.modelo_legivel) ?? textoLegivel(atual.modelo),
    esforco: textoLegivel(atual.esforco),
    medido: true,
  }
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
  agenteId: string,
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
    const ocioso = generoDaSessao(agenteId) === 'm' ? 'ocioso' : 'ociosa'
    return {
      texto: `${ocioso} há ${formatarIdadeCurta(agora.getTime() - ultima.getTime())}`,
      tom: 'ambar',
      titulo: `última atividade ${formatarHorarioBrasilia(ultima)}`,
    }
  }

  return { texto: 'sem leitura', tom: 'neutro', titulo: 'sem leitura de atividade da sessão' }
}

/**
 * O snapshot da sessão é histórico. Quando a sonda viva já respondeu, ela
 * prevalece: conversa Codex ou trabalho externo vivo torna o diretor ativo;
 * ausência de presença ao vivo não vira "ocioso há X horas" por herança.
 */
export function leituraEstadoSessaoComPresencaAoVivo(
  estado: AgenteSessao['estado'],
  ultimaAtividade: string | null | undefined,
  agenteId: string,
  agentesVivos: AgenteVivo[] | null | undefined,
  agora = new Date(),
): LeituraEstadoSessao {
  if (agentesVivos !== null && agentesVivos !== undefined) {
    const dono = agenteId.trim().toLowerCase()
    const vivo = agentesVivos.some((agente) =>
      agente.dono?.trim().toLowerCase() === dono
      && (agente.estado === 'trabalhando' || agente.estado === 'silencioso'),
    )
    if (vivo) return leituraEstadoSessao('ativo', null, agenteId, agora)
    return {
      texto: 'sem atividade agora',
      tom: 'neutro',
      titulo: 'a sonda ao vivo não encontrou conversa ou tarefa vigente deste diretor',
    }
  }
  return leituraEstadoSessao(estado, ultimaAtividade, agenteId, agora)
}
