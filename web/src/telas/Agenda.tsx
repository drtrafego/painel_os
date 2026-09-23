import { Cabecalho, Kpi, TituloDaTela } from '../ui/primitivos'
import { Parcial } from '../ui/SemDado'
import { horaGastao, horaUtc, proximosDisparos } from '../dados/cron'
import { IDENTIDADE } from '../ui/paleta'
import type { Vista } from '../nav/rotas'
import type { Estado } from '../dados/tipos'

const COR_DONO: Record<string, string> = { luana: IDENTIDADE.lima, renato: IDENTIDADE.agua }

/**
 * AGENDA.
 *
 * A tela une crontab, agenda de conteúdo e um snapshot agregado do Calendar.
 * Continua `parcial`: evento agendado não prova presença nem reunião ocorrida.
 *
 * ⚠️ Nao ha frame de referencia para esta tela: das 11, seis nunca aparecem em
 * nenhuma imagem, e Agenda e uma delas. Entao aqui esta a estrutura com o dado
 * que existe, e nao uma imitacao de um desenho que ninguem viu.
 *
 * ‼️ O QUE NAO DA PRA LER NAO SOME DA CONTA. Expressao de cron que o parser nao
 * entende aparece numa lista separada, com o texto dela. Sem isso, "12 na
 * proxima hora" quer dizer "12 das que eu consegui ler", que e outra frase.
 */
