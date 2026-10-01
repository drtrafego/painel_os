import { useMemo, useState, type ReactNode } from 'react'
import type { ArestaCofre, NoMemoria } from '../dados/tipos'
import {
  buscarNos, chaveRelacao, descreverRelacao, estadoDoNo, formatarData,
  lerAuditoria, lerMetadados, naturezaDoNo, type NoConsultavel,
} from '../dados/cofre-confianca'
import './CofreConfianca.css'

type Aba = 'mapa' | 'evidencias' | 'regras' | 'auditoria'
type Props = {
  nos: NoMemoria[]; arestas: ArestaCofre[]; escolhido: string
  aoEscolher: (id: string) => void; agora: number; auditoria?: unknown; avisos?: unknown; children: ReactNode
}
const ABAS: Array<[Aba, string, string]> = [
  ['mapa', 'Mapa', '01'], ['evidencias', 'Evidências', '02'],
  ['regras', 'Regras e decisões', '03'], ['auditoria', 'Auditoria', '04'],
]
const NATUREZAS: Record<string, string> = { regra: 'Regra', decisao: 'Decisão', fonte: 'Fonte', informacao: 'Informação', procedimento: 'Procedimento', hipotese: 'Hipótese', entidade: 'Capacidade' }
export function SeloConfianca({ no, agora }: { no: NoConsultavel; agora: number }) {
  const estado = estadoDoNo(no, agora)
  return <span className="ctc-badge" data-tom={estado.tom}>{estado.rotulo}</span>
}

