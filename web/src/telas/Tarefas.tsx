import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
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

  return <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
    <TituloDaTela titulo="Tarefas." pergunta={vista.pergunta} direita={<span className="rotulo">{dados?.coletado_em ? `medido ${new Date(dados.coletado_em).toLocaleString('pt-BR')}` : 'medição indisponível'}</span>} />

    {/* Sonda dos Agentes ao Vivo nesta Tarefa */}
    <section className="mb-4 carta p-4 border border-linha-forte/60 bg-carta">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${ativos > 0 ? 'bg-verde animate-pulse' : 'bg-tinta-3'}`} />
          <Cabecalho cor={ativos > 0 ? 'var(--color-verde)' : 'var(--color-tinta)'}>
            agentes ao vivo na tarefa
          </Cabecalho>
        </div>
        <span className="rotulo">
          {carregandoVivos ? 'consultando sonda…' : vivos?.ok ? `${vivos.contagem?.vivos ?? 0} vivos (${ativos} em execução)` : 'sonda indisponível'}
        </span>
      </div>

      {listaVivos.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {listaVivos.map((ag) => (
            <div key={ag.id} className="poco flex flex-col justify-between p-3">
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-mono text-[12px] font-bold text-tinta">{ag.id}</span>
                  <Pilula tom={ag.estado === 'trabalhando' ? 'verde' : 'ambar'}>
                    {ag.estado === 'trabalhando' ? 'executando' : 'silencioso'}
                  </Pilula>
                </div>
                <div className="mt-1 text-[11px] font-medium text-tinta-2 line-clamp-2" title={ag.etapa_e_description ?? ag.etapa}>
                  {ag.etapa ?? 'etapa em andamento'}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between border-t border-linha/60 pt-1.5 text-[10px] text-tinta-3 font-mono">
                <span>{ag.ferramenta ? `ferramenta: ${ag.ferramenta}` : ag.fase}</span>
                <span>{ag.silencio_s !== null && ag.silencio_s !== undefined ? `há ${ag.silencio_s}s` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-tinta-3">
          Nenhum agente em execução ativa nesta tarefa neste instante. A sonda de presença monitora processos vivos e cauda de transcripts a cada 10 segundos.
        </p>
      )}
    </section>

    {erro ? <section className="rounded-xl border border-vermelho/30 bg-vermelho/6 p-4" data-erro-tarefas>
      <Cabecalho cor="var(--color-vermelho)">a fonte não respondeu por inteiro</Cabecalho>
      <p className="text-[12px] leading-relaxed text-tinta-2">{erro}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-tinta-3">Nenhuma contagem parcial virou zero. Quando os quatro estados abertos responderem, a carteira reaparece inteira.</p>
    </section> : <>
      {dados?.truncado && <div className="mb-3 rounded-lg border border-ambar/30 bg-ambar/6 p-3 text-[11px] text-tinta-2">Ao menos um estado atingiu o limite de 200 itens. Os números abaixo são mínimos, não o total definitivo.</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="tarefas abertas" valor={dados?.total_abertas} nota="carteira GTD, não fila de agentes" />
        <Kpi rotulo="em andamento" valor={dados?.por_status.doing} cor="text-ciano" />
        <Kpi rotulo="atrasadas" valor={dados?.por_prazo.atrasadas} cor={(dados?.por_prazo.atrasadas ?? 0) > 0 ? 'text-vermelho' : 'text-tinta'} />
        <Kpi rotulo="sem prazo" valor={dados?.por_prazo.sem_prazo} cor="text-ambar" />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <section className="carta p-4"><Cabecalho meta={dados?.total_abertas}>estado da carteira</Cabecalho><div className="space-y-2.5">{STATUS.map(([chave, nome]) => <Linha key={chave} nome={nome} valor={dados?.por_status[chave]} total={dados?.total_abertas} />)}</div></section>
        <section className="carta p-4"><Cabecalho>pressão de prazo</Cabecalho><div className="space-y-2.5">{PRAZOS.map(([chave, nome]) => <Linha key={chave} nome={nome} valor={dados?.por_prazo[chave]} total={dados?.total_abertas} />)}</div></section>
        <section className="carta p-4"><Cabecalho>movimento do cadastro</Cabecalho><div className="space-y-2.5">{MOVIMENTO.map(([chave, nome]) => <Linha key={chave} nome={nome} valor={dados?.por_movimento[chave]} total={dados?.total_abertas} />)}</div><p className="mt-3 border-t border-linha pt-2.5 text-[10px] leading-relaxed text-tinta-3">Movimento é alteração do registro. Não prova que o trabalho foi executado.</p></section>
      </div>
      <section className="carta mt-3 p-4"><Cabecalho meta={`${dados?.por_projeto.length ?? 0} grupos`}>carga por projeto</Cabecalho><div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{dados?.por_projeto.map((p) => <Linha key={p.projeto} nome={p.projeto} valor={p.total} total={dados.total_abertas} />)}</div><p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">Este é o estoque atual de tarefas abertas no gestor GTD, não histórico nem fila de execução dos agentes. Concluídas ficam fora. Títulos, notas, ids e responsáveis não entram no painel.</p></section>
    </>}
  </div>
}

function Linha({ nome, valor, total }: { nome: string; valor?: number; total?: number | null }) {
  const fracao = total && valor !== undefined ? Math.min(100, (valor / total) * 100) : 0
  return <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"><span className="truncate text-[12px] text-tinta-2">{nome}</span><span className="font-mono text-[11px] tabular-nums text-tinta">{valor ?? '—'}</span><span className="col-span-2 h-[3px] overflow-hidden rounded-full bg-white/6"><span className="block h-full rounded-full bg-lima/70" style={{ width: `${fracao}%` }} /></span></div>
}
