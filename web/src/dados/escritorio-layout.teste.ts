import type { AgenteVivo } from './tipos.ts'
import { PIXEL_AGENTS } from './pixel-agents.ts'
import { calcularLayoutSala, montarExecucoesVisuais, nomeLegivelDaExecucao } from '../ui/PixelOffice.tsx'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) console.log(`ok   ${nome}`)
  else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

const agentes: AgenteVivo[] = Array.from({ length: 45 }, (_, indice) => ({
  id: `execucao-sintetica-${indice + 1}`,
  dono: indice % 3 === 0 ? 'luana' : indice % 3 === 1 ? 'renato' : 'bia',
  nome: `Execução ${indice + 1}`,
  tipo: indice % 5 === 0 ? 'codex' : 'subagente',
  motor: indice % 5 === 0 ? 'codex' : 'claude',
  estado: indice % 4 === 0 ? 'silencioso' : 'trabalhando',
  fase: 'execução',
  etapa: `Tarefa sintética ${indice + 1}`,
  ferramenta: 'terminal',
}))

const visuais = montarExecucoesVisuais(agentes, PIXEL_AGENTS)
const desktop = calcularLayoutSala(visuais)
const celular = calcularLayoutSala(visuais, true)

conferir('há exatamente um boneco por execução', visuais.length === 45)
conferir('cada execução conserva uma chave composta única', new Set(visuais.map((item) => item.chave)).size === 45)
conferir('há exatamente uma mesa por execução no desktop', desktop.mesas.length === 45)
conferir('há exatamente uma mesa por execução no celular', celular.mesas.length === 45)
conferir('as mesas estão agrupadas em ilhas de squad', desktop.ilhas.length >= 3)
conferir('a sala cresce verticalmente para 45 execuções', desktop.altura > 900 && celular.altura > desktop.altura)

const comDuplicata = montarExecucoesVisuais([...agentes, agentes[0]], PIXEL_AGENTS)
conferir('payload duplicado não cria um segundo boneco para a mesma execução', comDuplicata.length === 45)

const sessaoCodex: AgenteVivo = {
  id: '01A0DFF5-20E9-7FB0-AAAA-BBBBBBBBBBBB',
  dono: 'luana',
  identidade: 'sessao-codex',
  tipo: 'codex',
  motor: 'codex',
  modelo: 'valor-interno-que-nao-deve-ser-recalculado',
  modelo_legivel: 'GPT-5.6 Sol',
  esforco: 'alto',
  tarefa: 'Ajustar os nomes legíveis do escritório vivo',
  estado: 'trabalhando',
  fase: 'execução',
  etapa: 'implementando',
}
const visualCodex = montarExecucoesVisuais([sessaoCodex], PIXEL_AGENTS)[0]
conferir('sessão Codex usa modelo legível exato e tarefa curta no nome', visualCodex.nome === 'Codex · GPT-5.6 Sol · Ajustar os nomes legíveis…')
conferir('ID cru não vira nome primário da sessão Codex', !visualCodex.nome.includes(sessaoCodex.id))
conferir('rótulo da mesa Codex mostra modelo e tarefa em duas linhas', visualCodex.rotulos.length === 2 && visualCodex.rotulos[0] === 'CODEX · GPT-5.6 SOL')

const cleo: AgenteVivo = { ...sessaoCodex, id: 'rollout-cleo', identidade: 'cleo', tipo: 'copy' }
conferir('identidade catalogada tem prioridade sobre a sessão', nomeLegivelDaExecucao(cleo, PIXEL_AGENTS.find((item) => item.id === 'cleo')) === 'Cleo')

const designer: AgenteVivo = { ...sessaoCodex, id: 'a0383bc6cfeae57b6', identidade: null, tipo: 'designer', motor: 'claude' }
conferir('papel operacional substitui hash quando identidade e catálogo faltam', nomeLegivelDaExecucao(designer) === 'Designer')

if (falhas) process.exit(1)
console.log('\nTodos os testes do layout vivo passaram!')
