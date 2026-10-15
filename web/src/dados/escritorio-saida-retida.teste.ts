// Testes do pacote V8 (14/10/2026): retenção de saída (achado "bug de
// ocultação") e população 0/1/3/12/25/45 agentes.
//
// Importa PixelOffice.tsx (JSX + import de PNG): plain `node
// --experimental-strip-types` NÃO consegue carregar este arquivo. Rode com
// `npm --prefix web test` (web/scripts/rodar-testes.mjs, carrega via Vite) ou
// `cd web && node scripts/rodar-testes.mjs dados/escritorio-saida-retida`.
import type { AgenteVivo } from './tipos.ts'
import { PIXEL_AGENTS } from './pixel-agents.ts'
import {
  avancarEstadoAnimacao,
  criarEstadoInicialBoneco,
  DURACAO_CAMINHADA_MS,
  DURACAO_TRANSICAO_CADEIRA_MS,
} from './escritorio-animacao.ts'
import {
  calcularLayoutSala,
  execucoesDoCenarioPrincipal,
  montarExecucoesVisuais,
  SQUADS_SOB_DEMANDA,
} from '../ui/PixelOffice.tsx'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    console.log(`ok   ${nome}`)
  } else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

const agente = (id: string, estado: AgenteVivo['estado'], ferramenta: string | null = 'Bash'): AgenteVivo => ({
  id,
  nome: id,
  identidade: id,
  tipo: 'agente',
  estado,
  fase: 'execução',
  etapa: `tarefa ${id}`,
  ferramenta,
})

// 1. CONTRATO PRESERVADO: sem o 3º argumento (retidos), o comportamento é
// idêntico ao de antes — só agentes `ativa` (trabalhando) aparecem no
// cenário principal, mais os três diretores fixos (Luana/Renato/Bia),
// sentados como ausentes mesmo sem sessão (achado real de 15/10, ver
// escritorio-layout.teste.ts "cenário principal preserva os três diretores
// sem sessão ativa"). Aqui confirmo que a MINHA mudança (parâmetro novo,
// opcional) não afeta quem não o usa, além desse contrato novo.
const IDS_DIRETORES_TESTE = new Set(['luana', 'renato', 'bia'])
const squadsAbertos = new Set(SQUADS_SOB_DEMANDA.map((item) => item.id))
const doisAgentes = montarExecucoesVisuais([
  agente('exec-a', 'trabalhando'),
  agente('exec-b', 'parado'),
], PIXEL_AGENTS)
const cenarioSemRetidos = execucoesDoCenarioPrincipal(doisAgentes, squadsAbertos)
conferir(
  'sem retidos: só quem está trabalhando aparece, mais os 3 diretores fixos (comportamento atualizado 15/10)',
  cenarioSemRetidos.every((item) =>
    item.execucao.estado === 'trabalhando' || IDS_DIRETORES_TESTE.has(item.ficha?.id || '')),
)

// 2. A CORREÇÃO: um agente que acabou de trocar para 'parado' (não está mais
// `ativa`) mas cuja `animacaoChave` está no conjunto retido CONTINUA no
// cenário — é o mecanismo que dá tempo da animação de levantar/caminhar
// terminar antes de sumir (useSaidaRetida, no componente).
const execParado = doisAgentes.find((item) => item.execucao.estado === 'parado')!
const cenarioComRetido = execucoesDoCenarioPrincipal(doisAgentes, squadsAbertos, new Set([execParado.animacaoChave]))
conferir(
  'retido explicitamente: o agente parado continua no cenário mesmo sem estar ativa',
  cenarioComRetido.some((item) => item.animacaoChave === execParado.animacaoChave),
)
conferir(
  'retenção não inventa gente nova: só quem estava lá antes mais o retido',
  cenarioComRetido.length === cenarioSemRetidos.length + 1,
)

// 3. A máquina de estados (já existente, não mexi nela) de fato completa a
// saída em 3 passos determinísticos antes de chegar em 'descanso' — é o que
// a retenção espera para saber quando liberar (ver liberarConcluidos).
const posMesa = { x: 100, y: 150 }
const posDescanso = { x: -200, y: 300 }
const sentado = criarEstadoInicialBoneco('saida-1', 'trabalhando', posMesa, posDescanso, 0, 'Bash')
const levantando = avancarEstadoAnimacao(sentado, 'parado', posMesa, posDescanso, 10, false)
conferir('trabalhando -> parado entra em levantando (não some direto)', levantando.fase === 'levantando')
const levantandoConcluido = avancarEstadoAnimacao(levantando, 'parado', posMesa, posDescanso, 10 + DURACAO_TRANSICAO_CADEIRA_MS, false)
conferir('levantando completo inicia a caminhada para o descanso', levantandoConcluido.fase === 'caminhando_para_descanso')
const caminhandoConcluido = avancarEstadoAnimacao(
  levantandoConcluido, 'parado', posMesa, posDescanso,
  10 + DURACAO_TRANSICAO_CADEIRA_MS + DURACAO_CAMINHADA_MS, false,
)
conferir('caminhada completa chega em descanso (só aqui a retenção libera)', caminhandoConcluido.fase === 'descanso')
conferir('em descanso, a posição final é a do lounge (posDescanso)', caminhandoConcluido.x === posDescanso.x && caminhandoConcluido.y === posDescanso.y)

// 4. POPULAÇÃO: 0/1/3/12/25/45 agentes trabalhando não travam o layout, e o
// cenário principal cresce exatamente com a contagem de ativos mais os 3
// diretores fixos (CRITÉRIOS: "3 ativos + 25 parados: os 25 não poluem a
// cena; contagem operacional correta", atualizado 15/10 pros diretores).
for (const quantidade of [0, 1, 3, 12, 25, 45]) {
  const ativos = Array.from({ length: quantidade }, (_, indice) => agente(`pop-ativo-${indice}`, 'trabalhando'))
  const parados = Array.from({ length: 25 }, (_, indice) => agente(`pop-parado-${indice}`, 'parado'))
  const visuais = montarExecucoesVisuais([...ativos, ...parados], PIXEL_AGENTS)
  const cenario = execucoesDoCenarioPrincipal(visuais, squadsAbertos)
  const totalAtivasNoCatalogo = visuais.filter((item) => item.ativa).length
  conferir(
    `${quantidade} ativos: cenário principal mostra exatamente os ativos mais os 3 diretores fixos (25 parados não entram)`,
    cenario.length === totalAtivasNoCatalogo + 3
      && cenario.every((item) => item.ativa || IDS_DIRETORES_TESTE.has(item.ficha?.id || '')),
    `cenario=${cenario.length} ativos=${totalAtivasNoCatalogo}`,
  )
  const layout = calcularLayoutSala(cenario, { larguraDisponivel: 1440, alturaDisponivel: 900 })
  conferir(`${quantidade} ativos: layout tem uma mesa por ativo, sem mesa fantasma`, layout.mesas.length === cenario.length)
  conferir(`${quantidade} ativos: zoom sugerido é finito e positivo`, Number.isFinite(layout.zoomSugerido) && layout.zoomSugerido > 0)
}

if (falhas > 0) process.exit(1)
console.log('\nTodos os testes de retenção de saída e população passaram!')
