/**
 * TESTE DO LAYOUT DO GRAFO.
 *
 * Rodar:
 *   cd web && node --experimental-strip-types src/dados/grafo.teste.ts
 *
 * ‼️ POR QUE ELE EXISTE: em 08/09 a primeira fisica EXPLODIU. As coordenadas
 * chegaram a 10^15 e o grafo ficou invisivel. O roteiro de navegador aprovou:
 * ele contava nos, arestas e NaN, e as tres contagens estavam certas. Ele media
 * EXISTENCIA e o defeito era de ESCALA. Este arquivo mede a escala.
 *
 * E ele comeca provando que sabe reprovar: um grafo estourado de proposito tem
 * que fazer a checagem disparar. Checagem que nunca foi vista reprovando nao
 * distingue "esta tudo certo" de "eu parei de olhar".
 */
import { ALFA_PARADA, montarGrafo, moldura, passo, raioDoPeso, type Grafo } from './grafo.ts'
import type { Aresta } from './tipos.ts'

let passou = 0
let falhou = 0
function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou += 1
    console.log(`  ok    ${nome}`)
  } else {
    falhou += 1
    console.log(`  FALHA ${nome}${detalhe ? `  ->  ${detalhe}` : ''}`)
  }
}

/** A checagem que o defeito de 08/09 teria disparado. */
const LIMITE = 4000
function estourou(g: Grafo): { fora: number; maior: number } {
  let maior = 0
  let fora = 0
  for (const n of g.nos) {
    const d = Math.max(Math.abs(n.x), Math.abs(n.y))
    if (!Number.isFinite(d) || d > LIMITE) fora += 1
    maior = Math.max(maior, Number.isFinite(d) ? d : Infinity)
  }
  return { fora, maior }
}

/** Arestas parecidas com as reais: uma sessao pesada e agentes chamando agentes. */
function arestasDeMentira(): Aresta[] {
  const a: Aresta[] = []
  const alvos = ['dev', 'qa', 'copy', 'designer', 'analista', 'gestor', 'general-purpose', 'Explore']
  alvos.forEach((alvo, i) => a.push({ de: 'Luana', de_tipo: 'sessao', para: alvo, vezes: 143 - i * 15 }))
  a.push({ de: 'qa', de_tipo: 'agente', para: 'general-purpose', vezes: 35 })
  a.push({ de: 'general-purpose', de_tipo: 'agente', para: 'general-purpose', vezes: 33 })
  a.push({ de: 'dev', de_tipo: 'agente', para: 'qa', vezes: 11 })
  a.push({ de: 'dev', de_tipo: 'agente', para: 'Explore', vezes: 7 })
  return a
}

const temCargo = (n: string) => !['general-purpose', 'Explore', 'fork'].includes(n)

console.log('\n0. A CHECAGEM SABE REPROVAR?')
{
  const g = montarGrafo(arestasDeMentira(), temCargo)
  ok('grafo recem-montado está dentro do limite', estourou(g).fora === 0)
  const estragado = montarGrafo(arestasDeMentira(), temCargo)
  estragado.nos[0].x = 9.5e15
  ok('com um nó em 9,5e15, a checagem ACUSA', estourou(estragado).fora === 1)
  const comNaN = montarGrafo(arestasDeMentira(), temCargo)
  comNaN.nos[1].y = NaN
  ok('com um nó em NaN, a checagem ACUSA', estourou(comNaN).fora === 1)
}

