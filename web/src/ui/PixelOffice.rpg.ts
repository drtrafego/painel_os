import characterAtlasUrl from './pixel-office-rpg/character-walk-4dir.png'
import environmentAtlasUrl from './pixel-office-rpg/environment-atlas.png'
import {
  compactacaoRpg,
  projetarRpg,
  type HitRpg,
  type IlhaRpg,
  type PoseRpg,
  type QuadroRpg,
} from './PixelOffice.rpg-data'

type Point = { x: number; y: number }
type Direction = 'down' | 'left' | 'right' | 'up'
type SpriteSource = { x: number; y: number; w: number; h: number }
type Bounds = { x: number; y: number; width: number; height: number }

const PALETTE = {
  void: '#081013',
  ink: '#101820',
  teal: '#173f3f',
  moss: '#2d5a4f',
  wood: '#9a6238',
  gold: '#e1b657',
  cream: '#f3e3b1',
  leaf: '#5b8c55',
  live: '#75c878',
  idle: '#e1b657',
  rest: '#82958f',
} as const

const ENVIRONMENT_SPRITES = {
  floor: { x: 80, y: 70, w: 370, h: 380 },
  wall: { x: 560, y: 70, w: 420, h: 380 },
  desk: { x: 1050, y: 110, w: 430, h: 340 },
  chair: { x: 120, y: 530, w: 290, h: 410 },
  divider: { x: 550, y: 550, w: 430, h: 350 },
  plant: { x: 1120, y: 530, w: 360, h: 420 },
} as const satisfies Record<string, SpriteSource>

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

let environmentAtlas: HTMLImageElement | null = null
let characterAtlas: HTMLImageElement | null = null
let assetVersion = 0
let environmentFailed = false
let characterFailed = false

function loadImage(url: string, kind: 'environment' | 'character') {
  if (typeof Image === 'undefined') return null
  const current = kind === 'environment' ? environmentAtlas : characterAtlas
  if (current) return current.complete && current.naturalWidth > 0 ? current : null
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => { assetVersion += 1 }
  image.onerror = () => {
    if (kind === 'environment') environmentFailed = true
    else characterFailed = true
  }
  image.src = url
  if (kind === 'environment') environmentAtlas = image
  else characterAtlas = image
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

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string | CanvasPattern, stroke?: string, lineWidth = 1) {
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

function drawSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  source: SpriteSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const dx = round(x)
  const dy = round(y)
  const dw = Math.max(1, round(width))
  const dh = Math.max(1, round(height))
  if (image) {
    ctx.drawImage(image, source.x, source.y, source.w, source.h, dx, dy, dw, dh)
    return
  }
  ctx.fillStyle = PALETTE.teal
  ctx.fillRect(dx, dy, dw, dh)
  ctx.fillStyle = PALETTE.gold
  ctx.fillRect(dx, dy, dw, 2)
}

const patternCache = new Map<string, CanvasPattern | null>()

