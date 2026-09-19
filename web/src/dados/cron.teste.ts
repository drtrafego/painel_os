// Teste do parser de cron. Roda com:
//   node --experimental-strip-types src/dados/cron.teste.ts
//
// Tem caso positivo E caso negativo de proposito: teste que so sabe aprovar
// nao distingue "esta certo" de "parei de olhar". Os casos marcados ILEGIVEL
// existem pra provar que a trava REPROVA: se um deles passar a devolver
// true/false em vez de null, a expressao voltou a sumir calada da tela.

import { disparaEm, expandir, proximosDisparos } from './cron.ts'
import type { CronJob } from './tipos.ts'

function job(expressao: string, rotulo = 'x'): CronJob {
  const [minuto, hora, dia, mes, dow] = expressao.split(/\s+/)
  return { expressao, minuto, hora, dia, mes, dow, rotulo, dono: null }
}

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}  obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`)
}

const utc = (iso: string) => new Date(iso)

// terca-feira, 08/09/2026
conferir('*/15 no minuto 15', disparaEm(job('*/15 * * * *'), utc('2026-09-08T11:15:00Z')), true)
conferir('*/15 no minuto 16', disparaEm(job('*/15 * * * *'), utc('2026-09-08T11:16:00Z')), false)
conferir('1-56/5 no minuto 11', disparaEm(job('1-56/5 * * * *'), utc('2026-09-08T11:11:00Z')), true)
conferir('1-56/5 no minuto 12', disparaEm(job('1-56/5 * * * *'), utc('2026-09-08T11:12:00Z')), false)
conferir('4-59/5 no minuto 59', disparaEm(job('4-59/5 * * * *'), utc('2026-09-08T11:59:00Z')), true)
conferir('0,30 no minuto 30', disparaEm(job('0,30 * * * *'), utc('2026-09-08T11:30:00Z')), true)
conferir('0,30 no minuto 31', disparaEm(job('0,30 * * * *'), utc('2026-09-08T11:31:00Z')), false)
conferir('*/12 18-23 fora da faixa (11h)', disparaEm(job('*/12 18-23 * * *'), utc('2026-09-08T11:12:00Z')), false)
conferir('*/12 18-23 dentro (18h12)', disparaEm(job('*/12 18-23 * * *'), utc('2026-09-08T18:12:00Z')), true)
conferir('data fixa 25/08 em 08/09', disparaEm(job('30 22 25 8 *'), utc('2026-09-08T22:30:00Z')), false)
conferir('data fixa 25/08 no dia certo', disparaEm(job('30 22 25 8 *'), utc('2026-08-25T22:30:00Z')), true)
conferir('seg-sex numa terca', disparaEm(job('4 17 * * 1-5'), utc('2026-09-08T17:04:00Z')), true)
conferir('sabado numa terca', disparaEm(job('4 13 * * 6'), utc('2026-09-08T13:04:00Z')), false)
conferir('sabado no sabado', disparaEm(job('4 13 * * 6'), utc('2026-09-12T13:04:00Z')), true)
conferir('domingo como 0', disparaEm(job('0 12 * * 0'), utc('2026-09-13T12:00:00Z')), true)
conferir('domingo como 7', disparaEm(job('0 12 * * 7'), utc('2026-09-13T12:00:00Z')), true)
// dia do mes E dia da semana restritos: cron dispara se QUALQUER um casar
conferir('dia OU dow (dia casa)', disparaEm(job('0 12 8 * 5'), utc('2026-09-08T12:00:00Z')), true)
conferir('dia OU dow (nenhum casa)', disparaEm(job('0 12 9 * 5'), utc('2026-09-08T12:00:00Z')), false)

// --- NOME DE DIA E DE MES: o cronie aceita, e o parser devolvia NaN
conferir('MON-FRI numa terca', disparaEm(job('0 12 * * MON-FRI'), utc('2026-09-08T12:00:00Z')), true)
conferir('MON-FRI num sabado', disparaEm(job('0 12 * * MON-FRI'), utc('2026-09-12T12:00:00Z')), false)
conferir('mon-fri minusculo tambem', disparaEm(job('0 12 * * mon-fri'), utc('2026-09-08T12:00:00Z')), true)
conferir('SAT no sabado', disparaEm(job('0 12 * * SAT'), utc('2026-09-12T12:00:00Z')), true)
conferir('SUN,WED numa quarta', disparaEm(job('0 12 * * SUN,WED'), utc('2026-09-09T12:00:00Z')), true)
conferir('SUN,WED numa terca', disparaEm(job('0 12 * * SUN,WED'), utc('2026-09-08T12:00:00Z')), false)
conferir('SEP em setembro', disparaEm(job('0 12 * SEP *'), utc('2026-09-08T12:00:00Z')), true)
conferir('JAN em setembro', disparaEm(job('0 12 * JAN *'), utc('2026-09-08T12:00:00Z')), false)
conferir('AUG-OCT em setembro', disparaEm(job('0 12 * AUG-OCT *'), utc('2026-09-08T12:00:00Z')), true)
conferir('nome de mes NAO vale como minuto', disparaEm(job('JAN * * * *'), utc('2026-09-08T12:00:00Z')), null)

// --- ILEGIVEL: tem que voltar null, nunca conjunto vazio nem "dispara sempre"
conferir('parte vazia 1,,3 (antes disparava em TODO minuto)', disparaEm(job('1,,3 * * * *'), utc('2026-09-08T11:47:00Z')), null)
conferir('campo em branco', disparaEm(job('  * * * *'), utc('2026-09-08T11:47:00Z')), null)
conferir('lixo no campo', disparaEm(job('0 12 * * NAOEXISTE'), utc('2026-09-08T12:00:00Z')), null)
conferir('passo que nao e numero', disparaEm(job('*/x * * * *'), utc('2026-09-08T11:47:00Z')), null)
conferir('passo zero', disparaEm(job('*/0 * * * *'), utc('2026-09-08T11:47:00Z')), null)
conferir('faixa invertida', disparaEm(job('0 22-2 * * *'), utc('2026-09-08T23:00:00Z')), null)
conferir('minuto fora do intervalo', disparaEm(job('99 * * * *'), utc('2026-09-08T11:47:00Z')), null)
conferir('dois passos', disparaEm(job('*/2/3 * * * *'), utc('2026-09-08T11:47:00Z')), null)
conferir('expandir devolve null e nao Set vazio', expandir('MON', 0, 59), null)
conferir('expandir de nome de dia devolve Set', [...(expandir('MON-FRI', 0, 7, { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }) ?? [])], [1, 2, 3, 4, 5])

// janela: de 11:00:30, o */15 deve pegar 11:15, 11:30, 11:45, 12:00 = 4 vezes
const d = proximosDisparos([job('*/15 * * * *', 'quinze')], utc('2026-09-08T11:00:30Z'), 60)
conferir('janela de 60min do */15', d.disparos[0]?.vezes, 4)
conferir('primeiro disparo do */15', d.disparos[0]?.primeiro.toISOString(), '2026-09-08T11:15:00.000Z')
conferir('nada ilegivel na janela limpa', d.ilegiveis.length, 0)
conferir('lidas conta o que foi lido', d.lidas, 1)
// job que nao dispara na janela nao pode aparecer
conferir('job fora da janela some', proximosDisparos([job('0 3 * * *')], utc('2026-09-08T11:00:30Z'), 60).disparos.length, 0)

// a janela SEPARA o que nao deu pra ler do que nao dispara: o rodape da tela
// dizia "a partir das 64 expressoes" tendo lido 62.
const mista = proximosDisparos(
  [job('*/15 * * * *', 'quinze'), job('1,,3 * * * *', 'parte vazia'), job('0 12 * * MON-FRI', 'nomeado')],
  utc('2026-09-08T11:00:30Z'),
  60,
)
// 11:00:30 + 60min chega a 12:00:30, entao o 'nomeado' das 12:00 CABE na
// janela: os dois legiveis disparam, e por rotulo se ve quais.
conferir('mista: os dois legiveis disparam', mista.disparos.map((x) => x.job.rotulo).sort(), ['nomeado', 'quinze'])
conferir('mista: 1 ilegivel', mista.ilegiveis.map((j) => j.rotulo), ['parte vazia'])
conferir('mista: 2 lidas de 3', mista.lidas, 2)

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
