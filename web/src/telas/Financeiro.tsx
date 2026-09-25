import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'

function formatarMoeda(valor: number | null | undefined, moeda = 'BRL') {
  if (valor === null || valor === undefined) return '—'
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda, maximumFractionDigits: 0 }).format(valor)
  } catch {
    return `R$ ${valor.toLocaleString('pt-BR')}`
  }
}

export function Financeiro({ estado, vista }: PropsTela) {
  const dados = estado.financeiro

  if (!dados || dados.status !== 'pronto') {
    const statusMsg = dados?.status === 'indeterminado' ? 'coleta em andamento ou cache expirado' : 'fonte indisponível'
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
        <TituloDaTela titulo="Painel Financeiro." pergunta={vista.pergunta} />
        <div data-financeiro-ausente className="rounded-lg border border-ambar/30 bg-ambar/8 p-4">
          <div className="rotulo mb-2 !text-ambar">{statusMsg}</div>
          <p className="text-sm leading-relaxed text-tinta-2">
            Isto não é zero, é ausência de medição. A tela não transforma indisponibilidade de API em zero inventado.
          </p>
          <p className="mt-2 font-mono text-[10px] text-tinta-3">
            {dados?.erro ?? 'o coletor ainda não obteve a medição do painel financeiro'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela
        titulo="Painel Financeiro."
        pergunta="Métricas agregadas do gerenciador financeiro (MRR, a receber, recebido e vencido), sem PII."
        direita={
          <span className="rotulo">
            medido em {new Date(dados.atualizado_em).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc
          </span>
        }
      />

      {/* 4 KPIs do Resumo Executivo no Topo */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          rotulo="MRR Atual"
          valor={formatarMoeda(dados.mrr_atual, dados.moeda_exibicao ?? 'BRL')}
          cor="text-verde"
        />
        <Kpi
          rotulo="A Receber (Mês)"
          valor={formatarMoeda(dados.a_receber_mes, dados.moeda_exibicao ?? 'BRL')}
          cor="text-tinta"
        />
        <Kpi
          rotulo="Recebido (Mês)"
          valor={formatarMoeda(dados.recebido_mes, dados.moeda_exibicao ?? 'BRL')}
          cor="text-ciano"
        />
        <Kpi
          rotulo="Valor em Atraso"
          valor={formatarMoeda(dados.valor_em_atraso, dados.moeda_exibicao ?? 'BRL')}
          cor={dados.valor_em_atraso && dados.valor_em_atraso > 0 ? 'text-ambar' : 'text-verde'}
        />
      </div>

      {/* Detalhes e Desempenho */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="carta p-4">
          <Cabecalho cor="var(--color-verde)">Clientes e Contratos</Cabecalho>
          <ul className="divide-y divide-linha">
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Clientes ativos</span>
              <span className="font-bold text-tinta">{dados.clientes_ativos ?? '—'}</span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Clientes em atraso</span>
              <Pilula tom={dados.clientes_em_atraso ? 'ambar' : 'verde'}>
                {dados.clientes_em_atraso ?? 0} {dados.clientes_em_atraso === 1 ? 'cliente' : 'clientes'}
              </Pilula>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Novos contratos no mês</span>
              <span className="font-bold text-verde">+{dados.contratos_novos_mes ?? 0}</span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Contratos encerrados</span>
              <span className="font-bold text-tinta-3">-{dados.contratos_encerrados_mes ?? 0}</span>
            </li>
          </ul>
        </section>

        <section className="carta p-4">
          <Cabecalho cor="var(--color-ciano)">Câmbio & Cobranças</Cabecalho>
          <ul className="divide-y divide-linha">
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Câmbio USD / BRL</span>
              <span className="font-mono font-bold text-tinta">
                {dados.cambio_usd_brl ? `R$ ${dados.cambio_usd_brl.toFixed(2)}` : '—'}
              </span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Câmbio USD / ARS</span>
              <span className="font-mono font-bold text-tinta">
                {dados.cambio_usd_ars ? `$ ${dados.cambio_usd_ars.toFixed(2)}` : '—'}
              </span>
            </li>
            <li className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-tinta-2">Próximas cobranças (quantidade)</span>
              <span className="font-bold text-tinta">{dados.proximas_cobrancas_qtd ?? '—'}</span>
            </li>
          </ul>
        </section>
      </div>

      {/* Tendência Mensal */}
      {dados.tendencia_mensal && dados.tendencia_mensal.length > 0 && (
        <section className="carta mt-4 p-4">
          <Cabecalho cor="var(--color-tinta)">Tendência Mensal (Faturamento / Despesa / MRR)</Cabecalho>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-linha text-tinta-3">
                  <th className="pb-2">Mês</th>
                  <th className="pb-2">Faturado</th>
                  <th className="pb-2">Despesa</th>
                  <th className="pb-2">MRR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linha">
                {dados.tendencia_mensal.map((item) => (
                  <tr key={item.mes} className="hover:bg-black/5">
                    <td className="py-2 font-mono text-tinta">{item.mes}</td>
                    <td className="py-2 text-verde">{formatarMoeda(item.faturado)}</td>
                    <td className="py-2 text-tinta-3">{formatarMoeda(item.despesa)}</td>
                    <td className="py-2 font-bold text-tinta">{formatarMoeda(item.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="mt-4 max-w-3xl text-[10.5px] leading-relaxed text-tinta-3">
        Fonte: GET /dashboard/metrics da API financeira, em leitura direta e filtrada por allowlist. O coletor descarta faturas individuais, nomes de clientes, notas e dados de pagamento antes de gravar o estado público.
      </p>
    </div>
  )
}
