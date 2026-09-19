/**
 * OS TRES ESTADOS DO MOTOR, NA TELA DE VERDADE.
 *
 * Rodar (com o servidor de pe na 5199):
 *   node /opt/gastaomatos/luana/painel_os/provas/motores.navegador.mjs
 *
 * O QUE E REAL E O QUE E INJETADO, para ninguem ler prova a mais do que ela
 * vale:
 *
 *   REAL      o navegador, o React construido, o servidor na 5199, a
 *             autenticacao, e o primeiro caso ("um ativo"), que vem do
 *             systemd desta maquina sem ninguem tocar em nada.
 *   INJETADO  os outros tres casos. Esta conta nao tem sudo, e parar o
 *             `luana-claude.service` para tirar um print derrubaria a conversa
 *             do Gastao. Entao a resposta de `/api/estado` e interceptada e o
 *             bloco `motores` e trocado. O resto da pagina continua real.
 *
 * ‼️ ELE COMECA PROVANDO QUE SABE REPROVAR: antes de medir qualquer tela, o
 * roteiro injeta um estado que DEVE falhar e exige ver a falha. Sem isso um
 * detector quebrado devolveria "tudo certo" para sempre.
 *
 * O caso que mais importa e o de DOIS ATIVOS: ele tem que sair vermelho. Duas
 * sessoes no mesmo bot do Telegram dao erro 409 e o bot fica mudo, entao dois
 * no ar nunca e verde dobrado.
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

const BASE = 'http://127.0.0.1:5199'
const PROVAS = '/opt/gastaomatos/luana/painel_os/provas'
const MESA = { width: 1440, height: 900 }

/**
 * ‼️ COMPARACAO SEM CAIXA, E O MOTIVO E MEDIDO: a pilula e o rotulo do painel
 * usam `text-transform: uppercase`, e `innerText` devolve o texto JA
 * TRANSFORMADO pelo CSS. A tela mostra `CLAUDE CODE`, nao `Claude Code`. A
 * primeira versao deste roteiro procurava a forma do dado e reprovou quatro
 * telas que estavam certas. O painel estava certo; o instrumento e que lia
 * outra coisa.
 */
