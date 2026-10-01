/**
 * PixelOffice CT Gold — Cenário 2.5D de Alta Fidelidade em Canvas 2D.
 * Renderização moderna no padrão visual aprovado (preto/grafite + dourado/amarelo).
 * Preserva 100% da lógica operacional: agentes, squads, descanso, hitboxes e seleção.
 */

export interface PessoaGold {
  chave: string; animacaoChave: string; nome: string; squad: string; squadNome: string
  cor: string; corEscura: string; destaque: string; cabelo: string; pele: string
  acessorio: number; ativa: boolean; temporaria: boolean; ordem: number; objeto: string
  execucao: { estado: string; ferramenta?: string | null }
}
export interface MesaGold {
  x: number; y: number; descanso: { x: number; y: number }; execucao: PessoaGold
}
export interface IlhaGold {
  x: number; y: number; largura: number; altura: number; squad: string
  nome: string; cor: string; tipo: string; compacta: boolean
  postos: ReadonlyArray<{ x: number; y: number }>; mesas: ReadonlyArray<MesaGold>
}
export interface PlantaGold {
  largura: number; altura: number; corredorX: number; descansoY: number
  descansoAberto: boolean; ocupantesDescanso: number
  ilhas: ReadonlyArray<IlhaGold>; mesas: ReadonlyArray<MesaGold>
}
export interface PoseGold {
  x: number; y: number; sentado: number; andando: boolean; fase: string
}
export interface QuadroGold {
  layout: PlantaGold
  personagens: ReadonlyArray<{ mesa: MesaGold; pose: PoseGold }>
  progressoDia: number; tempo: number; reduzirMovimento: boolean
  selecionadoId?: string | null; progressos?: ReadonlyMap<string, number>
}
export interface HitGold {
  chave: string; x: number; y: number; largura: number; altura: number; modulo?: string
}

type Ponto = { x: number; y: number }
type Objeto = { ordem: number; desenhar: () => void; ilha?: IlhaGold }

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))

function mix(a: string, b: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) || 0)
  const aa = rgb(/^#[\da-f]{6}$/i.test(a) ? a : '#716ca8'), bb = rgb(/^#[\da-f]{6}$/i.test(b) ? b : '#202428')
  return `#${aa.map((v, i) => Math.round(v + (bb[i] - v) * clamp(t)).toString(16).padStart(2, '0')).join('')}`
}
const dark = (c: string, n = .3) => mix(c, '#090b0e', n)
const light = (c: string, n = .3) => mix(c, '#ffffff', n)

