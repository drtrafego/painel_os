import { corDaArea, corDaAreaEscuro } from '../dados/cofre'
import type { Estado } from '../dados/tipos'
import { Cabecalho } from './primitivos'

export function ColunaAreasCofre(props: {
  areasAbertas: boolean
  alternarAreasAbertas: () => void
  areas: NonNullable<Estado['cofre']>['areas']
  areaFoco: string | null
  setAreaFoco: (id: string | null) => void
  autores: [string, number][]
  modoComando: boolean
}) {
  const {
    areasAbertas, alternarAreasAbertas, areas, areaFoco, setAreaFoco, autores, modoComando,
  } = props

  return (
    <aside className={`carta transition-colors ${areasAbertas ? 'p-3.5' : 'p-2'} ${modoComando ? 'bg-[#0B0F17]/90 border-sky-500/30' : ''}`}>
      {/* Botão de alternar expansão no desktop / Cabeçalho */}
      <div className="flex items-center justify-between gap-2 border-b border-linha/60 pb-2 mb-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {areasAbertas ? 'Filtro por Áreas' : 'Áreas'}
        </span>
        <button
          type="button"
          data-toggle-areas
          onClick={alternarAreasAbertas}
          title={areasAbertas ? 'recolher áreas' : 'expandir áreas'}
          className="rounded border border-linha px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-linha-forte hover:bg-white/5"
        >
          {areasAbertas ? '« recolher' : 'expandir »'}
        </button>
      </div>

      {/* Lista Expandida / Lista de Chips no Mobile e Desktop */}
      {areasAbertas ? (
        <>
          <ul className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
            {areas.map((a) => {
              const fixa = a.sempre_visivel === true || a.id === 'transversal'
              const so = areaFoco === a.id
              const cor = (modoComando ? corDaAreaEscuro : corDaArea)(a.id)
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    data-filtro-area={fixa ? undefined : ''}
                    data-area={a.id}
                    aria-pressed={so}
                    disabled={fixa}
                    title={fixa ? 'transversal nunca é filtrada' : so ? 'mostrar o mapa inteiro' : 'ver só esta área'}
                    onClick={() => !fixa && setAreaFoco(so ? null : a.id)}
                    className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                      so
                        ? 'border-lima/60 bg-lima/15 font-bold text-white ring-1 ring-lima'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-600 text-slate-200'
                    } ${fixa ? 'cursor-default opacity-85' : ''}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full shadow-sm" style={{ background: cor }} />
                    <span className="min-w-0 flex-1 truncate text-xs">{a.nome}</span>
                    <span className="font-mono text-[10.5px] opacity-75 font-semibold">{a.total}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 border-t border-linha pt-3">
            <Cabecalho cor="var(--color-ciano)">quem aprendeu</Cabecalho>
            <ul className="mt-2 space-y-1 max-h-36 overflow-y-auto pr-1">
              {autores.map(([quem, quantos]) => (
                <li key={quem} className="flex items-center justify-between gap-2 text-xs py-0.5">
                  <span className="min-w-0 flex-1 truncate text-slate-300">{quem}</span>
                  <span className="font-mono text-[10px] text-slate-400 font-bold">{quantos}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        /* Barra de Chips / Botões Confortáveis (>= 44px touch) */
        <div className="flex flex-wrap lg:flex-col gap-1.5 overflow-x-auto py-1">
          {areas.map((a) => {
            const so = areaFoco === a.id
            const fixa = a.sempre_visivel === true || a.id === 'transversal'
            const cor = (modoComando ? corDaAreaEscuro : corDaArea)(a.id)
            return (
              <button
                key={a.id}
                type="button"
                data-filtro-area-recolhido
                data-area={a.id}
                aria-pressed={so}
                disabled={fixa}
                title={`${a.nome} (${a.total} aprendizados)`}
                onClick={() => !fixa && setAreaFoco(so ? null : a.id)}
                className={`flex min-h-[38px] lg:min-h-[44px] items-center gap-2 rounded-lg border px-2.5 py-1 text-left transition-all ${
                  so
                    ? 'border-lima/60 bg-lima/20 text-white font-bold'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-600 text-slate-300'
                }`}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: cor }} />
                <span className="truncate text-[11px] max-w-[120px]">{a.nome}</span>
                <span className="font-mono text-[10px] opacity-70 font-semibold">({a.total})</span>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}
