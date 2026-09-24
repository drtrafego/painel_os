/**
 * TESTE DO DESENHO DO COFRE.
 *
 * Rodar:
 *   cd web && node --experimental-strip-types src/dados/cofre.teste.ts
 *
 * ‼️ POR QUE ELE EXISTE: o roteiro de navegador do Cofre media EXISTÊNCIA
 * (conta nó, conta aresta, clica e vê a ficha trocar) e por isso aprovava um
 * mapa em que os rótulos se cruzavam. Com 5 registros qualquer desenho passa;
 * o defeito é de ESCALA. Aqui o layout roda com 45 nós, que é o volume que vem,
 * e as caixas são medidas uma contra a outra.
 *
 * E ele começa provando que sabe reprovar: o detector de cruzamento é apontado
 * para dois retângulos empilhados de propósito, e o seletor de rótulos é
 * obrigado a recusar quando não há espaço. Checagem que nunca foi vista
 * reprovando não distingue "está certo" de "parei de olhar".
 */
import {
  arestasDoCaminho,
  CAIXA_CELULAR,
  CAIXA_MESA,
  calcularPosicoesOrbita3D,
  caminhoMaisCurto,
  corDaArea,
  corDaAreaEscuro,
  cruzam,
  encurtar,
  diagnosticarLayout,
  escolherRotulos,
  posicionarCofre,
  raioDeToque,
  RAIO_MINIMO_CLICAVEL,
  raioDoNo,
  type Posto,
} from './cofre.ts'
import type { NoMemoria } from './tipos.ts'

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

/**
 * As DUAS caixas que a tela usa de verdade, IMPORTADAS do módulo.
 *
 * Elas eram copiadas aqui, e cópia de constante é trava que mede outro objeto:
 * mudar a caixa da tela deixava o teste aprovando a antiga. Medir só a larga
 * também era medir o caso fácil — com 45 nós na estreita os círculos se
 * encostavam, e passou batido até a captura de 390px mostrar. O pior caso é que
 * decide, nunca a média.
 */
const CAIXA = CAIXA_MESA
const CAIXA_ESTREITA = CAIXA_CELULAR
const AREAS = ['trafego', 'conteudo', 'bots', 'mineracao', 'painel', 'agentes']

function no(id: string, area: string, grau: number, peso = 3): NoMemoria {
  return {
    id, area, grau, peso,
    rotulo: `Aprendizado ${id} com título do tamanho que os reais têm`,
    arquivo: 'FONTE.md:12', linhas: 6, modificado: '2026-09-10T00:00:00+00:00',
    tipo: 'assunto', especie: 'trava', familia: 'zero-calado',
    corpo: 'corpo', caso: 'caso', autor: 'dev', quando: '2026-09-10', vencido: false,
  }
}

/** 45 nós com a mesma distribuição do dado que vem: 8 transversais e o resto
 *  espalhado pelas seis áreas, com grau de 0 a 5. */
const QUARENTA_E_CINCO: NoMemoria[] = [
  ...Array.from({ length: 8 }, (_, i) => no(`padrao-${i}`, 'transversal', 3 + (i % 3), 5)),
  ...Array.from({ length: 37 }, (_, i) => no(`no-${i}`, AREAS[i % AREAS.length], i % 6, 1 + (i % 5))),
]

console.log('\n0. O DETECTOR DE CRUZAMENTO SABE REPROVAR?')
{
  const a = { x: 10, y: 10, largura: 100, altura: 12 }
  ok('dois retângulos empilhados CRUZAM', cruzam(a, { ...a, y: 14 }))
  ok('e dois separados não cruzam', !cruzam(a, { ...a, y: 40 }))
  ok('encostados pela borda não contam como cruzamento', !cruzam(a, { ...a, x: 110 }))
}

