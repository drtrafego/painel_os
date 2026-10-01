import { useMemo } from 'react'
import type { UsoPlanos } from '../dados/tipos'
import { formatarDataSolicitacao, montarCotas, validarQuadroTarefas, type QuadroTarefasSolicitadas } from './nucleo/dados'
import { formatarDinheiro, totalizarGastos, type ColunaTarefas, type GastosIA } from './PixelOffice.wall-data'

interface ParedeProps {
  uso?: UsoPlanos
  gastos?: GastosIA | null
  tarefas: ColunaTarefas[]
  tarefasSolicitadas?: QuadroTarefasSolicitadas | null
  descricaoSonda: string
  leituraConfirmada: boolean
}

/** Monitores HTML independentes: cotas, custos e tarefas não são execuções da sonda. */
export function ParedeEscritorio({ uso, gastos, tarefas, tarefasSolicitadas, descricaoSonda, leituraConfirmada }: ParedeProps) {
  const cotas = useMemo(() => montarCotas(uso), [uso])
  const totais = useMemo(() => totalizarGastos(gastos), [gastos])
  const quadroSolicitado = useMemo(() => validarQuadroTarefas(tarefasSolicitadas), [tarefasSolicitadas])
  const temFilaDiretores = tarefas.some(coluna => coluna.tarefas.length || coluna.avisos.length)

  return <div className="ct-wall" data-testid="office-wall">
    <section className="ct-display ct-costs nx-usage-wall" aria-label="Gastos de IAs em cinco horas e na semana">
      <header className="ct-display-heading">
        <div><span className="ct-kicker">MONITOR 01 / CAPACIDADE</span><h3>Gastos de IAs</h3></div>
        <span className="ct-tag">5h + semana</span>
      </header>
      {totais.length ? <div className="ct-cost-total">
        <div><span className="ct-muted">Valor monetário</span>{totais.map(total => <strong key={total.moeda}>{formatarDinheiro(total.valor, total.moeda)}</strong>)}</div>
        <p>{gastos?.fonte}{gastos?.atualizadoEm && <small className="ct-money-timestamp">{gastos.atualizadoEm}</small>}</p>
      </div> : null}
      <div className="nx-quota-table">
        <div className="nx-quota-head"><span>Plano</span><span>Janela de 5 horas</span><span>Semanal · 7 dias</span></div>
        {cotas.map(provedor => <div className="nx-quota-row" key={provedor.id}>
          <strong><span aria-hidden="true">{provedor.id === 'claude' ? '✳' : '⌘'}</span>{provedor.nome}</strong>
          {provedor.janelas.map(janela => <div className="nx-quota" key={janela.horas} title={janela.observacao} data-testid={`quota-${provedor.id}-${janela.horas}`}>
            <b>{janela.percentual === null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(janela.percentual)}%`}</b>
            <div className="ct-meter" role={janela.percentual === null ? 'img' : 'meter'} aria-label={`${provedor.nome}: ${janela.horas === 5 ? 'cinco horas' : 'semana'}${janela.percentual === null ? ', não informado' : ''}`} aria-valuemin={janela.percentual === null ? undefined : 0} aria-valuemax={janela.percentual === null ? undefined : 100} aria-valuenow={janela.percentual ?? undefined}><i style={{ width: `${janela.percentual ?? 0}%` }} /></div>
            <small>{janela.percentual === null ? 'Sem dado nesta janela' : 'Cota utilizada'}</small>
          </div>)}
        </div>)}
      </div>
      <footer className="ct-source"><i className={`ct-dot ${uso?.status === 'pronto' ? 'ct-dot-green' : 'ct-dot-amber'}`} /><span>{uso?.status === 'pronto' ? 'Uso recebido da fonte' : 'Uso sem leitura confirmada'}{uso?.atualizado_em ? ` · ${uso.atualizado_em}` : ''}</span></footer>
      <p className="ct-disclaimer">Percentual da cota, não dinheiro. A janela secundária do Codex não é tratada como semanal sem duração confirmada.</p>
    </section>

    <section className="ct-display ct-tasks nx-task-wall" aria-label="Tarefas de Renato e Luana">
      <header className="ct-display-heading">
        <div><span className="ct-kicker">MONITOR 02 / FILA</span><h3>Tarefas</h3></div>
        <span className="ct-tag" title={descricaoSonda}>{temFilaDiretores ? (leituraConfirmada ? 'Memória lida' : 'Leitura não confirmada') : 'Tarefa + data'}</span>
      </header>
      {temFilaDiretores ? <div className="ct-task-columns">
        {tarefas.map(coluna => <section className="ct-task-column" aria-label={`Tarefas de ${coluna.nome}`} key={coluna.id} data-testid={`office-tasks-${coluna.id}`}>
          <header><div><h4>{coluna.nome}</h4><small>{coluna.tarefas.length} {coluna.tarefas.length === 1 ? 'tarefa' : 'tarefas'} na fila</small></div></header>
          <div className="ct-task-list">
            {coluna.tarefas.length ? coluna.tarefas.map(tarefa => <div className="ct-task-group" key={tarefa.chave}>
              <div role="listitem" aria-label={`Tarefa ${tarefa.ordem}: ${tarefa.titulo}`} className={`ct-task ${tarefa.emAndamento ? 'ct-task-current' : ''} ${tarefa.estado === 'bloqueada' ? 'ct-task-blocked' : ''}`} title={tarefa.titulo}>
                <span className={`ct-task-state ${tarefa.emAndamento ? 'ct-task-running' : ''}`} aria-hidden="true">{tarefa.ordem}</span>
                <b className="ct-task-title">{tarefa.titulo}</b>
                {tarefa.dependeDe ? <span className="ct-task-dep" title={`depende de ${tarefa.dependeDe}`} aria-label={`depende de ${tarefa.dependeDe}`}>
                  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 2v4.5c0 1.4 1.1 2.5 2.5 2.5H9M7 6.5 9.5 9 7 11.5" /></svg>
                </span> : null}
                <span className="ct-task-priority">{tarefa.prioridade}</span>
                {tarefa.semProximoPasso ? <span className="ct-task-date ct-task-missing-step" title="sem próximo passo">sem próximo passo</span> : tarefa.data ? <time className="ct-task-date">{tarefa.data}</time> : <span className="ct-task-date" aria-hidden="true">—</span>}
              </div>
              {tarefa.subtarefas.map(subtarefa => <div className={`ct-subtask ${subtarefa.estado === 'bloqueada' ? 'ct-subtask-blocked' : ''}`} key={`${tarefa.chave}:sub:${subtarefa.ordem}`} title={subtarefa.titulo}>
                <span className="ct-subtask-dot" aria-hidden="true" />
                <span className="ct-subtask-title">{subtarefa.titulo}</span>
              </div>)}
            </div>) : <p className="ct-task-empty">Sem tarefas na fila{coluna.avisos[0] ? `. ${coluna.avisos[0]}` : ''}</p>}
          </div>
          {coluna.restantes > 0 ? <footer className="ct-task-more">+{coluna.restantes} na fila</footer> : null}
          {coluna.tarefas.length && coluna.avisos[0] ? <p className="ct-task-empty">{coluna.avisos[0]}</p> : null}
        </section>)}
      </div> : <div className="ct-task-columns">
        {(['renato', 'luana'] as const).map(diretor => {
          const nome = diretor === 'renato' ? 'Renato' : 'Luana'
          const itens = quadroSolicitado.tarefas.filter(tarefa => tarefa.diretor === diretor)
          return <section className="ct-task-column" key={diretor} data-testid={`office-tasks-${diretor}`} aria-label={`Tarefas de ${nome}`}>
            <header><span className="ct-director-avatar" aria-hidden="true">{nome[0]}</span><h4>{nome}</h4></header>
            <div className="nx-task-table-scroll"><table><thead><tr><th scope="col">Tarefa</th><th scope="col">Data</th></tr></thead><tbody>
              {quadroSolicitado.status === 'pronto' && itens.length ? itens.map(tarefa => <tr key={tarefa.id}><td>{tarefa.tarefa}</td><td><time dateTime={tarefa.dataSolicitada ?? undefined}>{formatarDataSolicitacao(tarefa.dataSolicitada)}</time></td></tr>) : <tr><td colSpan={2} className="nx-task-empty">{quadroSolicitado.status === 'nao_conectado' ? 'Fonte de tarefas solicitadas ainda não conectada.' : quadroSolicitado.status === 'erro' ? 'Não foi possível validar as tarefas.' : 'Nenhuma tarefa recebida para este diretor.'}</td></tr>}
            </tbody></table></div>
          </section>
        })}
      </div>}
      <footer className="ct-source">
        {temFilaDiretores ? <><span className={`ct-dot ${leituraConfirmada ? 'ct-dot-green' : 'ct-dot-amber'}`} /><span>{descricaoSonda}. Agentes vivos continuam no escritório.</span></> : <span>{quadroSolicitado.status === 'pronto' ? `Fonte: ${quadroSolicitado.fonte}` : quadroSolicitado.erro || 'Solicitações são independentes das execuções técnicas dos agentes.'}</span>}
      </footer>
    </section>
  </div>
}
