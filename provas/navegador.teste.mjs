/**
 * O ROTEIRO DE NAVEGADOR DO PAINEL OS.
 *
 * Rodar (com o servidor de pe na 5199):
 *   node /opt/gastaomatos/luana/painel_os/provas/navegador.teste.mjs
 *
 * Ate 08/09 este roteiro era ad-hoc: alguem abria o navegador e olhava. Regra
 * da casa: o que mora na cabeca de quem lembra, a proxima edicao apaga. Virou
 * arquivo, e ele reprova sozinho.
 *
 * ‼️ ELE COMECA PROVANDO QUE SABE REPROVAR. O detector de estouro horizontal
 * e testado contra um elemento largo de proposito ANTES de medir as telas de
 * verdade: sem isso, um detector quebrado devolveria "sem estouro" para sempre
 * e o roteiro ficaria verde por nao estar olhando nada.
 *
 * A credencial vem do MESMO arquivo que o servidor le, e nunca e impressa.
 */
import { chromium } from '/opt/gastaomatos/gabinete-mcp/node_modules/playwright/index.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

/**
 * O navegador que a maquina TEM, nao o que o pacote gostaria de ter.
 * O playwright instalado aqui pede a build 1228 e a que existe e a 1223: sem
 * isto o roteiro morre na largada com uma mensagem que parece defeito do
 * painel e nao e. Procura a build baixada e cai no chromium do sistema.
 */
function acharNavegador() {
  const cache = '/home/claude/.cache/ms-playwright'
  if (existsSync(cache)) {
    for (const pasta of readdirSync(cache).filter((d) => d.startsWith('chromium-'))) {
      const alvo = `${cache}/${pasta}/chrome-linux64/chrome`
      if (existsSync(alvo)) return alvo
    }
  }
  for (const alvo of ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']) {
    if (existsSync(alvo)) return alvo
  }
  throw new Error('não achei navegador nenhum nesta máquina')
}

const BASE = 'http://127.0.0.1:5199'
const PROVAS = '/opt/gastaomatos/luana/painel_os/provas'
const CELULAR = { width: 390, height: 844 }
const MESA = { width: 1440, height: 900 }

const VISTAS = [
  ['comando', 'Centro de operações.', 'medido'],
  ['estudio', 'O que está pronto para sair.', 'medido'],
  ['aprovacoes', 'Aprovações.', 'medido'],
  ['cobrancas', 'Cobranças.', 'medido'],
  ['diretores', 'Rede de agentes.', 'medido'],
  ['tarefas', 'Tarefas.', 'medido'],
  ['pipeline', 'Pipeline comercial.', 'medido'],
  ['chamadas', 'Chamadas.', 'chamadas-sem-fonte'],
  ['agenda', 'O que roda sozinho.', 'medido'],
  ['analitica', 'Analítica de conteúdo.', 'medido'],
  ['biblioteca', 'Biblioteca.', 'medido'],
  ['ferramentas', 'Ferramentas.', 'medido'],
  ['cofre', 'Cofre de conhecimento.', 'medido'],
]

let passou = 0
let falhou = 0
function ok(nome, condicao, detalhe = '') {
  if (condicao) {
    passou += 1
    console.log(`  ok    ${nome}`)
  } else {
    falhou += 1
    console.log(`  FALHA ${nome}${detalhe ? `  ->  ${detalhe}` : ''}`)
  }
}

function credencial() {
  const bruto = readFileSync('/opt/gastaomatos/luana/.painel_os.credencial', 'utf8')
  const linha = bruto.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))
  const i = linha.indexOf(':')
  return { username: linha.slice(0, i).trim(), password: linha.slice(i + 1).trim() }
}

/** scrollWidth > clientWidth em qualquer altura da pagina. */
const MEDIR_ESTOURO = () => {
  const d = document.documentElement
  const b = document.body
  return {
    doc: d.scrollWidth - d.clientWidth,
    body: b.scrollWidth - b.clientWidth,
    largura: d.clientWidth,
  }
}

const excecoes = []   // erro de JS na pagina: isto e defeito
const rede = []       // falha de rede: pode ser a navegacao cancelando

const navegador = await chromium.launch({ executablePath: acharNavegador() })
const ctx = await navegador.newContext({ httpCredentials: credencial(), viewport: CELULAR })
const pagina = await ctx.newPage()
pagina.on('pageerror', (e) => excecoes.push(String(e)))
pagina.on('requestfailed', (r) => rede.push(`${r.failure()?.errorText} ${r.url()}`))
// Resposta de erro do PROPRIO painel conta como defeito; recurso de fora nao.
pagina.on('response', (r) => {
  if (r.url().startsWith(BASE) && r.status() >= 400) rede.push(`HTTP ${r.status()} ${r.url()}`)
})

