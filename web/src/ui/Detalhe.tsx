import { Icone } from './Icone'
import { reprovadas } from '../dados/estado'
import { horaGastao, horaUtc, proximosDisparos } from '../dados/cron'
import type { Estado } from '../dados/tipos'
import type { FiltroId } from './Acoes'

const CORES_DONO: Record<string, string> = {
  luana: 'var(--color-lima)',
  renato: 'var(--color-ciano)',
}

export function Detalhe({
  filtro, estado, agora, aoFechar,
}: { filtro: FiltroId; estado: Estado; agora: Date; aoFechar: () => void }) {
  const leituraCron = proximosDisparos(estado.cron.jobs ?? [], agora, 60)
  const titulo: Record<FiltroId, string> = {
    vencido: 'rodadas vencidas',
    reprovadas: 'todas as checagens reprovadas',
    antiga: 'a que está reprovando há mais tempo',
    cron: 'o que dispara sozinho na próxima hora',
    encostados: 'agentes sem uso',
    hoje: 'na bancada nas últimas 24h',
  }

  return (
    <section className="mt-3 rounded-xl border border-lima/25 bg-lima/4 p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="rotulo !text-lima">{titulo[filtro]}</span>
        <span className="h-px flex-1 bg-lima/15" />
        <button
          type="button"
          onClick={aoFechar}
          className="rotulo transition-colors hover:!text-tinta"
        >
          fechar
        </button>
      </div>

      {(filtro === 'reprovadas' || filtro === 'antiga' || filtro === 'vencido') && (
        <ul className="space-y-2">
          {reprovadas(estado).map((f) => (
            <li key={`${f.dono}-${f.o_que}`} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="size-[5px] shrink-0 translate-y-[-2px] rounded-full bg-ambar" />
              <span className="text-[12px] text-tinta">{f.o_que}</span>
              <span className="rotulo shrink-0">{f.dono}</span>
              <span className="h-px min-w-4 flex-1 bg-linha" />
              <span className="rotulo shrink-0">{f.desde?.replace('desde ', '') ?? 'sem data'}</span>
            </li>
          ))}
          {reprovadas(estado).length === 0 && (
            <li className="text-[12px] text-tinta-2">Nenhuma checagem reprovada na última rodada dos dois verificadores.</li>
          )}
        </ul>
      )}

      {filtro === 'cron' && (
        <>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {leituraCron.disparos.map(({ job, primeiro, vezes }) => (
              <li key={job.expressao + job.rotulo} className="flex items-baseline gap-2.5">
                <span
                  className="w-[74px] shrink-0 font-mono text-[11px] tabular-nums"
                  style={{ color: job.dono ? CORES_DONO[job.dono] : 'var(--color-tinta-3)' }}
                >
                  {horaUtc(primeiro)} utc
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-tinta-2" title={job.rotulo}>
                  {job.rotulo}
                </span>
                {vezes > 1 && <span className="rotulo shrink-0">{vezes}x</span>}
              </li>
            ))}
          </ul>
          {leituraCron.ilegiveis.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-vermelho/25 pt-2.5">
              <li className="rotulo !text-vermelho">
                {leituraCron.ilegiveis.length} expressão(ões) que eu não consegui ler, e por isso não
                estão na conta acima
              </li>
              {leituraCron.ilegiveis.map((job) => (
                <li key={job.expressao + job.rotulo} className="flex items-baseline gap-2.5">
                  <span className="w-[110px] shrink-0 font-mono text-[11px] text-vermelho">{job.expressao}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-tinta-2">{job.rotulo}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-lima/15 pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
            Calculado agora a partir das {leituraCron.lidas} expressões que eu consegui ler das{' '}
            {estado.cron.jobs?.length ?? 0} do <span className="font-mono text-tinta-2">crontab -l</span>,
            que roda em {estado.cron.fuso ?? 'fuso não lido'}. Primeira hora daqui: {horaUtc(agora)} utc ={' '}
            {horaGastao(agora)} no fuso do Gastão. Nenhum destes horários está salvo em lugar nenhum.
          </p>
        </>
      )}

      {(filtro === 'encostados' || filtro === 'hoje') && (
        <p className="flex items-center gap-2 text-[12px] text-tinta-2">
          <Icone nome="seta" tamanho={13} />
          A grade abaixo está mostrando só estes agentes. Clique de novo no bloco para ver todos.
        </p>
      )}
    </section>
  )
}
