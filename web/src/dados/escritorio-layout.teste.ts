import type { AgenteVivo } from './tipos.ts'
import { PIXEL_AGENTS, PIXEL_AGENT_SQUADS } from './pixel-agents.ts'
import { calcularLayoutSala, montarExecucoesVisuais, nomeLegivelDaExecucao } from '../ui/PixelOffice.tsx'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) console.log(`ok   ${nome}`)
  else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

// A sala vazia de runtimes continua sendo o catálogo inteiro, nunca uma sala vazia.
const catalogoVisual = montarExecucoesVisuais([], PIXEL_AGENTS)
const desktop = calcularLayoutSala(catalogoVisual)
const celular = calcularLayoutSala(catalogoVisual, true)

conferir('todo agente do catálogo ganha um boneco fixo', catalogoVisual.length === PIXEL_AGENTS.length)
conferir('todo agente do catálogo ganha uma mesa fixa', desktop.mesas.length === PIXEL_AGENTS.length)
conferir('o argumento móvel preserva todas as mesas', celular.mesas.length === PIXEL_AGENTS.length)
conferir('cada squad populado ganha uma ilha', desktop.ilhas.length === new Set(PIXEL_AGENTS.map((agente) => agente.squad)).size)
conferir('o escritório inteiro cabe em altura de desktop', desktop.altura < 900, `altura=${desktop.altura}`)
conferir('layout móvel usa a mesma planta geral para enquadrar várias ilhas', celular.ilhas.length === desktop.ilhas.length && celular.altura === desktop.altura)
conferir('nomes aparecem sob todas as mesas', catalogoVisual.every((item) => item.rotulos.length > 0))
const ilhaCoordenacao = desktop.ilhas.find((ilha) => ilha.squad === 'coordenação')
conferir('ilha de coordenação ocupa a coluna central', Boolean(ilhaCoordenacao && Math.abs((ilhaCoordenacao.x + ilhaCoordenacao.largura / 2) - desktop.largura / 2) < 2))

// A roupa é do squad; cabelo, acessório ou pele diferenciam os membros.
for (const squad of PIXEL_AGENT_SQUADS) {
  const membros = catalogoVisual.filter((item) => item.squad === squad.id)
  if (!membros.length) continue
  const membrosSemExcecaoDosChefes = membros.filter((item) => !['luana', 'renato', 'bia'].includes(item.ficha?.id || ''))
  conferir(`${squad.nome}: roupa usa a cor do squad`, membrosSemExcecaoDosChefes.every((item) => item.cor === squad.cor))
  if (membros.length > 1) {
    const variantes = new Set(membros.map((item) => `${item.cabelo}:${item.pele}:${item.acessorio}`))
    conferir(`${squad.nome}: membros não são clones genéricos`, variantes.size > 1)
  }
}

const luana = catalogoVisual.find((item) => item.ficha?.id === 'luana')
const renato = catalogoVisual.find((item) => item.ficha?.id === 'renato')
const bia = catalogoVisual.find((item) => item.ficha?.id === 'bia')
conferir('chefes mantêm as cores atuais', luana?.cor === '#84cc16' && renato?.cor === '#c2410c' && bia?.cor === '#8b5cf6')
conferir('Luana, Renato e Bia ficam juntos na ilha central de coordenação', [luana, renato, bia].every((item) => item?.squad === 'coordenação'))

// Três execuções do mesmo tipo: uma ocupa a mesa do Dev e duas são temporárias.
const devs: AgenteVivo[] = Array.from({ length: 3 }, (_, indice) => ({
  id: `execucao-dev-${indice + 1}`,
  dono: 'renato',
  identidade: 'dev',
  nome: `Dev paralelo ${indice + 1}`,
  tipo: 'dev',
  motor: 'claude',
  estado: 'trabalhando',
  fase: 'execução',
  etapa: 'implementando',
  ferramenta: 'Edit',
}))
const comParalelos = montarExecucoesVisuais(devs, PIXEL_AGENTS)
const devsVisuais = comParalelos.filter((item) => item.ficha?.id === 'dev')
conferir('três Dev paralelos aparecem como três bonecos', devsVisuais.length === 3)
conferir('um Dev permanece fixo e dois são extras temporários', devsVisuais.filter((item) => !item.temporaria).length === 1 && devsVisuais.filter((item) => item.temporaria).length === 2)
conferir('extras paralelos ficam na ilha de bots', devsVisuais.every((item) => item.squad === 'bots'))
conferir('payload paralelo não remove o restante do catálogo', comParalelos.filter((item) => !item.temporaria).length === PIXEL_AGENTS.length)

const comDuplicata = montarExecucoesVisuais([...devs, devs[0]], PIXEL_AGENTS)
conferir('payload duplicado por chave não cria outro boneco', comDuplicata.length === comParalelos.length)

const sessaoCodex: AgenteVivo = {
  id: '01A0DFF5-20E9-7FB0-AAAA-BBBBBBBBBBBB',
  dono: 'luana',
  identidade: 'sessao-codex',
  tipo: 'codex',
  motor: 'codex',
  modelo_legivel: 'GPT-5.6 Sol',
  esforco: 'alto',
  tarefa: 'Ajustar os nomes legíveis do escritório vivo',
  estado: 'trabalhando',
  fase: 'execução',
  etapa: 'implementando',
}
const visualCodex = montarExecucoesVisuais([sessaoCodex], PIXEL_AGENTS).find((item) => item.execucao.id === sessaoCodex.id)
conferir('sessão Codex desconhecida entra como extra temporário legível', Boolean(visualCodex?.temporaria && visualCodex.nome === 'Codex · GPT-5.6 Sol · Ajustar os nomes legíveis…'))
conferir('ID cru não vira nome primário da sessão Codex', Boolean(visualCodex && !visualCodex.nome.includes(sessaoCodex.id)))

const cleo: AgenteVivo = { ...sessaoCodex, id: 'rollout-cleo', identidade: 'cleo', tipo: 'copy' }
conferir('identidade catalogada tem prioridade sobre a sessão', nomeLegivelDaExecucao(cleo, PIXEL_AGENTS.find((item) => item.id === 'cleo')) === 'Cleo')

if (falhas) process.exit(1)
console.log('\nTodos os testes do escritório completo passaram!')
