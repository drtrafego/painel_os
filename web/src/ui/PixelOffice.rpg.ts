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

// Paleta "Escritório Dourado", realinhada 12/10 pra bater com o video de
// referencia (fundo quente madeira/creme, paredes azul-marinho com trim
// dourado), nao mais a fantasia teal/petroleo anterior. teal/moss viraram
// azul-marinho (mesmo hue usado no novo environment-atlas.png); wood/gold/
// cream ja batiam com a referencia e ficaram como estavam.
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
  ['estudio', 'CONTEUDO'],
  ['pipeline', 'COMERCIAL'],
  ['financeiro', 'FINANCEIRO'],
  ['cofre', 'MEMORIA'],
  ['ferramentas', 'OPERACAO'],
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

function drawSmoothFurniture(ctx: CanvasRenderingContext2D, kind: 'desk' | 'chair' | 'divider' | 'plant', x: number, y: number, width: number, height: number) {
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.shadowColor = '#06101c55'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3
  if (kind === 'desk') {
    const wood = ctx.createLinearGradient(x, y, x, y + height)
    wood.addColorStop(0, '#d99a58'); wood.addColorStop(1, '#9b5f31')
    roundedPanel(ctx, x, y + height * .24, width, height * .48, 4, wood, '#70411f', 1)
    ctx.shadowColor = 'transparent'
    roundedPanel(ctx, x + width * .36, y, width * .28, height * .31, 3, '#15243b', '#d8b76b', .8)
    roundedPanel(ctx, x + width * .42, y + height * .06, width * .16, height * .15, 2, '#6dc8dc')
    ctx.fillStyle = '#70411f'; ctx.fillRect(x + width * .08, y + height * .68, width * .08, height * .28); ctx.fillRect(x + width * .84, y + height * .68, width * .08, height * .28)
  } else if (kind === 'chair') {
    roundedPanel(ctx, x + width * .18, y, width * .64, height * .62, 7, '#25334b', '#d8b76b', .8)
    ctx.shadowColor = 'transparent'; roundedPanel(ctx, x + width * .08, y + height * .5, width * .84, height * .22, 5, '#1b283e')
    ctx.strokeStyle = '#536078'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + width / 2, y + height * .68); ctx.lineTo(x + width / 2, y + height * .9); ctx.moveTo(x + width * .2, y + height); ctx.lineTo(x + width / 2, y + height * .88); ctx.lineTo(x + width * .8, y + height); ctx.stroke()
  } else if (kind === 'divider') {
    const glass = ctx.createLinearGradient(x, y, x, y + height)
    glass.addColorStop(0, '#edf5f2ee'); glass.addColorStop(1, '#b8d4d1dd')
    roundedPanel(ctx, x, y, width, height, 7, glass, '#d8b76b', 1.5)
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#ffffff66'; ctx.fillRect(x + 8, y + 5, width - 16, 2)
  } else {
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#3f7951'; ctx.lineWidth = 4; ctx.lineCap = 'round'
    for (const offset of [-.24, 0, .24]) { ctx.beginPath(); ctx.moveTo(x + width / 2, y + height * .62); ctx.quadraticCurveTo(x + width * (0.5 + offset), y + height * .2, x + width * (0.5 + offset * 1.6), y + height * .08); ctx.stroke() }
    roundedPanel(ctx, x + width * .2, y + height * .58, width * .6, height * .38, 5, '#c5844c', '#7d4a27', 1)
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

type RoomSign = { name: string; color: string; anchor: Point; area: Bounds; furniture: ReadonlyArray<Bounds> }

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
) {
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
  return bestBounds ?? { x: preferredX, y: preferredY, width, height }
}

