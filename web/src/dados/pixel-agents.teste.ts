// Teste do catálogo vivo. Rode com:
//   node --experimental-strip-types src/dados/pixel-agents.teste.ts
import { boundsDoCatalogo, mesclarRuntimesNoCatalogo, zoomParaEnquadrar } from './pixel-agents.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

const base = [{ id: 'cleo', nome: 'Cleo', papel: 'Copy', squad: 'conteúdo' as const, área: 'Copy', abreviação: 'CL', cor: '#0f0', aliases: ['cleo-produtor'] }]
const catalogo = mesclarRuntimesNoCatalogo(base, [
  { id: 'session-cleo', identidade: 'cleo', papel: 'cont_copy', tarefa: 'produzir legenda', etapa: 'escrevendo legenda', etapa_e_description: true },
  { id: 'session-123456', identidade: 'sessao-codex', etapa: 'renderizando', etapa_e_description: false },
])
conferir('identidade não duplica agente catalogado', catalogo.length, 2)
conferir('runtime desconhecido entra no pipeline', catalogo[1]?.squad, 'pipeline Codex')
conferir('booleano de proveniência não vira descrição', catalogo[1]?.descricao, 'renderizando')
conferir('rótulo usa sufixo honesto do ID', catalogo[1]?.nome, 'Sessão Codex · 123456')
const comClaude = mesclarRuntimesNoCatalogo(base, [
  { id: 'a13713005098f64c', tipo: 'dev', descricao: 'corrigir painel', etapa: 'Edit' },
  { id: 'rollout-abcdef', tipo: 'codex', identidade: 'sessao-codex', etapa: 'atividade Codex detectada' },
])
conferir('subagente Claude não vira "Sessão Codex"', comClaude[1]?.nome, 'dev · 98F64C')
conferir('subagente Claude fica fora do pipeline Codex', comClaude[1]?.squad, 'globais')
conferir('sessão Codex real continua rotulada como Codex', comClaude[2]?.nome, 'Sessão Codex · ABCDEF')
conferir('bounds de filtro curto têm uma linha real', boundsDoCatalogo(2).altura < boundsDoCatalogo(39).altura, true)
conferir('filtro curto recebe zoom maior que overview', zoomParaEnquadrar(1200, 500, 2) > zoomParaEnquadrar(1200, 500, 39), true)

// Teste de subagente Claude sem tipo
const catalogoComClaude = mesclarRuntimesNoCatalogo(base, [
  { id: 'agent-abc123', tipo: null, etapa: 'analisando repo', etapa_e_description: false },
])
conferir('subagente Claude sem tipo não é rotulado como Sessão Codex', catalogoComClaude[1]?.nome.startsWith('Subagente ·'), true)

// Teste de colisão de donos: Cleo da Luana e Cleo da Bia não se anulam
const catalogoColisao = mesclarRuntimesNoCatalogo(base, [
  { id: 'cleo', dono: 'luana', etapa: 'trabalho luana' },
  { id: 'cleo', dono: 'bia', etapa: 'trabalho bia' },
])
conferir('dois donos com mesmo agente catalogado geram entradas distintas', catalogoColisao.length, 2)
conferir('segundo dono ganha identificador composto', catalogoColisao[1]?.id, 'bia:cleo')
conferir('segundo dono recebe tag no nome', catalogoColisao[1]?.nome.includes('[B]'), true)

// Teste de resolução no mapa agentesPorCatalogo e ativos para 2 Cleos (Correção 2)
const agentesDuasCleos = [
  { id: 'rollout-1', dono: 'luana', identidade: 'cleo', estado: 'trabalhando' as const, etapa: 'trabalho luana', silencio_s: 1 },
  { id: 'rollout-2', dono: 'bia', identidade: 'cleo', estado: 'trabalhando' as const, etapa: 'trabalho bia', silencio_s: 1 },
]
const catDuasCleos = mesclarRuntimesNoCatalogo(base, agentesDuasCleos)
conferir('catálogo com 2 Cleos tem 2 avatares', catDuasCleos.length, 2)

const chaveAgente = (dono: string | undefined | null, id: string) => (dono ? `${dono}:${id}` : id)
const mapaDuasCleos = new Map<string, any>()
for (const agente of agentesDuasCleos) {
  const chave = chaveAgente(agente.dono, agente.id)
  mapaDuasCleos.set(chave, agente)
  const itemCat =
    catDuasCleos.find((item) => item.id === chave || item.aliases?.includes(chave)) ??
    catDuasCleos.find(
      (item) =>
        item.id === agente.id ||
        item.aliases?.includes(agente.id) ||
        (agente.identidade &&
          agente.identidade !== 'sessao-codex' &&
          (item.id === agente.identidade || item.aliases?.includes(agente.identidade)))
    )
  if (itemCat) {
    mapaDuasCleos.set(itemCat.id, agente)
  }
}
conferir('mapa tem a Cleo original e a Cleo da Bia', mapaDuasCleos.has('cleo') && mapaDuasCleos.has('bia:rollout-2'), true)
conferir('Cleo original mapeada para o agente da Luana', mapaDuasCleos.get('cleo')?.dono, 'luana')
conferir('Cleo da Bia mapeada para o agente da Bia', mapaDuasCleos.get('bia:rollout-2')?.dono, 'bia')

const ativosDuasCleos = new Set(
  agentesDuasCleos
    .filter((agente) => agente.estado === 'trabalhando')
    .map((agente) => {
      const chave = chaveAgente(agente.dono, agente.id)
      const itemCat =
        catDuasCleos.find((item) => item.id === chave || item.aliases?.includes(chave)) ??
        catDuasCleos.find(
          (item) =>
            item.id === agente.id ||
            item.aliases?.includes(agente.id) ||
            (agente.identidade &&
              agente.identidade !== 'sessao-codex' &&
              (item.id === agente.identidade || item.aliases?.includes(agente.identidade)))
        )
      return itemCat?.id ?? chave
    })
)
conferir('ambas as Cleos constam como ativas no escritório', ativosDuasCleos.size, 2)


if (falhas) process.exit(1)
console.log('APROVADO: catálogo vivo deduplica aliases e preserva etapa textual.')
