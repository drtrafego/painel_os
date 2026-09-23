/** Catálogo visual do painel, derivado de equipe/membros.yaml e das definições vigentes.
 *
 * Este catálogo descreve papéis que existem. Presença e atividade vêm somente
 * de /api/agentes-vivos; um item sem sessão nunca é promovido a "executando".
 */
export type PixelAgentSquad = 'coordenação' | 'radar' | 'conteúdo' | 'destinos' | 'análise' | 'globais' | 'pipeline Codex'

export type PixelAgent = {
  id: string
  nome: string
  papel: string
  squad: PixelAgentSquad
  área: string
  abreviação: string
  cor: string
  aliases?: string[]
  descricao?: string
}

export function boundsDoCatalogo(quantidade: number) {
  const colunas = Math.min(6, Math.max(1, quantidade))
  const linhas = Math.max(1, Math.ceil(Math.max(1, quantidade) / 6))
  const esquerda = 22
  const direita = 80 + (colunas - 1) * 155 + 58
  const topo = 90
  const baixo = 112 + (linhas - 1) * 100 + 42
  return { largura: direita - esquerda, altura: baixo - topo, centroX: (esquerda + direita) / 2, centroY: (topo + baixo) / 2 }
}

export function zoomParaEnquadrar(largura: number, altura: number, quantidade: number) {
  const bounds = boundsDoCatalogo(quantidade)
  return Number(Math.min(2.2, (largura * 0.94) / bounds.largura, (altura * 0.82) / bounds.altura).toFixed(2))
}

export const PIXEL_AGENT_SQUADS: Array<{ id: PixelAgentSquad; nome: string; cor: string }> = [
  { id: 'coordenação', nome: 'COORDENAÇÃO', cor: '#c084fc' },
  { id: 'radar', nome: 'RADAR', cor: '#38bdf8' },
  { id: 'conteúdo', nome: 'SQUAD CONTEÚDO', cor: '#a3e635' },
  { id: 'destinos', nome: 'DESTINOS', cor: '#fb923c' },
  { id: 'análise', nome: 'DESTINOS / ANÁLISE', cor: '#facc15' },
  { id: 'globais', nome: 'GLOBAIS', cor: '#60a5fa' },
  { id: 'pipeline Codex', nome: 'PIPELINE CODEX', cor: '#f472b6' },
]