function drawRoomSign(ctx: CanvasRenderingContext2D, sign: RoomSign, navigation: ReadonlyArray<Bounds>) {
  const { name, color, anchor, area, furniture } = sign
  const title = name.toLocaleUpperCase('pt-BR')
  const available = Math.max(92, Math.min(196, ctx.canvas.width - 16))
  ctx.font = '700 8px "JetBrains Mono", monospace'
  let label = title
  while (label.length > 4 && ctx.measureText(label).width > available - 24) label = `${label.slice(0, -2)}…`
  const width = Math.max(92, Math.min(available, round(ctx.measureText(label).width) + 24))
  const height = ROOM_SIGN_HEIGHT
  const { x, y } = roomSignBounds(width, height, anchor, area, furniture, navigation, ctx.canvas)
  const wireTop = Math.max(2, y - 7)
  const centerX = x + width / 2

  ctx.save()
  ctx.strokeStyle = '#9b8556'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(round(centerX - width * 0.28), wireTop)
  ctx.lineTo(round(centerX - width * 0.2), y)
  ctx.moveTo(round(centerX + width * 0.28), wireTop)
  ctx.lineTo(round(centerX + width * 0.2), y)
  ctx.stroke()
  ctx.shadowColor = '#07101d66'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3
  roundedPanel(ctx, x, y, width, height, 6, '#17243aee', '#d8b76b', 1.2)
  ctx.shadowColor = 'transparent'
  roundedPanel(ctx, x + 5, y + 5, 4, height - 10, 2, blendColor(color, '#d8b76b', .68))
  ctx.fillStyle = PALETTE.cream
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + width / 2 + 3, y + height / 2 + 1)
  ctx.restore()
}