console.log('\n0. O INSTRUMENTO SABE REPROVAR?')
await pagina.goto(`${BASE}/#/comando`, { waitUntil: 'networkidle' })
{
  const limpo = await pagina.evaluate(MEDIR_ESTOURO)
  ok('sem nada estranho, o detector diz "sem estouro"', limpo.doc <= 0)
  // Injeta um elemento largo de proposito: se o detector nao acusar AQUI, ele
  // nao esta medindo nada e todo verde abaixo seria falso.
  await pagina.evaluate(() => {
    const d = document.createElement('div')
    d.id = 'sonda-larga'
    d.style.cssText = 'width:3000px;height:8px'
    document.body.appendChild(d)
  })
  const sujo = await pagina.evaluate(MEDIR_ESTOURO)
  ok('com um bloco de 3000px, o detector ACUSA', sujo.doc > 0, `doc=${sujo.doc}`)
  await pagina.evaluate(() => document.getElementById('sonda-larga')?.remove())
  const voltou = await pagina.evaluate(MEDIR_ESTOURO)
  ok('e volta ao normal quando o bloco sai', voltou.doc <= 0, `doc=${voltou.doc}`)
}

console.log('\n0B. O ESTADO QUE CHEGOU AO NAVEGADOR NÃO EXPÕE A MÁQUINA')
{
  const estado = await pagina.evaluate(async () => await fetch('/api/estado').then((r) => r.json()))
  const bruto = JSON.stringify(estado)
  // A fronteira impede que o `s:/` de `https://` seja confundido com unidade
  // Windows. URLs públicas rastreáveis são permitidas; caminhos da máquina não.
  const caminhoPrivado = /(?:^|[\s='"(])(?:\/(?:opt|home|root|etc|var|tmp|usr)(?:\/|\b)|~[\/\\]|[A-Za-z]:[\\/])/i
  ok('nenhum caminho privado chegou pela API', !caminhoPrivado.test(bruto))
  ok('a URL pública do Drive não é confundida com caminho privado', bruto.includes('https://drive.google.com/drive/folders/'))
  ok('nenhum e-mail chegou pela API', !/[\w.+-]+@[\w-]+\.[\w.]+/.test(bruto))
  ok('nenhum formato de token chegou pela API', !/(?:Bearer\s+[A-Za-z0-9._~+/-]{8,}|sk-[A-Za-z0-9_-]{8,}|dk_live_[A-Za-z0-9_-]{6,})/i.test(bruto))
  ok('a rastreabilidade técnica continua disponível', bruto.includes('posts.json') && bruto.includes('agente:global/'))
}

console.log('\n0C. CARREGAMENTO SOB DEMANDA NÃO VIRA TELA BRANCA')
{
  const ctxLento = await navegador.newContext({ httpCredentials: credencial(), viewport: CELULAR })
  const paginaLenta = await ctxLento.newPage()
  await paginaLenta.route('**/assets/Estudio-*.js', async (rota) => {
    await new Promise((resolve) => setTimeout(resolve, 350))
    await rota.continue()
  })
  await paginaLenta.goto(`${BASE}/#/estudio`, { waitUntil: 'domcontentloaded' })
  const carregando = paginaLenta.getByRole('status')
  await carregando.waitFor({ state: 'visible' })
  ok('o chunk lento mostra um estado de carregamento', await carregando.isVisible())
  const durante = await paginaLenta.evaluate(() => document.body.innerText)
  ok('a moldura e o nome da área continuam visíveis durante a espera', durante.includes('gastao-os') && durante.includes('Estúdio de conteúdo'))
  await paginaLenta.waitForFunction(() => document.body.innerText.includes('O que está pronto para sair.'))
  ok('e a tela real substitui o fallback quando o chunk chega', !(await paginaLenta.getByRole('status').isVisible()))
  await ctxLento.close()
}

console.log('\n0D. COLETA LONGA ATUALIZA A TELA SEM F5 NEM LOOP AGRESSIVO')
{
  const estadoBase = JSON.parse(
    readFileSync('/opt/gastaomatos/luana/painel_os/web/src/dados/estado.json', 'utf8'),
  )
  const ctxColeta = await navegador.newContext({ httpCredentials: credencial(), viewport: CELULAR })
  const paginaColeta = await ctxColeta.newPage()
  const chamadas = []
  await paginaColeta.route('**/api/estado', async (rota) => {
    chamadas.push(Date.now())
    const estado = structuredClone(estadoBase)
    if (chamadas.length < 3) {
      estado.calculado_ao_abrir = false
      estado.coleta_em_andamento = true
      estado.erro_coletor = 'a coleta continua em segundo plano; esta resposta é o último snapshot salvo'
    } else {
      estado.calculado_ao_abrir = true
      delete estado.coleta_em_andamento
      delete estado.erro_coletor
      estado.diretiva.objetivo = 'SNAPSHOT NOVO 987'
    }
    await rota.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(estado),
    })
  })
  await paginaColeta.goto(`${BASE}/#/comando`, { waitUntil: 'domcontentloaded' })
  await paginaColeta.waitForFunction(() => document.body.innerText.includes('987'), null, { timeout: 12_000 })
  ok('a tela busca de novo e incorpora o snapshot concluído', chamadas.length === 3, `chamadas=${chamadas.length}`)
  const intervalos = chamadas.slice(1).map((hora, i) => hora - chamadas[i])
  ok('os polls são sequenciais e espaçados por pelo menos 2s', intervalos.every((ms) => ms >= 2_000), `intervalos=${intervalos.join(',')}`)
  await paginaColeta.waitForTimeout(3_000)
  ok('o polling para assim que chega o snapshot novo', chamadas.length === 3, `chamadas=${chamadas.length}`)
  await ctxColeta.close()
}