function atlasPattern(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null, name: 'floor' | 'wall', size: number) {
  if (!image || typeof document === 'undefined') return null
  const key = `${assetVersion}:${name}:${size}`
  if (patternCache.has(key)) return patternCache.get(key) ?? null
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const tileContext = tile.getContext('2d')
  if (!tileContext) return null
  tileContext.imageSmoothingEnabled = false
  const source = ENVIRONMENT_SPRITES[name]
  tileContext.drawImage(image, source.x, source.y, source.w, source.h, 0, 0, size, size)
  const pattern = ctx.createPattern(tile, 'repeat')
  patternCache.set(key, pattern)
  return pattern
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
  ctx.strokeStyle = '#6d6d57'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(round(centerX - width * 0.28), wireTop)
  ctx.lineTo(round(centerX - width * 0.2), y)
  ctx.moveTo(round(centerX + width * 0.28), wireTop)
  ctx.lineTo(round(centerX + width * 0.2), y)
  ctx.stroke()
  ctx.fillStyle = '#060b0d'
  ctx.fillRect(x + 2, y + 3, width, height)
  ctx.fillStyle = PALETTE.ink
  ctx.fillRect(x, y, width, height)
  ctx.strokeStyle = PALETTE.gold
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, width, height)
  ctx.fillStyle = color
  ctx.fillRect(x + 4, y + 3, 3, height - 6)
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
  const floor = index % 2 ? '#11292a' : '#0d2425'
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
  polygon(ctx, shadow, '#02060799')
  polygon(ctx, corners, blendColor(floor, color, 0.12), blendColor(color, '#0a1113', 0.62), 2)
  polygon(ctx, [corners[0], corners[1], topRight, topLeft], blendColor(color, '#101820', 0.34), color, 2)
  polygon(ctx, [corners[0], corners[3], farLeft, topLeft], blendColor(color, '#081013', 0.48), color, 2)
  polygon(ctx, [corners[1], corners[2], farRight, topRight], blendColor(color, '#081013', 0.54), color, 2)

  ctx.save()
  ctx.strokeStyle = '#060a0caa'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(topLeft.x, topLeft.y + 2)
  ctx.lineTo(topRight.x, topRight.y + 2)
  ctx.stroke()
  ctx.strokeStyle = blendColor(color, PALETTE.cream, 0.2)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(farLeft.x, farLeft.y)
  ctx.lineTo(farRight.x, farRight.y)
  ctx.stroke()
  ctx.strokeStyle = blendColor(color, '#081013', 0.68)
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

function drawStaticScene(ctx: CanvasRenderingContext2D, quadro: QuadroRpg, image: HTMLImageElement | null) {
  const { layout } = quadro
  const width = round(layout.largura)
  const height = round(layout.altura)
  const project = projection(layout)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = PALETTE.void
  ctx.fillRect(0, 0, width, height)

  const floor = [project(10, 8), project(width - 10, 8), project(width - 10, height - 10), project(10, height - 10)]
  polygon(ctx, floor, atlasPattern(ctx, image, 'floor', 48) || PALETTE.ink, PALETTE.gold, 2)

  const wall = [project(14, 6, 94), project(width - 14, 6, 94), project(width - 14, 6, 2), project(14, 6, 2)]
  polygon(ctx, wall, atlasPattern(ctx, image, 'wall', 56) || PALETTE.teal, PALETTE.moss, 2)
  const sign = project(width / 2, 7, 60)
  ctx.fillStyle = PALETTE.ink
  ctx.fillRect(sign.x - 84, sign.y - 15, 168, 29)
  ctx.strokeStyle = PALETTE.gold
  ctx.lineWidth = 2
  ctx.strokeRect(sign.x - 84, sign.y - 15, 168, 29)
  ctx.fillStyle = PALETTE.cream
  ctx.font = '700 10px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('CT // AGENT OFFICE', sign.x, sign.y)

  const navigation = navigationBounds(project, width)
  navigation.forEach(({ label, x, y, width: itemWidth }, index) => {
    ctx.fillStyle = index % 2 ? '#102b2d' : '#132326'
    ctx.fillRect(x, y, itemWidth, NAVIGATION_HEIGHT)
    ctx.fillStyle = PALETTE.gold
    ctx.fillRect(x, y + 20, itemWidth, 3)
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
    drawSprite(ctx, image, ENVIRONMENT_SPRITES.divider, divider.x - 37, divider.y - 20, 74, 34)
    island.postos.forEach((desk) => {
      const point = project(desk.x, desk.y + 18)
      drawSprite(ctx, image, ENVIRONMENT_SPRITES.chair, point.x - 13, point.y + 2, 26, 34)
      drawSprite(ctx, image, ENVIRONMENT_SPRITES.desk, point.x - 31, point.y - 28, 62, 45)
    })
    const plant = project(island.x + island.largura - 22, island.y + 38)
    drawSprite(ctx, image, ENVIRONMENT_SPRITES.plant, plant.x - 15, plant.y - 30, 30, 39)
  })
  roomSigns.forEach((sign) => drawRoomSign(ctx, sign, navigation))

  if (layout.descansoAberto) {
    const loungeWidth = Math.min(width - 60, 140 + layout.ocupantesDescanso * 44)
    const x = (width - loungeWidth) / 2
    const corners = [project(x, layout.descansoY), project(x + loungeWidth, layout.descansoY), project(x + loungeWidth, height - 14), project(x, height - 14)]
    polygon(ctx, corners, '#172d29', PALETTE.gold, 2)
    const label = project(x + 8, layout.descansoY + 8)
    ctx.fillStyle = PALETTE.cream
    ctx.font = '700 8px "JetBrains Mono", monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`LOUNGE ${layout.ocupantesDescanso}`, label.x, label.y)
  }

  drawSprite(ctx, image, ENVIRONMENT_SPRITES.plant, 12, height - 56, 38, 49)
  drawSprite(ctx, image, ENVIRONMENT_SPRITES.plant, width - 50, height - 56, 38, 49)
}

