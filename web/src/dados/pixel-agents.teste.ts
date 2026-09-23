// Teste do catálogo vivo. Rode com:
//   node --experimental-strip-types src/dados/pixel-agents.teste.ts
import { mesclarRuntimesNoCatalogo } from './pixel-agents.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

const base = [{ id: 'cleo', nome: 'Cleo', papel: 'Copy', squad: 'conteúdo' as const, área: 'Copy', abreviação: 'CL', cor: '#0f0', aliases: ['cleo-produtor'] }]
const catalogo = mesclarRuntimesNoCatalogo(base, [
  { id: 'cleo-produtor', etapa: 'escrevendo legenda', etapa_e_description: true },
  { id: 'session-123456', etapa: 'renderizando', etapa_e_description: false },
])
conferir('alias não duplica agente catalogado', catalogo.length, 2)
conferir('runtime desconhecido entra no pipeline', catalogo[1]?.squad, 'pipeline Codex')
conferir('booleano de proveniência não vira descrição', catalogo[1]?.descricao, 'renderizando')
conferir('rótulo usa sufixo honesto do ID', catalogo[1]?.nome, 'Sessão Codex · 123456')

if (falhas) process.exit(1)
console.log('APROVADO: catálogo vivo deduplica aliases e preserva etapa textual.')
