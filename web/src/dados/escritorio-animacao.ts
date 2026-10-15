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
  /** Caminho congelado da fase atual. Evita recalcular/alterar a rota no meio
   * do percurso quando o layout recebe um novo quadro da sonda. */
  caminho?: Posicao2D[]
}

export const DURACAO_CAMINHADA_MS = 900
export const DURACAO_TRANSICAO_CADEIRA_MS = 320

export interface AreaCaminhavel {
  x: number
  z: number
  largura: number
  profundidade: number
}

export interface SalaCaminhavel extends AreaCaminhavel {
  abertura: number
}

export interface ArquiteturaCaminhavel {
  salas: readonly SalaCaminhavel[]
  corredor: AreaCaminhavel
  recepcao: AreaCaminhavel
}

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
  return Math.max(0, Math.min(1, t))
}

function distancia(a: Posicao2D, b: Posicao2D) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pontosSemDuplicatas(pontos: Posicao2D[]): Posicao2D[] {
  const limpos: Posicao2D[] = []
  pontos.forEach((ponto) => {
    const anterior = limpos[limpos.length - 1]
    if (!anterior || distancia(anterior, ponto) > 0.5) limpos.push({ ...ponto })
  })
  return limpos
}

/** Entrada física do V8, ao lado da recepção e já fora do volume do balcão. */
export function pontoEntradaDoEscritorio(arquitetura: ArquiteturaCaminhavel): Posicao2D {
  const recepcao = arquitetura.recepcao
  return {
    x: recepcao.x + recepcao.largura + 28,
    y: recepcao.z + recepcao.profundidade + 22,
  }
}

function salaNaPosicao(arquitetura: ArquiteturaCaminhavel, ponto: Posicao2D) {
  return arquitetura.salas.find((sala) =>
    ponto.x >= sala.x - 2
    && ponto.x <= sala.x + sala.largura + 2
    && ponto.y >= sala.z - 2
    && ponto.y <= sala.z + sala.profundidade + 28
  )
}

function pontosDaPorta(sala: SalaCaminhavel) {
  const centroX = sala.x + sala.largura / 2
  const frenteY = sala.z + sala.profundidade
  return {
    dentro: { x: centroX, y: frenteY - 12 },
    fora: { x: centroX, y: frenteY + 12 },
  }
}

/**
 * Rota espacial do V8. Ao sair de uma sala, cruza a abertura frontal antes
 * de alcançar o eixo do corredor. Ao entrar, faz o percurso inverso. A
 * recepção é o ponto de nascimento e remoção dos agentes.
 */
export function calcularRotaEscritorio(
  arquitetura: ArquiteturaCaminhavel,
  origem: Posicao2D,
  destino: Posicao2D,
): Posicao2D[] {
  const salaOrigem = salaNaPosicao(arquitetura, origem)
  const salaDestino = salaNaPosicao(arquitetura, destino)
  if (salaOrigem && salaOrigem === salaDestino) return pontosSemDuplicatas([origem, destino])

  const corredorX = arquitetura.corredor.x + arquitetura.corredor.largura / 2
  const pontos: Posicao2D[] = [origem]
  let eixoOrigemY = origem.y
  let eixoDestinoY = destino.y

  if (salaOrigem) {
    const porta = pontosDaPorta(salaOrigem)
    pontos.push(porta.dentro, porta.fora)
    eixoOrigemY = porta.fora.y
  }

  if (salaDestino) eixoDestinoY = pontosDaPorta(salaDestino).fora.y
  pontos.push({ x: corredorX, y: eixoOrigemY })
  pontos.push({ x: corredorX, y: eixoDestinoY })

  if (salaDestino) {
    const porta = pontosDaPorta(salaDestino)
    pontos.push(porta.fora, porta.dentro)
  }
  pontos.push(destino)
  return pontosSemDuplicatas(pontos)
}

function caminhoDaFase(rota: readonly Posicao2D[] | undefined, origem: Posicao2D, destino: Posicao2D) {
  if (!rota?.length) return calcularWaypoints(origem, destino)
  return pontosSemDuplicatas([origem, ...rota, destino])
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
  ferramenta?: string | null,
  rota?: readonly Posicao2D[],
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
  const mesaMudou = distancia({ x: anterior.x, y: anterior.y }, posMesa) > 0.5
  const descansoMudou = distancia({ x: anterior.destinoX, y: anterior.destinoY }, posDescanso) > 0.5

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
        caminho: caminhoDaFase(rota, { x: anterior.x, y: anterior.y }, posMesa),
      }
    }
    if ((anterior.fase === 'trabalhando' || anterior.fase === 'silencioso') && mesaMudou) {
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
        caminho: caminhoDaFase(rota, { x: anterior.x, y: anterior.y }, posMesa),
      }
    }
    if (anterior.fase === 'caminhando_para_mesa'
      && distancia({ x: anterior.destinoX, y: anterior.destinoY }, posMesa) > 0.5) {
      return {
        ...anterior,
        origemX: anterior.x,
        origemY: anterior.y,
        destinoX: posMesa.x,
        destinoY: posMesa.y,
        tempoInicioFaseMs: tempoAgoraMs,
        duracaoFaseMs: DURACAO_CAMINHADA_MS,
        progressoFase: 0,
        posturaTrabalho: postura,
        caminho: caminhoDaFase(rota, { x: anterior.x, y: anterior.y }, posMesa),
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
        caminho: caminhoDaFase(rota, { x: anterior.x, y: anterior.y }, posDescanso),
      }
    }
    if (anterior.fase === 'caminhando_para_descanso' && descansoMudou) {
      return {
        ...anterior,
        origemX: anterior.x,
        origemY: anterior.y,
        destinoX: posDescanso.x,
        destinoY: posDescanso.y,
        tempoInicioFaseMs: tempoAgoraMs,
        duracaoFaseMs: DURACAO_CAMINHADA_MS,
        progressoFase: 0,
        posturaTrabalho: postura,
        caminho: caminhoDaFase(rota, { x: anterior.x, y: anterior.y }, posDescanso),
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
      const waypoints = anterior.caminho || calcularWaypoints(
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
          caminho: caminhoDaFase(rota, { x: posMesa.x, y: posMesa.y }, posDescanso),
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
      const waypoints = anterior.caminho || calcularWaypoints(
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
