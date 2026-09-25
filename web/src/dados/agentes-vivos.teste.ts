// Teste dos contadores da sonda viva. Rode com:
//   node --experimental-strip-types src/dados/agentes-vivos.teste.ts
import {
  contarAgentesExecutando,
  contarAgentesVivos,
  contarAgentesVivosNaContagem,
  rotuloPresencaPixelOffice,
} from './agentes-vivos.ts'
import type { AgenteVivo, AgentesVivos } from './tipos.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

const agente = (estado: AgenteVivo['estado']): AgenteVivo => ({
  id: `ag-${estado}-${Math.random()}`,
  fase: 'teste',
  etapa: 'teste',
  silencio_s: 0,
  estado,
})

const agentes = [
  agente('trabalhando'),
  agente('trabalhando'),
  agente('silencioso'),
  agente('silencioso'),
  agente('parado'),
]
const contagem: AgentesVivos['contagem'] = {
  trabalhando: 2,
  silencioso: 2,
  parado: 1,
  vivos: 4,
}

conferir('executando conta só trabalhando', contarAgentesExecutando(agentes), 2)
conferir('vivos conta trabalhando + silencioso no PixelOffice', contarAgentesVivos(agentes), 4)
conferir('KPI de vivos usa trabalhando + silencioso', contarAgentesVivosNaContagem(contagem), 4)
conferir('cabeçalho do PixelOffice e KPI de vivos ficam iguais', contarAgentesVivos(agentes), contarAgentesVivosNaContagem(contagem))
conferir('rótulo do PixelOffice separa vivos de executando', rotuloPresencaPixelOffice(agentes, 9), '4 vivos (2 executando) · 9 no catálogo')

// --- ADENDO RODADA 15: TESTE DE RESOLUÇÃO DE SESSÃO CLAUDE E DONO DOS DIRETORES
import { resolverAgenteNoCatalogo, mesclarRuntimesNoCatalogo, PIXEL_AGENTS } from './pixel-agents.ts'

const agentesQA: AgenteVivo[] = [
  { id: 'subagente-dev-123', dono: 'luana', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'dev' },
  { id: 'sessao-claude-renato', dono: 'renato', tipo: 'sessao_claude', identidade: 'sessao-claude', estado: 'silencioso', silencio_s: 12, fase: 'ocioso', etapa: 'aguardando' },
  { id: 'sessao-claude-bia', dono: 'bia', tipo: 'sessao_claude', identidade: 'sessao-claude', estado: 'silencioso', silencio_s: 45, fase: 'ocioso', etapa: 'aguardando' },
]

const catVisual = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, agentesQA)

const devResolved = resolverAgenteNoCatalogo(agentesQA[0], catVisual)
const renatoResolved = resolverAgenteNoCatalogo(agentesQA[1], catVisual)
const biaResolved = resolverAgenteNoCatalogo(agentesQA[2], catVisual)

conferir('subagente dev da Luana fica alocado na coordenação', devResolved?.squad, 'coordenação')
conferir('sessao_claude do Renato resolve diretamente para o Renato', renatoResolved?.id, 'renato')
conferir('sessao_claude da Bia resolve diretamente para a Bia', biaResolved?.id, 'bia')

if (falhas) process.exit(1)
console.log('APROVADO: contadores e resoluções de sessão dos diretores alinhados.')