console.log('\n1. A SIMULAÇÃO CONVERGE E NÃO EXPLODE')
{
  const g = montarGrafo(arestasDeMentira(), temCargo)
  const maior = Math.max(...g.nos.map((n) => n.peso), 1)
  const raio = (p: number) => raioDoPeso(p, maior)
  let quadros = 0
  let alfa = 1
  while (alfa > ALFA_PARADA && quadros < 2000) {
    alfa = passo(g, raio)
    quadros += 1
  }
  const fim = estourou(g)
  ok('ela PARA sozinha (o alfa esfria)', alfa <= ALFA_PARADA, `alfa=${alfa.toFixed(4)} quadros=${quadros}`)
  ok('e para em menos de 900 quadros, que é o teto do componente', quadros < 900, `quadros=${quadros}`)
  ok('nenhum nó saiu do limite', fim.fora === 0, `fora=${fim.fora} maior=${Math.round(fim.maior)}`)
  ok('nenhuma coordenada virou NaN', g.nos.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)))

  const c = moldura(g)
  ok('a moldura tem tamanho desenhável', c.w > 120 && c.w < 3000 && c.h > 120 && c.h < 3000, `w=${Math.round(c.w)} h=${Math.round(c.h)}`)
  // O defeito de 08/09 em uma linha: os nos cabiam no viewBox e eram pequenos
  // demais pra aparecer. Um circulo do maior no tem que ocupar pelo menos 1%
  // da largura da moldura, senao a tela fica visualmente vazia.
  const maiorRaio = Math.max(...g.nos.map((n) => raio(n.peso)))
  ok(
    'o maior nó ocupa pelo menos 1% da moldura (senão a tela fica vazia)',
    (maiorRaio * 2) / c.w > 0.01,
    `nó=${(maiorRaio * 2).toFixed(1)} moldura=${Math.round(c.w)}`,
  )
}

console.log('\n2. OS NÓS NÃO FICAM EMPILHADOS')
{
  const g = montarGrafo(arestasDeMentira(), temCargo)
  const maior = Math.max(...g.nos.map((n) => n.peso), 1)
  const raio = (p: number) => raioDoPeso(p, maior)
  for (let i = 0; i < 600; i++) passo(g, raio)
  let colados = 0
  for (let i = 0; i < g.nos.length; i++) {
    for (let j = i + 1; j < g.nos.length; j++) {
      const d = Math.hypot(g.nos[i].x - g.nos[j].x, g.nos[i].y - g.nos[j].y)
      if (d < raio(g.nos[i].peso) + raio(g.nos[j].peso)) colados += 1
    }
  }
  ok('nenhum par de nós fica sobreposto', colados === 0, `pares colados=${colados}`)
}

console.log('\n3. O LAYOUT É DETERMINÍSTICO (senão parece que o dado mudou)')
{
  const a = montarGrafo(arestasDeMentira(), temCargo)
  const b = montarGrafo(arestasDeMentira(), temCargo)
  const maior = Math.max(...a.nos.map((n) => n.peso), 1)
  const raio = (p: number) => raioDoPeso(p, maior)
  for (let i = 0; i < 200; i++) {
    passo(a, raio)
    passo(b, raio)
  }
  const iguais = a.nos.every((n, i) => n.x === b.nos[i].x && n.y === b.nos[i].y)
  ok('duas simulações iguais dão o mesmo resultado', iguais)
}

console.log('\n4. O TAMANHO DO NÓ SAI DA FREQUÊNCIA')
{
  const g = montarGrafo(arestasDeMentira(), temCargo)
  const maior = Math.max(...g.nos.map((n) => n.peso), 1)
  const ordenados = [...g.nos].sort((x, y) => y.peso - x.peso)
  ok(
    'quem aparece mais tem raio maior',
    raioDoPeso(ordenados[0].peso, maior) > raioDoPeso(ordenados[ordenados.length - 1].peso, maior),
  )
  ok('e nenhum raio é zero ou negativo', g.nos.every((n) => raioDoPeso(n.peso, maior) > 0))
}

console.log('\n5. OS CASOS DE BORDA NÃO DERRUBAM NADA')
{
  const vazio = montarGrafo([], temCargo)
  ok('grafo sem aresta nenhuma monta sem estourar', vazio.nos.length === 0)
  const c = moldura(vazio)
  ok('e a moldura dele ainda é desenhável', c.w > 0 && c.h > 0)
  const um = montarGrafo([{ de: 'a', de_tipo: 'sessao', para: 'b', vezes: 1 }], temCargo)
  for (let i = 0; i < 300; i++) passo(um, (p) => raioDoPeso(p, 1))
  ok('grafo de dois nós não explode', estourou(um).fora === 0)
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
