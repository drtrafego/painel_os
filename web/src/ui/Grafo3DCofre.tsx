import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph3D from '3d-force-graph'
import * as THREE from 'three'
import { calcularPosicoesOrbita3D, corDaAreaEscuro } from '../dados/cofre'
import { chaveRelacao, descreverRelacao, naturezaDoNo, relacoesDoCaminho } from '../dados/cofre-confianca'
import type { ArestaCofre, NoMemoria } from '../dados/tipos'

type PropsGrafo3D = {
  nos: NoMemoria[]; arestas: ArestaCofre[]; escolhido: string; alvo: string | null
  areaFoco: string | null; sempreVisiveis: string[]; caminho: string[] | null
  modoLayout: 'multi-anel' | 'orbita' | 'hierarquia'; animarSinal: boolean; modoComando: boolean
  aoEscolher: (id: string) => void; aoLigar: (id: string) => void
}
type No3D = NoMemoria & { x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number }
type Link3D = ArestaCofre & { source: string | No3D; target: string | No3D; chave: string }
type VisualNo = { grupo: THREE.Group; corpo: THREE.Mesh; halo: THREE.Mesh; material: THREE.MeshLambertMaterial; label: THREE.Sprite; textura: THREE.CanvasTexture }
const legenda = (texto: string) => { const el = document.createElement('span'); el.textContent = texto; return el }

/** Mantém as props e os três layouts existentes. Metadados não se perdem no adaptador.
 * Camada gráfica somente: sem inferência de verdade, consulta ou autoridade.
 */
