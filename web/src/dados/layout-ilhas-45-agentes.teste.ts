// Testes de layout espacial dinâmico para 45+ agentes sem sobreposição de caixas delimitadoras.
// Execute com: npx tsx src/dados/layout-ilhas-45-agentes.teste.ts

import { mesclarRuntimesNoCatalogo, PIXEL_AGENTS, PIXEL_AGENT_SQUADS, type PixelAgentSquad } from './pixel-agents.ts'
import type { AgenteVivo } from './tipos.ts'

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

// Algoritmo de cálculo de posições e extents de ilhas espaciais (idêntico ao PixelOffice.tsx)
type Retangulo = { xMin: number; xMax: number; yMin: number; yMax: number }

function calcularExtentsIlhas(
  agentes: Array<{ squad: PixelAgentSquad; id: string }>,
  soAtivos: boolean,
  ativosIds: Set<string>
) {
  const squadsOrdenados = PIXEL_AGENT_SQUADS.map((s) => s.id)
  const agentesPorSquad = new Map<PixelAgentSquad, typeof agentes>()

  for (const s of squadsOrdenados) {
    agentesPorSquad.set(s, [])
  }

  const visiveis = soAtivos ? agentes.filter((a) => ativosIds.has(a.id)) : agentes

  for (const a of visiveis) {
    const lista = agentesPorSquad.get(a.squad) ?? []
    lista.push(a)
    agentesPorSquad.set(a.squad, lista)
  }

  const squadsComMembros = squadsOrdenados.filter((s) => (agentesPorSquad.get(s)?.length ?? 0) > 0)
  const ilhasEsquerda = squadsComMembros.filter((_, idx) => idx % 2 === 0)
  const ilhasDireita = squadsComMembros.filter((_, idx) => idx % 2 === 1)

  const caixasIlhas = new Map<PixelAgentSquad, Retangulo>()
  const posicoesMesas: Array<{ chave: string; squad: PixelAgentSquad; x: number; y: number }> = []

  function posicionarLado(squadsLado: PixelAgentSquad[], ehEsquerda: boolean) {
    let yAcumulado = -180
    const sinalX = ehEsquerda ? -1 : 1
    const baseCentroX = sinalX * 180

    for (const squadId of squadsLado) {
      const membros = agentesPorSquad.get(squadId) ?? []
      if (membros.length === 0) continue

      const numCols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(membros.length * 1.5))))
      const numLinhas = Math.ceil(membros.length / numCols)
      const espacamentoX = 46
      const espacamentoY = 48

      const larguraIlha = (numCols - 1) * espacamentoX + 60
      const alturaIlha = (numLinhas - 1) * espacamentoY + 60

      const centroY = yAcumulado + alturaIlha / 2
      const centroX = baseCentroX + (sinalX * (larguraIlha - 60)) / 4

      const margem = 10
      caixasIlhas.set(squadId, {
        xMin: centroX - larguraIlha / 2 - margem,
        xMax: centroX + larguraIlha / 2 + margem,
        yMin: centroY - alturaIlha / 2 - margem,
        yMax: centroY + alturaIlha / 2 + margem,
      })

      membros.forEach((ag, idx) => {
        const col = idx % numCols
        const lin = Math.floor(idx / numCols)
        const mx = centroX - ((numCols - 1) * espacamentoX) / 2 + col * espacamentoX
        const my = centroY - ((numLinhas - 1) * espacamentoY) / 2 + lin * espacamentoY
        posicoesMesas.push({ chave: ag.id, squad: squadId, x: mx, y: my })
      })

      yAcumulado += alturaIlha + 40
    }
  }

  posicionarLado(ilhasEsquerda, true)
  posicionarLado(ilhasDireita, false)

  return { caixasIlhas, posicoesMesas }
}

function verificarSobreposicoes(caixas: Map<PixelAgentSquad, Retangulo>): number {
  const lista = Array.from(caixas.entries())
  let sobreposicoes = 0
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const [squad1, r1] = lista[i]
      const [squad2, r2] = lista[j]

      const sobrepoeX = r1.xMin < r2.xMax && r1.xMax > r2.xMin
      const sobrepoeY = r1.yMin < r2.yMax && r1.yMax > r2.yMin

      if (sobrepoeX && sobrepoeY) {
        sobreposicoes++
        console.error(`Sobreposição detectada entre ${squad1} e ${squad2}:`, r1, r2)
      }
    }
  }
  return sobreposicoes
}

