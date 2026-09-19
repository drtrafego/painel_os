import { Barra, Cabecalho, Kpi, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'

export function Pipeline({ estado, vista }: PropsTela) {
  const pipeline = estado.pipeline
  if (!pipeline || pipeline.erro || pipeline.total === null) {
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
        <TituloDaTela titulo="Pipeline comercial." pergunta={vista.pergunta} />
        <section className="carta mt-4 max-w-2xl p-5">
          <Cabecalho cor="var(--color-vermelho)" meta="indisponível">não consegui medir o funil</Cabecalho>
          <p className="font-serif text-[20px] leading-snug text-tinta">Isto não é zero leads. É uma leitura que não pôde ser concluída.</p>
          <p className="mt-3 text-[12px] leading-relaxed text-tinta-2">{pipeline?.erro ?? 'O estado aberto é anterior à integração com o CRM.'}</p>
        </section>
      </div>
    )
  }

  const maior = Math.max(...pipeline.etapas.map((e) => e.total), 1)
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
      <TituloDaTela titulo="Pipeline comercial." pergunta={vista.pergunta} direita={<span className="rotulo">agregado de {pipeline.coletado_em ? new Date(pipeline.coletado_em).toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false }) : '—'} utc</span>} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi rotulo="leads registrados" valor={pipeline.total} nota="soma do totalLeads do analytics" />
        <Kpi rotulo="organizações agregadas" valor={pipeline.organizacoes} nota="sem identificar nenhuma delas" />
      </div>
      <section className="carta mt-3 overflow-hidden">
        <div className="border-b border-linha px-4 pt-4"><Cabecalho cor="var(--color-lima)" meta={`${pipeline.etapas.length} etapas`}>distribuição atual</Cabecalho></div>
        <ul>
          {pipeline.etapas.map((etapa) => (
            <li key={etapa.etapa} className="grid gap-2 border-b border-linha px-4 py-3 last:border-b-0 sm:grid-cols-[220px_1fr_70px] sm:items-center">
              <span className="truncate text-[12.5px] text-tinta">{etapa.etapa}</span>
              <Barra fracao={etapa.total / maior} cor="var(--color-lima)" altura={2} />
              <span className="text-right font-serif text-[22px] leading-none text-tinta">{etapa.total.toLocaleString('pt-BR')}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-linha px-4 py-3 text-[10.5px] leading-relaxed text-tinta-3">A barra compara volume entre etapas. Ela não é taxa de conversão, não mede avanço individual e não prova venda. A coleta consulta apenas analytics; nome, telefone, e-mail, lead e organização não entram neste estado.</p>
      </section>
    </div>
  )
}
