import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { VISTAS, type Rota, type VistaId } from '../../nav/rotas'
import { AREAS_NUCLEO, moduloAberto, normalizarBusca } from './areas'
import logo from '../../assets/casal-do-trafego.png'
import './NucleoShell.css'

export interface NucleoShellProps {
  rota: Rota
  aoIr: (vista: VistaId, quem?: string | null, opcoes?: { visao?: string | null; execucao?: string | null }) => void
  escritorio: ReactNode
  children: ReactNode
  instrumentos?: (abrirAreas: () => void) => ReactNode
  avisos?: ReactNode
  areaRef?: RefObject<HTMLElement | null>
}
const FOCAVEIS = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Moldura unificada: mantém o escritório montado e reutiliza as telas existentes.
 * Não consulta APIs, não conhece tarefas de agentes, não calcula métricas e não
 * cria uma segunda fonte de estado. Rota e dados continuam pertencendo ao App.
 */
export function NucleoShell({ rota, aoIr, escritorio, children, instrumentos, avisos, areaRef }: NucleoShellProps) {
  const [grupo, setGrupo] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [pesquisaAberta, setPesquisaAberta] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const cenarioRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const ultimaRotaEscritorio = useRef<{ visao: string | null; execucao: string | null }>({ visao: null, execucao: null })
  const aberto = moduloAberto(rota)
  const titulo = VISTAS.find(v => v.id === rota.vista)?.nome ?? 'Área operacional'
  const areaAtual = AREAS_NUCLEO.find(area => area.vistas.includes(rota.vista))
  const termo = normalizarBusca(busca)
  const resultados = VISTAS.filter(v => normalizarBusca(v.nome).includes(termo))
  const todosIds = new Set(AREAS_NUCLEO.flatMap(area => [...area.vistas]))
  // Novas vistas canônicas não somem: a pesquisa e a seção Todas as áreas as incluem.
  const adicionais = VISTAS.filter(v => !todosIds.has(v.id))

  function abrir(vista: VistaId) {
    setGrupo(null); setPesquisaAberta(false)
    if (vista === 'tarefas') aoIr(vista, null, ultimaRotaEscritorio.current)
    else aoIr(vista, null, vista === 'comando' ? { visao: 'painel' } : undefined)
  }
  function voltar() { abrir('tarefas') }

  useEffect(() => {
    if (!aberto) ultimaRotaEscritorio.current = { visao: rota.visao ?? null, execucao: rota.execucao ?? null }
    setGrupo(null); setPesquisaAberta(false)
  }, [rota.vista, rota.quem, rota.visao, rota.execucao, aberto])

  useEffect(() => {
    if (pesquisaAberta) searchRef.current?.focus()
  }, [pesquisaAberta])

  useEffect(() => {
    const cenario = cenarioRef.current
    if (cenario) cenario.inert = aberto
    if (!aberto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.focus()
    const teclado = (evento: KeyboardEvent) => {
      if (evento.defaultPrevented) return
      if (evento.key === 'Escape') {
        // Diálogos internos (seletor de datas/ficha) têm prioridade sobre a moldura.
        const internos = dialog?.querySelectorAll('[role="dialog"][aria-modal="true"]')
        if (internos?.length) return
        evento.preventDefault(); voltar()
      }
      if (evento.key === 'Tab' && dialog) {
        const elementos = Array.from(dialog.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(e => e.getClientRects().length > 0 && !e.closest('[inert]'))
        if (!elementos.length) { evento.preventDefault(); dialog.focus(); return }
        const primeiro = elementos[0], ultimo = elementos[elementos.length - 1]
        if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === dialog)) { evento.preventDefault(); ultimo.focus() }
        else if (!evento.shiftKey && (document.activeElement === ultimo || !dialog.contains(document.activeElement))) { evento.preventDefault(); primeiro.focus() }
      }
    }
    dialog?.addEventListener('keydown', teclado)
    return () => {
      dialog?.removeEventListener('keydown', teclado)
      if (cenario) cenario.inert = false
      if (anterior?.isConnected) anterior.focus({ preventScroll: true })
    }
    // Reabre foco somente quando troca de módulo; a leitura da sonda não rouba o foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, rota.vista, rota.quem])

  useEffect(() => {
    if (!grupo && !pesquisaAberta) return
    const fechar = (evento: PointerEvent) => {
      const alvo = evento.target as Node
      if (!shellRef.current?.querySelector('.nx-top')?.contains(alvo)) { setGrupo(null); setPesquisaAberta(false) }
    }
    document.addEventListener('pointerdown', fechar)
    return () => document.removeEventListener('pointerdown', fechar)
  }, [grupo, pesquisaAberta])

  return (
    <div ref={shellRef} className="nx-shell" data-testid="nucleo-shell" data-module-open={aberto ? 'true' : 'false'}>
      <header className="nx-top">
        <button type="button" className="nx-brand" onClick={voltar} aria-label="Casal do Tráfego — voltar ao escritório">
          <img src={logo} alt="" width={44} height={44} /><span><strong>CASAL DO TRÁFEGO</strong><small>NÚCLEO OPERACIONAL</small></span>
        </button>
        <nav className="nx-tabs" aria-label="Abas da operação">
          {AREAS_NUCLEO.map(area => <div key={area.id} className="nx-tab-wrap">
            <button type="button" className="nx-tab" aria-current={areaAtual?.id === area.id ? 'page' : undefined} aria-expanded={grupo === area.id} aria-controls={`nx-area-${area.id}`} onClick={() => { setPesquisaAberta(false); setGrupo(atual => atual === area.id ? null : area.id) }}><span aria-hidden="true">{area.sinal}</span>{area.nome}</button>
            {grupo === area.id && <div className="nx-menu" id={`nx-area-${area.id}`} aria-label={area.estacao}>
              <span className="nx-eyebrow">{area.estacao}</span>
              {area.vistas.map(id => <button type="button" key={id} onClick={() => abrir(id)}>{id === 'tarefas' ? 'Escritório vivo' : VISTAS.find(v => v.id === id)?.nome ?? id}<span aria-hidden="true">↗</span></button>)}
              {area.id === 'inicio' && <button type="button" onClick={() => { setGrupo(null); const url = new URL(window.location.href); url.searchParams.set('interface', 'classica'); url.hash = '#/tarefas'; window.location.assign(url.href) }}>Visões clássicas do escritório <span aria-hidden="true">↗</span></button>}
            </div>}
          </div>)}
        </nav>
        <div className="nx-search-wrap">
          <button type="button" className="nx-search-trigger" onClick={() => { setGrupo(null); setPesquisaAberta(v => !v) }} aria-label="Buscar área da operação" aria-expanded={pesquisaAberta}>⌕ <span>Buscar área</span></button>
          {pesquisaAberta && <div className="nx-search-panel"><label htmlFor="nx-area-search">Localizar uma área existente</label><input ref={searchRef} id="nx-area-search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Financeiro, agentes, cofre…" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setPesquisaAberta(false) } }} /><div>{resultados.map(vista => <button type="button" key={vista.id} onClick={() => abrir(vista.id)}>{vista.nome} <span>↗</span></button>)}{!resultados.length && <p>Nenhuma área encontrada.</p>}</div></div>}
        </div>
      </header>
      {instrumentos && <div className="nx-instruments">{instrumentos(() => setPesquisaAberta(true))}</div>}
      {avisos && <div className="nx-warnings" role="region" aria-label="Avisos da fonte de dados">{avisos}</div>}
      <div className="nx-stage">
        <div ref={cenarioRef} className="nx-environment" aria-hidden={aberto ? true : undefined}>
          <nav className="nx-architecture" aria-label="Estações integradas ao escritório">
            <div className="nx-wall-inscription"><span>CT</span><strong>OPERAÇÃO<br />EM MOVIMENTO</strong></div>
            {AREAS_NUCLEO.filter(area => area.id !== 'inicio').map((area, i) => <button type="button" className={`nx-station${areaAtual?.id === area.id ? ' nx-station-active' : ''}`} key={area.id} onClick={() => abrir(area.vistas[0])} title={area.estacao}><span className="nx-station-number">0{i + 1}</span><span aria-hidden="true" className="nx-station-icon">{area.sinal}</span><strong>{area.nome}</strong><small>{area.estacao}</small></button>)}
            {adicionais.map(v => <button type="button" className="nx-station" key={v.id} onClick={() => abrir(v.id)}><strong>{v.nome}</strong></button>)}
          </nav>
          <div className="nx-office-slot" data-testid="persistent-office">{escritorio}</div>
        </div>
        {aberto && <div className="nx-module-layer">
          <button className="nx-module-backdrop" type="button" tabIndex={-1} aria-label="Voltar ao escritório" onClick={voltar} />
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="nx-module-title" tabIndex={-1} className="nx-module" data-testid="integrated-module">
            <header className="nx-module-header"><div><span className="nx-eyebrow">CT / {areaAtual?.estacao ?? 'Operação'}</span><h1 id="nx-module-title">{titulo}</h1></div><button className="nx-close" type="button" onClick={voltar}>Voltar ao escritório <span aria-hidden="true">×</span></button></header>
            <main className="nx-module-body" ref={areaRef}>{children}</main>
            <footer className="nx-module-footer">Módulo integrado · dados, filtros e ações da área original preservados.</footer>
          </section>
        </div>}
      </div>
      <footer className="nx-footer"><span>CT <b>CASAL DO TRÁFEGO</b></span><span>Um escritório. Toda a operação.</span><button type="button" onClick={() => { const url = new URL(window.location.href); url.searchParams.set('interface', 'classica'); window.location.assign(url.href) }}>Interface clássica ↗</button></footer>
    </div>
  )
}
