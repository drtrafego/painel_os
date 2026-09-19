/**
 * Matemática, posicionamento, escolha de rótulos e caminhos do Cofre de Conhecimento.
 */

import type { ArestaCofre, NoMemoria } from './tipos'

export type Caixa = {
  largura: number
  altura: number
  fonteRotulo?: number
}

export const CAIXA_CELULAR: Caixa = { largura: 390, altura: 844, fonteRotulo: 10.5 }
export const CAIXA_MESA: Caixa = { largura: 1000, altura: 800, fonteRotulo: 12 }
export const FONTE_ROTULO = 12

export function corDaArea(area: string): string {
  switch (area.toLowerCase()) {
    case 'transversal':
      return 'var(--color-lima)'
    case 'conteúdo':
    case 'conteudo':
      return 'var(--color-ciano)'
    case 'tráfego':
    case 'trafego':
      return 'var(--color-ambar)'
    case 'vendas':
    case 'comercial':
      return 'var(--color-vermelho)'
    case 'engenharia':
    case 'dev':
      return 'var(--color-pervinca)'
    default:
      return 'var(--color-tinta-2)'
  }
}

export function encurtar(texto: string, limite: number): string {
  if (!texto) return ''
  if (texto.length <= limite) return texto
  return texto.slice(0, limite - 1) + '…'
}

export function arestasDoCaminho(caminho: string[] | null): Set<string> {
  const conj = new Set<string>()
  if (!caminho || caminho.length < 2) return conj
  for (let i = 0; i < caminho.length - 1; i++) {
    const a = caminho[i]
    const b = caminho[i + 1]
    conj.add(`${a}|${b}`)
    conj.add(`${b}|${a}`)
  }
  return conj
}

export function caminhoMaisCurto(arestas: ArestaCofre[], de: string, para: string): string[] | null {
  if (de === para) return [de]

  const vizinhos = new Map<string, string[]>()
  for (const a of arestas) {
    const lDe = vizinhos.get(a.de) ?? []
    lDe.push(a.para)
    vizinhos.set(a.de, lDe)

    // Tratado como grafo não-dirigido para navegação bidirecional no explorador
    const lPara = vizinhos.get(a.para) ?? []
    lPara.push(a.de)
    vizinhos.set(a.para, lPara)
  }

  const fila: string[] = [de]
  const visitados = new Set<string>([de])
  const antecessor = new Map<string, string>()

  while (fila.length > 0) {
    const atual = fila.shift()!
    if (atual === para) {
      const rota: string[] = [para]
      let passo = para
      while (antecessor.has(passo)) {
        passo = antecessor.get(passo)!
        rota.unshift(passo)
      }
      return rota
    }

    const proximos = vizinhos.get(atual) ?? []
    for (const p of proximos) {
      if (!visitados.has(p)) {
        visitados.add(p)
        antecessor.set(p, atual)
        fila.push(p)
      }
    }
  }

  return null
}

export function posicionarCofre(
  nos: NoMemoria[],
  caixa: Caixa,
  ordemAreas: string[]
): Map<string, { x: number; y: number; raio: number }> {
  const postos = new Map<string, { x: number; y: number; raio: number }>()
  if (nos.length === 0) return postos

  const cx = caixa.largura / 2
  const cy = caixa.altura / 2
  const raioMax = Math.min(caixa.largura, caixa.altura) * 0.42

  // Agrupa nós por área
  const porArea = new Map<string, NoMemoria[]>()
  for (const n of nos) {
    const lista = porArea.get(n.area) ?? []
    lista.push(n)
    porArea.set(n.area, lista)
  }

  // Lista ordenada de áreas
  const areas = ordemAreas.filter((a) => porArea.has(a))
  for (const a of porArea.keys()) {
    if (!areas.includes(a)) areas.push(a)
  }

  const totalAreas = areas.length || 1

  areas.forEach((area, idxArea) => {
    const lista = porArea.get(area) ?? []
    const anguloBase = (idxArea / totalAreas) * 2 * Math.PI - Math.PI / 2
    const fatia = (2 * Math.PI) / totalAreas

    lista.forEach((n, idxNo) => {
      const grau = n.grau ?? 0
      const raioCirculo = Math.max(5, Math.min(18, 5 + grau * 1.6))

      // Distribuição em anéis concêntricos dentro da fatia angular da área
      const totalNaArea = lista.length
      const distanciaRaio = 70 + (idxNo / (totalNaArea || 1)) * (raioMax - 80)
      const desvioAngulo = totalNaArea > 1 ? ((idxNo - totalNaArea / 2) / totalNaArea) * fatia * 0.75 : 0
      const ang = anguloBase + desvioAngulo

      const x = cx + Math.cos(ang) * distanciaRaio
      const y = cy + Math.sin(ang) * distanciaRaio

      postos.set(n.id, {
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        raio: raioCirculo,
      })
    })
  })

  return postos
}