export function Agenda({ estado, agora, vista }: { estado: Estado; agora: Date; vista: Vista }) {
  const horas = 12
  const { disparos, ilegiveis, lidas } = proximosDisparos(estado.cron.jobs ?? [], agora, horas * 60)
  const total = disparos.reduce((n, d) => n + d.vezes, 0)
  const pecasErro = estado.pecas?.erro ?? (!estado.pecas ? 'o estado não trouxe a fonte de conteúdo' : null)
  const calendario = estado.calendario
  const calendarioErro = calendario?.erro ?? (!calendario ? 'o estado não trouxe o snapshot do calendário' : null)
  const publicacoes = (estado.pecas?.lista ?? [])
    .filter((p) => p.status === 'agendado' && p.agendado_para)
    .map((p) => {
      const m = p.agendado_para?.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/)
      return m ? { n: p.n, data: m[1], hora: m[2], canal: m[3] } : null
    })
    .filter((p): p is { n: number; data: string; hora: string; canal: string } => p !== null)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`))

  const porHora = new Map<string, typeof disparos>()
  for (const d of disparos) {
    const chave = horaUtc(d.primeiro).slice(0, 2)
    const lista = porHora.get(chave) ?? []
    lista.push(d)
    porHora.set(chave, lista)
  }

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela
        titulo="O que roda sozinho."
        pergunta={vista.pergunta}
        direita={
          <span className="rotulo">
            crontab em {estado.cron.fuso ?? 'fuso não lido'} · agora {horaUtc(agora)} utc ={' '}
            {horaGastao(agora)} no fuso do Gastão
          </span>
        }
      />
      <Parcial dado={vista.dado} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo={`disparos nas próximas ${horas}h`} valor={total} nota={`${disparos.length} tarefa(s) distinta(s)`} />
        <Kpi rotulo="expressões no crontab" valor={estado.cron.jobs?.length ?? null} nota={`${lidas} que eu consigo ler`} />
        <Kpi
          rotulo="que eu não sei ler"
          valor={ilegiveis.length}
          cor={ilegiveis.length ? 'text-vermelho' : 'text-tinta'}
          nota={ilegiveis.length ? 'estão listadas abaixo, fora da conta' : 'todas foram lidas'}
        />
        <Kpi rotulo="publicações programadas" valor={pecasErro ? null : publicacoes.length} nota={pecasErro ?? 'status agendado no posts.json'} />
        <Kpi rotulo="eventos no calendário" valor={calendarioErro || calendario?.vencido ? null : calendario?.totais?.eventos_agendados ?? null} nota={calendarioErro ?? (calendario?.vencido ? 'snapshot vencido há mais de 24h' : 'janela agregada e sem dados pessoais')} />
      </div>

      <section className="carta mt-4 p-4" data-agenda-publicacoes>
        <Cabecalho cor="var(--color-ciano)" meta={pecasErro ? 'fonte indisponível' : `${publicacoes.length} na fila`}>publicações programadas</Cabecalho>
        {pecasErro ? <p className="text-[12px] leading-relaxed text-tinta-2">{pecasErro}. A ausência não vira zero.</p> : publicacoes.length ? <div className="space-y-2">{publicacoes.map((p) => <div key={`${p.n}-${p.data}-${p.hora}`} className="flex items-baseline gap-3 rounded-lg border border-linha bg-white/[0.018] px-3 py-2.5"><span className="font-mono text-[11px] tabular-nums text-ciano">{p.data.split('-').reverse().join('/')} · {p.hora}</span><span className="min-w-0 flex-1 truncate text-[12px] text-tinta-2">{p.canal}</span><span className="rotulo shrink-0">peça {p.n}</span></div>)}</div> : <p className="text-[12px] leading-relaxed text-tinta-2">Nenhuma publicação está com status agendado no posts.json. Aqui zero é medido, porque a fonte foi lida.</p>}
        <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">Isto mede programação de conteúdo, não publicação ocorrida. “Postado” é outro estado e não entra nesta fila.</p>
      </section>

      <section className="carta mt-3 p-4" data-agenda-calendario>
        <Cabecalho cor="var(--color-lima)" meta={calendarioErro ? 'fonte indisponível' : 'Google Calendar primário, agregado'}>compromissos agendados</Cabecalho>
        {calendarioErro || calendario?.vencido || !calendario?.totais || !calendario.janela ? (
          <p className="text-[12px] leading-relaxed text-tinta-2">{calendarioErro ?? (calendario?.vencido ? 'O snapshot passou de 24 horas e foi retirado da contagem' : 'snapshot incompleto')}. A ausência não vira zero.</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-linha bg-white/[0.018] p-3"><div className="rotulo">na janela</div><div className="mt-1 font-mono text-xl text-tinta">{calendario.totais.eventos_agendados}</div><div className="text-[10.5px] text-tinta-3">eventos agendados</div></div>
              <div className="rounded-lg border border-linha bg-white/[0.018] p-3"><div className="rotulo">futuros na coleta</div><div className="mt-1 font-mono text-xl text-lima">{calendario.totais.eventos_futuros_na_coleta}</div><div className="text-[10.5px] text-tinta-3">horários ainda por começar</div></div>
              <div className="rounded-lg border border-linha bg-white/[0.018] p-3"><div className="rotulo">reuniões ocorridas</div><div className="mt-1 font-mono text-xl text-tinta-3">—</div><div className="text-[10.5px] text-tinta-3">sem prova de presença</div></div>
            </div>
            <div className="mt-3 space-y-1.5">
              {calendario.dias.map((dia) => <div key={dia.data} className="flex items-center gap-3 rounded-lg border border-linha px-3 py-2"><span className="w-[76px] font-mono text-[11px] text-tinta-2">{dia.data.split('-').reverse().join('/')}</span><span className="min-w-0 flex-1 text-[11.5px] text-tinta-2">{dia.eventos_agendados} evento(s), {dia.minutos_agendados} min reservados</span><span className="rotulo shrink-0">{dia.futuros_na_coleta} futuro(s)</span></div>)}
            </div>
            <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">Janela: {calendario.janela.inicio.slice(0, 10).split('-').reverse().join('/')} a {calendario.janela.fim.slice(0, 10).split('-').reverse().join('/')} no fuso de São Paulo. Títulos, participantes, descrições, locais, links e identificadores foram descartados antes de chegar ao painel.</p>
          </>
        )}
        <p className="mt-2.5 text-[11px] leading-relaxed text-tinta-2">Horário encerrado mede somente a passagem do relógio. Evento criado continua sendo agendamento; reunião ocorrida só contará quando houver prova independente de presença.</p>
      </section>

      <section className="carta mt-4 p-4">
        <Cabecalho meta={`${disparos.length} na fila`}>as próximas {horas} horas</Cabecalho>
        {disparos.length === 0 ? (
          <p className="text-[12px] leading-[1.55] text-tinta-2">
            Nada dispara nas próximas {horas} horas. Isso é o resultado de ler {lidas} expressões,
            não a ausência de leitura: as que não deram para ler estão contadas à parte.
          </p>
        ) : (
          <div className="space-y-3">
            {[...porHora.entries()].map(([h, lista]) => (
              <div key={h}>
                <div className="mb-1.5 flex items-baseline gap-2.5">
                  <span className="font-mono text-[11px] text-tinta-2">{h}:00 utc</span>
                  <span className="h-px flex-1 bg-linha" />
                  <span className="rotulo">{lista.length}</span>
                </div>
                <ul className="space-y-1">
                  {lista.map(({ job, primeiro, vezes }) => (
                    <li key={job.expressao + job.rotulo} className="flex items-baseline gap-2.5">
                      <span
                        className="h-2.5 w-[2px] shrink-0 translate-y-[2px] rounded-full"
                        style={{ background: job.dono ? COR_DONO[job.dono] : 'var(--color-tinta-3)' }}
                      />
                      <span className="w-[68px] shrink-0 font-mono text-[11px] tabular-nums text-tinta-2">
                        {horaGastao(primeiro)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-tinta-2" title={job.rotulo}>
                        {job.rotulo}
                      </span>
                      {vezes > 1 && <span className="rotulo shrink-0">{vezes}x</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
          A hora da esquerda está no fuso do Gastão; o agrupamento é por hora UTC, que é como o
          servidor pensa. Hora sem fuso é palpite, então os dois aparecem. Nada disto está salvo:
          é calculado na abertura a partir do crontab.
        </p>
      </section>

      {ilegiveis.length > 0 && (
        <section className="mt-3 rounded-xl border border-vermelho/30 bg-vermelho/6 p-4">
          <Cabecalho cor="var(--color-vermelho)" meta={`${ilegiveis.length}`}>
            expressões que eu não consegui ler
          </Cabecalho>
          <ul className="space-y-1">
            {ilegiveis.map((job) => (
              <li key={job.expressao + job.rotulo} className="flex flex-wrap items-baseline gap-2.5">
                <span className="font-mono text-[11px] text-vermelho">{job.expressao}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-tinta-2">{job.rotulo}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-relaxed text-tinta-2">
            Estas não entram na contagem acima, e é de propósito que elas apareçam: uma expressão
            que some calada faz o total mentir para menos sem ninguém notar.
          </p>
        </section>
      )}
    </div>
  )
}
