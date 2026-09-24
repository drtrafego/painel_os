/**
 * Paleta oficial da AutonomIA Projetos.
 *
 * Fonte canônica: marca/MANUAL-DA-MARCA-autonomia.txt, seção 4, e
 * marca/IDENTIDADE-VISUAL-autonomia.txt, versão 2. O Creme é o fundo mestre;
 * a antiga paleta verde/escura está marcada como histórico e não entra aqui.
 *
 * Latão Aceso não é usado como texto sobre Creme, pois o contraste oficial
 * medido é 1,80:1. Ele fica em superfícies. Bronze, Sépia, Azul e Tabaco
 * carregam texto, foco, gráfico e estado com contraste preservado.
 */
export const ACENTO = {
  bronze: '#7A4A0F',
  latao: '#F5A623',
  azul: '#3E6E8E',
  tabaco: '#7A6A57',
  renato: '#C2410C',
} as const

/** Identidade visual dos grupos, separada do estado transitório. */
export const IDENTIDADE = {
  lima: ACENTO.bronze,
  ciano: ACENTO.azul,
  ambar: ACENTO.bronze,
  verde: ACENTO.azul,
  agua: ACENTO.azul,
  pervinca: ACENTO.tabaco,
  renato: ACENTO.renato,
} as const

export type CorIdentidade = keyof typeof IDENTIDADE

/** Estado usa cores acessíveis da própria marca, não o Latão como letra. */
export const ESTADO = {
  trabalhando: ACENTO.azul,
  esperando: ACENTO.bronze,
  fila: ACENTO.tabaco,
  parado: '#332822',
} as const

export const SUPERFICIE = {
  topo: '#F7F1E6',
  lateral: '#F7F1E6',
  pagina: '#F7F1E6',
  cartao: '#FDFAF3',
  cartaoKpi: '#FDFAF3',
  cartaoHeroi: '#FDFAF3',
  hairline: '#E3D8C4',
  tinta: '#1A1410',
  tinta2: '#7A6A57',
  tinta3: '#7A4A0F',
} as const

export const COR_DO_SQUAD: Record<string, string> = {
  global: IDENTIDADE.ciano,
  conteudo: IDENTIDADE.ambar,
  'pipeline-luana': IDENTIDADE.pervinca,
}

export const COR_DA_SESSAO: Record<string, string> = {
  luana: IDENTIDADE.lima,
  renato: IDENTIDADE.renato,
  bia: IDENTIDADE.pervinca,
}

export function corDoSquad(squad: string): string {
  return COR_DO_SQUAD[squad] ?? SUPERFICIE.tinta2
}

export function corDaSessao(id: string): string {
  return COR_DA_SESSAO[id] ?? IDENTIDADE.lima
}

/**
 * Cor por POSIÇÃO, não por nome cadastrado. Usado onde a lista de chaves é
 * medida do disco e pode ganhar um item novo a qualquer coleta (modelo de IA
 * novo, por exemplo): um mapa fixo por nome deixaria o item novo cinza pra
 * sempre até alguém lembrar de cadastrar. Cicla pela mesma paleta da marca.
 */
const CICLO_IDENTIDADE = [IDENTIDADE.lima, IDENTIDADE.ciano, IDENTIDADE.pervinca, IDENTIDADE.ambar]

export function corPorIndice(indice: number): string {
  return CICLO_IDENTIDADE[indice % CICLO_IDENTIDADE.length]
}