for (const [tamanho, viewport] of [['celular 390x844', CELULAR], ['mesa 1440x900', MESA]]) {
  console.log(`\n${viewport === CELULAR ? 1 : 2}. AS TREZE VISTAS EM ${tamanho.toUpperCase()}`)
  await pagina.setViewportSize(viewport)

  for (const [id, titulo, tipo] of VISTAS) {
    await pagina.goto(`${BASE}/#/${id}`, { waitUntil: 'networkidle' })
    // Navegação por hash não espera um import() disparado depois do hashchange.
    // A prova certa é aguardar o conteúdo da rota, não um atraso arbitrário.
    await pagina.waitForFunction((esperado) => document.body.innerText.includes(esperado), titulo)

    const texto = await pagina.evaluate(() => document.body.innerText)
    const medida = await pagina.evaluate(MEDIR_ESTOURO)

    ok(`${id}: a tela abre e mostra "${titulo}"`, texto.includes(titulo), texto.slice(0, 90))
    ok(`${id}: sem estouro horizontal`, medida.doc <= 0 && medida.body <= 0, `doc=${medida.doc} body=${medida.body}`)

    if (tipo === 'sem-dado') {
      ok(`${id}: diz na tela que NÃO TEM DADO`, texto.includes('não tem dado ainda'))
      // Vista sem dado nao pode ter cartao de metrica. Mede o ELEMENTO e nao
      // o texto: contar digito pegava a prosa do "o que falta" ("98 arquivos")
      // e a chamava de metrica, que e o instrumento medindo a descricao do
      // fato em vez do fato.
      const kpis = await pagina.locator('[data-kpi], [data-numero]').count()
      ok(`${id}: e não mostra cartão de métrica nenhum`, kpis === 0, `encontrados=${kpis}`)
    }

    if (tipo === 'chamadas-sem-fonte') {
      const numeros = await pagina.locator('[data-kpi]').allTextContents()
      ok(`${id}: distingue ausência de fonte de zero chamadas`, texto.toLowerCase().includes('não tem dado ainda') && numeros.every((n) => !/\b0\b/.test(n)))
      ok(`${id}: explica a prova exigida`, texto.includes('Sem citação, não vira achado'))
    }

    if (viewport === CELULAR) {
      await pagina.screenshot({ path: `${PROVAS}/v3-390-${id}.png`, fullPage: true })
    }
    if (id === 'tarefas') {
      await pagina.screenshot({
        path: `${PROVAS}/v14-autonomia-${viewport === CELULAR ? '390' : 'desktop'}-real.png`,
        fullPage: true,
      })
    }
  }
}

console.log('\n2B. A DIRETIVA FORMAL NO CENTRO')
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/comando`, { waitUntil: 'networkidle' })
{
  const bloco = pagina.locator('[data-diretiva-atual]')
  ok('a diretiva vigente está visível', await bloco.isVisible())
  const texto = await bloco.innerText()
  ok('mostra o pedido real sem paráfrase inventada', texto.includes('Quero isso pronto amanhã entre em modo goal e só pare quando estiver tudo pronto'))
  ok('mostra prazo absoluto e origem técnica', texto.includes('2026-09-09') && texto.includes('telegram #9412'))
  await pagina.screenshot({ path: `${PROVAS}/v11-390-comando-diretiva.png`, fullPage: true })
}

console.log('\n3. A DÉCIMA PRIMEIRA VISTA: O DETALHE DE UM DIRETOR')
await pagina.setViewportSize(MESA)
for (const quem of ['dev', 'qa', 'dani-designer', 'luana']) {
  await pagina.goto(`${BASE}/#/diretores/${quem}`, { waitUntil: 'networkidle' })
  await pagina.waitForFunction(() => document.body.innerText.toLowerCase().includes('atividade e tarefas'))
  // minusculas nos dois lados: o rotulo micro e caixa alta por CSS e o
  // innerText devolve o texto JA TRANSFORMADO. Comparar com 'conexões' dava
  // falso vermelho num bloco que estava na tela.
  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
  ok(`detalhe de ${quem}: abre com o nome`, texto.includes(quem.split('-')[0]))
  ok(`detalhe de ${quem}: tem o bloco de conexões`, texto.includes('conexões'))
  ok(`detalhe de ${quem}: separa atividade da carteira GTD`, texto.includes('atividade e tarefas') && texto.includes('carteira gtd'))
  ok(`detalhe de ${quem}: não inventa responsável de tarefa`, texto.includes('não oferece responsável'))
  ok(`detalhe de ${quem}: mostra memória e saídas disponíveis`, texto.includes('memória e saídas'))
}
{
  await pagina.goto(`${BASE}/#/diretores/nao-existe-esse`, { waitUntil: 'networkidle' })
  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
  ok('rota de diretor inexistente não vira tela branca', texto.includes('não existe'), texto.slice(0, 80))
}

