/**
 * Máquina de estados determinística de movimento e posturas para o Escritório Voxel.
 *
 * Utiliza timestamp monotônico de requestAnimationFrame sem dependência de taxa de quadros (Hz).
 * Utiliza rotas de waypoints por corredores para evitar travessia sobre mesas/móveis.
 * Suporta interrupção e reversão no meio do trajeto sem teletransporte.
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

export const DURACAO_CAMINHADA_MS = 2000
export const DURACAO_TRANSICAO_CADEIRA_MS = 320

export function lerPostura(ferramenta?: string | null): 'digitando' | 'lendo' | 'gerico' {
  if (!ferramenta) return 'digitando'
  const f = ferramenta.toLowerCase()
  if (
    f.includes('write') ||
    f.includes('edit') ||
    f.includes('terminal') ||
    f.includes('bash') ||
    f.includes('command') ||
    f.includes('run')
  ) {
    return 'digitando'
  }
  if (
    f.includes('read') ||
    f.includes('view') ||
    f.includes('search') ||
    f.includes('list') ||
    f.includes('grep') ||
    f.includes('scan')
  ) {
    return 'lendo'
  }
  return 'gerico'
}

export function interpolarSuave(t: number): number {
  // Cubic ease-out: 1 - (1 - t)^3
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3)
}

/**
 * Calcula lista de waypoints conectando origem e destino através do corredor central (x = 0).
 */
export function calcularWaypoints(origem: Posicao2D, destino: Posicao2D): Posicao2D[] {
  const pontos: Posicao2D[] = [{ x: origem.x, y: origem.y }]

  const precisaSairHorizontalmente = Math.abs(origem.x) > 1
  const precisaEntrarHorizontalmente = Math.abs(destino.x) > 1

  if (precisaSairHorizontalmente && precisaEntrarHorizontalmente) {
    if (Math.sign(origem.x) === Math.sign(destino.x) && Math.abs(origem.y - destino.y) < 10) {
      // Mesma ilha e mesma linha
      pontos.push({ x: destino.x, y: destino.y })
    } else {
      pontos.push({ x: 0, y: origem.y })
      pontos.push({ x: 0, y: destino.y })
      pontos.push({ x: destino.x, y: destino.y })
    }
  } else if (precisaSairHorizontalmente) {
    pontos.push({ x: 0, y: origem.y })
    pontos.push({ x: destino.x, y: destino.y })
  } else if (precisaEntrarHorizontalmente) {
    pontos.push({ x: 0, y: destino.y })
    pontos.push({ x: destino.x, y: destino.y })
  } else {
    pontos.push({ x: destino.x, y: destino.y })
  }

  // Remove pontos colineares ou duplicados consecutivos
  const limpos: Posicao2D[] = []
  for (let i = 0; i < pontos.length; i++) {
    const p = pontos[i]
    if (i === 0) {
      limpos.push(p)
    } else {
      const ant = limpos[limpos.length - 1]
      if (Math.hypot(p.x - ant.x, p.y - ant.y) > 0.5) {
        limpos.push(p)
      }
    }
  }

  return limpos.length > 0 ? limpos : [origem, destino]
}

/**
 * Interpola posição ao longo de uma sequência de waypoints.
 */
export function interpolarWaypoints(waypoints: Posicao2D[], progresso: number): Posicao2D {
  if (waypoints.length === 0) return { x: 0, y: 0 }
  if (waypoints.length === 1) return waypoints[0]

  const pClamped = Math.max(0, Math.min(1, progresso))

  // Calcula comprimentos de cada segmento
  const comprimentos: number[] = []
  let comprimentoTotal = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y)
    comprimentos.push(d)
    comprimentoTotal += d
  }

  if (comprimentoTotal === 0) return waypoints[0]

  const distanciaAlvo = pClamped * comprimentoTotal
  let distanciaAcumulada = 0

  for (let i = 0; i < waypoints.length - 1; i++) {
    const segLen = comprimentos[i]
    if (distanciaAcumulada + segLen >= distanciaAlvo || i === waypoints.length - 2) {
      const segT = segLen === 0 ? 0 : (distanciaAlvo - distanciaAcumulada) / segLen
      const tClamped = Math.max(0, Math.min(1, segT))
      return {
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * tClamped,
        y: waypoints[i].y + (waypoints[i + 1].y - waypoints[i].y) * tClamped,
      }
    }
    distanciaAcumulada += segLen
  }

  return waypoints[waypoints.length - 1]
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

  // 1. Transições disparadas por mudança no estado real da sonda (inclui suporte a interrupção no meio do caminho)
  if (estadoReal === 'trabalhando' || estadoReal === 'silencioso') {
    if (
      anterior.fase === 'descanso' ||
      anterior.fase === 'caminhando_para_descanso' ||
      anterior.fase === 'levantando'
    ) {
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

  // 2. Continuidade das fases em andamento através de waypoints de corredores
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
      const waypoints = calcularWaypoints(
        { x: anterior.origemX, y: anterior.origemY },
        { x: posMesa.x, y: posMesa.y }
      )
      const posAtual = interpolarWaypoints(waypoints, progresso)
      return {
        ...anterior,
        x: posAtual.x,
        y: posAtual.y,
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
      const waypoints = calcularWaypoints(
        { x: anterior.origemX, y: anterior.origemY },
        { x: posDescanso.x, y: posDescanso.y }
      )
      const posAtual = interpolarWaypoints(waypoints, progresso)
      return {
        ...anterior,
        x: posAtual.x,
        y: posAtual.y,
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
