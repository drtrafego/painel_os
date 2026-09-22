import { Barra, Cabecalho, Kpi, TituloDaTela } from '../ui/primitivos'
import { Parcial } from '../ui/SemDado'
import type { PropsTela } from './Vazias'

export function Analitica({ estado, vista }: PropsTela) {
  const pecas = estado.pecas
  const medidas = pecas?.analitica

  if (!pecas || pecas.erro || pecas.total === null || !medidas) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
        <TituloDaTela titulo="Analítica de conteúdo." pergunta={vista.pergunta} />
        <section className="carta mt-4 max-w-2xl p-5"><Cabecalho cor="var(--color-vermelho)" meta="indisponível">não consegui ler o registro de conteúdo</Cabecalho><p className="font-serif text-[20px] text-tinta">Isto não é zero publicações. É ausência de medição.</p><p className="mt-3 text-[12px] text-tinta-2">{pecas?.erro ?? 'O estado é anterior à leitura de posts.json.'}</p></section>
      </div>
    )
  }

  const publicados = medidas.por_status.postado ?? 0
  const falhas = medidas.por_status.erro ?? 0
  const parciais = medidas.por_status.publicacao_parcial ?? 0
  const formatos = Object.entries(medidas.por_formato).sort((a, b) => b[1] - a[1])
  const canais = Object.entries(medidas.por_canal).sort((a, b) => b[1] - a[1])
  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela titulo="Analítica de conteúdo." pergunta={vista.pergunta} direita={<span className="rotulo">posts.json de {pecas.atualizado_em ? new Date(pecas.atualizado_em).toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false }) : '—'} utc</span>} />
      <Parcial dado={vista.dado} />

      <section className="mt-3 rounded-lg border border-ambar/30 bg-ambar/6 p-4">
        <Cabecalho cor="var(--color-ambar)">desempenho não medido</Cabecalho>
        <p className="font-serif text-[20px] leading-snug text-tinta">Publicar não significa performar.</p>
        <p className="mt-2 text-[12px] leading-relaxed text-tinta-2">{medidas.meta.motivo}. Os números abaixo medem somente produção e saída registrada.</p>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="publicações registradas" valor={publicados} nota="status postado, não desempenho" />
        <Kpi rotulo="com agenda registrada" valor={medidas.com_agenda} nota={`entre ${medidas.total} registros da marca própria`} />
        <Kpi rotulo="falhas" valor={falhas} cor={falhas ? 'text-vermelho' : 'text-verde'} nota="status erro no posts.json" />
        <Kpi rotulo="saídas parciais" valor={parciais} cor={parciais ? 'text-ambar' : 'text-tinta'} nota="status publicação parcial" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Distribuicao titulo="formatos da marca própria" itens={formatos} cor="var(--color-ciano)" />
        <Distribuicao titulo="canais declarados da marca própria" itens={canais} cor="var(--color-lima)" />
      </div>
      <section className="carta mt-3 p-4" data-vinculo-meta><Cabecalho meta="adaptador bloqueado">cobertura para vínculo futuro com a Meta</Cabecalho><div className="grid gap-3 sm:grid-cols-2"><Kpi rotulo="links Instagram registrados" valor={medidas.links_publicados.instagram ?? 0} nota="chave potencial, não métrica" /><Kpi rotulo="links LinkedIn registrados" valor={medidas.links_publicados.linkedin ?? 0} nota="fora da Meta" /></div><p className="mt-3 text-[10.5px] leading-relaxed text-tinta-3">Escopo isolado: somente marca gastaomatos. Registros sem marca e de outras marcas ficam fora, mesmo que isso reduza a contagem. O adaptador só aceitará métricas quando a leitura identificar a conta e o post da mesma marca.</p></section>
      <p className="mt-3 text-[10.5px] leading-relaxed text-tinta-3">Os estados somam somente os {medidas.total.toLocaleString('pt-BR')} registros marcados como gastaomatos. O posts.json inteiro tem {pecas.total.toLocaleString('pt-BR')} registros, mas misturá-los produziria uma analítica falsa entre clientes.</p>
    </div>
  )
}

function Distribuicao({ titulo, itens, cor }: { titulo: string; itens: Array<[string, number]>; cor: string }) {
  const maior = Math.max(...itens.map(([, n]) => n), 1)
  return (
    <section className="carta overflow-hidden">
      <div className="border-b border-linha px-4 pt-4"><Cabecalho cor={cor} meta={`${itens.length}`}>{titulo}</Cabecalho></div>
      <ul>{itens.map(([nome, total]) => <li key={nome} className="grid grid-cols-[minmax(0,1fr)_52px] gap-3 border-b border-linha px-4 py-3 last:border-b-0"><div><span className="text-[12px] text-tinta">{nome.replaceAll('-', ' ')}</span><div className="mt-2"><Barra fracao={total / maior} cor={cor} altura={2} /></div></div><span className="text-right font-serif text-[21px] text-tinta">{total}</span></li>)}</ul>
    </section>
  )
}