console.log('\n4. O ORGANOGRAMA DE QUEM CONVOCA QUEM')
await pagina.goto(`${BASE}/#/diretores`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(1400) // deixa a simulação assentar
{
  const nos = await pagina.locator('[data-no-organograma]').count()
  const linhas = await pagina.locator('[data-ligacao]').count()
  ok('o organograma desenhou fichas', nos > 10, `fichas=${nos}`)
  ok('o organograma desenhou ligações', linhas > 10, `ligações=${linhas}`)
  const nan = await pagina.evaluate(() =>
    [...document.querySelectorAll('[data-no-organograma]')].some((g) =>
      (g.getAttribute('transform') || '').includes('NaN'),
    ),
  )
  ok('nenhuma posição virou NaN', !nan)

  // Existencia nao basta: o desenho precisa continuar numa escala visivel.
  const escala = await pagina.evaluate(() => {
    const svg = document.querySelector('svg[role="img"]')
    if (!svg) return null
    const [, , w] = (svg.getAttribute('viewBox') || '').split(' ').map(Number)
    const maiorFicha = Math.max(...[...svg.querySelectorAll('[data-no-organograma] rect')].map((r) => Number(r.getAttribute('width')) || 0))
    return { larguraViewBox: w, maiorFicha, proporcao: maiorFicha / w }
  })
  ok('o viewBox tem tamanho de tela, não de galáxia', escala !== null && escala.larguraViewBox < 6000, `viewBox=${escala?.larguraViewBox}`)
  ok(
    'e a maior ficha ocupa ao menos 1% dela (senão o organograma aparece vazio)',
    escala !== null && escala.proporcao > 0.01,
    `proporção=${escala?.proporcao?.toFixed(4)}`,
  )
  // O ultimo recurso: os nos tem que cair DENTRO do retangulo desenhado.
  const dentro = await pagina.evaluate(() => {
    const svg = document.querySelector('svg[role="img"]')
    const caixa = svg.getBoundingClientRect()
    const nos = [...svg.querySelectorAll('[data-no-organograma] rect')]
    const visiveis = nos.filter((c) => {
      const r = c.getBoundingClientRect()
      return r.width > 1 && r.right > caixa.left && r.left < caixa.right && r.bottom > caixa.top && r.top < caixa.bottom
    })
    return { total: nos.length, visiveis: visiveis.length }
  })
  ok(
    'e os nós caem DENTRO do retângulo desenhado, com pixel de verdade',
    dentro.visiveis > dentro.total * 0.8,
    `visíveis=${dentro.visiveis} de ${dentro.total}`,
  )
  await pagina.locator('[data-no-organograma]').first().click()
  await pagina.waitForTimeout(220)
  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
  ok('clicar num nó mostra quem ele convoca', texto.includes('ele convoca'))
  const cards = await pagina.locator('article').allTextContents()
  ok('Equipo mostra a atividade de 24h nos cards', cards.some((x) => x.toLowerCase().includes('últimas 24h')))
  ok('Equipo não publica caminho codificado de sessão', !texto.includes('home/claude') && !texto.includes('opt/gastaomatos'))
  await pagina.screenshot({ path: `${PROVAS}/v4-organograma.png`, fullPage: true })
}

console.log('\n6. O ESTÚDIO DE CONTEÚDO (a tela que o dono citou de viva voz)')
await pagina.setViewportSize(MESA)
await pagina.goto(`${BASE}/#/estudio`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(600)
{
  const minis = pagina.locator('img[data-miniatura]')
  const quantas = await minis.count()
  ok('a parede mostra miniatura de verdade', quantas > 5, `miniaturas=${quantas}`)

  // Imagem que nao carregou aparece como <img> do mesmo jeito: `naturalWidth`
  // e o unico jeito de saber se o pixel chegou. Sem isto o teste aprovaria uma
  // parede de retangulos quebrados.
  const carregadas = await pagina.evaluate(
    () => [...document.querySelectorAll('img[data-miniatura]')].filter((i) => i.naturalWidth > 0).length,
  )
  ok('e elas CARREGARAM de verdade (naturalWidth > 0)', carregadas > 5, `carregadas=${carregadas} de ${quantas}`)

  // ‼️ O KPI E O INDICE DO QUE ESTA NA TELA. Se ele disser 122 e a parede
  // desenhar 40, a tela mente, e essa e a checagem que pega isso.
  const kpiProntas = await pagina.evaluate(() => {
    const alvo = [...document.querySelectorAll('[data-kpi]')].find((k) =>
      (k.textContent || '').toUpperCase().includes('PRONTAS'),
    )
    return alvo ? Number((alvo.textContent || '').replace(/[^0-9]/g, '').slice(0, 4)) : null
  })
  ok('o KPI "prontas" bate EXATAMENTE com o número de miniaturas', kpiProntas === quantas, `kpi=${kpiProntas} parede=${quantas}`)

  const kpiMesa = await pagina.evaluate(() => {
    const alvo = [...document.querySelectorAll('[data-kpi]')].find((k) =>
      (k.textContent || '').toUpperCase().includes('NA MESA'),
    )
    return alvo ? Number((alvo.textContent || '').replace(/[^0-9]/g, '').slice(0, 2)) : null
  })
  const itensMesa = await pagina.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) =>
      (s.textContent || '').toUpperCase().includes('A MESA'),
    )
    return sec ? sec.querySelectorAll('li').length : -1
  })
  ok('e o KPI "na mesa" bate com os itens da coluna', kpiMesa === itensMesa, `kpi=${kpiMesa} coluna=${itensMesa}`)

  // A miniatura e 3:5 medido, e NAO 9:16 (1,66 contra 1,78). A diferenca esta
  // fora do erro da medicao dela, entao vale conferir o que o navegador pintou.
  const forma = await pagina.evaluate(() => {
    const i = document.querySelector('img[data-miniatura]')
    const r = i.getBoundingClientRect()
    return { w: r.width, h: r.height, razao: r.height / r.width }
  })
  ok('a miniatura sai em 3:5 (1,66), não em 9:16 (1,78)', Math.abs(forma.razao - 1.6667) < 0.06, `razão=${forma.razao.toFixed(3)}`)

  // A miniatura e o SELETOR da tela inteira: trocar troca visor e titulo de
  // saida. Medir isso e o que separa "parede bonita" de "parede que funciona".
  const antes = await pagina.evaluate(() => {
    const s = [...document.querySelectorAll('section')].find((x) => (x.textContent || '').toUpperCase().includes('SAÍDA'))
    return s?.querySelector('h2')?.textContent ?? ''
  })
  await minis.nth(6).click()
  await pagina.waitForTimeout(280)
  const depois = await pagina.evaluate(() => {
    const s = [...document.querySelectorAll('section')].find((x) => (x.textContent || '').toUpperCase().includes('SAÍDA'))
    return s?.querySelector('h2')?.textContent ?? ''
  })
  ok('clicar numa miniatura TROCA o título da coluna de saída', antes !== depois && depois.length > 0, `antes="${antes.slice(0, 28)}" depois="${depois.slice(0, 28)}"`)

  const anel = await pagina.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-pressed="true"]')].find((x) => x.querySelector('img[data-miniatura]'))
    return b ? getComputedStyle(b).boxShadow : null
  })
  ok('e a escolhida ganha o anel de 1px', anel !== null && /1px/.test(anel), `boxShadow=${anel}`)

  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
  ok('o visor explica que a prévia usa a capa', texto.includes('a prévia usa a capa'))
  ok('e a saída declara que não existe botão de publicar', texto.includes('não existe botão de publicar nesta tela'))
  ok('não existe porcentagem inventada a partir de status', !/\b\d{1,3}%/.test(await pagina.evaluate(() => {
    const s = [...document.querySelectorAll('section')].find((x) => (x.textContent || '').toUpperCase().includes('A MESA'))
    // A nota de cobertura explica por que "72%" NÃO é mostrado como dado.
    // O que esta asserção mede são as fichas da mesa, não a documentação ao pé.
    return s?.querySelector('ul')?.innerText ?? ''
  })))

  // A instalação HTTPS já pode estar ativa. A prova não congela a fase antiga:
  // cada botão precisa refletir o estado medido da peça selecionada e do canal.
  const estadoAcoes = await pagina.evaluate(async () => await fetch('/api/estado').then((r) => r.json()))
  const selecionada = await pagina.locator('button[aria-pressed="true"]:has(img[data-miniatura])').getAttribute('aria-label')
  const numeroSelecionado = Number(selecionada?.match(/Peça (\d+):/)?.[1])
  const pecaSelecionada = estadoAcoes.pecas.lista.find((p) => p.n === numeroSelecionado)
  const botoes = await pagina.evaluate(() => {
    const achar = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().toLowerCase() === texto)
    return {
      downloadDesligado: achar('baixar artefato')?.disabled,
      aprovacaoDesligada: achar('enviar para aprovações')?.disabled,
    }
  })
  const esperadoDownload = !estadoAcoes.pecas.acoes_habilitadas || !pecaSelecionada?.artefato_disponivel
  const esperadoAprovacao = !estadoAcoes.pecas.acoes_habilitadas || !pecaSelecionada?.aprovacao_disponivel
  ok(
    'download e Aprovações respeitam HTTPS e disponibilidade da peça selecionada',
    botoes.downloadDesligado === esperadoDownload && botoes.aprovacaoDesligada === esperadoAprovacao,
    `peça=${numeroSelecionado} download=${botoes.downloadDesligado}/${esperadoDownload} aprovação=${botoes.aprovacaoDesligada}/${esperadoAprovacao}`,
  )

  await pagina.screenshot({ path: `${PROVAS}/v14-estudio-operacional-atual.png`, fullPage: true })
}