function verificarDistanciaMinimaMesas(mesas: Array<{ x: number; y: number }>, distMin = 30): number {
  let conflitos = 0
  for (let i = 0; i < mesas.length; i++) {
    for (let j = i + 1; j < mesas.length; j++) {
      const dist = Math.hypot(mesas[i].x - mesas[j].x, mesas[i].y - mesas[j].y)
      if (dist < distMin) {
        conflitos++
      }
    }
  }
  return conflitos
}

// 1. Cenário com 45 agentes em distribuição equilibrada
const agentes45Equilibrados: AgenteVivo[] = []
const donos = ['luana', 'renato', 'bia', 'iris', 'elza']
for (let i = 1; i <= 45; i++) {
  const dono = donos[i % donos.length]
  agentes45Equilibrados.push({
    id: `sub-eq-${i}`,
    dono,
    tipo: 'subagente',
    estado: 'trabalhando',
    fase: 'exec',
    etapa: `tarefa-${i}`,
    silencio_s: 0,
  })
}

const cat45Eq = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, agentes45Equilibrados)
const ativosIds45 = new Set(agentes45Equilibrados.map((a) => `${a.dono}:${a.id}`))

const { caixasIlhas: caixasEq, posicoesMesas: mesasEq } = calcularExtentsIlhas(cat45Eq, false, ativosIds45)

conferir('zero sobreposições de ilhas em 45 agentes equilibrados', verificarSobreposicoes(caixasEq), 0)
conferir('todas as mesas de 45 agentes possuem distância mínima >= 30px', verificarDistanciaMinimaMesas(mesasEq), 0)

// 2. Cenário com 45 agentes altamente concentrados (25 no Renato/bots, 15 na Bia/tráfego, 5 na Luana)
const agentes45Concentrados: AgenteVivo[] = []
for (let i = 1; i <= 25; i++) {
  agentes45Concentrados.push({
    id: `sub-bot-${i}`,
    dono: 'renato',
    tipo: 'subagente',
    estado: 'trabalhando',
    fase: 'exec',
    etapa: `bot-${i}`,
    silencio_s: 0,
  })
}
for (let i = 1; i <= 15; i++) {
  agentes45Concentrados.push({
    id: `sub-traf-${i}`,
    dono: 'bia',
    tipo: 'subagente',
    estado: 'trabalhando',
    fase: 'exec',
    etapa: `traf-${i}`,
    silencio_s: 0,
  })
}
for (let i = 1; i <= 5; i++) {
  agentes45Concentrados.push({
    id: `sub-coord-${i}`,
    dono: 'luana',
    tipo: 'subagente',
    estado: 'trabalhando',
    fase: 'exec',
    etapa: `coord-${i}`,
    silencio_s: 0,
  })
}

const cat45Conc = mesclarRuntimesNoCatalogo(PIXEL_AGENTS, agentes45Concentrados)
const ativosIdsConc = new Set(agentes45Concentrados.map((a) => `${a.dono}:${a.id}`))

const { caixasIlhas: caixasConc, posicoesMesas: mesasConc } = calcularExtentsIlhas(cat45Conc, false, ativosIdsConc)

conferir('zero sobreposições de ilhas em 45 agentes concentrados', verificarSobreposicoes(caixasConc), 0)
conferir('todas as mesas de 45 agentes concentrados possuem distância mínima >= 30px', verificarDistanciaMinimaMesas(mesasConc), 0)

// 3. Cenário com filtro "Só ativos" ligado
const { caixasIlhas: caixasSoAtivos, posicoesMesas: mesasSoAtivos } = calcularExtentsIlhas(cat45Conc, true, ativosIdsConc)
conferir('zero sobreposições com filtro só ativos', verificarSobreposicoes(caixasSoAtivos), 0)
conferir('distância de mesas preservada com filtro só ativos', verificarDistanciaMinimaMesas(mesasSoAtivos), 0)

if (falhas > 0) {
  console.error(`\n${falhas} teste(s) falharam.`)
  process.exit(1)
} else {
  console.log('\nTodos os testes de layout espacial para 45+ agentes passaram com sucesso!')
}
