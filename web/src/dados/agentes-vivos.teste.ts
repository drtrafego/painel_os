// Teste dos contadores da sonda viva. Rode com:
//   npx tsx src/dados/agentes-vivos.teste.ts
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

// --- RODADA 15 & 16: TESTE DE RESOLUÇÃO DE SESSÃO E SUBAGENTES ALOCADOS NOS DIRETORES
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

// --- RODADA 16: TESTES DE FIXTURES DE SUBAGENTES POR DIRETORES (LUANA, RENATO, BIA)
const subagentesLuana: AgenteVivo[] = [
  { id: 'sub-l1', dono: 'luana', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'dev' },
  { id: 'sub-l2', dono: 'luana', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'pesquisa' },
  { id: 'sub-l3', dono: 'luana', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'revisao' },
]
const catLuana = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, subagentesLuana)
const coordLuanaSubs = catLuana.filter((item) => item.squad === 'coordenação' && item.id.startsWith('luana:'))
const globaisLuanaSubs = catLuana.filter((item) => item.squad === 'globais' && item.id.startsWith('luana:'))
conferir('3 subagentes da Luana vão para a ilha coordenação (DOING 3)', coordLuanaSubs.length, 3)
conferir('ilha GLOBAIS não ganha nenhum subagente da Luana', globaisLuanaSubs.length, 0)

const subagentesRenato: AgenteVivo[] = [
  { id: 'sub-r1', dono: 'renato', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'bot1' },
  { id: 'sub-r2', dono: 'renato', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'bot2' },
  { id: 'sub-r3', dono: 'renato', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'bot3' },
]
const catRenato = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, subagentesRenato)
const botsRenatoSubs = catRenato.filter((item) => item.squad === 'bots' && item.id.startsWith('renato:'))
const globaisRenatoSubs = catRenato.filter((item) => item.squad === 'globais' && item.id.startsWith('renato:'))
conferir('3 subagentes do Renato vão para a ilha bots', botsRenatoSubs.length, 3)
conferir('ilha GLOBAIS não ganha nenhum subagente do Renato', globaisRenatoSubs.length, 0)

const subagentesBia: AgenteVivo[] = [
  { id: 'sub-b1', dono: 'bia', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'ads1' },
  { id: 'sub-b2', dono: 'bia', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'ads2' },
  { id: 'sub-b3', dono: 'bia', tipo: 'subagente', estado: 'trabalhando', silencio_s: 0, fase: 'execucao', etapa: 'ads3' },
]
const catBia = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, subagentesBia)
const trafegoBiaSubs = catBia.filter((item) => item.squad === 'tráfego' && item.id.startsWith('bia:'))
const globaisBiaSubs = catBia.filter((item) => item.squad === 'globais' && item.id.startsWith('bia:'))
conferir('3 subagentes da Bia vão para a ilha tráfego', trafegoBiaSubs.length, 3)
conferir('ilha GLOBAIS não ganha nenhum subagente da Bia', globaisBiaSubs.length, 0)

if (falhas) process.exit(1)
console.log('APROVADO: contadores, resoluções e alocação de subagentes dos diretores alinhados.')