console.log('\n6B. O COFRE, COM REDE REAL E FICHA INTERATIVA')
await pagina.setViewportSize(MESA)
await pagina.goto(`${BASE}/#/cofre`, { waitUntil: 'networkidle' })
{
  const nos = await pagina.locator('[data-no-cofre]').count()
  const arestas = await pagina.locator('[data-aresta-cofre]').count()
  ok('o Cofre desenha os aprendizados medidos', nos > 1, `nós=${nos}`)
  ok('e só desenha arestas materializadas', arestas > 0, `arestas=${arestas}`)
  // ‼️ A régua era "o aviso de cobertura baixa TEM que estar na tela", e ela
  // reprovava desde que o dado virou aprendizado: a cobertura subiu para 60% e
  // o aviso, corretamente, sumiu. Alarme que só sabe exigir o vermelho fica
  // vermelho pra sempre e a casa aprende a ignorar o painel. O que se mede
  // agora é a CONDIÇÃO, contra o número que veio da API, e ela reprova dos dois
  // lados: aviso presente com cobertura alta também é falha.
  const cobertura = await pagina.evaluate(async () => {
    const estado = await fetch('/api/estado', { cache: 'no-store' }).then((r) => r.json())
    return estado.cofre?.cobertura
  })
  const avisoBaixa = await pagina.locator('[data-cobertura-baixa]').count()
  ok(
    'o aviso de cobertura baixa aparece exatamente quando ela é baixa',
    (cobertura !== null && cobertura < 25) === (avisoBaixa === 1),
    `cobertura=${cobertura} aviso=${avisoBaixa}`,
  )
  const antes = await pagina.locator('[data-ficha-cofre] h2').innerText()
  await pagina.locator('[data-no-cofre]').nth(1).click()
  const depois = await pagina.locator('[data-ficha-cofre] h2').innerText()
  ok('clicar no nó troca a ficha lateral', antes !== depois, `antes=${antes} depois=${depois}`)
  await pagina.screenshot({ path: `${PROVAS}/v5-cofre.png`, fullPage: true })
}

