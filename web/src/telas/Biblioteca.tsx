import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { ItemBiblioteca } from '../dados/tipos'
import type { PropsTela } from './Vazias'

const NOME_ORIGEM = { acervo: 'acervo', pronto: 'pronto para saída', cliente: 'cliente protegido' } as const

export function Biblioteca({ estado, vista }: PropsTela) {
  const biblioteca = estado.biblioteca
  if (!biblioteca || biblioteca.erro) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
        <TituloDaTela titulo="Biblioteca." pergunta={vista.pergunta} />
        <section className="carta mt-4 max-w-2xl p-5">
          <Cabecalho cor="var(--color-vermelho)" meta="não lido">não consegui abrir o acervo</Cabecalho>
          <p className="text-[12.5px] leading-relaxed text-tinta-2">A tela não mostra zero porque isso confundiria falha de leitura com acervo vazio. {biblioteca?.erro ?? 'Este estado é anterior ao índice da Biblioteca.'}</p>
        </section>
      </div>
    )
  }

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela titulo="Biblioteca." pergunta={vista.pergunta} direita={<span className="rotulo">índice de {new Date(biblioteca.atualizado_em).toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false })} utc</span>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="itens no índice" valor={biblioteca.total} nota="é a lista inteira abaixo" />
        <Kpi rotulo="pastas no acervo" valor={biblioteca.por_origem.acervo} nota="entradas atuais de out/" />
        <Kpi rotulo="atalhos prontos" valor={biblioteca.por_origem.pronto + biblioteca.por_origem.cliente} nota="PRONTOS e PRONTOS-CLIENTES" />
        <Kpi rotulo="atalhos quebrados" valor={biblioteca.atalhos_quebrados} cor={biblioteca.atalhos_quebrados ? 'text-vermelho' : 'text-verde'} nota="destino inexistente no disco" />
      </div>
      <section className="carta mt-3 overflow-hidden">
        <div className="border-b border-linha px-4 pt-4"><Cabecalho cor="var(--color-lima)" meta={`${biblioteca.itens.length} itens`}>índice do acervo</Cabecalho></div>
        <div className="grid grid-cols-[minmax(0,1fr)_70px] gap-3 border-b border-linha px-4 py-2 sm:grid-cols-[minmax(0,1fr)_170px_100px_90px]">
          <span className="rotulo">item</span><span className="rotulo hidden sm:block">origem</span><span className="rotulo hidden sm:block">alterado</span><span className="rotulo text-right">arquivos</span>
        </div>
        <ul className="max-h-[600px] overflow-y-auto">{biblioteca.itens.map((item) => <Linha key={item.id} item={item} />)}</ul>
        <p className="border-t border-linha px-4 py-3 text-[10.5px] leading-relaxed text-tinta-3">Itens de clientes aparecem sem nome e sem caminho. A tela é um índice de leitura: não há botão de abrir, baixar ou publicar porque nenhuma referência mostrou essas ações na Biblioteca.</p>
      </section>
    </div>
  )
}

function Linha({ item }: { item: ItemBiblioteca }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_70px] items-center gap-3 border-b border-linha px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_170px_100px_90px]">
      <div className="min-w-0"><div className="truncate text-[12.5px] text-tinta" title={item.origem === 'cliente' ? undefined : item.rotulo}>{item.rotulo}</div><div className="mt-1 flex items-center gap-2 sm:hidden"><Pilula tom={item.acessivel ? 'neutro' : 'vermelho'}>{NOME_ORIGEM[item.origem]}</Pilula></div></div>
      <div className="hidden sm:block"><Pilula tom={item.acessivel ? 'neutro' : 'vermelho'}>{NOME_ORIGEM[item.origem]}</Pilula></div>
      <span className="rotulo hidden !normal-case !tracking-normal sm:block">{item.modificado ? new Date(item.modificado).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</span>
      <span className="text-right font-mono text-[11px] text-tinta-2">{item.arquivos ?? '—'}</span>
    </li>
  )
}
