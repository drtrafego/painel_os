// Rode quando houver dependências web locais:
//   node --experimental-strip-types src/ui/PixelOffice.wall-data.teste.ts
import { montarTarefasParede, montarUsoParede } from './PixelOffice.wall-data.ts'
import type { TarefasDiretores, UsoPlanos } from '../dados/tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

const tarefas: TarefasDiretores = {
  luana: {
    lido_em: '2026-10-01T01:00:00-03:00',
    avisos: ['aviso público'],
    itens: [
      {
        chave: 'luana:P0:0',
        ordem: 1,
        prioridade: 'P0',
        titulo: 'Nina lead de anúncio',
        responsavel: 'Luana',
        proximo_passo: 'reiniciar receiver',
        data: '01/10',
        depende_de: 'decisão do Gastão',
        estado_tarefa: 'ativa',
        em_andamento: true,
      },
      {
        chave: 'luana:P1:1',
        ordem: 2,
        prioridade: 'P1',
        titulo: 'Mineração AutonomIA',
        responsavel: 'Luana',
        proximo_passo: 'aguardar diagnóstico',
        data: null,
        depende_de: null,
        estado_tarefa: 'bloqueada',
        em_andamento: false,
      },
    ],
  },
  renato: { lido_em: null, avisos: [], itens: [] },
}

const colunas = montarTarefasParede(tarefas)
conferir('ordem das colunas fica Renato e Luana', colunas.map((c) => c.id), ['renato', 'luana'])
conferir('coluna vazia permanece neutra', colunas[0], { id: 'renato', nome: 'Renato', tarefas: [], avisos: [], lidoEm: null })
conferir('usa campos da fila, não de agente vivo', colunas[1].tarefas[0], {
  chave: 'luana:P0:0',
  nome: 'Luana',
  ordem: 1,
  titulo: 'Nina lead de anúncio',
  prioridade: 'P0',
  data: '01/10',
  dependeDe: 'decisão do Gastão',
  estado: 'ativa',
  emAndamento: true,
})
conferir('avisos ficam na coluna sem virar tarefa', colunas[1].avisos, ['aviso público'])

const usoComSemana: UsoPlanos = {
  status: 'pronto',
  atualizado_em: '2026-10-01T03:30:00Z',
  erro: null,
  claude: {
    status: 'pronto',
    medido_em: '2026-10-01T03:24:00Z',
    sessao_5h_percentual: 7,
    sessao_5h_reset: 1790838000,
    semana_7d_percentual: 33,
    semana_7d_janela_dias: 7,
    semana_7d_reset: 1791352800,
    semana_7d_fonte_percentual_oficial: true,
    fonte_percentual_oficial: true,
    tokens_24h_estimativa: 1234,
    por_diretor: [],
  },
  codex: null,
}
const usoSemSemana: UsoPlanos = {
  ...usoComSemana,
  claude: {
    ...usoComSemana.claude!,
    semana_7d_percentual: null,
    semana_7d_janela_dias: null,
    semana_7d_fonte_percentual_oficial: false,
  },
}
conferir('uso do Claude carrega semana oficial de 7 dias', montarUsoParede(usoComSemana)[0], {
  id: 'claude',
  nome: 'Claude',
  janela: 'Sessão · 5 horas',
  percentual: 7,
  tokens: 1234,
  semanaPercentual: 33,
  semanaJanelaDias: 7,
  semanaOficial: true,
  observado: true,
  nota: 'Percentual oficial do plano',
})
conferir('uso do Claude sem semana oficial fica seguro', montarUsoParede(usoSemSemana)[0].semanaOficial, false)
conferir('uso do Claude sem janela declarada preserva rótulo de 7 dias', montarUsoParede(usoSemSemana)[0].semanaJanelaDias, 7)

if (falhas) process.exit(1)
console.log('APROVADO: montarTarefasParede usa tarefas_diretores e mantém fila simples.')
