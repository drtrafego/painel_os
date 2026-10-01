import type { UsoPlanos } from '../dados/tipos'
import { formatarDinheiro, formatarNumero, montarUsoParede, numeroMedido, totalizarGastos, type ColunaTarefas, type GastosIA } from './PixelOffice.wall-data'

interface ParedeProps {
  uso?: UsoPlanos
  gastos?: GastosIA | null
  tarefas: ColunaTarefas[]
  descricaoSonda: string
  leituraConfirmada: boolean
}
/** Painéis HTML reais sobre a parede do escritório; não são uma imagem. */
export function ParedeEscritorio({ uso, gastos, tarefas, descricaoSonda, leituraConfirmada }: ParedeProps) {
  const planos = montarUsoParede(uso)
  const totais = totalizarGastos(gastos)
  return (
    <div className="ct-wall" data-testid="office-wall">
      <section className="ct-display ct-costs" aria-label="Gastos e consumo de IAs">
        <header className="ct-display-heading">
          <div><span className="ct-kicker">PAINEL 01 / CONSUMO</span><h3>Gastos de IAs</h3></div>
          <span className="ct-tag">{gastos?.periodo || 'Última leitura'}</span>
        </header>
        <div className="ct-cost-total">
          <div><span className="ct-muted">Valor monetário</span>
            {totais.length ? totais.map(total => <strong key={total.moeda}>{formatarDinheiro(total.valor, total.moeda)}</strong>) : <strong aria-label="Gasto não informado">—</strong>}
          </div>
          <p>{totais.length ? gastos?.fonte : 'Custo em dinheiro não informado pela fonte atual.'}{gastos?.atualizadoEm && <small className="ct-money-timestamp">{gastos.atualizadoEm}</small>}</p>
        </div>
        {gastos?.itens.length ? <div className="ct-money-items" data-testid="office-money-items">{gastos.itens.map((item, i) => <div key={`${item.id}:${i}`}><span>{item.nome}</span><b>{formatarDinheiro(item.valor, item.moeda)}</b></div>)}</div> : null}
        <div className="ct-usage-grid">
          {planos.map(plano => <article className="ct-usage" key={plano.id}>
            <div className="ct-usage-title"><span className="ct-model-icon" aria-hidden="true">{plano.id === 'claude' ? '✳' : '⌘'}</span><h4>{plano.nome}</h4><b>{plano.percentual === null ? '—' : `${formatarNumero(plano.percentual)}%`}</b></div>
            <span className="ct-muted">{plano.janela}</span>
            <div className="ct-meter" role={plano.percentual === null ? 'img' : 'meter'} aria-label={plano.percentual === null ? `Uso do plano ${plano.nome} não informado` : `Uso do plano ${plano.nome}`} aria-valuemin={plano.percentual === null ? undefined : 0} aria-valuemax={plano.percentual === null ? undefined : 100} aria-valuenow={plano.percentual === null ? undefined : Math.min(plano.percentual, 100)} aria-valuetext={plano.percentual === null ? undefined : `${formatarNumero(plano.percentual)} por cento`}>
              <i style={{ width: `${Math.min(100, plano.percentual ?? 0)}%` }} />
            </div>
            {plano.id === 'claude' ? <div className="ct-week-usage" title={plano.semanaOficial ? 'Percentual oficial da janela semanal do Claude Code' : 'Semana: sem fonte oficial'}>
              <div><span>Semana · {formatarNumero(plano.semanaJanelaDias ?? 7)} dias</span><b>{plano.semanaOficial && typeof plano.semanaPercentual === 'number' ? `${formatarNumero(plano.semanaPercentual)}%` : 'sem fonte oficial'}</b></div>
              {plano.semanaOficial && typeof plano.semanaPercentual === 'number' ? <div className="ct-meter" role="meter" aria-label="Uso semanal do plano Claude" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(plano.semanaPercentual, 100)} aria-valuetext={`${formatarNumero(plano.semanaPercentual)} por cento`}>
                <i style={{ width: `${Math.min(100, plano.semanaPercentual)}%` }} />
              </div> : null}
            </div> : null}
            <p>{formatarNumero(plano.tokens)} <span>tokens / 24h · estimativa</span></p>
            <small>{plano.observado ? plano.nota : 'Leitura não confirmada · ' + plano.nota}</small>
          </article>)}
        </div>
        <footer className="ct-source" title={uso?.erro || undefined}>
          <span className={`ct-dot ${uso?.status === 'pronto' ? 'ct-dot-green' : 'ct-dot-amber'}`} />
          <span>{uso?.status === 'pronto' ? 'Uso recebido do painel' : 'Uso sem leitura confirmada'}{uso?.atualizado_em ? ` · ${uso.atualizado_em}` : ''}</span>
        </footer>
        <p className="ct-disclaimer">Tokens e percentual de plano não são custo em dinheiro. Sem conversão estimada.</p>
      </section>
      <section className="ct-display ct-tasks" aria-label="Tarefas de Renato e Luana">
        <header className="ct-display-heading"><div><span className="ct-kicker">PAINEL 02 / FILA</span><h3>Tarefas</h3></div><span className="ct-tag" title={descricaoSonda}>{leituraConfirmada ? 'Memória lida' : 'Leitura não confirmada'}</span></header>
        <div className="ct-task-columns">
          {tarefas.map(coluna => <section className="ct-task-column" aria-label={`Tarefas de ${coluna.nome}`} key={coluna.id} data-testid={`office-tasks-${coluna.id}`}>
            <header><div><h4>{coluna.nome}</h4><small>{coluna.tarefas.length} {coluna.tarefas.length === 1 ? 'tarefa' : 'tarefas'} na fila</small></div></header>
            <div className="ct-task-list">
              {coluna.tarefas.length ? coluna.tarefas.map(tarefa => <button type="button" key={tarefa.chave} onClick={(evento) => evento.currentTarget.blur()} aria-label={`Tarefa ${tarefa.ordem}: ${tarefa.titulo}`} className={`ct-task ${tarefa.emAndamento ? 'ct-task-current' : ''} ${tarefa.estado === 'bloqueada' ? 'ct-task-blocked' : ''}`} title={tarefa.titulo}>
                <span className={`ct-task-state ${tarefa.emAndamento ? 'ct-task-running' : ''}`} aria-hidden="true">{tarefa.ordem}</span>
                <b className="ct-task-title">{tarefa.titulo}</b>
                {tarefa.dependeDe ? <span className="ct-task-dep" title={`depende de ${tarefa.dependeDe}`} aria-label={`depende de ${tarefa.dependeDe}`}>↳</span> : null}
                <span className="ct-task-priority">{tarefa.prioridade}</span>
                {tarefa.data ? <time className="ct-task-date">{tarefa.data}</time> : <span className="ct-task-date" aria-hidden="true">—</span>}
              </button>) : <p className="ct-task-empty">Sem tarefas na fila{coluna.avisos[0] ? `. ${coluna.avisos[0]}` : ''}</p>}
            </div>
            {coluna.tarefas.length && coluna.avisos[0] ? <p className="ct-task-empty">{coluna.avisos[0]}</p> : null}
          </section>)}
        </div>
        <footer className="ct-source"><span className={`ct-dot ${leituraConfirmada ? 'ct-dot-green' : 'ct-dot-amber'}`} /><span>{descricaoSonda}. Agentes vivos continuam no escritório.</span></footer>
      </section>
    </div>
  )
}

/** Mantém uma medição nula distinta de zero nos consumidores externos. */
export { numeroMedido }