function drawRoom(ctx: CanvasRenderingContext2D, island: IlhaRpg, project: ReturnType<typeof projection>, index: number, wallTopLimit: number): RoomSign {
  const color = validColor(island.cor, PALETTE.gold)
  const corners = [
    project(island.x, island.y),
    project(island.x + island.largura, island.y),
    project(island.x + island.largura, island.y + island.altura),
    project(island.x, island.y + island.altura),
  ]
  const elevated = project(island.x, island.y, 26)
  const wallHeight = clamp(Math.abs(corners[0].y - elevated.y) * 1.55, 28, 40)
  const floor = index % 2 ? '#eee4d2' : '#e7dac3'
  const shadow = corners.map((corner) => ({ x: corner.x + 4, y: corner.y + wallHeight + 5 }))
  // topY = max(baseY - wallHeight, maior fundo da navegação + 8 px).
  const raised = (point: Point) => ({ x: point.x, y: Math.max(point.y - wallHeight, wallTopLimit) })
  const topLeft = raised(corners[0])
  const topRight = raised(corners[1])
  const farLeft = raised(corners[3])
  const farRight = raised(corners[2])

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, wallTopLimit, ctx.canvas.width, Math.max(0, ctx.canvas.height - wallTopLimit))
  ctx.clip()
  polygon(ctx, shadow, '#07101d2e')
  polygon(ctx, corners, floor, '#c3a96c', 1)
  polygon(ctx, [corners[0], corners[1], topRight, topLeft], index % 2 ? '#cbd8dc' : '#d7e0df', '#c3a96c', 1)
  polygon(ctx, [corners[0], corners[3], farLeft, topLeft], '#aebfc3', '#c3a96c', 1)
  polygon(ctx, [corners[1], corners[2], farRight, topRight], '#a7b8bd', '#c3a96c', 1)

  ctx.save()
  ctx.strokeStyle = '#ffffff88'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(topLeft.x, topLeft.y + 2)
  ctx.lineTo(topRight.x, topRight.y + 2)
  ctx.stroke()
  ctx.strokeStyle = '#d8b76b'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(farLeft.x, farLeft.y)
  ctx.lineTo(farRight.x, farRight.y)
  ctx.stroke()
  ctx.strokeStyle = '#8da2a855'
  for (const ratio of [1 / 3, 2 / 3]) {
    const left = { x: topLeft.x + (corners[0].x - topLeft.x) * ratio, y: topLeft.y + (corners[0].y - topLeft.y) * ratio }
    const right = { x: topRight.x + (corners[1].x - topRight.x) * ratio, y: topRight.y + (corners[1].y - topRight.y) * ratio }
    ctx.beginPath()
    ctx.moveTo(left.x, left.y)
    ctx.lineTo(right.x, right.y)
    ctx.stroke()
  }
  ctx.restore()
  ctx.restore()

  return {
    name: island.nome,
    color,
    anchor: {
      x: (topLeft.x + topRight.x) / 2,
      y: Math.max(topLeft.y, topRight.y) + ROOM_SIGN_HEIGHT / 2 + 2,
    },
    area: {
      x: Math.min(...corners.map((corner) => corner.x)),
      y: wallTopLimit,
      width: Math.max(...corners.map((corner) => corner.x)) - Math.min(...corners.map((corner) => corner.x)),
      height: Math.max(...corners.map((corner) => corner.y)) - wallTopLimit,
    },
    furniture: island.postos.map((desk) => {
      const point = project(desk.x, desk.y + 18)
      return { x: point.x - 31, y: point.y - 28, width: 62, height: 45 }
    }),
  }
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
  floorGradient.addColorStop(0, '#f7edda'); floorGradient.addColorStop(.55, '#e8d6b9'); floorGradient.addColorStop(1, '#d5bc94')
  polygon(ctx, floor, floorGradient, '#d8b76b', 1.5)

  const wall = [project(14, 6, 94), project(width - 14, 6, 94), project(width - 14, 6, 2), project(14, 6, 2)]
  const wallGradient = ctx.createLinearGradient(0, wall[0].y, 0, wall[2].y)
  wallGradient.addColorStop(0, '#101a33'); wallGradient.addColorStop(1, '#24304f')
  polygon(ctx, wall, wallGradient, '#d8b76b', 1.5)
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
  navigation.forEach(({ label, x, y, width: itemWidth }, index) => {
    roundedPanel(ctx, x + 2, y, itemWidth - 4, NAVIGATION_HEIGHT, 5, index % 2 ? '#1b2940' : '#22314a', '#d8b76b99', .75)
    ctx.fillStyle = PALETTE.cream
    // 7px grudava as letras (glifo bold nesse tamanho esbarra no vizinho e
    // "AGENTES" virava ilegível). 8px é o menor tamanho que ainda sai limpo
    // nesta fonte, mesmo valor já usado nas placas de sala (drawRoomSign).
    ctx.font = '700 8px "JetBrains Mono", monospace'
    ctx.fillText(label, x + itemWidth / 2, y + 11)
  })

  const navigationBottom = Math.max(...navigation.map((item) => item.y + item.height))
  const wallTopLimit = navigationBottom + ROOM_NAVIGATION_GAP
  const roomSigns: RoomSign[] = []
  layout.ilhas.forEach((island, index) => {
    roomSigns.push(drawRoom(ctx, island, project, index, wallTopLimit))

    const divider = project(island.x + island.largura / 2, island.y + 16, 4)
    drawSmoothFurniture(ctx, 'divider', divider.x - 37, divider.y - 20, 74, 34)
    island.postos.forEach((desk) => {
      const point = project(desk.x, desk.y + 18)
      drawSmoothFurniture(ctx, 'chair', point.x - 13, point.y + 2, 26, 34)
      drawSmoothFurniture(ctx, 'desk', point.x - 31, point.y - 28, 62, 45)
    })
    const plant = project(island.x + island.largura - 22, island.y + 38)
    drawSmoothFurniture(ctx, 'plant', plant.x - 15, plant.y - 30, 30, 39)
  })
  roomSigns.forEach((sign) => drawRoomSign(ctx, sign, navigation))

  if (layout.descansoAberto) {
    const loungeWidth = Math.min(width - 60, 140 + layout.ocupantesDescanso * 44)
    const x = (width - loungeWidth) / 2
    const corners = [project(x, layout.descansoY), project(x + loungeWidth, layout.descansoY), project(x + loungeWidth, height - 14), project(x, height - 14)]
    polygon(ctx, corners, '#181d2d', PALETTE.gold, 2)
    const label = project(x + 8, layout.descansoY + 8)
    ctx.fillStyle = PALETTE.cream
    ctx.font = '700 8px "JetBrains Mono", monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`LOUNGE ${layout.ocupantesDescanso}`, label.x, label.y)
  }

  drawSmoothFurniture(ctx, 'plant', 12, height - 56, 38, 49)
  drawSmoothFurniture(ctx, 'plant', width - 50, height - 56, 38, 49)
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

type PasseioAmbiente = { x: number; y: number; direction: Direction }

