// Prova em navegador real do pacote V8 (sprites + retenção de saída).
// Uso: node scripts/prova-office-v8.mjs <pasta-de-saida>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PASTA_SAIDA = process.argv[2] || '/opt/gastaomatos/luana/painel_os/provas/office-v8-sprites-20261014'
const BASE_URL = 'http://127.0.0.1:5199'
const [usuario, senha] = readFileSync('/opt/gastaomatos/luana/.painel_os.credencial', 'utf-8').trim().split(':')

mkdirSync(PASTA_SAIDA, { recursive: true })

// Payload mínimo e determinístico: 1 agente "humano" (dev, robô) digitando e
// 1 agente parado, que troca de papel na 2ª consulta da sonda (poll a cada
// 10s). Isto cobre as duas transições que a matriz de aceite pede no mesmo
// clipe: `trabalhando -> parado` (levanta e caminha pra fora) e
// `parado -> trabalhando` (entra, caminha, senta, digita).
function payloadSonda(fase) {
  const base = (id, estado, ferramenta) => ({
    id, nome: id, identidade: id, dono: null, tipo: 'agente',
    estado, fase: 'execução', etapa: `demo prova office-v8 (${fase})`,
    ferramenta, silencio_s: estado === 'silencioso' ? 4 : null,
  })
  const agentes = fase === 'inicial'
    ? [base('exec-demo-digitando', 'trabalhando', 'Write'), base('exec-demo-saindo', 'trabalhando', 'Bash')]
    : [base('exec-demo-digitando', 'parado', null), base('exec-demo-saindo', 'parado', null)]
  return {
    ok: true,
    motivo: 'demo-prova-office-v8',
    contagem: {
      trabalhando: agentes.filter((a) => a.estado === 'trabalhando').length,
      silencioso: 0,
      parado: agentes.filter((a) => a.estado === 'parado').length,
    },
    agentes,
    avisos: [],
  }
}

async function instalarRotaDaSonda(context) {
  let chamada = 0
  await context.route('**/api/agentes-vivos', async (route) => {
    chamada += 1
    // 1ª chamada: os dois digitando. Da 2ª em diante: os dois parados (dispara
    // a saída: levantar -> caminhar -> some). Isto reproduz ao vivo, com a
    // sonda real do servidor substituída, a transição que o bug de ocultação
    // apagava sem o quadro de saída aparecer.
    const corpo = payloadSonda(chamada === 1 ? 'inicial' : 'saida')
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) })
  })
}

async function gravar({ nome, largura, altura, duracaoMs }) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    httpCredentials: { username: usuario, password: senha },
    viewport: { width: largura, height: altura },
    recordVideo: { dir: join(PASTA_SAIDA, `_video-${nome}`), size: { width: largura, height: altura } },
  })
  await instalarRotaDaSonda(context)
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/#/tarefas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="pixel-office"]', { timeout: 20000 })
  // Garante que o canvas do renderer V8 está de pé antes de começar a contar
  // o tempo do clipe (achado "troca de quadro visível": precisa do quadro 1
  // desenhado antes de medir).
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-testid="pixel-office"] canvas')
    return Boolean(canvas && canvas.dataset.officeRenderer === 'ct-modular-v8')
  }, { timeout: 20000 })
  await page.screenshot({ path: join(PASTA_SAIDA, `${nome}-t0-inicial.png`) })
  await page.waitForTimeout(duracaoMs)
  await page.screenshot({ path: join(PASTA_SAIDA, `${nome}-tN-final.png`) })
  const caminhoVideo = await page.video()?.path()
  await context.close()
  await browser.close()
  if (caminhoVideo) {
    const destino = join(PASTA_SAIDA, `${nome}.webm`)
    renameSync(caminhoVideo, destino)
    try { readdirSync(join(PASTA_SAIDA, `_video-${nome}`)).length } catch { /* pasta pode já estar vazia */ }
    console.log(`vídeo: ${destino}`)
  }
}

async function provaReduzirMovimento() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    httpCredentials: { username: usuario, password: senha },
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  await instalarRotaDaSonda(context)
  const page = await context.newPage()
  await page.goto(`${BASE_URL}/#/tarefas`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="pixel-office"]', { timeout: 20000 })
  await page.waitForTimeout(1500)
  const p1 = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="pixel-office"] canvas')
    return { x: c?.dataset.officeDigitando, caminhando: c?.dataset.officeCaminhando }
  })
  await page.waitForTimeout(2000)
  const p2 = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="pixel-office"] canvas')
    return { x: c?.dataset.officeDigitando, caminhando: c?.dataset.officeCaminhando }
  })
  await page.screenshot({ path: join(PASTA_SAIDA, 'reduzir-movimento-1440x900.png') })
  await context.close()
  await browser.close()
  console.log('reduzir-movimento: caminhando antes=', p1.caminhando, 'depois=', p2.caminhando)
}

await gravar({ nome: 'desktop-1440x900', largura: 1440, altura: 900, duracaoMs: 16000 })
await gravar({ nome: 'mobile-390x844', largura: 390, altura: 844, duracaoMs: 16000 })
await provaReduzirMovimento()
console.log('OK — provas salvas em', PASTA_SAIDA)
