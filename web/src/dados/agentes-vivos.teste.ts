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

if (falhas) process.exit(1)
console.log('APROVADO: contadores de agentes vivos alinhados.')
