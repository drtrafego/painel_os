import { SemDado } from '../ui/SemDado'
import { TituloDaTela } from '../ui/primitivos'
import type { Vista } from '../nav/rotas'
import type { Estado } from '../dados/tipos'

/**
 * O pacote que TODA tela recebe. Um tipo so, e por isso acrescentar tela e
 * escrever o componente e mais nada: a assinatura ja existe.
 */
export type PropsTela = {
  estado: Estado
  agora: Date
  medidoEm: string
  vista: Vista
}

/**
 * AS TELAS QUE AINDA NAO TEM DADO.
 *
 * Sao um componente so, parametrizado pela entrada em `nav/rotas.ts`, pelo
 * mesmo motivo que o detalhe do diretor e um componente so: a espec visual
 * mediu que a referencia usa template identico trocando so cor, icone e
 * conteudo. Acrescentar tela e acrescentar entrada.
 *
 * ‼️ E ELAS DIZEM NA TELA QUE NAO TEM DADO, com essas palavras, em vez de
 * mostrarem zero ou grafico bonito com numero inventado. Vista sem dado e pior
 * que vista ausente: uma tela vazia parece o sistema funcionando e sem
 * trabalho, quando o que ha e trabalho sem sistema.
 *
 * ⚠️ E NENHUMA DELAS TEM REFERENCIA VISUAL. A espec de 08/09 abriu os 18 frames
 * um a um: destas seis (Agenda, Ferramentas, Pipeline, Analitica, Biblioteca e
 * Chat) NAO EXISTE UMA IMAGEM. Entao aqui esta a estrutura e o que falta, e nao
 * uma imitacao: dizer que estas telas estao iguais a referencia seria afirmar
 * semelhanca com uma coisa que ninguem viu.
 */
export function TelaSemDado({ vista }: { vista: Vista }) {
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
      <TituloDaTela
        titulo={vista.nome + '.'}
        pergunta={vista.pergunta}
        direita={<span className="rotulo !text-tinta-3">sem fonte de dado hoje</span>}
      />
      <SemDado dado={vista.dado} pergunta={vista.pergunta} />
      <p className="mt-4 max-w-2xl text-[11px] leading-[1.6] text-tinta-3">
        Esta tela também não tem referência visual: dos 18 frames do sistema que estamos
        reproduzindo, nenhum a mostra. O que está aqui é a estrutura e o que falta, e não uma
        imitação — parecer com o original é uma afirmação que ninguém pode conferir hoje.
      </p>
    </div>
  )
}
