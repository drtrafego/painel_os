/**
 * Máquina de estados determinística de movimento e posturas para o Escritório Voxel.
 *
 * Utiliza timestamp monotônico de requestAnimationFrame sem dependência de taxa de quadros (Hz).
 * Suporta prefers-reduced-motion para posicionamento estático instantâneo.
 */

export type FaseBoneco =
  | 'descanso'
  | 'caminhando_para_mesa'
  | 'sentando'
  | 'trabalhando'
  | 'silencioso'
  | 'levantando'
  | 'caminhando_para_descanso'

export interface Posicao2D {
  x: number
  y: number
}

export interface EstadoAnimacaoBoneco {
  chave: string
  fase: FaseBoneco
  x: number
  y: number
  progressoFase: number
  origemX: number
  origemY: number
  destinoX: number
  destinoY: number
  tempoInicioFaseMs: number
  duracaoFaseMs: number
  posturaTrabalho: 'digitando' | 'lendo' | 'gerico'
}

const DURACAO_CAMINHADA_MS = 2000
const DURACAO_TRANSICAO_CADEIRA_MS = 320

function lerPostura(ferramenta?: string | null): 'digitando' | 'lendo' | 'gerico' {
  if (!ferramenta) return 'digitando'
  const f = ferramenta.toLowerCase()
  if (f.includes('write') || f.includes('edit') || f.includes('terminal') || f.includes('bash') || f.includes('command') || f.includes('run')) {
    return 'digitando'
  }
  if (f.includes('read') || f.includes('view') || f.includes('search') || f.includes('list') || f.includes('grep') || f.includes('scan')) {
    return 'lendo'
  }
  return 'gerico'
}

function interpolarSuave(t: number): number {
  // Cubic ease-out: 1 - (1 - t)^3
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
}

export function criarEstadoInicialBoneco(
  chave: string,
  estadoReal: 'trabalhando' | 'silencioso' | 'parado',
  posMesa: Posicao2D,
  posDescanso: Posicao2D,
  tempoAgoraMs: number,
  ferramenta?: string | null
): EstadoAnimacaoBoneco {
  const postura = lerPostura(ferramenta)
  if (estadoReal === 'trabalhando') {
    return {
      chave,
      fase: 'trabalhando',
      x: posMesa.x,
      y: posMesa.y,
      progressoFase: 1,
      origemX: posDescanso.x,
      origemY: posDescanso.y,
      destinoX: posMesa.x,
      destinoY: posMesa.y,
      tempoInicioFaseMs: tempoAgoraMs,
      duracaoFaseMs: 0,
      posturaTrabalho: postura,
    }
  }
  if (estadoReal === 'silencioso') {
    return {
      chave,
      fase: 'silencioso',
      x: posMesa.x,
      y: posMesa.y,
      progressoFase: 1,
      origemX: posDescanso.x,
      origemY: posDescanso.y,
      destinoX: posMesa.x,
      destinoY: posMesa.y,
      tempoInicioFaseMs: tempoAgoraMs,
      duracaoFaseMs: 0,
      posturaTrabalho: postura,
    }
  }
  return {
    chave,
    fase: 'descanso',
    x: posDescanso.x,
    y: posDescanso.y,
    progressoFase: 1,
    origemX: posMesa.x,
    origemY: posMesa.y,
    destinoX: posDescanso.x,
    destinoY: posDescanso.y,
    tempoInicioFaseMs: tempoAgoraMs,
    duracaoFaseMs: 0,
    posturaTrabalho: postura,
  }
}

