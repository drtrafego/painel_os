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
  type ArquiteturaRpg,
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


function softPolygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string | CanvasGradient, radius: number) {
  ctx.beginPath()
  const toward = (a: Point, b: Point) => {
    const ratio = Math.min(.4, radius / Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)))
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
  }
  points.forEach((point, index) => {
    const before = toward(point, points[(index + points.length - 1) % points.length])
    const after = toward(point, points[(index + 1) % points.length])
    if (index === 0) ctx.moveTo(before.x, before.y)
    else ctx.lineTo(before.x, before.y)
    ctx.quadraticCurveTo(point.x, point.y, after.x, after.y)
  })
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
}

function roundedPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string | CanvasGradient, stroke?: string, lineWidth = 1) {
  ctx.beginPath()
  ctx.roundRect(round(x), round(y), Math.max(1, round(width)), Math.max(1, round(height)), radius)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke() }
}

function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.save(); ctx.shadowColor = '#40362640'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1
  ctx.fillStyle = '#4036262b'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore()
}

function drawSmoothFurniture(ctx: CanvasRenderingContext2D, kind: 'desk' | 'chair' | 'plant', x: number, y: number, width: number, height: number) {
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.shadowColor = '#40362630'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2
  if (kind === 'desk') {
    // Silhueta e âncora do posto preservadas. Três tons e um bisel macio
    // dão espessura ao tampo sem mudar a área ocupada pelo móvel.
    ctx.shadowColor = 'transparent'
    const contact = ctx.createRadialGradient(x + width / 2, y + height * .89, 1, x + width / 2, y + height * .89, width * .55)
    contact.addColorStop(0, '#49352350'); contact.addColorStop(1, '#49352300')
    ctx.fillStyle = contact
    ctx.beginPath(); ctx.ellipse(x + width / 2, y + height * .89, width * .55, height * .14, 0, 0, Math.PI * 2); ctx.fill()
    const apron = ctx.createLinearGradient(x, y + height * .43, x, y + height * .9)
    apron.addColorStop(0, '#ad7541'); apron.addColorStop(1, '#754b2c')
    roundedPanel(ctx, x + 3, y + height * .43, width - 6, height * .44, 4, apron)
    roundedPanel(ctx, x + width * .76, y + height * .43, width * .19, height * .52, 3, '#895a36')
    ctx.shadowColor = '#4c342530'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2
    roundedPanel(ctx, x, y + height * .29, width, height * .38, 5, '#9c642f')
    const wood = ctx.createLinearGradient(x, y + height * .24, x + width * .15, y + height * .62)
    wood.addColorStop(0, '#e6bd79'); wood.addColorStop(.42, '#c99250'); wood.addColorStop(1, '#ad733b')
    roundedPanel(ctx, x, y + height * .24, width, height * .36, 5, wood, '#e7be7b', .7)
    // CT-VISUAL-VIDEO-2026-10-12: volume e materiais das estacoes; nao acrescenta monitores falsos.
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#613f2b88'
    ctx.fillRect(x + 3, y + height * .595, width - 6, 2)
    ctx.strokeStyle = '#ffe6b177'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + 5, y + height * .275)
    ctx.lineTo(x + width - 5, y + height * .275)
    ctx.stroke()
    ctx.fillStyle = '#b7825366'
    ctx.fillRect(x + width * .1, y + height * .77, width * .63, 1)
    ctx.fillStyle = '#deba81'
    for (const level of [.675, .755, .835]) {
      ctx.fillRect(x + width * .815, y + height * level, width * .05, 1)
    }
    ctx.shadowColor = 'transparent'
    roundedPanel(ctx, x + 4, y + height * .27, width - 8, 2, 1, '#ffe2a75c')
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = '#f0e4c5'; ctx.fillRect(x + width * .1, y + height * .32, width * .18, height * .16)
    // Espessura e dobra da folha, legíveis mesmo no módulo compacto.
    ctx.fillStyle = '#c8b994'; ctx.fillRect(x + width * .1, y + height * .48, width * .18, 1)
    ctx.fillStyle = '#fff5db'; ctx.fillRect(x + width * .23, y + height * .32, width * .05, 2)
    ctx.fillStyle = '#222a32'; ctx.fillRect(x + width * .82, y + height * .27, width * .07, height * .14)
    ctx.fillStyle = '#75858b'; ctx.fillRect(x + width * .82, y + height * .27, width * .07, 1)
    ctx.strokeStyle = '#7a8b93'
    ctx.lineWidth = .8
    ctx.beginPath()
    ctx.arc(x + width * .92, y + height * .34, Math.max(1.2, width * .025), -.85, .85)
    ctx.stroke()
    ctx.fillStyle = '#222a32'
    ctx.fillRect(x + width * .47, y + height * .23, width * .06, height * .12)
    ctx.fillRect(x + width * .39, y + height * .34, width * .23, 2)
    ctx.fillStyle = '#7c9aa6'
    for (let key = 0; key < 6; key++) {
      ctx.fillRect(x + width * (.402 + key * .033), y + height * .35, width * .025, 1)
    }
    roundedPanel(ctx, x + width * .34, y, width * .32, height * .3, 2, '#222a32', '#526171', .7)
    // Atrás da mesa, o ocupante olha para a tela; a câmera vê a carcaça.
    ctx.fillStyle = '#222a32'; ctx.fillRect(x + width * .38, y + height * .32, width * .27, 2)
    ctx.fillStyle = '#d09a51'; ctx.fillRect(x + width * .81, y + height * .73, width * .09, 1)
  } else if (kind === 'chair') {
    contactShadow(ctx, x + width / 2, y + height, width * .6, 4)
    const upholstery = ctx.createLinearGradient(x, y, x + width, y + height * .55)
    upholstery.addColorStop(0, '#a3b1b4')
    upholstery.addColorStop(.42, '#6b8090')
    upholstery.addColorStop(1, '#364b5b')
    roundedPanel(ctx, x + width * .18, y, width * .64, height * .56, 4.5, upholstery, '#425767', 1)
    roundedPanel(ctx, x + width * .24, y + height * .08, width * .51, height * .34, 3, '#d0d9d517')
    ctx.shadowColor = 'transparent'
    roundedPanel(ctx, x + width * .08, y + height * .5, width * .84, height * .22, 3, '#35414d')
    ctx.strokeStyle = '#35414d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + width / 2, y + height * .68); ctx.lineTo(x + width / 2, y + height * .9); ctx.moveTo(x + width * .2, y + height); ctx.lineTo(x + width / 2, y + height * .88); ctx.lineTo(x + width * .8, y + height); ctx.stroke()
  } else {
    const cx = x + width / 2
    contactShadow(ctx, cx, y + height, width * .52, 3)
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
  // Somente decoração: nenhuma mesa, pose, seleção ou área de hit é criada.
  const obstacles: Bounds[] = []
  const box = (x: number, y: number, width: number, depth: number, bottom: number, height: number, top: string, front: string, side: string) => {
    const a = project(x, y, bottom + height), b = project(x + width, y, bottom + height)
    const c = project(x + width, y + depth, bottom + height), d = project(x, y + depth, bottom + height)
    const material = ctx.createLinearGradient(a.x, a.y, d.x, d.y + height)
    material.addColorStop(0, top); material.addColorStop(1, front)
    softPolygon(ctx, [d, c, project(x + width, y + depth, bottom), project(x, y + depth, bottom)], front, 3)
    softPolygon(ctx, [b, c, project(x + width, y + depth, bottom), project(x + width, y, bottom)], side, 3)
    softPolygon(ctx, [a, b, c, d], material, 3)
  }
  const shadow = (x: number, y: number, width: number, depth: number) => {
    ctx.save(); ctx.shadowColor = '#3b302e40'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 3
    softPolygon(ctx, [project(x - 2, y), project(x + width + 3, y), project(x + width + 3, y + depth + 3), project(x - 2, y + depth + 3)], '#40362628', 5)
    ctx.restore()
  }
  ctx.save()
  // LOUNGE DO CT: área própria, preparada para ocupantes reais, sem fila frontal.
  const lounge = layout.arquitetura.lounge
  const lx = lounge.x, lz = lounge.z, lw = lounge.largura, ld = lounge.profundidade
  const canto = [project(lx - 10, lz - 8), project(lx + lw + 10, lz - 8), project(lx + lw + 10, lz + ld + 7), project(lx - 10, lz + ld + 7)]
  const bx = Math.min(...canto.map(p => p.x)), by = Math.min(...canto.map(p => p.y))
  obstacles.push({ x: bx, y: by - 38, width: Math.max(...canto.map(p => p.x)) - bx, height: Math.max(...canto.map(p => p.y)) - by + 38 })
  ctx.save()
  const floor = ctx.createLinearGradient(0, project(lx, lz).y, 0, project(lx, lz + ld).y)
  floor.addColorStop(0, '#9ca8a0'); floor.addColorStop(.4, '#b6b9ad'); floor.addColorStop(1, '#c5c5b6')
  softPolygon(ctx, canto, floor, 10)
  ctx.strokeStyle = '#f5f1d9a8'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(canto[0].x, canto[0].y); ctx.lineTo(canto[1].x, canto[1].y); ctx.stroke()
  // O sofá abraça o fundo do lounge, sem ocupar a grade de descanso.
  const sofaW = lw - 70
  shadow(lx + 35, lz + 15, sofaW, 24)
  box(lx + 36, lz + 10, sofaW, 24, 0, 13, '#627674', '#455756', '#374648')
  box(lx + 36, lz + 10, sofaW, 7, 13, 16, '#899994', '#576e6d', '#44595b')
  for (let i = 0; i < 3; i += 1) {
    box(lx + 44 + i * (sofaW - 18) / 3, lz + 18, (sofaW - 29) / 3, 13, 13, 5, '#9fafaa', '#687c76', '#4c625d')
  }
  // Mesas laterais / plantas ancoram o espaço, sem inventar pessoas.
  for (const x of [lx + 17, lx + lw - 18]) {
    const point = project(x, lz + 25)
    drawSmoothFurniture(ctx, 'plant', point.x - 11, point.y - 30, 22, 30)
  }
  const sign = project(lx + lw / 2, lz + 8, 21)
  roundedPanel(ctx, sign.x - 74, sign.y - 12, 148, 23, 5, '#203038ef', '#c1ab79', .8)
  ctx.font = '800 10px Arial, sans-serif'; ctx.fillStyle = '#f8edce'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(`LOUNGE · ${layout.ocupantesDescanso} EM DESCANSO`, sign.x, sign.y)
  // Cada lugar de descanso corresponde a um agente real do estado recebido.
  // Um banco vazio não se transforma em um agente ativo.
  for (const seat of layout.arquitetura.assentosDescanso) {
    const point = project(seat.x, seat.y + 10)
    ctx.save(); ctx.globalAlpha = .62
    drawSmoothFurniture(ctx, 'chair', point.x - 12, point.y - 16, 24, 20)
    ctx.restore()
  }
  ctx.restore()

  const receptionWidth = layout.arquitetura.recepcao.largura
  const receptionX = layout.arquitetura.recepcao.x
  const receptionY = layout.arquitetura.recepcao.z
  shadow(receptionX, receptionY, receptionWidth, 23)
  box(receptionX + 3, receptionY + 2, receptionWidth - 6, 20, 0, 4, '#9e8256', '#705f48', '#786044')
  box(receptionX, receptionY, receptionWidth, 23, 4, 25, '#eee0bd', '#d3b885', '#aa8959')
  box(receptionX - 3, receptionY - 2, receptionWidth + 6, 27, 29, 4, '#fff0d0', '#e4c99b', '#bb996b')
  const plaque = project(receptionX + receptionWidth / 2, receptionY + 24, 17)
  roundedPanel(ctx, plaque.x - 41, plaque.y - 7, 82, 15, 4, '#27313c', '#c7ac77', .8)
  ctx.font = '800 10px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff5dc'; ctx.fillText('RECEPÇÃO', plaque.x, plaque.y + 1)
  // Bandeja e vaso são acessórios, não uma estação de agente adicional.
  box(receptionX + 12, receptionY + 5, 23, 10, 33, 2, '#526171', '#35414d', '#293238')
  const plant = project(receptionX + receptionWidth - 17, receptionY + 10, 33)
  drawSmoothFurniture(ctx, 'plant', plant.x - 6, plant.y - 13, 12, 16)
  ctx.restore()
  return obstacles
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
    layout.arquitetura.lounge,
    layout.arquitetura.postosLivres,
    layout.arquitetura.assentosDescanso,
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

function drawGlassRoom(ctx: CanvasRenderingContext2D, architecture: ArquiteturaRpg, project: ReturnType<typeof projection>) {
  ctx.save()
  ctx.lineJoin = 'round'
  const line = (points: Point[], color: string, width: number) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath()
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
    ctx.stroke()
  }
  for (const room of architecture.salas) {
    const { x, z, largura, profundidade: depth, alturaVidro: height, abertura } = room
    polygon(ctx, [project(x, z), project(x + largura, z), project(x + largura, z + depth), project(x, z + depth)], '#d9cdb3', '#b39d79', 1)
    polygon(ctx, [project(x + 9, z + 10), project(x + largura - 9, z + 10), project(x + largura - 9, z + depth - 10), project(x + 9, z + depth - 10)], '#c7c0b1b8')
    const frontSegments: Array<[number, number]> = [[x, x + (largura - abertura) / 2], [x + largura - (largura - abertura) / 2, x + largura]]
    const panel = (x1: number, z1: number, x2: number, z2: number, h: number) => {
      const a = project(x1, z1), b = project(x2, z2)
      const topRight = project(x2, z2, h), topLeft = project(x1, z1, h)
      polygon(ctx, [a, b, topRight, topLeft], '#9bdde04a', '#638f97d8', 1.6)
      line([topLeft, topRight], '#f2ffffe8', 2.5)
      line([a, b], '#536f78', 1.8)
      const brilhoInicio = { x: a.x * .72 + topLeft.x * .28, y: a.y * .72 + topLeft.y * .28 }
      const brilhoFim = { x: b.x * .34 + topRight.x * .66, y: b.y * .34 + topRight.y * .66 }
      line([brilhoInicio, brilhoFim], '#ffffff8c', 1.1)
    }
    panel(x, z, x + largura, z, height)
    panel(x, z, x, z + depth, height)
    panel(x + largura, z, x + largura, z + depth, height)
    frontSegments.forEach(([a, b]) => panel(a, z + depth, b, z + depth, height))
    for (const [px, pz] of [[x, z], [x + largura, z], [x, z + depth], [x + largura, z + depth]]) {
      line([project(px, pz), project(px, pz, height)], '#55757dbb', 2.4)
      line([project(px + 1.5, pz), project(px + 1.5, pz, height)], '#f1ffff99', .8)
    }
    const doorX = x + largura / 2
    line([project(doorX - abertura / 2, z + depth), project(doorX - abertura / 2, z + depth, height)], '#d7eef0c0', 1.2)
    line([project(doorX + abertura / 2, z + depth), project(doorX + abertura / 2, z + depth, height)], '#d7eef0c0', 1.2)
    const label = project(doorX, z + 9, height + 8)
    roundedPanel(ctx, label.x - Math.min(78, largura / 2 - 8), label.y - 11, Math.min(156, largura - 16), 21, 4, '#20343be8', '#d4b66f', .9)
    ctx.fillStyle = '#fff0c8'; ctx.font = '800 9px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(room.label, label.x, label.y)
    // Mobiliário fixo faz a sala continuar sendo um ambiente, sem criar agentes.
    if (room.id === 'reuniao') {
      const table = project(x + largura / 2, z + depth / 2)
      drawSmoothFurniture(ctx, 'desk', table.x - 76, table.y - 20, 152, 42)
      for (const offset of [-58, -20, 20, 58]) drawSmoothFurniture(ctx, 'chair', table.x + offset - 8, table.y + 23, 16, 22)
    } else {
      const desk = project(x + largura / 2, z + depth / 2 + 7)
      drawSmoothFurniture(ctx, 'desk', desk.x - 35, desk.y - 20, 70, 42)
      drawSmoothFurniture(ctx, 'chair', desk.x - 10, desk.y + 22, 20, 25)
    }
  }
  const corridor = architecture.corredor
  polygon(ctx, [project(corridor.x, corridor.z), project(corridor.x + corridor.largura, corridor.z), project(corridor.x + corridor.largura, corridor.z + corridor.profundidade), project(corridor.x, corridor.z + corridor.profundidade)], '#e8ddc5', '#bba980', 1)
  line([project(corridor.x + 10, corridor.z), project(corridor.x + 10, corridor.z + corridor.profundidade)], '#fff7df99', 2)
  line([project(corridor.x + corridor.largura - 10, corridor.z), project(corridor.x + corridor.largura - 10, corridor.z + corridor.profundidade)], '#b19a7899', 1)
  ctx.restore()
}

