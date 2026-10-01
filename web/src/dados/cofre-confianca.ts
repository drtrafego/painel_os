/** Contrato aditivo. Metadados descrevem revisão; não concedem permissões.
 * O runtime deve validar aprovações fora do JSON recebido do agente.
 * Módulo puro: sem DOM, React, fetch, storage ou mutação dos registros.
 */
export const RELACOES = ['cita', 'sustentada_por', 'substitui', 'contradiz', 'depende_de', 'aplica_se_a', 'associada_por_termo'] as const
export const NATUREZAS = ['fonte', 'informacao', 'regra', 'decisao', 'procedimento', 'hipotese', 'entidade'] as const
export type Relacao = typeof RELACOES[number]
export type Natureza = typeof NATUREZAS[number]
export type EscopoMemoria = { operacao_id: string; projeto_id: string | null; recurso_id?: string | null }
export type EvidenciaMemoria = {
  id: string; fonte_id: string; trecho: string; documento_sha256: string; trecho_sha256: string
  verificado_em: string | null; localizacao: 'localizada' | 'ausente' | 'nao_verificada'
}
export type MetadadosMemoria = {
  schema_version: 2; versao: string; escopo: EscopoMemoria
  natureza?: Natureza; relacao?: Relacao
  revisao: { estado: 'pendente' | 'aprovada' | 'rejeitada' | 'revogada'; decisao_id: string | null; revisor_id: string | null }
  vigencia: { desde: string | null; ate: string | null; revisar_em: string | null }
  evidencias: EvidenciaMemoria[]
}
export type NoConsultavel = {
  id: string; rotulo: string; corpo: string; caso: string; autor: string; especie: string
  area: string; familia: string; arquivo: string; quando: string; vencido: boolean
  grau?: number; peso?: number; semantica_v2?: unknown
}
export type ArestaConsultavel = {
  id?: string; de: string; para: string; porque: string; ponte: boolean
  tipo?: 'declarada' | 'automatica'; semantica_v2?: unknown
}
export type EventoMemoria = {
  id: string; execucao_id: string; quando: string
  evento: 'contexto_preparado' | 'contexto_entregue' | 'citacao_observada' | 'verificacao' | 'acao_bloqueada' | 'acao_executada'
  referencias: { id: string; versao: string }[]; resultado: string
}
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const texto = (v: unknown, max = 200): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const opcTexto = (v: unknown): v is string | null => v === null || texto(v)
/** Só ISO explícito; datas sem fuso de hora são rejeitadas, nunca inferidas. */
export function instanteISO(v: unknown, fimDoDia = false): number | null {
  if (typeof v !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const t = Date.parse(v + 'T00:00:00.000Z')
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? t + (fimDoDia ? 86_399_999 : 0) : null
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return null
  if (instanteISO(v.slice(0, 10)) === null || Number(v.slice(11, 13)) > 23 || Number(v.slice(14, 16)) > 59 || Number(v.slice(17, 19)) > 59) return null
  const n = Date.parse(v)
  return Number.isFinite(n) ? n : null
}
export function lerMetadados(valor: unknown, entidade: 'no' | 'aresta' = 'no'): { dados: MetadadosMemoria | null; problemas: string[] } {
  if (valor === undefined || valor === null) return { dados: null, problemas: [] }
  const problemas: string[] = []
  if (!objeto(valor)) return { dados: null, problemas: ['Metadados não são um objeto.'] }
  if (valor.schema_version !== 2 || !texto(valor.versao, 80)) problemas.push('Versão do contrato/registro inválida.')
  const e = valor.escopo; const r = valor.revisao; const v = valor.vigencia
  if (!objeto(e) || !texto(e.operacao_id) || !opcTexto(e.projeto_id) || (e.recurso_id !== undefined && !opcTexto(e.recurso_id))) problemas.push('Escopo explícito ausente ou inválido.')
  if (!objeto(r) || !['pendente', 'aprovada', 'rejeitada', 'revogada'].includes(String(r.estado)) || !opcTexto(r.decisao_id) || !opcTexto(r.revisor_id)) problemas.push('Revisão inválida.')
  else if (r.estado === 'aprovada' && (!r.decisao_id || !r.revisor_id)) problemas.push('Aprovação sem referência de decisão/revisor.')
  if (!objeto(v)) problemas.push('Vigência inválida.')
  else {
    for (const k of ['desde', 'ate', 'revisar_em']) if (v[k] !== null && instanteISO(v[k]) === null) problemas.push(`Vigência ${k} inválida.`)
    if (typeof v.desde === 'string' && typeof v.ate === 'string' && (instanteISO(v.desde) ?? Infinity) > (instanteISO(v.ate, true) ?? -Infinity)) problemas.push('Intervalo de vigência invertido.')
  }
  if (entidade === 'no' && !NATUREZAS.includes(valor.natureza as Natureza)) problemas.push('Natureza ausente ou inválida.')
  if (entidade === 'aresta' && !RELACOES.includes(valor.relacao as Relacao)) problemas.push('Semântica da relação inválida.')
  if (!Array.isArray(valor.evidencias) || valor.evidencias.length > 100) problemas.push('Evidências inválidas.')
  else {
    const ids = new Set<string>()
    for (const ev of valor.evidencias) {
      if (!objeto(ev) || !texto(ev.id) || !texto(ev.fonte_id) || !texto(ev.trecho, 16000) || !hash(ev.documento_sha256) || !hash(ev.trecho_sha256) || !['localizada', 'ausente', 'nao_verificada'].includes(String(ev.localizacao)) || (ev.verificado_em !== null && instanteISO(ev.verificado_em) === null)) problemas.push('Evidência sem trecho, integridade ou localização válidos.')
      else { if (ids.has(ev.id)) problemas.push('ID de evidência repetido.'); ids.add(ev.id) }
    }
  }
  return { dados: problemas.length ? null : valor as unknown as MetadadosMemoria, problemas }
}
export function naturezaDoNo(no: NoConsultavel): Natureza {
  const m = lerMetadados(no.semantica_v2).dados
  if (m?.natureza) return m.natureza
  // Categoria visual apenas: isto NÃO aprova uma ordem/trava legada.
  if (['ordem', 'trava'].includes(no.especie)) return 'regra'
  if (['skill', 'agente', 'sistema'].includes(no.especie) || ['agentes', 'sistemas', 'ferramentas'].includes(no.familia)) return 'entidade'
  return 'informacao'
}
export function estadoDoNo(no: NoConsultavel, agora: number): { codigo: string; rotulo: string; tom: 'neutro' | 'atencao' | 'perigo' | 'ok' } {
  if (no.vencido) return { codigo: 'ancora_vencida', rotulo: 'Âncora não confere', tom: 'perigo' }
  const { dados: m, problemas } = lerMetadados(no.semantica_v2)
  if (problemas.length) return { codigo: 'metadados_invalidos', rotulo: 'Metadados inválidos', tom: 'perigo' }
  if (!m) return { codigo: 'legado', rotulo: 'Legado · revisão pendente', tom: 'atencao' }
  if (m.revisao.estado === 'revogada' || m.revisao.estado === 'rejeitada') return { codigo: m.revisao.estado, rotulo: `Revisão ${m.revisao.estado}`, tom: 'perigo' }
  if (m.vigencia.desde && (instanteISO(m.vigencia.desde) ?? Infinity) > agora) return { codigo: 'futura', rotulo: 'Vigência futura', tom: 'atencao' }
  if (m.vigencia.ate && (instanteISO(m.vigencia.ate, true) ?? -Infinity) < agora) return { codigo: 'expirada', rotulo: 'Vigência encerrada', tom: 'perigo' }
  if (m.vigencia.revisar_em && (instanteISO(m.vigencia.revisar_em, true) ?? -Infinity) < agora) return { codigo: 'revisar', rotulo: 'Prazo de revisão vencido', tom: 'atencao' }
  if (m.revisao.estado !== 'aprovada') return { codigo: 'pendente', rotulo: 'Revisão pendente', tom: 'atencao' }
  if (!m.evidencias.length || m.evidencias.some(ev => ev.localizacao !== 'localizada')) return { codigo: 'sem_evidencia', rotulo: 'Evidência não localizada', tom: 'atencao' }
  return { codigo: 'registrada', rotulo: 'Revisão e fontes registradas', tom: 'ok' }
}
const rotulos: Record<Relacao, string> = {
  cita: 'cita', sustentada_por: 'sustentada por', substitui: 'substitui', contradiz: 'contradiz',
  depende_de: 'depende de', aplica_se_a: 'aplica-se a', associada_por_termo: 'associação por termo',
}
export function descreverRelacao(a: ArestaConsultavel): { rotulo: string; sugerida: boolean; relacao: Relacao | 'legada'; problemas: string[] } {
  const { dados: m, problemas } = lerMetadados(a.semantica_v2, 'aresta')
  // Automática nunca vira prova por carregar metadata "aprovada".
  if (a.tipo === 'automatica') return { rotulo: m?.relacao === 'associada_por_termo' ? rotulos.associada_por_termo : 'associação automática', sugerida: true, relacao: m?.relacao ?? 'legada', problemas }
  if (!m?.relacao) return { rotulo: 'relação legada · sem verbo', sugerida: true, relacao: 'legada', problemas }
  return { rotulo: rotulos[m.relacao], sugerida: m.revisao.estado !== 'aprovada' || m.relacao === 'associada_por_termo', relacao: m.relacao, problemas }
}
/** Identidade distingue múltiplas relações do mesmo par, sem concatenadores ambíguos. */
export function chaveRelacao(a: ArestaConsultavel): string {
  return a.id || JSON.stringify([a.de, a.para, a.tipo ?? 'legada', descreverRelacao(a).relacao, a.porque])
}
/** Busca de UI, NÃO recuperação autorizada do runtime. Sem corte silencioso em seis resultados. */
export function buscarNos<T extends NoConsultavel>(nos: readonly T[], busca: string): T[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  const termos = norm(busca.trim()).split(/\s+/).filter(Boolean)
  if (!termos.length) return [...nos]
  return nos.filter(n => {
    const corpus = norm([n.id, n.rotulo, n.corpo, n.caso, n.autor, n.especie, n.area, n.arquivo].join(' '))
    return termos.every(t => corpus.includes(t))
  })
}
/** O legado retorna sequência de nós. Escolhe uma relação por salto, de forma determinística.
 * Não interpreta caminho de navegação como cadeia de evidências. */
export function relacoesDoCaminho(caminho: readonly string[] | null, arestas: readonly ArestaConsultavel[]): Set<string> {
  const chaves = new Set<string>()
  if (!caminho) return chaves
  for (let i = 1; i < caminho.length; i++) {
    const a = caminho[i - 1]; const b = caminho[i]
    const candidatas = arestas.filter(e => (e.de === a && e.para === b) || (e.de === b && e.para === a))
      .sort((x, y) => Number(x.tipo === 'automatica') - Number(y.tipo === 'automatica') || chaveRelacao(x).localeCompare(chaveRelacao(y)))
    if (candidatas[0]) chaves.add(chaveRelacao(candidatas[0]))
  }
  return chaves
}
export function lerAuditoria(v: unknown): { eventos: EventoMemoria[]; rejeitados: number; conectado: boolean } {
  if (!objeto(v) || v.schema_version !== 2 || !Array.isArray(v.eventos)) return { eventos: [], rejeitados: v == null ? 0 : 1, conectado: false }
  const eventos: EventoMemoria[] = []; let rejeitados = 0
  const ids = new Set<string>()
  for (const ev of v.eventos) {
    if (!objeto(ev) || !texto(ev.id) || ids.has(ev.id) || !texto(ev.execucao_id) || instanteISO(ev.quando) === null || !['contexto_preparado', 'contexto_entregue', 'citacao_observada', 'verificacao', 'acao_bloqueada', 'acao_executada'].includes(String(ev.evento)) || !texto(ev.resultado, 2000) || !Array.isArray(ev.referencias) || ev.referencias.some(r => !objeto(r) || !texto(r.id) || !texto(r.versao, 80))) { rejeitados++; continue }
    ids.add(ev.id); eventos.push(ev as unknown as EventoMemoria)
  }
  return { eventos: eventos.sort((a, b) => (instanteISO(b.quando) ?? 0) - (instanteISO(a.quando) ?? 0)), rejeitados, conectado: true }
}
export function formatarData(v: string | null | undefined): string {
  if (!v || instanteISO(v) === null) return 'Não informada'
  return new Date(instanteISO(v)!).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
