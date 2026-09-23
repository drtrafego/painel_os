/** Catálogo visual do painel, derivado de equipe/membros.yaml e das definições vigentes.
 *
 * Este catálogo descreve papéis que existem. Presença e atividade vêm somente
 * de /api/agentes-vivos; um item sem sessão nunca é promovido a "executando".
 */
export type PixelAgentSquad = 'orquestração' | 'radar' | 'conteúdo' | 'destinos' | 'análise'

export type PixelAgent = {
  id: string
  nome: string
  papel: string
  squad: PixelAgentSquad
  área: string
  abreviação: string
  cor: string
  aliases?: string[]
}

export const PIXEL_AGENT_SQUADS: Array<{ id: PixelAgentSquad; nome: string; cor: string }> = [
  { id: 'orquestração', nome: 'ORQUESTRAÇÃO', cor: '#c084fc' },
  { id: 'radar', nome: 'RADAR', cor: '#38bdf8' },
  { id: 'conteúdo', nome: 'CONTEÚDO', cor: '#a3e635' },
  { id: 'destinos', nome: 'DESTINOS', cor: '#fb923c' },
  { id: 'análise', nome: 'ANÁLISE', cor: '#facc15' },
]

export const PIXEL_AGENTS: PixelAgent[] = [
  { id: 'iris', nome: 'Íris', papel: 'Orquestradora', squad: 'orquestração', área: 'Operação', abreviação: 'ÍR', cor: '#c084fc', aliases: ['orquestradora'] },
  { id: 'nova-mineradora', nome: 'Nova Mineradora', papel: 'Descoberta multicanal', squad: 'radar', área: 'Mineração', abreviação: 'NM', cor: '#38bdf8', aliases: ['nova_mineradora', 'nova', 'mineradora'] },
  { id: 'vega', nome: 'Vega', papel: 'Síntese editorial de radar', squad: 'radar', área: 'Radar', abreviação: 'VE', cor: '#60a5fa' },
  { id: 'suri', nome: 'Suri', papel: 'Estrategista', squad: 'conteúdo', área: 'Estratégia', abreviação: 'SU', cor: '#a3e635', aliases: ['estrategia'] },
  { id: 'theo', nome: 'Theo', papel: 'Conceito e roteiro', squad: 'conteúdo', área: 'Roteiro', abreviação: 'TH', cor: '#bef264', aliases: ['conceito_roteiro'] },
  { id: 'cleo', nome: 'Cleo', papel: 'Copywriter', squad: 'conteúdo', área: 'Copy', abreviação: 'CL', cor: '#84cc16', aliases: ['copy'] },
  { id: 'dani', nome: 'Dani', papel: 'Designer', squad: 'conteúdo', área: 'Design', abreviação: 'DA', cor: '#22c55e', aliases: ['design'] },
  { id: 'corretor', nome: 'Corretor', papel: 'Correção', squad: 'conteúdo', área: 'Revisão', abreviação: 'CO', cor: '#16a34a', aliases: ['correcao'] },
  { id: 'guardiao', nome: 'Guardião', papel: 'QA e validação', squad: 'conteúdo', área: 'Qualidade', abreviação: 'GU', cor: '#15803d', aliases: ['qa'] },
  { id: 'publicador', nome: 'Publicador', papel: 'Publicação orgânica', squad: 'destinos', área: 'Distribuição', abreviação: 'PU', cor: '#fb923c', aliases: ['organico'] },
  { id: 'gestor', nome: 'Gestor', papel: 'Anúncios', squad: 'destinos', área: 'Mídia paga', abreviação: 'GE', cor: '#f97316', aliases: ['anuncio'] },
  { id: 'analista-conteudo', nome: 'Analista de Conteúdo', papel: 'Análise orgânica', squad: 'análise', área: 'Métricas', abreviação: 'AC', cor: '#facc15', aliases: ['analista_conteudo'] },
  { id: 'analista', nome: 'Analista', papel: 'Análise de anúncios', squad: 'análise', área: 'Mídia paga', abreviação: 'AN', cor: '#eab308', aliases: ['analise'] },
]

export function normalizarId(valor: string) {
  return valor.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s]+/g, '-')
}

export function encontrarPixelAgent(id: string) {
  const alvo = normalizarId(id)
  return PIXEL_AGENTS.find((agente) => normalizarId(agente.id) === alvo || agente.aliases?.some((alias) => normalizarId(alias) === alvo))
}