/** Renderiza o escritório 2.5D com acabamento premium e fidelidade total ao conceito CT */
export function desenharEscritorioGold(ctx: CanvasRenderingContext2D, quadro: QuadroGold): HitGold[] {
  const { layout, tempo, reduzirMovimento } = quadro
  const w = layout.largura, h = layout.altura, dia = clamp(quadro.progressoDia)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return []

  const fila: Objeto[] = []
  const hits: HitGold[] = []
  const etiquetas: Array<{ ilha?: IlhaGold; desenhar: () => void }> = []

  // Projeção frontal 2.5D limpa com convergência de profundidade arquitetônica sutil
  const raw = (x: number, z: number, altura = 0): Ponto => {
    const cx = w * 0.5
    const k = 0.90 + 0.16 * clamp(z / Math.max(1, h))
    const px = cx + (x - cx) * k
    const py = z * 0.82 - altura
    return { x: px, y: py }
  }

  const limites = [
    raw(0, 0, 110), raw(w, 0, 110),
    raw(0, h, 0), raw(w, h, 0),
    raw(0, 0, 0), raw(w, 0, 0)
  ]
  const minX = Math.min(...limites.map(p => p.x)), maxX = Math.max(...limites.map(p => p.x))
  const minY = Math.min(...limites.map(p => p.y)), maxY = Math.max(...limites.map(p => p.y))
  const escala = Math.min((w - 24) / (maxX - minX), (h - 28) / (maxY - minY))
  const dx = (w - (maxX - minX) * escala) / 2 - minX * escala
  const dy = (h - (maxY - minY) * escala) / 2 - minY * escala

  const p = (x: number, z: number, altura = 0): Ponto => {
    const q = raw(x, z, altura)
    return { x: dx + q.x * escala, y: dy + q.y * escala }
  }

  // Paleta premium inspirada no conceito aprovado
  const ouro = '#F4CE4B'
  const ouroSuave = '#eed16d'
  const ouroEscuro = '#967d28'

  const tinta = {
    piso: mix('#13161a', '#181c21', dia),
    pisoBorda: '#242a30',
    parede: mix('#0d0f12', '#14171a', dia),
    metal: '#2a2e33',
    tampoMesa: '#181d22',
    tampoMesaBorda: '#30373f',
    ouro,
    ouroSuave,
  }

  const poly = (pontos: Ponto[], cor: string, borda?: string, larguraBorda = 1) => {
    if (pontos.length < 3) return
    ctx.beginPath()
    pontos.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
    ctx.closePath()
    ctx.fillStyle = cor
    ctx.fill()
    if (borda) {
      ctx.strokeStyle = borda
      ctx.lineWidth = Math.max(0.4, larguraBorda * escala)
      ctx.stroke()
    }
  }

  const linha = (a: Ponto, b: Ponto, cor: string, largura = 1, glow = false) => {
    ctx.save()
    if (glow) {
      ctx.shadowColor = cor
      ctx.shadowBlur = Math.max(2, 6 * escala)
    }
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.strokeStyle = cor
    ctx.lineWidth = Math.max(0.4, largura * escala)
    ctx.stroke()
    ctx.restore()
  }

  const plano = (x: number, z: number, a: number, b: number, y: number, cor: string, borda?: string) =>
    poly([p(x, z, y), p(x + a, z, y), p(x + a, z + b, y), p(x, z + b, y)], cor, borda)

  const caixa = (x: number, z: number, a: number, b: number, y: number, alto: number, cor: string, borda?: string) => {
    const t = y + alto
    // Face frontal
    poly([p(x, z + b, y), p(x + a, z + b, y), p(x + a, z + b, t), p(x, z + b, t)], dark(cor, 0.25), borda)
    // Face lateral direita
    poly([p(x + a, z, y), p(x + a, z + b, y), p(x + a, z + b, t), p(x + a, z, t)], dark(cor, 0.40), borda)
    // Face superior
    plano(x, z, a, b, t, light(cor, 0.08), borda)
    // Destaque na quina superior frontal
    linha(p(x, z + b, t), p(x + a, z + b, t), light(cor, 0.28), 0.75)
  }

  const elipse = (q: Ponto, rx: number, ry: number, cor: string, borda?: string) => {
    ctx.save()
    ctx.fillStyle = cor
    ctx.beginPath()
    ctx.ellipse(q.x, q.y, Math.max(0.01, rx * escala), Math.max(0.01, ry * escala), 0, 0, Math.PI * 2)
    ctx.fill()
    if (borda) {
      ctx.strokeStyle = borda
      ctx.lineWidth = Math.max(0.4, 0.8 * escala)
      ctx.stroke()
    }
    ctx.restore()
  }

  const ovalChao = (x: number, z: number, raioX: number, raioZ: number, y: number, cor: string) => {
    const pts = Array.from({ length: 24 }, (_, i) =>
      p(x + Math.cos((i * Math.PI * 2) / 24) * raioX, z + Math.sin((i * Math.PI * 2) / 24) * raioZ, y)
    )
    poly(pts, cor)
  }

  const cilindro = (x: number, z: number, r: number, y: number, alto: number, cor: string) => {
    const q = p(x, z, y), qt = p(x, z, y + alto), rx = r * escala
    const g = ctx.createLinearGradient(q.x - rx, 0, q.x + rx, 0)
    g.addColorStop(0, light(cor, 0.20))
    g.addColorStop(0.5, cor)
    g.addColorStop(1, dark(cor, 0.35))
    ctx.fillStyle = g
    ctx.fillRect(q.x - rx, qt.y, rx * 2, Math.max(1, q.y - qt.y))
    elipse(q, r, r * 0.65, cor)
    elipse(qt, r, r * 0.65, light(cor, 0.22))
  }

  const rr = (x: number, y: number, a: number, b: number, r: number, cor: string, borda?: string, glow?: string) => {
    const raio = Math.min(r, a / 2, b / 2)
    ctx.save()
    if (glow) {
      ctx.shadowColor = glow
      ctx.shadowBlur = 8 * escala
    }
    ctx.beginPath()
    ctx.moveTo(x + raio, y)
    ctx.arcTo(x + a, y, x + a, y + b, raio)
    ctx.arcTo(x + a, y + b, x, y + b, raio)
    ctx.arcTo(x, y + b, x, y, raio)
    ctx.arcTo(x, y, x + a, y, raio)
    ctx.closePath()
    ctx.fillStyle = cor
    ctx.fill()
    if (borda) {
      ctx.strokeStyle = borda
      ctx.lineWidth = Math.max(0.5, 0.9 * escala)
      ctx.stroke()
    }
    ctx.restore()
  }

  const texto = (s: string, q: Ponto, tamanho: number, cor: string, peso = 600, alinhamento: CanvasTextAlign = 'left') => {
    ctx.font = `${peso} ${Math.max(6, tamanho * escala)}px Inter, system-ui, -apple-system, sans-serif`
    ctx.textAlign = alinhamento
    ctx.textBaseline = 'middle'
    ctx.fillStyle = cor
    ctx.fillText(s, q.x, q.y)
  }

  const limitarTexto = (s: string, max: number, fonte: number): string => {
    ctx.font = `650 ${Math.max(6, fonte * escala)}px Inter, system-ui, sans-serif`
    if (ctx.measureText(s).width <= max * escala) return s
    const chars = Array.from(s)
    let inicio = 0, fim = chars.length
    while (inicio < fim) {
      const meio = Math.ceil((inicio + fim) / 2)
      if (ctx.measureText(chars.slice(0, meio).join('') + '…').width <= max * escala) inicio = meio
      else fim = meio - 1
    }
    return chars.slice(0, inicio).join('') + '…'
  }

  const placa = (s: string, q: Ponto, cor: string, fonte = 9.5, selecionada = false) => {
    const rotulo = limitarTexto(s, 140, fonte)
    ctx.font = `650 ${Math.max(6, fonte * escala)}px Inter, system-ui, sans-serif`
    const largura = ctx.measureText(rotulo).width + 24 * escala
    const altura = Math.max(19, (fonte + 8) * escala)
    rr(
      q.x - largura / 2, q.y - altura / 2, largura, altura, 5 * escala,
      selecionada ? '#272314' : '#14171a',
      selecionada ? ouro : '#443d2c',
      selecionada ? ouro : undefined
    )
    elipse({ x: q.x - largura / 2 + 8 * escala, y: q.y }, 2.5, 2.5, cor)
    texto(rotulo, { x: q.x + 4 * escala, y: q.y }, fonte, selecionada ? '#ffffff' : '#eeeada', 650, 'center')
    return { x: q.x - largura / 2, y: q.y - altura / 2, largura, altura }
  }

  const adicionar = (x: number, z: number, desenhar: () => void, ilha?: IlhaGold) =>
    fila.push({ ordem: z + x * 0.15, desenhar, ilha })

  const comIlha = (ilha: IlhaGold | undefined, desenhar: () => void) => {
    const fase = ilha ? clamp(quadro.progressos?.get(ilha.squad) ?? 1) : 1
    ctx.save()
    if (ilha && fase < 0.999) {
      const base = p(ilha.x + ilha.largura / 2, ilha.y + ilha.altura)
      ctx.globalAlpha *= 0.12 + fase * 0.88
      ctx.translate(base.x, base.y)
      ctx.scale(0.72 + fase * 0.28, 0.18 + fase * 0.82)
      ctx.translate(-base.x, -base.y)
    }
    try {
      desenhar()
    } finally {
      ctx.restore()
    }
  }

  const hitProjetado = (hit: HitGold, ilha?: IlhaGold): HitGold => {
    if (!ilha) return hit
    const t = clamp(quadro.progressos?.get(ilha.squad) ?? 1)
    if (t >= 0.999) return hit
    const b = p(ilha.x + ilha.largura / 2, ilha.y + ilha.altura)
    const sx = 0.72 + t * 0.28, sy = 0.18 + t * 0.82
    return { chave: hit.chave, x: b.x + (hit.x - b.x) * sx, y: b.y + (hit.y - b.y) * sy, largura: hit.largura * sx, altura: hit.altura * sy }
  }

  // Planta decorativa luxuosa (vaso canelado + folhagens tropicais com volume)
  const planta = (x: number, z: number, tam = 1, vasoCor = '#26292e') => {
    ovalChao(x + 4, z + 3, 16 * tam, 10 * tam, 0.5, '#00000066')
    cilindro(x, z, 8.5 * tam, 1, 15 * tam, vasoCor)
    linha(p(x - 7 * tam, z, 16 * tam), p(x + 7 * tam, z, 16 * tam), ouroEscuro, 1.2 * tam)
    const haste = p(x, z, 26 * tam)
    linha(p(x, z, 15 * tam), p(x, z, 44 * tam), '#2d5a3f', 1.6 * tam)
    for (let i = 0; i < 8; i++) {
      const ang = i * 2.3
      const dist = (8 + (i % 3) * 3) * tam
      const centro = p(x + Math.cos(ang) * dist, z + Math.sin(ang) * (dist * 0.6), (24 + i * 2.4) * tam)
      const tip = { x: centro.x + Math.cos(ang) * 9 * escala * tam, y: centro.y - 10 * escala * tam }
      ctx.beginPath()
      ctx.moveTo(haste.x, haste.y)
      ctx.quadraticCurveTo(centro.x - 12 * escala * tam, centro.y - 12 * escala * tam, tip.x, tip.y)
      ctx.quadraticCurveTo(centro.x + 12 * escala * tam, centro.y + 6 * escala * tam, haste.x, haste.y)
      ctx.fillStyle = ['#276749', '#388e3c', '#48bb78', '#2f855a'][i % 4]
      ctx.fill()
      linha(haste, tip, '#9ae6b466', 0.6 * tam)
    }
  }

  // Poltrona executiva e lounge confortável com almofadas
  const poltrona = (x: number, z: number, cor: string, lounge = false) => {
    ovalChao(x + 2, z + 3, 19, 12, 0.8, '#00000066')
    if (!lounge) {
      cilindro(x, z, 2.5, 0, 11, '#47505f')
      for (const [a, b] of [[-11, 7], [11, 7], [-8, -7], [8, -7], [0, 10]]) {
        linha(p(x, z, 3), p(x + a, z + b, 1.5), '#2a313d', 2.6)
        cilindro(x + a, z + b, 1.8, 0, 2.2, '#1a1f28')
      }
    }
    // Assento estofado curvado
    caixa(x - 14, z - 10, 28, 22, lounge ? 3 : 11, 6, cor)
    // Encosto alto ergonômico
    caixa(x - 15, z + 8, 30, 5, lounge ? 7 : 16, 23, cor)
    // Braços laterais confortáveis
    caixa(x - 19, z - 9, 5, 23, lounge ? 5 : 13, 14, dark(cor, 0.15))
    caixa(x + 14, z - 9, 5, 23, lounge ? 5 : 13, 14, dark(cor, 0.15))
    if (lounge) {
      // Almofada dourada acolhedora
      caixa(x - 8, z + 3, 16, 5, 12, 11, '#cbb36c')
    } else {
      // Emblema CT dourado na nuca da cadeira executiva
      const ptLogo = p(x, z + 12, 33)
      ctx.fillStyle = '#f4ce4b'
      ctx.font = `700 ${6 * escala}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('CT', ptLogo.x, ptLogo.y)
    }
  }

  // Estação de trabalho premium (mesa moderna, iluminação LED neon, monitores duplos e cadeira)
  const mesa = (x: number, z: number, pessoa?: PessoaGold) => {
    ovalChao(x + 4, z + 12, 48, 26, 0.6, '#00000066')

    // Pés de aço grafite escovado
    for (const [xx, zz] of [[-34, -18], [32, -18], [-34, 16], [32, 16]]) {
      caixa(x + xx, z + zz, 3.8, 4, 0, 26, '#24282d')
    }

    // Tampo executivo escuro
    caixa(x - 40, z - 22, 80, 44, 25, 4.5, tinta.tampoMesa, tinta.tampoMesaBorda)

    // FITA DE LED DOURADA NA BORDA INFERIOR DO TAMPO (Assinatura visual do conceito)
    linha(p(x - 39, z + 22, 27), p(x + 39, z + 22, 27), ouro, 2.2, true)

    // Deskmat acolchoado escuro com costura sutil
    plano(x - 28, z - 18, 50, 32, 29.8, '#101317')
    linha(p(x - 27, z + 13, 30), p(x + 21, z + 13, 30), '#38414b', 0.8)

    // Base e braço articulado dos monitores
    caixa(x - 8, z - 12, 16, 8, 30, 2, '#2d3339')
    caixa(x - 1.5, z - 11, 3, 3, 31, 10, '#49525c')

    if (!pessoa) {
      // ESTAÇÃO DISPONÍVEL (+) — Exatamente como a fileira frontal da referência
      // Monitor duplo em standby
      caixa(x - 22, z - 13, 44, 3, 39, 23, '#14181c', '#2c333c')
      poly([p(x - 20, z - 9.8, 41), p(x + 20, z - 9.8, 41), p(x + 20, z - 9.8, 60), p(x - 20, z - 9.8, 60)], '#0a0d10')

      // Badge flutuante "Posição disponível (+)" com cápsula arredondada elegante
      const qDisp = p(x, z - 10, 52)
      const wPill = 78 * escala
      const hPill = 18 * escala
      rr(qDisp.x - wPill / 2, qDisp.y - hPill / 2, wPill, hPill, 4 * escala, '#13171bcc', '#403828')
      texto('Posição disponível', { x: qDisp.x, y: qDisp.y }, 7.5, '#eae7db', 650, 'center')

      const qPlus = p(x, z - 10, 38)
      elipse(qPlus, 5.5, 5.5, '#221e14', ouro)
      texto('+', qPlus, 8.5, ouro, 750, 'center')

      // Mini planta suculenta no canto da mesa livre
      cilindro(x + 28, z - 12, 3, 30, 4.5, '#40464d')
      elipse(p(x + 28, z - 12, 35), 4, 3, '#38a169')

      // Cadeira vazia alinhada à mesa
      poltrona(x, z + 30, '#2e3338')
      return
    }

    // MONITORES ATIVOS / EM USO
    const ativa = pessoa.ativa
    const silenciosa = pessoa.execucao.estado === 'silencioso'
    const corTela = ativa ? '#0e181b' : silenciosa ? '#191b15' : '#111417'

    // Carcaça dos monitores duplos lado a lado
    caixa(x - 22, z - 13, 21, 3, 39, 23, '#191d22', '#2f3741')
    caixa(x + 1, z - 13, 21, 3, 39, 23, '#191d22', '#2f3741')

    // Superfície das telas
    poly([p(x - 20, z - 9.8, 41), p(x - 2, z - 9.8, 41), p(x - 2, z - 9.8, 60), p(x - 20, z - 9.8, 60)], corTela)
    poly([p(x + 3, z - 9.8, 41), p(x + 21, z - 9.8, 41), p(x + 21, z - 9.8, 60), p(x + 3, z - 9.8, 60)], corTela)

    if (ativa) {
      // Linhas de código / telemetria viva nos monitores
      const corDestaque = light(pessoa.cor, 0.4)
      for (let i = 0; i < 4; i++) {
        const yLine = 56 - i * 4.2
        linha(p(x - 18, z - 9.5, yLine), p(x - 6 - (i % 2) * 4, z - 9.5, yLine), i === 0 ? corDestaque : '#48bb78', 1.4)
        linha(p(x + 5, z - 9.5, yLine), p(x + 18 - ((i + 1) % 2) * 3, z - 9.5, yLine), i === 1 ? ouro : '#63b3ed', 1.4)
      }
      // Pulso suave de luz emitido pela tela sobre o teclado
      const pulso = reduzirMovimento ? 1 : 0.72 + Math.sin(tempo * 2.5 + pessoa.ordem) * 0.18
      ctx.save()
      ctx.globalAlpha *= pulso
      plano(x - 22, z - 8, 44, 24, 30.2, '#f4ce4b14')
      ctx.restore()
    } else if (silenciosa) {
      linha(p(x - 14, z - 9.5, 50), p(x - 7, z - 9.5, 50), ouro, 1.8)
      linha(p(x + 8, z - 9.5, 50), p(x + 15, z - 9.5, 50), '#a0aec0', 1.5)
    }

    // Teclado retroiluminado
    caixa(x - 16, z + 5, 25, 9, 30, 1.6, '#23282e')
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) {
        plano(x - 14 + c * 3.3, z + 6.5 + r * 2.3, 2.2, 1.6, 31.8, ativa ? '#68d391' : '#718096')
      }
    }

    // Mouse ergonômico
    cilindro(x + 16, z + 9, 2.8, 30, 1.5, '#3b434c')

    // Caneca de café fumegante
    cilindro(x + 28, z - 6, 3.4, 30, 7.5, '#e2d3a3')
    elipse(p(x + 28, z - 6, 38), 2.6, 1.7, '#4a2c1d')

    // Mini vaso decorativo no canto
    cilindro(x - 33, z - 12, 3.2, 30, 5, '#38414b')
    elipse(p(x - 33, z - 12, 35), 4.2, 3, '#48bb78')

    // Cadeira executiva alinhada
    poltrona(x, z + 30, '#33383f')
  }

  // Personagem estilizado 3D (cartoon premium chibi com headset, moletom CT e animação viva)
  const personagem = (dado: QuadroGold['personagens'][number]) => {
    const { mesa: m, pose } = dado
    const pessoa = m.execucao
    const ilhaDaPessoa = layout.ilhas.find(i => i.squad === pessoa.squad)
    const sentado = pose.sentado > 0.5
    const andando = pose.andando && !reduzirMovimento
    const passo = andando ? Math.sin(tempo * 12 + pessoa.ordem) * 4 : 0
    const bob = andando ? Math.abs(Math.sin(tempo * 12 + pessoa.ordem)) * 1.8 : 0

    const x = pose.x, z = pose.y, base = sentado ? 8 : 0
    const q = p(x, z, base + bob), s = escala

    // Sombra de contato no chão
    ovalChao(x + 2, z + 2, 16, 10, 0.8, '#00000066')

    // Destaque de seleção pulsante em dourado no chão
    if (pessoa.chave === quadro.selecionadoId) {
      ovalChao(x, z, 24, 16, 0.9, '#f4ce4b33')
      ctx.save()
      ctx.strokeStyle = ouro
      ctx.lineWidth = 2.4 * s
      ctx.shadowColor = ouro
      ctx.shadowBlur = 10 * s
      const pts = Array.from({ length: 33 }, (_, i) =>
        p(x + Math.cos((i * Math.PI * 2) / 32) * 23, z + Math.sin((i * Math.PI * 2) / 32) * 15, 1)
      )
      ctx.beginPath()
      pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)))
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.translate(q.x, q.y)
    ctx.scale(s, s)

    const perna = sentado ? 8 : 16
    const torso = -perna - 23
    const hy = torso - 14

    const digitando = pose.fase === 'trabalhando' && !reduzirMovimento ? Math.sin(tempo * 16 + pessoa.ordem) * 1.5 : 0
    const costas = sentado && (pose.fase === 'trabalhando' || pose.fase === 'silencioso')

    // Pernas e tênis estilizados
    rr(-10, -perna - 1 + passo, 8, perna, 3, '#1c2227')
    rr(2, -perna - 1 - passo, 8, perna, 3, '#2a323a')
    rr(-12, -3 + passo, 12, 5.5, 2.5, '#d8d3c5')
    rr(2, -3 - passo, 12, 5.5, 2.5, '#f0ede4')

    // Moletom Tech Hoodie de Alta Tecnologia
    const moletom = ctx.createLinearGradient(-15, torso, 15, torso + 26)
    moletom.addColorStop(0, '#424a52')
    moletom.addColorStop(0.3, '#242a30')
    moletom.addColorStop(0.7, '#181d22')
    moletom.addColorStop(1, '#0e1216')
    rr(-14, torso, 28, 27, 9, '#1a1f24')
    ctx.fillStyle = moletom
    ctx.fill()

    // Braços com movimento de digitação dinâmico
    rr(-18, torso + 3 + digitando, 8, costas ? 15 : 20, 4, '#384149')
    rr(10, torso + 3 - digitando, 8, costas ? 15 : 20, 4, '#262c33')

    // Mãos com tom de pele
    rr(-17, torso + (costas ? 2 : 20) + digitando, 6.5, 6.5, 3.2, pessoa.pele)
    rr(11, torso + (costas ? 2 : 20) - digitando, 6.5, 6.5, 3.2, pessoa.pele)

    // Detalhe de cor do squad no punho / zíper
    rr(-12, torso + 2, 24, 2.5, 1.2, pessoa.cor)

    // Cabeça estilizada com gradiente volumétrico 3D suave
    const pele = ctx.createRadialGradient(-4, hy - 6, 1, 1, hy + 2, 18)
    pele.addColorStop(0, light(pessoa.pele, 0.40))
    pele.addColorStop(0.65, pessoa.pele)
    pele.addColorStop(1, dark(pessoa.pele, 0.35))
    ctx.fillStyle = pele
    ctx.beginPath()
    ctx.ellipse(0, hy, 15.5, 16.5, -0.04, 0, Math.PI * 2)
    ctx.fill()

    // Orelhas arredondadas
    rr(-17, hy - 1, 5, 8.5, 2.5, pessoa.pele)
    rr(12, hy - 1, 5, 8.5, 2.5, dark(pessoa.pele, 0.1))

    // Cabelo volumoso 3D
    const gradCabelo = ctx.createRadialGradient(-5, hy - 11, 0, 2, hy - 2, 21)
    gradCabelo.addColorStop(0, light(pessoa.cabelo, 0.35))
    gradCabelo.addColorStop(0.55, pessoa.cabelo)
    gradCabelo.addColorStop(1, dark(pessoa.cabelo, 0.55))
    ctx.fillStyle = gradCabelo
    ctx.beginPath()
    if (costas) {
      ctx.ellipse(0, hy - 2, 16, 15, -0.05, 0, Math.PI * 2)
    } else {
      ctx.ellipse(-0.5, hy - 7, 16, 11, -0.12, Math.PI * 0.82, Math.PI * 2.16)
    }
    ctx.fill()

    // Olhos e expressão fofa quando visto de frente
    if (!costas) {
      if (pose.fase === 'descanso') {
        // Olhinhos fechados em repouso tranquilo
        ctx.strokeStyle = '#2d3748'
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(-5, hy + 2, 3, 0.2, Math.PI - 0.2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(5, hy + 2, 3, 0.2, Math.PI - 0.2)
        ctx.stroke()
      } else {
        // Olhos atentos
        ctx.fillStyle = '#1a202c'
        ctx.beginPath()
        ctx.ellipse(-5, hy + 2, 1.4, 2.0, 0, 0, Math.PI * 2)
        ctx.ellipse(5, hy + 2, 1.4, 2.0, 0, 0, Math.PI * 2)
        ctx.fill()
        // Brilho nos olhos
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(-5.5, hy + 1.2, 0.7, 0, Math.PI * 2)
        ctx.arc(4.5, hy + 1.2, 0.7, 0, Math.PI * 2)
        ctx.fill()
        // Sorriso sutil
        ctx.strokeStyle = '#795548'
        ctx.lineWidth = 0.9
        ctx.beginPath()
        ctx.arc(0, hy + 6.5, 3.2, 0.2, Math.PI - 0.2)
        ctx.stroke()
      }
    }

    // HEADSET OVER-EAR COM LED DOURADO NEON BRILHANTE (Assinatura do briefing)
    ctx.save()
    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 3.2
    ctx.beginPath()
    ctx.arc(0, hy - 1, 16.5, Math.PI, 0)
    ctx.stroke()
    // Conchas do fone com LED de status
    rr(-19, hy - 4, 6.5, 12, 3, '#1a202c')
    rr(12.5, hy - 4, 6.5, 12, 3, '#2d3748')
    // Anel de LED brilhante no fone
    ctx.strokeStyle = ouro
    ctx.lineWidth = 1.2
    ctx.shadowColor = ouro
    ctx.shadowBlur = 6
    ctx.strokeRect(-18, hy - 2, 2, 8)
    ctx.strokeRect(16, hy - 2, 2, 8)
    ctx.restore()

    // Logotipo CT dourado nas costas/frente do uniforme
    if (costas) {
      ctx.fillStyle = ouro
      ctx.font = '700 7px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('CT', 0, torso + 22)
    } else {
      ctx.fillStyle = ouro
      ctx.font = '700 6.5px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('CT', 1, torso + 15)
    }

    // PARTÍCULAS "Z z" FLUTUANTES NO DESCANSO
    if (pose.fase === 'descanso' && !reduzirMovimento) {
      const zOffset = (tempo * 1.8 + pessoa.ordem * 0.7) % 3
      const alphaZ = Math.max(0, 1 - zOffset / 3)
      ctx.save()
      ctx.globalAlpha = alphaZ
      ctx.fillStyle = ouro
      ctx.font = '700 9px Inter, sans-serif'
      ctx.fillText('Z', 8 + Math.sin(zOffset * 2) * 3, hy - 14 - zOffset * 8)
      ctx.font = '600 7px Inter, sans-serif'
      ctx.fillText('z', 14 + Math.cos(zOffset * 2) * 2, hy - 22 - zOffset * 7)
      ctx.restore()
    }

    ctx.restore()

    const cabeca = p(x, z, base + bob + perna + 46)

    // Hitbox precisa para clique no boneco
    hits.push(
      hitProjetado(
        {
          chave: pessoa.chave,
          x: q.x - 24 * s,
          y: cabeca.y - 6 * s,
          largura: 48 * s,
          altura: q.y - cabeca.y + 16 * s,
        },
        ilhaDaPessoa
      )
    )

    // Placa de identificação legível do agente
    const etiqueta = () => {
      const qn = p(x, z + 12, base - 18 + (pose.fase === 'descanso' && pessoa.ordem % 2 ? 24 : 0))
      const selecionada = pessoa.chave === quadro.selecionadoId
      const corEstado = pessoa.ativa ? '#48bb78' : pessoa.execucao.estado === 'silencioso' ? ouro : '#a0aec0'
      const r = placa(pessoa.nome, qn, corEstado, Math.max(10.5, 8 / escala), selecionada)
      hits.push(hitProjetado({ chave: pessoa.chave, ...r }, ilhaDaPessoa))

      if (selecionada) {
        // Pinpointer dourado acima da cabeça
        const pin = { x: cabeca.x, y: cabeca.y - 6 * s }
        poly(
          [
            { x: pin.x - 5 * s, y: pin.y - 6 * s },
            { x: pin.x + 5 * s, y: pin.y - 6 * s },
            { x: pin.x, y: pin.y },
          ],
          ouro
        )
      }
    }
    etiquetas.push({ ilha: ilhaDaPessoa, desenhar: etiqueta })
  }

  ctx.save()
  try {
    // 1. FUNDO DO PALCO COM GRADIENTE AMBIENTAL E SPOTLIGHT DOURADO
    const fundo = ctx.createLinearGradient(0, 0, w, h)
    fundo.addColorStop(0, '#0a0d10')
    fundo.addColorStop(0.5, '#101317')
    fundo.addColorStop(1, '#14181c')
    ctx.fillStyle = fundo
    ctx.fillRect(0, 0, w, h)

    const spot = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.45, w * 0.65)
    spot.addColorStop(0, '#f4ce4b18')
    spot.addColorStop(0.4, '#f4ce4b08')
    spot.addColorStop(1, '#00000000')
    ctx.fillStyle = spot
    ctx.fillRect(0, 0, w, h)

    // 2. BASE DO EDIFÍCIO E PISO INTEIRO COM CONTORNO DOURADO
    const margemX = 12, margemY = 32
    caixa(margemX, margemY, w - margemX * 2, h - margemY - 14, -18, 18, tinta.piso, tinta.pisoBorda)

    // Borda frontal com filete de LED dourado contínuo
    linha(p(margemX, h - 14, -9), p(w - margemX, h - 14, -9), ouro, 2.2, true)

    // Linhas arquitetônicas do piso grafite (juntas de dilatação premium)
    for (let zz = 48; zz < h - 16; zz += 26) {
      linha(p(margemX + 2, zz, 0.1), p(w - margemX - 2, zz, 0.1), '#ffffff0a', 0.5)
    }
    for (let zz = 48, r = 0; zz < h - 16; zz += 26, r++) {
      for (let xx = margemX + 8 + (r % 2) * 50; xx < w - margemX - 6; xx += 100) {
        linha(p(xx, zz, 0.1), p(xx, Math.min(h - 15, zz + 26), 0.1), '#ffffff08', 0.5)
      }
    }

    // 3. PAREDE DOS FUNDOS (Painel acústico ripado + Janelas com vista metropolitana + Letreiro)
    caixa(margemX, margemY, w - margemX * 2, 7, 0, 92, tinta.parede, '#22272e')
    caixa(margemX, margemY, w - margemX * 2, 8, 89, 5, '#40382b')

    // Ripas verticais acústicas em madeira escura
    for (let xx = margemX + 16; xx < w - margemX - 16; xx += 14) {
      caixa(xx, margemY + 5, 2.6, 2.2, 10, 68, mix('#2a251e', '#453a29', dia))
    }

    // Janelas panorâmicas com skyline iluminado
    const janela = (xStart: number, larguraJanela: number) => {
      poly(
        [
          p(xStart, margemY + 7, 28),
          p(xStart + larguraJanela, margemY + 7, 28),
          p(xStart + larguraJanela, margemY + 7, 78),
          p(xStart, margemY + 7, 78),
        ],
        '#0c141c'
      )
      // Edifícios iluminados no horizonte exterior
      for (let xx = xStart + 4; xx < xStart + larguraJanela - 6; xx += 16) {
        const alt = 14 + (Math.floor(xx * 6) % 25)
        poly(
          [
            p(xx, margemY + 7.2, 28),
            p(xx + 12, margemY + 7.2, 28),
            p(xx + 12, margemY + 7.2, 28 + alt),
            p(xx, margemY + 7.2, 28 + alt),
          ],
          mix('#18222d', '#2c3e50', dia)
        )
        for (let yy = 32; yy < 28 + alt; yy += 7) {
          linha(p(xx + 2, margemY + 7.3, yy), p(xx + 6, margemY + 7.3, yy), ouroSuave, 1.4)
        }
      }
      // Molduras metálicas da janela
      linha(p(xStart, margemY + 7.5, 28), p(xStart + larguraJanela, margemY + 7.5, 28), '#f4ce4b88', 1.8)
    }

    const centroX = w / 2
    const painelW = Math.min(230, w * 0.44)
    if (w > 420) {
      janela(margemX + 16, Math.max(46, centroX - painelW / 2 - 40))
      janela(centroX + painelW / 2 + 18, Math.max(46, centroX - painelW / 2 - 40))
    }

    // Painel Central com Marca Iluminada CT / OPERAÇÕES
    caixa(centroX - painelW / 2, margemY + 6, painelW, 4, 18, 56, '#0f1317', '#3d3420')
    const letreiroPt = p(centroX, margemY + 10, 52)
    ctx.save()
    ctx.shadowColor = ouro
    ctx.shadowBlur = 12 * escala
    texto('CT / OPERAÇÕES', letreiroPt, 21, ouro, 800, 'center')
    ctx.shadowBlur = 0
    texto('C A S A L  D O  T R Á F E G O', { x: letreiroPt.x, y: letreiroPt.y + 18 * escala }, 7.5, '#dcd8cc', 650, 'center')
    ctx.restore()
    linha(p(centroX - painelW / 2 + 12, margemY + 10, 24), p(centroX + painelW / 2 - 12, margemY + 10, 24), ouro, 1.8, true)

    // 4. ESTAÇÕES CLICÁVEIS DE NAVEGAÇÃO INTEGRADAS À PAREDE (6 Módulos Oficiais)
    // Posicionadas na parede ao fundo, sem colidir com as etiquetas dos pods da frente
    const estacoes = [
      ['diretores', 'AGENTES / SQUADS'],
      ['estudio', 'CONTEÚDO'],
      ['pipeline', 'COMERCIAL'],
      ['financeiro', 'FINANCEIRO'],
      ['cofre', 'CONHECIMENTO'],
      ['ferramentas', 'OPERAÇÃO'],
    ] as const

    const colunasEstacao = w < 850 ? 3 : 6
    const larguraEstacao = (w - 60) / colunasEstacao

    estacoes.forEach(([modulo, nome], indice) => {
      const xEst = 30 + (indice % colunasEstacao) * larguraEstacao
      const zEst = margemY + 7
      const yElevacao = w < 850 && indice >= 3 ? 4 : 12
      const aEst = larguraEstacao - 10

      // Terminal elegante na parede com friso dourado
      caixa(xEst, zEst, aEst, 3, yElevacao, 13, '#1c2227', '#423924')
      poly(
        [
          p(xEst + 2, zEst + 3, yElevacao + 1),
          p(xEst + aEst - 2, zEst + 3, yElevacao + 1),
          p(xEst + aEst - 2, zEst + 3, yElevacao + 12),
          p(xEst + 2, zEst + 3, yElevacao + 12),
        ],
        '#0c1215'
      )
      linha(p(xEst + 2, zEst + 3, yElevacao + 12), p(xEst + aEst - 2, zEst + 3, yElevacao + 12), ouro, 1.6, true)

      const qEst = p(xEst + aEst / 2, zEst + 3, yElevacao + 6.5)
      texto(limitarTexto(nome, aEst - 14, 8.5), qEst, 8.5, '#f4ecd2', 700, 'center')

      const cantos = [
        p(xEst, zEst + 3, yElevacao),
        p(xEst + aEst, zEst + 3, yElevacao),
        p(xEst, zEst + 3, yElevacao + 14),
        p(xEst + aEst, zEst + 3, yElevacao + 14),
      ]
      const hx = Math.min(...cantos.map(c => c.x)), hy = Math.min(...cantos.map(c => c.y))
      hits.push({
        chave: `navegacao:${modulo}`,
        modulo,
        x: hx,
        y: hy,
        largura: Math.max(...cantos.map(c => c.x)) - hx,
        altura: Math.max(...cantos.map(c => c.y)) - hy,
      })
    })

    // 5. ILHAS DE SETORES / SQUADS COM DIVISÓRIAS DE VIDRO E CONTORNO DOURADO
    layout.ilhas.forEach(ilha => {
      const { x, y: z, largura: a, altura: b } = ilha

      comIlha(ilha, () => {
        // Sombra sob a ilha
        plano(x, z, a, b - 6, 0.2, '#00000044')

        // Base elevada do setor
        caixa(x + 2, z + 2, a - 4, b - 12, 0.4, 1.8, mix(ilha.cor, '#181b1f', 0.94), '#2d3339')

        // MOLDURA DE PISO DE LED DOURADA CONTORNANDO CADA ILHA (Assinatura do conceito)
        ctx.save()
        ctx.shadowColor = ouro
        ctx.shadowBlur = 6 * escala
        linha(p(x + 2, z + 2, 2.2), p(x + a - 2, z + 2, 2.2), ouro, 1.4)
        linha(p(x + a - 2, z + 2, 2.2), p(x + a - 2, z + b - 10, 2.2), ouro, 1.4)
        linha(p(x + a - 2, z + b - 10, 2.2), p(x + 2, z + b - 10, 2.2), ouro, 1.4)
        linha(p(x + 2, z + b - 10, 2.2), p(x + 2, z + 2, 2.2), ouro, 1.4)
        ctx.restore()

        // Carpete do pod com a cor de destaque do squad
        plano(x + 8, z + 28, a - 16, Math.max(20, b - 44), 2.3, mix(ilha.cor, '#1a1e23', 0.90))
        linha(p(x + 10, z + b - 16, 2.5), p(x + a - 10, z + b - 16, 2.5), mix(ilha.cor, ouro, 0.25), 1.8)
      })

      // Divisória arquitetônica de vidro com friso dourado e etiqueta flutuante do squad
      adicionar(
        x + a / 2,
        z + 6,
        () => {
          caixa(x + 2, z + 1, a - 4, 4.5, 2, 17, '#1f2429', '#3b3420')
          // Friso superior de vidro com borda em ouro
          poly([p(x + 5, z + 5, 19), p(x + a - 5, z + 5, 19), p(x + a - 5, z + 5, 38), p(x + 5, z + 5, 38)], '#70989025')
          linha(p(x + 4, z + 5, 38), p(x + a - 4, z + 5, 38), ouro, 1.6, true)

          // BADGE FLUTUANTE DO SETOR: "● Conteúdo (8)", "● Produto (7)", etc.
          const nomeSetor = `${ilha.nome.charAt(0).toUpperCase() + ilha.nome.slice(1)} (${ilha.mesas.length})`
          const qBadge = p(x + a / 2, z + 5, 47)
          ctx.font = `700 ${10.5 * escala}px Inter, sans-serif`
          const largBadge = ctx.measureText(nomeSetor).width + 32 * escala
          const altBadge = 22 * escala

          rr(
            qBadge.x - largBadge / 2,
            qBadge.y - altBadge / 2,
            largBadge,
            altBadge,
            6 * escala,
            '#13171b',
            mix(ilha.cor, ouro, 0.3),
            ilha.cor
          )
          // Ponto de cor do setor
          elipse({ x: qBadge.x - largBadge / 2 + 10 * escala, y: qBadge.y }, 3, 3, ilha.cor)
          texto(nomeSetor, { x: qBadge.x + 4 * escala, y: qBadge.y }, 10, '#f7f4ed', 700, 'center')
        },
        ilha
      )

      // Mesas de trabalho de cada posto
      ilha.postos.forEach((posto, i) =>
        adicionar(posto.x, posto.y + 25, () => mesa(posto.x, posto.y, ilha.mesas[i]?.execucao), ilha)
      )

      // Planta ornamental do squad se houver espaço
      if (a > 270) {
        adicionar(x + a - 26, z + 28, () => planta(x + a - 26, z + 28, 0.65, '#2e343b'), ilha)
      }

      // Sofá / Lounge compartilhado no coworking
      if (ilha.tipo === 'coworking') {
        const sx = x + a / 2, sz = z + b - 32
        adicionar(
          sx,
          sz,
          () => {
            caixa(sx - 48, sz - 7, 96, 26, 2, 10, '#363d44')
            caixa(sx - 47, sz + 17, 94, 5, 8, 20, '#242a30')
            for (let i = -1; i <= 1; i++) caixa(sx + i * 28 - 12, sz - 5, 24, 20, 11, 4.5, '#4a535c')
            // Almofadas decorativas em ouro e verde
            caixa(sx - 26, sz + 12, 13, 5, 14, 10, ouroSuave)
            caixa(sx + 18, sz + 12, 13, 5, 14, 10, '#48bb78')
          },
          ilha
        )
      }
    })

    // 6. ÁREA DE DESCANSO LUXUOSA COM LETREIRO NEON (BOAS IDEIAS TAMBÉM DESCANSAM)
    if (layout.descansoAberto) {
      const largDesc = Math.min(w - 60, 160 + layout.ocupantesDescanso * 48)
      const xDesc = w - largDesc - 24
      const yDesc = layout.descansoY

      // Piso de madeira parquet / chevron quente
      plano(xDesc, yDesc, largDesc, Math.max(18, h - yDesc - 14), 1.2, '#1a1814')
      ctx.save()
      ctx.shadowColor = ouro
      ctx.shadowBlur = 6 * escala
      linha(p(xDesc, yDesc, 1.5), p(xDesc + largDesc, yDesc, 1.5), ouro, 1.8)
      linha(p(xDesc, yDesc, 1.5), p(xDesc, h - 14, 1.5), ouro, 1.8)
      ctx.restore()

      // Painel ripado de madeira no fundo do descanso
      caixa(xDesc, yDesc - 1, largDesc, 4, 1.5, 42, '#2b241a', '#4a3b24')
      for (let rx = xDesc + 4; rx < xDesc + largDesc - 4; rx += 8) {
        linha(p(rx, yDesc + 3, 2), p(rx, yDesc + 3, 43), '#1b1610', 1.2)
      }

      // LETREIRO NEON DOURADO APROVADO: "BOAS IDEIAS TAMBÉM DESCANSAM"
      const qNeon = p(xDesc + largDesc / 2, yDesc + 2, 33)
      ctx.save()
      ctx.shadowColor = ouro
      ctx.shadowBlur = 10 * escala
      texto('BOAS IDEIAS', { x: qNeon.x, y: qNeon.y - 8 * escala }, 9, ouro, 800, 'center')
      texto('TAMBÉM DESCANSAM', { x: qNeon.x, y: qNeon.y + 6 * escala }, 8.5, ouro, 800, 'center')
      ctx.restore()

      // Mesinha de centro redonda com luminária quente
      const cxMesa = xDesc + largDesc / 2
      const czMesa = yDesc + 28
      adicionar(cxMesa, czMesa, () => {
        cilindro(cxMesa, czMesa, 9, 1.5, 8, '#2d261e')
        elipse(p(cxMesa, czMesa, 9.6), 9, 6, '#181512', ouroSuave)
        // Abajur de mesa acolhedor emitindo luz
        cilindro(cxMesa, czMesa, 2, 9.8, 6, ouro)
        elipse(p(cxMesa, czMesa, 16), 3.5, 2.5, '#ffffff')
      })

      // Poltronas confortáveis para os agentes em descanso
      layout.mesas
        .filter(m => m.execucao.squad !== 'sala mista' && m.execucao.execucao.estado === 'parado')
        .forEach(m =>
          adicionar(m.descanso.x, m.descanso.y - 2, () => poltrona(m.descanso.x, m.descanso.y, '#3a4440', true))
        )

      // Plantas tropicais enquadrando o lounge
      adicionar(xDesc + 16, yDesc + 14, () => planta(xDesc + 16, yDesc + 14, 0.9, '#30281e'))
      adicionar(xDesc + largDesc - 16, yDesc + 14, () => planta(xDesc + largDesc - 16, yDesc + 14, 0.95, '#30281e'))
    }

    // 7. SALA DE REUNIÕES CÚBICA DE VIDRO NO CANTO FRONTAL ESQUERDO ("Reuniões: IDEIAS · PLANEJAMENTO · RESULTADOS")
    if (w > 650) {
      const xReuniao = 24, zReuniao = h - 68, wReuniao = 135, hReuniao = 52
      adicionar(xReuniao + wReuniao / 2, zReuniao + hReuniao / 2, () => {
        // Piso interno da sala de reunião com contorno neon
        plano(xReuniao, zReuniao, wReuniao, hReuniao, 1.2, '#15191e')
        ctx.save()
        ctx.shadowColor = ouro
        ctx.shadowBlur = 8 * escala
        linha(p(xReuniao, zReuniao, 1.5), p(xReuniao + wReuniao, zReuniao, 1.5), ouro, 1.8)
        linha(p(xReuniao + wReuniao, zReuniao, 1.5), p(xReuniao + wReuniao, zReuniao + hReuniao, 1.5), ouro, 1.8)
        linha(p(xReuniao + wReuniao, zReuniao + hReuniao, 1.5), p(xReuniao, zReuniao + hReuniao, 1.5), ouro, 1.8)
        linha(p(xReuniao, zReuniao + hReuniao, 1.5), p(xReuniao, zReuniao, 1.5), ouro, 1.8)
        ctx.restore()

        // Paredes de vidro arquitetônico com esquadrias pretas
        poly(
          [
            p(xReuniao, zReuniao + hReuniao, 2),
            p(xReuniao + wReuniao, zReuniao + hReuniao, 2),
            p(xReuniao + wReuniao, zReuniao + hReuniao, 38),
            p(xReuniao, zReuniao + hReuniao, 38),
          ],
          '#1e293b22',
          '#33415566'
        )
        linha(p(xReuniao, zReuniao + hReuniao, 38), p(xReuniao + wReuniao, zReuniao + hReuniao, 38), ouro, 1.6, true)

        // Mesa de reunião executiva
        caixa(xReuniao + 28, zReuniao + 16, 78, 20, 2, 18, '#1e242b', '#475569')
        linha(p(xReuniao + 29, zReuniao + 36, 20), p(xReuniao + 105, zReuniao + 36, 20), ouro, 1.4)

        // Cadeiras de reunião ao redor da mesa
        for (let i = 0; i < 3; i++) {
          poltrona(xReuniao + 40 + i * 26, zReuniao + 44, '#242a30')
        }

        // Decalque na parede de vidro: "Reuniões / IDEIAS · PLANEJAMENTO · RESULTADOS"
        const qDecal = p(xReuniao + 22, zReuniao + hReuniao, 28)
        rr(qDecal.x - 2 * escala, qDecal.y - 12 * escala, 95 * escala, 22 * escala, 4 * escala, '#0d1318dd', '#3a444c')
        texto('Reuniões', { x: qDecal.x + 6 * escala, y: qDecal.y - 4 * escala }, 8.5, ouro, 700)
        texto('IDEIAS · PLANEJAMENTO · RESULTADOS', { x: qDecal.x + 6 * escala, y: qDecal.y + 5 * escala }, 5.5, '#cbd5e1', 600)
      })
    }

    // 8. MONÓLITO ARQUITETÔNICO NO CANTO FRONTAL DIREITO ("MAIS PRODUTIVIDADE · MAIS POSSIBILIDADES")
    if (w > 720) {
      const xTotem = w - 46, zTotem = h - 54
      adicionar(xTotem, zTotem, () => {
        caixa(xTotem - 14, zTotem - 8, 28, 16, 1, 38, '#181d22', ouroEscuro)
        linha(p(xTotem - 14, zTotem + 8, 39), p(xTotem + 14, zTotem + 8, 39), ouro, 1.8, true)
        const qTotem = p(xTotem, zTotem + 8, 25)
        ctx.fillStyle = ouro
        ctx.font = '700 8px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('CT', qTotem.x, qTotem.y - 8 * escala)
        ctx.font = '600 5px Inter, sans-serif'
        ctx.fillStyle = '#cbd5e1'
        ctx.fillText('PRODUTIVIDADE', qTotem.x, qTotem.y + 2 * escala)
        ctx.fillText('POSSIBILIDADES', qTotem.x, qTotem.y + 8 * escala)
      })
    }

    // Plantas decorativas adicionais nos cantos do palco
    adicionar(34, h - 38, () => planta(34, h - 38, 1.15, '#2e353d'))
    adicionar(w - 32, h - 38, () => planta(w - 32, h - 38, 1.1, '#2e353d'))

    // 9. PERSONAGENS (Ordenados por profundidade Z para oclusão correta)
    quadro.personagens.forEach(dado => {
      const ilha = layout.ilhas.find(i => i.squad === dado.mesa.execucao.squad)
      adicionar(dado.pose.x, dado.pose.y + 6, () => personagem(dado), ilha)
    })

    // Renderiza todos os elementos ordenados por Z de trás para frente
    fila.sort((a, b) => a.ordem - b.ordem).forEach(item => comIlha(item.ilha, item.desenhar))

    // 10. ETIQUETAS E NOMES DOS AGENTES (Sempre legíveis no topo)
    etiquetas.forEach(item => comIlha(item.ilha, item.desenhar))
  } finally {
    ctx.restore()
  }

  return hits
}
