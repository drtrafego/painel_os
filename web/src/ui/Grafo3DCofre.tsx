import { useEffect, useMemo, useRef } from 'react'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { corDaAreaEscuro, RAIO_MINIMO_CLICAVEL } from '../dados/cofre'

// ‼️ 21/09/2026: `corDaArea()` (o original) devolve `var(--color-nome)`, que
// só CSS/SVG resolvem sozinhos — THREE.Color não entende essa sintaxe e
// falhava em silêncio (warning "Unknown color model", caindo num cinza
// default). Este componente é SEMPRE modo escuro (só existe quando
// `modoComando=true`), então usa `corDaAreaEscuro()`, que já devolve hex
// direto, sem `var()` — resolve os dois problemas de uma vez (cor errada E
// paleta que tinha 3 áreas com o MESMO hex, achado dele: "área não tem
// todas as cores").
import type { ArestaCofre, NoMemoria } from '../dados/tipos'

type PropsGrafo3D = {
  nos: NoMemoria[]
  arestas: ArestaCofre[]
  escolhido: string
  alvo: string | null
  areaFoco: string | null
  sempreVisiveis: string[]
  caminho: string[] | null
  modoLayout: 'multi-anel' | 'orbita' | 'hierarquia'
  animarSinal: boolean
  modoComando: boolean
  aoEscolher: (id: string) => void
  aoLigar: (id: string) => void
}

