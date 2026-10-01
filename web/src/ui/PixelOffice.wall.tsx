import { useMemo } from 'react'
import type { UsoPlanos } from '../dados/tipos'
import { formatarDataSolicitacao, montarCotas, validarQuadroTarefas, type QuadroTarefasSolicitadas } from './nucleo/dados'

interface ParedeProps {
  uso?: UsoPlanos
  tarefas?: QuadroTarefasSolicitadas | null
  descricaoSonda: string
  leituraConfirmada: boolean
}
/** Monitores HTML independentes: cotas de uso e solicitações não são execuções da sonda. */
export function ParedeEscritorio({ uso, tarefas, descricaoSonda, leituraConfirmada }: ParedeProps) {
  const cotas = useMemo(() => montarCotas(uso), [uso])
  const quadro = useMemo(() => validarQuadroTarefas(tarefas), [tarefas])
  return <div className="ct-wall" data-testid="office-wall">
    <section className="ct-display ct-costs nx-usage-wall" aria-label="Consumo de IAs em cinco horas e na semana">
      <header className="ct-display-heading"><div><span className="ct-kicker">MONITOR 01 / CAPACIDADE</span><h3>Consumo de IAs</h3></div><span className="ct-tag">5h + semana</span></header>
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
    <section className="ct-display ct-tasks nx-task-wall" aria-label="Tarefas solicitadas a Renato e Luana">
      <header className="ct-display-heading"><div><span className="ct-kicker">MONITOR 02 / SOLICITAÇÕES</span><h3>Tarefas</h3></div><span className="ct-tag">Tarefa + data</span></header>
      <div className="ct-task-columns">
        {(['renato', 'luana'] as const).map(diretor => {
          const nome = diretor === 'renato' ? 'Renato' : 'Luana'
          const itens = quadro.tarefas.filter(tarefa => tarefa.diretor === diretor)
          return <section className="ct-task-column" key={diretor} data-testid={`office-tasks-${diretor}`} aria-label={`Tarefas de ${nome}`}>
            <header><span className="ct-director-avatar" aria-hidden="true">{nome[0]}</span><h4>{nome}</h4></header>
            <div className="nx-task-table-scroll"><table><thead><tr><th scope="col">Tarefa</th><th scope="col">Data</th></tr></thead><tbody>
              {quadro.status === 'pronto' && itens.length ? itens.map(tarefa => <tr key={tarefa.id}><td>{tarefa.tarefa}</td><td><time dateTime={tarefa.dataSolicitada ?? undefined}>{formatarDataSolicitacao(tarefa.dataSolicitada)}</time></td></tr>) : <tr><td colSpan={2} className="nx-task-empty">{quadro.status === 'nao_conectado' ? 'Fonte de tarefas solicitadas ainda não conectada.' : quadro.status === 'erro' ? 'Não foi possível validar as tarefas.' : 'Nenhuma tarefa recebida para este diretor.'}</td></tr>}
            </tbody></table></div>
          </section>
        })}
      </div>
      <footer className="ct-source"><span>{quadro.status === 'pronto' ? `Fonte: ${quadro.fonte}` : quadro.erro || 'Solicitações são independentes das execuções técnicas dos agentes.'}</span></footer>
      <span className="ct-sr-only">{leituraConfirmada ? descricaoSonda : `Sonda não confirmada: ${descricaoSonda}`}</span>
    </section>
  </div>
}
