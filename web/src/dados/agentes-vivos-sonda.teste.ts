// Testes da sonda de agentes vivos: validação de payload, integridade de dados e estados de erro.
// Execute com: npx tsx src/dados/agentes-vivos-sonda.teste.ts

import { validarPayloadAgentesVivos } from './useAgentesVivos.ts'
import {
  contarAgentesExecutando,
  contarAgentesVivos,
  contarAgentesVivosNaContagem,
} from './agentes-vivos.ts'
import type { AgenteVivo, AgentesVivos } from './tipos.ts'

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

// 1. Validação Estrutural de Payload JSON (validarPayloadAgentesVivos)
conferir('payload válido com agentes passa', validarPayloadAgentesVivos({
  ok: true,
  agentes: [{ id: 'ag-1', estado: 'trabalhando' }],
}), true)

conferir('payload com ok: false passa validação', validarPayloadAgentesVivos({
  ok: false,
  erro: 'Sonda indisponível',
}), true)

conferir('payload nulo é reprovado', validarPayloadAgentesVivos(null), false)
conferir('payload string primitiva é reprovada', validarPayloadAgentesVivos('invalid json'), false)
conferir('payload sem campo ok é reprovado', validarPayloadAgentesVivos({ agentes: [] }), false)
conferir('payload com ok: true mas agentes não-array é reprovado', validarPayloadAgentesVivos({ ok: true, agentes: 'não-array' }), false)
conferir('payload com elemento de agente sem id é reprovado', validarPayloadAgentesVivos({ ok: true, agentes: [{ estado: 'trabalhando' }] }), false)

// 2. Reordenação de lista de agentes não altera contagens nem integridade
const listaOriginal: AgenteVivo[] = [
  { id: 'bia:dev', dono: 'bia', estado: 'trabalhando', fase: 'exec', etapa: 'teste', silencio_s: 0 },
  { id: 'renato:dev', dono: 'renato', estado: 'silencioso', fase: 'exec', etapa: 'teste', silencio_s: 10 },
  { id: 'luana:coord', dono: 'luana', estado: 'parado', fase: 'espera', etapa: 'aguardando', silencio_s: 120 },
]

const listaInvertida: AgenteVivo[] = [...listaOriginal].reverse()

conferir('contagem executando é invariante à ordem dos itens', contarAgentesExecutando(listaOriginal), contarAgentesExecutando(listaInvertida))
conferir('contagem vivos é invariante à ordem dos itens', contarAgentesVivos(listaOriginal), contarAgentesVivos(listaInvertida))

// 3. Tratamento estrito de nulo vs 0 em contagens e silêncio
const contagemComZeros: AgentesVivos['contagem'] = {
  trabalhando: 0,
  silencioso: 0,
  parado: 0,
  vivos: 0,
}
conferir('contagem com zeros explícitos retorna 0', contarAgentesVivosNaContagem(contagemComZeros), 0)

const contagemComNulos: AgentesVivos['contagem'] = {
  trabalhando: 0,
  silencioso: 0,
  parado: 0,
}
conferir('contagem sem campo vivos calcula fallback por trabalhando + silencioso', contarAgentesVivosNaContagem(contagemComNulos), 0)

// 4. Agrupamento de agentes por estado
const agentesMistos: AgenteVivo[] = [
  { id: 'a1', estado: 'trabalhando', fase: '1', etapa: '1', silencio_s: 0 },
  { id: 'a2', estado: 'trabalhando', fase: '1', etapa: '1', silencio_s: 0 },
  { id: 'a3', estado: 'silencioso', fase: '1', etapa: '1', silencio_s: 5 },
  { id: 'a4', estado: 'parado', fase: '1', etapa: '1', silencio_s: 60 },
  { id: 'a5', estado: 'parado', fase: '1', etapa: '1', silencio_s: 120 },
]

conferir('total executando em lote misto', contarAgentesExecutando(agentesMistos), 2)
conferir('total vivos (trabalhando + silencioso) em lote misto', contarAgentesVivos(agentesMistos), 3)

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`)
  process.exit(1)
} else {
  console.log('\nTodos os testes da sonda de agentes vivos passaram com sucesso!')
}
