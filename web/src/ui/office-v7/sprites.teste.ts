// Teste de assets do pacote V8 (sprites reais gerados em 14/10/2026).
// Roda com: node --experimental-strip-types src/ui/office-v7/sprites.teste.ts
// (módulo puro, não importa PNG nem JSX — dá pra rodar sem o Vite).
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CONTRATO_SPRITE,
  ESTADOS_SPRITE,
  PERSONAGENS_SPRITE,
  caminhoFrame,
  estadoEmLoop,
  framesPorSegundo,
  personagemDoAgente,
  quadroAtivo,
  todosOsCaminhosDeSprite,
  totalFrames,
} from './sprites.ts'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    console.log(`ok   ${nome}`)
  } else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

const raizPublic = fileURLToPath(new URL('../../../public', import.meta.url))

/** Lê largura/altura/tipo de cor direto do chunk IHDR do PNG (sem libs). */
function lerCabecalhoPng(caminho: string): { largura: number; altura: number; tipoCor: number } {
  const buf = readFileSync(caminho)
  const assinaturaOk = buf.readUInt32BE(0) === 0x89504e47
  if (!assinaturaOk) throw new Error(`assinatura PNG inválida em ${caminho}`)
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20), tipoCor: buf.readUInt8(25) }
}

// 1. Todo caminho do contrato (manifest.json) tem um arquivo real no disco,
// com o tamanho de quadro certo (384x512) e canal alfa (tipo de cor 6 =
// truecolor + alpha) — "todos os caminhos de sprites resolvem e carregam com
// alpha correto" (CRITERIOS-E-TESTES.md).
const todosOsCaminhos = todosOsCaminhosDeSprite()
conferir('existem caminhos de sprite pra conferir', todosOsCaminhos.length > 0)
let semArquivo = 0
let tamanhoErrado = 0
let semAlfa = 0
for (const caminho of todosOsCaminhos) {
  const absoluto = `${raizPublic}${caminho}`
  if (!existsSync(absoluto)) { semArquivo += 1; console.error(`FALHOU: arquivo não existe: ${caminho}`); continue }
  const cabecalho = lerCabecalhoPng(absoluto)
  if (cabecalho.largura !== CONTRATO_SPRITE.largura || cabecalho.altura !== CONTRATO_SPRITE.altura) {
    tamanhoErrado += 1
    console.error(`FALHOU: tamanho errado em ${caminho}: ${cabecalho.largura}x${cabecalho.altura}`)
  }
  if (cabecalho.tipoCor !== 6) { semAlfa += 1; console.error(`FALHOU: sem canal alfa (tipoCor=${cabecalho.tipoCor}) em ${caminho}`) }
}
conferir(`todos os ${todosOsCaminhos.length} caminhos de sprite existem no disco`, semArquivo === 0, `${semArquivo} faltando`)
conferir('todos os quadros têm 384x512', tamanhoErrado === 0, `${tamanhoErrado} com tamanho errado`)
conferir('todos os quadros têm canal alfa (RGBA)', semAlfa === 0, `${semAlfa} sem alfa`)

// 2. Contagem de frames por personagem/estado bate com o manifesto (4
// personagens x 7 estados = 28 combinações; frames: 6+6+3+3+3+4+4 = 29 cada).
const totalEsperadoPorPersonagem = ESTADOS_SPRITE.reduce((soma, estado) => soma + totalFrames(estado), 0)
conferir('29 quadros por personagem (6+6+3+3+3+4+4)', totalEsperadoPorPersonagem === 29, String(totalEsperadoPorPersonagem))
conferir('4 personagens x 29 quadros = 116 caminhos no total', todosOsCaminhos.length === PERSONAGENS_SPRITE.length * 29, String(todosOsCaminhos.length))

// 3. Caminho é previsível e 1-indexado.
conferir('frame 0 (índice) vira frame-1.png', caminhoFrame('luana', 'digitar', 0) === '/sprites/luana/digitar/frame-1.png')
conferir('frame 2 (índice) vira frame-3.png', caminhoFrame('luana', 'digitar', 2) === '/sprites/luana/digitar/frame-3.png')
conferir('índice fora do total satura no último quadro', caminhoFrame('luana', 'digitar', 99) === '/sprites/luana/digitar/frame-3.png')

// 4. Personagem: só luana/renato/bia têm sprite humano próprio; qualquer
// outra identidade (ou tipoVisual robô) cai no robô — "um só humano para
// Luana, Renato e Bia" (regra da casa, nunca clona identidade).
conferir('luana humano usa sprite da luana', personagemDoAgente('luana', 'humano') === 'luana')
conferir('renato humano usa sprite do renato', personagemDoAgente('renato', 'humano') === 'renato')
conferir('bia humano usa sprite da bia', personagemDoAgente('bia', 'humano') === 'bia')
conferir('gastao (ou qualquer outro humano) cai no robô, nunca clona', personagemDoAgente('gastao', 'humano') === 'robo')
conferir('execução marcada como robô sempre usa o robô', personagemDoAgente('luana', 'robo') === 'robo')

// 5. Quadro ativo: loop avança pelo relógio (tempo contínuo), transição
// avança pelo progresso da fase (0..1), nunca os dois ao mesmo tempo.
conferir('digitar é estado em loop', estadoEmLoop('digitar'))
conferir('levantar não é loop (transição de uma vez só)', !estadoEmLoop('levantar'))
conferir('loop em t=0 começa no quadro 0', quadroAtivo('digitar', 0, 0) === 0)
const fpsDigitar = framesPorSegundo('digitar')
conferir('loop avança 1 quadro a cada 1/fps segundos', quadroAtivo('digitar', 1 / fpsDigitar, 0) === 1)
conferir('loop dá a volta ao chegar no total de quadros', quadroAtivo('digitar', totalFrames('digitar') / fpsDigitar, 0) === 0)
conferir('transição no progresso 0 fica no primeiro quadro', quadroAtivo('levantar', 999, 0) === 0)
conferir('transição no progresso 1 fica no último quadro', quadroAtivo('levantar', 999, 1) === totalFrames('levantar') - 1)
conferir('transição no meio do progresso fica num quadro do meio', quadroAtivo('levantar', 0, 0.5) > 0 && quadroAtivo('levantar', 0, 0.5) < totalFrames('levantar') - 1)

if (falhas > 0) process.exit(1)
console.log(`\nTodos os ${todosOsCaminhos.length} caminhos de sprite (4 personagens x 7 estados) resolvem, existem e carregam com alpha correto!`)
