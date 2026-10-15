import { desenharEscritorioV7, type OfficeV7Frame } from './OfficeV7.ts'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) console.log(`ok   ${nome}`)
  else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

function contextoDeTeste() {
  const canvas = { dataset: {} as DOMStringMap }
  const gradient = { addColorStop() {} }
  let gradientes = 0
  const ctx = new Proxy({ canvas }, {
    get(target, propriedade) {
      if (propriedade in target) return target[propriedade as keyof typeof target]
      if (propriedade === 'createLinearGradient' || propriedade === 'createRadialGradient') return () => {
        gradientes += 1
        return gradient
      }
      return () => undefined
    },
    set() { return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, gradientes: () => gradientes }
}

function frameDaSala(squad: string, postos: number): OfficeV7Frame {
  const room = {
    id: squad, label: squad.toUpperCase(), tipo: 'squad' as const, squad,
    x: 100, z: 100, largura: 300, profundidade: 180, alturaVidro: 90,
    abertura: 70, ativa: true, ocupantes: 1,
  }
  const agente = {
    chave: `${squad}-1`, nome: squad, squad, tipoVisual: 'robo' as const,
    ativa: true, ordem: 1, execucao: { estado: 'trabalhando' },
  }
  return {
    layout: {
      largura: 1430, altura: 820,
      arquitetura: {
        salas: [room], corredor: { x: 0, z: 0, largura: 1, profundidade: 1 },
        recepcao: { x: 0, z: 0, largura: 1, profundidade: 1 },
        lounge: { x: 0, z: 0, largura: 1, profundidade: 1 },
        coordenacao: { x: 0, z: 0, largura: 1, profundidade: 1 },
        planoAberto: { x: 0, z: 0, largura: 1, profundidade: 1 },
      },
      ilhas: [{ squad, postos: Array.from({ length: postos }, (_, indice) => ({ x: 130 + indice * 25, y: 150 })) }],
      mesas: [{ x: 130, y: 150, execucao: agente }],
    },
    personagens: [], tempo: 0, progressoDia: 0, reduzirMovimento: false,
  }
}

for (const [squad, postos] of [['bots', 8], ['coordenação', 3]] as const) {
  const semPostos = contextoDeTeste()
  desenharEscritorioV7(semPostos.ctx, frameDaSala(squad, 0))
  const comPostos = contextoDeTeste()
  desenharEscritorioV7(comPostos.ctx, frameDaSala(squad, postos))
  conferir(`${squad.toUpperCase()} com um ocupante desenha ${postos} mesas físicas`,
    comPostos.gradientes() - semPostos.gradientes() === postos * 2,
    `${comPostos.gradientes() - semPostos.gradientes()} gradientes de mesa/cadeira`)
}

if (falhas > 0) process.exit(1)
console.log('\nTodas as salas de squad desenham seus postos físicos!')