export const PIXEL_AGENTS: PixelAgent[] = [
  { id: 'iris', nome: 'Íris', papel: 'Orquestradora', squad: 'coordenação', área: 'Operação', abreviação: 'ÍR', cor: '#c084fc', aliases: ['orquestradora'] },
  { id: 'nova-mineradora', nome: 'Nova Mineradora', papel: 'Descoberta multicanal', squad: 'radar', área: 'Mineração', abreviação: 'NM', cor: '#38bdf8', aliases: ['nova_mineradora', 'nova', 'mineradora'] },
  { id: 'vega', nome: 'Vega', papel: 'Síntese editorial de radar', squad: 'radar', área: 'Radar', abreviação: 'VE', cor: '#60a5fa' },
  { id: 'suri', nome: 'Suri', papel: 'Estrategista', squad: 'conteúdo', área: 'Estratégia', abreviação: 'SU', cor: '#a3e635', aliases: ['estrategia', 'suri-estrategista'] },
  { id: 'theo', nome: 'Theo', papel: 'Conceito e roteiro', squad: 'conteúdo', área: 'Roteiro', abreviação: 'TH', cor: '#bef264', aliases: ['conceito_roteiro', 'theo-criador'] },
  { id: 'cleo', nome: 'Cleo', papel: 'Copywriter', squad: 'conteúdo', área: 'Copy', abreviação: 'CL', cor: '#84cc16', aliases: ['copy', 'cleo-produtor'] },
  { id: 'dani', nome: 'Dani', papel: 'Designer', squad: 'conteúdo', área: 'Design', abreviação: 'DA', cor: '#22c55e', aliases: ['design', 'dani-designer'] },
  { id: 'corretor', nome: 'Corretor', papel: 'Correção', squad: 'conteúdo', área: 'Revisão', abreviação: 'CO', cor: '#16a34a', aliases: ['correcao'] },
  { id: 'guardiao', nome: 'Guardião', papel: 'QA e validação', squad: 'conteúdo', área: 'Qualidade', abreviação: 'GU', cor: '#15803d', aliases: ['qa', 'guardiao'] },
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

export function mesclarRuntimesNoCatalogo(catalogo: PixelAgent[], runtimes: Array<{ id: string; tipo?: string | null; identidade?: string | null; papel?: string | null; tarefa?: string | null; descricao?: string | null; etapa?: string | null; etapa_e_description?: boolean | null }>) {
  const resultado = catalogo.map((agente) => ({ ...agente, aliases: agente.aliases ? [...agente.aliases] : undefined }))
  runtimes.forEach((runtime, index) => {
    const identidade = runtime.identidade && runtime.identidade !== 'sessao-codex' ? runtime.identidade : null
    const existente = resultado.find((agente) => (identidade ? normalizarId(agente.id) === normalizarId(identidade) || agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(identidade)) : false) || normalizarId(agente.id) === normalizarId(runtime.id) || agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(runtime.id)))
    if (existente) return
    const sufixo = runtime.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || String(index + 1)
    if (runtime.tipo && runtime.tipo !== 'codex') {
      resultado.push({ id: runtime.id, nome: `${runtime.tipo} · ${sufixo}`, papel: 'Subagente Claude', squad: 'globais', área: 'Sessão viva', abreviação: runtime.tipo.slice(0, 2).toUpperCase(), cor: '#60a5fa', descricao: runtime.descricao || runtime.etapa || 'Subagente sem descrição', aliases: [] })
      return
    }
    resultado.push({ id: runtime.id, nome: `Sessão Codex · ${sufixo}`, papel: runtime.papel || 'Sessão Codex', squad: 'pipeline Codex', área: 'Sessão viva', abreviação: 'CX', cor: '#f472b6', descricao: runtime.tarefa || runtime.etapa || 'Sessão sem identidade operacional catalogada', aliases: [] })
  })
  return resultado
}

const normalizarSquad = (squad: string): PixelAgentSquad => {
  if (squad === 'global') return 'globais'
  if (squad === 'pipeline-luana') return 'pipeline Codex'
  if (squad === 'conteudo') return 'conteúdo'
  return 'coordenação'
}

/** Une o catálogo estático vigente aos registros medidos no estado do painel. */
export function montarCatalogoPixel(agentes: Array<{ id: string; nome: string; descricao?: string; squad: string }>, sessoes: Array<{ id: string; nome: string; papel: string; camada: string; resumo: string }>) {
  const catalogo = PIXEL_AGENTS.map((agente) => ({ ...agente }))
  const inserir = (item: PixelAgent) => {
    const existente = catalogo.find((agente) => normalizarId(agente.id) === normalizarId(item.id) || agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(item.id)))
    if (existente) { existente.descricao ??= item.descricao; existente.aliases = [...new Set([...(existente.aliases ?? []), item.id])]; return }
    catalogo.push(item)
  }
  agentes.forEach((agente, index) => inserir({ id: agente.id, nome: agente.nome || agente.id, papel: agente.descricao?.split(':')[0] || 'Agente operacional', squad: normalizarSquad(agente.squad), área: agente.squad, abreviação: (agente.nome || agente.id).slice(0, 2).toUpperCase(), cor: PIXEL_AGENT_SQUADS[index % PIXEL_AGENT_SQUADS.length].cor, descricao: agente.descricao }))
  sessoes.filter((sessao) => sessao.id !== 'gastao' && sessao.nome.toLowerCase() !== 'gastão').forEach((sessao, index) => inserir({ id: sessao.id, nome: sessao.nome, papel: sessao.papel, squad: 'coordenação', área: sessao.camada, abreviação: sessao.nome.slice(0, 2).toUpperCase(), cor: index % 2 ? '#22d3ee' : '#c084fc', descricao: sessao.resumo }))
  return catalogo
}
