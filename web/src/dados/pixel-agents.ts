/** Catálogo visual do painel, derivado de equipe/membros.yaml e das definições vigentes.
 *
 * Este catálogo descreve papéis que existem. Presença e atividade vêm somente
 * de /api/agentes-vivos; um item sem sessão nunca é promovido a "executando".
 */

import { corDaSessao } from '../ui/paleta'

export type PixelAgentSquad = 'coordenação' | 'bots' | 'tráfego' | 'radar' | 'conteúdo' | 'comercial' | 'destinos' | 'análise' | 'globais' | 'pipeline Codex'

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
  { id: 'coordenação', nome: 'COORDENAÇÃO', cor: '#84cc16' },
  { id: 'bots', nome: 'RENATO / BOTS', cor: '#c2410c' },
  { id: 'tráfego', nome: 'BIA / TRÁFEGO', cor: '#8b5cf6' },
  { id: 'conteúdo', nome: 'SQUAD CONTEÚDO', cor: '#d97706' },
  { id: 'comercial', nome: 'SQUAD COMERCIAL', cor: '#16a34a' },
  { id: 'radar', nome: 'RADAR', cor: '#38bdf8' },
  { id: 'destinos', nome: 'DESTINOS', cor: '#fb923c' },
  { id: 'análise', nome: 'DESTINOS / ANÁLISE', cor: '#facc15' },
  { id: 'globais', nome: 'GLOBAIS', cor: '#06b6d4' },
  { id: 'pipeline Codex', nome: 'PIPELINE CODEX', cor: '#ec4899' },
]

