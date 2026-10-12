import humanBiaBackUrl from './pixel-office-rpg/human-bia-costas.png'
import humanBiaFrontUrl from './pixel-office-rpg/human-bia-frente.png'
import humanGastaoBackUrl from './pixel-office-rpg/human-gastao-costas.png'
import humanGastaoFrontUrl from './pixel-office-rpg/human-gastao-frente.png'
import humanLuanaBackUrl from './pixel-office-rpg/human-luana-costas.png'
import humanLuanaFrontUrl from './pixel-office-rpg/human-luana-frente.png'
import humanRenatoBackUrl from './pixel-office-rpg/human-renato-costas.png'
import humanRenatoFrontUrl from './pixel-office-rpg/human-renato-frente.png'
import robotBlueBackUrl from './pixel-office-rpg/robot-azul-costas.png'
import robotBlueFrontUrl from './pixel-office-rpg/robot-azul-frente.png'
import robotIvoryBackUrl from './pixel-office-rpg/robot-marfim-costas.png'
import robotIvoryFrontUrl from './pixel-office-rpg/robot-marfim-frente.png'
import robotGreenBackUrl from './pixel-office-rpg/robot-verde-costas.png'
import robotGreenFrontUrl from './pixel-office-rpg/robot-verde-frente.png'
import robotVioletBackUrl from './pixel-office-rpg/robot-violeta-costas.png'
import robotVioletFrontUrl from './pixel-office-rpg/robot-violeta-frente.png'
import {
  compactacaoRpg,
  projetarRpg,
  statusSeguroDaExecucao,
  type HitRpg,
  type IlhaRpg,
  type PoseRpg,
  type QuadroRpg,
} from './PixelOffice.rpg-data'

type Point = { x: number; y: number }
type Direction = 'down' | 'left' | 'right' | 'up'
type Bounds = { x: number; y: number; width: number; height: number }
type CharacterBounds = Bounds & { point: Point; selected: boolean; statusColor: string; robot: boolean; status: string | null }

const ROBOT_VARIANTS = [
  { front: robotBlueFrontUrl, back: robotBlueBackUrl },
  { front: robotVioletFrontUrl, back: robotVioletBackUrl },
  { front: robotGreenFrontUrl, back: robotGreenBackUrl },
  { front: robotIvoryFrontUrl, back: robotIvoryBackUrl },
] as const

const DIRECTOR_ROBOTS = {
  luana: ROBOT_VARIANTS[2],
  renato: ROBOT_VARIANTS[3],
  bia: ROBOT_VARIANTS[1],
  gastao: ROBOT_VARIANTS[0],
} as const

const HUMAN_VARIANTS = {
  luana: { front: humanLuanaFrontUrl, back: humanLuanaBackUrl },
  renato: { front: humanRenatoFrontUrl, back: humanRenatoBackUrl },
  bia: { front: humanBiaFrontUrl, back: humanBiaBackUrl },
  gastao: { front: humanGastaoFrontUrl, back: humanGastaoBackUrl },
} as const

// Cores dos personagens e estados preservadas; materiais do cenário definidos abaixo.
const PALETTE = {
  void: '#081013',
  ink: '#101820',
  teal: '#19213f',
  moss: '#2f395a',
  wood: '#9a6238',
  gold: '#e1b657',
  cream: '#f3e3b1',
  leaf: '#5b8c55',
  live: '#75c878',
  idle: '#e1b657',
  rest: '#82958f',
} as const

const NAV = [
  ['diretores', 'AGENTES'],
  ['estudio', 'CONTEÚDO'],
  ['pipeline', 'COMERCIAL'],
  ['financeiro', 'FINANCEIRO'],
  ['cofre', 'MEMÓRIA'],
  ['ferramentas', 'OPERAÇÃO'],
] as const

const NAVIGATION_Y = 94
const NAVIGATION_HEIGHT = 23
const ROOM_NAVIGATION_GAP = 8
const ROOM_SIGN_HEIGHT = 21
const ROOM_SIGN_FURNITURE_GAP = 3
export const RAIO_PASSEIO_X = 15

let assetVersion = 0
const robotImages = new Map<string, HTMLImageElement>()

function loadRobotImage(url: string) {
  if (typeof Image === 'undefined') return null
  const current = robotImages.get(url)
  if (current) return current.complete && current.naturalWidth > 0 ? current : null
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => { assetVersion += 1 }
  image.src = url
  robotImages.set(url, image)
  return null
}

const round = (value: number) => Math.round(value)
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

function colorChannels(color: string, fallback = PALETTE.moss) {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
  return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16))
}

function blendColor(base: string, target: string, ratio: number) {
  const from = colorChannels(base)
  const to = colorChannels(target)
  return `rgb(${from.map((channel, index) => round(channel + (to[index] - channel) * clamp(ratio))).join(',')})`
}

function validColor(color: string | undefined, fallback: string) {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string | CanvasPattern | CanvasGradient, stroke?: string, lineWidth = 1) {
  ctx.beginPath()
  points.forEach((point, index) => {
    const x = round(point.x)
    const y = round(point.y)
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}


function roundedPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string | CanvasGradient, stroke?: string, lineWidth = 1) {
  ctx.beginPath()
  ctx.roundRect(round(x), round(y), Math.max(1, round(width)), Math.max(1, round(height)), radius)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke() }
}

