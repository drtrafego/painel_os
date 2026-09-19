/**
 * Regressão visual do tema AutonomIA e do contrato novo de tarefas.
 *
 * O servidor público bloqueia iframe por X-Frame-Options/CSP. A interceptação
 * abaixo remove esses dois headers SOMENTE dentro deste navegador de teste,
 * para cumprir a conferência de layout dentro de iframe sem enfraquecer o
 * servidor real. Todo o restante, inclusive bundle, fontes e API, vem da 5199.
 */
import { chromium } from '/opt/gastaomatos/gabinete-mcp/node_modules/playwright/index.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:5199'
const PROVAS = '/opt/gastaomatos/luana/painel_os/provas'
const CELULAR = { width: 390, height: 844 }
const MESA = { width: 1440, height: 900 }

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
  throw new Error('não achei navegador nesta máquina')
}

function credencial() {
  const bruto = readFileSync('/opt/gastaomatos/luana/.painel_os.credencial', 'utf8')
  const linha = bruto.split('\n').find((l) => l.trim() && !l.trim().startsWith('#'))
  if (!linha) throw new Error('credencial do painel vazia')
  const i = linha.indexOf(':')
  return { username: linha.slice(0, i).trim(), password: linha.slice(i + 1).trim() }
}

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

const navegador = await chromium.launch({ executablePath: acharNavegador() })

for (const [nome, viewport] of [['celular 390x844', CELULAR], ['mesa 1440x900', MESA]]) {
  console.log(`\nAUTONOMIA NO IFRAME, ${nome.toUpperCase()}`)
  const ctx = await navegador.newContext({ httpCredentials: credencial(), viewport })
  const excecoes = []
  const falhasRede = []
  let tarefasEsperadas = null

  // Mantém a proteção do servidor real. Só a resposta de navegação desta
  // execução é reempacotada para o iframe de teste conseguir carregá-la.
  await ctx.route(`${BASE}/`, async (rota) => {
    const resposta = await rota.fetch()
    const headers = { ...resposta.headers() }
    delete headers['x-frame-options']
    delete headers['content-security-policy']
    await rota.fulfill({ response: resposta, headers })
  })

  // Reproduz exatamente o caso da foto: o contrato novo não traz `total`.
  // O número canônico é `total_abertas`; remover o legado não pode derrubar a tela.
  await ctx.route(`${BASE}/api/estado`, async (rota) => {
    const resposta = await rota.fetch()
    const estado = await resposta.json()
    if (!estado.tarefas || typeof estado.tarefas.total_abertas !== 'number' || typeof estado.tarefas.por_status?.doing !== 'number') {
      throw new Error('a API não trouxe total_abertas e por_status.doing numéricos')
    }
    tarefasEsperadas = {
      totalAbertas: estado.tarefas.total_abertas,
      emAndamento: estado.tarefas.por_status.doing,
    }
    delete estado.tarefas.total
    estado.calculado_ao_abrir = true
    estado.coleta_em_andamento = false
    delete estado.erro_coletor
    await rota.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(estado) })
  })

  await ctx.route('http://painel-teste.local/', async (rota) => {
    await rota.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe id="painel" title="Painel OS" src="${BASE}/#/tarefas"></iframe></body></html>`,
    })
  })

  const pagina = await ctx.newPage()
  pagina.on('pageerror', (e) => excecoes.push(String(e)))
  pagina.on('requestfailed', (r) => falhasRede.push(`${r.failure()?.errorText} ${r.url()}`))
  await pagina.goto('http://painel-teste.local/', { waitUntil: 'networkidle' })
  const frame = pagina.frameLocator('#painel')
  await frame.getByRole('heading', { name: 'Tarefas.' }).waitFor()

  const corpo = await frame.locator('body').innerText()
  ok(`${nome}: o contrato sem tarefas.total não vira o erro da foto`, !corpo.includes('O painel não vai mostrar esses números.'))
  const lerValorKpi = async (rotulo) => {
    const cartao = frame.locator('[data-kpi]').filter({ hasText: rotulo }).first()
    const texto = await cartao.locator(':scope > div').nth(1).innerText()
    return Number(texto.replace(/\D/g, ''))
  }
  const totalVisivel = await lerValorKpi('TAREFAS ABERTAS')
  const andamentoVisivel = await lerValorKpi('EM ANDAMENTO')
  ok(
    `${nome}: total_abertas e doing visíveis batem com a resposta viva`,
    tarefasEsperadas !== null &&
      totalVisivel === tarefasEsperadas.totalAbertas &&
      andamentoVisivel === tarefasEsperadas.emAndamento,
    `tela=${totalVisivel}/${andamentoVisivel} api=${tarefasEsperadas?.totalAbertas}/${tarefasEsperadas?.emAndamento}`,
  )

  const tema = await frame.locator('body').evaluate((body) => {
    const titulo = document.querySelector('h1')
    const rotulo = document.querySelector('.rotulo')
    const cartao = document.querySelector('[data-kpi]')
    return {
      fundo: getComputedStyle(body).backgroundColor,
      tinta: getComputedStyle(body).color,
      titulo: titulo ? getComputedStyle(titulo).fontFamily : '',
      texto: getComputedStyle(body).fontFamily,
      mono: rotulo ? getComputedStyle(rotulo).fontFamily : '',
      carta: cartao ? getComputedStyle(cartao).backgroundColor : '',
      estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  ok(`${nome}: o fundo mestre é o Creme oficial`, tema.fundo === 'rgb(247, 241, 230)', tema.fundo)
  ok(`${nome}: a tinta é a Sépia oficial`, tema.tinta === 'rgb(26, 20, 16)', tema.tinta)
  ok(`${nome}: a superfície é o Creme Alto oficial`, tema.carta === 'rgb(253, 250, 243)', tema.carta)
  ok(`${nome}: Archivo, Inter e JetBrains Mono carregaram`, /Archivo/.test(tema.titulo) && /Inter/.test(tema.texto) && /JetBrains Mono/.test(tema.mono), JSON.stringify(tema))
  ok(`${nome}: não há estouro horizontal`, tema.estouro <= 0, `estouro=${tema.estouro}`)
  ok(`${nome}: nenhuma exceção de JavaScript`, excecoes.length === 0, excecoes.slice(0, 2).join(' | '))
  ok(`${nome}: nenhuma falha de rede`, falhasRede.length === 0, falhasRede.slice(0, 2).join(' | '))

  await pagina.screenshot({
    path: `${PROVAS}/v14-autonomia-${viewport === CELULAR ? '390' : 'desktop'}-iframe.png`,
    fullPage: true,
  })
  await ctx.close()
}

await navegador.close()
console.log(`\n${passou} passaram, ${falhou} falharam`)
process.exit(falhou > 0 ? 1 : 0)