function staticScene(quadro: QuadroRpg, image: HTMLImageElement | null) {
  if (typeof document === 'undefined') return null
  const key = sceneKey(quadro)
  if (sceneCache?.key === key) return sceneCache.canvas
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, round(quadro.layout.largura))
  canvas.height = Math.max(1, round(quadro.layout.altura))
  const context = canvas.getContext('2d')
  if (!context) return null
  drawStaticScene(context, quadro, image)
  sceneCache = { key, canvas }
  return canvas
}

const movement = new Map<string, { x: number; y: number; direction: Direction }>()
const walkingState = new Map<string, boolean>()
let lastWalkEventAt = 0

type PasseioAmbiente = { x: number; y: number; direction: Direction }

type CharacterAppearance = { key: string; shirt: string; hair: string; skin: string; accent: string }

const CHARACTER_ACCENTS = ['#e1b657', '#74c7c7', '#cf6f70', '#9c82d0', '#8cbd72']
const CHARACTER_HAIR = ['#302d29', '#5a3825', '#c08a48', '#1f2c36', '#6b3546', '#ded0ad']
const characterSpriteCache = new Map<string, HTMLCanvasElement>()
let characterSpriteCacheVersion = -1

function appearanceFor(person: QuadroRpg['personagens'][number]['mesa']['execucao']): CharacterAppearance {
  const seed = stableHash(person.chave)
  const shirt = validColor(person.cor, ['#4e91a8', '#b87553', '#8f6bb3', '#639462'][seed % 4])
  const hair = validColor(person.cabelo, CHARACTER_HAIR[Math.floor(seed / 7) % CHARACTER_HAIR.length])
  const skin = validColor(person.pele, PALETTE.cream)
  const accent = CHARACTER_ACCENTS[(person.acessorio + Math.floor(seed / 17)) % CHARACTER_ACCENTS.length]
  return { key: `${shirt}:${hair}:${skin}:${accent}`, shirt, hair, skin, accent }
}

function maskPixel(data: Uint8ClampedArray, index: number, predicate: (red: number, green: number, blue: number) => boolean) {
  return data[index + 3] > 0 && predicate(data[index], data[index + 1], data[index + 2])
}

function tintMaskedPixels(
  ctx: CanvasRenderingContext2D,
  imageData: ImageData,
  predicate: (red: number, green: number, blue: number, x: number, y: number) => boolean,
  color: string,
) {
  const mask = document.createElement('canvas')
  mask.width = imageData.width
  mask.height = imageData.height
  const maskContext = mask.getContext('2d')
  if (!maskContext) return
  const pixels = maskContext.createImageData(imageData.width, imageData.height)
  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const index = (y * imageData.width + x) * 4
      if (!maskPixel(imageData.data, index, (red, green, blue) => predicate(red, green, blue, x, y))) continue
      pixels.data[index] = 255
      pixels.data[index + 1] = 255
      pixels.data[index + 2] = 255
      pixels.data[index + 3] = imageData.data[index + 3]
    }
  }
  maskContext.putImageData(pixels, 0, 0)

  const tint = document.createElement('canvas')
  tint.width = imageData.width
  tint.height = imageData.height
  const tintContext = tint.getContext('2d')
  if (!tintContext) return
  tintContext.fillStyle = color
  tintContext.fillRect(0, 0, tint.width, tint.height)
  tintContext.globalCompositeOperation = 'destination-in'
  tintContext.drawImage(mask, 0, 0)

  ctx.save()
  ctx.globalCompositeOperation = 'hue'
  ctx.drawImage(tint, 0, 0)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.globalAlpha = 0.22
  ctx.drawImage(tint, 0, 0)
  ctx.restore()
}

