// Rode com:
//   node --experimental-strip-types src/telas/diretor-vivo.teste.ts
import { acharAgenteAoVivoDoDiretor } from './diretor-vivo.ts'
import type { AgenteVivo } from '../dados/tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

const base = {
  fase: 'atividade',
  etapa: 'executando',
  silencio_s: 1,
} satisfies Pick<AgenteVivo, 'fase' | 'etapa' | 'silencio_s'>

const agentes: AgenteVivo[] = [
  { ...base, id: 'sessao-bia1234', dono: 'bia', estado: 'silencioso' },
  { ...base, id: 'bia-por-id-nao-vale', dono: 'renato', estado: 'trabalhando' },
  { ...base, id: 'agent-tool-12345678', dono: 'bia', estado: 'trabalhando' },
]

conferir('não mostra banner por id contendo o nome', acharAgenteAoVivoDoDiretor(agentes.slice(1, 2), 'bia'), undefined)
conferir('mostra Renato quando o dono é Renato', acharAgenteAoVivoDoDiretor(agentes, 'renato')?.id, 'bia-por-id-nao-vale')
conferir('sessão silenciosa da Bia não mostra banner', acharAgenteAoVivoDoDiretor(agentes.slice(0, 1), 'bia'), undefined)
conferir('banner casa por dono trabalhando', acharAgenteAoVivoDoDiretor(agentes, 'bia')?.id, 'agent-tool-12345678')

if (falhas) process.exit(1)
console.log('APROVADO: banner ao vivo do diretor usa dono e exige trabalho real.')
