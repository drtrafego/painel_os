import { useId, useState, type ComponentProps, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { Estado, NoMemoria } from '../dados/tipos'
import type { ModoLayout } from '../telas/Cofre'
import { ColunaAreasCofre } from './ColunaAreasCofre'
import { FichaCofre } from './FichaCofre'

type Props = ComponentProps<typeof ColunaAreasCofre> & ComponentProps<typeof FichaCofre> & {
  fps: number
  cofre: NonNullable<Estado['cofre']>
  termoBusca: string
  setTermoBusca: (termo: string) => void
  nosFiltradosBusca: NoMemoria[]
  modoLayout: ModoLayout
  setModoLayout: (modo: ModoLayout) => void
  animarSinal: boolean
  setAnimarSinal: Dispatch<SetStateAction<boolean>>
  alternarModoComando: () => void
  baixa: boolean
  grafo: ReactNode
}

export function PainelInstrumentoCofre({
  fps, cofre, termoBusca, setTermoBusca, nosFiltradosBusca, modoLayout, setModoLayout,
  animarSinal, setAnimarSinal, alternarModoComando, baixa, grafo,
  areasAbertas, alternarAreasAbertas, areas, areaFoco, setAreaFoco, autores, modoComando,
  atual, areaAtual, familia, truncado, caminho, alvoNo, entram, saem, nome, curto,
  porqueDoSalto, escolher, setAlvo, nos,
}: Props) {
  const [coberturaAberta, setCoberturaAberta] = useState(false)
  const [conferenciaAberta, setConferenciaAberta] = useState(false)
  const coberturaId = useId()
  const conferenciaId = useId()
  const conferir = cofre.vencidos.length > 0 || cofre.recusados.length > 0
    || cofre.truncados.length > 0 || cofre.arestas_recusadas.length > 0
  const divisoria = modoComando ? 'border-sky-500/20' : 'border-linha'
  const secundario = modoComando ? 'text-slate-400' : 'text-tinta-2'
  const indicadores = [
    { rotulo: 'aprendizados', valor: nos.length, nota: cofre.arquivos === null ? undefined : `de ${cofre.arquivos} arquivo(s) de origem` },
    { rotulo: 'ligações', valor: cofre.conexoes, nota: `declaradas na fonte · ${cofre.arestas.filter((a) => a.ponte).length} atravessam áreas` },
    { rotulo: 'grau médio', valor: cofre.grau_medio, nota: 'ligações por aprendizado' },
    { rotulo: 'famílias', valor: cofre.familias.length, nota: `${cofre.areas.length} áreas` },
    { rotulo: 'amarrados', valor: cofre.cobertura === null ? null : `${cofre.cobertura}%`, nota: 'têm ao menos uma ligação', cor: baixa ? (modoComando ? 'text-amber-300' : 'text-ambar') : (modoComando ? 'text-emerald-400' : 'text-verde') },
  ]

  return (
    <div
      className={`carta overflow-hidden transition-colors ${modoComando ? 'border-sky-500/30 text-slate-200' : 'text-tinta'}`}
      style={modoComando ? { background: '#0B0F17' } : undefined}
    >
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 ${divisoria}`}>
        <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold tracking-wider ${modoComando ? 'text-emerald-400' : 'text-verde'}`}>
          <span className="size-1.5 rounded-full bg-current" />
          SISTEMA OPERACIONAL
        </span>
        <span className={`font-mono text-[11px] font-bold ${modoComando ? 'text-sky-400' : 'text-tinta'}`}>
          {fps} <span className={`text-[9px] ${secundario}`}>FPS</span>
        </span>
        <span className={`font-mono text-[10px] ${secundario}`}>
          {nos.length} NÓS VISÍVEIS · {cofre.conexoes} ARESTAS · GRAU MÉDIO {cofre.grau_medio}
        </span>

        <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px]">
          {indicadores.map(({ rotulo, valor, nota, cor }) => (
            <div key={rotulo} data-kpi title={nota} className="flex items-baseline gap-1">
              <dt className={secundario}>{rotulo}</dt>
              <dd className={`text-xs font-semibold tabular-nums ${cor ?? ''}`} title={valor === null ? 'não há registro deste número' : undefined}>
                {valor === null ? '—' : typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}
              </dd>
            </div>
          ))}
        </dl>

        {baixa && (
          <button
            type="button"
            aria-expanded={coberturaAberta}
            aria-controls={coberturaId}
            onClick={() => setCoberturaAberta((aberta) => !aberta)}
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${modoComando ? 'border-amber-400/30 bg-amber-400/10 text-amber-300' : 'border-ambar/30 bg-ambar/8 text-ambar'}`}
          >
            ⚠ cobertura {cofre.cobertura}% {coberturaAberta ? '▴' : '▾'}
          </button>
        )}
        {conferir && (
          <button
            type="button"
            aria-expanded={conferenciaAberta}
            aria-controls={conferenciaId}
            onClick={() => setConferenciaAberta((aberta) => !aberta)}
            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${modoComando ? 'border-red-400/30 bg-red-400/10 text-red-300' : 'border-vermelho/30 bg-vermelho/8 text-vermelho'}`}
          >
            ⚠ {cofre.vencidos.length > 0
              ? `${cofre.vencidos.length} ${cofre.vencidos.length === 1 ? 'âncora vencida' : 'âncoras vencidas'}`
              : 'conferência pendente'} {conferenciaAberta ? '▴' : '▾'}
          </button>
        )}

        {/* Resultados no fluxo da faixa: nunca encobrem o canvas nem capturam seu arrasto. */}
        <div className="ml-auto min-w-0 flex-[1_1_220px] sm:max-w-xs">
          <input
            type="text"
            aria-label="Buscar nó, autor ou caso"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder="🔍 Buscar nó, autor ou caso..."
            className={`w-full rounded border px-3 py-1 font-mono text-[11px] outline-none transition-colors ${modoComando
              ? 'border-sky-500/40 bg-slate-900/90 text-slate-100 placeholder-slate-500 focus:border-sky-400'
              : 'border-linha bg-white/80 text-tinta placeholder-tinta-3 focus:border-linha-forte'}`}
          />
          {nosFiltradosBusca.length > 0 && (
            <ul className={`mt-1 max-h-48 overflow-y-auto rounded border p-1 ${modoComando ? 'border-sky-500/40 bg-slate-900 text-slate-200' : 'border-linha bg-carta text-tinta'}`}>
              {nosFiltradosBusca.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => { escolher(n.id); setTermoBusca('') }}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] ${modoComando ? 'hover:bg-white/10' : 'hover:bg-linha/30'}`}
                  >
                    <span className="truncate font-medium">{n.rotulo}</span>
                    <span className="shrink-0 font-mono text-[9px] opacity-70">{n.area}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {baixa && coberturaAberta && (
          <div id={coberturaId} data-cobertura-baixa className={`basis-full text-[11px] leading-relaxed ${modoComando ? 'text-amber-200' : 'text-tinta-2'}`}>
            <span className="font-mono uppercase tracking-[.16em]">Cobertura baixa.</span> Só {cofre.cobertura}% dos aprendizados estão amarrados a algum outro. O mapa mostra essa lacuna, não completa por semelhança.
          </div>
        )}
        {conferir && conferenciaAberta && (
          <div id={conferenciaId} data-cofre-vencidos className={`basis-full text-[11px] leading-relaxed ${modoComando ? 'text-red-200' : 'text-tinta-2'}`}>
            <span className="font-mono uppercase tracking-[.16em]">Conferência.</span>{' '}
            {cofre.vencidos.length > 0 && `${cofre.vencidos.length} registro(s) com âncora que não confere mais na fonte; ficam no mapa em traço interrompido. `}
            {cofre.recusados.length > 0 && `${cofre.recusados.length} registro(s) recusado(s) na leitura. `}
            {cofre.truncados.length > 0 && `${cofre.truncados.length} bloco(s) bateram no teto de 60 linhas. `}
            {cofre.arestas_recusadas.length > 0 && `${cofre.arestas_recusadas.length} ligação(ões) declarada(s) e recusada(s).`}
          </div>
        )}
      </div>

      <div className={`grid transition-[grid-template-columns] duration-200 ${areasAbertas ? 'lg:grid-cols-[168px_minmax(0,1fr)_400px]' : 'lg:grid-cols-[40px_minmax(0,1fr)_400px]'}`}>
        {/* Só as cartas externas dos componentes dockados perdem sua moldura. */}
        <div className={`min-w-0 border-b lg:border-r lg:border-b-0 lg:h-[680px] lg:overflow-y-auto ${divisoria} [&>aside]:rounded-none [&>aside]:border-0 [&>aside]:[background:none]`}>
          <ColunaAreasCofre
            areasAbertas={areasAbertas} alternarAreasAbertas={alternarAreasAbertas}
            areas={areas} areaFoco={areaFoco} setAreaFoco={setAreaFoco}
            autores={autores} modoComando={modoComando}
          />
        </div>
        {/* A casca também coloca os controles de zoom legados do Mapa no fluxo normal. */}
        <section className="min-w-0 overflow-hidden p-3 [&>div>div:has(>button)]:static [&>div>div:has(>button)]:m-2 [&>div>div:has(>button)]:w-fit">
          {grafo}
        </section>
        <div className={`min-w-0 border-t lg:border-t-0 lg:border-l lg:h-[680px] lg:overflow-y-auto ${divisoria} [&>aside]:rounded-none [&>aside]:border-0 [&>aside]:[background:none]`}>
          <FichaCofre
            atual={atual} areaAtual={areaAtual} familia={familia} truncado={truncado}
            caminho={caminho} alvoNo={alvoNo} entram={entram} saem={saem}
            nome={nome} curto={curto} porqueDoSalto={porqueDoSalto}
            escolher={escolher} setAlvo={setAlvo} modoComando={modoComando} nos={nos}
          />
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-2 border-t px-3 py-2 font-mono text-[10px] ${divisoria}`}>
        <div role="group" aria-label="Modo de layout" className={`flex flex-wrap items-center rounded border p-0.5 ${divisoria}`}>
          {(['multi-anel', 'orbita', 'hierarquia'] as ModoLayout[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={modoLayout === m}
              onClick={() => setModoLayout(m)}
              className={`rounded px-2 py-0.5 capitalize transition-colors ${modoLayout === m
                ? (modoComando ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-lima/30 text-tinta font-bold')
                : 'opacity-70 hover:opacity-100'}`}
            >
              {m === 'multi-anel' ? '2D Multi-Anel' : m === 'orbita' ? 'Órbita' : 'Camadas'}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={animarSinal}
          onClick={() => setAnimarSinal((a) => !a)}
          className={`rounded border px-2 py-1 transition-colors ${animarSinal
            ? (modoComando ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-semibold' : 'border-verde/40 bg-verde/10 text-verde font-semibold')
            : 'border-linha/40 opacity-60'}`}
        >
          {animarSinal ? '⚡ Sinal: ON' : '⚡ Sinal: OFF'}
        </button>
        <button
          type="button"
          aria-pressed={modoComando}
          onClick={alternarModoComando}
          className={`ml-auto rounded border px-2.5 py-1 font-bold transition-colors ${modoComando
            ? 'border-sky-400/40 bg-sky-500/10 text-sky-300'
            : 'border-linha bg-carta-forte text-tinta'}`}
        >
          {modoComando ? '🌙 Modo Comando (Dark)' : '☀️ Modo Sépia'}
        </button>
      </div>
    </div>
  )
}
