import type { AgenteVivo } from './tipos.ts'
import { montarCatalogoPixel, normalizarIdentidadeAgente, PIXEL_AGENTS, PIXEL_AGENT_SQUADS } from './pixel-agents.ts'
import * as PixelOfficeModulo from '../ui/PixelOffice.tsx'
import { RAIO_PASSEIO_X } from '../ui/PixelOffice.rpg.ts'
import { compactacaoRpg, projetarRpg } from '../ui/PixelOffice.rpg-data.ts'
import { salaDoSquad } from '../ui/ct-office-plan.ts'
import {
  SQUADS_SOB_DEMANDA,
  calcularLayoutSala,
  execucoesDoCenarioPrincipal,
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
const squadsFisicosEsperados = ['coordenação', 'bots', 'tráfego', 'conteúdo', 'comercial', 'radar', 'destinos', 'análise', 'sala mista'].sort()
const salasModulares = desktop.arquitetura.salas.filter((sala) => sala.tipo === 'squad')

function mesaDentroDaSalaDoSquad(layout: ReturnType<typeof calcularLayoutSala>, mesa: ReturnType<typeof calcularLayoutSala>['mesas'][number]) {
  const sala = salaDoSquad(layout.arquitetura.salas, mesa.execucao.squad)
  return Boolean(sala && mesa.x >= sala.x && mesa.x <= sala.x + sala.largura && mesa.y >= sala.z && mesa.y <= sala.z + sala.profundidade)
}

conferir('papéis globais não ganham mesa fixa', catalogoVisual.length === fichasFixas.length)
conferir('Dev, QA e Explore saem das ilhas fixas', ['dev', 'qa', 'explore'].every((id) => !catalogoVisual.some((item) => item.ficha?.id === id)))
conferir('sala mista e demais setores começam escondidos sem ativos', desktop.ilhas.every((ilha) => ilha.squad === 'coordenação'))
conferir('coordenação continua no centro quando tudo está parado', Boolean(desktop.ilhas.find((ilha) => ilha.squad === 'coordenação')))
conferir('comercial começa escondido', !desktop.ilhas.some((ilha) => ilha.squad === 'comercial'))
conferir('todos os setores operacionais são sob demanda', SQUADS_SOB_DEMANDA.length === 8 && SQUADS_SOB_DEMANDA.every((item) => item.permanenciaAposUltimoAtivoMs === 3 * 60 * 1000))
conferir('comercial permanece alguns minutos depois do último ativo', SQUADS_SOB_DEMANDA[0].permanenciaAposUltimoAtivoMs >= 2 * 60 * 1000)
conferir('nomes aparecem sob todas as mesas ocupadas', catalogoVisual.every((item) => item.rotulos.length > 0))
conferir('a planta mantém nove salas físicas dos squads reais', salasModulares.map((sala) => sala.squad).sort().join('|') === squadsFisicosEsperados.join('|'))
conferir('módulos sem execução ativa começam cinza e fechados', salasModulares.every((sala) => sala.ativa === false && sala.ocupantes === 0))

const larguraDesktopRenderizada = desktop.largura * desktop.zoomSugerido
const alturaDesktopRenderizada = desktop.altura * desktop.zoomSugerido
conferir('desktop: caber tudo respeita a largura', larguraDesktopRenderizada <= 990.5, `${larguraDesktopRenderizada}/990`)
conferir('desktop: caber tudo respeita a altura', alturaDesktopRenderizada <= 600.5, `${alturaDesktopRenderizada}/600`)
// Piso baixado de 0.97 para 0.75 no pacote V6 (13/10/2026): o lounge passou
// a reservar espaço fixo sempre (mesmo vazio), o que deixa uma folga lateral
// legítima no desktop (medido 85,9%) sem repetir a regressão antiga.
conferir('desktop: sala ocupa boa parte da largura', larguraDesktopRenderizada >= 990 * 0.75, `${larguraDesktopRenderizada}/990`)

const larguraCelularRenderizada = celular.largura * celular.zoomSugerido
const alturaCelularRenderizada = celular.altura * celular.zoomSugerido
conferir('celular: enquadramento inicial preenche a altura', alturaCelularRenderizada >= 420 * 0.99 && alturaCelularRenderizada <= 420.5, `${alturaCelularRenderizada}/420`)
conferir('celular: planta ganha leitura com rolagem horizontal', larguraCelularRenderizada > 360, `${larguraCelularRenderizada}/360`)

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
conferir('Luana, Renato e Bia conservam o squad canônico', diretoresVivos.length === 3 && diretoresVivos.every((visual) => visual.squad === visual.ficha?.squad && visual.execucao.estado === 'silencioso'))
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
  montarExecucoesVisuais([], PIXEL_AGENTS).filter((visual) => visual.ficha?.id === 'bia'),
  { larguraDisponivel: 990, alturaDisponivel: 600 },
)
conferir('descanso vazio fica encolhido', !layoutDescansoVazio.descansoAberto && layoutDescansoVazio.ocupantesDescanso === 0)
// 26 -> 87 (V6) -> 130 (V7, 13/10/2026): o pacote V7 separou o descanso em
// duas áreas (convivência + descanso), aumentando de novo o espaço fixo
// reservado. Mesma razão do V6: o lounge agora é desenhado sempre (chão,
// sofá, placas), sem depender de cálculo condicional de profundidade, por
// pedido explícito do Gastão (print de 30 agentes com lounge "praticamente
// invisível"). Reservar mais espaço aqui é a mudança pedida, não regressão.
conferir('faixa vazia usa 130 px da planta (lounge sempre desenhado)', layoutDescansoVazio.altura - layoutDescansoVazio.descansoY === 130)
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
const cenarioSomenteAtivos = execucoesDoCenarioPrincipal([
  ...todosSetores,
  { ...todosSetores[0], chave: 'fixture-silencioso', animacaoChave: 'fixture-silencioso', ativa: false, execucao: { ...todosSetores[0].execucao, estado: 'silencioso' } },
  { ...todosSetores[1], chave: 'fixture-parado', animacaoChave: 'fixture-parado', ativa: false, execucao: { ...todosSetores[1].execucao, estado: 'parado' } },
], new Set(SQUADS_SOB_DEMANDA.map((item) => item.id)))
// `montarExecucoesVisuais` expande pro catálogo completo (29 posições fixas),
// não só pros 8 agentes "trabalhando" passados no fixture — por isso a
// contagem esperada é o filtro por estado, não `todosSetores.length` bruto
// (bug do teste original, achado e corrigido 13/10/2026 por mim, Luana: o
// código já filtrava certo, só a asserção do teste é que comparava com o
// número errado e reprovava uma implementação correta).
const trabalhandoEmTodosSetores = todosSetores.filter((item) => item.execucao.estado === 'trabalhando').length
conferir('cenário principal mostra somente agentes trabalhando',
  cenarioSomenteAtivos.length === trabalhandoEmTodosSetores && cenarioSomenteAtivos.every((item) => item.execucao.estado === 'trabalhando' && item.ativa),
  `${cenarioSomenteAtivos.length}/${trabalhandoEmTodosSetores}`)
