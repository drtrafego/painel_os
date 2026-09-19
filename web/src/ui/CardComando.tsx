import { Icone } from './Icone'
import { Barra, Numero, Pilula, TEXTO_DO_TOM } from './primitivos'
import { lerMotores } from '../dados/motores'
import type { AgenteSessao } from '../dados/tipos'

export function CardComando({ agente }: { agente: AgenteSessao }) {
  const v = agente.verificador
  const motor = lerMotores(agente.motores)
  const cor = agente.cor === 'lima' ? 'var(--color-lima)' : 'var(--color-ciano)'
  // Indeterminada NAO passou: o verificador nao conseguiu medir aquela. Sair
  // da conta dos verdes era contar como aprovada a checagem que nao olhou.
  const verdes =
    v.checagens !== null && v.reprovadas !== null && v.indeterminadas !== null
      ? v.checagens - v.reprovadas - v.indeterminadas
      : null
  const fracao = verdes !== null && v.checagens ? verdes / v.checagens : null
  const ok = v.reprovadas === 0 && v.vencido === false && v.indeterminadas === 0

  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${cor} 20%, var(--color-linha))`,
        background: `linear-gradient(150deg, color-mix(in oklab, ${cor} 7%, transparent), transparent 58%), var(--color-carta-alta)`,
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg border"
          style={{ color: cor, borderColor: `color-mix(in oklab, ${cor} 28%, transparent)`, background: `color-mix(in oklab, ${cor} 12%, transparent)` }}
        >
          <Icone nome={agente.id === 'luana' ? 'coroa' : 'bot'} tamanho={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="font-serif text-[26px] leading-none text-tinta">{agente.nome}</h2>
            <span className="rotulo">{agente.papel}</span>
            <span className="ml-auto shrink-0">
              <Pilula tom={ok ? 'verde' : v.checagens === null ? 'neutro' : 'ambar'}>
                {v.vencido
                  ? 'rodada vencida'
                  : ok
                    ? 'tudo no verde'
                    : v.checagens === null
                      ? 'verificador ilegível'
                      : v.reprovadas
                        ? `${v.reprovadas} reprovadas`
                        : `${v.indeterminadas ?? '—'} indeterminadas`}
              </Pilula>
            </span>
          </div>
          <p className="mt-2 text-[11.5px] leading-[1.55] text-tinta-2">{agente.resumo}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3 border-t border-linha pt-3.5">
        <Numero rotulo="checagens" valor={v.checagens} tamanho="text-[27px]" />
        <Numero rotulo="reprovadas" valor={v.reprovadas} tamanho="text-[27px]" cor={v.reprovadas ? 'text-ambar' : 'text-tinta'} />
        <Numero rotulo="indeterminadas" valor={v.indeterminadas} tamanho="text-[27px]" cor={v.indeterminadas ? 'text-ambar' : 'text-tinta'} />
        <Numero rotulo="memória" valor={agente.memoria.linhas} tamanho="text-[27px]" cor="text-tinta-2" />
        <Numero rotulo="cron" valor={agente.cron_linhas} tamanho="text-[27px]" cor="text-tinta-2" />
      </div>

      <div className="mt-3.5 min-h-[76px] border-t border-linha pt-3">
        {v.falhas.length > 0 ? (
          <ul className="space-y-[7px]">
            {v.falhas.slice(0, 3).map((f) => (
              <li key={f.o_que} className="flex items-start gap-2 text-[11px] leading-snug text-tinta-2">
                <span className="mt-[5px] size-[4px] shrink-0 rounded-full bg-ambar" />
                <span className="min-w-0 flex-1 truncate" title={f.o_que}>{f.o_que}</span>
                <span className="rotulo shrink-0">{f.desde?.replace('desde ', '').slice(0, 10) ?? '—'}</span>
              </li>
            ))}
            {v.falhas.length > 3 && (
              <li className="rotulo pl-4">e mais {v.falhas.length - 3} no {agente.verificador.arquivo.split('/').pop()}</li>
            )}
          </ul>
        ) : (
          <p className="text-[11px] leading-snug text-tinta-3">
            {v.checagens === null || v.indeterminadas === null ? (
              <>
                Não consegui ler o verificador deste agente
                {v.erro_leitura ? `: ${v.erro_leitura}` : ''}. Sem esse número não dá para dizer que
                alguma coisa passou.
              </>
            ) : v.indeterminadas > 0 ? (
              <>
                Nenhuma checagem reprovada, mas {v.indeterminadas} não conseguiram medir: das{' '}
                {v.checagens}, {verdes} passaram de fato. Indeterminada não é aprovada.
              </>
            ) : (
              <>
                Nenhuma checagem reprovada na última rodada. Isso diz que as {v.checagens} checagens
                passaram, não que tudo está certo: prova é o que elas medem.
              </>
            )}
          </p>
        )}
      </div>

      {/*
        DOIS SERVICES NO AR E DEFEITO, E DEFEITO PRECISA GRITAR.
        No primeiro print, o conflito aparecia só como uma palavra no rodapé e
        a tela ficava igual à normal. Quem lê o painel de relance não veria.
        Aqui a frase inteira sobe para dentro do cartão, em vermelho.
      */}
      {motor.tom === 'vermelho' && (
        <div
          data-motor-conflito
          className="mt-3 rounded-lg border border-vermelho/35 bg-vermelho/8 px-3 py-2.5 text-[11px] leading-relaxed text-tinta-2"
        >
          <span className="font-mono uppercase tracking-[.16em] text-vermelho">Conflito de service.</span>{' '}
          {motor.detalhe}
        </div>
      )}

      <div className="mt-auto flex items-center gap-3 border-t border-linha pt-3">
        <span className="rotulo whitespace-nowrap" title={motor.detalhe} data-motor data-motor-tom={motor.tom}>
          motor <span className={TEXTO_DO_TOM[motor.tom]}>{motor.rotulo}</span>
        </span>
        <span className="min-w-[70px] flex-1"><Barra fracao={fracao} cor={cor} /></span>
        <span className="rotulo whitespace-nowrap">rodada {v.rodada?.slice(11, 16) ?? '—'} utc</span>
      </div>
    </article>
  )
}
