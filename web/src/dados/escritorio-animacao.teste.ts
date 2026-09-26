// Testes da máquina de estados do Escritório Voxel.
// Execute com: npx tsx src/dados/escritorio-animacao.teste.ts

import {
  criarEstadoInicialBoneco,
  avancarEstadoAnimacao,
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

// 4. Meio da caminhada (1000ms após início de 2000ms)
const b4 = avancarEstadoAnimacao(b3, 'trabalhando', posMesa, posDescanso, 2100, false)
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

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`)
  process.exit(1)
} else {
  console.log('\nTodos os testes da máquina de animação passaram com sucesso!')
}