function variedCharacterSprite(
  image: HTMLImageElement,
  source: SpriteSource,
  width: number,
  height: number,
  appearance: CharacterAppearance,
) {
  if (typeof document === 'undefined') return null
  if (characterSpriteCacheVersion !== assetVersion) {
    characterSpriteCache.clear()
    characterSpriteCacheVersion = assetVersion
  }
  const key = `${assetVersion}:${source.x}:${source.y}:${round(width)}:${round(height)}:${appearance.key}`
  const cached = characterSpriteCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, round(width))
  canvas.height = Math.max(1, round(height))
  const sprite = canvas.getContext('2d', { willReadFrequently: true })
  if (!sprite) return null
  sprite.imageSmoothingEnabled = false
  sprite.drawImage(image, source.x, source.y, source.w, source.h, 0, 0, canvas.width, canvas.height)
  const pixels = sprite.getImageData(0, 0, canvas.width, canvas.height)
  const shirtTop = round(canvas.height * 0.42)
  const shirtBottom = round(canvas.height * 0.76)
  const headBottom = round(canvas.height * 0.43)
  const bodyLeft = round(canvas.width * 0.16)
  const bodyRight = round(canvas.width * 0.84)

  tintMaskedPixels(sprite, pixels, (red, green, blue, x, y) =>
    y >= shirtTop && y <= shirtBottom && x >= bodyLeft && x <= bodyRight && red > 145 && green > 125 && blue > 85 && red - blue < 95,
  appearance.shirt)
  tintMaskedPixels(sprite, pixels, (red, green, blue, _x, y) =>
    y <= headBottom && red < 135 && green < 120 && blue < 112,
  appearance.hair)
  tintMaskedPixels(sprite, pixels, (red, green, blue, x, y) =>
    y >= round(canvas.height * 0.2) && y <= round(canvas.height * 0.62) && x >= bodyLeft && x <= bodyRight && red > 170 && green > 95 && blue < 150 && red - blue > 55,
  appearance.skin)
  tintMaskedPixels(sprite, pixels, (red, green, blue, _x, y) =>
    y >= round(canvas.height * 0.36) && y <= round(canvas.height * 0.7) && red > 105 && green > 70 && blue < 100 && red - blue > 65,
  appearance.accent)

  characterSpriteCache.set(key, canvas)
  return canvas
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
  image: HTMLImageElement | null,
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
  const row = { down: 0, left: 1, right: 2, up: 3 }[direction]
  const walking = !quadro.reduzirMovimento && (pose.andando || passeio !== null)
  const frame = walking ? Math.floor(quadro.tempo * 8 + person.ordem) % 3 : 1
  const cellWidth = 1254 / 3
  const cellHeight = 1254 / 4
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
  ctx.fillStyle = '#050909aa'
  ctx.fillRect(point.x - 13, point.y - 3, 26, 6)
  if (selected || hovered) {
    ctx.strokeStyle = selected ? PALETTE.gold : PALETTE.live
    ctx.lineWidth = selected ? 3 : 2
    ctx.strokeRect(spritePoint.x - 18, spritePoint.y - 7, 36, 12)
  }
  if (image) {
    const source = { x: frame * cellWidth, y: row * cellHeight, w: cellWidth, h: cellHeight }
    const variedSprite = variedCharacterSprite(image, source, width, height, appearanceFor(person))
    if (variedSprite) ctx.drawImage(variedSprite, x, y)
    else ctx.drawImage(image, source.x, source.y, source.w, source.h, x, y, width, height)
  } else {
    ctx.fillStyle = person.cor || PALETTE.moss
    ctx.fillRect(point.x - 8, point.y - 28, 16, 25)
    ctx.fillStyle = person.pele || PALETTE.cream
    ctx.fillRect(point.x - 6, point.y - 38, 12, 11)
  }
  const statusColor = person.ativa ? PALETTE.live : person.execucao.estado === 'silencioso' ? PALETTE.idle : PALETTE.rest
  ctx.fillStyle = statusColor
  ctx.fillRect(spritePoint.x + 11, spritePoint.y - 37, 5, 5)
  ctx.restore()

  return { point: spritePoint, x: spritePoint.x - 17, y: spritePoint.y - 53, width: 34, height: 56, selected, statusColor }
}