export const PIXEL_AGENTS: PixelAgent[] = [
  { id: 'iris', nome: 'Íris', papel: 'Orquestradora de conteúdo', squad: 'conteúdo', área: 'Regência', abreviação: 'ÍR', cor: '#c084fc', aliases: ['orquestradora', 'iris-regente'] },
  { id: 'elza', nome: 'Elza', papel: 'Diretora comercial', squad: 'comercial', área: 'Regência', abreviação: 'EL', cor: '#c084fc', aliases: ['diretora-comercial', 'comercial-squad', 'elza-regente'] },
  { id: 'zara', nome: 'Zara', papel: 'Triagem e ICP', squad: 'comercial', área: 'Qualificação', abreviação: 'ZA', cor: '#f59e0b', aliases: ['zara-triagem'] },
  { id: 'otto', nome: 'Otto', papel: 'Radar e sinais', squad: 'comercial', área: 'Sinais', abreviação: 'OT', cor: '#d97706', aliases: ['otto-radar'] },
  { id: 'bento', nome: 'Bento', papel: 'Estrategista da conta', squad: 'comercial', área: 'Estratégia', abreviação: 'BE', cor: '#b45309', aliases: ['bento-estrategista'] },
  { id: 'maya', nome: 'Maya', papel: 'Copy e abordagem', squad: 'comercial', área: 'Abordagem', abreviação: 'MA', cor: '#f59e0b', aliases: ['maya-copy'] },
  { id: 'olga', nome: 'Olga', papel: 'Fiscal de copy', squad: 'comercial', área: 'Fiscalização', abreviação: 'OL', cor: '#d97706', aliases: ['olga-fiscal'] },
  { id: 'caio', nome: 'Caio', papel: 'Operador de envio', squad: 'comercial', área: 'Operação', abreviação: 'CA', cor: '#b45309', aliases: ['caio-envio'] },
  { id: 'hugo', nome: 'Hugo', papel: 'Analista e métricas', squad: 'comercial', área: 'Métricas', abreviação: 'HU', cor: '#92400e', aliases: ['hugo-analista'] },
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

export const chaveAgente = (dono: string | undefined | null, id: string) => (dono ? `${dono}:${id}` : id)

/** Formata rótulo do agente para o escritório pixel art, prevenindo tags duplicadas (ex: [B] [B] Cleo). */
export function formatarRotulo(nome: string, tagDono: string, limite = 21): string {
  let nomeLimpo = nome.trim()
  if (tagDono) {
    // Remove qualquer tag de dono já presente no nome (ex: "[B] Cleo", "Cleo [B]", "[B] [B] Cleo")
    nomeLimpo = nomeLimpo.replace(/\[[A-Za-z]\]/g, '').replace(/\s+/g, ' ').trim()
  }
  const prefixo = tagDono ? tagDono : ''
  const completo = `${prefixo}${nomeLimpo}`
  if (completo.length <= limite) return completo
  if (nomeLimpo.includes('·')) {
    const partes = nomeLimpo.split('·').map((s) => s.trim())
    const pref = partes[0]
    const suf = partes.slice(1).join('·')
    const espaco = limite - prefixo.length - suf.length - 3
    if (espaco > 3) {
      return `${prefixo}${pref.slice(0, espaco - 1)}… · ${suf}`
    }
  }
  return completo.slice(0, limite - 1) + '…'
}

export function resolverAgenteNoCatalogo(
  agente: { id: string; dono?: string | null; identidade?: string | null },
  catalogoVisual: PixelAgent[]
): PixelAgent | undefined {
  const chave = chaveAgente(agente.dono, agente.id)
  return (
    catalogoVisual.find((item) => item.id === chave || item.aliases?.includes(chave)) ??
    catalogoVisual.find(
      (item) =>
        item.id === agente.id ||
        item.aliases?.includes(agente.id) ||
        (agente.identidade &&
          agente.identidade !== 'sessao-codex' &&
          (normalizarId(item.id) === normalizarId(agente.identidade ?? '') ||
            item.aliases?.some((alias) => normalizarId(alias) === normalizarId(agente.identidade ?? ''))))
    )
  )
}

export function construirMapaAgentesPorCatalogo<T extends { id: string; dono?: string | null; identidade?: string | null }>(
  agentes: T[],
  catalogoVisual: PixelAgent[]
): Map<string, T> {
  const mapa = new Map<string, T>()
  for (const agente of agentes) {
    const chave = chaveAgente(agente.dono, agente.id)
    mapa.set(chave, agente)
    const itemCat = resolverAgenteNoCatalogo(agente, catalogoVisual)
    if (itemCat) {
      mapa.set(itemCat.id, agente)
    }
  }
  return mapa
}

export function obterAtivosNoCatalogo<T extends { id: string; dono?: string | null; identidade?: string | null; estado?: string }>(
  agentes: T[],
  catalogoVisual: PixelAgent[]
): Set<string> {
  return new Set(
    agentes
      .filter((agente) => agente.estado === 'trabalhando')
      .map((agente) => {
        const chave = chaveAgente(agente.dono, agente.id)
        const itemCat = resolverAgenteNoCatalogo(agente, catalogoVisual)
        return itemCat?.id ?? chave
      })
  )
}

export function mesclarRuntimesNoCatalogo(
  catalogo: PixelAgent[],
  runtimes: Array<{
    id: string
    dono?: string
    tipo?: string | null
    identidade?: string | null
    papel?: string | null
    tarefa?: string | null
    descricao?: string | null
    motor?: string
    etapa?: string | null
    etapa_e_description?: boolean | null
  }>
) {
  const resultado = catalogo.map((agente) => ({ ...agente, aliases: agente.aliases ? [...agente.aliases] : undefined }))
  const donosAssociados = new Map<string, string | undefined>()

  runtimes.forEach((runtime, index) => {
    const identidade = runtime.identidade && runtime.identidade !== 'sessao-codex' ? runtime.identidade : null
    const sufixo = runtime.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || String(index + 1)
    const chave = runtime.dono ? `${runtime.dono}:${runtime.id}` : runtime.id
    const ehCodex = runtime.tipo === 'codex' || runtime.motor === 'codex' || runtime.id.startsWith('session-') || runtime.id.startsWith('rollout-')

    const existente = resultado.find((agente) => {
      const match =
        (identidade
          ? normalizarId(agente.id) === normalizarId(identidade) ||
            agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(identidade))
          : false) ||
        normalizarId(agente.id) === normalizarId(runtime.id) ||
        agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(runtime.id))
      if (!match) return false
      const donoExistente = donosAssociados.get(agente.id)
      return donoExistente === undefined || donoExistente === runtime.dono
    })

    if (existente) {
      donosAssociados.set(existente.id, runtime.dono)
      const novaDescricao = runtime.descricao || runtime.tarefa || runtime.etapa
      if (novaDescricao) {
        existente.descricao = novaDescricao
      }
      return
    }

    const baseOriginal = catalogo.find(
      (agente) =>
        (identidade
          ? normalizarId(agente.id) === normalizarId(identidade) ||
            agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(identidade))
          : false) ||
        normalizarId(agente.id) === normalizarId(runtime.id) ||
        agente.aliases?.some((alias) => normalizarId(alias) === normalizarId(runtime.id))
    )
    if (baseOriginal) {
      const novoId = chave
      const tagDono = runtime.dono ? ` [${runtime.dono[0].toUpperCase()}]` : ''
      resultado.push({
        ...baseOriginal,
        id: novoId,
        nome: `${baseOriginal.nome}${tagDono}`,
        descricao: runtime.descricao || runtime.tarefa || runtime.etapa || baseOriginal.descricao,
        aliases: [runtime.id],
      })
      donosAssociados.set(novoId, runtime.dono)
      return
    }

    const nome = ehCodex
      ? `Sessão Codex · ${sufixo}`
      : runtime.tipo
        ? `${runtime.tipo} · ${sufixo}`
        : `Subagente · ${sufixo}`
    const squad: PixelAgentSquad = ehCodex ? 'pipeline Codex' : 'globais'
    const papel = runtime.papel || (ehCodex ? 'Sessão Codex' : 'Subagente Claude')
    const abreviacao = ehCodex ? 'CX' : runtime.tipo ? runtime.tipo.slice(0, 2).toUpperCase() : 'SA'
    const cor = ehCodex ? '#f472b6' : '#60a5fa'

    resultado.push({
      id: chave,
      nome,
      papel,
      squad,
      área: 'Sessão viva',
      abreviação: abreviacao,
      cor,
      descricao: runtime.descricao || runtime.tarefa || runtime.etapa || (ehCodex ? 'Sessão sem identidade operacional catalogada' : 'Subagente sem descrição'),
      aliases: [runtime.id],
    })
    donosAssociados.set(chave, runtime.dono)
  })
  return resultado
}

