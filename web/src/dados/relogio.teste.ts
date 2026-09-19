// Teste da situacao da diretiva e do rotulo de atividade. Roda com:
//   node --experimental-strip-types src/dados/relogio.teste.ts
//
// ‼️ OS DOIS DEFEITOS QUE ISTO TRAVA SAO DA MESMA FAMILIA: um campo que existe
// sendo lido como um fato que nao foi conferido. A diretiva era dada como ativa
// porque `prazo` estava PREENCHIDO, sem ninguem comparar com o relogio; e a
// pilula dizia "ativo hoje" medindo uma janela de 24 horas.
//
// Metade dos casos existe pra REPROVAR: uma diretiva DENTRO do prazo tem que
// continuar ativa, senao a trava nova mata o cartao todo dia e a casa aprende a
// ignorar o ambar. Trava que reprova tudo e igual a trava que aprova tudo.

import { atividade, situacaoDaDiretiva } from './relogio.ts'
import type { Agente, Estado } from './tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}  obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`)
}

const diretiva = (parte: Partial<NonNullable<Estado['diretiva']>>): Estado['diretiva'] => ({
  status: 'ativa', objetivo: 'entrar em modo goal', prazo: '2026-09-09',
  criada_em: '2026-09-08T22:11:23Z', atualizada_em: '2026-09-08T22:11:23Z',
  origem: { canal: 'telegram', mensagem_id: '9412' },
  ...parte,
})

// O prazo e uma data de calendario no fuso de quem escreveu (America/Sao_Paulo,
// sem horario de verao desde 2019). Estes instantes cercam a virada dele.
const antesDaMeiaNoite = Date.parse('2026-09-09T23:59:00-03:00')
const logoDepois = Date.parse('2026-09-10T00:01:00-03:00')
const diaSeguinte = Date.parse('2026-09-10T09:30:00-03:00')

console.log('--- diretiva: o prazo se compara com o relógio, não só com o campo')
conferir(
  '‼️ prazo 09/09 lido em 10/09 é VENCIDA (era "ativa" até 10/09/2026)',
  situacaoDaDiretiva(diretiva({}), diaSeguinte),
  { estado: 'vencida', rotulo: 'vencida', diasVencida: 1 },
)
conferir(
  'um minuto depois da virada já é vencida',
  situacaoDaDiretiva(diretiva({}), logoDepois).estado,
  'vencida',
)

console.log('\n--- ‼️ e o caso que a trava NÃO pode matar: dentro do prazo continua ativa')
conferir(
  'um minuto ANTES da virada ainda é vigente, e vence hoje',
  situacaoDaDiretiva(diretiva({}), antesDaMeiaNoite),
  { estado: 'vigente', rotulo: 'ativa', diasAteVencer: 0 },
)
conferir(
  'prazo em 12/09 lido em 10/09 é vigente, com 2 dias',
  situacaoDaDiretiva(diretiva({ prazo: '2026-09-12' }), diaSeguinte),
  { estado: 'vigente', rotulo: 'ativa', diasAteVencer: 2 },
)
conferir(
  '⚠️ o prazo vence no FIM do dia no fuso dele, não às 21h por causa do UTC',
  situacaoDaDiretiva(diretiva({}), Date.parse('2026-09-09T21:30:00-03:00')).estado,
  'vigente',
)

console.log('\n--- diretiva: ausência e erro não viram "ativa" nem "vencida"')
conferir('sem fonte', situacaoDaDiretiva(undefined, diaSeguinte).estado, 'sem-fonte')
conferir(
  'erro na fonte leva o motivo junto',
  situacaoDaDiretiva(diretiva({ status: 'erro', erro: 'arquivo ilegível' }), diaSeguinte),
  { estado: 'sem-fonte', porque: 'arquivo ilegível' },
)
conferir(
  'prazo que não dá para ler não vira vencida por acidente',
  situacaoDaDiretiva(diretiva({ prazo: 'amanhã' }), diaSeguinte).estado,
  'sem-fonte',
)
conferir(
  'diretiva concluída não é medida contra o prazo',
  situacaoDaDiretiva(diretiva({ status: 'concluida' }), diaSeguinte),
  { estado: 'encerrada', rotulo: 'concluida' },
)

console.log('\n--- atividade: o rótulo diz a janela que a medida usa')
const agente = (ultima: string | null): Agente => ({
  id: 'x', nome: 'x', descricao: '', modelo: null, ferramentas: null, squad: 'global',
  origem: '', arquivo: '', linhas: 0, bytes: 0, modificado: '', convocacoes: 1,
  ultima_convocacao: ultima, adaptadores: [],
})
const agora = Date.parse('2026-09-10T09:30:00-03:00')
conferir(
  '‼️ chamado ontem às 22h, lido às 9h30, não diz "ativo hoje"',
  atividade(agente('2026-09-09T22:00:00-03:00'), agora),
  { nivel: 'recente', texto: 'ativo nas últimas 24h' },
)
conferir(
  'chamado há 30 minutos também cai na mesma janela, com o mesmo rótulo',
  atividade(agente('2026-09-10T09:00:00-03:00'), agora).texto,
  'ativo nas últimas 24h',
)
conferir(
  'passou de 24h e sai da janela',
  atividade(agente('2026-09-09T08:00:00-03:00'), agora).nivel,
  'semana',
)
conferir(
  'nunca convocado continua sendo nunca, e não zero de janela',
  atividade(agente(null), agora),
  { nivel: 'nunca', texto: 'nunca convocado' },
)
conferir(
  'parado há mais de uma semana continua caindo em encostado',
  atividade(agente('2026-08-20T08:00:00-03:00'), agora).nivel,
  'parado',
)

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