export function raioDeToque(raio: number, menorDistancia: number): number {
  return Math.max(raio, Math.min(22, menorDistancia * 0.5))
}

export function diagnosticarLayout(
  postos: Map<string, { x: number; y: number; raio: number }>,
  caixa: Caixa
): { menorDistancia: number; colados: number; fora: number } {
  let menorDistancia = Infinity
  let colados = 0
  let fora = 0

  const arr = Array.from(postos.values())
  for (let i = 0; i < arr.length; i++) {
    const p1 = arr[i]
    if (p1.x < 10 || p1.x > caixa.largura - 10 || p1.y < 10 || p1.y > caixa.altura - 10) {
      fora++
    }
    for (let j = i + 1; j < arr.length; j++) {
      const p2 = arr[j]
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < menorDistancia) menorDistancia = d
      if (d < p1.raio + p2.raio + 4) colados++
    }
  }

  return {
    menorDistancia: menorDistancia === Infinity ? 0 : menorDistancia,
    colados,
    fora,
  }
}

export type RotuloEscolhido = {
  id: string
  x: number
  y: number
  ancora: 'start' | 'end' | 'middle'
  texto: string
}

export function escolherRotulos(
  so: Map<string, { x: number; y: number; raio: number }>,
  getNome: (id: string) => string,
  getPrioridade: (id: string) => number,
  caixa: Caixa,
  obstaculos: { x: number; y: number; largura: number; altura: number }[]
): RotuloEscolhido[] {
  const rotulos: RotuloEscolhido[] = []
  const ocupados: { x1: number; y1: number; x2: number; y2: number }[] = obstaculos.map((o) => ({
    x1: o.x,
    y1: o.y,
    x2: o.x + o.largura,
    y2: o.y + o.altura,
  }))

  const ordenados = Array.from(so.entries()).sort(
    ([idA], [idB]) => getPrioridade(idB) - getPrioridade(idA)
  )

  const hTexto = caixa.fonteRotulo ?? FONTE_ROTULO

  for (const [id, p] of ordenados) {
    const nomeCompleto = getNome(id)
    const texto = encurtar(nomeCompleto, 26)
    const wTexto = texto.length * (hTexto * 0.55)

    // Tenta à direita do ponto
    const x1 = p.x + p.raio + 4
    const y1 = p.y - hTexto / 2
    const x2 = x1 + wTexto
    const y2 = y1 + hTexto

    // Confere limites da tela
    if (x2 > caixa.largura - 10 || y1 < 10 || y2 > caixa.altura - 10) {
      continue
    }

    // Confere colisões com outros rótulos e obstáculos
    const colide = ocupados.some(
      (b) => !(x2 < b.x1 || x1 > b.x2 || y2 < b.y1 || y1 > b.y2)
    )

    if (!colide) {
      rotulos.push({
        id,
        x: x1,
        y: p.y + hTexto * 0.35,
        ancora: 'start',
        texto,
      })
      ocupados.push({ x1, y1, x2, y2 })
    }
  }

  return rotulos
}