console.log('\n1. RAIO POR GRAU')
{
  ok('nó sem ligação ainda tem raio clicável', raioDoNo(0, 5) >= 6)
  ok('o raio cresce com o grau', raioDoNo(5, 5) > raioDoNo(1, 5) + 3,
    `${raioDoNo(1, 5).toFixed(1)} -> ${raioDoNo(5, 5).toFixed(1)}`)
  // A área do círculo é que é proporcional: sem a raiz, grau 4 teria raio 4x.
  ok('e cresce pela área, não pela largura', raioDoNo(4, 4) < raioDoNo(1, 4) * 3,
    `${raioDoNo(1, 4).toFixed(1)} · ${raioDoNo(4, 4).toFixed(1)}`)
  ok('cada área tem cor própria', new Set(AREAS.map(corDaArea)).size === AREAS.length)
  // ‼️ Era `typeof ... === 'string'`, verdadeiro por construção do `??`. E
  // escondia um defeito real: a cor do desconhecido era a MESMA de `bots`, então
  // cadastrar uma área nova desenhava duas áreas iguais sem aviso.
  const conhecidas = new Set(['transversal', ...AREAS].map(corDaArea))
  ok('área desconhecida ganha cor PRÓPRIA, não a de outra área',
    !conhecidas.has(corDaArea('inventada')),
    `${corDaArea('inventada')} contra ${[...conhecidas].join(' ')}`)
  ok('área operacao tem cor própria em corDaArea', corDaArea('operacao') === 'var(--color-laranja)')
  ok('área operacao tem cor viva em corDaAreaEscuro', corDaAreaEscuro('operacao') === '#FB923C')
  const todasAreas = ['transversal', 'conteudo', 'trafego', 'bots', 'mineracao', 'painel', 'agentes', 'vendas', 'engenharia', 'operacao']
  ok('todas as 10 áreas têm cores escuras distintas entre si', new Set(todasAreas.map(corDaAreaEscuro)).size === todasAreas.length)
}

console.log('\n2. O LAYOUT COM OS 45 QUE VÊM')
const postos = posicionarCofre(QUARENTA_E_CINCO, CAIXA, ['trafego', ...AREAS.slice(1)])
{
  ok('todo nó tem posto', postos.size === 45, `postos=${postos.size}`)
  const fora = [...postos.values()].filter(
    (p) => p.x - p.raio < 0 || p.x + p.raio > CAIXA.largura || p.y - p.raio < 0 || p.y + p.raio > CAIXA.altura,
  )
  ok('nenhum nó sai da moldura', fora.length === 0, `fora=${fora.map((p) => p.id).join(',')}`)

  // Círculo sobre círculo é o defeito visual mais barato de medir, e o que a
  // elipse única produzia: 45 nós no mesmo anel encostam.
  const encostados = (mapa: Map<string, Posto>) => {
    const lista = [...mapa.values()]
    const pares: string[] = []
    for (let i = 0; i < lista.length; i += 1) {
      for (let j = i + 1; j < lista.length; j += 1) {
        const d = Math.hypot(lista[i].x - lista[j].x, lista[i].y - lista[j].y)
        if (d < lista[i].raio + lista[j].raio + 2) pares.push(`${lista[i].id}×${lista[j].id}`)
      }
    }
    return pares
  }
  const colados = encostados(postos)
  ok('nenhum par de nós se sobrepõe', colados.length === 0, colados.slice(0, 3).join(' | '))

  // PROVA QUE A MEDIÇÃO SABE REPROVAR. Ela era apontada para uma caixa de
  // 200x200, e desde que o layout passou a APERTAR SOZINHO até caber, nem ali
  // há sobreposição: o controle tinha parado de controlar. Agora dois postos
  // são empilhados à mão, que é um caso que nenhuma melhoria do layout desfaz.
  const empilhados = new Map<string, Posto>([
    ['a', { id: 'a', area: 'bots', x: 100, y: 100, raio: 12, angulo: 0 }],
    ['b', { id: 'b', area: 'bots', x: 104, y: 100, raio: 12, angulo: 0 }],
  ])
  ok('e a checagem ACUSA dois círculos empilhados', encostados(empilhados).length === 1,
    `pares=${encostados(empilhados).length}`)

  const centro = { x: CAIXA.largura / 2, y: CAIXA.altura / 2 }
  const distancia = (p: Posto) => Math.hypot(p.x - centro.x, p.y - centro.y)
  const todos = [...postos.values()]
  const miolo = todos.filter((p) => p.area === 'transversal')
  const resto = todos.filter((p) => p.area !== 'transversal')
  ok('transversal fica no miolo, que é o que ela é',
    Math.max(...miolo.map(distancia)) < Math.min(...resto.map(distancia)),
    `miolo=${Math.max(...miolo.map(distancia)).toFixed(0)} resto=${Math.min(...resto.map(distancia)).toFixed(0)}`)

  // Cada área ocupa um setor: sem isto a cor seria a única pista e o mapa
  // viraria confete.
  const angulos = new Map<string, number[]>()
  for (const p of resto) angulos.set(p.area, [...(angulos.get(p.area) ?? []), p.angulo])
  const largura = [...angulos.entries()].map(([area, as]) => [area, Math.max(...as) - Math.min(...as)] as const)
  ok('os nós de uma área ficam juntos num setor',
    largura.every(([, l]) => l < Math.PI), largura.map(([a, l]) => `${a}=${l.toFixed(2)}`).join(' '))

  const outra = posicionarCofre(QUARENTA_E_CINCO, CAIXA, ['trafego', ...AREAS.slice(1)])
  ok('o layout é determinístico',
    [...postos.values()].every((p) => outra.get(p.id)!.x === p.x && outra.get(p.id)!.y === p.y))
}

