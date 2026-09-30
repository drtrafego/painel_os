/**
 * PixelOffice CT Gold — cenário 2.5D em Canvas 2D. Não é imagem de fundo.
 * Somente apresentação: não filtra agentes, não lê a API, não cria timers,
 * não altera layouts/poses e não persiste estado. Coordenadas de clique são
 * projetadas de volta para o mesmo espaço lógico usado pelo componente.
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
export interface HitGold { chave: string; x: number; y: number; largura: number; altura: number }
type Ponto = { x: number; y: number }
type Objeto = { ordem: number; desenhar: () => void; ilha?: IlhaGold }
const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))
function mix(a: string, b: string, t: number): string {
  const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const aa = rgb(/^#[\da-f]{6}$/i.test(a) ? a : '#716ca8'), bb = rgb(b)
  return `#${aa.map((v, i) => Math.round(v + (bb[i] - v) * clamp(t)).toString(16).padStart(2, '0')).join('')}`
}
const dark = (c: string, n = .3) => mix(c, '#0d0e11', n)
const light = (c: string, n = .3) => mix(c, '#ffffff', n)

/** Mantém todos os membros e todos os estados recebidos, inclusive o descanso. */
export function desenharEscritorioGold(ctx: CanvasRenderingContext2D, quadro: QuadroGold): HitGold[] {
  const { layout, tempo, reduzirMovimento } = quadro
  const w = layout.largura, h = layout.altura, dia = clamp(quadro.progressoDia)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return []
  const fila: Objeto[] = [], hits: HitGold[] = [], etiquetas: Array<{ ilha?: IlhaGold; desenhar: () => void }> = []
  // Projeção oblíqua: o mapa operacional continua exatamente no mesmo lugar.
  // Só sua imagem muda. A câmera nunca escreve no layout recebido.
  const raw = (x: number, z: number, altura = 0): Ponto => ({ x: x - z * .10, y: x * .035 + z * .78 - altura })
  const limites = [raw(0, 0, 104), raw(w, 0, 104), raw(0, h), raw(w, h), raw(0, 0), raw(w, 0)]
  const minX = Math.min(...limites.map(p => p.x)), maxX = Math.max(...limites.map(p => p.x))
  const minY = Math.min(...limites.map(p => p.y)), maxY = Math.max(...limites.map(p => p.y))
  const escala = Math.min((w - 32) / (maxX - minX), (h - 34) / (maxY - minY))
  const dx = (w - (maxX - minX) * escala) / 2 - minX * escala
  const dy = (h - (maxY - minY) * escala) / 2 - minY * escala
  const p = (x: number, z: number, altura = 0): Ponto => { const q = raw(x, z, altura); return { x: dx + q.x * escala, y: dy + q.y * escala } }
  const tinta = {
    piso: mix('#24272b', '#333438', dia), parede: mix('#111416', '#202325', dia),
    madeira: mix('#4b4130', '#6b5d44', dia), metal: '#34383b', verde: '#69916a',
    linha: mix('#555142', '#767064', dia), vidro: mix('#151b22', '#303a42', dia),
  }
  const poly = (pontos: Ponto[], cor: string, borda?: string) => {
    ctx.beginPath(); pontos.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath()
    ctx.fillStyle = cor; ctx.fill()
    if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = Math.max(.4, escala * .7); ctx.stroke() }
  }
  const linha = (a: Ponto, b: Ponto, cor: string, largura = 1) => {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = cor; ctx.lineWidth = largura * escala; ctx.stroke()
  }
  const plano = (x: number, z: number, a: number, b: number, y: number, cor: string, borda?: string) =>
    poly([p(x, z, y), p(x + a, z, y), p(x + a, z + b, y), p(x, z + b, y)], cor, borda)
  const caixa = (x: number, z: number, a: number, b: number, y: number, alto: number, cor: string) => {
    const t = y + alto
    poly([p(x, z + b, y), p(x + a, z + b, y), p(x + a, z + b, t), p(x, z + b, t)], dark(cor, .20))
    poly([p(x + a, z, y), p(x + a, z + b, y), p(x + a, z + b, t), p(x + a, z, t)], dark(cor, .35))
    plano(x, z, a, b, t, light(cor, .10))
    linha(p(x, z + b, t), p(x + a, z + b, t), light(cor, .28), .65)
  }
  const elipse = (q: Ponto, rx: number, ry: number, cor: string) => {
    ctx.fillStyle = cor; ctx.beginPath(); ctx.ellipse(q.x, q.y, Math.max(.01, rx * escala), Math.max(.01, ry * escala), 0, 0, Math.PI * 2); ctx.fill()
  }
  const ovalChao = (x: number, z: number, raioX: number, raioZ: number, y: number, cor: string) => {
    const pts = Array.from({ length: 32 }, (_, i) => p(x + Math.cos(i * Math.PI / 16) * raioX, z + Math.sin(i * Math.PI / 16) * raioZ, y))
    poly(pts, cor)
  }
  const cilindro = (x: number, z: number, r: number, y: number, alto: number, cor: string) => {
    const q = p(x, z, y), qt = p(x, z, y + alto), rx = r * escala
    const g = ctx.createLinearGradient(q.x - rx, 0, q.x + rx, 0); g.addColorStop(0, light(cor, .22)); g.addColorStop(.5, cor); g.addColorStop(1, dark(cor, .28))
    ctx.fillStyle = g; ctx.fillRect(q.x - rx, qt.y, rx * 2, q.y - qt.y)
    elipse(q, r, r * .74, cor); elipse(qt, r, r * .74, light(cor, .25))
  }
  const rr = (x: number, y: number, a: number, b: number, r: number, cor: string, borda?: string) => {
    const raio = Math.min(r, a / 2, b / 2)
    ctx.beginPath(); ctx.moveTo(x + raio, y); ctx.arcTo(x + a, y, x + a, y + b, raio); ctx.arcTo(x + a, y + b, x, y + b, raio); ctx.arcTo(x, y + b, x, y, raio); ctx.arcTo(x, y, x + a, y, raio); ctx.closePath()
    ctx.fillStyle = cor; ctx.fill(); if (borda) { ctx.strokeStyle = borda; ctx.lineWidth = .7; ctx.stroke() }
  }
  const texto = (s: string, q: Ponto, tamanho: number, cor: string, peso = 600, alinhamento: CanvasTextAlign = 'left') => {
    ctx.font = `${peso} ${tamanho * escala}px system-ui, -apple-system, sans-serif`; ctx.textAlign = alinhamento; ctx.textBaseline = 'middle'; ctx.fillStyle = cor; ctx.fillText(s, q.x, q.y)
  }
  const limitarTexto = (s: string, max: number, fonte: number): string => {
    ctx.font = `650 ${fonte * escala}px system-ui, sans-serif`
    if (ctx.measureText(s).width <= max * escala) return s
    const chars = Array.from(s); let inicio = 0, fim = chars.length
    while (inicio < fim) {
      const meio = Math.ceil((inicio + fim) / 2)
      if (ctx.measureText(chars.slice(0, meio).join('') + '…').width <= max * escala) inicio = meio
      else fim = meio - 1
    }
    return chars.slice(0, inicio).join('') + '…'
  }
  const placa = (s: string, q: Ponto, cor: string, fonte = 9, selecionada = false) => {
    const rotulo = limitarTexto(s, 132, fonte)
    ctx.font = `650 ${fonte * escala}px system-ui, sans-serif`
    const largura = ctx.measureText(rotulo).width + 22 * escala, altura = Math.max(20, fonte + 7) * escala
    rr(q.x - largura / 2, q.y - altura / 2, largura, altura, 5 * escala,
      selecionada ? '#353018' : '#17191c', selecionada ? '#f4ce4b' : '#5b5134')
    elipse({ x: q.x - largura / 2 + 7 * escala, y: q.y }, 2, 2, cor)
    texto(rotulo, { x: q.x + 3 * escala, y: q.y }, fonte, '#eeeada', 650, 'center')
    return { x: q.x - largura / 2, y: q.y - altura / 2, largura, altura }
  }
  const adicionar = (x: number, z: number, desenhar: () => void, ilha?: IlhaGold) => fila.push({ ordem: z + x * .22, desenhar, ilha })
  const comIlha = (ilha: IlhaGold | undefined, desenhar: () => void) => {
    const fase = ilha ? clamp(quadro.progressos?.get(ilha.squad) ?? 1) : 1
    ctx.save()
    if (ilha && fase < .999) {
      const base = p(ilha.x + ilha.largura / 2, ilha.y + ilha.altura)
      ctx.globalAlpha *= .12 + fase * .88; ctx.translate(base.x, base.y); ctx.scale(.72 + fase * .28, .18 + fase * .82); ctx.translate(-base.x, -base.y)
    }
    try { desenhar() } finally { ctx.restore() }
  }
  const hitProjetado = (hit: HitGold, ilha?: IlhaGold): HitGold => {
    if (!ilha) return hit
    const t = clamp(quadro.progressos?.get(ilha.squad) ?? 1)
    if (t >= .999) return hit
    const b = p(ilha.x + ilha.largura / 2, ilha.y + ilha.altura), sx = .72 + t * .28, sy = .18 + t * .82
    return { chave: hit.chave, x: b.x + (hit.x - b.x) * sx, y: b.y + (hit.y - b.y) * sy, largura: hit.largura * sx, altura: hit.altura * sy }
  }
  const planta = (x: number, z: number, tam = 1, vaso = '#46494a') => {
    ovalChao(x + 5, z + 4, 15 * tam, 10 * tam, .8, '#00000050')
    cilindro(x, z, 8 * tam, 1, 14 * tam, vaso)
    const haste = p(x, z, 26 * tam); linha(p(x, z, 14 * tam), p(x, z, 43 * tam), '#4c7260', 1.5 * tam)
    for (let i = 0; i < 7; i++) {
      const ang = i * 2.4, centro = p(x + Math.cos(ang) * 10 * tam, z + Math.sin(ang) * 5 * tam, (25 + i * 2.2) * tam)
      const tip = { x: centro.x + Math.cos(ang) * 6 * escala * tam, y: centro.y - 8 * escala * tam }
      ctx.beginPath(); ctx.moveTo(haste.x, haste.y); ctx.quadraticCurveTo(centro.x - 11 * escala * tam, centro.y - 10 * escala * tam, tip.x, tip.y); ctx.quadraticCurveTo(centro.x + 10 * escala * tam, centro.y + 5 * escala * tam, haste.x, haste.y)
      ctx.fillStyle = ['#367e64', '#619f72', '#82b184', '#4b8a6d'][i % 4]; ctx.fill()
      linha(haste, tip, '#b4d19d88', .5 * tam)
    }
  }
  const poltrona = (x: number, z: number, cor: string, lounge = false) => {
    ovalChao(x + 2, z + 3, 17, 11, .8, '#00000066')
    if (!lounge) {
      cilindro(x, z, 2.3, 0, 10, '#626d80')
      for (const [a, b] of [[-10, 6], [10, 6], [-7, -6], [7, -6]]) { linha(p(x, z, 3), p(x + a, z + b, 2), '#3f495c', 2.4); cilindro(x + a, z + b, 2, 0, 2, '#343c55') }
    }
    caixa(x - 13, z - 9, 26, 21, lounge ? 3 : 10, 5, cor)
    caixa(x - 14, z + 8, 28, 4, lounge ? 6 : 14, 21, cor)
    caixa(x - 17, z - 8, 4, 21, lounge ? 5 : 12, 12, dark(cor, .12))
    caixa(x + 13, z - 8, 4, 21, lounge ? 5 : 12, 12, dark(cor, .12))
    if (lounge) caixa(x - 8, z + 2, 14, 5, 11, 9, '#c5b98d')
  }
  const mesa = (x: number, z: number, pessoa?: PessoaGold) => {
    ovalChao(x + 4, z + 13, 46, 24, .6, '#00000050')
    for (const [xx, zz] of [[-32, -17], [30, -17], [-32, 15], [30, 15]]) caixa(x + xx, z + zz, 3.8, 4, 0, 25, '#36393c')
    caixa(x - 38, z - 21, 76, 42, 24, 4, tinta.madeira)
    linha(p(x - 38, z + 21, 26), p(x + 38, z + 21, 26), '#f4ce4b', 1.7)
    if (!pessoa) texto('POSTO LIVRE', p(x, z - 9, 48), 6.5, '#a6a696', 600, 'center')
    // Tampo com cantos aparentes e deskmat — não é o tampo da V1 recolorido.
    plano(x - 25, z - 17, 44, 30, 28.3, '#161b20')
    caixa(x - 10, z - 11, 20, 10, 29, 2, '#4a5054'); caixa(x - 1.5, z - 10, 3, 3, 30, 9, '#626661')
    caixa(x - 20, z - 13, 39, 3, 37, 24, '#22272c')
    const tela = pessoa?.ativa ? '#172521' : pessoa?.execucao.estado === 'silencioso' ? '#24261e' : '#13171b'
    // Superfície do monitor no plano vertical, com altura e orientação reais.
    poly([p(x - 18, z - 9.7, 39), p(x + 17, z - 9.7, 39), p(x + 17, z - 9.7, 59), p(x - 18, z - 9.7, 59)], tela)
    if (pessoa?.ativa) {
      const cor = light(pessoa.cor, .4)
      for (let i = 0; i < 4; i++) {
        const inicio = x - 14 + (i % 2) * 3, fim = inicio + (i === 0 ? 21 : 13 - i)
        linha(p(inicio, z - 9.4, 55 - i * 4), p(fim, z - 9.4, 55 - i * 4), i === 0 ? cor : '#c8bc77', 1.5)
      }
      const pulso = reduzirMovimento ? 1 : .68 + Math.sin(tempo * 2.2 + pessoa.ordem) * .18
      ctx.save(); ctx.globalAlpha *= pulso; plano(x - 19, z - 8, 39, 24, 28.5, '#eed26716'); ctx.restore()
    } else if (pessoa?.execucao.estado === 'silencioso') linha(p(x - 12, z - 9.3, 52), p(x - 7, z - 9.3, 52), '#e6c980', 2)
    caixa(x - 17, z + 5, 27, 9, 29, 1.4, '#30353a')
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) plano(x - 15 + c * 2.8, z + 6 + r * 2.4, 1.8, 1.5, 30.5, '#77786b')
    cilindro(x + 20, z + 10, 3.3, 29, 1.4, '#555650')
    cilindro(x + 30, z - 4, 3.4, 29, 7, '#e7d6a1'); elipse(p(x + 30, z - 4, 36), 2.5, 1.6, '#704d3d')
    if (pessoa?.objeto === 'arte') { plano(x - 33, z - 12, 8, 15, 28.5, '#f1eee9'); for (let i = 0; i < 3; i++) plano(x - 32, z - 11 + i * 4, 6, 3, 28.6, ['#dfae81', '#a695d4', '#84b69f'][i]) }
    else { caixa(x - 33, z - 12, 8, 13, 29, 1.5, pessoa ? light(pessoa.cor, .45) : '#a8b2bd') }
    poltrona(x, z + 30, '#3e4244')
  }
  const personagem = (dado: QuadroGold['personagens'][number]) => {
    const { mesa: m, pose } = dado, pessoa = m.execucao
    const ilhaDaPessoa = layout.ilhas.find(i => i.squad === pessoa.squad)
    const sentado = pose.sentado > .5, andando = pose.andando && !reduzirMovimento
    const passo = andando ? Math.sin(tempo * 12 + pessoa.ordem) * 4 : 0
    const bob = andando ? Math.abs(Math.sin(tempo * 12 + pessoa.ordem)) * 1.5 : 0
    const x = pose.x, z = pose.y, base = sentado ? 8 : 0
    const q = p(x, z, base + bob), s = escala
    ovalChao(x + 3, z + 3, 15, 9, .8, '#00000060')
    if (pessoa.chave === quadro.selecionadoId) {
      ovalChao(x, z, 21, 15, .7, '#f4ce4b33')
      ctx.save(); ctx.strokeStyle = '#f4ce4b'; ctx.lineWidth = 2 * s; const pts = Array.from({ length: 33 }, (_, i) => p(x + Math.cos(i * Math.PI / 16) * 21, z + Math.sin(i * Math.PI / 16) * 15, .9)); ctx.beginPath(); pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.stroke(); ctx.restore()
    }
    // Miniatura arredondada vista de trás na estação; frente durante deslocamentos.
    // Cabeça, uniforme, braços e cadeira são desenhados individualmente a cada quadro.
    ctx.save(); ctx.translate(q.x, q.y); ctx.scale(s, s)
    const arred = (xx: number, yy: number, a: number, b: number, r: number, c: string) => rr(xx, yy, a, b, r, c)
    const perna = sentado ? 8 : 15
    const torso = -perna - 21, hy = torso - 12
    const digitando = pose.fase === 'trabalhando' && !reduzirMovimento ? Math.sin(tempo * 15 + pessoa.ordem) * 1.2 : 0
    const costas = sentado && (pose.fase === 'trabalhando' || pose.fase === 'silencioso')
    arred(-10, -perna - 1 + passo, 8, perna, 3, '#242c30'); arred(2, -perna - 1 - passo, 8, perna, 3, '#394145')
    arred(-12, -3 + passo, 12, 5, 2.5, '#b9b8a8'); arred(2, -3 - passo, 12, 5, 2.5, '#d4d0be')
    const tecido = ctx.createLinearGradient(-15, 0, 15, 0)
    tecido.addColorStop(0, '#727777'); tecido.addColorStop(.25, '#454d4f'); tecido.addColorStop(.65, '#303739'); tecido.addColorStop(1, '#141b1f')
    rr(-13, torso, 26, 25, 9, '#333a3c'); ctx.fillStyle = tecido; ctx.fill()
    arred(-17, torso + 4 + digitando, 8, costas ? 14 : 19, 4, '#545c5c')
    arred(10, torso + 4 - digitando, 8, costas ? 14 : 19, 4, '#343d40')
    arred(-16, torso + (costas ? 1 : 19) + digitando, 6, 6, 3, pessoa.pele)
    arred(12, torso + (costas ? 1 : 19) - digitando, 6, 6, 3, pessoa.pele)
    arred(-11, torso + 2, 22, 2, 1, pessoa.cor)
    const pele = ctx.createRadialGradient(-5, hy - 6, 1, 1, hy + 1, 17)
    pele.addColorStop(0, light(pessoa.pele, .35)); pele.addColorStop(.7, pessoa.pele); pele.addColorStop(1, dark(pessoa.pele, .3))
    ctx.fillStyle = pele; ctx.beginPath(); ctx.ellipse(0, hy, 14.5, 15.5, -.04, 0, Math.PI * 2); ctx.fill()
    arred(-16, hy - 1, 5, 8, 2.5, pessoa.pele); arred(12, hy - 1, 5, 8, 2.5, dark(pessoa.pele, .08))
    const cabelo = ctx.createRadialGradient(-6, hy - 10, 0, 2, hy - 3, 20)
    cabelo.addColorStop(0, light(pessoa.cabelo, .3)); cabelo.addColorStop(.55, pessoa.cabelo); cabelo.addColorStop(1, dark(pessoa.cabelo, .55))
    ctx.fillStyle = cabelo; ctx.beginPath()
    if (costas) ctx.ellipse(0, hy - 2, 15, 14, -.07, 0, Math.PI * 2)
    else ctx.ellipse(-.5, hy - 7, 15, 10, -.14, Math.PI * .85, Math.PI * 2.13)
    ctx.fill()
    if (pessoa.acessorio === 2) {
      rr(5, hy - 6, 10, costas ? 25 : 21, 5, pessoa.cabelo); ctx.fillStyle = cabelo; ctx.fill()
      arred(-14, hy - 5, 4, 16, 2, pessoa.cabelo)
    }
    if (!costas) {
      arred(-14, hy - 8, 4, 12, 2, pessoa.cabelo)
      ctx.fillStyle = '#253148'; ctx.beginPath(); ctx.ellipse(-5, hy + 2, 1.2, 1.8, 0, 0, Math.PI * 2); ctx.ellipse(5, hy + 2, 1.2, 1.8, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#805745'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(1, hy + 6, 3, .2, Math.PI - .2); ctx.stroke()
      if (pessoa.acessorio === 1) { ctx.strokeStyle = '#414448'; ctx.lineWidth = 1.3; ctx.strokeRect(-10, hy - 1, 8, 5); ctx.strokeRect(2, hy - 1, 8, 5); ctx.beginPath(); ctx.moveTo(-2, hy + 1); ctx.lineTo(2, hy + 1); ctx.stroke() }
    }
    if (pessoa.acessorio === 0 || pessoa.acessorio === 4) {
      ctx.strokeStyle = '#8c8664'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, hy - 1, 15.5, Math.PI, 0); ctx.stroke()
      arred(-18, hy - 3, 6, 11, 3, '#202729'); arred(12, hy - 3, 6, 11, 3, '#303739')
      arred(-17, hy - 1, 1.5, 6, .75, '#d8bc62'); arred(16, hy - 1, 1.5, 6, .75, '#d8bc62')
    }
    if (pessoa.acessorio === 3) { arred(-14, hy - 17, 28, 7, 3.5, dark(pessoa.destaque, .32)); arred(4, hy - 12, 13, 3, 1.5, pessoa.destaque) }
    if (costas) {
      const encosto = ctx.createLinearGradient(-13, torso + 3, 15, torso + 27)
      encosto.addColorStop(0,'#4a5150'); encosto.addColorStop(.3,'#292f30'); encosto.addColorStop(1,'#10181c')
      rr(-13, torso + 10, 26, 24, 7, '#2b3333'); ctx.fillStyle=encosto; ctx.fill()
      ctx.strokeStyle='#c5ac5c';ctx.lineWidth=.55;ctx.stroke()
      ctx.fillStyle='#ead06f';ctx.font='650 7px system-ui';ctx.textAlign='center';ctx.fillText('CT',0,torso+25)
    } else { ctx.fillStyle='#f4ce4b';ctx.font='700 6px system-ui';ctx.textAlign='center';ctx.fillText('CT',1,torso+15) }
    ctx.restore()
    const cabeca = p(x, z, base + bob + perna + 44)
    // Os retângulos são devolvidos no espaço lógico do canvas, NÃO do mundo.
    hits.push(hitProjetado({ chave: pessoa.chave, x: q.x - 22 * s, y: cabeca.y - 5 * s, largura: 44 * s, altura: q.y - cabeca.y + 14 * s }, ilhaDaPessoa))
    const etiqueta = () => {
      const qn = p(x, z + 12, base - 17 + (pose.fase === 'descanso' && pessoa.ordem % 2 ? 23 : 0))
      const selecionada = pessoa.chave === quadro.selecionadoId
      const corEstado = pessoa.ativa ? '#7ada92' : pessoa.execucao.estado === 'silencioso' ? '#f4ce4b' : '#90949b'
      const r = placa(pessoa.nome, qn, corEstado, Math.max(10.5, 7.5 / escala), selecionada)
      hits.push(hitProjetado({ chave: pessoa.chave, ...r }, ilhaDaPessoa))
      if (selecionada) {
        const pin = { x: cabeca.x, y: cabeca.y - 5 * s }
        poly([{ x: pin.x - 4 * s, y: pin.y - 5 * s }, { x: pin.x + 4 * s, y: pin.y - 5 * s }, { x: pin.x, y: pin.y }], '#f4ce4b')
        // Sem balão de fala: ferramenta e tarefa pertencem ao inspetor HTML.
      }
    }
    etiquetas.push({ ilha: ilhaDaPessoa, desenhar: etiqueta })
  }
  ctx.save()
  try {
    // Fundo do palco: não se parece com o chão de um tabuleiro.
    const fundo = ctx.createLinearGradient(0, 0, w, h); fundo.addColorStop(0, '#0e1013'); fundo.addColorStop(1, '#15171b')
    ctx.fillStyle = fundo; ctx.fillRect(0, 0, w, h)
    const luz = ctx.createRadialGradient(w * .5, h * .5, 10, w * .5, h * .5, w * .6); luz.addColorStop(0, '#f5d77415'); luz.addColorStop(1, '#00000000'); ctx.fillStyle = luz; ctx.fillRect(0, 0, w, h)
    // Base em corte e piso inteiro: são uma única arquitetura, não cards.
    const sombra = [p(8, 36), p(w - 4, 36), p(w - 4, h), p(8, h)].map(q => ({ x: q.x + 9 * escala, y: q.y + 13 * escala }))
    poly(sombra, '#00000099')
    caixa(8, 28, w - 16, h - 40, -17, 17, tinta.piso)
    linha(p(8, h - 12, -9), p(w - 8, h - 12, -9), '#f4ce4b', 2)
    for (let zz = 45; zz < h - 15; zz += 24) linha(p(9, zz, .1), p(w - 9, zz, .1), tinta.linha + '35', .45)
    for (let zz = 45, r = 0; zz < h - 15; zz += 24, r++) for (let xx = 12 + (r % 2) * 52; xx < w - 10; xx += 104) linha(p(xx, zz, .1), p(xx, Math.min(h - 13, zz + 24), .1), tinta.linha + '35', .45)
    // Parede dos fundos: madeira ripada, janelas e letreiro em relevo.
    caixa(8, 28, w - 16, 6, 0, 89, tinta.parede)
    caixa(8, 28, w - 16, 7, 86, 5, '#585446')
    const centro = w / 2, painelW = Math.min(216, w * .42)
    for (let xx = 22; xx < w - 24; xx += 15) caixa(xx, 33.5, 3, 2, 12, 62, mix('#37332c', '#5a503e', dia))
    // Janelas verticais grandes nas duas extremidades, fora do letreiro.
    const janela = (x: number, largura: number) => {
      poly([p(x, 36, 14), p(x + largura, 36, 14), p(x + largura, 36, 76), p(x, 36, 76)], tinta.vidro)
      for (let xx = x + 4; xx < x + largura - 7; xx += 18) {
        const alto = 12 + (Math.floor(xx * 7) % 23)
        poly([p(xx, 36.2, 14), p(xx + 13, 36.2, 14), p(xx + 13, 36.2, 14 + alto), p(xx, 36.2, 14 + alto)], mix('#222d38', '#526574', dia))
        for (let yy = 19; yy < 14 + alto; yy += 8) linha(p(xx + 3, 36.3, yy), p(xx + 7, 36.3, yy), mix('#dfc375', '#acbabb', dia), 2)
      }
      for (let xx = x; xx <= x + largura; xx += Math.max(18, largura / 3)) caixa(xx, 35.5, 2, 2, 14, 62, '#4b4b43')
      linha(p(x, 36.5, 14), p(x + largura, 36.5, 14), '#f4e6c7', 2)
    }
    if (w > 410) { janela(24, Math.max(48, centro - painelW / 2 - 44)); janela(centro + painelW / 2 + 20, Math.max(48, centro - painelW / 2 - 44)) }
    caixa(centro - painelW / 2, 35, painelW, 4, 21, 52, '#111518')
    const letreiro = p(centro, 40, 53)
    ctx.save(); ctx.translate(letreiro.x, letreiro.y); ctx.rotate(Math.atan(.035));
    texto('CT / OPERAÇÕES', { x: 0, y: 0 }, 22, '#f4ce4b', 800, 'center')
    texto('C A S A L  D O  T R Á F E G O', { x: 0, y: 18 * escala }, 7.5, '#c6c2b4', 650, 'center'); ctx.restore()
    linha(p(centro - painelW / 2 + 10, 40, 24), p(centro + painelW / 2 - 10, 40, 24), '#f4ce4b', 1.6)
    // As ilhas são recebidas já filtradas. Não materializar nenhuma outra.
    layout.ilhas.forEach((ilha, idx) => {
      const { x, y: z, largura: a, altura: b } = ilha
      comIlha(ilha, () => {
        plano(x, z, a, b - 6, .3, '#00000033')
        caixa(x + 2, z + 2, a - 4, b - 12, .5, 1.5, mix(ilha.cor, '#202426', .94))
        plano(x + 10, z + 32, a - 20, Math.max(20, b - 48), 2.1, mix(ilha.cor, '#24282b', .89))
        // Tapete maior contínuo + detalhe longitudinal na cor do squad.
        linha(p(x + 10, z + b - 17, 2.3), p(x + a - 10, z + b - 17, 2.3), mix(ilha.cor, '#dfcf8a', .15), 2)
        for (let zz = z + 42; zz < z + b - 22; zz += 6) linha(p(x + 13, zz, 2.3), p(x + a - 13, zz, 2.3), '#ffffff08', .45)
      })
      adicionar(x + a / 2, z + 7, () => {
        caixa(x + 2, z + 1, a - 4, 5, 2, 18, '#313739')
        caixa(x + 2, z + 1, a - 4, 6, 19, 2, '#615843')
        // Vidro baixo com pilares; o campo de visão dos agentes fica livre.
        for (const xx of [x + 5, x + a - 8]) caixa(xx, z + 5, 2, 2, 19, 20, '#615e50')
        poly([p(x + 7, z + 6, 20), p(x + a - 7, z + 6, 20), p(x + a - 7, z + 6, 39), p(x + 7, z + 6, 39)], '#a0aca525')
        linha(p(x + 5, z + 6, 39), p(x + a - 5, z + 6, 39), '#f4cf6588', 1.5)
        const q = p(x + 24, z + 5, 28)
        const nome = `${String(idx + 1).padStart(2, '0')}  ${ilha.nome.toLocaleUpperCase('pt-BR')}`
        ctx.font = `750 ${10 * escala}px system-ui, sans-serif`; const ww = Math.min((a - 40) * escala, ctx.measureText(nome).width + 23 * escala)
        rr(q.x, q.y - 10 * escala, ww, 20 * escala, 4 * escala, '#191d20')
        rr(q.x, q.y - 10 * escala, 3 * escala, 20 * escala, 1, ilha.cor)
        texto(limitarTexto(nome, ww / escala - 15, 10), { x: q.x + 9 * escala, y: q.y }, 10, '#f7f4ed', 750)
      }, ilha)
      ilha.postos.forEach((posto, i) => adicionar(posto.x, posto.y + 25, () => mesa(posto.x, posto.y, ilha.mesas[i]?.execucao), ilha))
      if (a > 280) adicionar(x + a - 25, z + 28, () => planta(x + a - 25, z + 28, .58, '#4b4d46'), ilha)
      if (ilha.tipo === 'coworking') {
        const sx = x + a / 2, sz = z + b - 32
        adicionar(sx, sz, () => {
          caixa(sx - 49, sz - 7, 98, 27, 2, 10, '#515755'); caixa(sx - 48, sz + 17, 96, 5, 8, 21, '#343b3c')
          caixa(sx - 53, sz - 8, 6, 32, 3, 21, '#343b3c'); caixa(sx + 47, sz - 8, 6, 32, 3, 21, '#343b3c')
          for (let i = -1; i <= 1; i++) caixa(sx + i * 29 - 13, sz - 5, 26, 21, 11, 4, '#6a7068')
          caixa(sx - 28, sz + 12, 14, 5, 15, 10, '#c7ae6f'); caixa(sx + 18, sz + 12, 14, 5, 15, 10, '#718978')
        }, ilha)
      }
    })
    // Lounge ocupa apenas o espaço previsto na planta operacional original.
    if (layout.descansoAberto) {
      const largura = Math.min(w - 60, 140 + layout.ocupantesDescanso * 44), xx = (w - largura) / 2
      plano(xx, layout.descansoY, largura, Math.max(16, h - layout.descansoY - 12), 1, '#c0ab5b12')
      layout.mesas.filter(m => m.execucao.squad !== 'sala mista' && m.execucao.execucao.estado === 'parado').forEach(m =>
        adicionar(m.descanso.x, m.descanso.y - 2, () => poltrona(m.descanso.x, m.descanso.y, '#647063', true)))
      const q = p(xx + 16, layout.descansoY, 12)
      texto('DESCANSO', q, 10, '#d7ca8e', 800)
    }
    adicionar(32, h - 43, () => planta(32, h - 43, 1.1, '#4b4d42'))
    adicionar(w - 30, h - 43, () => planta(w - 30, h - 43, 1.0, '#4c5049'))
    quadro.personagens.forEach(dado => {
      const ilha = layout.ilhas.find(i => i.squad === dado.mesa.execucao.squad)
      adicionar(dado.pose.x, dado.pose.y + 6, () => personagem(dado), ilha)
    })
    fila.sort((a, b) => a.ordem - b.ordem).forEach(item => comIlha(item.ilha, item.desenhar))
    // Nome e estado ficam legíveis, sem depender de ler um monitor minúsculo.
    etiquetas.forEach(item => comIlha(item.ilha, item.desenhar))
  } finally { ctx.restore() }
  return hits
}
