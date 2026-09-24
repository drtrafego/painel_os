// Teste do rotulo que sai do dado. Roda com:
//   node --experimental-strip-types src/nav/rotulo.teste.ts
//
// ‼️ METADE DOS CASOS EXISTE PRA REPROVAR. O defeito que este arquivo veio
// consertar era um rotulo que dizia "sem dado ainda" sobre tela cheia. O erro
// simetrico, e mais caro, seria um rotulo dizendo "com dado" sobre fonte que
// sumiu: ninguem investiga uma bolinha verde. Entao todo caso positivo aqui
// tem o negativo dele ao lado, e um instrumento que so aprova nao distingue
// "esta certo" de "parei de olhar".

import { dadoDaVista } from './rotulo.ts'
import { POR_ID } from './rotas.ts'
import type { Estado } from '../dados/tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}  obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`)
}

// O estado de verdade tem 40 campos e nenhum deles importa aqui: a sonda de
// cada vista le UM. O molde declara so o que o caso mede, e o `as unknown` diz
// isso com todas as letras em vez de fingir um estado inteiro.
const estado = (parte: Partial<Estado>): Estado => parte as unknown as Estado

const tipo = (id: keyof typeof POR_ID, e: Estado) => dadoDaVista(POR_ID[id], e).tipo

console.log('--- fonte que RESPONDEU nao pode se anunciar ausente (o defeito de 10/09)')
conferir(
  'cobranças com a API viva deixa de dizer "sem dado ainda"',
  tipo('cobrancas', estado({
    cobrancas: {
      status: 'pronto', fonte: 'x', atualizado_em: '2026-09-10T12:00:00Z',
      faturas_atrasadas: 0, clientes_atrasados: 0, por_faixa: [], por_moeda: [], erro: null,
    },
  })),
  'medido',
)
conferir(
  'ferramentas com 27 conexões medidas deixa de dizer "sem dado ainda"',
  tipo('ferramentas', estado({
    ferramentas: {
      erro: null, itens: [{ id: 'a', nome: 'a', tipo: 'MCP', estado: 'disponível', evidencia: 'x', fallback: null, proveniencias: [] }],
      contagem: { 'disponível': 25, fallback: 1, ausente: 1 },
      por_tipo: { MCP: 3, App: 1, 'Integração': 20, Script: 3 }, medidos: 27,
    },
  })),
  'parcial',
)

console.log('\n--- ‼️ e o erro simétrico: fonte que SUMIU nao pode continuar prometendo número')
conferir(
  'cobranças sem a fonte volta a ser "nenhum"',
  tipo('cobrancas', estado({})),
  'nenhum',
)
conferir(
  'cobranças com erro da API é "nenhum", não zero',
  tipo('cobrancas', estado({
    cobrancas: {
      status: 'erro', fonte: 'x', atualizado_em: '2026-09-10T12:00:00Z',
      faturas_atrasadas: null, clientes_atrasados: null, por_faixa: [], por_moeda: [],
      erro: 'a API financeira não respondeu',
    },
  })),
  'nenhum',
)
conferir(
  'o motivo medido viaja junto, em vez de virar frase genérica',
  dadoDaVista(POR_ID.tarefas, estado({ agentes: [] })),
  { tipo: 'nenhum', mostraria: POR_ID.tarefas.pergunta, falta: 'o catálogo de agentes operacionais não veio no estado atual' },
)
conferir(
  'ferramentas com inventário vazio NÃO é promovida',
  tipo('ferramentas', estado({
    ferramentas: {
      erro: 'nenhum adaptador respondeu', itens: [],
      contagem: { 'disponível': 0, fallback: 0, ausente: 0 },
      por_tipo: { MCP: 0, App: 0, 'Integração': 0, Script: 0 }, medidos: 0,
    },
  })),
  'nenhum',
)

console.log('\n--- os dois controles: o que estava CERTO tem que continuar como estava')
conferir(
  'aprovações, mesma estrutura e zero real, continua medido',
  tipo('aprovacoes', estado({
    aprovacoes: {
      erro: null, arquivo: 'x', atualizado_em: null, total: 0, por_estado: {}, itens: [],
      decisoes_habilitadas: false, decisoes_bloqueio: null,
    },
  })),
  'medido',
)
conferir(
  'chamadas sem ingestão ligada continua "nenhum", e é o zero honesto',
  tipo('chamadas', estado({
    chamadas: {
      status: 'sem_fonte', fonte: 'x', total: null, atualizado_em: null,
      erro: 'o Drive não está conectado', registros: [], nos: [], arestas: [],
      arquivos: 0, mascarados: 0,
    },
  })),
  'nenhum',
)
conferir(
  'vista sem sonda (composta) mantém o que foi declarado',
  tipo('comando', estado({})),
  POR_ID.comando.dado.tipo,
)

console.log('\n--- a sonda nunca MELHORA a nota que alguém redigiu à mão')
conferir(
  'declarado parcial com ressalva escrita continua parcial, e a ressalva é a mesma',
  dadoDaVista(POR_ID.cofre, estado({
    cofre: {
      erro: null, arquivo: 'x',
      nos: [{ id: 'n', rotulo: 'n', arquivo: 'a:1', linhas: 1, modificado: '', tipo: 'assunto', especie: 'padrao', area: 'x', familia: 'y', corpo: '', caso: '', autor: '', quando: '2026-09-10', peso: 1, vencido: false, grau: 1 }],
      arestas: [{ de: 'n', para: 'n', porque: 'x', ponte: false }],
      arquivos: 1, conexoes: 1, cobertura: 60, areas: [], familias: [], grau_medio: 1,
      vencidos: [], truncados: [], recusados: [], arestas_recusadas: [],
    },
  })),
  POR_ID.cofre.dado,
)

console.log(falhas === 0 ? '\nTODOS PASSARAM' : `\n${falhas} FALHARAM`)
process.exit(falhas === 0 ? 0 : 1)