function drawName(ctx: CanvasRenderingContext2D, name: string, point: Point, color: string, selected: boolean) {
  const label = name.length > 20 ? `${name.slice(0, 19)}…` : name
  ctx.font = '700 8px "JetBrains Mono", monospace'
  const width = Math.max(50, Math.min(126, round(ctx.measureText(label).width) + 18))
  const x = round(point.x - width / 2)
  const y = round(point.y + 6)
  ctx.fillStyle = selected ? '#3b3218' : '#081013e8'
  ctx.fillRect(x, y, width, 17)
  ctx.strokeStyle = selected ? PALETTE.gold : '#35514b'
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, width, 17)
  ctx.fillStyle = color
  ctx.fillRect(x + 5, y + 6, 4, 4)
  ctx.fillStyle = PALETTE.cream
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 13, y + 9)
}

export function desenharEscritorioRpg(ctx: CanvasRenderingContext2D, quadro: QuadroRpg): HitRpg[] {
  const startedAt = typeof performance === 'undefined' ? 0 : performance.now()
  const environment = loadImage(environmentAtlasUrl, 'environment')
  const characters = loadImage(characterAtlasUrl, 'character')
  const project = projection(quadro.layout)
  const hits: HitRpg[] = []
  const labels: Array<{ name: string; point: Point; color: string; selected: boolean }> = []

  ctx.save()
  try {
    ctx.imageSmoothingEnabled = false
    const scene = staticScene(quadro, environment)
    if (scene) ctx.drawImage(scene, 0, 0)
    else drawStaticScene(ctx, quadro, environment)

    navigationBounds(project, quadro.layout.largura).forEach(({ x, y, width, height }, index) => {
      const route = NAV[index][0]
      hits.push({ chave: `navegacao:${route}`, x, y, largura: width, altura: height, modulo: route })
    })

    quadro.personagens.forEach((character) => {
      recordWalkEvent(character.mesa.execucao.animacaoChave, character.pose.andando)
      const bounds = drawCharacter(ctx, characters, quadro, character, project)
      if (!bounds) return
      hits.push({ chave: character.mesa.execucao.chave, x: bounds.x, y: bounds.y, largura: bounds.width, altura: bounds.height })
      labels.push({ name: character.mesa.execucao.nome, point: bounds.point, color: bounds.statusColor, selected: bounds.selected })
    })
    labels.forEach((label) => drawName(ctx, label.name, label.point, label.color, label.selected))

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
  ctx.canvas.dataset.officeRenderer = 'rpg-pixel-v1'
  ctx.canvas.dataset.officeVersion = '3.0.0'
  ctx.canvas.dataset.officeCamera = 'obliqua-3-4'
  ctx.canvas.dataset.officeAssets = environment && characters ? 'ready' : environmentFailed || characterFailed ? 'error' : 'loading'
  ctx.canvas.dataset.officeStaticCache = sceneCache ? 'ready' : 'unavailable'
  ctx.canvas.dataset.officeRenderMs = renderMs.toFixed(2)
  ctx.canvas.dataset.officeFrameBudget = renderMs < 16 ? 'ok' : 'over'
  ctx.canvas.dataset.officeSpriteAgents = String(quadro.personagens.length)
  ctx.canvas.dataset.officeWalkers = String(quadro.personagens.filter((character) => character.pose.andando).length)
  ctx.canvas.dataset.officeLastWalkEvent = lastWalkEventAt ? String(lastWalkEventAt) : 'none'
  return hits
}
