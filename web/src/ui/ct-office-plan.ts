/**
 * CT Office V7 — planta exclusivamente visual, baseada no vídeo de referência.
 * A identidade, os estados e a existência dos agentes são responsabilidade
 * de PixelOffice.tsx. Nunca cria uma execução ou declara trabalho artificial.
 */
export interface CTPosicao { x: number; y: number }
export interface CTArea { x: number; z: number; largura: number; profundidade: number }
export interface CTSala extends CTArea { id: string; label: string; alturaVidro: number; abertura: number }
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
export interface CTOpcoes { larguraDisponivel?: number; alturaDisponivel?: number }
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

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
  const filasExtras = Math.max(0, Math.ceil(Math.max(0, equipe - 25) / 5))
  const fileirasEspera = Math.max(0, Math.ceil(Math.max(0, repouso - 19) / 7) - 1)
  const altura = 820 + Math.max(filasExtras * 88, fileirasEspera * 75)
  const eixoCentro = 396
  const inicioPostos = 455
  const colunasFisicas = 5
  const passoX = 102
  const postosChefia: CTPosicao[] = [0, 1, 2].map(i => ({ x: 465 + i * 143, y: 204 }))
  const quantidadeFisica = Math.max(15, Math.ceil(equipe / colunasFisicas) * colunasFisicas)
  const postosTrabalho: CTPosicao[] = Array.from({ length: quantidadeFisica }, (_, i) => ({
    x: inicioPostos + (i % colunasFisicas) * passoX,
    y: 307 + Math.floor(i / colunasFisicas) * 93,
  }))
  // Três espaços sociais. Ordem em pequenos grupos, nunca em formação militar.
  const descansoSlots: CTPosicao[] = []
  const grupos = [
    { x: 1060, y: 248, colunas: 4, limite: 8, passoX: 78, passoY: 66 },
    { x: 1045, y: 500, colunas: 5, limite: 11, passoX: 72, passoY: 66 },
    { x: 470, y: 702, colunas: 7, limite: 9999, passoX: 69, passoY: 69 },
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
  const colunas = totalPessoas > 0 ? Math.min(totalPessoas, Math.max(Math.min(chefia, 3), colunasFisicas)) : 1
  const lastWorkY = postosTrabalho.length ? postosTrabalho[postosTrabalho.length - 1].y : 307
  const arquitetura: CTArquitetura = {
    salas: [
      { id: 'reuniao', label: 'SALA DE REUNIÃO', x: 37, z: 130, largura: 285, profundidade: 150, alturaVidro: 115, abertura: 64 },
      { id: 'apoio', label: 'APOIO / ADMINISTRATIVO', x: 37, z: 298, largura: 285, profundidade: 145, alturaVidro: 106, abertura: 66 },
      { id: 'planejamento', label: 'PLANEJAMENTO', x: 37, z: 463, largura: 285, profundidade: 156, alturaVidro: 108, abertura: 66 },
    ],
    alaEsquerda: { x: 37, largura: 302 },
    corredor: { x: 339, z: 122, largura: 65, profundidade: altura - 162 },
    recepcao: { x: 50, z: altura - 102, largura: 205, profundidade: 65 },
    lounge: { x: 1010, z: 195, largura: 382, profundidade: Math.max(490, altura - 270) },
    coordenacao: { x: 419, z: 138, largura: 523, profundidade: 117 },
    // A área inclui coordenação + estações reais; os painéis de vidro ficam à esquerda.
    planoAberto: { x: 418, z: 135, largura: 545, profundidade: altura - 155 },
    postosLivres: [...postosChefia.slice(Math.min(3, chefia)), ...postosTrabalho.slice(equipe)],
    assentosDescanso: descansoSlots,
  }
  const disponivelW = Math.max(0, opt.larguraDisponivel || 0)
  const disponivelH = Math.max(0, opt.alturaDisponivel || 0)
  const zoomSugerido = disponivelW && disponivelH ? clamp(Math.min(disponivelW / largura, disponivelH / altura), .05, 2.4) : 1
  return {
    largura, altura, zoomSugerido, colunas,
    corredorX: eixoCentro,
    descansoY: Math.max(lastWorkY + 85, 690),
    arquitetura,
    chefias: postosChefia.slice(0, Math.min(3, chefia)),
    equipes: postosTrabalho.slice(0, equipe),
    descansos: descansoSlots,
  }
}
