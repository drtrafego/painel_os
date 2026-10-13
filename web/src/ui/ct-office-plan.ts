/**
 * CT Office V7 — planta exclusivamente visual, baseada no vídeo de referência.
 * A identidade, os estados e a existência dos agentes são responsabilidade
 * de PixelOffice.tsx. Nunca cria uma execução ou declara trabalho artificial.
 */
export interface CTPosicao { x: number; y: number }
export interface CTArea { x: number; z: number; largura: number; profundidade: number }
export interface CTSala extends CTArea {
  id: string
  label: string
  alturaVidro: number
  abertura: number
  tipo: 'squad' | 'reuniao' | 'apoio'
  squad?: string
  cor?: string
  ativa?: boolean
  ocupantes?: number
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
  largura: number; altura: number; zoomSugerido: number; colunas: number
  corredorX: number; descansoY: number; arquitetura: CTArquitetura
  chefias: CTPosicao[]; equipes: CTPosicao[]; descansos: CTPosicao[]
}
export interface CTOpcoes { larguraDisponivel?: number; alturaDisponivel?: number; zoomMinimo?: number }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

const SALAS_SQUAD: ReadonlyArray<CTSala> = [
  { id: 'squad-coordenacao', label: 'COORDENAÇÃO', squad: 'coordenação', cor: '#84cc16', tipo: 'squad', x: 330, z: 70, largura: 195, profundidade: 150, alturaVidro: 104, abertura: 52 },
  { id: 'squad-bots', label: 'BOTS', squad: 'bots', cor: '#c2410c', tipo: 'squad', x: 542, z: 70, largura: 195, profundidade: 150, alturaVidro: 104, abertura: 52 },
  { id: 'squad-trafego', label: 'TRÁFEGO', squad: 'tráfego', cor: '#8b5cf6', tipo: 'squad', x: 754, z: 70, largura: 195, profundidade: 150, alturaVidro: 104, abertura: 52 },
  { id: 'squad-conteudo', label: 'CONTEÚDO', squad: 'conteúdo', cor: '#d97706', tipo: 'squad', x: 966, z: 70, largura: 195, profundidade: 150, alturaVidro: 104, abertura: 52 },
  { id: 'squad-comercial', label: 'COMERCIAL', squad: 'comercial', cor: '#16a34a', tipo: 'squad', x: 1178, z: 70, largura: 195, profundidade: 150, alturaVidro: 104, abertura: 52 },
  { id: 'squad-radar', label: 'RADAR', squad: 'radar', cor: '#38bdf8', tipo: 'squad', x: 410, z: 240, largura: 215, profundidade: 150, alturaVidro: 100, abertura: 56 },
  { id: 'squad-destinos', label: 'DESTINOS', squad: 'destinos', cor: '#fb923c', tipo: 'squad', x: 650, z: 240, largura: 215, profundidade: 150, alturaVidro: 100, abertura: 56 },
  { id: 'squad-analise', label: 'ANÁLISE', squad: 'análise', cor: '#facc15', tipo: 'squad', x: 890, z: 240, largura: 215, profundidade: 150, alturaVidro: 100, abertura: 56 },
  { id: 'squad-coworking', label: 'SALA MISTA', squad: 'sala mista', cor: '#67e8f9', tipo: 'squad', x: 1130, z: 240, largura: 215, profundidade: 150, alturaVidro: 100, abertura: 56 },
]

export function posicoesNaSala(sala: CTSala, quantidade: number): CTPosicao[] {
  const total = Math.max(0, Math.floor(quantidade))
  if (!total) return []
  const proporcao = sala.largura / sala.profundidade
  const colunas = Math.max(1, Math.ceil(Math.sqrt(total * proporcao)))
  const linhas = Math.ceil(total / colunas)
  const margemX = Math.min(34, sala.largura * .18)
  const topo = sala.z + Math.min(58, sala.profundidade * .42)
  const larguraUtil = Math.max(1, sala.largura - margemX * 2)
  const profundidadeUtil = Math.max(1, sala.profundidade - (topo - sala.z) - 18)
  return Array.from({ length: total }, (_, indice) => {
    const linha = Math.floor(indice / colunas)
    const itensNaLinha = Math.min(colunas, total - linha * colunas)
    const coluna = indice % colunas
    const passoX = larguraUtil / Math.max(1, itensNaLinha)
    const passoZ = profundidadeUtil / Math.max(1, linhas)
    return {
      x: sala.x + margemX + passoX * (coluna + .5),
      y: topo + passoZ * (linha + .5),
    }
  })
}

export function salaDoSquad(salas: ReadonlyArray<CTSala>, squad: string) {
  return salas.find((sala) => sala.tipo === 'squad' && sala.squad === squad)
}

