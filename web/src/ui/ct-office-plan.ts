/**
 * CT Office Visual V6 — apenas geometria de apresentação.
 * Sem polling, agentes artificiais, API ou mudança em estados.
 * A operação continua sob controle de PixelOffice.tsx.
 */
export interface CTPosicao { x: number; y: number }
export interface CTArea { x: number; z: number; largura: number; profundidade: number }
export interface CTSala extends CTArea {
  id: string
  label: string
  alturaVidro: number
  abertura: number
}
export interface CTArquitetura {
  salas: CTSala[]
  alaEsquerda: { x: number; largura: number }
  corredor: CTArea
  recepcao: CTArea
  lounge: CTArea
  coordenacao: CTArea
  planoAberto: CTArea
  postosLivres: CTPosicao[]
  assentosDescanso: CTPosicao[]
}
export interface CTPlantaVisual {
  largura: number
  altura: number
  zoomSugerido: number
  colunas: number
  corredorX: number
  descansoY: number
  arquitetura: CTArquitetura
  chefias: CTPosicao[]
  equipes: CTPosicao[]
  descansos: CTPosicao[]
}
export interface CTOpcoes {
  larguraDisponivel?: number
  alturaDisponivel?: number
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value))

/**
 * Layout estável nos filtros: mesas físicas continuam mesmo quando não existe
 * ocupante. Chefia tem até 3 postos na direção; o restante entra no salão.
 */
export function planejarCTOffice(qtdChefia: number, qtdEquipe: number, qtdDescanso: number, opcoes: CTOpcoes = {}): CTPlantaVisual {
  const chefia = Math.max(0, Math.floor(qtdChefia))
  const equipe = Math.max(0, Math.floor(qtdEquipe))
  const repouso = Math.max(0, Math.floor(qtdDescanso))
  const disponivelW = Math.max(0, opcoes.larguraDisponivel || 0)
  const disponivelH = Math.max(0, opcoes.alturaDisponivel || 0)
  // Limitamos a planta para a miniatura não virar um corredor panorâmico.
  const largura = disponivelW >= 1420 ? 1480 : disponivelW >= 1020 ? 1320 : 1120
  const margem = 27
  const alaLargura = largura >= 1300 ? 270 : 230
  const corredorLargura = 51
  const planoX = margem + alaLargura + corredorLargura
  const larguraLounge = largura >= 1300 ? 348 : 288
  const xLounge = largura - larguraLounge - margem - 9
  const larguraTrabalho = xLounge - planoX - 30

  const colunasFisicas = clamp(Math.floor((larguraTrabalho - 24) / 88), 4, 7)
  const passoX = (larguraTrabalho - 65) / Math.max(1, colunasFisicas - 1)
  const inicioX = planoX + 33
  const colunas = chefia + equipe === 0 ? 1 : Math.min(chefia + equipe, Math.max(chefia, colunasFisicas))
  const postosChefia: CTPosicao[] = [0, 1, 2].map(i => ({
    x: planoX + larguraTrabalho * (.24 + i * .25), y: 183,
  }))
  // Apenas a quantidade necessária é materializada; vagas decorativas
  // restantes não podem virar personagens nem contar como execuções.
  const qtdPostosTrabalho = Math.max(24, Math.ceil(equipe / colunasFisicas) * colunasFisicas)
  const postosTrabalho: CTPosicao[] = Array.from({ length: qtdPostosTrabalho }, (_, i) => ({
    x: inicioX + (i % colunasFisicas) * passoX,
    y: 280 + Math.floor(i / colunasFisicas) * 75,
  }))
  const colunasRepouso = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(repouso * 1.13))))
  const linhasRepouso = Math.max(1, Math.ceil(repouso / colunasRepouso))
  const profundidadeLounge = Math.max(310, 72 + linhasRepouso * 54)
  const lounge: CTArea = { x: xLounge, z: 258, largura: larguraLounge, profundidade: profundidadeLounge }
  const inicioDescansoX = lounge.x + 40
  const passoDescansoX = colunasRepouso <= 1 ? 0 : (lounge.largura - 80) / (colunasRepouso - 1)
  const descansoSlots: CTPosicao[] = Array.from({ length: repouso }, (_, i) => ({
    x: inicioDescansoX + (i % colunasRepouso) * passoDescansoX,
    y: lounge.z + 77 + Math.floor(i / colunasRepouso) * 54,
  }))
  const ultimaMesaY = 280 + Math.floor(Math.max(0, qtdPostosTrabalho - 1) / colunasFisicas) * 75
  const altura = Math.max(730, Math.ceil(ultimaMesaY + 135), Math.ceil(lounge.z + profundidadeLounge + 78))
  const larguraSala = alaLargura - 16
  const salas: CTSala[] = [
    { id: 'reuniao', label: 'SALA DE REUNIÃO', x: margem, z: 111, largura: larguraSala, profundidade: 134, alturaVidro: 94, abertura: 54 },
    { id: 'apoio', label: 'APOIO / ADMINISTRATIVO', x: margem, z: 261, largura: larguraSala, profundidade: 134, alturaVidro: 92, abertura: 54 },
    { id: 'planejamento', label: 'PLANEJAMENTO', x: margem, z: 411, largura: larguraSala, profundidade: 134, alturaVidro: 92, abertura: 54 },
  ]
  const arquitetura: CTArquitetura = {
    salas,
    alaEsquerda: { x: margem, largura: alaLargura },
    corredor: { x: margem + alaLargura, z: 107, largura: corredorLargura, profundidade: altura - 158 },
    recepcao: { x: margem + 23, z: altura - 89, largura: 163, profundidade: 47 },
    lounge,
    coordenacao: { x: planoX + 6, z: 111, largura: larguraTrabalho - 12, profundidade: 98 },
    planoAberto: { x: planoX, z: 160, largura: larguraTrabalho, profundidade: altura - 198 },
    postosLivres: [
      ...postosChefia.slice(Math.min(3, chefia)),
      ...postosTrabalho.slice(equipe),
    ],
    assentosDescanso: descansoSlots,
  }
  const zoomSugerido = disponivelW > 0 && disponivelH > 0
    ? clamp(Math.min(disponivelW / largura, disponivelH / altura), .05, 2.4)
    : 1
  return {
    largura, altura, zoomSugerido, colunas,
    // Hub da caminhada fica à esquerda do salão, no corredor físico.
    corredorX: planoX - 30,
    descansoY: Math.max(ultimaMesaY + 48, lounge.z + 20),
    arquitetura,
    chefias: postosChefia.slice(0, Math.min(3, chefia)),
    equipes: postosTrabalho.slice(0, equipe),
    descansos: descansoSlots,
  }
}
