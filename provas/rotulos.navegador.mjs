/**
 * OS QUATRO ROTULOS QUE O PAINEL ESTAVA ERRANDO, NA TELA DE VERDADE.
 *
 * Rodar (com o servidor de pe na 5199):
 *   node /opt/gastaomatos/luana/painel_os/provas/rotulos.navegador.mjs antes
 *   node /opt/gastaomatos/luana/painel_os/provas/rotulos.navegador.mjs depois
 *
 * O argumento so nomeia os arquivos: o roteiro e o mesmo nos dois lados, senao
 * a comparacao seria entre dois instrumentos e nao entre dois estados.
 *
 * ‼️ O QUE ELE MEDE E O TEXTO QUE APARECE, nao o campo do JSON. Rotulo errado
 * com dado certo e exatamente o defeito que ele veio pegar: se a sonda lesse o
 * dado, ela aprovaria as quatro telas nos dois lados.
 *
 * A credencial vem do MESMO arquivo que o servidor le, e nunca e impressa.
 */
import { chromium } from '/opt/gastaomatos/gabinete-mcp/node_modules/playwright/index.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

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
  throw new Error('nenhum chromium encontrado nesta maquina')
}

function credencial() {
  const bruto = readFileSync('/opt/gastaomatos/luana/.painel_os.credencial', 'utf8')
  const linha = bruto.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
  if (!linha) throw new Error('credencial vazia')
  const corte = linha.indexOf(':')
  return { username: linha.slice(0, corte), password: linha.slice(corte + 1) }
}

const lado = process.argv[2] === 'depois' ? 'depois' : 'antes'
const BASE = process.env.PAINEL_BASE || 'http://127.0.0.1:5199'
const PROVAS = '/opt/gastaomatos/luana/painel_os/provas'
const MESA = { width: 1440, height: 980 }

const navegador = await chromium.launch({ executablePath: acharNavegador() })
const contexto = await navegador.newContext({ viewport: MESA, httpCredentials: credencial() })
const pagina = await contexto.newPage()
const achados = {}

async function ir(rota) {
  await pagina.goto(`${BASE}/#/${rota}`, { waitUntil: 'networkidle' })
  await pagina.waitForTimeout(700)
}

// 1. A BOLINHA DA BARRA LATERAL E O CARTAO DO "PARA ONDE IR".
await ir('comando')
achados.sidebar = await pagina.$$eval('nav[aria-label="telas do painel"] button', (bs) =>
  bs.map((b) => ({
    nome: b.querySelector('span.truncate')?.textContent?.trim(),
    sinal: b.querySelector('span[title]')?.getAttribute('title'),
  })),
)
achados.paraOndeIr = await pagina.$$eval('[data-vista-atalho], section:last-of-type button.carta', (bs) =>
  bs.map((b) => {
    const l = b.querySelectorAll('span.block')
    return { nome: l[0]?.textContent?.trim(), rotulo: l[1]?.textContent?.trim() }
  }),
)
await pagina.screenshot({ path: `${PROVAS}/rotulo-1-${lado}-comando.png` })

// 3. O CARTAO DA DIRETIVA, na mesma tela.
achados.diretiva = await pagina.$eval('[data-diretiva], [data-diretiva-atual]', (n) => ({
  atributo: n.dataset.diretiva ?? 'atual (atributo velho)',
  texto: n.innerText.replace(/\s+/g, ' ').trim(),
})).catch(() => ({ atributo: 'AUSENTE', texto: '' }))
const cartao = await pagina.$('[data-diretiva], [data-diretiva-atual]')
if (cartao) await cartao.screenshot({ path: `${PROVAS}/rotulo-3-${lado}-diretiva.png` })

// 4. O ROTULO DE ATIVIDADE dos agentes, na tela de diretores.
await ir('diretores')
// ‼️ SEM CAIXA: a pilula usa `text-transform: uppercase` e o innerText devolve
// o texto JA TRANSFORMADO. Procurar minusculo aqui devolveria zero em qualquer
// dos dois lados, e zero de instrumento passaria por zero de ocorrencia.
achados.atividade = await pagina.evaluate(() => {
  const texto = document.body.innerText.toLowerCase()
  const conta = (frase) => texto.split(frase).length - 1
  return {
    'ativo hoje': conta('ativo hoje'),
    'ativo nas ultimas 24h': conta('ativo nas últimas 24h'),
    'na bancada nas ultimas 24h': conta('na bancada nas últimas 24h'),
  }
})
await pagina.screenshot({ path: `${PROVAS}/rotulo-4-${lado}-diretores.png` })

// 2. O NUMERO "retornos registrados" na ficha de um agente muito convocado.
const alvo = JSON.parse(readFileSync('/opt/gastaomatos/luana/painel_os/web/src/dados/estado.json', 'utf8'))
  .agentes.slice().sort((a, b) => (b.convocacoes ?? 0) - (a.convocacoes ?? 0))[0]
await ir(`diretores/${encodeURIComponent(alvo.id)}`)
achados.retornos = await pagina.$eval('[data-registros-agente]', (n) => n.innerText.replace(/\s+/g, ' ').trim())
  .catch(() => 'AUSENTE')
achados.retornosAgente = alvo.id
const ficha = await pagina.$('[data-registros-agente]')
if (ficha) await ficha.screenshot({ path: `${PROVAS}/rotulo-2-${lado}-retornos.png` })
await pagina.screenshot({ path: `${PROVAS}/rotulo-2-${lado}-ficha.png` })

console.log(JSON.stringify(achados, null, 2))
await navegador.close()
