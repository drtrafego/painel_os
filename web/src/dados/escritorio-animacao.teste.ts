// Testes da máquina de estados do Escritório Voxel e waypoints de corredores.
// Execute com: npx tsx src/dados/escritorio-animacao.teste.ts

import {
  criarEstadoInicialBoneco,
  avancarEstadoAnimacao,
  calcularRotaEscritorio,
  calcularWaypoints,
  interpolarWaypoints,
  lerPostura,
  pontoEntradaDoEscritorio,
} from './escritorio-animacao.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) {
    falhas++
    console.error(`FALHOU: ${nome}\n  Obtido:   ${JSON.stringify(obtido)}\n  Esperado: ${JSON.stringify(esperado)}`)
  } else {
    console.log(`ok   ${nome}`)
  }
}

const posMesa = { x: 100, y: 150 }
const posDescanso = { x: -200, y: 300 }

// 1. Estado inicial trabalhando
const b1 = criarEstadoInicialBoneco('dev-1', 'trabalhando', posMesa, posDescanso, 1000, 'bash')
conferir('estado inicial trabalhando fica na mesa', { x: b1.x, y: b1.y, fase: b1.fase }, { x: 100, y: 150, fase: 'trabalhando' })
conferir('postura de bash é digitando', b1.posturaTrabalho, 'digitando')

// 2. Estado inicial parado
const b2 = criarEstadoInicialBoneco('dev-2', 'parado', posMesa, posDescanso, 1000)
conferir('estado inicial parado fica no descanso', { x: b2.x, y: b2.y, fase: b2.fase }, { x: -200, y: 300, fase: 'descanso' })

// 3. Transição de parado para trabalhando -> caminhando para mesa
const b3 = avancarEstadoAnimacao(b2, 'trabalhando', posMesa, posDescanso, 1100, false, 'view_file')
conferir('parado -> trabalhando inicia caminhando_para_mesa', b3.fase, 'caminhando_para_mesa')
conferir('postura de view_file é lendo', b3.posturaTrabalho, 'lendo')

// 4. Meio da caminhada através de corredores
// A caminhada do V8 agora dura 900 ms: curta o bastante para a mudança de
// estado não parecer lenta, mas ainda visível em dezenas de quadros.
const b4 = avancarEstadoAnimacao(b3, 'trabalhando', posMesa, posDescanso, 1550, false)
conferir('meio da caminhada avança posição x e y', b4.x > posDescanso.x && b4.x < posMesa.x, true)
conferir('continua caminhando_para_mesa', b4.fase, 'caminhando_para_mesa')

// 5. Chegada na mesa -> transição sentando
const b5 = avancarEstadoAnimacao(b4, 'trabalhando', posMesa, posDescanso, 3200, false)
conferir('fim da caminhada muda para sentando', b5.fase, 'sentando')

// 6. Conclusão do sentar -> trabalhando
const b6 = avancarEstadoAnimacao(b5, 'trabalhando', posMesa, posDescanso, 3600, false)
conferir('fim do sentar muda para trabalhando', b6.fase, 'trabalhando')
conferir('posição final é a mesa', { x: b6.x, y: b6.y }, posMesa)

// 7. Trabalhando para silencioso -> mantém mesa e vira silencioso
const b7 = avancarEstadoAnimacao(b6, 'silencioso', posMesa, posDescanso, 4000, false)
conferir('trabalhando -> silencioso vira silencioso na mesa', { x: b7.x, y: b7.y, fase: b7.fase }, { x: 100, y: 150, fase: 'silencioso' })

// 8. Silencioso para parado -> levantando
const b8 = avancarEstadoAnimacao(b7, 'parado', posMesa, posDescanso, 5000, false)
conferir('silencioso -> parado inicia levantando', b8.fase, 'levantando')

// 9. Fim do levantando -> caminhando_para_descanso
const b9 = avancarEstadoAnimacao(b8, 'parado', posMesa, posDescanso, 5400, false)
conferir('fim do levantando muda para caminhando_para_descanso', b9.fase, 'caminhando_para_descanso')

// 10. Conclusão da saída -> descanso
const b10 = avancarEstadoAnimacao(b9, 'parado', posMesa, posDescanso, 7500, false)
conferir('fim da caminhada de retorno chega ao descanso', { x: b10.x, y: b10.y, fase: b10.fase }, { x: -200, y: 300, fase: 'descanso' })

// 11. Redução de movimento (prefers-reduced-motion) instantânea
const bReduzido = avancarEstadoAnimacao(b2, 'trabalhando', posMesa, posDescanso, 1100, true)
conferir('modo reduzido vai instantaneamente para mesa como trabalhando', { x: bReduzido.x, y: bReduzido.y, fase: bReduzido.fase }, { x: 100, y: 150, fase: 'trabalhando' })

