// Roda TODOS os `*.teste.ts` do projeto através do Vite (resolve import de
// imagem/JSX, o que `node --experimental-strip-types` sozinho não faz — dois
// arquivos de teste importam PixelOffice.tsx, que importa PNG, e travavam
// nisso sem ninguém perceber porque o README só documenta um subconjunto
// rodado na mão). Cada arquivo é um módulo de efeito colateral: ele mesmo
// imprime "ok"/"FALHOU" por asserção e faz `process.exit(1)` se alguma
// falhou. Este runner só agrega o resultado por ARQUIVO.
//
// Uso: node scripts/rodar-testes.mjs [filtro-no-caminho]
import { createServer } from 'vite'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const raiz = new URL('..', import.meta.url).pathname
const filtro = process.argv[2]

function listarTestes(dir) {
  const arquivos = []
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue
    const caminho = join(dir, nome)
    const info = statSync(caminho)
    if (info.isDirectory()) arquivos.push(...listarTestes(caminho))
    else if (nome.endsWith('.teste.ts') || nome.endsWith('.teste.tsx')) arquivos.push(caminho)
  }
  return arquivos
}

const testes = listarTestes(join(raiz, 'src'))
  .map((caminho) => relative(raiz, caminho))
  .filter((caminho) => !filtro || caminho.includes(filtro))
  .sort()

const server = await createServer({ configFile: join(raiz, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom' })

let passou = 0
let falhou = 0
const falhas = []

for (const caminho of testes) {
  const linhas = []
  const logOriginal = console.log
  const errOriginal = console.error
  console.log = (...args) => linhas.push(args.join(' '))
  console.error = (...args) => linhas.push(args.join(' '))
  let codigoSaida = 0
  const sairOriginal = process.exit
  process.exit = (codigo = 0) => { codigoSaida = codigo; throw new Error('__TESTE_EXIT__') }
  try {
    await server.ssrLoadModule('/' + caminho)
  } catch (erro) {
    if (!(erro instanceof Error) || erro.message !== '__TESTE_EXIT__') {
      codigoSaida = 1
      linhas.push(String(erro?.stack || erro))
    }
  } finally {
    process.exit = sairOriginal
    console.log = logOriginal
    console.error = errOriginal
  }
  const texto = linhas.join('\n')
  const temFalhou = /FALHOU/.test(texto)
  if (codigoSaida !== 0 || temFalhou) {
    falhou += 1
    falhas.push({ caminho, texto })
    console.error(`FALHOU ${caminho}`)
  } else {
    passou += 1
    console.log(`ok     ${caminho}`)
  }
}

await server.close()

console.log(`\n${passou}/${testes.length} arquivos de teste passaram.`)
if (falhas.length) {
  console.error('\n--- detalhe das falhas ---')
  for (const { caminho, texto } of falhas) {
    console.error(`\n# ${caminho}`)
    console.error(texto)
  }
  process.exitCode = 1
}