console.log('\n2B. O MESMO VOLUME NA CAIXA DO CELULAR')
{
  const estreita = posicionarCofre(QUARENTA_E_CINCO, CAIXA_ESTREITA, AREAS)
  const lista = [...estreita.values()]
  const fora = lista.filter(
    (p) => p.x - p.raio < 0 || p.x + p.raio > CAIXA_ESTREITA.largura
      || p.y - p.raio < 0 || p.y + p.raio > CAIXA_ESTREITA.altura,
  )
  ok('nada sai da moldura estreita', fora.length === 0, fora.map((p) => p.id).join(','))
  let colados = 0
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      if (Math.hypot(lista[i].x - lista[j].x, lista[i].y - lista[j].y) < lista[i].raio + lista[j].raio + 2) colados += 1
    }
  }
  ok('e nenhum par de nós se encosta em 420px', colados === 0, `pares=${colados}`)
  const r = escolherRotulos(estreita, (id) => QUARENTA_E_CINCO.find((n) => n.id === id)!.rotulo, () => 1, CAIXA_ESTREITA)
  console.log(`  (${r.length} de 45 nomes cabem na caixa estreita)`)
  ok('e ainda cabe algum nome no celular', r.length >= 8, `desenhados=${r.length}`)
}

console.log('\n2C. VOLUME ACIMA DO MEDIDO, QUE ERA ONDE ELE DEGRADAVA CALADO')
{
  // O QA mediu, em 10/09, o layout encavalando fora do volume que eu tinha
  // testado: 61 pares colados com 100 nós no celular, 92 com 150 na mesa, e nós
  // FORA da moldura quando 41 registros caíam em `transversal`. Espécie `padrao`
  // mora em transversal por contrato, então esse caso não é hipotético.
  const fabricar = (quantos: number, areasUsadas: string[]) =>
    Array.from({ length: quantos }, (_, i) => no(`n-${i}`, areasUsadas[i % areasUsadas.length], i % 6, 1 + (i % 5)))

  // ‼️ O APERTO TEM PISO, e por isso existe uma FRONTEIRA. Antes o laço apertava
  // até qualquer coisa caber, e o QA mediu o preço: 1,9px de diâmetro no
  // celular com 200 nós, alvo que dedo nenhum acerta. Agora ele para no raio
  // mínimo clicável, e acima disso a tela DIZ que o volume passou do que a
  // caixa comporta, em vez de mostrar um mapa encavalado calado.
  //
  // Fronteira medida em 10/09, com o piso valendo NOS DOIS CAMINHOS: 115 nós na
  // mesa, 60 no celular, 310 e 185 quando tudo é transversal (aí o miolo usa o
  // mapa todo). O alvo da casa é 45.
  //
  // ⚠️ Ela já foi 135 e 80, e caiu de propósito: o piso só valia quando o
  // desenho saía SUJO, porque a saída limpa vinha antes na condição. Uma
  // tentativa apertada e limpa era aceita por menor que ficasse (3,12 na mesa,
  // 3,25 no celular, abaixo do piso de 3,5 declarado). Fronteira menor com a
  // garantia valendo é melhor que fronteira maior com a garantia mentindo.
  for (const [nome, quantos, caixa, areasUsadas] of [
    ['45 nós na mesa', 45, CAIXA, AREAS],
    ['45 nós no celular', 45, CAIXA_ESTREITA, AREAS],
    ['100 nós na mesa', 100, CAIXA, AREAS],
    ['60 nós no celular', 60, CAIXA_ESTREITA, AREAS],
    ['115 nós na mesa, a fronteira medida', 115, CAIXA, AREAS],
    ['60 nós TODOS transversais', 60, CAIXA_ESTREITA, ['transversal']],
    ['45 nós numa área só', 45, CAIXA, ['trafego']],
  ] as const) {
    const mapa = posicionarCofre(fabricar(quantos, [...areasUsadas]), caixa, [...areasUsadas])
    const como = diagnosticarLayout(mapa, caixa)
    ok(`${nome}: nada colado e nada fora da moldura`, como.colados === 0 && como.fora === 0,
      JSON.stringify(como))
    ok(`${nome}: e o círculo continua clicável`, como.menorRaio >= RAIO_MINIMO_CLICAVEL,
      `menorRaio=${como.menorRaio.toFixed(1)}`)
  }

  // ACIMA DA FRONTEIRA O DIAGNÓSTICO TEM QUE ACUSAR. Se ele ficasse verde aqui,
  // o aviso da tela nunca apareceria e o mapa encavalaria em silêncio, que é
  // exatamente o defeito que este bloco existe pra impedir.
  for (const [nome, quantos, caixa] of [
    ['300 nós na mesa', 300, CAIXA],
    ['200 nós no celular', 200, CAIXA_ESTREITA],
  ] as const) {
    const como = diagnosticarLayout(
      posicionarCofre(fabricar(quantos, AREAS), caixa, AREAS), caixa,
    )
    ok(`${nome}: o diagnóstico ACUSA que passou do que a caixa comporta`,
      como.colados > 0 || como.fora > 0, JSON.stringify(como))
    ok(`${nome}: e mesmo assim não encolhe abaixo do clicável`,
      como.menorRaio >= RAIO_MINIMO_CLICAVEL, `menorRaio=${como.menorRaio.toFixed(1)}`)
  }
}