export function Grafo3DCofre(props: PropsGrafo3D) {
  const { nos, arestas, areaFoco, sempreVisiveis, caminho, modoLayout } = props
  const containerRef = useRef<HTMLDivElement>(null)
  // A versão instalada fornece API fluente dinâmica; o resto do módulo é tipado.
  const fgRef = useRef<any>(null)
  const estadoRef = useRef(props)
  estadoRef.current = props
  const visuais = useRef(new Map<string, VisualNo>())
  const [erro, setErro] = useState<string | null>(null)
  const mediaRef = useRef<MediaQueryList | null>(null)
  const visivelRef = useRef(true)
  const caminhoId = JSON.stringify(caminho)
  const areasId = JSON.stringify(sempreVisiveis)
  const graphData = useMemo(() => {
    const porId = new Map(nos.map(n => [n.id, n]))
    const passos = new Set(caminho ?? [])
    const visivel = (id: string) => areaFoco === null || porId.get(id)?.area === areaFoco || sempreVisiveis.includes(porId.get(id)?.area ?? '') || passos.has(id)
    const links: Link3D[] = arestas.filter(a => porId.has(a.de) && porId.has(a.para))
      .filter(a => (visivel(a.de) && visivel(a.para)) || (a.ponte && (porId.get(a.de)?.area === areaFoco || porId.get(a.para)?.area === areaFoco)))
      .map(a => ({ ...a, source: a.de, target: a.para, chave: chaveRelacao(a) }))
    const endpoints = new Set(links.flatMap(a => [a.de, a.para]))
    // Cópias: a biblioteca altera coordenadas/source/target; o snapshot permanece intacto.
    return { nodes: nos.filter(n => visivel(n.id) || endpoints.has(n.id)).map(n => ({ ...n } as No3D)), links }
  }, [nos, arestas, areaFoco, areasId, caminhoId])

  const descartar = (v: VisualNo) => {
    v.grupo.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) mesh.geometry?.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose())
      else mesh.material?.dispose()
    })
    v.textura.dispose()
  }
  const atualizarEstilos = () => {
    const fg = fgRef.current
    if (!fg) return
    const p = estadoRef.current
    const caminhoNos = new Set(p.caminho ?? [])
    const caminhoArestas = relacoesDoCaminho(p.caminho, p.arestas)
    for (const node of fg.graphData().nodes as No3D[]) {
      const v = visuais.current.get(node.id)
      if (!v) continue
      const selecionado = node.id === p.escolhido
      const alvo = node.id === p.alvo
      const noCaminho = caminhoNos.has(node.id)
      v.material.color.set(selecionado ? '#f8d857' : alvo ? '#ffa69a' : noCaminho ? '#f3b661' : corDaAreaEscuro(node.area))
      v.material.opacity = node.vencido ? 0.4 : selecionado ? 1 : 0.87
      v.corpo.scale.setScalar(selecionado ? 1.28 : noCaminho || alvo ? 1.14 : 1)
      v.halo.visible = selecionado || alvo || noCaminho
      ;(v.halo.material as THREE.MeshBasicMaterial).color.set(alvo ? '#ffa69a' : '#f8d857')
      ;(v.label.material as THREE.SpriteMaterial).opacity = selecionado || noCaminho ? 1 : 0.7
    }
    fg.backgroundColor(p.modoComando ? '#0e1215' : '#fdfaf3')
      .linkColor((a: Link3D) => caminhoArestas.has(a.chave) ? '#f3b661' : a.de === p.escolhido || a.para === p.escolhido ? '#f8d857' : descreverRelacao(a).sugerida ? '#737f86' : '#809d91')
      .linkWidth((a: Link3D) => caminhoArestas.has(a.chave) ? 2.3 : descreverRelacao(a).sugerida ? 0.35 : 0.8)
      .linkDirectionalArrowLength((a: Link3D) => {
        const d = descreverRelacao(a)
        return d.sugerida || d.relacao === 'contradiz' || d.relacao === 'legada' ? 0 : 3.5
      })
      .linkDirectionalParticles((a: Link3D) => p.animarSinal && !mediaRef.current?.matches && !descreverRelacao(a).sugerida ? 1 : 0)
      .linkDirectionalParticleColor(() => '#e5c75e')
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let graph: any
    const cache = visuais.current
    try {
      const criar = (ForceGraph3D as any).default || ForceGraph3D
      // Forma de inicialização já utilizada pelo projeto na versão 1.x instalada.
      graph = criar()(container)
      graph.width(container.clientWidth || 800).height(container.clientHeight || 550)
        .nodeId('id').showNavInfo(false).d3AlphaMin(0.02).cooldownTicks(140)
        .nodeLabel((n: No3D) => legenda(`${n.rotulo} · ${naturezaDoNo(n)}${n.vencido ? ' · âncora não confere' : ''}`))
        .linkLabel((a: Link3D) => legenda(`${descreverRelacao(a).rotulo} · ${a.tipo ?? 'origem não informada'}: ${a.porque}`))
        .linkDirectionalArrowRelPos(0.92).linkDirectionalParticleSpeed(0.004).linkDirectionalParticleWidth(1.5)
        .onNodeClick((n: No3D, e: MouseEvent) => e.shiftKey ? estadoRef.current.aoLigar(n.id) : estadoRef.current.aoEscolher(n.id))
      graph.nodeThreeObject((n: No3D) => {
        const antigo = cache.get(n.id)
        if (antigo) { descartar(antigo); cache.delete(n.id) }
        const natureza = naturezaDoNo(n)
        // Grau continua sendo conectividade; uma regra isolada mantém tamanho legível.
        const raio = Math.min(6, Math.max(3.6, 2.6 + Math.sqrt(Math.max(0, n.grau)) * 0.5))
        const geometria = natureza === 'fonte' ? new THREE.BoxGeometry(raio * 1.6, raio * 2, raio * 0.65)
          : natureza === 'regra' ? new THREE.CylinderGeometry(raio, raio, raio * 1.5, 6)
          : natureza === 'decisao' || natureza === 'hipotese' ? new THREE.OctahedronGeometry(raio)
          : new THREE.SphereGeometry(raio, 18, 14)
        const material = new THREE.MeshLambertMaterial({ color: corDaAreaEscuro(n.area), transparent: true, opacity: .85, wireframe: natureza === 'hipotese' })
        const grupo = new THREE.Group(); const corpo = new THREE.Mesh(geometria, material); grupo.add(corpo)
        const halo = new THREE.Mesh(new THREE.RingGeometry(raio + 2.1, raio + 2.7, 32), new THREE.MeshBasicMaterial({ color: '#f8d857', side: THREE.DoubleSide, transparent: true, opacity: .85 }))
        halo.visible = false; grupo.add(halo)
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 88
        const ctx = canvas.getContext('2d')
        if (ctx) { ctx.font = '24px sans-serif'; ctx.fillStyle = '#d3dbda'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.rotulo.length > 38 ? n.rotulo.slice(0, 37) + '…' : n.rotulo, 256, 44, 490) }
        const textura = new THREE.CanvasTexture(canvas)
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, transparent: true, depthTest: false }))
        label.position.set(0, -raio - 8, 0); label.scale.set(58, 10, 1); grupo.add(label)
        cache.set(n.id, { grupo, corpo, halo, material, label, textura })
        return grupo
      })
      fgRef.current = graph
    } catch {
      setErro('O contexto 3D não pôde ser iniciado. O modo 2D e as leituras de evidências continuam disponíveis.')
      graph?.pauseAnimation?.(); graph?._destructor?.()
      container.replaceChildren()
      return
    }
    const resize = () => graph.width(container.clientWidth || 800).height(container.clientHeight || 550)
    const observer = new ResizeObserver(resize); observer.observe(container)
    const controlar = () => {
      if (document.hidden || !visivelRef.current) graph.pauseAnimation()
      else graph.resumeAnimation()
      atualizarEstilos()
    }
    const intersection = new IntersectionObserver(entries => { visivelRef.current = entries.some(e => e.isIntersecting); controlar() })
    intersection.observe(container)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'); mediaRef.current = media
    media.addEventListener('change', controlar); document.addEventListener('visibilitychange', controlar)
    controlar()
    return () => {
      observer.disconnect(); intersection.disconnect(); media.removeEventListener('change', controlar); document.removeEventListener('visibilitychange', controlar)
      graph.pauseAnimation()
      cache.forEach(descartar); cache.clear()
      if (typeof graph._destructor === 'function') graph._destructor()
      else { graph.controls?.()?.dispose?.(); graph.renderer?.()?.dispose?.(); graph.renderer?.()?.forceContextLoss?.() }
      fgRef.current = null; container.replaceChildren()
    }
  }, [])

  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const existentes = new Map<string, No3D>((fg.graphData().nodes as No3D[]).map(n => [n.id, n]))
    graphData.nodes.forEach(n => { const p = existentes.get(n.id); if (p) { n.x = p.x; n.y = p.y; n.z = p.z } })
    const ids = new Set(graphData.nodes.map(n => n.id))
    visuais.current.forEach((v, id) => { if (!ids.has(id)) { descartar(v); visuais.current.delete(id) } })
    fg.graphData(graphData)
    atualizarEstilos()
  }, [graphData])
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const orbitas = modoLayout === 'orbita' ? calcularPosicoesOrbita3D(nos) : null
    const especies = ['padrao', 'ordem', 'trava', 'correcao', 'defeito', 'medicao']
    const contagens = new Map<number, number>()
    ;(fg.graphData().nodes as No3D[]).forEach(n => {
      if (orbitas) { const p = orbitas.get(n.id); n.fx = p?.fx; n.fy = p?.fy; n.fz = p?.fz }
      else if (modoLayout === 'hierarquia') {
        const indice = especies.indexOf(n.especie.toLowerCase()); const camada = indice < 0 ? especies.length : indice
        const i = contagens.get(camada) ?? 0; contagens.set(camada, i + 1)
        n.fx = ((i % 6) - 2.5) * 55; n.fy = (camada - 3) * 60; n.fz = (Math.floor(i / 6) - 2) * 40
      } else { n.fx = undefined; n.fy = undefined; n.fz = undefined }
    })
    fg.d3ReheatSimulation()
    atualizarEstilos()
  }, [graphData, modoLayout])
  useEffect(atualizarEstilos, [props.escolhido, props.alvo, caminhoId, props.animarSinal, props.modoComando])

  return <div className="relative h-[550px] w-full overflow-hidden rounded-lg lg:h-[680px]" data-testid="cofre-grafo3d-v2">
    <div ref={containerRef} className="h-full w-full cursor-grab active:cursor-grabbing" />
    {erro && <p role="status" className="absolute inset-0 grid place-items-center p-8 text-sm text-amber-200">{erro}</p>}
    <div className="absolute bottom-3 left-3 right-3 z-10 rounded border border-[#70633a] bg-[#101619]/90 px-3 py-2 text-[10px] text-[#c4ccc9] backdrop-blur-md">
      Arraste para girar · Roda/pinça para zoom · Shift+clique: caminho de navegação, não prova.<br />
      Hexágono: regra · bloco: fonte · losango: decisão/hipótese · linha cinza fina: associação sugerida.
      {props.animarSinal && <span className="block text-[#f8d857]">Pulso decorativo de exploração — não representa consultas reais.</span>}
    </div>
  </div>
}