function contem(corpo, texto) {
  return corpo.toLowerCase().includes(texto.toLowerCase())
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
const ctx = await navegador.newContext({ httpCredentials: credencial(), viewport: MESA })
const pagina = await ctx.newPage()

/** Troca o bloco `motores` da Luana na resposta da API, sem tocar no systemd. */
async function injetar(transformar) {
  await pagina.unrouteAll({ behavior: 'ignoreErrors' })
  // ‼️ A ROTA FICA SEMPRE REGISTRADA, inclusive no caso real (`transformar`
  // nulo). Removendo a rota, o navegador servia a resposta ANTERIOR do cache e
  // o caso seguinte media o estado do caso anterior: dois casos diferentes
  // liam a mesma tela e um deles ficava verde por engano.
  await pagina.route('**/api/estado*', async (rota) => {
    const resposta = await rota.fetch()
    const corpo = await resposta.json()
    if (transformar) for (const s of corpo.sessao ?? []) transformar(s)
    await rota.fulfill({
      response: resposta,
      headers: { ...resposta.headers(), 'cache-control': 'no-store' },
      body: JSON.stringify(corpo),
    })
  })
}

/**
 * ‼️ A QUERY COM CONTADOR NAO E ENFEITE. Trocar so o `#/rota` NAO recarrega uma
 * SPA: o navegador muda o hash, o React troca de tela e ninguem refaz o
 * `/api/estado`. As primeiras rodadas deste roteiro mediram o estado injetado
 * no PRIMEIRO caso em todos os casos seguintes, e teriam aprovado ou reprovado
 * telas que nunca foram desenhadas. Cada caso abre uma URL diferente, o que
 * obriga uma carga nova de verdade.
 */
let carga = 0
async function abrir(rota, esperar = null) {
  carga += 1
  await pagina.goto(`${BASE}/?prova=${carga}#/${rota}`, { waitUntil: 'networkidle' })
  // O servidor pode devolver o snapshot anterior enquanto recoleta, e o front
  // faz polling ate o definitivo. Dormir um tempo fixo mede o que der; esperar
  // pelo texto mede a tela pronta, e estoura o prazo em vez de aprovar cedo.
  if (esperar) {
    await pagina
      .waitForFunction(
        (t) => document.body.innerText.toLowerCase().includes(t.toLowerCase()),
        esperar,
        // A coleta do painel leva ~33s e o front faz polling ate o snapshot
        // definitivo. 20s expirava ANTES da tela ficar pronta, e a falha era do
        // prazo, nao da tela.
        { timeout: 60000 },
      )
      .catch(() => {})
  } else {
    await pagina.waitForTimeout(600)
  }
  return pagina.locator('body').innerText()
}

// ---------------------------------------------------------------------------
// A tela dos cartoes de comando e `diretores`, nao `comando`: foi la que o
// CardComando ficou. A primeira versao deste roteiro media `comando` e
// reprovava tudo, com o painel certo. Instrumento apontado para o alvo errado.
console.log('\n0. O INSTRUMENTO SABE REPROVAR?')
{
  await injetar((s) => {
    s.motores = {
      situacao: 'um_ativo', motivo: null, motor: 'MOTOR-DE-MENTIRA',
      ativos: ['x.service'],
      servicos: [{ service: 'x.service', existe: true, estado: 'active', ativo: true, motor: 'MOTOR-DE-MENTIRA', motor_fonte: 'injetado' }],
    }
  })
  const corpo = await abrir('diretores', 'MOTOR-DE-MENTIRA')
  // Se a tela NAO mostrar o texto injetado, o roteiro esta olhando outro lugar
  // e todo resto deste arquivo seria verde por nao medir nada.
  ok('a tela reflete o que a API devolve (senao este roteiro nao mede nada)', contem(corpo, 'MOTOR-DE-MENTIRA'), corpo.slice(0, 160))
  const controle = contem(corpo, 'ESTE-TEXTO-NAO-EXISTE-NA-TELA')
  ok('e o detector reprova um texto ausente', controle === false)
}

// ---------------------------------------------------------------------------
console.log('\n1. UM ATIVO (dado REAL do systemd desta maquina)')
{
  await injetar(null)
  const corpo = await abrir('diretores', 'Claude Code')
  ok('o painel diz o MOTOR, nao so "ativo"', contem(corpo, 'Claude Code'), corpo.slice(0, 200))
  ok('e nao mostra mais o cru do systemctl', !contem(corpo, 'serviço active'))
  // O contraste que prova a cor: no caso normal o mesmo elemento NAO e vermelho.
  ok('e o cartao nao mostra faixa de conflito', await pagina.locator('[data-motor-conflito]').count() === 0)
  ok('o tom do motor e verde, nao vermelho',
    await pagina.locator('[data-motor]').first().getAttribute('data-motor-tom') === 'verde')
  await pagina.screenshot({ path: `${PROVAS}/motores-1-um-ativo-real.png`, fullPage: false })

  const ficha = await abrir('diretores/luana', 'luana-claude.service')
  ok('a ficha lista os DOIS services do agente',
    contem(ficha, 'luana-claude.service') && contem(ficha, 'luana.service'), ficha.slice(0, 300))
  ok('e diz qual esta no ar', contem(ficha, 'no ar'))
  ok('e diz o motor do que esta PARADO, que e a alternativa dele', contem(ficha, 'Codex'))
  await pagina.screenshot({ path: `${PROVAS}/motores-1-ficha-real.png`, fullPage: false })
}

// ---------------------------------------------------------------------------
console.log('\n2. DOIS ATIVOS AO MESMO TEMPO (injetado) - TEM QUE FICAR VERMELHO')
{
  await injetar((s) => {
    s.motores = {
      situacao: 'varios_ativos',
      motivo: '2 services do mesmo agente estão no ar ao mesmo tempo: luana-claude.service, luana.service. Duas sessões no mesmo bot do Telegram dão erro 409 e o bot fica mudo.',
      motor: null,
      ativos: ['luana-claude.service', 'luana.service'],
      servicos: [
        { service: 'luana-claude.service', existe: true, estado: 'active', ativo: true, motor: 'Claude Code', motor_fonte: 'processo em execução' },
        { service: 'luana.service', existe: true, estado: 'active', ativo: true, motor: 'Codex', motor_fonte: 'processo em execução' },
      ],
    }
  })
  const corpo = await abrir('diretores', 'conflito')
  ok('a tela chama de CONFLITO, nao de "2 no ar"', contem(corpo, 'conflito: 2 no ar'), corpo.slice(0, 200))
  ok('NAO elege um motor vencedor', !contem(corpo, 'motor Claude Code'))
  // ‼️ A COR SE MEDE NO ELEMENTO DO MOTOR, NUNCA NA PAGINA. A primeira versao
  // contava `.text-vermelho` da pagina inteira e passava: o numero de
  // checagens reprovadas do verificador JA e vermelho, entao o teste ficava
  // verde mesmo com o motor pintado de cinza. Instrumento medindo outra coisa.
  const corDoMotor = await pagina.locator('[data-motor] span').first().evaluate(
    (el) => getComputedStyle(el).color,
  )
  const corVermelha = await pagina.evaluate(() => {
    const p = document.createElement('span')
    p.className = 'text-vermelho'
    document.body.appendChild(p)
    const c = getComputedStyle(p).color
    p.remove()
    return c
  })
  ok('o proprio elemento do motor esta vermelho', corDoMotor === corVermelha, `motor=${corDoMotor} vermelho=${corVermelha}`)
  ok('o cartao mostra a faixa de conflito', await pagina.locator('[data-motor-conflito]').first().isVisible())
  await pagina.screenshot({ path: `${PROVAS}/motores-2-dois-ativos.png`, fullPage: false })

  const ficha = await abrir('diretores/luana', '409')
  ok('a ficha explica o 409 do Telegram', contem(ficha, '409'), ficha.slice(0, 300))
  await pagina.screenshot({ path: `${PROVAS}/motores-2-ficha-dois-ativos.png`, fullPage: false })
}

// ---------------------------------------------------------------------------
console.log('\n3. NENHUM ATIVO (injetado) - o agente esta fora do ar')
{
  await injetar((s) => {
    s.motores = {
      situacao: 'nenhum_ativo',
      motivo: 'nenhum dos 2 services do agente está no ar',
      motor: null,
      ativos: [],
      servicos: [
        { service: 'luana-claude.service', existe: true, estado: 'inactive', ativo: false, motor: 'Claude Code', motor_fonte: 'script iniciar_luana.sh' },
        { service: 'luana.service', existe: true, estado: 'inactive', ativo: false, motor: 'Codex', motor_fonte: 'despachante start.sh com luana-engine=codex' },
      ],
    }
  })
  const corpo = await abrir('diretores', 'fora do ar')
  ok('a tela diz "fora do ar"', contem(corpo, 'fora do ar'), corpo.slice(0, 200))
  ok('e nao inventa motor no ar', !contem(corpo, 'motor Claude Code'))
  await pagina.screenshot({ path: `${PROVAS}/motores-3-nenhum-ativo.png`, fullPage: false })
}

// ---------------------------------------------------------------------------
console.log('\n4. INDETERMINADO (injetado) - nao e ativo NEM inativo')
{
  await injetar((s) => {
    s.motores = {
      situacao: 'indeterminado',
      motivo: 'systemctl show não respondeu',
      motor: null,
      ativos: [],
      servicos: [{ service: 'luana.service', existe: null, estado: null, motor: null, motor_fonte: 'não medido' }],
    }
  })
  const corpo = await abrir('diretores', 'indeterminado')
  ok('a tela escreve indeterminado', contem(corpo, 'indeterminado'), corpo.slice(0, 200))
  ok('e NAO diz inativo nem fora do ar', !contem(corpo, 'fora do ar'))
  await pagina.screenshot({ path: `${PROVAS}/motores-4-indeterminado.png`, fullPage: false })

  const ficha = await abrir('diretores/luana', 'não foi possível medir')
  ok('a ficha diz que nao foi possivel medir', contem(ficha, 'não foi possível medir'), ficha.slice(0, 300))
  ok('e o motor sai "nao identificado", nunca chutado', contem(ficha, 'motor não identificado'))
}

// ---------------------------------------------------------------------------
console.log('\n5. MOTOR QUE O PAINEL NAO RECONHECE - nome nao vira chute')
{
  await injetar((s) => {
    s.motores = {
      situacao: 'um_ativo', motivo: null, motor: null,
      ativos: ['luana-gemini.service'],
      servicos: [{ service: 'luana-gemini.service', existe: true, estado: 'active', ativo: true, motor: null, motor_fonte: 'nenhum sinal de motor em g.sh' }],
    }
  })
  const corpo = await abrir('diretores', 'motor não identificado')
  ok('service novo aparece sem ninguem cadastrar', contem(corpo, 'motor não identificado'), corpo.slice(0, 200))
  ok('e nao vira "Claude Code" so porque esta no ar', !contem(corpo, 'Claude Code'))
  await pagina.screenshot({ path: `${PROVAS}/motores-5-nao-identificado.png`, fullPage: false })
}

// ---------------------------------------------------------------------------
console.log('\n6. SNAPSHOT ANTIGO, SEM O CAMPO - a tela nao pode inventar nem quebrar')
{
  await injetar((s) => { delete s.motores })
  const corpo = await abrir('diretores', 'não medido')
  ok('a tela continua de pe', contem(corpo, 'Rede de agentes'), corpo.slice(0, 200))
  ok('e diz que nao foi medido', contem(corpo, 'não medido'))
  ok('sem afirmar ativo nem inativo', !contem(corpo, 'fora do ar'))
  await pagina.screenshot({ path: `${PROVAS}/motores-6-snapshot-antigo.png`, fullPage: false })
}

// ---------------------------------------------------------------------------
console.log('\n7. O CONSOLE FICOU LIMPO?')
{
  const erros = []
  pagina.on('pageerror', (e) => erros.push(String(e)))
  await injetar(null)
  await abrir('diretores')
  await abrir('diretores/luana')
  ok('nenhuma excecao de JavaScript', erros.length === 0, erros.join(' | ').slice(0, 200))
}

await navegador.close()
console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
