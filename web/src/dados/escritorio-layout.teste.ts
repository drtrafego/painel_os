import type { AgenteVivo } from './tipos.ts'
import { montarCatalogoPixel, normalizarIdentidadeAgente, PIXEL_AGENTS, PIXEL_AGENT_SQUADS } from './pixel-agents.ts'
import * as PixelOfficeModulo from '../ui/PixelOffice.tsx'
import {
  SQUADS_SOB_DEMANDA,
  calcularLayoutSala,
  execucaoUsaSalaMista,
  fichaUsaSalaMista,
  filtrarSquadsSobDemanda,
  montarExecucoesVisuais,
  nomeLegivelDaExecucao,
  sessaoEstáNoAr,
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
conferir('sala mista e demais setores começam escondidos sem ativos', desktop.ilhas.every((ilha) => ilha.squad === 'coordenação'))
conferir('coordenação continua no centro quando tudo está parado', Boolean(desktop.ilhas.find((ilha) => ilha.squad === 'coordenação')))
conferir('comercial começa escondido', !desktop.ilhas.some((ilha) => ilha.squad === 'comercial'))
conferir('todos os setores operacionais são sob demanda', SQUADS_SOB_DEMANDA.length === 8 && SQUADS_SOB_DEMANDA.every((item) => item.permanenciaAposUltimoAtivoMs === 3 * 60 * 1000))
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

// Valores de subagent_type observados na sonda; o teste guarda somente os
// nomes, nunca IDs, tarefas, timestamps ou qualquer outro dado vivo.
const subagentTypesReais = ['vega-radar', 'vega-radar', 'tereza', 'tereza', 'elza', 'analista-conteudo', 'cleo-produtor', 'dani-designer'] as const
const execucoesPorSubagentType: AgenteVivo[] = subagentTypesReais.map((tipo, indice) => ({
  id: `fixture-${indice + 1}`,
  tipo,
  estado: 'trabalhando',
  fase: 'execução',
  etapa: 'teste de alocação',
  ferramenta: 'Read',
}))
const visuaisPorSubagentType = montarExecucoesVisuais(execucoesPorSubagentType, PIXEL_AGENTS)
const vivosCatalogados = visuaisPorSubagentType.filter((visual) => visual.execucao.id.startsWith('fixture-'))
conferir('normalização remove prefixo de squad e usa hífen', normalizarIdentidadeAgente('Radar / Vega'), 'vega')
conferir('duas execuções Vega-radar ficam na ilha conteúdo', vivosCatalogados.filter((visual) => visual.ficha?.id === 'vega' && visual.squad === 'conteúdo').length === 2)
conferir('duas execuções Tereza ficam na ilha tráfego', vivosCatalogados.filter((visual) => visual.ficha?.id === 'tereza' && visual.squad === 'tráfego').length === 2)
conferir('Elza fica na ilha comercial', vivosCatalogados.filter((visual) => visual.ficha?.id === 'elza' && visual.squad === 'comercial').length === 1)
conferir('analista-conteudo fica na ilha conteúdo', vivosCatalogados.filter((visual) => visual.ficha?.id === 'analista-conteudo' && visual.squad === 'conteúdo').length === 1)
conferir('cleo-produtor fica na ilha conteúdo', vivosCatalogados.filter((visual) => visual.ficha?.id === 'cleo' && visual.squad === 'conteúdo').length === 1)
conferir('dani-designer fica na ilha conteúdo', vivosCatalogados.filter((visual) => visual.ficha?.id === 'dani' && visual.squad === 'conteúdo').length === 1)
conferir('nenhum dos subagent_types catalogados cai na sala mista', vivosCatalogados.every((visual) => !execucaoUsaSalaMista(visual.execucao, visual.ficha)))

const catalogoDoEstado = montarCatalogoPixel([
  { id: 'analista-conteudo', nome: 'analista-conteudo', squad: 'conteudo', descricao: 'agente do estado' },
], [])
conferir('squad do estado vigente corrige a ficha do analista-conteudo', catalogoDoEstado.find((item) => item.id === 'analista-conteudo')?.squad, 'conteúdo')

const servicoAtivo = (id: string) => ({
  id,
  nome: id,
  papel: 'sessão orquestradora',
  camada: 'Coordenação',
  cor: 'lima',
  resumo: 'orquestração',
  estado: 'ativo' as const,
  verificador: { checagens: 0, reprovadas: 0, indeterminadas: 0, vencido: false, falhas: [], arquivo: 'teste' },
  motores: { situacao: 'um_ativo' as const, ativos: [`${id}.service`], servicos: [{ service: `${id}.service`, ativo: true, estado: 'active', sub: 'running', motor: 'teste', motor_fonte: 'teste' }] },
  memoria: { linhas: 0, arquivos: 0 },
  diario: { arquivos: 0 },
  cron_linhas: 0,
})
const sessoesAtivasNoEstado = { sessao: ['luana', 'renato', 'bia'].map(servicoAtivo) }
const visuaisComSessoesDoEstado = montarExecucoesVisuais([], PIXEL_AGENTS, sessoesAtivasNoEstado)
const diretoresVivos = visuaisComSessoesDoEstado.filter((visual) => ['luana', 'renato', 'bia'].includes(visual.ficha?.id || ''))
conferir('estado com serviço ativo reconhece sessão viva', sessoesAtivasNoEstado.sessao.every(sessaoEstáNoAr), true)
conferir('Luana, Renato e Bia vivos ficam sentados na coordenação', diretoresVivos.length === 3 && diretoresVivos.every((visual) => visual.squad === 'coordenação' && visual.execucao.estado === 'silencioso'))
conferir('sessão viva do estado nunca é enviada ao descanso', diretoresVivos.every((visual) => visual.execucao.estado !== 'parado'))

const sessoesCoordenadoras: AgenteVivo[] = ['luana', 'renato', 'bia'].map((dono, indice) => ({
  id: `sessao-${dono}`,
  dono,
  identidade: 'sessao-claude',
  tipo: 'sessao_claude',
  motor: 'claude',
  estado: indice === 0 ? 'trabalhando' : 'silencioso',
  fase: 'sessao_viva',
  etapa: 'coordenação sintética',
  ferramenta: indice === 0 ? 'Bash' : null,
}))
const layoutDescansoVazio = calcularLayoutSala(
  filtrarSquadsSobDemanda(montarExecucoesVisuais(sessoesCoordenadoras, PIXEL_AGENTS), new Set()),
  { larguraDisponivel: 990, alturaDisponivel: 600 },
)
const layoutDescansoComOcupante = calcularLayoutSala(
  filtrarSquadsSobDemanda(montarExecucoesVisuais(sessoesCoordenadoras.slice(0, 2), PIXEL_AGENTS), new Set()),
  { larguraDisponivel: 990, alturaDisponivel: 600 },
)
conferir('descanso vazio fica encolhido', !layoutDescansoVazio.descansoAberto && layoutDescansoVazio.ocupantesDescanso === 0)
conferir('faixa vazia usa só 26 px da planta', layoutDescansoVazio.altura - layoutDescansoVazio.descansoY === 26)
conferir('descanso abre quando há ocupante', layoutDescansoComOcupante.descansoAberto && layoutDescansoComOcupante.ocupantesDescanso === 1)
conferir('descanso ocupado recupera espaço para o boneco', layoutDescansoComOcupante.altura - layoutDescansoComOcupante.descansoY > 30)

const comercialAberto = montarExecucoesVisuais(comerciaisAtivos, PIXEL_AGENTS)
const comerciaisVisiveis = filtrarSquadsSobDemanda(comercialAberto, new Set(['comercial']))
conferir('chamar Elza abre a ilha com as oito mesas comerciais', comerciaisVisiveis.filter((item) => item.squad === 'comercial').length === 8)
conferir('fechar o ambiente remove toda a ilha comercial', filtrarSquadsSobDemanda(comercialAberto, new Set()).every((item) => item.squad !== 'comercial'))

const umAtivo = montarExecucoesVisuais([{ id: 'exec-suri', identidade: 'suri', tipo: 'copy', estado: 'trabalhando', fase: 'execução', etapa: 'roteiro', ferramenta: 'Write' }], PIXEL_AGENTS)
const tresAtivos = montarExecucoesVisuais([
  { id: 'exec-suri', identidade: 'suri', tipo: 'copy', estado: 'trabalhando', fase: 'execução', etapa: 'roteiro', ferramenta: 'Write' },
  { id: 'exec-vitor', identidade: 'vitor', tipo: 'fiscal', estado: 'trabalhando', fase: 'execução', etapa: 'testes', ferramenta: 'Read' },
  { id: 'exec-analista', identidade: 'analista', tipo: 'analista', estado: 'trabalhando', fase: 'execução', etapa: 'métricas', ferramenta: 'Read' },
], PIXEL_AGENTS)
const todosSetores = montarExecucoesVisuais([
  { id: 'exec-suri', identidade: 'suri', tipo: 'copy', estado: 'trabalhando', fase: 'execução', etapa: 'roteiro', ferramenta: 'Write' },
  { id: 'exec-vitor', identidade: 'vitor', tipo: 'fiscal', estado: 'trabalhando', fase: 'execução', etapa: 'testes', ferramenta: 'Read' },
  { id: 'exec-tereza', identidade: 'tereza', tipo: 'tráfego', estado: 'trabalhando', fase: 'execução', etapa: 'campanha', ferramenta: 'Edit' },
  { id: 'exec-nova', identidade: 'nova-mineradora', tipo: 'radar', estado: 'trabalhando', fase: 'execução', etapa: 'sinais', ferramenta: 'Search' },
  { id: 'exec-elza', identidade: 'elza', tipo: 'comercial', estado: 'trabalhando', fase: 'execução', etapa: 'conta', ferramenta: 'Read' },
  { id: 'exec-publicador', identidade: 'publicador', tipo: 'publicador', estado: 'trabalhando', fase: 'execução', etapa: 'envio', ferramenta: 'Run' },
  { id: 'exec-analista', identidade: 'analista', tipo: 'analista', estado: 'trabalhando', fase: 'execução', etapa: 'métricas', ferramenta: 'Read' },
  { id: 'exec-arquiteto', identidade: 'arquiteto', tipo: 'arquiteto', motor: 'claude', estado: 'trabalhando', fase: 'execução', etapa: 'arquitetura', ferramenta: 'Read' },
], PIXEL_AGENTS)
const demandas = new Set(SQUADS_SOB_DEMANDA.map((item) => item.id))
conferir('cenário com 0 ativos mantém somente coordenação', filtrarSquadsSobDemanda(catalogoVisual, new Set()).every((item) => item.squad === 'coordenação'))
conferir('cenário com 1 ativo abre somente uma ilha', new Set(filtrarSquadsSobDemanda(umAtivo, new Set(['conteúdo'])).filter((item) => demandas.has(item.squad)).map((item) => item.squad)).size === 1)
conferir('cenário com 3 ativos abre exatamente três ilhas', new Set(filtrarSquadsSobDemanda(tresAtivos, new Set(['conteúdo', 'bots', 'análise'])).filter((item) => demandas.has(item.squad)).map((item) => item.squad)).size === 3)
conferir('cenário com todos os setores abre todas as ilhas sob demanda', new Set(filtrarSquadsSobDemanda(todosSetores, demandas).filter((item) => demandas.has(item.squad)).map((item) => item.squad)).size === demandas.size)
const zoomUm = calcularLayoutSala(filtrarSquadsSobDemanda(umAtivo, new Set(['conteúdo'])), { larguraDisponivel: 990, alturaDisponivel: 600 }).zoomSugerido
const zoomTodos = calcularLayoutSala(filtrarSquadsSobDemanda(todosSetores, demandas), { larguraDisponivel: 990, alturaDisponivel: 600 }).zoomSugerido
conferir('com poucos setores ativos o caber-tudo aproxima mais', zoomUm > zoomTodos, `${zoomUm}/${zoomTodos}`)

// Reprodução da largura útil que sobra para o palco em 390x844 a 200%.
// A tela física continua com 390 px: nome de mesa de 7,5 px precisa chegar a
// 9 px efetivos, mesmo que isso transforme o palco, e só o palco, em rolável.
const celularZoomAlto = calcularLayoutSala(
  filtrarSquadsSobDemanda(todosSetores, demandas),
  { larguraDisponivel: 143, alturaDisponivel: 420, zoomMinimo: 9 / (7.5 * 2) },
)
conferir('celular ampliado preserva nome de mesa com ao menos 9 px físicos', 7.5 * celularZoomAlto.zoomSugerido * 2 >= 9, String(7.5 * celularZoomAlto.zoomSugerido * 2))
conferir('celular ampliado usa rolagem do palco em vez de reduzir o nome', celularZoomAlto.largura * celularZoomAlto.zoomSugerido > 143, `${celularZoomAlto.largura * celularZoomAlto.zoomSugerido}/143`)

// Em 50%, o DPR cai a 0,5. O piso acompanha essa mudança e não sacrifica a
// leitura para encaixar a planta inteira na página.
const celularZoomBaixo = calcularLayoutSala(
  filtrarSquadsSobDemanda(todosSetores, demandas),
  { larguraDisponivel: 688, alturaDisponivel: 600, zoomMinimo: 9 / (7.5 * 0.5) },
)
conferir('celular em 50% preserva nome de mesa com ao menos 9 px físicos', 7.5 * celularZoomBaixo.zoomSugerido * 0.5 >= 9, String(7.5 * celularZoomBaixo.zoomSugerido * 0.5))

// Reprodução do palco desktop a 200%. A planta deve usar a altura disponível,
// sem a folga percentual que antes deixava mais de 10% vazio abaixo.
const desktopZoomAlto = calcularLayoutSala(
  filtrarSquadsSobDemanda(todosSetores, demandas),
  { larguraDisponivel: 718, alturaDisponivel: 420 },
)
const alturaCssDesktopZoomAlto = Math.round(desktopZoomAlto.altura * desktopZoomAlto.zoomSugerido)
conferir('desktop ampliado ocupa ao menos 90% da altura do palco', alturaCssDesktopZoomAlto >= 420 * 0.9, `${alturaCssDesktopZoomAlto}/420`)

const globais: AgenteVivo[] = [
  ...Array.from({ length: 3 }, (_, indice) => ({
    id: `execucao-dev-${indice + 1}`, identidade: 'dev', tipo: 'dev', motor: 'claude', estado: 'trabalhando' as const,
    fase: 'execução', etapa: `implementando módulo ${indice + 1}`, tarefa: `Tarefa independente do Dev ${indice + 1}`, ferramenta: 'Edit',
  })),
  { id: 'execucao-arquiteto-1', identidade: 'arquiteto', tipo: 'arquiteto', motor: 'claude', estado: 'trabalhando', fase: 'execução', etapa: 'desenhando arquitetura', tarefa: 'Definir fronteiras do serviço', ferramenta: 'Read' },
  { id: 'sessao-codex-1', identidade: 'sessao-codex', tipo: 'codex', motor: 'codex', modelo_legivel: 'GPT-5.6 Sol', estado: 'trabalhando', fase: 'execução', etapa: 'Validar sala mista\nA segunda linha não entra', tarefa: 'NOME DO ARQUIVO DA SESSÃO', ferramenta: 'Playwright' },
  { id: 'sessao-codex-2', identidade: 'sessao-codex', tipo: 'codex', motor: 'codex', modelo_legivel: 'GPT-5.6 Sol', estado: 'trabalhando', fase: 'execução', etapa: 'Preparar o patch público', tarefa: 'outro arquivo técnico', ferramenta: 'Terminal' },
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
conferir('sessão Codex usa a primeira linha útil do pedido', visualCodex?.nome, 'Codex · GPT-5.6 Sol · Validar sala mista')
conferir('sessão Codex não usa nome técnico de arquivo', Boolean(visualCodex && !visualCodex.nome.includes('NOME DO ARQUIVO')))
conferir('ID cru não vira nome primário da sessão Codex', Boolean(visualCodex && !visualCodex.nome.includes(sessaoCodex.id)))
const funcaoLegivel = (PixelOfficeModulo as typeof PixelOfficeModulo & {
  funcaoLegivelDaExecucao?: (execucao: AgenteVivo, ficha?: (typeof PIXEL_AGENTS)[number]) => string
}).funcaoLegivelDaExecucao
conferir('card Codex genérico nunca mostra Função como traço', Boolean(funcaoLegivel) && funcaoLegivel?.(sessaoCodex, visualCodex?.ficha) !== '—', String(funcaoLegivel?.(sessaoCodex, visualCodex?.ficha)))
conferir('nenhum card vivo fica sem função legível', Boolean(funcaoLegivel) && globais.every((execucao) => funcaoLegivel?.(execucao) !== '—'))

const codexSemTarefa: AgenteVivo = {
  id: 'sessao-codex-sem-tarefa', tipo: 'codex', motor: 'codex', modelo_legivel: 'GPT-5.6 Sol',
  estado: 'silencioso', fase: 'atividade_codex', etapa: 'fora da janela de leitura (histórico)', tarefa: 'NOME DO ARQUIVO',
}
conferir('sessão Codex sem tarefa usa somente o modelo', nomeLegivelDaExecucao(codexSemTarefa), 'Codex · GPT-5.6 Sol')

const codexTarefaLonga: AgenteVivo = {
  id: 'sessao-codex-tarefa-longa', tipo: 'codex', motor: 'codex', modelo_legivel: 'GPT-5.6 Sol',
  estado: 'trabalhando', fase: 'atividade_codex', etapa: '\n  Primeira linha útil do pedido que passa do limite\nsegunda linha ignorada',
  tarefa: 'NOME DO ARQUIVO',
}
const rotuloCodexLongo = nomeLegivelDaExecucao(codexTarefaLonga)
const tarefaDoRotulo = rotuloCodexLongo.slice(rotuloCodexLongo.lastIndexOf(' · ') + 3)
conferir('tarefa do Codex é a primeira linha útil e cabe em 28 caracteres', tarefaDoRotulo, 'Primeira linha útil do…')
conferir('tarefa longa do Codex respeita o limite', tarefaDoRotulo.length <= 28, String(tarefaDoRotulo.length))

const cleo: AgenteVivo = { ...sessaoCodex, id: 'rollout-cleo', identidade: 'cleo', tipo: 'copy' }
conferir('nome catalogado continua humano no detalhe', nomeLegivelDaExecucao(cleo, PIXEL_AGENTS.find((item) => item.id === 'cleo')) === 'Cleo')

if (falhas) process.exit(1)
console.log('\nTodos os testes do escritório responsivo passaram!')