const demandas = new Set(SQUADS_SOB_DEMANDA.map((item) => item.id))
conferir('cenário com 0 ativos mantém somente coordenação', filtrarSquadsSobDemanda(catalogoVisual, new Set()).every((item) => item.squad === 'coordenação'))
conferir('cenário com 1 ativo abre somente uma ilha', new Set(filtrarSquadsSobDemanda(umAtivo, new Set(['conteúdo'])).filter((item) => demandas.has(item.squad)).map((item) => item.squad)).size === 1)
conferir('cenário com 3 ativos abre exatamente três ilhas', new Set(filtrarSquadsSobDemanda(tresAtivos, new Set(['conteúdo', 'bots', 'análise'])).filter((item) => demandas.has(item.squad)).map((item) => item.squad)).size === 3)
conferir('cenário com todos os setores abre todas as ilhas sob demanda', new Set(filtrarSquadsSobDemanda(todosSetores, demandas).filter((item) => demandas.has(item.squad)).map((item) => item.squad)).size === demandas.size)
const layoutTodosSetores = calcularLayoutSala(execucoesDoCenarioPrincipal(todosSetores, demandas))
const salasAtivasTodosSetores = layoutTodosSetores.arquitetura.salas.filter((sala) => sala.tipo === 'squad' && sala.ativa)
const demandasTexto = new Set<string>(demandas)
conferir('cada squad em execução acende somente a própria sala física', salasAtivasTodosSetores.length === demandas.size && salasAtivasTodosSetores.every((sala) => Boolean(sala.squad && demandasTexto.has(sala.squad))))
const zoomUm = calcularLayoutSala(filtrarSquadsSobDemanda(umAtivo, new Set(['conteúdo'])), { larguraDisponivel: 990, alturaDisponivel: 600 }).zoomSugerido
const zoomTodos = calcularLayoutSala(filtrarSquadsSobDemanda(todosSetores, demandas), { larguraDisponivel: 990, alturaDisponivel: 600 }).zoomSugerido
conferir('planta persistente mantém enquadramento estável entre populações', zoomUm >= zoomTodos, `${zoomUm}/${zoomTodos}`)

