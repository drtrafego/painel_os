import { desenharEscritorioV7, postosParaRenderizarSala, type OfficeV7Frame } from './OfficeV7.ts'

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

function frameDaSala(squad: string, postos: number, ativa = true, progresso?: number): OfficeV7Frame {
  const room = {
    id: squad, label: squad.toUpperCase(), tipo: 'squad' as const, squad,
    x: 100, z: 100, largura: 300, profundidade: 180, alturaVidro: 90,
    abertura: 70, ativa, ocupantes: ativa ? 1 : 0,
  }
  const agente = {
    chave: `${squad}-1`, nome: squad, squad, tipoVisual: 'robo' as const,
    ativa, ordem: 1, execucao: { estado: ativa ? 'trabalhando' : 'parado' },
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
    progressos: progresso === undefined ? undefined : new Map([[squad, progresso]]),
  }
}

for (const [squad, postos] of [['bots', 8], ['coordenação', 3]] as const) {
  const semPostos = contextoDeTeste()
  desenharEscritorioV7(semPostos.ctx, frameDaSala(squad, 0))
  const comPostos = contextoDeTeste()
  desenharEscritorioV7(comPostos.ctx, frameDaSala(squad, postos))
  conferir(`${squad.toUpperCase()} com um ocupante desenha ${postos} mesas físicas`,
    comPostos.gradientes() - semPostos.gradientes() === Math.max(0, postos - 1) * 2,
    `${comPostos.gradientes() - semPostos.gradientes()} gradientes de mesa/cadeira`)
}

const mobiliaSalaAtiva = contextoDeTeste()
desenharEscritorioV7(mobiliaSalaAtiva.ctx, frameDaSala('bots', 3, true))
const mobiliaSalaOciosa = contextoDeTeste()
desenharEscritorioV7(mobiliaSalaOciosa.ctx, frameDaSala('tráfego', 3, false, 0))
conferir('tráfego sem agente ativo desde o carregamento preserva parede e mobília completas',
  mobiliaSalaOciosa.gradientes() === mobiliaSalaAtiva.gradientes(),
  `${mobiliaSalaOciosa.gradientes()}/${mobiliaSalaAtiva.gradientes()} gradientes`)

const mesasDoAgente = [{ x: 310, y: 170 }, { x: 350, y: 170 }]
const postosFisicos = [{ x: 130, y: 150 }, { x: 310, y: 170 }, { x: 350, y: 170 }]
const postosRenderizados = postosParaRenderizarSala(postosFisicos, mesasDoAgente)
conferir('cada agente usa a coordenada da própria mesa, não o índice de posto',
  JSON.stringify(postosRenderizados) === JSON.stringify([{ x: 130, y: 150 }, ...mesasDoAgente]),
  JSON.stringify(postosRenderizados))

if (falhas > 0) process.exit(1)
console.log('\nTodas as salas de squad desenham seus postos físicos!')
