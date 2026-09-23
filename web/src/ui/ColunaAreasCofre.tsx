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
    <aside className={`carta transition-colors ${areasAbertas ? 'p-3.5' : 'p-1.5'} ${modoComando ? 'bg-[#0B0F17]/90 border-sky-500/30' : ''}`}>
      <button
        type="button"
        data-toggle-areas
        onClick={alternarAreasAbertas}
        title={areasAbertas ? 'recolher áreas' : 'expandir áreas'}
        className={`flex w-full items-center rounded-md py-1 text-[10px] font-mono uppercase tracking-[.14em] opacity-80 hover:opacity-100 ${areasAbertas ? 'justify-between px-1' : 'justify-center'}`}
      >
        {areasAbertas ? <><span>áreas</span><span>{areaFoco ? 'filtrando' : '«'}</span></> : <span>»</span>}
      </button>

      {areasAbertas ? (
        <>
          <ul className="space-y-1">
            {areas.map((a) => {
              const fixa = a.sempre_visivel === true || a.id === 'transversal'
              const so = areaFoco === a.id
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    data-filtro-area={fixa ? undefined : ''} data-area={a.id}
                    aria-pressed={so}
                    disabled={fixa}
                    title={fixa ? 'transversal nunca é filtrada' : so ? 'mostrar o mapa inteiro' : 'ver só esta área'}
                    onClick={() => !fixa && setAreaFoco(so ? null : a.id)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors duration-200 ${so ? 'border-lima/45 bg-lima/10' : 'border-transparent hover:border-linha'} ${fixa ? 'cursor-default opacity-90' : ''}`}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: (modoComando ? corDaAreaEscuro : corDaArea)(a.id) }} />
                    <span className="min-w-0 flex-1 truncate text-[11px]">{a.nome}</span>
                    <span className="font-mono text-[10px] opacity-70">{a.total}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 font-mono text-[9px] leading-relaxed opacity-70">
            Clique numa área para ver só ela. Transversal fica sempre e pontes mantêm anéis vazados.
          </p>

          <div className="mt-4 border-t border-linha pt-3">
            <Cabecalho cor="var(--color-ciano)">quem aprendeu</Cabecalho>
            <ul className="space-y-1">
              {autores.map(([quem, quantos]) => (
                <li key={quem} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[11px]">{quem}</span>
                  <span className="font-mono text-[10px] opacity-70">{quantos}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {areas.map((a) => {
            const so = areaFoco === a.id
            const fixa = a.sempre_visivel === true || a.id === 'transversal'
            return (
              <li key={a.id}>
                <button
                  type="button"
                  data-filtro-area-recolhido data-area={a.id}
                  aria-pressed={so}
                  disabled={fixa}
                  title={`${a.nome} · ${a.total}`}
                  onClick={() => !fixa && setAreaFoco(so ? null : a.id)}
                  className={`mx-auto flex size-5 items-center justify-center rounded-full border transition-colors ${so ? 'border-lima/60' : 'border-transparent hover:border-linha'}`}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: (modoComando ? corDaAreaEscuro : corDaArea)(a.id) }} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
