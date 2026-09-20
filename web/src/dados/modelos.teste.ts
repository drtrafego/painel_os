// Teste da agregação de modelos de IA. Roda com:
//   node --experimental-strip-types src/dados/modelos.teste.ts
//
// Metade dos casos existe pra REPROVAR: uma função que só sabe montar o caso
// bonito não distingue "está certo" de "eu parei de olhar". Os casos abaixo
// cobrem o mapa ausente, o mapa vazio, o zero espúrio e o desempate por nome,
// que são exatamente os jeitos de um contador vivo mentir sem dar erro.

import { porModelo, totalMedidoPorModelo } from './modelos.ts'
import type { Estado } from './tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}  obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`)
}

/** Estado mínimo, só com o que a função lê. */
function estadoCom(convocacoes_por_modelo?: Record<string, number>): Estado {
  return { resumo: { convocacoes_por_modelo } } as unknown as Estado
}

// 1. o caso real: três modelos, ordenado do maior pro menor, com percentual.
conferir(
  'ordena do maior pro menor e calcula percentual sobre o total medido',
  porModelo(estadoCom({ 'sonnet-5': 386, 'opus-5': 820, 'haiku-4-5': 6 })),
  [
    { modelo: 'opus-5', total: 820, percentual: 67.7 },
    { modelo: 'sonnet-5', total: 386, percentual: 31.8 },
    { modelo: 'haiku-4-5', total: 6, percentual: 0.5 },
  ],
)

// 2. campo ausente no estado (coleta antiga, ou coletor que ainda não rodou
//    com este campo): tem que devolver lista vazia, nunca quebrar.
conferir('campo ausente vira lista vazia, não erro', porModelo(estadoCom(undefined)), [])

// 3. mapa vazio (coletor rodou e não achou nenhum resolvedModel ainda).
conferir('mapa vazio vira lista vazia', porModelo(estadoCom({})), [])

// 4. ‼️ CONTROLE: contagem zero ou negativa não pode aparecer como "modelo
//    em uso". Um contador vivo que zerasse por engano não pode virar uma
//    barra de 0% na tela: some da lista, não aparece com percentual 0.
conferir(
  'modelo com contagem zero ou negativa é descartado, não vira barra fantasma',
  porModelo(estadoCom({ 'sonnet-5': 5, 'haiku-4-5': 0, 'opus-5': -1 })),
  [{ modelo: 'sonnet-5', total: 5, percentual: 100 }],
)

// 5. empate: desempata por nome, pra ordem não trocar a cada coleta com o
//    mesmo dado (JS não garante ordem estável de Object.entries entre
//    execuções diferentes do runtime pra todo tipo de chave).
conferir(
  'empate de contagem desempata por nome, ordem não fica ao acaso',
  porModelo(estadoCom({ 'opus-5': 10, 'haiku-4-5': 10 })).map((x) => x.modelo),
  ['haiku-4-5', 'opus-5'],
)

// 6. totalMedidoPorModelo é o piso, não pode inventar número diferente da
//    soma do que porModelo já mediu.
conferir(
  'totalMedidoPorModelo soma exatamente o que porModelo devolveu',
  totalMedidoPorModelo(estadoCom({ 'sonnet-5': 386, 'opus-5': 820, 'haiku-4-5': 6 })),
  1212,
)

console.log()
if (falhas) {
  console.log(`REPROVADO: ${falhas} falha(s)`)
  process.exit(1)
}
console.log('APROVADO: agregação de modelos medida, incluindo os casos que tinham que reprovar sozinhos.')
