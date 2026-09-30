import type { AgenteVivo } from './tipos.ts'
import { agruparAgentesAtivosPorLancador, totalDeAgentesAgrupados } from './lancadores.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) {
    falhas++
    console.error(`FALHOU: ${nome}\n  Obtido: ${JSON.stringify(obtido)}\n  Esperado: ${JSON.stringify(esperado)}`)
  } else {
    console.log(`ok   ${nome}`)
  }
}

const agente = (id: string, dono: string | undefined, estado: AgenteVivo['estado']): AgenteVivo => ({
  id,
  dono,
  identidade: id,
  estado,
  fase: 'teste',
  etapa: 'teste',
})

const entrada = [
  agente('luana-1', 'luana', 'trabalhando'),
  agente('luana-2', 'Luana', 'silencioso'),
  agente('renato-1', 'renato', 'trabalhando'),
  agente('bia-1', 'bia', 'silencioso'),
  agente('sem-dono', undefined, 'trabalhando'),
  agente('dono-inferido-nao', 'diretora-bia', 'trabalhando'),
  agente('encerrado', 'luana', 'parado'),
]
const grupos = agruparAgentesAtivosPorLancador(entrada)

conferir('parados saem da lista ativa', totalDeAgentesAgrupados(grupos), 6)
conferir('Luana recebe somente dono declarado', grupos.find((g) => g.id === 'luana')?.agentes.map((a) => a.id), ['luana-1', 'luana-2'])
conferir('Renato recebe dono declarado', grupos.find((g) => g.id === 'renato')?.agentes.map((a) => a.id), ['renato-1'])
conferir('Bia recebe dono declarado', grupos.find((g) => g.id === 'bia')?.agentes.map((a) => a.id), ['bia-1'])
conferir('dono ausente e nome parecido vão para origem não identificada', grupos.find((g) => g.id === 'nao-identificada')?.agentes.map((a) => a.id), ['sem-dono', 'dono-inferido-nao'])
conferir('partição fecha sem duplicar entradas', new Set(grupos.flatMap((g) => g.agentes.map((a) => a.id))).size, 6)

if (falhas > 0) process.exit(1)
console.log('\nAPROVADO: origem operacional, estados e contagem cruzada conferidos.')