console.log('\n2C2. O PISO NÃO DEPENDE DE QUEM CONFIGURA A CAIXA')
{
  // O QA achou a condição não escrita: o laço só encolhe, então com uma escala
  // base pequena o desenho JÁ NASCIA abaixo do piso e saía limpo, sem aviso.
  // Agora a escala tem chão, e isto mede exatamente esse caso.
  const minúscula = { ...CAIXA_ESTREITA, escalaNo: 0.2 }
  const como = diagnosticarLayout(
    posicionarCofre(QUARENTA_E_CINCO, minúscula, AREAS), minúscula,
  )
  ok('mesmo com escalaNo 0,2 o raio não cai abaixo do piso',
    como.menorRaio >= RAIO_MINIMO_CLICAVEL, `menorRaio=${como.menorRaio.toFixed(2)}`)
  const enorme = { ...CAIXA_MESA, escalaNo: 0.05 }
  const como2 = diagnosticarLayout(posicionarCofre(QUARENTA_E_CINCO, enorme, AREAS), enorme)
  ok('e com 0,05 também não', como2.menorRaio >= RAIO_MINIMO_CLICAVEL,
    `menorRaio=${como2.menorRaio.toFixed(2)}`)
}

console.log('\n2D. O ALVO DE TOQUE É MAIOR QUE O DESENHO')
{
  // O círculo desenhado tem 6,3px CSS de diâmetro no celular e a WCAG 2.5.8
  // pede 24. Aumentar o DESENHO custa 11 dos 28 nomes (medido); o alvo invisível
  // custa zero. O raio sai da metade da menor distância entre centros, senão em
  // volume alto dois alvos se encostam e o clique fica ambíguo.
  const mapa = posicionarCofre(QUARENTA_E_CINCO, CAIXA_ESTREITA, AREAS)
  const como = diagnosticarLayout(mapa, CAIXA_ESTREITA)
  const alvo = raioDeToque(como.menorRaio, como.menorDistancia)
  ok('o alvo de toque é bem maior que o círculo desenhado', alvo > como.menorRaio * 2,
    `alvo=${alvo.toFixed(1)} desenho=${como.menorRaio.toFixed(1)}`)
  ok('e dois alvos vizinhos NÃO se encostam', alvo * 2 <= como.menorDistancia,
    `2×${alvo.toFixed(1)} contra ${como.menorDistancia.toFixed(1)}`)
  // PROVA QUE SABE REPROVAR: com os centros colados, o alvo tem que encolher
  // até o desenho, em vez de crescer por cima do vizinho.
  ok('com centros colados, o alvo não passa do próprio desenho',
    raioDeToque(6, 1) === 6, String(raioDeToque(6, 1)))
  ok('e o alvo tem teto, pra um mapa vazio não virar um botão gigante',
    raioDeToque(6, 5000) === 22, String(raioDeToque(6, 5000)))
}

