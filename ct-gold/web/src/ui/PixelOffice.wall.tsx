import type { UsoPlanos } from '../dados/tipos'
import { formatarDinheiro, formatarNumero, montarUsoParede, numeroMedido, totalizarGastos, type ColunaTarefas, type GastosIA } from './PixelOffice.wall-data'

interface ParedeProps {
  uso?: UsoPlanos
  gastos?: GastosIA | null
  tarefas: ColunaTarefas[]
  aoSelecionar: (chave: string) => void
  selecionadoId?: string | null
  descricaoSonda: string
  leituraConfirmada: boolean
}
/** Painéis HTML reais sobre a parede do escritório; não são uma imagem. */
export function ParedeEscritorio({ uso, gastos, tarefas, aoSelecionar, selecionadoId, descricaoSonda, leituraConfirmada }: ParedeProps) {
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
        <header className="ct-display-heading"><div><span className="ct-kicker">PAINEL 02 / EXECUÇÃO</span><h3>Tarefas</h3></div><span className="ct-tag" title={descricaoSonda}>{leituraConfirmada ? 'Execuções ao vivo' : 'Leitura não confirmada'}</span></header>
        <div className="ct-task-columns">
          {tarefas.map(coluna => <section className="ct-task-column" aria-label={`Tarefas de ${coluna.nome}`} key={coluna.id} data-testid={`office-tasks-${coluna.id}`}>
            <header><span className="ct-director-avatar" aria-hidden="true">{coluna.nome[0]}</span><div><h4>{coluna.nome}</h4><small>{coluna.tarefas.length} {coluna.tarefas.length === 1 ? 'execução' : 'execuções'} na sonda</small></div></header>
            <div className="ct-task-list">
              {coluna.tarefas.length ? coluna.tarefas.map(tarefa => <button type="button" key={tarefa.chave} onClick={() => aoSelecionar(tarefa.chave)} aria-pressed={selecionadoId === tarefa.chave} className="ct-task" title={tarefa.titulo}>
                <span className={`ct-task-state ${tarefa.estado === 'trabalhando' ? 'ct-task-running' : ''}`} aria-hidden="true">{tarefa.estado === 'trabalhando' ? '↗' : 'Ⅱ'}</span>
                <span className="ct-task-copy"><b>{tarefa.titulo}</b><small>{tarefa.nome}</small><em>{tarefa.estado === 'trabalhando' ? 'Em execução' : 'Silencioso · na mesa'}{tarefa.ferramenta ? ` · ${tarefa.ferramenta}` : ''}</em></span>
              </button>) : <p className="ct-task-empty">Nenhuma execução recebida para {coluna.nome}.{!leituraConfirmada ? ' A sonda ainda precisa confirmar a leitura.' : ''}</p>}
            </div>
          </section>)}
        </div>
        <footer className="ct-source"><span className={`ct-dot ${leituraConfirmada ? 'ct-dot-green' : 'ct-dot-amber'}`} /><span>{descricaoSonda}. Bia e outras origens continuam no inspetor.</span></footer>
      </section>
    </div>
  )
}

/** Mantém uma medição nula distinta de zero nos consumidores externos. */
export { numeroMedido }