function drawCharacterSprite(
  ctx: CanvasRenderingContext2D,
  person: QuadroRpg['personagens'][number]['mesa']['execucao'],
  x: number,
  y: number,
  width: number,
  height: number,
  direction: Direction,
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
  const ratio = image.naturalWidth / image.naturalHeight
  const targetHeight = height + 5
  const targetWidth = targetHeight * ratio
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, round(x + (width - targetWidth) / 2), round(y + height - targetHeight), round(targetWidth), round(targetHeight))
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
  const pontoBase = project(pose.x, pose.y + 18)
  const point = { x: pontoBase.x + (passeio?.x ?? 0), y: pontoBase.y + (passeio?.y ?? 0) }
  const directionReal = directionFor(person.animacaoChave, pose)
  const direction = pose.andando ? directionReal : passeio?.direction ?? directionReal
  const sentado = pose.sentado > 0.5 && !passeio
  const width = sentado ? 58 : 62
  const height = sentado ? 56 : 64
  const idleOffsetY = quadro.reduzirMovimento ? 0 : round(Math.sin(quadro.tempo * 1.7 + person.ordem * 0.8) * 1.25)
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
  if (!drawCharacterSprite(ctx, person, x, y, width, height, direction)) {
    const fallback = ctx.createLinearGradient(point.x, point.y - 38, point.x, point.y)
    fallback.addColorStop(0, blendColor(person.cor || PALETTE.moss, '#ffffff', .25)); fallback.addColorStop(1, person.cor || PALETTE.moss)
    roundedPanel(ctx, point.x - 12, point.y - 36, 24, 34, 11, fallback, '#16233a', 1)
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

function drawStatusBubble(ctx: CanvasRenderingContext2D, text: string, point: Point, occupied: Bounds[], index: number, sceneWidth: number) {
  ctx.font = '700 12px "JetBrains Mono", monospace'
  const words = text.split(' ')
  const lines: string[] = []
  words.forEach((word) => {
    const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word
    if (lines.length && ctx.measureText(candidate).width > 150) lines.push(word)
    else if (lines.length) lines[lines.length - 1] = candidate
    else lines.push(word)
  })
  const visibleLines = lines.slice(0, 2)
  const width = Math.max(118, Math.min(174, Math.max(...visibleLines.map((line) => ctx.measureText(line).width)) + 22))
  const height = visibleLines.length > 1 ? 42 : 30
  const offsets = [0, -58, 58, -88, 88]
  let bounds: Bounds = { x: round(point.x - width / 2), y: round(point.y - 102), width, height }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const x = clamp(round(point.x - width / 2 + offsets[(index + attempt) % offsets.length]), 7, sceneWidth - width - 7)
    const y = Math.max(124, round(point.y - 102 - Math.floor(attempt / offsets.length) * 28))
    const candidate = { x, y, width, height }
    if (!occupied.some((other) => boundsOverlap(candidate, other))) { bounds = candidate; break }
  }
  occupied.push(bounds)
  ctx.fillStyle = '#050909d9'
  ctx.fillRect(bounds.x + 3, bounds.y + 4, bounds.width, bounds.height)
  ctx.fillStyle = '#fff8df'
  ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
  ctx.strokeStyle = '#5b4b32'
  ctx.lineWidth = 2
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
  const tailX = clamp(round(point.x), bounds.x + 12, bounds.x + bounds.width - 12)
  polygon(ctx, [{ x: tailX - 5, y: bounds.y + bounds.height }, { x: tailX + 5, y: bounds.y + bounds.height }, { x: tailX, y: bounds.y + bounds.height + 7 }], '#fff8df', '#5b4b32')
  ctx.fillStyle = '#081013'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  visibleLines.forEach((line, lineIndex) => ctx.fillText(line, bounds.x + bounds.width / 2, bounds.y + 11 + lineIndex * 15))
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
      if (bounds.robot) {
        if (bounds.status) bubbles.push({ text: bounds.status, point: bounds.point, selected: bounds.selected })
        else if (bounds.selected) labels.push({ name: character.mesa.execucao.nome, point: bounds.point, color: bounds.statusColor, selected: true })
      } else labels.push({ name: character.mesa.execucao.nome, point: bounds.point, color: bounds.statusColor, selected: bounds.selected })
    })
    labels.forEach((label) => drawName(ctx, label.name, label.point, label.color, label.selected))
    const bubbleLimit = quadro.layout.largura < 700 ? 3 : 5
    const occupied: Bounds[] = []
    bubbles.sort((a, b) => Number(b.selected) - Number(a.selected)).slice(0, bubbleLimit).forEach((bubble, index) => drawStatusBubble(ctx, bubble.text, bubble.point, occupied, index, quadro.layout.largura))

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
  ctx.canvas.dataset.officeStatusBubbles = String(quadro.personagens.filter((character) => statusSeguroDaExecucao(character.mesa.execucao)).length)
  ctx.canvas.dataset.officeWalkers = String(quadro.personagens.filter((character) => character.pose.andando).length)
  ctx.canvas.dataset.officeLastWalkEvent = lastWalkEventAt ? String(lastWalkEventAt) : 'none'
  return hits
}
