import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'

export function Cobrancas({ estado, vista }: PropsTela) {
  const dados = estado.cobrancas
  if (!dados || dados.status === 'erro') return <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10"><TituloDaTela titulo="Cobranças." pergunta={vista.pergunta} /><div data-cobrancas-bloqueadas className="rounded-lg border border-ambar/30 bg-ambar/8 p-4"><div className="rotulo mb-2 !text-ambar">fonte indisponível</div><p className="text-sm leading-relaxed text-tinta-2">Não consegui consultar o relatório canônico. A tela não transforma ausência de acesso em zero.</p><p className="mt-2 font-mono text-[10px] text-tinta-3">{dados?.erro ?? 'o estado ainda não tem esta fonte'}</p></div></div>

  const vazio = dados.faturas_atrasadas === 0
  return <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
    <TituloDaTela titulo="Cobranças." pergunta="O que venceu e segue em aberto, em totais agregados e sem identificar cliente." direita={<span className="rotulo">consultado {new Date(dados.atualizado_em).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc</span>} />
    <div className="mb-3 grid grid-cols-2 gap-2"><Kpi rotulo="faturas atrasadas" valor={dados.faturas_atrasadas} cor={vazio ? 'text-verde' : 'text-ambar'} /><Kpi rotulo="clientes com atraso" valor={dados.clientes_atrasados} cor={vazio ? 'text-verde' : 'text-ambar'} /></div>
    {vazio ? <section data-cobrancas-em-dia className="carta flex min-h-[280px] flex-col items-center justify-center p-6 text-center"><span className="mb-4 grid size-14 place-items-center rounded-full border border-verde/25 bg-verde/8 text-2xl text-verde">✓</span><h2 className="font-serif text-2xl text-tinta">Nenhuma fatura em atraso.</h2><p className="mt-2 max-w-md text-[12px] leading-relaxed text-tinta-2">O zero veio agora do relatório de atrasos da API financeira. Não é ausência de dado nem fila local vazia.</p></section> : <div className="grid gap-3 lg:grid-cols-2">
      <section className="carta p-4"><Cabecalho cor="var(--color-ambar)">tempo em atraso</Cabecalho><ul className="divide-y divide-linha">{dados.por_faixa.map((x) => <li key={x.faixa} className="flex items-center justify-between py-3"><span className="text-sm text-tinta-2">{x.faixa}</span><Pilula tom="ambar">{x.faturas} {x.faturas === 1 ? 'fatura' : 'faturas'}</Pilula></li>)}</ul></section>
      <section className="carta p-4"><Cabecalho cor="var(--color-ciano)">totais por moeda</Cabecalho><ul className="divide-y divide-linha">{dados.por_moeda.map((x) => <li key={x.moeda} className="flex items-center justify-between gap-4 py-3"><div><div className="text-sm text-tinta">{x.moeda}</div><div className="rotulo mt-1">{x.faturas} {x.faturas === 1 ? 'fatura' : 'faturas'}</div></div><div className="font-serif text-xl text-tinta">{x.total === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: x.moeda }).format(x.total)}</div></li>)}</ul></section>
    </div>}
    <p className="mt-4 max-w-3xl text-[10px] leading-relaxed text-tinta-3">Fonte: relatório canônico de atrasos, em leitura. O coletor descarta nome, telefone, e-mail, identificador, vencimento individual e descrição antes de gravar o estado. Total por moeda só aparece agregado.</p>
  </div>
}
