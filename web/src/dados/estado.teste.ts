// Teste dos utilitarios do estado. Rode com:
//   node --experimental-strip-types src/dados/estado.teste.ts
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ORDEM_SQUAD, squadsComAgentes } from './estado.ts'
import type { Estado } from './tipos.ts'

const aqui = dirname(fileURLToPath(import.meta.url))
const real = JSON.parse(readFileSync(join(aqui, 'estado.json'), 'utf8')) as Estado

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

const comSquadVazio: Estado = JSON.parse(JSON.stringify(real))
comSquadVazio.squads.squad_vazio = { nome: 'Squad vazio', descricao: 'Sem agentes' }
const esperadosDoFixture = ORDEM_SQUAD.filter(
  (id) => Boolean(real.squads[id]) && real.agentes.some((agente) => agente.squad === id),
)

conferir('UI não lista squad vazio', squadsComAgentes(comSquadVazio).includes('squad_vazio'), false)
conferir('UI preserva ordem dos squads com agentes', squadsComAgentes(real), esperadosDoFixture)

if (falhas) process.exit(1)
console.log('APROVADO: squads vazios ficam fora da UI.')
