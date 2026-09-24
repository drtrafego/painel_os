// Rode com:
//   node --experimental-strip-types src/ui/card-comando-modelo.teste.ts
import { corDaSessao } from './paleta.ts'
import { corDoCardComando, leituraEstadoSessao } from './card-comando-modelo.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

for (const id of ['luana', 'renato', 'bia']) {
  conferir(`CardComando usa a mesma cor da Sidebar para ${id}`, corDoCardComando(id), corDaSessao(id))
}

const agora = new Date('2026-09-24T15:00:00-03:00')
conferir(
  'sessão ativa aparece como trabalhando',
  leituraEstadoSessao('ativo', '2026-09-24T14:58:00-03:00', agora).texto,
  'trabalhando',
)
conferir(
  'sessão ociosa mostra idade curta em minutos',
  leituraEstadoSessao('ocioso', '2026-09-24T14:12:00-03:00', agora).texto,
  'ociosa há 48min',
)
conferir(
  'sessão ociosa mostra idade curta em horas',
  leituraEstadoSessao('ocioso', '2026-09-24T12:01:00-03:00', agora).texto,
  'ociosa há 2h',
)
conferir(
  'campo vazio não inventa estado',
  leituraEstadoSessao(undefined, null, agora).texto,
  'sem leitura',
)

if (falhas) process.exit(1)
console.log('APROVADO: CardComando compartilha cor canônica e formata estado da sessão.')
