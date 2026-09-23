/**
 * Matemática, posicionamento, escolha de rótulos e caminhos do Cofre de Conhecimento.
 */

import type { NoMemoria } from './tipos'

export type Caixa = {
  largura: number
  altura: number
  fonteRotulo?: number
  escalaNo?: number
  maximoRotulo?: number
}

export type CaixaBBox = {
  x: number
  y: number
  largura?: number
  w?: number
  altura?: number
  h?: number
}

export type Posto = {
  id: string
  area: string
  x: number
  y: number
  raio: number
  angulo: number
}

export const CAIXA_CELULAR: Caixa = { largura: 390, altura: 844, fonteRotulo: 10.5 }
export const CAIXA_MESA: Caixa = { largura: 1000, altura: 800, fonteRotulo: 12 }
export const FONTE_ROTULO = 12

/**
 * Piso mínimo de raio de desenho por acessibilidade e legibilidade.
 * O desenho não encolhe abaixo deste piso (3.5px de raio = 7px de diâmetro),
 * e a WCAG 2.5.8 de 24x24px é atendida pelo círculo invisível `raioDeToque`.
 */
export const RAIO_MINIMO_CLICAVEL = 3.5

export function raioDoNo(grau: number, _peso = 3): number {
  const base = 5.5 + Math.sqrt(grau ?? 0) * 3.5
  return Math.max(6, Math.min(18, base))
}

export function cruzam(a: CaixaBBox, b: CaixaBBox): boolean {
  const wA = a.largura ?? a.w ?? 0
  const hA = a.altura ?? a.h ?? 0
  const wB = b.largura ?? b.w ?? 0
  const hB = b.altura ?? b.h ?? 0
  return a.x < b.x + wB && b.x < a.x + wA && a.y < b.y + hB && b.y < a.y + hA
}

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
    case 'bots':
      return 'var(--color-violeta)'
    case 'mineração':
    case 'mineracao':
      return 'var(--color-esmeralda)'
    case 'painel':
      return 'var(--color-rosa)'
    case 'agentes':
      return 'var(--color-azul)'
    case 'vendas':
    case 'comercial':
      return 'var(--color-vermelho)'
    case 'engenharia':
    case 'dev':
      return 'var(--color-pervinca)'
    default:
      return 'var(--color-tinta-3)'
  }
}

// ‼️ 21/09/2026: achado dele com print real, "área não tem todas as cores,
// coloque mais fluor". Causa raiz medida em index.css: `--color-lima`,
// `--color-ambar` E `--color-tinta-3` são LITERALMENTE o mesmo hex
// (`#7a4a0f`), e `--color-pervinca` é quase igual (`#7a6a57`) — a paleta é
// desenhada pra ter bom contraste no fundo CREME, não pra distinguir 7
// identidades num fundo quase preto. Paleta separada, só pro modo escuro,
// com hex direto (não `var()`, não precisa resolver) e saturação alta de
// propósito ("fluor" = o pedido dele).
export function corDaAreaEscuro(area: string): string {
  switch (area.toLowerCase()) {
    case 'transversal':
      return '#A3E635' // lima neon
    case 'conteúdo':
    case 'conteudo':
      return '#22D3EE' // ciano vivo
    case 'tráfego':
    case 'trafego':
      return '#FBBF24' // âmbar vivo
    case 'bots':
      return '#C084FC' // violeta vivo
    case 'mineração':
    case 'mineracao':
      return '#34D399' // esmeralda vivo
    case 'painel':
      return '#F472B6' // rosa vivo
    case 'agentes':
      return '#60A5FA' // azul vivo
    case 'vendas':
    case 'comercial':
      return '#F87171' // vermelho vivo
    case 'engenharia':
    case 'dev':
      return '#818CF8' // índigo vivo
    default:
      return '#94A3B8' // cinza-azulado neutro, nunca igual a outra área
  }
}

