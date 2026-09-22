import { useAgentesVivos } from '../dados/useAgentesVivos'
import type { PropsTela } from './Vazias'

const STATUS: [string, string][] = [['todo', 'a fazer'], ['doing', 'em andamento'], ['waiting', 'aguardando'], ['backlog', 'backlog']]
const PRAZOS: [string, string][] = [['atrasadas', 'atrasadas'], ['hoje', 'vencem hoje'], ['proximos_7_dias', 'próximos 7 dias'], ['depois', 'depois'], ['sem_prazo', 'sem prazo']]
const MOVIMENTO: [string, string][] = [['ultimos_7_dias', 'movidas nos últimos 7 dias'], ['entre_7_e_30_dias', 'sem movimento de 7 a 30 dias'], ['sem_atualizacao_30_dias', 'sem movimento há 30 dias']]

export function Tarefas({ estado, vista }: PropsTela) {
  const dados = estado.tarefas
  const { dados: vivos, carregando: carregandoVivos } = useAgentesVivos()
  const erro = dados?.erro ?? (!dados ? 'a medição de tarefas não veio no estado atual' : null)
  const ativos = vivos?.contagem?.trabalhando ?? 0
  const listaVivos = vivos?.agentes?.filter((a) => a.estado === 'trabalhando' || a.estado === 'silencioso') ?? []

  return (
    <div className="mx-auto max-w-[1240px] space-y-5 px-4 py-5 font-mono sm:px-6">
      {/* Visual Header com Estilo Retro Pixel Art */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-4 border-black bg-[#1e293b] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-4 bg-[#a3e635] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" />
            <h1 className="text-xl font-black uppercase tracking-wider text-[#facc15]">
              [ 👾 TAREFAS GTD ]
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {vista.pergunta}
          </p>
        </div>
        <div className="shrink-0 border-2 border-black bg-[#0f172a] px-3 py-1.5 text-[11px] text-[#38bdf8] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          {dados?.coletado_em ? `SYNC: ${new Date(dados.coletado_em).toLocaleString('pt-BR')}` : 'OFFLINE'}
        </div>
      </div>

      {/* Sonda PixelArt dos Agentes ao Vivo */}
      <section className="border-4 border-black bg-[#0f172a] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black pb-3">
          <div className="flex items-center gap-2">
            <span className={`size-3 border border-black ${ativos > 0 ? 'bg-[#a3e635] animate-pulse' : 'bg-slate-600'}`} />
            <span className="font-extrabold uppercase tracking-widest text-[#a3e635] text-xs">
              ⚡ SONDA DE AGENTES AO VIVO NA TAREFA
            </span>
          </div>
          <span className="border border-black bg-[#1e293b] px-2 py-0.5 text-[10px] text-slate-300">
            {carregandoVivos ? 'CONSULTANDO...' : vivos?.ok ? `${vivos.contagem?.vivos ?? 0} VIVOS (${ativos} EXEC)` : 'SONDA OFF'}
          </span>
        </div>

        {listaVivos.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listaVivos.map((ag) => (
              <div key={ag.id} className="border-2 border-black bg-[#1e293b] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-bold text-[#38bdf8] text-xs uppercase">{ag.id}</span>
                    <span className={`border border-black px-1.5 py-0.5 text-[9px] font-bold uppercase ${ag.estado === 'trabalhando' ? 'bg-[#a3e635] text-black' : 'bg-[#facc15] text-black'}`}>
                      {ag.estado === 'trabalhando' ? 'EXEC' : 'SILENT'}
                    </span>
                  </div>
                  <div className="mt-2 border-l-2 border-[#38bdf8] pl-2 text-[11px] text-slate-200 line-clamp-2" title={ag.etapa_e_description ?? ag.etapa}>
                    {ag.etapa ?? 'ETAPA EM ANDAMENTO'}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-700 pt-2 text-[10px] text-slate-400">
                  <span>{ag.ferramenta ? `TOOL: ${ag.ferramenta}` : ag.fase}</span>
                  <span>{ag.silencio_s !== null && ag.silencio_s !== undefined ? `${ag.silencio_s}s` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 border-2 border-dashed border-slate-700 p-3 text-center text-xs text-slate-400">
            Nenhum agente em execução ativa neste instante. Monitorando transcripts e processos a cada 10s.
          </p>
        )}
      </section>

      {erro ? (
        <section className="border-4 border-black bg-[#450a0a] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]" data-erro-tarefas>
          <div className="flex items-center gap-2 text-[#f87171] font-bold text-sm uppercase">
            <span>⚠ FONTE INCOMPLETA</span>
          </div>
          <p className="mt-2 text-xs text-slate-200">{erro}</p>
          <p className="mt-2 text-[11px] text-slate-400">Nenhuma contagem parcial virou zero. A carteira reaparece quando a API responder.</p>
        </section>
      ) : (
        <>
          {dados?.truncado && (
            <div className="border-2 border-black bg-[#451a03] p-3 text-xs text-[#fbbf24] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              ⚠️ Limite de 200 itens atingido num estado. Os números exibidos representam contagens mínimas.
            </div>
          )}

          {/* Grid de KPIs com Estilo Pixel Cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PixelKpi rotulo="TAREFAS ABERTAS" valor={dados?.total_abertas} cor="text-[#facc15]" nota="carteira GTD total" />
            <PixelKpi rotulo="EM ANDAMENTO" valor={dados?.por_status.doing} cor="text-[#38bdf8]" nota="executando" />
            <PixelKpi rotulo="ATRASADAS" valor={dados?.por_prazo.atrasadas} cor={(dados?.por_prazo.atrasadas ?? 0) > 0 ? 'text-[#f87171]' : 'text-slate-200'} nota="requer atenção" />
            <PixelKpi rotulo="SEM PRAZO" valor={dados?.por_prazo.sem_prazo} cor="text-[#fbbf24]" nota="não agendadas" />
          </div>

          {/* Painéis Secundários */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="border-4 border-black bg-[#1e293b] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                <span className="font-bold text-xs uppercase text-[#a3e635]">[ ESTADO DA CARTEIRA ]</span>
                <span className="border border-black bg-[#0f172a] px-2 py-0.5 text-[10px] text-slate-300">{dados?.total_abertas}</span>
              </div>
              <div className="space-y-3">
                {STATUS.map(([chave, nome]) => (
                  <PixelLinha key={chave} nome={nome} valor={dados?.por_status[chave]} total={dados?.total_abertas} cor="bg-[#38bdf8]" />
                ))}
              </div>
            </section>

            <section className="border-4 border-black bg-[#1e293b] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                <span className="font-bold text-xs uppercase text-[#facc15]">[ PRESSÃO DE PRAZO ]</span>
              </div>
              <div className="space-y-3">
                {PRAZOS.map(([chave, nome]) => (
                  <PixelLinha key={chave} nome={nome} valor={dados?.por_prazo[chave]} total={dados?.total_abertas} cor={chave === 'atrasadas' ? 'bg-[#f87171]' : 'bg-[#facc15]'} />
                ))}
              </div>
            </section>

            <section className="border-4 border-black bg-[#1e293b] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
                  <span className="font-bold text-xs uppercase text-[#38bdf8]">[ MOVIMENTO CADASTRO ]</span>
                </div>
                <div className="space-y-3">
                  {MOVIMENTO.map(([chave, nome]) => (
                    <PixelLinha key={chave} nome={nome} valor={dados?.por_movimento[chave]} total={dados?.total_abertas} cor="bg-[#a3e635]" />
                  ))}
                </div>
              </div>
              <p className="mt-4 border-t border-slate-700 pt-2 text-[10px] text-slate-400">
                Mede a última alteração do registro no sistema GTD.
              </p>
            </section>
          </div>

          {/* Carga por Projeto */}
          <section className="border-4 border-black bg-[#1e293b] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-3">
              <span className="font-bold text-xs uppercase text-[#a3e635]">[ CARGA POR PROJETO ]</span>
              <span className="border border-black bg-[#0f172a] px-2 py-0.5 text-[10px] text-slate-300">{dados?.por_projeto.length ?? 0} PROJETOS</span>
            </div>
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {dados?.por_projeto.map((p) => (
                <PixelLinha key={p.projeto} nome={p.projeto} valor={p.total} total={dados.total_abertas} cor="bg-[#c084fc]" />
              ))}
            </div>
            <p className="mt-4 border-t border-slate-700 pt-2 text-[10.5px] text-slate-400">
              Estoque de tarefas abertas por projeto no gerenciador GTD. Títulos e dados sensíveis são omitidos por segurança.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

function PixelKpi({ rotulo, valor, cor = 'text-white', nota }: { rotulo: string; valor?: number | null; cor?: string; nota?: string }) {
  return (
    <div className="border-4 border-black bg-[#0f172a] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{rotulo}</div>
      <div className={`mt-1 text-2xl font-black ${cor}`}>{valor ?? '—'}</div>
      {nota && <div className="mt-1 text-[9px] text-slate-500">{nota}</div>}
    </div>
  )
}

function PixelLinha({ nome, valor, total, cor = 'bg-[#a3e635]' }: { nome: string; valor?: number; total?: number | null; cor?: string }) {
  const fracao = total && valor !== undefined ? Math.min(100, (valor / total) * 100) : 0
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs">
      <span className="truncate text-slate-200 uppercase">{nome}</span>
      <span className="font-bold tabular-nums text-white">{valor ?? '—'}</span>
      <div className="col-span-2 h-2.5 border border-black bg-[#0f172a] p-0.5">
        <div className={`h-full ${cor}`} style={{ width: `${fracao}%` }} />
      </div>
    </div>
  )
}