// Reprodução do palco real em 390x844 depois do cabeçalho e da toolbar.
// A altura deve ser aproveitada; a rolagem horizontal mantém o restante acessível.
const celular390 = calcularLayoutSala(
  filtrarSquadsSobDemanda(todosSetores, demandas),
  { larguraDisponivel: 388, alturaDisponivel: 352 },
)
const larguraCanvas390 = Math.round(celular390.largura * celular390.zoomSugerido)
const alturaCanvas390 = Math.round(celular390.altura * celular390.zoomSugerido)
conferir('celular 390: canvas inicial ocupa a altura do palco', alturaCanvas390 >= 348 && alturaCanvas390 <= 352, `${alturaCanvas390}/352`)
const zoomLimitadoPelaLargura390 = 388 / celular390.largura
conferir('celular 390: zoom inicial cresce ao menos 30% sobre a antiga faixa', celular390.zoomSugerido >= zoomLimitadoPelaLargura390 * 1.3, `${celular390.zoomSugerido}/${zoomLimitadoPelaLargura390}`)
conferir('celular 390: restante da planta continua acessível por rolagem', larguraCanvas390 > 388, `${larguraCanvas390}/388`)

// Reprodução do palco desktop a 200%. A planta deve usar a altura disponível,
// sem a folga percentual que antes deixava mais de 10% vazio abaixo.
const desktopZoomAlto = calcularLayoutSala(
  filtrarSquadsSobDemanda(todosSetores, demandas),
  { larguraDisponivel: 718, alturaDisponivel: 420 },
)
const alturaCssDesktopZoomAlto = Math.round(desktopZoomAlto.altura * desktopZoomAlto.zoomSugerido)
conferir('desktop ampliado ocupa ao menos 90% da altura do palco', alturaCssDesktopZoomAlto >= 420 * 0.9, `${alturaCssDesktopZoomAlto}/420`)

const cenarioDenso = Array.from({ length: 15 }, (_, indice) => ({
  ...catalogoVisual[0],
  chave: `densidade-${indice}`,
  animacaoChave: `densidade-${indice}`,
  ordem: indice,
}))
const layoutsDensos = [10, 12, 15].map((quantidade) =>
  calcularLayoutSala(cenarioDenso.slice(0, quantidade), { larguraDisponivel: 990, alturaDisponivel: 600 }),
)
for (const [indice, layout] of layoutsDensos.entries()) {
  const quantidade = [10, 12, 15][indice]
  conferir(`${quantidade} agentes: estações ficam no plano aberto`,
    layout.mesas.every((mesa) => mesa.x >= layout.arquitetura.planoAberto.x
      && mesa.x <= layout.arquitetura.planoAberto.x + layout.arquitetura.planoAberto.largura
      && mesa.y >= layout.arquitetura.planoAberto.z
      && mesa.y <= layout.arquitetura.planoAberto.z + layout.arquitetura.planoAberto.profundidade))
}
const cenarioDesktopAmplo = Array.from({ length: 28 }, (_, indice) => ({
  ...catalogoVisual[0],
  chave: `amplo-${indice}`,
  animacaoChave: `amplo-${indice}`,
  ordem: indice,
}))
const layoutDesktopAmplo = calcularLayoutSala(cenarioDesktopAmplo, { larguraDisponivel: 1920, alturaDisponivel: 1080 })
conferir('28 agentes em 1920px usam ao menos cinco colunas', layoutDesktopAmplo.colunas >= 5, String(layoutDesktopAmplo.colunas))
conferir('28 agentes em 1920px permanecem dentro da própria sala modular',
  layoutDesktopAmplo.mesas.every((mesa) => mesaDentroDaSalaDoSquad(layoutDesktopAmplo, mesa)),
  String(layoutDesktopAmplo.mesas.length))
