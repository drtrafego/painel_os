import type { AgenteVivo } from './tipos.ts'
import { PIXEL_AGENTS, PIXEL_AGENT_SQUADS } from './pixel-agents.ts'
import {
  SQUADS_SOB_DEMANDA,
  calcularLayoutSala,
  fichaUsaSalaMista,
  filtrarSquadsSobDemanda,
  montarExecucoesVisuais,
  nomeLegivelDaExecucao,
} from '../ui/PixelOffice.tsx'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) console.log(`ok   ${nome}`)
  else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

const fichasFixas = PIXEL_AGENTS.filter((ficha) => !fichaUsaSalaMista(ficha))
const catalogoVisual = montarExecucoesVisuais([], PIXEL_AGENTS)
const escritorioSemComercial = filtrarSquadsSobDemanda(catalogoVisual, new Set())
const desktop = calcularLayoutSala(escritorioSemComercial, { larguraDisponivel: 990, alturaDisponivel: 600 })
const celular = calcularLayoutSala(escritorioSemComercial, { larguraDisponivel: 360, alturaDisponivel: 420 })

conferir('papéis globais não ganham mesa fixa', catalogoVisual.length === fichasFixas.length)
conferir('Dev, QA e Explore saem das ilhas fixas', ['dev', 'qa', 'explore'].every((id) => !catalogoVisual.some((item) => item.ficha?.id === id)))
conferir('a sala mista existe vazia e compacta', Boolean(desktop.ilhas.find((ilha) => ilha.squad === 'sala mista')?.compacta))
conferir('a sala mista vazia oferece poucos postos compartilhados', desktop.ilhas.find((ilha) => ilha.squad === 'sala mista')?.postos.length === 3)
conferir('comercial começa escondido', !desktop.ilhas.some((ilha) => ilha.squad === 'comercial'))
conferir('configuração sob demanda começa somente no comercial', SQUADS_SOB_DEMANDA.length === 1 && SQUADS_SOB_DEMANDA[0].id === 'comercial')
conferir('comercial permanece alguns minutos depois do último ativo', SQUADS_SOB_DEMANDA[0].permanenciaAposUltimoAtivoMs >= 2 * 60 * 1000)
conferir('nomes aparecem sob todas as mesas ocupadas', catalogoVisual.every((item) => item.rotulos.length > 0))

for (const [nome, layout, largura, altura] of [
  ['desktop', desktop, 990, 600],
  ['celular', celular, 360, 420],
] as const) {
  const larguraRenderizada = layout.largura * layout.zoomSugerido
  const alturaRenderizada = layout.altura * layout.zoomSugerido
  conferir(`${nome}: caber tudo respeita a largura`, larguraRenderizada <= largura + 0.5, `${larguraRenderizada}/${largura}`)
  conferir(`${nome}: caber tudo respeita a altura`, alturaRenderizada <= altura + 0.5, `${alturaRenderizada}/${altura}`)
  conferir(`${nome}: sala ocupa praticamente toda a largura`, larguraRenderizada >= largura * 0.97, `${larguraRenderizada}/${largura}`)
}

const ilhaCoordenacao = desktop.ilhas.find((ilha) => ilha.squad === 'coordenação')
conferir('coordenação continua numa ilha própria', Boolean(ilhaCoordenacao && ilhaCoordenacao.mesas.every((mesa) => mesa.execucao.squad === 'coordenação')))

for (const squad of PIXEL_AGENT_SQUADS) {
  if (squad.id === 'sala mista') continue
  const membros = catalogoVisual.filter((item) => item.squad === squad.id)
  if (!membros.length) continue
  const membrosSemChefes = membros.filter((item) => !['luana', 'renato', 'bia'].includes(item.ficha?.id || ''))
  conferir(`${squad.nome}: roupa usa a cor do squad`, membrosSemChefes.every((item) => item.cor === squad.cor))
}