console.log('\n6C. FERRAMENTAS, DISPONIBILIDADE NÃO É FALLBACK')
await pagina.setViewportSize(MESA)
await pagina.goto(`${BASE}/#/tarefas`, { waitUntil: 'networkidle' })
{
  const texto = (await pagina.locator('main').innerText()).toLowerCase()
  const tarefasApi = await pagina.evaluate(async () => {
    const estado = await fetch('/api/estado', { cache: 'no-store' }).then((r) => r.json())
    return {
      totalAbertas: estado.tarefas?.total_abertas,
      emAndamento: estado.tarefas?.por_status?.doing,
    }
  })
  const lerKpi = async (rotulo) => {
    const cartao = pagina.locator('[data-kpi]').filter({ hasText: rotulo }).first()
    const valor = await cartao.locator(':scope > div').nth(1).innerText()
    return Number(valor.replace(/\D/g, ''))
  }
  const totalVisivel = await lerKpi('TAREFAS ABERTAS')
  const andamentoVisivel = await lerKpi('EM ANDAMENTO')
  ok(
    'Tarefas mostra total_abertas e doing vivos, sem chamar a carteira de fila',
    Number.isFinite(tarefasApi.totalAbertas) &&
      Number.isFinite(tarefasApi.emAndamento) &&
      totalVisivel === tarefasApi.totalAbertas &&
      andamentoVisivel === tarefasApi.emAndamento &&
      texto.includes('carteira gtd, não fila de agentes'),
    `tela=${totalVisivel}/${andamentoVisivel} api=${tarefasApi.totalAbertas}/${tarefasApi.emAndamento}`,
  )
  ok('Tarefas destaca andamento e ausência de prazo', texto.includes('em andamento') && texto.includes('sem prazo'))
  ok('Tarefas declara o que o número exclui', texto.includes('concluídas ficam fora'))
}

console.log('\n6D. FERRAMENTAS, DISPONIBILIDADE NÃO É FALLBACK')
await pagina.setViewportSize(MESA)
await pagina.goto(`${BASE}/#/ferramentas`, { waitUntil: 'networkidle' })
{
  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
  ok('a tela separa disponível, fallback e ausente', ['disponíveis', 'fallback', 'ausentes'].every((x) => texto.includes(x)))
  ok('o inventário desenha mais que os três MCPs', await pagina.locator('[data-ferramenta]').count() > 14)
  ok('a tela declara independência do motor e proveniência', texto.includes('independentemente do motor de ia') && texto.includes('fontes:'))
  await pagina.screenshot({ path: `${PROVAS}/v5-ferramentas.png`, fullPage: true })
  await pagina.getByRole('button', { name: 'fallback', exact: true }).click()
  ok('o filtro de fallback deixa somente os caminhos alternativos', await pagina.locator('[data-ferramenta]').count() === 1)
  ok('nenhum caminho local chega à tela', !texto.includes('/opt/') && !texto.includes('/home/'))
}

console.log('\n6D. COBRANÇAS, ZERO REAL NÃO É FALHA DE ACESSO')
await pagina.setViewportSize(MESA)
await pagina.goto(`${BASE}/#/cobrancas`, { waitUntil: 'networkidle' })
{
  const texto = (await pagina.evaluate(() => document.body.innerText)).toLowerCase()
  const pronto = (await pagina.locator('[data-cobrancas-em-dia]').count()) === 1
  const bloqueado = (await pagina.locator('[data-cobrancas-bloqueadas]').count()) === 1
  ok('Cobranças mostra resultado ou bloqueio explícito', pronto !== bloqueado)
  if (pronto) ok('o zero declara que veio da API, não da ausência', texto.includes('o zero veio agora do relatório'))
  ok('a tela não expõe telefone nem caminho local', !/\b55\d{10,11}\b/.test(texto) && !texto.includes('/opt/'))
  await pagina.screenshot({ path: `${PROVAS}/v5-cobrancas.png`, fullPage: true })
}
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/cobrancas`, { waitUntil: 'networkidle' })
{
  const medida = await pagina.evaluate(MEDIR_ESTOURO)
  ok('Cobranças não estoura no celular', medida.doc <= 0 && medida.body <= 0, `doc=${medida.doc} body=${medida.body}`)
  await pagina.screenshot({ path: `${PROVAS}/v5-390-cobrancas.png`, fullPage: true })
}
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/ferramentas`, { waitUntil: 'networkidle' })
{
  const medida = await pagina.evaluate(MEDIR_ESTOURO)
  ok('Ferramentas não estoura no celular', medida.doc <= 0 && medida.body <= 0, `doc=${medida.doc} body=${medida.body}`)
  await pagina.screenshot({ path: `${PROVAS}/v5-390-ferramentas.png`, fullPage: true })
}
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/cofre`, { waitUntil: 'networkidle' })
{
  const medida = await pagina.evaluate(MEDIR_ESTOURO)
  ok('o Cofre não estoura no celular', medida.doc <= 0 && medida.body <= 0, `doc=${medida.doc} body=${medida.body}`)
  await pagina.locator('[data-ficha-cofre]').scrollIntoViewIfNeeded()
  ok('e a ficha continua alcançável abaixo do grafo', await pagina.locator('[data-ficha-cofre]').isVisible())
  await pagina.screenshot({ path: `${PROVAS}/v5-390-cofre.png`, fullPage: true })
}
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/estudio`, { waitUntil: 'networkidle' })
await pagina.waitForTimeout(400)
{
  const medida = await pagina.evaluate(MEDIR_ESTOURO)
  ok('a parede rola dentro da caixa, e não empurra a página', medida.doc <= 0, `doc=${medida.doc}`)
  const rolavel = await pagina.evaluate(() => {
    const c = [...document.querySelectorAll('div')].find((d) => d.scrollWidth > d.clientWidth + 20)
    return c ? c.scrollWidth - c.clientWidth : 0
  })
  ok('e a caixa dela É rolável (a parede não foi cortada)', rolavel > 20, `sobra=${rolavel}`)
  await pagina.screenshot({ path: `${PROVAS}/v12-390-estudio-operacional-bloqueado.png`, fullPage: true })
}