const normalizarSquad = (squad: string): PixelAgentSquad => {
  if (squad === 'global') return 'globais'
  if (squad === 'conteudo') return 'conteúdo'
  if (squad === 'comercial') return 'comercial'
  if (squad === 'renato' || squad === 'bots') return 'bots'
  if (squad === 'bia' || squad === 'tráfego' || squad === 'trafego') return 'tráfego'
  if (squad === 'radar') return 'radar'
  if (squad === 'destinos') return 'destinos'
  if (squad === 'análise' || squad === 'analise') return 'análise'
  return 'coordenação'
}

const corDaSessaoPixel = (sessaoId: string, _index: number) => {
  return corDaSessao(sessaoId)
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
  sessoes.filter((sessao) => sessao.id !== 'gastao' && sessao.nome.toLowerCase() !== 'gastão').forEach((sessao, index) => {
    const squadSessao: PixelAgentSquad = sessao.id === 'renato' ? 'bots' : sessao.id === 'bia' ? 'tráfego' : 'coordenação'
    inserir({ id: sessao.id, nome: sessao.nome, papel: sessao.papel, squad: squadSessao, área: sessao.camada, abreviação: sessao.nome.slice(0, 2).toUpperCase(), cor: corDaSessaoPixel(sessao.id, index), descricao: sessao.resumo })
  })
  return catalogo
}