function drawCirculation(ctx: CanvasRenderingContext2D, layout: QuadroRpg['layout'], project: ReturnType<typeof projection>) {
  if (!layout.mesas.length) return
  const firstY = Math.min(...layout.mesas.map((desk) => desk.y))
  const lastY = Math.max(...layout.mesas.map((desk) => desk.y))
  const strip = (x: number, y: number, width: number, depth: number) =>
    polygon(ctx, [project(x, y), project(x + width, y), project(x + width, y + depth), project(x, y + depth)], '#eee2c3', '#faf0d660', 1)
  // Galeria transversal de 46 unidades, conectada ao acesso frontal.
  const walk = layout.arquitetura.planoAberto
  strip(walk.x - 10, 230, walk.largura + 17, 25)
  // Entre postos fixos de 62 px só cabe uma conexão estreita, sem invadi-los.
  const columns = [...new Set(layout.mesas.map((desk) => desk.x))].sort((a, b) => a - b)
  if (columns.length > 1) {
    const middle = Math.floor(columns.length / 2)
    const x = (columns[middle - 1] + columns[middle]) / 2
    const scaleX = Math.abs(project(x + 1, firstY).x - project(x - 1, firstY).x) / 2
    const screenGap = project(columns[middle], firstY).x - project(columns[middle - 1], firstY).x - 64
    const passageWidth = Math.min(14, Math.max(0, screenGap / Math.max(.1, scaleX)))
    if (passageWidth >= 2) strip(x - passageWidth / 2, firstY - 36, passageWidth, lastY - firstY + 92)
  }
  strip(walk.x - 10, Math.min(lastY + 44, layout.altura - 56), walk.largura + 17, 18)
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
  floorGradient.addColorStop(0, '#eee2c5'); floorGradient.addColorStop(.55, '#ddcfac'); floorGradient.addColorStop(1, '#d1bf99')
  polygon(ctx, [floor[3], floor[2], { x: floor[2].x, y: floor[2].y + 6 }, { x: floor[3].x, y: floor[3].y + 6 }], '#77766e', '#e2d4b3', 1)
  polygon(ctx, floor, floorGradient, '#e2d4b3', 1)

  const wall = [project(14, 6, 94), project(width - 14, 6, 94), project(width - 14, 6, 2), project(14, 6, 2)]
  const wallGradient = ctx.createLinearGradient(0, wall[0].y, 0, wall[2].y)
  wallGradient.addColorStop(0, '#e8cd91'); wallGradient.addColorStop(.48, '#d9b777'); wallGradient.addColorStop(1, '#bd9859')
  polygon(ctx, wall, wallGradient, '#d8b76b', 1.5)
  // Ripas verticais no plano posterior, sempre do rodapé ao arremate.
  for (let x = 18; x < width - 14; x += 6) {
    const top = project(x, 6, 93), bottom = project(x, 6, 3)
    ctx.strokeStyle = '#94723959'; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.stroke()
    ctx.strokeStyle = '#fff0c366'; ctx.lineWidth = .8
    ctx.beginPath(); ctx.moveTo(top.x + 1.5, top.y); ctx.lineTo(bottom.x + 1.5, bottom.y); ctx.stroke()
  }
  const side = [project(10, 8, 94), project(10, height - 10, 94), project(10, height - 10), project(10, 8)]
  const sideMaterial = ctx.createLinearGradient(side[0].x, side[0].y, side[2].x, side[2].y)
  sideMaterial.addColorStop(0, '#3b515b'); sideMaterial.addColorStop(1, '#25363e')
  polygon(ctx, side, sideMaterial, '#8fa2a2', 1)
  // Rodapé e sombra curta ancoram as paredes na plataforma.
  polygon(ctx, [project(12, 8), project(width - 12, 8), project(width - 12, 18), project(12, 18)], '#6b543b24')
  polygon(ctx, [project(12, 8), project(23, 8), project(23, height - 12), project(12, height - 12)], '#24343c24')
  polygon(ctx, [project(11, 30, 38), project(11, height - 30, 38), project(11, height - 30, 8), project(11, 30, 8)], '#8ebac433', '#8ebac4', .6)
  const trimLeft = project(14, 6, 9), trimRight = project(width - 14, 6, 9)
  ctx.strokeStyle = '#d8b76b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(trimLeft.x, trimLeft.y); ctx.lineTo(trimRight.x, trimRight.y); ctx.stroke()
  // CT-VISUAL-VIDEO-2026-10-12: luz de parede arquitetonica, sem pixels neon sobre o piso.
  for (const ratio of [.12, .88]) {
    const point = project(width * ratio, 6, 63)
    const halo = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 42)
    halo.addColorStop(0, '#fff1c277')
    halo.addColorStop(.5, '#f5cc801c')
    halo.addColorStop(1, '#f5cc8000')
    ctx.fillStyle = halo
    ctx.fillRect(point.x - 42, point.y - 42, 84, 84)
    roundedPanel(ctx, point.x - 2.5, point.y - 11, 5, 22, 2, '#f7e2b6', '#c59750', .8)
  }
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
    const carpet = ctx.createLinearGradient(0, project(left, top).y, 0, project(right, bottom).y)
    carpet.addColorStop(0, '#c8c6ba'); carpet.addColorStop(.6, '#bbb9ad'); carpet.addColorStop(1, '#afafa5')
    softPolygon(ctx, [project(left, top), project(right, top), project(right, bottom), project(left, bottom)], carpet, 7)
  }
  drawCirculation(ctx, layout, project)
  // Grão fosco determinístico, de baixíssima intensidade, só no cache estático.
  // Pontos no espaço do piso evitam textura fora da plataforma e cintilação.
  ctx.save()
  for (let y = 132; y < height - 16; y += 11) {
    for (let x = 26; x < width - 20; x += 13) {
      const seed = stableHash(`${x}:${y}`)
      const p = project(x + seed % 7, y + (seed >>> 4) % 5)
      ctx.fillStyle = seed % 2 ? '#fff9e609' : '#70583e06'
      ctx.fillRect(p.x, p.y, seed % 3 === 0 ? 2 : 1, 1)
    }
  }
  ctx.restore()
  drawGlassRoom(ctx, layout.arquitetura, project)
  // Estações reais desocupadas: a sala permanece mobiliada com 3 ou 30 ativos.
  for (const spot of layout.arquitetura.postosLivres) {
    const point = project(spot.x, spot.y + 18)
    ctx.save(); ctx.globalAlpha = .8
    drawSmoothFurniture(ctx, 'chair', point.x - 13, point.y - 35, 26, 34)
    drawSmoothFurniture(ctx, 'desk', point.x - 31, point.y - 28, 62, 45)
    ctx.restore()
  }
  layout.ilhas.forEach((island) => {
    roomSigns.push(drawRoom(island, project, wallTopLimit))

    // CT-VISUAL-VIDEO-2026-10-12: postos vazios desenham apenas moveis; nao geram agente.
    const ocupados = new Set(island.mesas.map(desk => `${Math.round(desk.x)}:${Math.round(desk.y)}`))
    island.postos.forEach(posto => {
      if (ocupados.has(`${Math.round(posto.x)}:${Math.round(posto.y)}`)) return
      const point = project(posto.x, posto.y + 18)
      ctx.save()
      ctx.globalAlpha = .78
      drawSmoothFurniture(ctx, 'chair', point.x - 13, point.y - 35, 26, 34)
      drawSmoothFurniture(ctx, 'desk', point.x - 31, point.y - 28, 62, 45)
      ctx.restore()
    })
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
  const decorations = drawSceneDecor(ctx, layout, project)
  const furniture = [...roomSigns.flatMap((sign) => sign.furniture), ...decorations]
  const signsPlaced: Bounds[] = []
  roomSigns.forEach((sign) => {
    signsPlaced.push(drawRoomSign(ctx, { ...sign, furniture: [...furniture, ...signsPlaced] }, navigation))
  })


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
const CHARACTER_SCALE = .90

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
  // A escolha pelo tipoVisual vem do catálogo: humano nunca cai no PNG de robô.
  const humanFallback = [HUMAN_VARIANTS.luana, HUMAN_VARIANTS.renato, HUMAN_VARIANTS.bia, HUMAN_VARIANTS.gastao]
  const variant = person.tipoVisual === 'humano'
    ? (human ? HUMAN_VARIANTS[human] : humanFallback[stableHash(person.chave) % humanFallback.length])
    : (director ? DIRECTOR_ROBOTS[director] : ROBOT_VARIANTS[stableHash(person.chave) % ROBOT_VARIANTS.length])
  const image = loadRobotImage(direction === 'up' ? variant.back : variant.front)
  if (!image) return false
  // Humanos usam o tronco na pose sentada. Robôs mantêm o PNG inteiro
  // e a escala de pé: a mesa oculta o corpo, sem ampliar um recorte de 82%.
  const sourceHeight = image.naturalHeight // Sem recortar ou deformar o corpo humano sentado.
  const ratio = image.naturalWidth / sourceHeight
  const targetHeight = person.tipoVisual === 'robo' ? 69 * CHARACTER_SCALE : height + 5 * CHARACTER_SCALE
  const targetWidth = targetHeight * ratio
  const drawY = round(y - (seatedAtDesk ? 4 : 5) * CHARACTER_SCALE)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, image.naturalWidth, sourceHeight, round(x + (width - targetWidth) / 2), drawY, round(targetWidth), round(targetHeight))
  if (person.tipoVisual === 'humano' && human) {
    // Recoloração só na renderização. Preserva cabeça/cabelo; o recorte
    // inferior inclui roupa e mãos, pois o PNG não possui máscara de tecido.
    const drawX = round(x + (width - targetWidth) / 2)
    const drawWidth = round(targetWidth)
    const drawHeight = round(targetHeight)
    const clothingTop = drawY + drawHeight * (image.naturalHeight * .23 / sourceHeight)
    ctx.beginPath()
    ctx.rect(drawX, clothingTop, drawWidth, drawY + drawHeight - clothingTop)
    ctx.clip()
    ctx.globalAlpha *= .22
    ctx.filter = 'grayscale(.5) brightness(.93)'
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
    // Dois apoios curtos junto ao teclado (y - 14), abaixo do monitor.
    // Sem cotovelos contornando a tela ou ligação entre as duas mãos.
    for (const side of [-1, 1]) {
      ctx.strokeStyle = person.tipoVisual === 'humano' ? '#35414d' : validColor(person.cor, '#526171'); ctx.lineWidth = 3; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(mesaPoint.x + side * 11, mesaPoint.y - 11)
      ctx.lineTo(mesaPoint.x + side * 7, mesaPoint.y - 14); ctx.stroke()
      ctx.fillStyle = hands
      ctx.beginPath(); ctx.ellipse(mesaPoint.x + side * 7, mesaPoint.y - 14, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill()
    }
  }
  const statusColor = person.ativa ? PALETTE.live : person.execucao.estado === 'silencioso' ? PALETTE.idle : PALETTE.rest
  ctx.fillStyle = statusColor
  ctx.beginPath(); ctx.arc(spritePoint.x + 13, spritePoint.y - 36, 3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  return { point: spritePoint, x: spritePoint.x - 24, y: spritePoint.y - 69, width: 48, height: 72, selected, statusColor, robot: person.tipoVisual === 'robo', status: statusSeguroDaExecucao(person) } satisfies CharacterBounds
}

function drawName(ctx: CanvasRenderingContext2D, name: string, point: Point, color: string, selected: boolean) {
  const label = name.length > 20 ? `${name.slice(0, 19)}…` : name
  ctx.font = '700 10px Inter, Arial, sans-serif'
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
  const head = { x: point.x, y: point.y - 66 }
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

    // Defesa no renderer: o canvas principal nunca desenha uma execução sem trabalho em curso.
    const personagensAtivos = quadro.personagens.filter((character) => character.mesa.execucao.ativa)
    personagensAtivos.forEach((character) => {
      recordWalkEvent(character.mesa.execucao.animacaoChave, character.pose.andando)
      const bounds = drawCharacter(ctx, quadro, character, project)
      if (!bounds) return
      hits.push({ chave: character.mesa.execucao.chave, x: bounds.x, y: bounds.y, largura: bounds.width, altura: bounds.height })
      if (bounds.status) bubbles.push({ text: bounds.status, point: bounds.point, selected: bounds.selected })
      else if (!bounds.robot || bounds.selected || character.mesa.execucao.chave === quadro.hoverId) labels.push({ name: character.mesa.execucao.nome, point: bounds.point, color: bounds.statusColor, selected: bounds.selected })
    })
    labels.forEach((label) => drawName(ctx, label.name, label.point, label.color, label.selected))
    const occupied: Bounds[] = []
    bubbles.sort((a, b) => Number(b.selected) - Number(a.selected)).forEach((bubble) => drawStatusBubble(ctx, bubble.text, bubble.point, occupied, quadro.layout.largura))

    if (!quadro.layout.mesas.length) {
      ctx.fillStyle = PALETTE.cream
      ctx.font = '700 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('ESCRITÓRIO EM PAUSA · SEM AGENTES VISÍVEIS', round(quadro.layout.largura * .68), round(quadro.layout.altura - 118))
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
  const personagensAtivos = quadro.personagens.filter((character) => character.mesa.execucao.ativa)
  ctx.canvas.dataset.officeSpriteAgents = String(personagensAtivos.length)
  ctx.canvas.dataset.officeRobotAgents = String(personagensAtivos.filter((character) => character.mesa.execucao.tipoVisual === 'robo').length)
  ctx.canvas.dataset.officeHumanAgents = String(personagensAtivos.filter((character) => character.mesa.execucao.tipoVisual === 'humano').length)
  ctx.canvas.dataset.officeStatusBubbles = String(bubbles.length)
  ctx.canvas.dataset.officeWalkers = String(personagensAtivos.filter((character) => character.pose.andando).length)
  ctx.canvas.dataset.officeLastWalkEvent = lastWalkEventAt ? String(lastWalkEventAt) : 'none'
  return hits
}
