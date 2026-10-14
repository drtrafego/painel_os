// Prova rápida e separada: confirma visualmente que os sprites humanos reais
// (Luana/Renato/Bia) renderizam na cena, não só o robô genérico.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PASTA_SAIDA = process.argv[2] || '/opt/gastaomatos/luana/painel_os/provas/office-v8-sprites-20261014'
const BASE_URL = 'http://127.0.0.1:5199'
const [usuario, senha] = readFileSync('/opt/gastaomatos/luana/.painel_os.credencial', 'utf-8').trim().split(':')
mkdirSync(PASTA_SAIDA, { recursive: true })

function payload() {
  const agente = (id, estado, ferramenta) => ({
    id, nome: id, identidade: id, dono: id, tipo: 'sessao_claude',
    estado, fase: 'sessao_viva', etapa: `prova humanos (${id})`, ferramenta,
  })
  const agentes = [
    agente('luana', 'trabalhando', 'Write'),
    agente('renato', 'trabalhando', 'Bash'),
    agente('bia', 'trabalhando', 'Read'),
  ]
  return {
    ok: true, motivo: 'demo-prova-humanos',
    contagem: { trabalhando: 3, silencioso: 0, parado: 0 },
    agentes, avisos: [],
  }
}

const browser = await chromium.launch()
const context = await browser.newContext({
  httpCredentials: { username: usuario, password: senha },
  viewport: { width: 1600, height: 1000 },
})
await context.route('**/api/agentes-vivos', async (route) => {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload()) })
})
const page = await context.newPage()
await page.goto(`${BASE_URL}/#/tarefas`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="pixel-office"]', { timeout: 20000 })
await page.waitForFunction(() => {
  const c = document.querySelector('[data-testid="pixel-office"] canvas')
  return Boolean(c && c.dataset.officeRenderer === 'ct-modular-v8')
}, { timeout: 20000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: join(PASTA_SAIDA, 'humanos-luana-renato-bia-digitando.png') })
await context.close()
await browser.close()
console.log('OK — screenshot de humanos salva')