function drawSmoothFurniture(ctx: CanvasRenderingContext2D, kind: 'desk' | 'chair' | 'plant', x: number, y: number, width: number, height: number) {
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.shadowColor = '#40362630'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2
  if (kind === 'desk') {
    // Tampo âmbar, saia e gaveteiro dão volume sem alterar a escala do posto.
    roundedPanel(ctx, x + 3, y + height * .43, width - 6, height * .44, 2, '#754725', '#4c3425', .7)
    roundedPanel(ctx, x + width * .76, y + height * .43, width * .19, height * .52, 2, '#89542c')
    const wood = ctx.createLinearGradient(x, y + height * .24, x, y + height * .6)
    wood.addColorStop(0, '#b77d39'); wood.addColorStop(1, '#a66b31')
    roundedPanel(ctx, x, y + height * .24, width, height * .38, 3, wood, '#d09a51', 1)
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#f0e4c5'; ctx.fillRect(x + width * .1, y + height * .32, width * .18, height * .16)
    // Espessura e dobra da folha, legíveis mesmo no módulo compacto.
    ctx.fillStyle = '#c8b994'; ctx.fillRect(x + width * .1, y + height * .48, width * .18, 1)
    ctx.fillStyle = '#fff5db'; ctx.fillRect(x + width * .23, y + height * .32, width * .05, 2)
    ctx.fillStyle = '#222a32'; ctx.fillRect(x + width * .82, y + height * .27, width * .07, height * .14)
    ctx.fillStyle = '#526171'; ctx.fillRect(x + width * .82, y + height * .27, width * .07, 1)
    ctx.fillStyle = '#222a32'
    ctx.fillRect(x + width * .47, y + height * .23, width * .06, height * .12)
    ctx.fillRect(x + width * .39, y + height * .34, width * .23, 2)
    roundedPanel(ctx, x + width * .34, y, width * .32, height * .3, 2, '#222a32', '#526171', .7)
    // Atrás da mesa, o ocupante olha para a tela; a câmera vê a carcaça.
    ctx.fillStyle = '#222a32'; ctx.fillRect(x + width * .38, y + height * .32, width * .27, 2)
    ctx.fillStyle = '#d09a51'; ctx.fillRect(x + width * .81, y + height * .73, width * .09, 1)
  } else if (kind === 'chair') {
    roundedPanel(ctx, x + width * .18, y, width * .64, height * .56, 4, '#526171', '#687789', .8)
    ctx.shadowColor = 'transparent'
    roundedPanel(ctx, x + width * .08, y + height * .5, width * .84, height * .22, 3, '#35414d')
    ctx.strokeStyle = '#35414d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + width / 2, y + height * .68); ctx.lineTo(x + width / 2, y + height * .9); ctx.moveTo(x + width * .2, y + height); ctx.lineTo(x + width / 2, y + height * .88); ctx.lineTo(x + width * .8, y + height); ctx.stroke()
  } else {
    const cx = x + width / 2
    polygon(ctx, [{ x: x + width * .2, y: y + height * .61 }, { x: x + width * .8, y: y + height * .61 }, { x: x + width * .7, y: y + height }, { x: x + width * .3, y: y + height }], '#4c4934', '#5b5237')
    ctx.shadowColor = 'transparent'
    // Feixes de folhas sobrepostas, sem palmeiras altas nem vasos gigantes.
    for (let leaf = 0; leaf < 9; leaf += 1) {
      const angle = leaf * 2.4
      const lx = cx + Math.cos(angle) * width * .28
      const ly = y + height * (.3 + Math.sin(angle) * .18)
      ctx.fillStyle = ['#426524', '#76a732', '#b1ca52'][leaf % 3]
      ctx.beginPath(); ctx.ellipse(lx, ly, width * .13, height * .23, -Math.cos(angle) * .8, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.restore()
}

function projection(layout: QuadroRpg['layout']) {
  const { mapa } = compactacaoRpg(layout)
  const origin = projetarRpg(layout, 0, 0, 0)
  const unitX = projetarRpg(layout, 1, 0, 0)
  const unitY = projetarRpg(layout, 0, 1, 0)
  const unitElevation = projetarRpg(layout, 0, 0, 1)
  const basisX = { x: unitX.x - origin.x, y: unitX.y - origin.y }
  const basisY = { x: unitY.x - origin.x, y: unitY.y - origin.y }
  const basisElevation = { x: unitElevation.x - origin.x, y: unitElevation.y - origin.y }
  return (x: number, y: number, elevation = 0) => {
    const mappedX = mapa(x, y)
    return {
      x: round(origin.x + mappedX * basisX.x + y * basisY.x + elevation * basisElevation.x),
      y: round(origin.y + mappedX * basisX.y + y * basisY.y + elevation * basisElevation.y),
    }
  }
}

function drawSceneDecor(ctx: CanvasRenderingContext2D, layout: QuadroRpg['layout'], project: ReturnType<typeof projection>) {
  // Mobília de cena: não gera postos, ocupantes, etiquetas pessoais ou hits.
  // O corredor entre a última fileira e o lounge já pertence ao piso aprovado.
  const box = (x: number, y: number, width: number, depth: number, bottom: number, height: number, top: string, front: string, side: string) => {
    const a = project(x, y, bottom + height), b = project(x + width, y, bottom + height)
    const c = project(x + width, y + depth, bottom + height), d = project(x, y + depth, bottom + height)
    polygon(ctx, [d, c, project(x + width, y + depth, bottom), project(x, y + depth, bottom)], front)
    polygon(ctx, [b, c, project(x + width, y + depth, bottom), project(x + width, y, bottom)], side)
    polygon(ctx, [a, b, c, d], top)
  }
  const shadow = (x: number, y: number, width: number, depth: number) => {
    polygon(ctx, [project(x - 2, y), project(x + width + 4, y), project(x + width + 4, y + depth + 4), project(x - 2, y + depth + 4)], '#40362626')
  }
  ctx.save()
  const receptionWidth = Math.min(88, layout.largura * .2)
  let receptionX = layout.largura * .24 - receptionWidth / 2
  const loungeLeft = (layout.largura - Math.min(layout.largura - 60, 140 + layout.ocupantesDescanso * 44)) / 2
  // Reserva a placa existente em plantas estreitas; um sofá basta nesse caso.
  if (layout.descansoAberto && receptionX < loungeLeft + 120 && receptionX + receptionWidth > loungeLeft) receptionX = loungeLeft + 120
  const receptionY = layout.descansoY + (layout.descansoAberto ? 16 : -8)
  const counterHeight = layout.descansoAberto ? 30 : 17
  shadow(receptionX, receptionY, receptionWidth, 21)
  box(receptionX + 3, receptionY + 2, receptionWidth - 6, 18, 0, 4, '#b49a6a', '#947e59', '#947e59')
  box(receptionX, receptionY, receptionWidth, 21, 4, counterHeight, '#ede1bf', '#d7c398', '#b49a6a')
  box(receptionX - 2, receptionY - 1, receptionWidth + 4, 23, counterHeight + 4, 3, '#ede1bf', '#e2d4b3', '#c6b087')
  // Painel rebaixado claro, sem monitor ou cadeira que sugiram agente extra.
  polygon(ctx, [project(receptionX + 7, receptionY + 21, counterHeight - 3), project(receptionX + receptionWidth - 7, receptionY + 21, counterHeight - 3), project(receptionX + receptionWidth - 7, receptionY + 21, 9), project(receptionX + 7, receptionY + 21, 9)], '#e2d4b3')

  if (layout.descansoAberto) {
    const sofaWidth = Math.min(104, layout.largura * .21)
    // Dois sofás atrás da fileira existente, com passagem entre os volumes.
    // O limite frontal fica antes dos pés dos robôs; poses seguem intactas.
    for (const center of [layout.largura * .55, layout.largura * .81]) {
      const x = center - sofaWidth / 2, y = layout.descansoY + 10
      if (x < receptionX + receptionWidth + 16 && x + sofaWidth > receptionX - 16) continue
      shadow(x, y, sofaWidth, 25)
      box(x + 4, y + 3, sofaWidth - 8, 21, 0, 4, '#293238', '#222a32', '#222a32')
      box(x, y, sofaWidth, 25, 4, 9, '#616a6b', '#293238', '#35414d')
      box(x, y, sofaWidth, 7, 13, 15, '#616a6b', '#465154', '#293238')
      const cushionWidth = (sofaWidth - 19) / 2
      for (let cushion = 0; cushion < 2; cushion += 1) {
        box(x + 8 + cushion * (cushionWidth + 3), y + 9, cushionWidth, 14, 13, 3, '#616a6b', '#465154', '#35414d')
      }
      for (const armX of [x, x + sofaWidth - 6]) {
        box(armX, y + 6, 6, 19, 13, 7, '#697273', '#35414d', '#293238')
      }
    }
  }
  ctx.restore()
}

function alphaForIsland(quadro: QuadroRpg, island?: IlhaRpg) {
  return island ? clamp(quadro.progressos?.get(island.squad) ?? 1) : 1
}

type SceneCache = { key: string; canvas: HTMLCanvasElement }
let sceneCache: SceneCache | null = null

function sceneKey(quadro: QuadroRpg) {
  const { layout } = quadro
  return JSON.stringify([
    assetVersion,
    round(layout.largura),
    round(layout.altura),
    layout.descansoAberto,
    layout.ocupantesDescanso,
    layout.ilhas.map((island) => [
      island.squad,
      island.nome,
      island.cor,
      round(island.x),
      round(island.y),
      round(island.largura),
      round(island.altura),
      island.postos.map((desk) => [round(desk.x), round(desk.y)]),
    ]),
  ])
}

function navigationBounds(project: ReturnType<typeof projection>, width: number) {
  const navigationWidth = (width - 64) / NAV.length
  // Y único pra toda a faixa: o project() de cada item isolado sobe junto com
  // o telhado em perspectiva (quanto mais x, mais alto o ponto projetado), o
  // que fazia os rótulos da navegação subirem em diagonal e ficarem difíceis
  // de ler. A faixa é uma barra de navegação, não uma parede 3D: todo item
  // ancora no Y do primeiro ponto, então a linha inteira fica horizontal.
  const baselineY = project(32, NAVIGATION_Y, 12).y - 12
  return NAV.map(([, label], index) => {
    const a = project(32 + navigationWidth * index, NAVIGATION_Y, 12)
    const b = project(32 + navigationWidth * (index + 1) - 4, NAVIGATION_Y, 12)
    const x = Math.min(a.x, b.x)
    const itemWidth = Math.max(32, Math.abs(b.x - a.x))
    return { label, x, y: baselineY, width: itemWidth, height: NAVIGATION_HEIGHT }
  })
}

type RoomSign = { name: string; anchor: Point; area: Bounds; furniture: ReadonlyArray<Bounds> }

function boundsOverlap(a: Bounds, b: Bounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function roomSignBounds(
  width: number,
  height: number,
  anchor: Point,
  area: Bounds,
  furniture: ReadonlyArray<Bounds>,
  navigation: ReadonlyArray<Bounds>,
  canvas: { width: number; height: number },
  ampliarBusca = true,
): Bounds {
  const minimumX = clamp(area.x, 4, Math.max(4, canvas.width - width - 4))
  const maximumX = clamp(area.x + area.width - width, minimumX, Math.max(minimumX, canvas.width - width - 4))
  const minimumY = clamp(area.y, 4, Math.max(4, canvas.height - height - 4))
  const maximumY = clamp(area.y + area.height - height, minimumY, Math.max(minimumY, canvas.height - height - 4))
  const preferredX = round(clamp(anchor.x - width / 2, minimumX, maximumX))
  const preferredY = round(clamp(anchor.y - height / 2, minimumY, maximumY))
  const xCandidates = new Set([minimumX, maximumX, preferredX])
  const yCandidates = new Set([minimumY, maximumY, preferredY])
  furniture.forEach((item) => {
    xCandidates.add(clamp(item.x - width - ROOM_SIGN_FURNITURE_GAP, minimumX, maximumX))
    xCandidates.add(clamp(item.x + item.width + ROOM_SIGN_FURNITURE_GAP, minimumX, maximumX))
    yCandidates.add(clamp(item.y - height - ROOM_SIGN_FURNITURE_GAP, minimumY, maximumY))
    yCandidates.add(clamp(item.y + item.height + ROOM_SIGN_FURNITURE_GAP, minimumY, maximumY))
  })

  let bestBounds: Bounds | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidateX of xCandidates) {
    const x = round(candidateX)
    const clearNavigation = navigation.reduce((lowestY, item) => {
      const overlaps = x < item.x + item.width && x + width > item.x
      return overlaps ? Math.max(lowestY, item.y + item.height + 12) : lowestY
    }, minimumY)
    for (const candidateY of yCandidates) {
      const y = round(clamp(Math.max(candidateY, clearNavigation), minimumY, maximumY))
      const bounds = { x, y, width, height }
      const obstructed = furniture.some((item) => boundsOverlap(bounds, {
        x: item.x - ROOM_SIGN_FURNITURE_GAP,
        y: item.y - ROOM_SIGN_FURNITURE_GAP,
        width: item.width + ROOM_SIGN_FURNITURE_GAP * 2,
        height: item.height + ROOM_SIGN_FURNITURE_GAP * 2,
      }))
      if (obstructed) continue
      const score = Math.abs(x - preferredX) + Math.abs(y - preferredY) * 2
      if (score < bestScore) {
        bestBounds = bounds
        bestScore = score
      }
    }
  }
  if (bestBounds) return bestBounds
  if (ampliarBusca) {
    // Na malha densa a placa pode não caber entre fileiras. Procure acima
    // do setor, em todo o salão, antes de recorrer à posição preferida.
    const top = Math.max(4, ...navigation.map((item) => item.y + item.height + 12))
    return roomSignBounds(width, height, anchor, {
      x: 4, y: top, width: canvas.width - 8,
      height: Math.max(height, anchor.y + height - top),
    }, furniture, navigation, canvas, false)
  }
  return { x: preferredX, y: preferredY, width, height }
}

function drawRoomSign(ctx: CanvasRenderingContext2D, sign: RoomSign, navigation: ReadonlyArray<Bounds>) {
  const { name, anchor, area, furniture } = sign
  const title = name.toLocaleUpperCase('pt-BR')
  const available = Math.max(92, Math.min(196, ctx.canvas.width - 16))
  ctx.font = '800 10px Arial, sans-serif'
  let label = title
  while (label.length > 4 && ctx.measureText(label).width > available - 24) label = `${label.slice(0, -2)}…`
  const width = Math.max(92, Math.min(available, round(ctx.measureText(label).width) + 24))
  const height = ROOM_SIGN_HEIGHT
  const { x, y } = roomSignBounds(width, height, anchor, area, furniture, navigation, ctx.canvas)
  ctx.save()
  if (Math.hypot(x + width / 2 - anchor.x, y + height / 2 - anchor.y) > 45) {
    ctx.strokeStyle = '#758b8e99'
    ctx.lineWidth = .75
    ctx.beginPath()
    ctx.moveTo(x + width / 2, y + height)
    ctx.lineTo(anchor.x, anchor.y + height / 2)
    ctx.stroke()
  }
  ctx.shadowColor = '#07101d33'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2
  roundedPanel(ctx, x, y, width, height, 4, '#202b35', '#99a6a7', .8)
  ctx.shadowColor = 'transparent'
  roundedPanel(ctx, x + 5, y + 5, 3, height - 10, 1, '#8ebac4')
  ctx.fillStyle = '#f2f1e9'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + width / 2 + 3, y + height / 2 + 1)
  ctx.restore()
  return { x, y, width, height }
}

function drawRoom(island: IlhaRpg, project: ReturnType<typeof projection>, wallTopLimit: number): RoomSign {
  // Placa flutuante sobre o início do setor, sem paredes nem piso individual.
  const first = island.postos[0]
  const firstRow = island.postos.filter((desk) => desk.y === first.y)
  const left = project(firstRow[0].x - 40, first.y - 55)
  const right = project(firstRow[firstRow.length - 1].x + 40, first.y - 55)
  return {
    name: island.nome,
    anchor: { x: (left.x + right.x) / 2, y: Math.max(wallTopLimit + ROOM_SIGN_HEIGHT / 2, left.y) },
    area: {
      x: left.x - 30, y: Math.max(wallTopLimit, left.y - ROOM_SIGN_HEIGHT),
      width: right.x - left.x + 60, height: ROOM_SIGN_HEIGHT * 2,
    },
    furniture: island.postos.map((desk) => {
      const point = project(desk.x, desk.y + 18)
      return { x: point.x - 31, y: point.y - 28, width: 62, height: 45 }
    }),
  }
}

function drawGlassRoom(ctx: CanvasRenderingContext2D, islands: ReadonlyArray<IlhaRpg>, project: ReturnType<typeof projection>) {
  // Extents de squads podem se cruzar ao virar a fileira da grade contínua.
  // Escolha um grupo pequeno em uma só fileira, nunca o salão principal.
  const largest = Math.max(0, ...islands.map((island) => island.postos.length))
  const room = [...islands].filter((island) =>
    island.postos.length > 0 && island.postos.length < largest &&
    island.postos.every((desk) => desk.y === island.postos[0].y),
  ).sort((a, b) => a.postos.length - b.postos.length || a.x - b.x)[0]
  if (!room) return
  const left = Math.min(...room.postos.map((desk) => desk.x)) - 38
  const right = Math.max(...room.postos.map((desk) => desk.x)) + 38
  const back = room.postos[0].y - 26
  const front = room.postos[0].y + 42
  // Sem preenchimento: piso e mobiliário continuam visíveis entre os perfis.
  ctx.save()
  ctx.globalAlpha = .38
  ctx.strokeStyle = '#758b8e'
  ctx.lineWidth = .8
  const line = (points: Point[]) => {
    ctx.beginPath()
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
    ctx.stroke()
  }
  for (const elevation of [0, 56]) {
    line([project(left, front, elevation), project(left, back, elevation), project(right, back, elevation), project(right, front, elevation)])
    // Vão frontal sugere a passagem, sem atravessar a mesa com uma barra.
    line([project(left, front, elevation), project(left + 16, front, elevation)])
    line([project(right - 16, front, elevation), project(right, front, elevation)])
  }
  for (const [x, y] of [[left, back], [right, back], [left, front], [right, front]]) {
    line([project(x, y), project(x, y, 56)])
  }
  ctx.restore()
}

function drawStaticScene(ctx: CanvasRenderingContext2D, quadro: QuadroRpg) {
  const { layout } = quadro
  const width = round(layout.largura)
  const height = round(layout.altura)
  const project = projection(layout)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#09131e'
  ctx.fillRect(0, 0, width, height)

  const floor = [project(10, 8), project(width - 10, 8), project(width - 10, height - 10), project(10, height - 10)]
  const floorGradient = ctx.createLinearGradient(0, floor[0].y, 0, Math.max(...floor.map((point) => point.y)))
  floorGradient.addColorStop(0, '#dacda9'); floorGradient.addColorStop(.55, '#d6c79f'); floorGradient.addColorStop(1, '#d2c29b')
  polygon(ctx, [floor[3], floor[2], { x: floor[2].x, y: floor[2].y + 6 }, { x: floor[3].x, y: floor[3].y + 6 }], '#77766e', '#e2d4b3', 1)
  polygon(ctx, floor, floorGradient, '#e2d4b3', 1)

  const wall = [project(14, 6, 94), project(width - 14, 6, 94), project(width - 14, 6, 2), project(14, 6, 2)]
  const wallGradient = ctx.createLinearGradient(0, wall[0].y, 0, wall[2].y)
  wallGradient.addColorStop(0, '#d0ae68'); wallGradient.addColorStop(1, '#c8a45d')
  polygon(ctx, wall, wallGradient, '#d8b76b', 1.5)
  // Ripas verticais no plano posterior, sempre do rodapé ao arremate.
  for (let x = 18; x < width - 14; x += 6) {
    const top = project(x, 6, 93), bottom = project(x, 6, 3)
    ctx.strokeStyle = '#947239'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke()
    ctx.strokeStyle = '#dfc17d'; ctx.lineWidth = .7
    ctx.beginPath(); ctx.moveTo(top.x + 1.5, top.y); ctx.lineTo(bottom.x + 1.5, bottom.y); ctx.stroke()
  }
  const side = [project(10, 8, 94), project(10, height - 10, 94), project(10, height - 10), project(10, 8)]
  polygon(ctx, side, '#24343c', '#758b8e', 1)
  polygon(ctx, [project(11, 30, 38), project(11, height - 30, 38), project(11, height - 30, 8), project(11, 30, 8)], '#8ebac433', '#8ebac4', .6)
  const trimLeft = project(14, 6, 9), trimRight = project(width - 14, 6, 9)
  ctx.strokeStyle = '#d8b76b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(trimLeft.x, trimLeft.y); ctx.lineTo(trimRight.x, trimRight.y); ctx.stroke()
  const sign = project(width / 2, 7, 60)
  roundedPanel(ctx, sign.x - 84, sign.y - 15, 168, 29, 7, '#17243aee', '#d8b76b', 1.5)
  ctx.fillStyle = PALETTE.cream
  ctx.font = '700 10px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CT // AGENT OFFICE', sign.x, sign.y)

  const navigation = navigationBounds(project, width)
  navigation.forEach(({ label, x, y, width: itemWidth }) => {
    roundedPanel(ctx, x + 2, y, itemWidth - 4, NAVIGATION_HEIGHT, 4, '#27313c', '#99a6a7', .75)
    ctx.fillStyle = '#f2f1e9'
    // 7px grudava as letras (glifo bold nesse tamanho esbarra no vizinho e
    // "AGENTES" virava ilegível). 8px é o menor tamanho que ainda sai limpo
    // nesta fonte de navegação. As placas de sala usam Arial em peso 800.
    ctx.font = '700 8px "JetBrains Mono", monospace'
    ctx.fillText(label, x + itemWidth / 2, y + 11)
  })

  const navigationBottom = Math.max(...navigation.map((item) => item.y + item.height))
  const wallTopLimit = navigationBottom + ROOM_NAVIGATION_GAP
  const roomSigns: RoomSign[] = []
  if (layout.ilhas.length) {
    const left = Math.min(...layout.ilhas.map((island) => island.x))
    const top = Math.min(...layout.ilhas.map((island) => island.y))
    const right = Math.max(...layout.ilhas.map((island) => island.x + island.largura))
    const bottom = layout.descansoAberto
      ? height - 14
      : Math.max(...layout.ilhas.map((island) => island.y + island.altura))
    // O mesmo piso inclui corredores e descanso, sem uma segunda zona de cor.
    polygon(ctx, [project(left, top), project(right, top), project(right, bottom), project(left, bottom)], '#b9b6ae')
  }
  drawGlassRoom(ctx, layout.ilhas, project)
  layout.ilhas.forEach((island) => {
    roomSigns.push(drawRoom(island, project, wallTopLimit))

    island.mesas.forEach((desk) => {
      const point = project(desk.x, desk.y + 18)
      drawSmoothFurniture(ctx, 'chair', point.x - 13, point.y - 35, 26, 34)
      drawSmoothFurniture(ctx, 'desk', point.x - 31, point.y - 28, 62, 45)
    })
  })
  // Plantas acompanham o perímetro do salão, não os limites dos squads.
  for (const x of [18, layout.largura - 18]) {
    const plant = project(x, layout.descansoY - 20)
    drawSmoothFurniture(ctx, 'plant', plant.x - 9, plant.y - 22, 18, 26)
  }
  const furniture = roomSigns.flatMap((sign) => sign.furniture)
  const signsPlaced: Bounds[] = []
  roomSigns.forEach((sign) => {
    signsPlaced.push(drawRoomSign(ctx, { ...sign, furniture: [...furniture, ...signsPlaced] }, navigation))
  })

  drawSceneDecor(ctx, layout, project)

  if (layout.descansoAberto) {
    const loungeWidth = Math.min(width - 60, 140 + layout.ocupantesDescanso * 44)
    const x = (width - loungeWidth) / 2
    const label = project(x + 8, layout.descansoY + 8)
    roundedPanel(ctx, label.x - 4, label.y - 8, 76, 16, 3, '#202b35', '#99a6a7', .6)
    ctx.fillStyle = '#f2f1e9'
    ctx.font = '700 8px "JetBrains Mono", monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`LOUNGE ${layout.ocupantesDescanso}`, label.x, label.y)
  }

  for (const x of [30, width - 30]) {
    const plant = project(x, height - 30)
    drawSmoothFurniture(ctx, 'plant', plant.x - 10, plant.y - 24, 20, 28)
  }
}

function staticScene(quadro: QuadroRpg) {
  if (typeof document === 'undefined') return null
  const key = sceneKey(quadro)
  if (sceneCache?.key === key) return sceneCache.canvas
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, round(quadro.layout.largura))
  canvas.height = Math.max(1, round(quadro.layout.altura))
  const context = canvas.getContext('2d')
  if (!context) return null
  drawStaticScene(context, quadro)
  sceneCache = { key, canvas }
  return canvas
}

