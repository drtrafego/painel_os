/**
 * Motor de layout e simulação de força do grafo de convocações em 2D.
 */

import type { Aresta } from './tipos'

export const ALFA_PARADA = 0.05

export type No = {
  id: string
  tipo: 'sessao' | 'agente' | 'sem-cargo' | 'desconhecido'
  peso: number
  x: number
  y: number
  vx: number
  vy: number
}

export type Grafo = {
  nos: No[]
  arestas: { de: string; para: string; vezes: number }[]
  alfa: number
}

export function raioDoPeso(peso: number, maior: number): number {
  const minR = 6
  const maxR = 24
  if (maior <= 0) return minR
  const proporcao = Math.sqrt(Math.max(1, peso)) / Math.sqrt(maior)
  return minR + proporcao * (maxR - minR)
}

export function montarGrafo(arestas: Aresta[], temCargo: (nome: string) => boolean): Grafo {
  const pesos = new Map<string, number>()
  const tipos = new Map<string, No['tipo']>()

  for (const a of arestas) {
    pesos.set(a.de, (pesos.get(a.de) ?? 0) + a.vezes)
    pesos.set(a.para, (pesos.get(a.para) ?? 0) + a.vezes)

    if (!tipos.has(a.de)) {
      if (a.de_tipo) tipos.set(a.de, a.de_tipo)
      else if (temCargo(a.de)) tipos.set(a.de, a.de === 'luana' || a.de === 'renato' ? 'sessao' : 'agente')
      else tipos.set(a.de, 'sem-cargo')
    }
    if (!tipos.has(a.para)) {
      if (temCargo(a.para)) tipos.set(a.para, a.para === 'luana' || a.para === 'renato' ? 'sessao' : 'agente')
      else tipos.set(a.para, 'sem-cargo')
    }
  }

  const ids = Array.from(pesos.keys())
  const total = ids.length
  const raioCirculo = Math.max(150, total * 20)

  const nos: No[] = ids.map((id, i) => {
    const angulo = (i / (total || 1)) * 2 * Math.PI
    return {
      id,
      tipo: tipos.get(id) ?? 'desconhecido',
      peso: pesos.get(id) ?? 1,
      x: Math.cos(angulo) * raioCirculo,
      y: Math.sin(angulo) * raioCirculo,
      vx: 0,
      vy: 0,
    }
  })

  return {
    nos,
    arestas: arestas.map((a) => ({ de: a.de, para: a.para, vezes: a.vezes })),
    alfa: 1.0,
  }
}

export function passo(g: Grafo, raio: (peso: number) => number): number {
  if (g.alfa <= ALFA_PARADA) return g.alfa

  const nos = g.nos
  const porId = new Map(nos.map((n) => [n.id, n]))

  // 1. Repulsão entre nós (Coulomb)
  for (let i = 0; i < nos.length; i++) {
    for (let j = i + 1; j < nos.length; j++) {
      const n1 = nos[i]
      const n2 = nos[j]
      const dx = n2.x - n1.x
      const dy = n2.y - n1.y
      const distSq = dx * dx + dy * dy || 1
      const dist = Math.sqrt(distSq)
      const minD = raio(n1.peso) + raio(n2.peso) + 12

      // Força repulsiva
      const f = (1200 * g.alfa) / (distSq + 100)
      const fx = (dx / dist) * f
      const fy = (dy / dist) * f

      n1.vx -= fx
      n1.vy -= fy
      n2.vx += fx
      n2.vy += fy

      // Colisão direta
      if (dist < minD) {
        const sobreposicao = (minD - dist) * 0.5 * g.alfa
        const ox = (dx / dist) * sobreposicao
        const oy = (dy / dist) * sobreposicao
        n1.vx -= ox
        n1.vy -= oy
        n2.vx += ox
        n2.vy += oy
      }
    }
  }

  // 2. Atração pelas arestas (Hooke)
  for (const a of g.arestas) {
    const de = porId.get(a.de)
    const para = porId.get(a.para)
    if (!de || !para) continue

    const dx = para.x - de.x
    const dy = para.y - de.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const distDesejada = 80 + Math.min(60, 200 / (a.vezes + 1))
    const forca = (dist - distDesejada) * 0.04 * g.alfa

    const fx = (dx / dist) * forca
    const fy = (dy / dist) * forca

    de.vx += fx
    de.vy += fy
    para.vx -= fx
    para.vy -= fy
  }

  // 3. Gravidade central (mantém o grafo centrado na origem)
  for (const n of nos) {
    const distCentro = Math.sqrt(n.x * n.x + n.y * n.y) || 1
    const forcaCentro = distCentro * 0.005 * g.alfa
    n.vx -= (n.x / distCentro) * forcaCentro
    n.vy -= (n.y / distCentro) * forcaCentro

    // Aplica amortecimento e atualiza posições
    n.vx *= 0.6
    n.vy *= 0.6
    n.x += n.vx
    n.y += n.vy
  }

  // Esfriamento exponencial
  g.alfa *= 0.985
  return g.alfa
}

export function moldura(g: Grafo): { x: number; y: number; w: number; h: number } {
  if (g.nos.length === 0) {
    return { x: -200, y: -200, w: 400, h: 400 }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const n of g.nos) {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }

  const margem = 60
  minX -= margem
  maxX += margem
  minY -= margem
  maxY += margem

  const w = Math.max(300, maxX - minX)
  const h = Math.max(200, maxY - minY)

  return { x: minX, y: minY, w, h }
}
