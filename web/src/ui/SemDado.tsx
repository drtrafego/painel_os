import type { Dado } from '../nav/rotas'
import { Icone } from './Icone'

/**
 * A DECLARACAO HONESTA DE UMA VISTA QUE AINDA NAO TEM DADO.
 *
 * A regra desta casa, escrita: vista sem dado e PIOR que vista ausente. Ela
 * diz na tela que nao tem dado ainda, com essas palavras, em vez de mostrar
 * zero ou grafico bonito com numero inventado. Zero de erro e zero de ausencia
 * chegam na tela como a mesma coisa, e essa confusao ja custou um dia inteiro.
 *
 * O texto NAO e generico de proposito. Cada vista diz o que MOSTRARIA e o que
 * FALTA, porque essa lista e a fila de trabalho de amanha: correcao sem a lista
 * do que falta se apresenta como completa.
 */
export function SemDado({ dado, pergunta }: { dado: Dado; pergunta: string }) {
  if (dado.tipo !== 'nenhum') return null
  return (
    <section className="carta mt-4 max-w-2xl p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-2.5 w-[2px] shrink-0 rounded-full bg-tinta-3" />
        <span className="rotulo">esta tela não tem dado ainda</span>
      </div>
      <p className="font-serif text-[19px] leading-[1.35] text-tinta">
        Esta tela não tem dado ainda, e por isso não mostra número nenhum.
      </p>
      <p className="mt-3 text-[12.5px] leading-[1.6] text-tinta-2">
        Ela responderia <span className="text-tinta">{pergunta}</span>, mostrando{' '}
        {dado.mostraria}. Nada disso está desenhado em cinza esperando dado: se estivesse, você
        leria um zero e não teria como saber se ele é a medida ou a ausência dela.
      </p>
      <div className="mt-4 flex items-start gap-2.5 border-t border-linha pt-3.5">
        <span className="mt-[3px] shrink-0 text-ambar">
          <Icone nome="seta" tamanho={13} />
        </span>
        <p className="text-[12px] leading-[1.55] text-tinta-2">
          <span className="rotulo !text-ambar">o que falta</span>
          <span className="mt-1 block">{dado.falta}</span>
        </p>
      </div>
    </section>
  )
}

/**
 * A ressalva de uma vista que tem fonte, mas so pra parte do que promete.
 * Vai NO TOPO da tela, colada no conteudo, e nao numa secao de rodape:
 * cobertura parcial apresentada como completa e a mesma familia do numero sem
 * hora, e ressalva que ninguem acha e ressalva que nao existe.
 */
export function Parcial({ dado }: { dado: Dado }) {
  if (dado.tipo !== 'parcial') return null
  return (
    <div className="mt-3 rounded-lg border border-ambar/25 bg-ambar/6 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="h-2.5 w-[2px] shrink-0 rounded-full bg-ambar" />
        <span className="rotulo !text-ambar">esta tela mostra só parte</span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.55] text-tinta-2">
        <span className="text-tinta">Tem:</span> {dado.fonte}.{' '}
        <span className="text-tinta">Fica de fora:</span> {dado.deFora}.
      </p>
    </div>
  )
}