console.log('\n5. A NAVEGAÇÃO NO CELULAR (sem ela, o menu simplesmente não existe lá)')
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/comando`, { waitUntil: 'networkidle' })
{
  const corpo = await pagina.locator('body').innerText()
  ok('o Centro mostra carteira aberta, não fila de agentes', corpo.includes('TAREFAS ABERTAS NO GTD'))
  ok('o Centro traz o CRM agregado como fonte lida', corpo.includes('REGISTROS NO CRM') && corpo.toLowerCase().includes('crm agregado'))
  ok('o Centro traz o follow-up sem chamar etapa consumida de envio', corpo.includes('FOLLOW-UPS ENVIADOS') && corpo.includes('envio registrado, não resposta'))
  ok('o Centro mantém resultado das chamadas fora da cobertura', corpo.includes('resultado de chamadas'))
  ok('ausência externa não aparece como zero', corpo.includes('FORA DA COBERTURA, NÃO É ZERO'))
  ok('a cobertura de fontes fica colada ao resumo', await pagina.locator('[data-cobertura-comando]').isVisible())
  await pagina.screenshot({ path: `${PROVAS}/v6-390-comando.png`, fullPage: true })
  // A gaveta tem seletor PROPRIO: a barra lateral de mesa existe no DOM em
  // 390px, so escondida, e `.first()` pegava ela. O teste media o elemento
  // errado e reprovava uma gaveta que estava aberta na tela.
  const gaveta = pagina.locator('aside[data-gaveta]')
  ok('a gaveta começa fechada', (await gaveta.count()) === 0)
  ok(
    'a barra lateral de mesa fica escondida no celular',
    !(await pagina.locator('nav[aria-label="telas do painel"]').first().isVisible()),
  )
  await pagina.getByLabel('abrir o menu das doze telas').click()
  await pagina.waitForTimeout(200)
  ok('o botão abre a gaveta', await gaveta.isVisible())
  const medida = await pagina.evaluate(MEDIR_ESTOURO)
  ok('e a gaveta aberta não cria rolagem horizontal', medida.doc <= 0, `doc=${medida.doc}`)
  await pagina.screenshot({ path: `${PROVAS}/v3-390-gaveta.png` })
  await gaveta.locator('button').filter({ hasText: 'Biblioteca' }).first().click()
  await pagina.waitForTimeout(280)
  const texto = await pagina.evaluate(() => document.body.innerText)
  ok('clicar no menu navega e FECHA a gaveta', texto.includes('Biblioteca.'))
  ok('e a gaveta some depois de navegar', (await gaveta.count()) === 0)
}

console.log('\n5B. A AGENDA JUNTA AUTOMAÇÃO E CONTEÚDO SEM INVENTAR REUNIÃO')
await pagina.goto(`${BASE}/#/agenda`, { waitUntil: 'networkidle' })
{
  const corpo = await pagina.locator('body').innerText()
  ok('a agenda mostra publicações programadas do posts.json', await pagina.locator('[data-agenda-publicacoes]').isVisible() && corpo.includes('PUBLICAÇÕES PROGRAMADAS'))
  ok('a agenda mostra o snapshot agregado do calendário', await pagina.locator('[data-agenda-calendario]').isVisible() && corpo.includes('38') && corpo.includes('15'))
  ok('o calendário não expõe dados pessoais', !/Telefone:|Cláudia|Vieiralves|Nilza|Marcos|El Horno|google\.com\/calendar/i.test(corpo))
  ok('agendamento não é chamado de reunião ocorrida', corpo.includes('sem prova de presença') && corpo.includes('reunião ocorrida só contará'))
  await pagina.screenshot({ path: `${PROVAS}/v11-390-agenda-calendar.png`, fullPage: true })
  await pagina.locator('[data-agenda-calendario]').screenshot({ path: `${PROVAS}/v11-agenda-calendar-detalhe.png` })
}