console.log('\n3. OS RÓTULOS NÃO SE CRUZAM')
{
  const rotulos = escolherRotulos(
    postos,
    (id) => QUARENTA_E_CINCO.find((n) => n.id === id)!.rotulo,
    (id) => (id === 'no-3' ? 1000 : postos.get(id)!.raio),
    CAIXA,
  )
  const caixas = rotulos.map((r) => {
    const largura = r.texto.length * 9.5 * 0.62
    return { x: r.ancora === 'start' ? r.x : r.x - largura, y: r.y - 11, largura, altura: 12 }
  })
  let cruzados = 0
  for (let i = 0; i < caixas.length; i += 1) {
    for (let j = i + 1; j < caixas.length; j += 1) if (cruzam(caixas[i], caixas[j])) cruzados += 1
  }
  ok('zero rótulos cruzados', cruzados === 0, `cruzados=${cruzados}`)
  console.log(`  (${rotulos.length} de 45 nomes cabem na caixa larga)`)
  ok('e ainda sobra rótulo pra ler', rotulos.length >= 20, `desenhados=${rotulos.length}/45`)
  ok('o nó de maior prioridade nunca é o descartado', rotulos.some((r) => r.id === 'no-3'))
  ok('o rótulo longo é encurtado, não deixado inteiro',
    rotulos.every((r) => r.texto.length <= (CAIXA.maximoRotulo ?? 26)))
  ok('encurtar preserva o curto', encurtar('curto') === 'curto')

  // PROVA QUE SABE REPROVAR: com todos os nós no mesmo ponto, é impossível
  // escrever dois rótulos sem cruzar, e o seletor tem que devolver um só.
  const empilhados = new Map<string, Posto>(
    ['a', 'b', 'c'].map((id) => [id, { id, area: 'bots', x: 450, y: 310, raio: 8, angulo: 0 }]),
  )
  const apertado = escolherRotulos(empilhados, () => 'rótulo qualquer', () => 1, CAIXA)
  ok('sem espaço, o seletor RECUSA em vez de empilhar', apertado.length === 1,
    `aceitos=${apertado.length}`)
}

console.log('\n4. O CAMINHO MAIS CURTO')
{
  const arestas = [
    { de: 'a', para: 'b' },
    { de: 'b', para: 'c' },
    { de: 'c', para: 'd' },
    { de: 'a', para: 'e' },
    { de: 'e', para: 'd' },
    { de: 'x', para: 'y' },
  ]
  ok('acha o caminho entre dois ligados',
    JSON.stringify(caminhoMaisCurto(arestas, 'a', 'c')) === JSON.stringify(['a', 'b', 'c']))
  ok('e pega o MAIS CURTO quando há dois',
    caminhoMaisCurto(arestas, 'a', 'd')!.length === 3, JSON.stringify(caminhoMaisCurto(arestas, 'a', 'd')))
  ok('anda contra a seta, porque a leitura é não dirigida',
    JSON.stringify(caminhoMaisCurto(arestas, 'c', 'a')) === JSON.stringify(['c', 'b', 'a']))
  ok('o mesmo nó devolve ele mesmo',
    JSON.stringify(caminhoMaisCurto(arestas, 'a', 'a')) === JSON.stringify(['a']))
  // Sem ligação declarada é NULO, e nulo é resposta: aproximar por semelhança
  // aqui seria inventar a aresta que o coletor recusou lá.
  ok('sem ligação declarada devolve nulo, não um caminho inventado',
    caminhoMaisCurto(arestas, 'a', 'y') === null)
  ok('nó que não existe também devolve nulo', caminhoMaisCurto(arestas, 'a', 'zzz') === null)
  ok('as arestas do caminho saem marcadas nos dois sentidos',
    arestasDoCaminho(['a', 'b', 'c']).has('b|a') && arestasDoCaminho(['a', 'b', 'c']).has('b|c'))
  ok('caminho nulo não marca nada', arestasDoCaminho(null).size === 0)
}