// 12. Testes de Waypoints de Corredores (Blocker 9)
const wp = calcularWaypoints({ x: -100, y: 50 }, { x: 120, y: 200 })
conferir('caminho entre lados opostos passa pelo corredor central x=0', wp.some((p) => p.x === 0), true)
conferir('ponto inicial é origem', { x: wp[0].x, y: wp[0].y }, { x: -100, y: 50 })
conferir('ponto final é destino', { x: wp[wp.length - 1].x, y: wp[wp.length - 1].y }, { x: 120, y: 200 })

const inicioWp = interpolarWaypoints(wp, 0)
const fimWp = interpolarWaypoints(wp, 1)
conferir('interpolar t=0 retorna origem', { x: Math.round(inicioWp.x), y: Math.round(inicioWp.y) }, { x: -100, y: 50 })
conferir('interpolar t=1 retorna destino', { x: Math.round(fimWp.x), y: Math.round(fimWp.y) }, { x: 120, y: 200 })

// 13. Interrupção no meio do caminho (sem teletransporte)
// Começa indo para a mesa:
const emMovimento = avancarEstadoAnimacao(b2, 'trabalhando', posMesa, posDescanso, 1100, false)
const meioDoCaminho = avancarEstadoAnimacao(emMovimento, 'trabalhando', posMesa, posDescanso, 2000, false)
const xInterrompido = meioDoCaminho.x
const yInterrompido = meioDoCaminho.y

// Interrompido para parado enquanto ainda andava:
const revertido = avancarEstadoAnimacao(meioDoCaminho, 'parado', posMesa, posDescanso, 2010, false)
conferir('ao ser interrompido muda para caminhando_para_descanso', revertido.fase, 'caminhando_para_descanso')
conferir('origem do novo caminho é a posição onde foi interrompido (sem teleporte)', {
  origemX: Math.round(revertido.origemX),
  origemY: Math.round(revertido.origemY),
}, {
  origemX: Math.round(xInterrompido),
  origemY: Math.round(yInterrompido),
})

// 14. Invariância de Taxa de Quadros (30Hz, 60Hz, 120Hz)
function simularCaminhada(fps: number): { x: number; y: number; fase: string } {
  const dt = 1000 / fps
  let estado = criarEstadoInicialBoneco('ag', 'parado', posMesa, posDescanso, 0)
  estado = avancarEstadoAnimacao(estado, 'trabalhando', posMesa, posDescanso, 0, false)
  for (let t = dt; t <= 2500; t += dt) {
    estado = avancarEstadoAnimacao(estado, 'trabalhando', posMesa, posDescanso, t, false)
  }
  return { x: Math.round(estado.x), y: Math.round(estado.y), fase: estado.fase }
}

const res30 = simularCaminhada(30)
const res60 = simularCaminhada(60)
const res120 = simularCaminhada(120)

conferir('simulação 30Hz chega na mesa', res30.fase === 'sentando' || res30.fase === 'trabalhando', true)
conferir('simulação 60Hz chega na mesa', res60.fase === 'sentando' || res60.fase === 'trabalhando', true)
conferir('simulação 120Hz chega na mesa', res120.fase === 'sentando' || res120.fase === 'trabalhando', true)
conferir('posições finais em 30Hz, 60Hz e 120Hz convergem', { x30: res30.x, x60: res60.x, x120: res120.x }, { x30: 100, x60: 100, x120: 100 })

// 15. Cadência uniforme: uma caminhada não pode dar um salto grande logo no primeiro quadro.
let caminhadaUniforme = criarEstadoInicialBoneco('cadencia', 'parado', posMesa, posDescanso, 0)
caminhadaUniforme = avancarEstadoAnimacao(caminhadaUniforme, 'trabalhando', posMesa, posDescanso, 0, false)
let pontoAnterior = { x: caminhadaUniforme.x, y: caminhadaUniforme.y }
const passosDaCaminhada: number[] = []
for (let t = 1000 / 60; t <= 750; t += 1000 / 60) {
  caminhadaUniforme = avancarEstadoAnimacao(caminhadaUniforme, 'trabalhando', posMesa, posDescanso, t, false)
  passosDaCaminhada.push(Math.hypot(caminhadaUniforme.x - pontoAnterior.x, caminhadaUniforme.y - pontoAnterior.y))
  pontoAnterior = { x: caminhadaUniforme.x, y: caminhadaUniforme.y }
}
const menorPasso = Math.min(...passosDaCaminhada)
const maiorPasso = Math.max(...passosDaCaminhada)
conferir('cadência da caminhada é uniforme a 60 Hz', Math.round(maiorPasso * 100) / 100, Math.round(menorPasso * 100) / 100)