export function avancarEstadoAnimacao(
  anterior: EstadoAnimacaoBoneco,
  estadoReal: 'trabalhando' | 'silencioso' | 'parado',
  posMesa: Posicao2D,
  posDescanso: Posicao2D,
  tempoAgoraMs: number,
  reduzirMovimento: boolean,
  ferramenta?: string | null
): EstadoAnimacaoBoneco {
  const postura = lerPostura(ferramenta)

  // Em modo de movimento reduzido, posiciona imediatamente no estado alvo
  if (reduzirMovimento) {
    if (estadoReal === 'trabalhando') {
      return {
        ...anterior,
        fase: 'trabalhando',
        x: posMesa.x,
        y: posMesa.y,
        progressoFase: 1,
        destinoX: posMesa.x,
        destinoY: posMesa.y,
        posturaTrabalho: postura,
      }
    }
    if (estadoReal === 'silencioso') {
      return {
        ...anterior,
        fase: 'silencioso',
        x: posMesa.x,
        y: posMesa.y,
        progressoFase: 1,
        destinoX: posMesa.x,
        destinoY: posMesa.y,
        posturaTrabalho: postura,
      }
    }
    return {
      ...anterior,
      fase: 'descanso',
      x: posDescanso.x,
      y: posDescanso.y,
      progressoFase: 1,
      destinoX: posDescanso.x,
      destinoY: posDescanso.y,
      posturaTrabalho: postura,
    }
  }

  const tempoDecorrido = Math.max(0, tempoAgoraMs - anterior.tempoInicioFaseMs)
  const duracao = anterior.duracaoFaseMs || 1
  const t = Math.min(1, tempoDecorrido / duracao)
  const progresso = interpolarSuave(t)

  // 1. Transições disparadas por mudança no estado real da sonda
  if (estadoReal === 'trabalhando' || estadoReal === 'silencioso') {
    if (anterior.fase === 'descanso' || anterior.fase === 'caminhando_para_descanso' || anterior.fase === 'levantando') {
      return {
        ...anterior,
        fase: 'caminhando_para_mesa',
        origemX: anterior.x,
        origemY: anterior.y,
        destinoX: posMesa.x,
        destinoY: posMesa.y,
        tempoInicioFaseMs: tempoAgoraMs,
        duracaoFaseMs: DURACAO_CAMINHADA_MS,
        progressoFase: 0,
        posturaTrabalho: postura,
      }
    }
  } else if (estadoReal === 'parado') {
    if (anterior.fase === 'trabalhando' || anterior.fase === 'silencioso') {
      return {
        ...anterior,
        fase: 'levantando',
        origemX: posMesa.x,
        origemY: posMesa.y,
        destinoX: posMesa.x,
        destinoY: posMesa.y,
        tempoInicioFaseMs: tempoAgoraMs,
        duracaoFaseMs: DURACAO_TRANSICAO_CADEIRA_MS,
        progressoFase: 0,
        posturaTrabalho: postura,
      }
    }
    if (anterior.fase === 'caminhando_para_mesa' || anterior.fase === 'sentando') {
      return {
        ...anterior,
        fase: 'caminhando_para_descanso',
        origemX: anterior.x,
        origemY: anterior.y,
        destinoX: posDescanso.x,
        destinoY: posDescanso.y,
        tempoInicioFaseMs: tempoAgoraMs,
        duracaoFaseMs: DURACAO_CAMINHADA_MS,
        progressoFase: 0,
        posturaTrabalho: postura,
      }
    }
  }

  // 2. Continuidade das fases em andamento
  switch (anterior.fase) {
    case 'caminhando_para_mesa': {
      if (t >= 1) {
        return {
          ...anterior,
          fase: 'sentando',
          x: posMesa.x,
          y: posMesa.y,
          origemX: posMesa.x,
          origemY: posMesa.y,
          destinoX: posMesa.x,
          destinoY: posMesa.y,
          tempoInicioFaseMs: tempoAgoraMs,
          duracaoFaseMs: DURACAO_TRANSICAO_CADEIRA_MS,
          progressoFase: 0,
          posturaTrabalho: postura,
        }
      }
      const posX = anterior.origemX + (posMesa.x - anterior.origemX) * progresso
      const posY = anterior.origemY + (posMesa.y - anterior.origemY) * progresso
      return {
        ...anterior,
        x: posX,
        y: posY,
        progressoFase: t,
        posturaTrabalho: postura,
      }
    }

    case 'sentando': {
      if (t >= 1) {
        return {
          ...anterior,
          fase: estadoReal === 'silencioso' ? 'silencioso' : 'trabalhando',
          x: posMesa.x,
          y: posMesa.y,
          origemX: posMesa.x,
          origemY: posMesa.y,
          destinoX: posMesa.x,
          destinoY: posMesa.y,
          tempoInicioFaseMs: tempoAgoraMs,
          duracaoFaseMs: 0,
          progressoFase: 1,
          posturaTrabalho: postura,
        }
      }
      return {
        ...anterior,
        x: posMesa.x,
        y: posMesa.y,
        progressoFase: t,
        posturaTrabalho: postura,
      }
    }

    case 'levantando': {
      if (t >= 1) {
        return {
          ...anterior,
          fase: 'caminhando_para_descanso',
          x: posMesa.x,
          y: posMesa.y,
          origemX: posMesa.x,
          origemY: posMesa.y,
          destinoX: posDescanso.x,
          destinoY: posDescanso.y,
          tempoInicioFaseMs: tempoAgoraMs,
          duracaoFaseMs: DURACAO_CAMINHADA_MS,
          progressoFase: 0,
          posturaTrabalho: postura,
        }
      }
      return {
        ...anterior,
        x: posMesa.x,
        y: posMesa.y,
        progressoFase: t,
        posturaTrabalho: postura,
      }
    }

    case 'caminhando_para_descanso': {
      if (t >= 1) {
        return {
          ...anterior,
          fase: 'descanso',
          x: posDescanso.x,
          y: posDescanso.y,
          origemX: posDescanso.x,
          origemY: posDescanso.y,
          destinoX: posDescanso.x,
          destinoY: posDescanso.y,
          tempoInicioFaseMs: tempoAgoraMs,
          duracaoFaseMs: 0,
          progressoFase: 1,
          posturaTrabalho: postura,
        }
      }
      const posX = anterior.origemX + (posDescanso.x - anterior.origemX) * progresso
      const posY = anterior.origemY + (posDescanso.y - anterior.origemY) * progresso
      return {
        ...anterior,
        x: posX,
        y: posY,
        progressoFase: t,
        posturaTrabalho: postura,
      }
    }

    case 'trabalhando': {
      if (estadoReal === 'silencioso') {
        return { ...anterior, fase: 'silencioso', posturaTrabalho: postura }
      }
      return { ...anterior, x: posMesa.x, y: posMesa.y, posturaTrabalho: postura }
    }

    case 'silencioso': {
      if (estadoReal === 'trabalhando') {
        return { ...anterior, fase: 'trabalhando', posturaTrabalho: postura }
      }
      return { ...anterior, x: posMesa.x, y: posMesa.y, posturaTrabalho: postura }
    }

    case 'descanso':
    default:
      return { ...anterior, x: posDescanso.x, y: posDescanso.y, posturaTrabalho: postura }
  }
}