console.log('\n5. O DADO DE HOJE, COM CINCO')
{
  const cinco = QUARENTA_E_CINCO.slice(0, 2).concat(QUARENTA_E_CINCO.slice(8, 11))
  const p = posicionarCofre(cinco, CAIXA, AREAS)
  // ‼️ A asserção era `p.size === 5`, que não tem NADA a ver com encostar: o QA
  // provou multiplicando o raio por oito, e ela continuou verde com 7 pares
  // sobrepostos. Agora ela mede a distância, que é o que a frase promete.
  const lista = [...p.values()]
  let colados = 0
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      if (Math.hypot(lista[i].x - lista[j].x, lista[i].y - lista[j].y) < lista[i].raio + lista[j].raio + 2) colados += 1
    }
  }
  ok('cinco nós também cabem sem se encostar', p.size === 5 && colados === 0, `colados=${colados}`)
  const r = escolherRotulos(p, (id) => `rótulo de ${id}`, () => 1, CAIXA)
  ok('e os cinco rótulos aparecem', r.length === 5, `desenhados=${r.length}`)
}

console.log('\n6. LAYOUT ÓRBITA 3D: HUB NO CENTRO E CASCA CONCÊNTRICA')
{
  const nosTeste = [
    { id: 'hub-maximo', grau: 18, peso: 10 },
    { id: 'no-secundario-1', grau: 8, peso: 4 },
    { id: 'no-secundario-2', grau: 5, peso: 2 },
    { id: 'no-secundario-3', grau: 2, peso: 1 },
    { id: 'no-folha', grau: 0, peso: 1 },
  ]
  const posicoes = calcularPosicoesOrbita3D(nosTeste)
  ok('todos os nós recebem posição 3D', posicoes.size === nosTeste.length)

  const posHub = posicoes.get('hub-maximo')!
  ok('o nó de maior grau (hub) fica exatamente em (0, 0, 0)',
    posHub.fx === 0 && posHub.fy === 0 && posHub.fz === 0 && posHub.radius === 0,
    `hub coords: fx=${posHub.fx}, fy=${posHub.fy}, fz=${posHub.fz}, radius=${posHub.radius}`)

  const secundarias = [...posicoes.values()].filter((p) => p.id !== 'hub-maximo')
  ok('nós orbitantes têm radius > 0', secundarias.every((p) => p.radius > 0),
    `raios: ${secundarias.map((p) => p.radius).join(', ')}`)
  ok('nenhuma coordenada 3D é NaN ou indefinida',
    [...posicoes.values()].every((p) => !Number.isNaN(p.fx) && !Number.isNaN(p.fy) && !Number.isNaN(p.fz) && Number.isFinite(p.fx)))

  // Prova que se o hub mudar, o novo nó mais conectado vai para o centro
  const nosInvertidos = [
    { id: 'antigo-hub', grau: 2 },
    { id: 'novo-super-hub', grau: 25 },
  ]
  const posInvertidas = calcularPosicoesOrbita3D(nosInvertidos)
  const posNovoHub = posInvertidas.get('novo-super-hub')!
  ok('novo hub assume o centro (0, 0, 0) sem depender da ordem do array',
    posNovoHub.fx === 0 && posNovoHub.fy === 0 && posNovoHub.fz === 0)
}

console.log(`\n${passou} passaram, ${falhou} falharam.`)
process.exit(falhou ? 1 : 0)