/**
 * Não desenha as 25 pessoas em um 5x5. Cada setor de descanso tem distribuição
 * própria (sofás do fundo, salas sociais e jardim de espera). São todos os
 * MESMOS agentes, apenas os destinos visuais mudam. A lista/seleção permanece
 * fornecida pela operação existente.
 */
export function planejarCTOffice(chefes: number, membros: number, emDescanso: number, opt: CTOpcoes = {}): CTPlantaVisual {
  const chefia = Math.max(0, Math.floor(chefes))
  const equipe = Math.max(0, Math.floor(membros))
  const repouso = Math.max(0, Math.floor(emDescanso))
  const largura = 1430
  const fileirasEspera = Math.max(0, Math.ceil(Math.max(0, repouso - 18) / 7))
  const altura = 880 + fileirasEspera * 68
  const eixoCentro = 396
  const salasSquad = SALAS_SQUAD.map((sala) => ({ ...sala, ativa: false }))
  const salaCoordenacao = salasSquad[0]
  const postosChefia = posicoesNaSala(salaCoordenacao, Math.max(3, chefia))
  const postosTrabalho = salasSquad.slice(1).flatMap((sala) => posicoesNaSala(sala, 8))
  // A área social distribui quem descansa em pequenos grupos.
  const descansoSlots: CTPosicao[] = []
  const grupos = [
    { x: 1025, y: 528, colunas: 5, limite: 10, passoX: 72, passoY: 61 },
    { x: 1015, y: 655, colunas: 5, limite: 8, passoX: 74, passoY: 61 },
    { x: 470, y: 770, colunas: 7, limite: 9999, passoX: 69, passoY: 65 },
  ]
  let restantes = repouso
  for (const grupo of grupos) {
    const nestaArea = Math.min(restantes, grupo.limite)
    for (let i = 0; i < nestaArea; i++) {
      const linha = Math.floor(i / grupo.colunas)
      const porLinha = Math.min(grupo.colunas, nestaArea - linha * grupo.colunas)
      const recuo = (grupo.colunas - porLinha) * grupo.passoX * .48
      // Pequenos deslocamentos determinísticos para evitar uma grade rígida.
      const dx = ((i * 11 + linha * 7) % 5 - 2) * 2.2
      descansoSlots.push({ x: grupo.x + recuo + (i % grupo.colunas) * grupo.passoX + dx, y: grupo.y + linha * grupo.passoY + ((i % 3) - 1) * 3 })
    }
    restantes -= nestaArea
  }
  const totalPessoas = chefia + equipe
  const colunas = totalPessoas > 0 ? Math.min(totalPessoas, 5) : 1
  const arquitetura: CTArquitetura = {
    salas: [
      ...salasSquad,
      { id: 'reuniao', label: 'SALA DE REUNIÃO', tipo: 'reuniao', x: 430, z: 445, largura: 455, profundidade: 190, alturaVidro: 112, abertura: 72 },
      { id: 'apoio', label: 'APOIO / ADMINISTRATIVO', tipo: 'apoio', x: 60, z: 385, largura: 285, profundidade: 180, alturaVidro: 106, abertura: 66 },
    ],
    alaEsquerda: { x: 45, largura: 315 },
    corredor: { x: 360, z: 55, largura: 48, profundidade: altura - 105 },
    recepcao: { x: 65, z: altura - 150, largura: 225, profundidade: 72 },
    lounge: { x: 980, z: 455, largura: 400, profundidade: Math.max(300, altura - 530) },
    coordenacao: { x: salaCoordenacao.x, z: salaCoordenacao.z, largura: salaCoordenacao.largura, profundidade: salaCoordenacao.profundidade },
    planoAberto: { x: 315, z: 55, largura: 1070, profundidade: 350 },
    postosLivres: [],
    assentosDescanso: descansoSlots,
  }
  const disponivelW = Math.max(0, opt.larguraDisponivel || 0)
  const disponivelH = Math.max(0, opt.alturaDisponivel || 0)
  const zoomContido = disponivelW && disponivelH ? Math.min(disponivelW / largura, disponivelH / altura) : 1
  // No celular, conter a planta inteira pela largura a transformava numa faixa
  // ilegível. O palco já tem rolagem horizontal e centraliza a cena, então o
  // enquadramento inicial usa a altura disponível e preserva a legenda abaixo.
  const zoomPreenchendoPalcoMovel = disponivelW > 0 && disponivelW <= 480 && disponivelH > 0
    ? disponivelH / altura
    : zoomContido
  const zoomSugerido = clamp(Math.max(zoomContido, zoomPreenchendoPalcoMovel, opt.zoomMinimo || 0), .05, 2.4)
  return {
    largura, altura, zoomSugerido, colunas,
    corredorX: eixoCentro,
    descansoY: altura - 130,
    arquitetura,
    chefias: postosChefia.slice(0, chefia),
    equipes: postosTrabalho.slice(0, equipe),
    descansos: descansoSlots,
  }
}