// 16. Regressão do relato do Gastão: trabalho contínuo não pode reiniciar um ciclo.
let trabalhandoPorUmMinuto = criarEstadoInicialBoneco('dev-estavel', 'trabalhando', posMesa, posDescanso, 0, 'Edit')
const fasesDoMinuto = new Set<string>()
for (let t = 1000; t <= 60_000; t += 1000) {
  trabalhandoPorUmMinuto = avancarEstadoAnimacao(
    trabalhandoPorUmMinuto,
    'trabalhando',
    posMesa,
    posDescanso,
    t,
    false,
    'Edit'
  )
  fasesDoMinuto.add(trabalhandoPorUmMinuto.fase)
}
conferir('agente trabalhando por 60 s nunca levanta nem volta ao descanso', [...fasesDoMinuto], ['trabalhando'])
conferir('agente permanece sentado na mesma mesa depois dos 60 s', { x: trabalhandoPorUmMinuto.x, y: trabalhandoPorUmMinuto.y }, posMesa)

// 17. Entrada real do V8: recepção -> corredor -> abertura da sala -> mesa.
const arquiteturaV8 = {
  corredor: { x: 360, z: 55, largura: 48, profundidade: 770 },
  recepcao: { x: 65, z: 730, largura: 225, profundidade: 72 },
  salas: [
    { x: 542, z: 70, largura: 195, profundidade: 150, abertura: 52 },
    { x: 966, z: 70, largura: 195, profundidade: 150, abertura: 52 },
  ],
}
const entradaV8 = pontoEntradaDoEscritorio(arquiteturaV8)
const mesaV8 = { x: 620, y: 160 }
const rotaEntradaV8 = calcularRotaEscritorio(arquiteturaV8, entradaV8, mesaV8)
conferir('entrada do V8 nasce ao lado da recepção', entradaV8, { x: 318, y: 824 })
conferir('rota de entrada passa pelo eixo do corredor', rotaEntradaV8.some((p) => p.x === 384), true)
conferir('rota cruza a abertura frontal da sala', rotaEntradaV8.some((p) => p.x === 639.5 && p.y === 208), true)

let entrandoV8 = criarEstadoInicialBoneco('entrada-v8', 'parado', mesaV8, entradaV8, 0)
entrandoV8 = avancarEstadoAnimacao(entrandoV8, 'trabalhando', mesaV8, entradaV8, 0, false, null, rotaEntradaV8)
conferir('agente novo começa andando na entrada, não na mesa', {
  fase: entrandoV8.fase,
  x: entrandoV8.x,
  y: entrandoV8.y,
}, {
  fase: 'caminhando_para_mesa',
  x: entradaV8.x,
  y: entradaV8.y,
})
const entradaNoMeio = avancarEstadoAnimacao(entrandoV8, 'trabalhando', mesaV8, entradaV8, 450, false, null, rotaEntradaV8)
conferir('entrada progride por posição intermediária', entradaNoMeio.x !== entradaV8.x && entradaNoMeio.x !== mesaV8.x, true)

// 18. Regressão do teletransporte em troca de sala/mesa.
const mesaNova = { x: 1050, y: 160 }
const rotaTroca = calcularRotaEscritorio(arquiteturaV8, mesaV8, mesaNova)
const antesDaTroca = criarEstadoInicialBoneco('troca-v8', 'trabalhando', mesaV8, entradaV8, 0)
const iniciouTroca = avancarEstadoAnimacao(antesDaTroca, 'trabalhando', mesaNova, entradaV8, 100, false, null, rotaTroca)
conferir('troca de sala inicia caminhada em vez de teleportar', {
  fase: iniciouTroca.fase,
  x: iniciouTroca.x,
  y: iniciouTroca.y,
}, {
  fase: 'caminhando_para_mesa',
  x: mesaV8.x,
  y: mesaV8.y,
})
const trocaNoMeio = avancarEstadoAnimacao(iniciouTroca, 'trabalhando', mesaNova, entradaV8, 550, false, null, rotaTroca)
conferir('troca de sala passa pelo corredor antes da nova mesa', trocaNoMeio.x !== mesaV8.x && trocaNoMeio.x !== mesaNova.x, true)

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`)
  process.exit(1)
} else {
  console.log('\nTodos os testes da máquina de animação e corredores passaram com sucesso!')
}