/** Área de conhecimento dentro do shell existente. Sem backend paralelo nem escrita. */
export function CofreConfianca({ nos, arestas, escolhido, aoEscolher, agora, auditoria, avisos, children }: Props) {
  const [aba, setAba] = useState<Aba>('mapa')
  const [busca, setBusca] = useState('')
  const [area, setArea] = useState('')
  const [projeto, setProjeto] = useState('')
  const [propostas, setPropostas] = useState(false)
  const [limite, setLimite] = useState(30)
  const [execucao, setExecucao] = useState('')
  const porId = useMemo(() => new Map(nos.map(n => [n.id, n])), [nos])
  const atual = porId.get(escolhido) ?? nos[0]
  const areas = useMemo(() => [...new Set(nos.map(n => n.area))].sort(), [nos])
  const projetos = useMemo(() => [...new Set(nos.map(n => lerMetadados(n.semantica_v2).dados?.escopo.projeto_id).filter((p): p is string => !!p))].sort(), [nos])
  const lista = useMemo(() => buscarNos(nos, busca).filter(n => {
    const m = lerMetadados(n.semantica_v2).dados
    return (!area || n.area === area) && (!projeto || m?.escopo.projeto_id === projeto) &&
      (aba !== 'regras' || ['regra', 'decisao'].includes(naturezaDoNo(n)))
  }), [nos, busca, area, projeto, aba])
  const relacoes = useMemo(() => arestas.filter(a => atual && (a.de === atual.id || a.para === atual.id)), [arestas, atual])
  const exibidas = relacoes.filter(a => propostas || !descreverRelacao(a).sugerida)
  const avisosValidos = Array.isArray(avisos) ? avisos.filter((v): v is string => typeof v === 'string').map(v => v.slice(0, 600)) : []
  const trace = useMemo(() => lerAuditoria(auditoria), [auditoria])
  const execucoes = [...new Set(trace.eventos.map(e => e.execucao_id))]
  const eventos = trace.eventos.filter(e => !execucao || e.execucao_id === execucao)
  const resumo = useMemo(() => ({
    pendentes: nos.filter(n => estadoDoNo(n, agora).codigo !== 'registrada').length,
    ancoras: nos.filter(n => n.vencido).length,
    sugestoes: arestas.filter(a => descreverRelacao(a).sugerida).length,
    conflitos: arestas.filter(a => descreverRelacao(a).relacao === 'contradiz').length,
  }), [nos, arestas, agora])
  const trocar = (v: Aba) => { setAba(v); setLimite(30) }
  return <section className="ctc" aria-label="Cérebro CT: fontes, regras e evidências" data-testid="cofre-confianca">
    <header className="ctc-header">
      <div className="ctc-mark" aria-hidden="true">CT</div>
      <div className="ctc-heading"><span className="ctc-eyebrow">NÚCLEO DE CONHECIMENTO</span><h2>Conexão não é comprovação.</h2><p>Explore a memória. Confira a fonte. Preserve a decisão.</p></div>
      <span className="ctc-meta">{nos.length} registros no snapshot</span>
    </header>
    <nav className="ctc-tabs" aria-label="Leituras do conhecimento">
      {ABAS.map(([id, titulo, numero]) => <button type="button" key={id} aria-pressed={aba === id} onClick={() => trocar(id)}><span>{numero}</span>{titulo}</button>)}
    </nav>
    <div className="ctc-metrics" aria-label="Diagnóstico, não pontuação de verdade">
      <div><span>Revisão / vigência a conferir</span><strong>{resumo.pendentes}</strong></div>
      <div><span>Âncoras que não conferem</span><strong>{resumo.ancoras}</strong></div>
      <div><span>Associações ou relações pendentes</span><strong>{resumo.sugestoes}</strong></div>
      <div><span>Conflitos registrados</span><strong>{resumo.conflitos}</strong></div>
    </div>
    {avisosValidos.length > 0 && <details className="ctc-note"><summary>Coleta parcial / revisão: {avisosValidos.length} aviso(s)</summary>{avisosValidos.map((v, i) => <p key={i}>{v}</p>)}</details>}
    {/* A instância original continua montada. IntersectionObserver pausa o WebGL oculto. */}
    <div hidden={aba !== 'mapa'} className="ctc-original-map" data-testid="cofre-mapa-preservado">
      <p className="ctc-note">Mapa de exploração. Linhas automáticas são sugestões; caminhos e pulsos decorativos não comprovam uso da memória. Consulte Evidências para examinar uma afirmação.</p>
      {children}
    </div>
    {(aba === 'evidencias' || aba === 'regras') && <>
      <div className="ctc-filters">
        <label className="ctc-search">Buscar na memória<input value={busca} onChange={e => { setBusca(e.target.value); setLimite(30) }} placeholder="ID, texto, regra, autor ou fonte…" /></label>
        <label>Área<select value={area} onChange={e => { setArea(e.target.value); setLimite(30) }}><option value="">Todas as áreas recebidas</option>{areas.map(a => <option key={a}>{a}</option>)}</select></label>
        <label>Projeto informado<select value={projeto} onChange={e => { setProjeto(e.target.value); setLimite(30) }}><option value="">Todos / legado</option>{projetos.map(p => <option key={p}>{p}</option>)}</select></label>
      </div>
      <p className="ctc-scope-note">Filtros visuais sobre o snapshot já recebido. A autorização de leitura e execução deve ser aplicada no servidor.</p>
      <div className="ctc-workspace">
        <aside className="ctc-index" aria-label="Registros encontrados">
          <div className="ctc-index-heading"><span>{aba === 'regras' ? 'REGRAS E DECISÕES' : 'REGISTROS'}</span><b>{lista.length}</b></div>
          {lista.length === 0 ? <p className="ctc-empty">Nenhum registro corresponde aos filtros. Ausência de resultado não prova que não exista uma regra.</p> : lista.slice(0, limite).map(n => <button type="button" key={n.id} className="ctc-record" aria-pressed={atual?.id === n.id} onClick={() => aoEscolher(n.id)}>
            <span className="ctc-record-kind">{NATUREZAS[naturezaDoNo(n)]} · {n.area}</span><strong>{n.rotulo}</strong><SeloConfianca no={n} agora={agora} />
          </button>)}
          {lista.length > limite && <button type="button" className="ctc-more" onClick={() => setLimite(limite + 30)}>Mostrar mais · {Math.min(limite, lista.length)} de {lista.length}</button>}
        </aside>
        <article className="ctc-detail" aria-label="Afirmação e evidências">
          {!atual ? <p className="ctc-empty">Nenhum nó disponível nesta leitura.</p> : <>
            <div className="ctc-detail-head"><span className="ctc-eyebrow">{atual.id}</span><SeloConfianca no={atual} agora={agora} /></div>
            <h3>{atual.rotulo}</h3>
            {lista.length > 0 && !lista.some(n => n.id === atual.id) && <p className="ctc-note">A seleção atual está fora do filtro. Selecione um registro da lista para mudar a ficha.</p>}
            <p className="ctc-claim">{atual.corpo || 'Corpo não informado.'}</p>
            <FichaEvidencias no={atual} />
            <div className="ctc-relations-heading"><h4>Relações deste registro</h4><label><input type="checkbox" checked={propostas} onChange={e => setPropostas(e.target.checked)} /> Incluir sugestões e legado</label></div>
            <p className="ctc-scope-note">{exibidas.length} de {relacoes.length} relações exibidas. A ocultação não remove conhecimento.</p>
            <div className="ctc-relations">
              {exibidas.length === 0 ? <p className="ctc-empty">Nenhuma relação revisada tipada disponível. Ative as sugestões para explorar o legado.</p> : exibidas.map((a, i) => {
                const d = descreverRelacao(a); const de = porId.get(a.de); const para = porId.get(a.para)
                const m = lerMetadados(a.semantica_v2, 'aresta').dados
                return <div key={`${chaveRelacao(a)}:${i}`} className="ctc-edge" data-sugerida={d.sugerida} data-conflito={d.relacao === 'contradiz'}>
                  <div className="ctc-edge-route"><button type="button" onClick={() => aoEscolher(a.de)} disabled={!de}>{de?.rotulo ?? a.de}</button><span><i aria-hidden="true">→</i>{d.rotulo}<i aria-hidden="true">→</i></span><button type="button" onClick={() => aoEscolher(a.para)} disabled={!para}>{para?.rotulo ?? a.para}</button></div>
                  <p>{a.porque}</p><small>{a.tipo ?? 'Origem não informada'} · {m ? `Revisão ${m.revisao.estado} · v${m.versao}` : 'Sem revisão tipada'}{d.problemas.length > 0 ? ' · Metadados inválidos' : ''}</small>
                </div>
              })}
            </div>
          </>}
        </article>
      </div>
    </>}
    {aba === 'auditoria' && <div className="ctc-audit">
      <div className="ctc-audit-heading"><div><span className="ctc-eyebrow">RASTRO OBSERVÁVEL</span><h3>Do contexto ao resultado.</h3></div><label>Execução<select value={execucao} onChange={e => { setExecucao(e.target.value); setLimite(30) }}><option value="">Todas as recebidas</option>{execucoes.map(id => <option key={id}>{id}</option>)}</select></label></div>
      <div className="ctc-pipeline" aria-label="Etapas possíveis, não eventos executados"><span>Consulta</span><i>→</i><span>Contexto entregue</span><i>→</i><span>Citação observada</span><i>→</i><span>Verificação</span><i>→</i><span>Ação</span></div>
      <p className="ctc-note">Este desenho é a legenda do fluxo. Só os eventos registrados abaixo descrevem o que aconteceu. Não exibe raciocínio privado do modelo.</p>
      {!trace.conectado ? <div className="ctc-audit-empty"><span aria-hidden="true">◎</span><h4>Telemetria da memória não conectada.</h4><p>O snapshot não trouxe uma trilha válida do runtime. Nós no grafo e agentes trabalhando não comprovam que uma memória foi entregue ao modelo.</p></div> : eventos.length === 0 ? <p className="ctc-empty">Nenhum evento nessa leitura. Isso não significa que o agente não usou outras fontes.</p> : <ol className="ctc-events">{eventos.slice(0, limite).map(e => <li key={e.id}><span className="ctc-event-dot" aria-hidden="true" /><div><span className="ctc-record-kind">{e.execucao_id} · {formatarData(e.quando)}</span><h4>{e.evento.replaceAll('_', ' ')}</h4><p>{e.resultado}</p><div className="ctc-refs">{e.referencias.map((r, i) => <button type="button" key={`${r.id}:${r.versao}:${i}`} disabled={!porId.has(r.id)} onClick={() => { aoEscolher(r.id); trocar('evidencias') }}>{r.id} · versão {r.versao}</button>)}</div></div></li>)}</ol>}
      {eventos.length > limite && <button type="button" className="ctc-more" onClick={() => setLimite(limite + 30)}>Mostrar mais eventos · {limite} de {eventos.length}</button>}
      {trace.rejeitados > 0 && <p className="ctc-note">{trace.rejeitados} registro(s) de auditoria inválido(s) não foram apresentado(s).</p>}
    </div>}
    <footer className="ctc-footer"><span>CT / MEMÓRIA COM PROVENIÊNCIA</span><span>Conectividade ≠ veracidade · Citação ≠ sustentação · Consulta ≠ autorização</span></footer>
  </section>
}
function FichaEvidencias({ no }: { no: NoMemoria }) {
  const { dados: m, problemas } = lerMetadados(no.semantica_v2)
  return <>
    <dl className="ctc-facts"><div><dt>Natureza</dt><dd>{NATUREZAS[naturezaDoNo(no)]}</dd></div><div><dt>Projeto / escopo</dt><dd>{m ? `${m.escopo.operacao_id} / ${m.escopo.projeto_id ?? 'Global explícito'}` : 'Não informado no legado'}</dd></div><div><dt>Versão do registro</dt><dd>{m?.versao ?? 'Não informada'}</dd></div><div><dt>Fonte original</dt><dd>{no.arquivo || 'Não informada'}</dd></div><div><dt>Validade até</dt><dd>{formatarData(m?.vigencia.ate)}</dd></div><div><dt>Próxima revisão</dt><dd>{formatarData(m?.vigencia.revisar_em)}</dd></div></dl>
    <h4 className="ctc-section-title">O que sustenta esta informação?</h4>
    {problemas.length > 0 && <p className="ctc-note" data-tom="perigo">{problemas.join(' ')}</p>}
    {!m?.evidencias.length ? <div className="ctc-empty"><strong>Trecho de evidência ainda não estruturado.</strong><p>A existência da âncora na fonte não confirma automaticamente o conteúdo, a vigência ou a autorização desta informação.</p></div> : m.evidencias.map(ev => <div key={ev.id} className="ctc-evidence"><div><span className="ctc-eyebrow">{ev.fonte_id}</span><span className="ctc-badge" data-tom={ev.localizacao === 'localizada' ? 'ok' : 'atencao'}>{ev.localizacao.replaceAll('_', ' ')}</span></div><blockquote>{ev.trecho}</blockquote><small>Verificação informada: {formatarData(ev.verificado_em)}</small><details><summary>Integridade e referência</summary><p>ID: {ev.id}</p><p>Documento SHA-256: {ev.documento_sha256}</p><p>Trecho SHA-256: {ev.trecho_sha256}</p></details></div>)}
    {m && <p className="ctc-scope-note">Revisão {m.revisao.estado}; decisão: {m.revisao.decisao_id ?? 'não informada'}; revisor: {m.revisao.revisor_id ?? 'não informado'}. São metadados recebidos. O runtime verifica a aprovação contra o registro confiável antes de usar uma regra.</p>}
  </>
}