const comerciaisAtivos: AgenteVivo[] = [{
  id: 'exec-elza', identidade: 'elza', tipo: 'diretora-comercial', estado: 'trabalhando',
  fase: 'execução', etapa: 'qualificando conta', ferramenta: 'Read',
}]
const comercialAberto = montarExecucoesVisuais(comerciaisAtivos, PIXEL_AGENTS)
const comerciaisVisiveis = filtrarSquadsSobDemanda(comercialAberto, new Set(['comercial']))
conferir('chamar Elza abre a ilha com as oito mesas comerciais', comerciaisVisiveis.filter((item) => item.squad === 'comercial').length === 8)
conferir('fechar o ambiente remove toda a ilha comercial', filtrarSquadsSobDemanda(comercialAberto, new Set()).every((item) => item.squad !== 'comercial'))

const globais: AgenteVivo[] = [
  ...Array.from({ length: 3 }, (_, indice) => ({
    id: `execucao-dev-${indice + 1}`, identidade: 'dev', tipo: 'dev', motor: 'claude', estado: 'trabalhando' as const,
    fase: 'execução', etapa: `implementando módulo ${indice + 1}`, tarefa: `Tarefa independente do Dev ${indice + 1}`, ferramenta: 'Edit',
  })),
  { id: 'execucao-arquiteto-1', identidade: 'arquiteto', tipo: 'arquiteto', motor: 'claude', estado: 'trabalhando', fase: 'execução', etapa: 'desenhando arquitetura', tarefa: 'Definir fronteiras do serviço', ferramenta: 'Read' },
  { id: 'sessao-codex-1', identidade: 'sessao-codex', tipo: 'codex', motor: 'codex', modelo_legivel: 'GPT-5.6 Sol', estado: 'trabalhando', fase: 'execução', etapa: 'teste visual', tarefa: 'Validar sala mista', ferramenta: 'Playwright' },
  { id: 'sessao-codex-2', identidade: 'sessao-codex', tipo: 'codex', motor: 'codex', modelo_legivel: 'GPT-5.6 Sol', estado: 'trabalhando', fase: 'execução', etapa: 'build', tarefa: 'Preparar o patch público', ferramenta: 'Terminal' },
]
const comGlobais = montarExecucoesVisuais(globais, PIXEL_AGENTS)
const ocupantes = comGlobais.filter((item) => item.squad === 'sala mista')
conferir('3 dev + 1 arquiteto + 2 Codex geram seis bonecos no coworking', ocupantes.length === 6)
conferir('os seis ocupantes são distintos', new Set(ocupantes.map((item) => item.chave)).size === 6 && new Set(ocupantes.map((item) => item.nome)).size === 6)
conferir('cada ocupante conserva sua tarefa para o detalhe', ocupantes.every((item) => Boolean(item.execucao.tarefa)))
conferir('todos usam posto compartilhado, nenhum vira mesa fixa', ocupantes.every((item) => item.temporaria))

for (let restantes = globais.length - 1; restantes >= 0; restantes -= 1) {
  const visuais = montarExecucoesVisuais(globais.slice(0, restantes), PIXEL_AGENTS)
  conferir(`saída sequencial deixa ${restantes} no coworking`, visuais.filter((item) => item.squad === 'sala mista').length === restantes)
}

const sessaoCodex = globais[4]
const visualCodex = ocupantes.find((item) => item.execucao.id === sessaoCodex.id)
conferir('sessão Codex desconhecida tem nome legível', Boolean(visualCodex?.nome.startsWith('Codex · GPT-5.6 Sol')))
conferir('ID cru não vira nome primário da sessão Codex', Boolean(visualCodex && !visualCodex.nome.includes(sessaoCodex.id)))

const cleo: AgenteVivo = { ...sessaoCodex, id: 'rollout-cleo', identidade: 'cleo', tipo: 'copy' }
conferir('nome catalogado continua humano no detalhe', nomeLegivelDaExecucao(cleo, PIXEL_AGENTS.find((item) => item.id === 'cleo')) === 'Cleo')

if (falhas) process.exit(1)
console.log('\nTodos os testes do escritório responsivo passaram!')