const movement = new Map<string, { x: number; y: number; direction: Direction }>()
const walkingState = new Map<string, boolean>()
let lastWalkEventAt = 0

// Mesa de 62 px domina a estação; preserva o recorte sentado e a âncora dos pés.
const CHARACTER_SCALE = .8

type PasseioAmbiente = { x: number; y: number; direction: Direction }

function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  person: QuadroRpg['personagens'][number]['mesa']['execucao'],
  x: number,
  y: number,
  width: number,
  height: number,
  direction: Direction,
  seatedAtDesk = false,
) {
  const identity = `${person.chave} ${person.nome} ${person.objeto}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const director = (Object.keys(DIRECTOR_ROBOTS) as Array<keyof typeof DIRECTOR_ROBOTS>).find((name) => identity.includes(name))
  const human = (Object.keys(HUMAN_VARIANTS) as Array<keyof typeof HUMAN_VARIANTS>).find((name) => identity.includes(name))
  const variant = person.tipoVisual === 'humano' && human
    ? HUMAN_VARIANTS[human]
    : director
      ? DIRECTOR_ROBOTS[director]
      : ROBOT_VARIANTS[stableHash(person.chave) % ROBOT_VARIANTS.length]
  const image = loadRobotImage(direction === 'up' ? variant.back : variant.front)
  if (!image) return false
  // Aproveita o tronco do arquivo existente, sem reduzir cabeça e ombros
  // junto com as pernas de uma figura em pé (especialmente nos humanos).
  const sourceHeight = image.naturalHeight * (seatedAtDesk ? person.tipoVisual === 'humano' ? .64 : .82 : 1)
  const ratio = image.naturalWidth / sourceHeight
  const targetHeight = height + 5 * CHARACTER_SCALE
  const targetWidth = targetHeight * ratio
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, round(x + (width - targetWidth) / 2), round(y + height - targetHeight), round(targetWidth), round(targetHeight))
  if (person.tipoVisual === 'humano' && human) {
    // Recoloração só na renderização. Preserva cabeça/cabelo; o recorte
    // inferior inclui roupa e mãos, pois o PNG não possui máscara de tecido.
    const drawX = round(x + (width - targetWidth) / 2)
    const drawY = round(y + height - targetHeight)
    const drawWidth = round(targetWidth)
    const drawHeight = round(targetHeight)
    const clothingTop = drawY + drawHeight * (image.naturalHeight * .23 / sourceHeight)
    ctx.beginPath()
    ctx.rect(drawX, clothingTop, drawWidth, drawY + drawHeight - clothingTop)
    ctx.clip()
    ctx.filter = 'grayscale(1) brightness(0.6)'
    ctx.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight)
  }
  ctx.restore()
  return true
}

function recordWalkEvent(key: string, walking: boolean) {
  const wasWalking = walkingState.get(key) ?? false
  if (walking && !wasWalking) lastWalkEventAt = Date.now()
  walkingState.set(key, walking)
}

function directionFor(key: string, pose: PoseRpg): Direction {
  const previous = movement.get(key)
  let direction: Direction = pose.fase === 'trabalhando' || pose.fase === 'silencioso' ? 'up' : 'down'
  if (pose.andando && previous) {
    const dx = pose.x - previous.x
    const dy = pose.y - previous.y
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0.01) direction = dx < 0 ? 'left' : 'right'
    else if (Math.abs(dy) > 0.01) direction = dy < 0 ? 'up' : 'down'
    else direction = previous.direction
  }
  movement.set(key, { x: pose.x, y: pose.y, direction })
  return direction
}

function ruidoPasseio(chave: string, ciclo: number, canal: string) {
  return stableHash(`${chave}:${ciclo}:${canal}`) / 0xffffffff
}

function passeioAmbiente(chave: string, pose: PoseRpg, tempo: number, reduzirMovimento: boolean): PasseioAmbiente | null {
  if (reduzirMovimento || pose.andando || pose.fase !== 'silencioso') return null
  const ciclo = Math.floor(tempo / 20)
  const inicioDoCiclo = ciclo * 20
  const espera = 3 + ruidoPasseio(chave, ciclo, 'espera') * 7
  const duracaoCaminhada = 2 + ruidoPasseio(chave, ciclo, 'duracao') * 3
  const progresso = (tempo - inicioDoCiclo - espera) / duracaoCaminhada
  if (progresso < 0 || progresso > 1) return null

  const lado = ruidoPasseio(chave, ciclo, 'lado') < 0.5 ? -1 : 1
  const amplitude = 18 + ruidoPasseio(chave, ciclo, 'amplitude') * 5
  const faseUm = ruidoPasseio(chave, ciclo, 'fase-um') * Math.PI * 2
  const faseDois = ruidoPasseio(chave, ciclo, 'fase-dois') * Math.PI * 2
  const deslocar = (passo: number) => {
    const arco = Math.sin(passo * Math.PI)
    const harmonia = 1 + Math.sin(passo * Math.PI * 2 + faseUm) * 0.12 + Math.sin(passo * Math.PI * 5 + faseDois) * 0.05
    return {
      x: lado * Math.min(RAIO_PASSEIO_X, amplitude * arco * harmonia),
      y: arco * (Math.sin(passo * Math.PI * 2 + faseDois) * 2 + Math.sin(passo * Math.PI * 4 + faseUm) * 1.2),
    }
  }
  const atual = deslocar(progresso)
  const proximo = deslocar(Math.min(1, progresso + 0.015))
  return {
    x: round(atual.x),
    y: round(atual.y),
    direction: proximo.x < atual.x ? 'left' : 'right',
  }
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  quadro: QuadroRpg,
  character: QuadroRpg['personagens'][number],
  project: ReturnType<typeof projection>,
) {
  const { mesa, pose } = character
  const person = mesa.execucao
  const island = quadro.layout.ilhas.find((item) => item.squad === person.squad)
  const opacity = alphaForIsland(quadro, island)
  if (opacity < 0.03) return null
  const passeio = passeioAmbiente(person.chave, pose, quadro.tempo, quadro.reduzirMovimento)
  const sentado = pose.sentado > 0.5 && !pose.andando && !passeio
  const naMesa = sentado && ['trabalhando', 'silencioso', 'sentando', 'levantando'].includes(pose.fase)
  const mesaPoint = project(mesa.x, mesa.y + 18)
  const pontoBase = naMesa ? { x: mesaPoint.x, y: mesaPoint.y - 4 } : project(pose.x, pose.y + 18)
  const point = { x: pontoBase.x + (passeio?.x ?? 0), y: pontoBase.y + (passeio?.y ?? 0) }
  const directionReal = directionFor(person.animacaoChave, pose)
  const direction = naMesa ? 'down' : pose.andando ? directionReal : passeio?.direction ?? directionReal
  const width = (sentado ? 58 : 62) * CHARACTER_SCALE
  const height = (sentado ? 56 : 64) * CHARACTER_SCALE
  const idleOffsetY = quadro.reduzirMovimento || naMesa ? 0 : round(Math.sin(quadro.tempo * 1.7 + person.ordem * 0.8) * 1.25)
  const spritePoint = { x: point.x, y: point.y + idleOffsetY }
  const x = round(spritePoint.x - width / 2)
  const y = round(spritePoint.y - height + (sentado ? 5 : 0))
  const selected = person.chave === quadro.selecionadoId
  const hovered = person.chave === quadro.hoverId

  ctx.save()
  ctx.globalAlpha *= opacity
  ctx.fillStyle = '#07101d44'
  ctx.beginPath(); ctx.ellipse(point.x, point.y, 15, 4, 0, 0, Math.PI * 2); ctx.fill()
  if (selected || hovered) {
    ctx.strokeStyle = selected ? PALETTE.gold : PALETTE.live
    ctx.lineWidth = selected ? 3 : 2
    ctx.beginPath(); ctx.ellipse(spritePoint.x, spritePoint.y - 1, 20, 8, 0, 0, Math.PI * 2); ctx.stroke()
  }
  if (!drawCharacterSprite(ctx, person, x, y, width, height, direction, naMesa)) {
    const clothing = person.tipoVisual === 'humano' ? '#35414d' : person.cor || PALETTE.moss
    const fallback = ctx.createLinearGradient(point.x, point.y - 38, point.x, point.y)
    fallback.addColorStop(0, blendColor(clothing, '#ffffff', .25)); fallback.addColorStop(1, clothing)
    roundedPanel(ctx, point.x - 12 * CHARACTER_SCALE, point.y - 36 * CHARACTER_SCALE, 24 * CHARACTER_SCALE, 34 * CHARACTER_SCALE, 11 * CHARACTER_SCALE, fallback, '#16233a', 1)
  }
  if (naMesa) {
    // O tampo esconde a parte inferior do sprite inteiro: cabeça e tronco
    // permanecem atrás dele, com antebraços apoiados em direção ao teclado.
    drawSmoothFurniture(ctx, 'desk', mesaPoint.x - 31, mesaPoint.y - 28, 62, 45)
    const hands = person.tipoVisual === 'humano' ? validColor(person.pele, '#d9a47d') : '#d5e4ec'
    for (const side of [-1, 1]) {
      ctx.strokeStyle = person.tipoVisual === 'humano' ? '#35414d' : validColor(person.cor, '#526171'); ctx.lineWidth = 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(mesaPoint.x + side * 17, mesaPoint.y - 23)
      ctx.lineTo(mesaPoint.x + side * 14, mesaPoint.y - 14)
      ctx.lineTo(mesaPoint.x + side * 8, mesaPoint.y - 12); ctx.stroke()
      ctx.fillStyle = hands
      ctx.beginPath(); ctx.ellipse(mesaPoint.x + side * 8, mesaPoint.y - 12, 3, 2, 0, 0, Math.PI * 2); ctx.fill()
    }
  }
  const statusColor = person.ativa ? PALETTE.live : person.execucao.estado === 'silencioso' ? PALETTE.idle : PALETTE.rest
  ctx.fillStyle = statusColor
  ctx.beginPath(); ctx.arc(spritePoint.x + 13, spritePoint.y - 36, 3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  return { point: spritePoint, x: spritePoint.x - 17, y: spritePoint.y - 58, width: 34, height: 61, selected, statusColor, robot: person.tipoVisual === 'robo', status: statusSeguroDaExecucao(person) } satisfies CharacterBounds
}

function drawName(ctx: CanvasRenderingContext2D, name: string, point: Point, color: string, selected: boolean) {
  const label = name.length > 20 ? `${name.slice(0, 19)}…` : name
  ctx.font = '700 8px "JetBrains Mono", monospace'
  const width = Math.max(50, Math.min(126, round(ctx.measureText(label).width) + 18))
  const x = round(point.x - width / 2)
  const y = round(point.y + 6)
  ctx.fillStyle = selected ? '#3b3218' : '#081013e8'
  ctx.fillRect(x, y, width, 17)
  ctx.strokeStyle = selected ? PALETTE.gold : '#363c51'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, 17)
  ctx.fillStyle = color
  ctx.fillRect(x + 5, y + 6, 4, 4)
  ctx.fillStyle = PALETTE.cream
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 13, y + 9)
}

function drawStatusBubble(ctx: CanvasRenderingContext2D, text: string, point: Point, occupied: Bounds[], sceneWidth: number) {
  // Compensa o zoom do canvas: o texto nunca cai abaixo de 12 px CSS.
  const cssScale = ctx.getTransform().a / (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
  const unit = Math.max(1, 1 / Math.max(.001, cssScale))
  ctx.font = `700 ${12 * unit}px "JetBrains Mono", monospace`
  const lines: string[] = []
  text.split(' ').forEach((word) => {
    const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word
    if (lines.length && ctx.measureText(candidate).width > 150 * unit) lines.push(word)
    else if (lines.length) lines[lines.length - 1] = candidate
    else lines.push(word)
  })
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 20 * unit
  const height = (lines.length * 15 + 12) * unit
  const head = { x: point.x, y: point.y - 55 }
  const minX = 4, maxX = Math.max(minX, sceneWidth - width - 4)
  let bounds: Bounds = { x: clamp(head.x - width / 2, minX, maxX), y: Math.max(4, head.y - height - 10 * unit), width, height }
  // Tenta os dois lados da cabeça antes de subir uma linha. Nenhum ativo é
  // descartado por tipo de sprite ou por um limite arbitrário de quantidade.
  search: for (let row = 0; row <= occupied.length + 1; row += 1) {
    for (const offset of [0, width / 2 + 8 * unit, -width / 2 - 8 * unit]) {
      const candidate = { x: clamp(head.x - width / 2 + offset, minX, maxX), y: Math.max(4, head.y - height - 10 * unit - row * (height + 6 * unit)), width, height }
      if (!occupied.some((other) => boundsOverlap(candidate, other))) { bounds = candidate; break search }
    }
  }
  occupied.push(bounds)
  const tailX = clamp(head.x, bounds.x + 10 * unit, bounds.x + width - 10 * unit)
  polygon(ctx, [{ x: tailX - 5 * unit, y: bounds.y + height - 1 }, { x: tailX + 5 * unit, y: bounds.y + height - 1 }, { x: head.x, y: head.y }], '#fff8df', '#8c8068')
  ctx.save()
  ctx.shadowColor = '#05090940'; ctx.shadowBlur = 4 * unit; ctx.shadowOffsetY = 2 * unit
  roundedPanel(ctx, bounds.x, bounds.y, width, height, 7 * unit, '#fff8df', '#8c8068', unit)
  ctx.restore()
  ctx.fillStyle = '#081013'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((line, index) => ctx.fillText(line, bounds.x + width / 2, bounds.y + (13.5 + index * 15) * unit))
}

export function desenharEscritorioRpg(ctx: CanvasRenderingContext2D, quadro: QuadroRpg): HitRpg[] {
  const startedAt = typeof performance === 'undefined' ? 0 : performance.now()
  const project = projection(quadro.layout)
  const hits: HitRpg[] = []
  const labels: Array<{ name: string; point: Point; color: string; selected: boolean }> = []
  const bubbles: Array<{ text: string; point: Point; selected: boolean }> = []

  ctx.save()
  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const scene = staticScene(quadro)
    if (scene) ctx.drawImage(scene, 0, 0)
    else drawStaticScene(ctx, quadro)

    navigationBounds(project, quadro.layout.largura).forEach(({ x, y, width, height }, index) => {
      const route = NAV[index][0]
      hits.push({ chave: `navegacao:${route}`, x, y, largura: width, altura: height, modulo: route })
    })

    quadro.personagens.forEach((character) => {
      recordWalkEvent(character.mesa.execucao.animacaoChave, character.pose.andando)
      const bounds = drawCharacter(ctx, quadro, character, project)
      if (!bounds) return
      hits.push({ chave: character.mesa.execucao.chave, x: bounds.x, y: bounds.y, largura: bounds.width, altura: bounds.height })
      if (bounds.status) bubbles.push({ text: bounds.status, point: bounds.point, selected: bounds.selected })
      else if (!bounds.robot || bounds.selected) labels.push({ name: character.mesa.execucao.nome, point: bounds.point, color: bounds.statusColor, selected: bounds.selected })
    })
    labels.forEach((label) => drawName(ctx, label.name, label.point, label.color, label.selected))
    const occupied: Bounds[] = []
    bubbles.sort((a, b) => Number(b.selected) - Number(a.selected)).forEach((bubble) => drawStatusBubble(ctx, bubble.text, bubble.point, occupied, quadro.layout.largura))

    if (!quadro.layout.ilhas.length) {
      ctx.fillStyle = PALETTE.cream
      ctx.font = '700 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('NENHUM AMBIENTE VISIVEL', round(quadro.layout.largura / 2), round(quadro.layout.altura / 2))
    }
  } finally {
    ctx.restore()
  }

  const renderMs = startedAt ? performance.now() - startedAt : 0
  ctx.canvas.dataset.officeRenderer = 'smooth-cartoon-v1'
  ctx.canvas.dataset.officeVersion = '4.0.0'
  ctx.canvas.dataset.officeCamera = 'obliqua-3-4'
  ctx.canvas.dataset.officeAssets = robotImages.size ? 'ready' : 'loading'
  ctx.canvas.dataset.officeStaticCache = sceneCache ? 'ready' : 'unavailable'
  ctx.canvas.dataset.officeRenderMs = renderMs.toFixed(2)
  ctx.canvas.dataset.officeFrameBudget = renderMs < 16 ? 'ok' : 'over'
  ctx.canvas.dataset.officeSpriteAgents = String(quadro.personagens.length)
  ctx.canvas.dataset.officeRobotAgents = String(quadro.personagens.filter((character) => character.mesa.execucao.tipoVisual === 'robo').length)
  ctx.canvas.dataset.officeHumanAgents = String(quadro.personagens.filter((character) => character.mesa.execucao.tipoVisual === 'humano').length)
  ctx.canvas.dataset.officeStatusBubbles = String(bubbles.length)
  ctx.canvas.dataset.officeWalkers = String(quadro.personagens.filter((character) => character.pose.andando).length)
  ctx.canvas.dataset.officeLastWalkEvent = lastWalkEventAt ? String(lastWalkEventAt) : 'none'
  return hits
}