export function encurtar(texto: string, limite?: number): string {
  if (!texto) return ''
  if (!limite || texto.length <= limite) return texto
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

export function caminhoMaisCurto(
  arestas: { de: string; para: string; porque?: string; ponte?: boolean }[],
  de: string,
  para: string
): string[] | null {
  if (de === para) return [de]

  const vizinhos = new Map<string, string[]>()
  for (const a of arestas) {
    const lDe = vizinhos.get(a.de) ?? []
    lDe.push(a.para)
    vizinhos.set(a.de, lDe)

    // Grafo não-dirigido para navegação bidirecional no explorador
    const lPara = vizinhos.get(a.para) ?? []
    lPara.push(a.de)
    vizinhos.set(a.para, lPara)
  }

  if (!vizinhos.has(de) || !vizinhos.has(para)) return null

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
): Map<string, Posto> {
  const postos = new Map<string, Posto>()
  if (nos.length === 0) return postos

  const cx = caixa.largura / 2
  const cy = caixa.altura / 2
  const isMobile = caixa.largura < 500

  // Escala adaptativa do raio dos nós quando o volume aumenta ou caixa especifica escalaNo
  const nTotalNos = nos.length
  let escala = caixa.escalaNo ?? 1
  if (caixa.escalaNo === undefined) {
    if (isMobile) {
      if (nTotalNos > 120) escala = 0.40
      else if (nTotalNos > 70) escala = 0.46
      else if (nTotalNos > 50) escala = 0.52
      else if (nTotalNos > 35) escala = 0.58
    } else {
      if (nTotalNos > 200) escala = 0.38
      else if (nTotalNos > 110) escala = 0.46
      else if (nTotalNos > 80) escala = 0.52
      else if (nTotalNos > 40) escala = 0.62
    }
  }

  // Agrupa nós por área
  const porArea = new Map<string, NoMemoria[]>()
  for (const n of nos) {
    const lista = porArea.get(n.area) ?? []
    lista.push(n)
    porArea.set(n.area, lista)
  }

  const temTransversal = porArea.has('transversal')
  const soTransversal = temTransversal && porArea.size === 1

  // Áreas ordenadas (excluindo transversal que fica no miolo, a menos que só haja transversal)
  const areasExternas = ordemAreas.filter((a) => a !== 'transversal' && porArea.has(a))
  for (const a of porArea.keys()) {
    if (a !== 'transversal' && !areasExternas.includes(a)) areasExternas.push(a)
  }

  const totalExternas = areasExternas.length
  const rxMax = (caixa.largura / 2) * (isMobile ? 0.90 : 0.90)
  const ryMax = (caixa.altura / 2) * (isMobile ? 0.84 : 0.90)

  // 1. Layout dos nós transversais (no miolo quando há outras áreas, ou no mapa todo se só houver transversal)
  if (temTransversal) {
    const listaTransversal = porArea.get('transversal') ?? []
    const nTrans = listaTransversal.length

    if (soTransversal) {
      // Usa o mapa todo em múltiplos anéis concêntricos
      let aneis = 1
      if (nTrans > 40) aneis = 5
      else if (nTrans > 25) aneis = 4
      else if (nTrans > 12) aneis = 3
      else if (nTrans > 5) aneis = 2

      let tIdx = 0
      for (let anelIdx = 0; anelIdx < aneis; anelIdx++) {
        const fracAnel = (anelIdx + 0.6) / aneis
        const rx = 35 + fracAnel * (rxMax - 35)
        const ry = 35 + fracAnel * (ryMax - 35)
        const qtd = Math.round(nTrans / aneis) + (anelIdx === aneis - 1 ? nTrans - Math.round(nTrans / aneis) * aneis : 0)
        for (let i = 0; i < qtd && tIdx < nTrans; i++) {
          const n = listaTransversal[tIdx++]
          const ang = (i / qtd) * 2 * Math.PI + (anelIdx % 2 === 1 ? Math.PI / qtd : 0)
          const rBase = raioDoNo(n.grau, n.peso)
          const r = Math.max(RAIO_MINIMO_CLICAVEL, rBase * escala)
          postos.set(n.id, {
            id: n.id,
            area: 'transversal',
            x: cx + Math.cos(ang) * rx,
            y: cy + Math.sin(ang) * ry,
            raio: r,
            angulo: ang,
          })
        }
      }
    } else {
      // Miolo: raio máximo strictly menor que rMin das outras áreas (rMioloMax <= 54/66 vs rMinExt >= 85/98)
      const rMioloMax = isMobile ? 52 : 66
      let aneis = 1
      if (nTrans > 8) aneis = 2

      let tIdx = 0
      if (aneis === 1) {
        const rx = Math.min(rMioloMax * 0.85, 20 + nTrans * 3.5)
        for (let i = 0; i < nTrans; i++) {
          const n = listaTransversal[tIdx++]
          const ang = (i / nTrans) * 2 * Math.PI - Math.PI / 2
          const rBase = raioDoNo(n.grau, n.peso)
          const r = Math.max(RAIO_MINIMO_CLICAVEL, rBase * escala)
          postos.set(n.id, {
            id: n.id,
            area: 'transversal',
            x: cx + Math.cos(ang) * rx,
            y: cy + Math.sin(ang) * rx,
            raio: r,
            angulo: ang,
          })
        }
      } else {
        const intQtd = Math.floor(nTrans * 0.4)
        const extQtd = nTrans - intQtd
        for (let i = 0; i < intQtd; i++) {
          const n = listaTransversal[tIdx++]
          const ang = (i / intQtd) * 2 * Math.PI - Math.PI / 2
          const rBase = raioDoNo(n.grau, n.peso)
          const r = Math.max(RAIO_MINIMO_CLICAVEL, rBase * escala)
          postos.set(n.id, {
            id: n.id,
            area: 'transversal',
            x: cx + Math.cos(ang) * 24,
            y: cy + Math.sin(ang) * 24,
            raio: r,
            angulo: ang,
          })
        }
        for (let i = 0; i < extQtd; i++) {
          const n = listaTransversal[tIdx++]
          const ang = (i / extQtd) * 2 * Math.PI - Math.PI / 2 + Math.PI / extQtd
          const rBase = raioDoNo(n.grau, n.peso)
          const r = Math.max(RAIO_MINIMO_CLICAVEL, rBase * escala)
          postos.set(n.id, {
            id: n.id,
            area: 'transversal',
            x: cx + Math.cos(ang) * rMioloMax,
            y: cy + Math.sin(ang) * rMioloMax,
            raio: r,
            angulo: ang,
          })
        }
      }
    }
  }

  // 2. Layout das áreas externas (setores angulares)
  if (totalExternas > 0) {
    const rxMinExt = temTransversal ? (isMobile ? 85 : 98) : (isMobile ? 35 : 55)
    const ryMinExt = temTransversal ? (isMobile ? 95 : 108) : (isMobile ? 45 : 60)
    const fatia = (2 * Math.PI) / totalExternas

    areasExternas.forEach((area, idxArea) => {
      const lista = porArea.get(area) ?? []
      const nArea = lista.length
      if (nArea === 0) return

      const anguloCentro = (idxArea / totalExternas) * 2 * Math.PI - Math.PI / 2
      const margemAngular = totalExternas === 1 ? 0 : fatia * 0.08
      const anguloUtil = totalExternas === 1 ? 2 * Math.PI : fatia - margemAngular * 2

      let numAneis = 1
      if (totalExternas === 1) {
        if (nArea > 35) numAneis = 4
        else if (nArea > 20) numAneis = 3
        else if (nArea > 8) numAneis = 2
      } else {
        if (nArea > 24) numAneis = 5
        else if (nArea > 14) numAneis = 4
        else if (nArea > 7) numAneis = 3
        else if (nArea > 3) numAneis = 2
      }

      let aIdx = 0
      for (let anelIdx = 0; anelIdx < numAneis; anelIdx++) {
        const t = numAneis === 1 ? 0.5 : anelIdx / (numAneis - 1)
        const rx = rxMinExt + t * (rxMax - rxMinExt)
        const ry = ryMinExt + t * (ryMax - ryMinExt)
        const offset = anelIdx % 2 === 1 ? 0.5 : 0
        const qtd = Math.ceil((nArea - aIdx) / (numAneis - anelIdx))

        for (let i = 0; i < qtd && aIdx < nArea; i++) {
          const n = lista[aIdx++]
          let ang = 0
          if (totalExternas === 1) {
            ang = (i / qtd) * 2 * Math.PI + (offset ? Math.PI / qtd : 0)
          } else {
            let frac = 0
            if (qtd > 1) {
              frac = (i + 0.5 + (offset ? 0.25 : -0.25)) / qtd - 0.5
              frac = Math.max(-0.46, Math.min(0.46, frac))
            }
            ang = anguloCentro + frac * anguloUtil
          }
          const r = Math.max(RAIO_MINIMO_CLICAVEL, raioDoNo(n.grau, n.peso) * escala)
          postos.set(n.id, {
            id: n.id,
            area,
            x: cx + Math.cos(ang) * rx,
            y: cy + Math.sin(ang) * ry,
            raio: r,
            angulo: ang,
            anguloMin: totalExternas === 1 ? undefined : anguloCentro - fatia * 0.48,
            anguloMax: totalExternas === 1 ? undefined : anguloCentro + fatia * 0.48,
            rxMin: rxMinExt,
            rxMax,
            ryMin: ryMinExt,
            ryMax,
          } as unknown as Posto & {
            anguloMin?: number
            anguloMax?: number
            rxMin?: number
            rxMax?: number
            ryMin?: number
            ryMax?: number
          })
        }
      }
    })
  }

  // Relaxation pass
  if (nTotalNos <= 180) {
    const arr = Array.from(postos.values()) as (Posto & {
      anguloMin?: number
      anguloMax?: number
      rxMin?: number
      rxMax?: number
    })[]
    const iteracoes = 35
    for (let it = 0; it < iteracoes; it++) {
      for (let i = 0; i < arr.length; i++) {
        const p1 = arr[i]
        for (let j = i + 1; j < arr.length; j++) {
          const p2 = arr[j]
          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const d = Math.hypot(dx, dy) || 0.001
          const minDist = p1.raio + p2.raio + 2.5
          if (d < minDist) {
            const overlap = (minDist - d) * 0.5
            const nx = dx / d
            const ny = dy / d
            p1.x -= nx * overlap
            p1.y -= ny * overlap
            p2.x += nx * overlap
            p2.y += ny * overlap
          }
        }
        if (p1.area !== 'transversal' && p1.anguloMin !== undefined && p1.anguloMax !== undefined && p1.rxMin !== undefined && p1.rxMax !== undefined) {
          const dx = p1.x - cx
          const dy = p1.y - cy
          let ang = Math.atan2(dy, dx)
          let dMin = ang - p1.anguloMin
          while (dMin < -Math.PI) dMin += 2 * Math.PI
          while (dMin > Math.PI) dMin -= 2 * Math.PI
          let dMax = ang - p1.anguloMax
          while (dMax < -Math.PI) dMax += 2 * Math.PI
          while (dMax > Math.PI) dMax -= 2 * Math.PI
          if (dMin < 0) ang = p1.anguloMin
          else if (dMax > 0) ang = p1.anguloMax
          const dist = Math.hypot(dx, dy)
          const clamped = Math.max(p1.rxMin, Math.min(p1.rxMax, dist))
          p1.x = cx + Math.cos(ang) * clamped
          p1.y = cy + Math.sin(ang) * clamped
          p1.angulo = ang
        }
        const b = p1.raio + 3
        p1.x = Math.max(b, Math.min(caixa.largura - b, p1.x))
        p1.y = Math.max(b, Math.min(caixa.altura - b, p1.y))
      }
    }
  }

  for (const [id, p] of postos.entries()) {
    postos.set(id, {
      id: p.id,
      area: p.area,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      raio: Math.round(p.raio * 10) / 10,
      angulo: p.angulo,
    })
  }

  return postos
}

export function raioDeToque(raio: number, menorDistancia: number): number {
  if (menorDistancia * 0.5 < raio) return raio
  return Math.min(22, Math.max(raio, menorDistancia * 0.5))
}

export function diagnosticarLayout(
  postos: Map<string, Posto>,
  caixa: Caixa
): { menorDistancia: number; menorRaio: number; colados: number; fora: number } {
  let menorDistancia = Infinity
  let menorRaio = Infinity
  let colados = 0
  let fora = 0

  const arr = Array.from(postos.values())
  for (let i = 0; i < arr.length; i++) {
    const p1 = arr[i]
    if (p1.raio < menorRaio) menorRaio = p1.raio
    if (
      p1.x - p1.raio < 0 ||
      p1.x + p1.raio > caixa.largura ||
      p1.y - p1.raio < 0 ||
      p1.y + p1.raio > caixa.altura
    ) {
      fora++
    }
    for (let j = i + 1; j < arr.length; j++) {
      const p2 = arr[j]
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const d = Math.hypot(dx, dy)
      if (d < menorDistancia) menorDistancia = d
      if (d < p1.raio + p2.raio + 2) colados++
    }
  }

  return {
    menorDistancia: menorDistancia === Infinity ? 0 : menorDistancia,
    menorRaio: menorRaio === Infinity ? 0 : menorRaio,
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
  so: Map<string, Posto>,
  getNome: (id: string) => string,
  getPrioridade: (id: string) => number,
  caixa: Caixa,
  obstaculos: CaixaBBox[] = []
): RotuloEscolhido[] {
  const rotulos: RotuloEscolhido[] = []
  const ocupados: CaixaBBox[] = obstaculos.map((o) => ({
    x: o.x,
    y: o.y,
    largura: o.largura ?? o.w ?? 0,
    altura: o.altura ?? o.h ?? 0,
  }))

  const ordenados = Array.from(so.entries()).sort(
    ([idA], [idB]) => getPrioridade(idB) - getPrioridade(idA)
  )

  const hTexto = caixa.fonteRotulo ?? FONTE_ROTULO
  const maxLen = caixa.maximoRotulo ?? 26

  for (const [id, p] of ordenados) {
    const nomeCompleto = getNome(id)
    const texto = encurtar(nomeCompleto, maxLen)
    const wTexto = texto.length * (hTexto * 0.55)

    const x1 = p.x + p.raio + 4
    const y1 = p.y - hTexto / 2
    const x2 = x1 + wTexto
    const y2 = y1 + hTexto

    if (x2 > caixa.largura - 4 || y1 < 4 || y2 > caixa.altura - 4) {
      continue
    }

    const candBbox: CaixaBBox = { x: x1, y: y1, largura: wTexto, altura: hTexto }
    const colide = ocupados.some((o) => cruzam(candBbox, o))
    if (!colide) {
      rotulos.push({
        id,
        x: Math.round(x1 * 10) / 10,
        y: Math.round((p.y + hTexto * 0.35) * 10) / 10,
        ancora: 'start',
        texto,
      })
      ocupados.push(candBbox)
    }
  }

  return rotulos
}
