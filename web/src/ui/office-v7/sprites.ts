/**
 * Registro dos sprites reais gerados em 14/10/2026 (pacote V8). Contrato
 * completo em `web/public/sprites/manifest.json`: quadro 384x512, âncora do
 * chão em (192,496), sem móveis embutidos (mesa/cadeira são objetos da cena).
 *
 * Este módulo só sabe resolver caminho/quadro — nunca decide se um agente
 * está "trabalhando" ou "parado" (isso é responsabilidade da sonda e da
 * máquina de estados em `dados/escritorio-animacao.ts`).
 */

export type PersonagemSprite = 'luana' | 'renato' | 'bia' | 'robo'

export type EstadoSprite =
  | 'andar-baixo-direita'
  | 'andar-baixo-esquerda'
  | 'digitar'
  | 'levantar'
  | 'sentar'
  | 'sentado-parado'
  | 'parado'

export const CONTRATO_SPRITE = {
  largura: 384,
  altura: 512,
  ancoraX: 192,
  ancoraY: 496,
  alturaEmPePx: 460,
} as const

const FRAMES_POR_ESTADO: Record<EstadoSprite, number> = {
  'andar-baixo-direita': 6,
  'andar-baixo-esquerda': 6,
  digitar: 3,
  levantar: 3,
  sentar: 3,
  'sentado-parado': 4,
  parado: 4,
}

const FPS_POR_ESTADO: Record<EstadoSprite, number> = {
  'andar-baixo-direita': 10,
  'andar-baixo-esquerda': 10,
  digitar: 6,
  levantar: 6,
  sentar: 6,
  'sentado-parado': 3,
  parado: 3,
}

// Levantar/sentar são transições de uma vez só (não ficam em loop esperando
// o relógio: avançam junto com o progresso da própria fase da animação).
const LOOP_POR_ESTADO: Record<EstadoSprite, boolean> = {
  'andar-baixo-direita': true,
  'andar-baixo-esquerda': true,
  digitar: true,
  levantar: false,
  sentar: false,
  'sentado-parado': true,
  parado: true,
}

export const PERSONAGENS_SPRITE: readonly PersonagemSprite[] = ['luana', 'renato', 'bia', 'robo']
export const ESTADOS_SPRITE: readonly EstadoSprite[] = [
  'andar-baixo-direita', 'andar-baixo-esquerda', 'digitar', 'levantar', 'sentar', 'sentado-parado', 'parado',
]

export function totalFrames(estado: EstadoSprite): number {
  return FRAMES_POR_ESTADO[estado]
}

export function framesPorSegundo(estado: EstadoSprite): number {
  return FPS_POR_ESTADO[estado]
}

export function estadoEmLoop(estado: EstadoSprite): boolean {
  return LOOP_POR_ESTADO[estado]
}

/** Caminho público servido pelo Vite a partir de web/public/sprites/. */
export function caminhoFrame(personagem: PersonagemSprite, estado: EstadoSprite, indiceFrame: number): string {
  const n = Math.min(totalFrames(estado), Math.max(1, indiceFrame + 1))
  return `/sprites/${personagem}/${estado}/frame-${n}.png`
}

/** Todos os caminhos do contrato, usados pelo teste de assets (cada um precisa resolver). */
export function todosOsCaminhosDeSprite(): string[] {
  const caminhos: string[] = []
  for (const personagem of PERSONAGENS_SPRITE) {
    for (const estado of ESTADOS_SPRITE) {
      for (let indice = 0; indice < totalFrames(estado); indice++) {
        caminhos.push(caminhoFrame(personagem, estado, indice))
      }
    }
  }
  return caminhos
}

/**
 * Quadro ativo de um ciclo. Estados em loop avançam pelo relógio (tempo em
 * segundos, contínuo e independente de FPS de tela); estados de transição
 * (levantar/sentar) avançam pelo progresso da própria fase (0..1), que já
 * vem calculado pela máquina de estados — assim o quadro final bate exatamente
 * com o instante em que a fase termina, sem depender de quando o navegador
 * decidiu pintar aquele frame.
 */
export function quadroAtivo(estado: EstadoSprite, tempoSegundos: number, progressoFase: number): number {
  const total = totalFrames(estado)
  if (estadoEmLoop(estado)) {
    const fps = framesPorSegundo(estado)
    const passo = Math.floor(Math.max(0, tempoSegundos) * fps)
    return ((passo % total) + total) % total
  }
  const p = Math.max(0, Math.min(1, progressoFase))
  return Math.min(total - 1, Math.floor(p * total))
}

const identidadesComSprite = new Set<string>(['luana', 'renato', 'bia'])

/** "Um só humano para Luana, Renato e Bia" — qualquer outra identidade humana
 * cai no sprite do robô em vez de clonar um dos três (regra da casa). */
export function personagemDoAgente(identidade: string, tipoVisual: 'humano' | 'robo'): PersonagemSprite {
  if (tipoVisual === 'humano' && identidadesComSprite.has(identidade)) return identidade as PersonagemSprite
  return 'robo'
}

const cache = new Map<string, HTMLImageElement>()

export function imagemDoFrame(personagem: PersonagemSprite, estado: EstadoSprite, indiceFrame: number): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  const caminho = caminhoFrame(personagem, estado, indiceFrame)
  const existente = cache.get(caminho)
  if (existente) return existente
  const imagem = new Image()
  imagem.decoding = 'async'
  imagem.src = caminho
  cache.set(caminho, imagem)
  return imagem
}

export function limparCacheDeSprites(): void {
  cache.clear()
}