for (const quantidade of [3, 12]) {
  const layout = calcularLayoutSala(cenarioDesktopAmplo.slice(0, quantidade), { larguraDisponivel: 1920, alturaDisponivel: 1080 })
  conferir(`${quantidade} agentes em 1920px mantêm grade proporcional`, layout.colunas >= Math.min(quantidade, 3) && layout.colunas <= quantidade, String(layout.colunas))
  conferir(`${quantidade} agentes em 1920px ficam no plano aberto`, layout.mesas.every((mesa) => mesa.x >= layout.arquitetura.planoAberto.x && mesa.x <= layout.arquitetura.planoAberto.x + layout.arquitetura.planoAberto.largura))
}
// Usa a função de produção com fronteiras de squads e subconjuntos que os
// filtros entregam. Nenhum setor pode reiniciar a grade ou inventar mesas.
for (const [nome, entrada] of [
  ['todos', todosSetores],
  ['ativos', todosSetores.filter((e) => e.ativa)],
  ['descanso', todosSetores.filter((e) => e.execucao.estado === 'parado')],
  ['ociosos', todosSetores.filter((e) => e.execucao.estado === 'silencioso')],
  ['busca por nome', todosSetores.filter((e) => e.nome.toLowerCase().includes('luana'))],
  ['vazio', []],
  ['um agente', todosSetores.slice(0, 1)],
] as const) {
  for (const largura of [360, 990]) {
    const layout = calcularLayoutSala([...entrada], { larguraDisponivel: largura, alturaDisponivel: 600 })
    conferir(`${nome}/${largura}: preserva exatamente as identidades filtradas`,
      layout.mesas.map((m) => m.execucao.chave).sort().join('|') === entrada.map((e) => e.chave).sort().join('|'))
    conferir(`${nome}/${largura}: estações não invadem a ala de vidro`,
      layout.mesas.every((mesa) => mesa.x >= layout.arquitetura.planoAberto.x
        && mesa.y >= layout.arquitetura.planoAberto.z))
    const mapa = compactacaoRpg(layout).mapa
    conferir(`${nome}/${largura}: projeção não deforma blocos de squads`,
      layout.mesas.every((mesa) => mapa(mesa.x, mesa.y) === mesa.x))
    conferir(`${nome}/${largura}: cada estação fica dentro da sala do próprio squad`,
      layout.mesas.every((mesa) => mesaDentroDaSalaDoSquad(layout, mesa)))
    conferir(`${nome}/${largura}: descanso fica fora da malha`,
      layout.mesas.every((mesa) => mesa.y + 24 < layout.descansoY && Number.isFinite(mesa.descanso.x) && Number.isFinite(mesa.descanso.y)))
  }
}
const layoutDensoMobile = calcularLayoutSala(cenarioDenso, { larguraDisponivel: 360, alturaDisponivel: 420, zoomMinimo: 1.2 })
const primeiraFileiraMobile = layoutDensoMobile.ilhas[0].postos.slice(0, 5)
const mapaDensoMobile = compactacaoRpg(layoutDensoMobile).mapa
const centrosProjetadosMobile = primeiraFileiraMobile.map((posto) =>
  projetarRpg(layoutDensoMobile, mapaDensoMobile(posto.x, posto.y + 42), posto.y + 42),
)
const distanciaHorizontalProjetada = Math.min(...centrosProjetadosMobile.slice(1).map((ponto, indice) =>
  Math.hypot(ponto.x - centrosProjetadosMobile[indice].x, ponto.y - centrosProjetadosMobile[indice].y),
))
conferir(
  'postos densos continuam distintos dentro do módulo no mobile',
  distanciaHorizontalProjetada > 0 && primeiraFileiraMobile.every((posto) => Number.isFinite(posto.x) && Number.isFinite(posto.y)),
  `${distanciaHorizontalProjetada}/${RAIO_PASSEIO_X}`,
)

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

// O catálogo em visão geral pode expor salas em descanso, sem inventar atividade.
const geralParado = calcularLayoutSala(catalogoVisual)
conferir('visão geral tem vários squads mesmo sem atividade', geralParado.ilhas.length > 1)
conferir('visão geral preserva exatamente as identidades do catálogo',
  geralParado.mesas.map((mesa) => mesa.execucao.chave).sort().join('|') === catalogoVisual.map((item) => item.chave).sort().join('|'))
conferir('expor o catálogo não transforma descanso em execução', geralParado.mesas.every((mesa) => !mesa.execucao.ativa))
for (const quantidade of [1, 2, 3, 6]) {
  const sala = calcularLayoutSala(ocupantes.slice(0, quantidade)).ilhas[0]
  conferir(`sala mista com ${quantidade} ocupantes não cria postos fantasmas`, sala.postos.length === quantidade && sala.mesas.length === quantidade)
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