console.log('\n5C. APROVAÇÕES COMEÇA VAZIA E NÃO EXECUTA AÇÃO')
await pagina.goto(`${BASE}/#/aprovacoes`, { waitUntil: 'networkidle' })
{
  const corpo = await pagina.locator('body').innerText()
  ok('a fila vazia é medida, não ausência de fonte', corpo.includes('A fila foi lida e está vazia'))
  ok('não existe botão de aprovar ou publicar', await pagina.locator('button').filter({ hasText: /aprovar|publicar/i }).count() === 0)
  ok('a separação entre registro e publicação fica visível', corpo.includes('Registrar “aprovado” só muda a fila'))
  await pagina.screenshot({ path: `${PROVAS}/v8-390-aprovacoes-vazia.png`, fullPage: true })
}

console.log('\n5D. ANALÍTICA ISOLA A MARCA E NÃO INVENTA INSIGHT')
await pagina.goto(`${BASE}/#/analitica`, { waitUntil: 'networkidle' })
{
  const corpo = await pagina.locator('body').innerText()
  ok('a falta de insights da Meta fica explícita', corpo.includes('ADAPTADOR BLOQUEADO') && corpo.includes('não há conector de insights orgânicos'))
  ok('links são chamados de cobertura, não desempenho', corpo.includes('chave potencial, não métrica'))
  ok('a marca própria fica isolada das demais', corpo.includes('somente marca gastaomatos') && corpo.includes('misturá-los produziria uma analítica falsa'))
  await pagina.screenshot({ path: `${PROVAS}/v9-390-analitica.png`, fullPage: true })
}

console.log('\n6E. DEPARTAMENTO E SOP, DA OPERAÇÃO ATÉ O AGENTE')
await pagina.setViewportSize(MESA)
await pagina.goto(`${BASE}/#/diretores`, { waitUntil: 'networkidle' })
{
  ok('a rede oferece navegação por departamento', await pagina.locator('[data-departamentos]').isVisible())
  await pagina.getByRole('button', { name: /Squad de conteúdo/i }).click()
  const mapa = pagina.locator('[data-operacoes-departamento]')
  ok('o departamento abre seu mapa operacional', await mapa.isVisible())
  ok('o mapa mostra somente SOPs materializados', await mapa.locator('[data-sop]').count() > 0)
  ok('a autonomia não é promovida a execução livre', (await mapa.innerText()).toLowerCase().includes('humano decide'))
  await pagina.screenshot({ path: `${PROVAS}/v13-equipo-departamento-desktop.png`, fullPage: true })
  await mapa.getByRole('button', { name: /abrir guardiao/i }).first().click()
  await pagina.waitForTimeout(180)
  const contrato = pagina.locator('[data-contrato-operacional]')
  ok('a operação leva à ficha do agente ligado', await contrato.isVisible())
  const textoFicha = await contrato.innerText()
  ok('a ficha mostra entrada, saída, autonomia e ferramentas', ['ENTRADA', 'SAÍDA', 'FRONTEIRA DE AUTONOMIA', 'FERRAMENTAS DO FLUXO'].every((texto) => textoFicha.includes(texto)))
  ok('o SOP da ficha conserva a fonte rastreável', /fontes? rastreáve/i.test(await contrato.innerText()))
  await pagina.screenshot({ path: `${PROVAS}/v13-ficha-sop-desktop.png`, fullPage: true })
}
await pagina.setViewportSize(CELULAR)
await pagina.goto(`${BASE}/#/diretores/guardiao`, { waitUntil: 'networkidle' })
{
  const medida = await pagina.evaluate(MEDIR_ESTOURO)
  ok('a ficha operacional não estoura no celular', medida.doc <= 0 && medida.body <= 0, `doc=${medida.doc} body=${medida.body}`)
  ok('o contrato operacional continua alcançável no celular', await pagina.locator('[data-contrato-operacional]').isVisible())
  const larguraTextoSop = await pagina.locator('[data-sop-texto]').first().evaluate((elemento) => elemento.getBoundingClientRect().width)
  ok('o título do SOP conserva largura útil no celular', larguraTextoSop >= 260, `largura=${larguraTextoSop}px`)
  await pagina.screenshot({ path: `${PROVAS}/v13-390-ficha-sop.png`, fullPage: true })
}

console.log('\n7. O CONSOLE FICOU LIMPO?')
ok('nenhuma exceção de JavaScript', excecoes.length === 0, excecoes.slice(0, 3).join(' | '))
// ERR_ABORTED e ERR_EMPTY_RESPONSE aparecem quando o roteiro navega com uma
// requisicao no ar: e ruido do teste, nao do painel. Reprovar por eles fazia o
// roteiro reprovar por causa de si mesmo. O resto continua reprovando.
const rederuim = rede.filter((f) => !/ERR_ABORTED|ERR_EMPTY_RESPONSE/.test(f))
ok('nenhuma falha de rede que não seja navegação cancelada', rederuim.length === 0, rederuim.slice(0, 3).join(' | '))
if (rede.length !== rederuim.length) {
  console.log(`  nota  ${rede.length - rederuim.length} requisição(ões) cancelada(s) pela navegação do próprio roteiro`)
}

await navegador.close()
console.log(`\n${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
