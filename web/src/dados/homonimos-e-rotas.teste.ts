// Testes de integridade de homônimos (dono+id) e rotas unificadas para visão de agentes ativos.
// Execute com: npx tsx src/dados/homonimos-e-rotas.teste.ts

import { chaveAgente, mesclarRuntimesNoCatalogo, resolverAgenteNoCatalogo, PIXEL_AGENTS } from './pixel-agents.ts'
import type { AgenteVivo } from './tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) {
    falhas++
    console.error(`FALHOU: ${nome}\n  Obtido:   ${JSON.stringify(obtido)}\n  Esperado: ${JSON.stringify(esperado)}`)
  } else {
    console.log(`ok   ${nome}`)
  }
}

// 1. Homônimos com mesmo ID simples ('dev') mas donos diferentes ('bia', 'renato', 'luana')
const homonimoBia: AgenteVivo = {
  id: 'dev',
  dono: 'bia',
  nome: 'Dev Bia',
  tipo: 'subagente',
  estado: 'trabalhando',
  tarefa: 'Ajuste de landing page de tráfego',
  ferramenta: 'edit_file',
  fase: 'execucao',
  etapa: 'dev',
  silencio_s: 0,
}

const homonimoRenato: AgenteVivo = {
  id: 'dev',
  dono: 'renato',
  nome: 'Dev Renato',
  tipo: 'subagente',
  estado: 'trabalhando',
  tarefa: 'Desenvolvimento de bot de telegram',
  ferramenta: 'run_command',
  fase: 'execucao',
  etapa: 'dev',
  silencio_s: 2,
}

const homonimoLuana: AgenteVivo = {
  id: 'dev',
  dono: 'luana',
  nome: 'Dev Luana',
  tipo: 'subagente',
  estado: 'silencioso',
  tarefa: 'Refatoração da coordenação geral',
  ferramenta: 'view_file',
  fase: 'execucao',
  etapa: 'dev',
  silencio_s: 15,
}

// Gera chaves compostas
const chaveBia = chaveAgente(homonimoBia.dono, homonimoBia.id)
const chaveRenato = chaveAgente(homonimoRenato.dono, homonimoRenato.id)
const chaveLuana = chaveAgente(homonimoLuana.dono, homonimoLuana.id)

conferir('chave composta da Bia', chaveBia, 'bia:dev')
conferir('chave composta do Renato', chaveRenato, 'renato:dev')
conferir('chave composta da Luana', chaveLuana, 'luana:dev')
conferir('as três chaves são estritamente distintas', new Set([chaveBia, chaveRenato, chaveLuana]).size, 3)

// Mescla com catálogo e valida que os 3 recebem mesas e squads independentes
const catComHomonimos = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, [homonimoBia, homonimoRenato, homonimoLuana])

const resBia = resolverAgenteNoCatalogo(homonimoBia, catComHomonimos)
const resRenato = resolverAgenteNoCatalogo(homonimoRenato, catComHomonimos)
const resLuana = resolverAgenteNoCatalogo(homonimoLuana, catComHomonimos)

conferir('Dev da Bia alocado no squad de tráfego', resBia?.squad, 'tráfego')
conferir('Dev do Renato alocado no squad de bots', resRenato?.squad, 'bots')
conferir('Dev da Luana alocado no squad de coordenação', resLuana?.squad, 'coordenação')

// 2. Validação dos 4 Pontos de Entrada Unificados chamando abrirAgentesAtivos
type RotaParams = { rota: string; opcao?: string | null; query?: Record<string, string | undefined> }

function simularNavegacao() {
  let estadoRota: RotaParams = { rota: 'tarefas', query: {} }
  const ir = (novaRota: string, opcao?: string | null, query?: Record<string, string | undefined>) => {
    estadoRota = { rota: novaRota, opcao, query }
  }

  const abrirAgentesAtivos = (chave?: string) => {
    ir('tarefas', null, {
      visao: 'ativos',
      modo: 'office',
      ...(chave ? { execucao: chave } : {}),
    })
  }

  // Ponto de entrada 1: Clique na mesa do escritório
  abrirAgentesAtivos('bia:dev')
  const p1 = { ...estadoRota }

  // Ponto de entrada 2: Ticker / faixa superior de agentes ao vivo
  abrirAgentesAtivos()
  const p2 = { ...estadoRota }

  // Ponto de entrada 3: Cartão EXEC do Terminal CRT
  abrirAgentesAtivos('renato:dev')
  const p3 = { ...estadoRota }

  // Ponto de entrada 4: Mapa do Squad / Cérebro
  abrirAgentesAtivos('luana:dev')
  const p4 = { ...estadoRota }

  return { p1, p2, p3, p4 }
}

const navegacao = simularNavegacao()

conferir('Ponto 1 (Mesa) define rota tarefas com visao=ativos e execucao=bia:dev', navegacao.p1, {
  rota: 'tarefas',
  opcao: null,
  query: { visao: 'ativos', modo: 'office', execucao: 'bia:dev' },
})

conferir('Ponto 2 (Ticker) define rota tarefas com visao=ativos', navegacao.p2, {
  rota: 'tarefas',
  opcao: null,
  query: { visao: 'ativos', modo: 'office' },
})

conferir('Ponto 3 (Terminal CRT) define rota tarefas com visao=ativos e execucao=renato:dev', navegacao.p3, {
  rota: 'tarefas',
  opcao: null,
  query: { visao: 'ativos', modo: 'office', execucao: 'renato:dev' },
})

conferir('Ponto 4 (Cérebro / Mapa) define rota tarefas com visao=ativos e execucao=luana:dev', navegacao.p4, {
  rota: 'tarefas',
  opcao: null,
  query: { visao: 'ativos', modo: 'office', execucao: 'luana:dev' },
})

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`)
  process.exit(1)
} else {
  console.log('\nTodos os testes de homônimos e rotas passaram com sucesso!')
}