export function Grafo3DCofre({
  nos,
  arestas,
  escolhido,
  alvo,
  areaFoco,
  sempreVisiveis,
  caminho,
  modoLayout,
  animarSinal,
  modoComando,
  aoEscolher,
  aoLigar,
}: PropsGrafo3D) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<any>(null)

  // Conjuntos auxiliares de visibilidade e seleção (para os callbacks de
  // estilo, recalculado toda hora, é barato: Set/Map pequenos)
  const noCaminho = new Set(caminho ?? [])

  // ‼️ CORRIGIDO 21/09/2026: "o grafo fica mudando toda hora, não é fixo"
  // (achado dele, olhando a tela ao vivo). Causa raiz: `graphData` era um
  // objeto literal novo A CADA RENDER (referência sempre diferente, mesmo
  // com o mesmo conteúdo), e o efeito abaixo que chama `fg.graphData(...)`
  // tinha `[graphData, ...]` nas deps — então TODA vez que Cofre.tsx
  // re-renderizava por qualquer motivo (o `useFps` sozinho já causa 1
  // render/segundo), a simulação de física do 3d-force-graph recebia os
  // dados de novo e reaquecia (`d3ReheatSimulation`), fazendo os nós
  // tremerem/se reposicionarem sem parar. `useMemo` com dependências nos
  // dados REAIS (não a referência do objeto) resolve: só reconstrói quando
  // nós/arestas/área/caminho realmente mudam.
  const graphData = useMemo(() => {
    const area = new Map(nos.map((n) => [n.id, n.area]))
    const noCaminhoMemo = new Set(caminho ?? [])

    const visivel = (id: string) =>
      areaFoco === null ||
      area.get(id) === areaFoco ||
      sempreVisiveis.includes(area.get(id) ?? '') ||
      noCaminhoMemo.has(id)

    const arestasVisiveis = arestas.filter((a) => {
      const deVis = visivel(a.de)
      const paraVis = visivel(a.para)
      if (deVis && paraVis) return true
      if (noCaminhoMemo.has(a.de) && noCaminhoMemo.has(a.para)) return true
      return a.ponte && (area.get(a.de) === areaFoco || area.get(a.para) === areaFoco)
    })

    // ‼️ CAUSA RAIZ CORRIGIDA 20/09/2026: uma aresta "ponte" podia entrar em
    // arestasVisiveis com uma ponta fora da área filtrada (por desenho: "pontes
    // mantêm anéis vazados"), mas o node dessa ponta nunca entrava em
    // graphData.nodes, porque só olhava visivel(n.id). O 3d-force-graph (d3-force)
    // exige que todo link.source/target exista no array de nodes, senão lança
    // "node not found: <id>" e quebra o grafo inteiro. Achado ao clicar num
    // filtro de área: qualquer clique nos botões de área (recolhidos ou não)
    // reproduzia. Correção: todo endpoint de uma aresta visível entra no
    // conjunto de nós, mesmo quando sua própria área está fora do foco.
    const idsPorPonte = new Set<string>()
    for (const a of arestasVisiveis) {
      if (!visivel(a.de)) idsPorPonte.add(a.de)
      if (!visivel(a.para)) idsPorPonte.add(a.para)
    }

    // Converte nós e arestas para formato do 3d-force-graph
    return {
      nodes: nos.filter((n) => visivel(n.id) || idsPorPonte.has(n.id)).map((n) => ({
        id: n.id,
        rotulo: n.rotulo,
        especie: n.especie,
        autor: n.autor,
        area: n.area,
        grau: n.grau,
        peso: n.peso,
        vencido: n.vencido,
        val: Math.max(RAIO_MINIMO_CLICAVEL, 2 + Math.sqrt(n.grau) * 2.5),
      })),
      links: arestasVisiveis.map((a) => ({
        source: a.de,
        target: a.para,
        porque: a.porque,
        ponte: a.ponte,
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nos, arestas, areaFoco, sempreVisiveis, caminho])

  // Inicializa o ForceGraph3D
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth || 800
    const height = container.clientHeight || 550

    const createGraph = (ForceGraph3D as any).default || ForceGraph3D
    const Graph = createGraph()(container)
      .width(width)
      .height(height)
      .backgroundColor(modoComando ? '#0B0F17' : '#FDFAF3')
      .showNavInfo(false)
      .nodeRelSize(4)
      .nodeId('id')
      .nodeVal('val')
      // ‼️ 21/09/2026: modo "multi-anel" (o default, sem fx/fy/fz fixo) nunca
      // parava de tremer, mesmo depois de memoizar graphData, porque o
      // default do d3AlphaMin é ~0.0001 (a simulação nunca se considera
      // "resolvida"). Órbita/Camadas fixam fx/fy/fz por nó e por isso já
      // pareciam parados. Subir o alphaMin faz a simulação DESLIGAR sozinha
      // quando o movimento já é imperceptível, em vez de rodar pra sempre.
      // `as any` porque o accessor existe em runtime mas não está nos
      // typings do pacote (confirmado lendo o .mjs compilado).
      ;(Graph as any).d3AlphaMin(0.02)

    // Estilo dos Nós (Objetos 3D customizados com Three.js)
    Graph.nodeThreeObject((node: any) => {
      const isChosen = node.id === escolhido
      const isTarget = node.id === alvo
      const isInPath = noCaminho.has(node.id)

      const group = new THREE.Group()

      // Esfera principal do nó
      const radius = isChosen ? 7 : isTarget || isInPath ? 6 : Math.max(3, 2 + Math.sqrt(node.grau) * 1.5)
      const geometry = new THREE.SphereGeometry(radius, 16, 16)
      
      const colorHex = corDaAreaEscuro(node.area)
      const material = new THREE.MeshLambertMaterial({
        color: isChosen ? '#A3E635' : isTarget || isInPath ? '#EF4444' : colorHex,
        transparent: true,
        opacity: node.vencido ? 0.45 : isChosen ? 1 : 0.88,
      })
      const mesh = new THREE.Mesh(geometry, material)
      group.add(mesh)

      // Anel Neon Externo de Destaque quando selecionado ou no caminho
      if (isChosen || isTarget || isInPath) {
        const ringGeo = new THREE.RingGeometry(radius + 2, radius + 3.5, 32)
        const ringMat = new THREE.MeshBasicMaterial({
          color: isChosen ? (modoComando ? '#A3E635' : '#7A4A0F') : '#EF4444',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        })
        const ring = new THREE.Mesh(ringGeo, ringMat)
        group.add(ring)
      }

      // Sprite de Texto de Rótulo (Renderização HD em Canvas)
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        canvas.width = 256
        canvas.height = 64
        ctx.font = isChosen ? 'bold 22px "JetBrains Mono", monospace' : '18px "JetBrains Mono", monospace'
        ctx.fillStyle = isChosen
          ? (modoComando ? '#FACC15' : '#1A1410')
          : (modoComando ? '#94A3B8' : '#7A6A57')
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.rotulo.slice(0, 24), 128, 32)

        const texture = new THREE.CanvasTexture(canvas)
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false })
        const sprite = new THREE.Sprite(spriteMaterial)
        sprite.position.set(0, -radius - 8, 0)
        sprite.scale.set(36, 9, 1)
        group.add(sprite)
      }

      return group
    })

    // Estilo das Arestas Dirigidas 3D (Com setas e pulso de sinal neon)
    Graph
      .linkDirectionalParticles(animarSinal ? 2 : 0)
      .linkDirectionalParticleSpeed(0.008)
      .linkDirectionalParticleWidth(2.5)
      .linkDirectionalParticleColor(() => (modoComando ? '#A3E635' : '#3E6E8E'))
      .linkDirectionalArrowLength(4)
      .linkDirectionalArrowRelPos(0.95)
      .linkColor((link: any) => {
        const isPath = noCaminho.has(link.source?.id) && noCaminho.has(link.target?.id)
        if (isPath) return '#EF4444'
        if (link.source?.id === escolhido || link.target?.id === escolhido) {
          return modoComando ? '#A3E635' : '#7A4A0F'
        }
        return modoComando ? '#38BDF8' : '#E3D8C4'
      })
      .linkWidth((link: any) => {
        const isPath = noCaminho.has(link.source?.id) && noCaminho.has(link.target?.id)
        return isPath ? 2.5 : link.source?.id === escolhido || link.target?.id === escolhido ? 2.0 : 0.8
      })

    // Eventos de Clique nativo com suporte a toque (WCAG 2.5.8 adaptação 3D)
    Graph.onNodeClick((node: any, event: MouseEvent) => {
      if (event.shiftKey) {
        aoLigar(node.id)
      } else {
        aoEscolher(node.id)
      }
    })

    // Suporte a Redimensionamento da Janela
    const handleResize = () => {
      if (!containerRef.current) return
      Graph.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    fgRef.current = Graph

    return () => {
      window.removeEventListener('resize', handleResize)
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [modoComando])

  // Atualiza Dados e Layouts sem recriar o canvas 3D
  useEffect(() => {
    if (!fgRef.current) return
    const fg = fgRef.current

    fg.graphData(graphData)

    // Modos de Layout 3D (Atlas / Órbita Esférica / Camadas)
    if (modoLayout === 'orbita') {
      // Disposição em Esfera Radial Concêntrica por Grau
      nos.forEach((n, i) => {
        const node3d = fg.graphData().nodes.find((x: any) => x.id === n.id)
        if (!node3d) return
        const radius = 120 + (1 - n.grau / 10) * 160
        const phi = Math.acos(-1 + (2 * i) / nos.length)
        const theta = Math.sqrt(nos.length * Math.PI) * phi
        node3d.fx = radius * Math.cos(theta) * Math.sin(phi)
        node3d.fy = radius * Math.sin(theta) * Math.sin(phi)
        node3d.fz = radius * Math.cos(phi)
      })
    } else if (modoLayout === 'hierarquia') {
      // Disposição em Camadas / Tiers por Espécie
      // ‼️ CORRIGIDO 21/09/2026: esta lista tinha espécies de OUTRO domínio
      // (regra/dor/gancho/métrica/decisão/conceito/sinal/alerta/lead, que
      // parecem categorias de copywriting) e ZERO overlap com as espécies
      // reais do Cofre (medido em data/cofre.json: correcao, defeito,
      // medicao, ordem, padrao, trava). Todo nó caía em indexOf === -1, ou
      // seja, TODOS na mesma camada — achado dele: "o gráfico de camadas
      // está ruim", e era isso: layout plano disfarçado de hierarquia.
      const especies = ['padrao', 'ordem', 'trava', 'correcao', 'defeito', 'medicao']
      nos.forEach((n, i) => {
        const node3d = fg.graphData().nodes.find((x: any) => x.id === n.id)
        if (!node3d) return
        const layerIdx = especies.indexOf(n.especie.toLowerCase())
        node3d.fy = ((layerIdx === -1 ? especies.length : layerIdx) - especies.length / 2) * 60
        node3d.fx = ((i % 6) - 2.5) * 55
        node3d.fz = (Math.floor(i / 6) - 2) * 40
      })
    } else {
      // Free Force 3D Atlas
      nos.forEach((n) => {
        const node3d = fg.graphData().nodes.find((x: any) => x.id === n.id)
        if (node3d) {
          node3d.fx = undefined
          node3d.fy = undefined
          node3d.fz = undefined
        }
      })
    }
  }, [graphData, modoLayout])

  return (
    <div className="relative h-[550px] w-full overflow-hidden rounded-lg lg:h-[680px]">
      <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
      
      {/* Controles de Câmera e Dicas de Interação 3D (WCAG / Mobile) */}
      <div className={`absolute bottom-3 left-3 z-10 rounded border px-2.5 py-1.5 font-mono text-[10px] backdrop-blur-md ${
        modoComando ? 'border-sky-500/30 bg-[#0B0F17]/80 text-slate-300' : 'border-linha bg-carta/80 text-tinta-2'
      }`}>
        <span>🖱️ Arrasta pra <strong className="text-sky-400">ROTACIONAR 3D</strong> · Roda/Pinch p/ Zoom · <kbd className="rounded border border-slate-700 px-1">Shift</kbd>+Clique p/ caminho</span>
      </div>
    </div>
  )
}
