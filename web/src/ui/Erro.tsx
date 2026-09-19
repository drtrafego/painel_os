import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * A REDE POR BAIXO DA TELA.
 *
 * Sem isto, um erro em QUALQUER vista derruba a arvore inteira e o navegador
 * fica BRANCO: some o painel e some o motivo junto, que e o pior desfecho.
 * Foi exatamente o buraco que um QA apontou: dado incompleto derrubava a tela,
 * em branco, sem error boundary.
 *
 * Ela nao conserta nada e nao tenta: mostra QUE vista quebrou, COM que erro, e
 * deixa a navegacao de pe pra pessoa ir pra outra. Falhar alto e visivel.
 */
type Props = { children: ReactNode; ondeEstava: string }
type Estado = { erro: Error | null }

export class Rede extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // Com contexto: `console.error('aqui')` nao ajuda ninguem as duas da manha.
    console.error(`[painel] a vista "${this.props.ondeEstava}" quebrou`, erro, info.componentStack)
  }

  /** Trocar de vista tem que limpar o erro, senao a tela fica presa nele. */
  componentDidUpdate(anterior: Props) {
    if (anterior.ondeEstava !== this.props.ondeEstava && this.state.erro) {
      this.setState({ erro: null })
    }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-xl border border-vermelho/40 bg-vermelho/8 p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="size-[6px] shrink-0 rounded-full bg-vermelho" />
            <span className="rotulo !text-vermelho">esta tela quebrou ao desenhar</span>
          </div>
          <p className="font-serif text-[21px] leading-tight text-tinta">
            A vista “{this.props.ondeEstava}” não conseguiu ser desenhada.
          </p>
          <p className="mt-3 text-[12.5px] leading-[1.6] text-tinta-2">
            As outras telas continuam abrindo: use o menu. Nada aqui foi salvo e nada foi perdido,
            porque este painel só lê disco. O erro exato está abaixo e também no console do
            navegador, com o rastro do componente.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-linha bg-fundo-2/60 p-2.5 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-tinta-2">
            {this.state.erro.message || String(this.state.erro)}
          </pre>
        </div>
      </div>
    )
  }
}

/**
 * O estado chegou e NAO passou na validacao.
 *
 * Isto nao e enfeite defensivo: e a outra metade da validacao. Validar sozinho
 * e metade; a outra metade e o que acontece quando rejeita. Aqui o dado
 * invalido nao e usado, nao vira zero, e o motivo aparece por extenso com o
 * caminho de cada campo, que e o que permite consertar o coletor em um minuto
 * em vez de abrir um JSON de 40 mil bytes procurando.
 */
export function EstadoInvalido({
  problemas,
  origem,
  aoTentarDeNovo,
}: {
  problemas: string[]
  origem: string
  aoTentarDeNovo?: () => void
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-vermelho/40 bg-vermelho/8 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className="size-[6px] shrink-0 rounded-full bg-vermelho" />
          <span className="rotulo !text-vermelho">o estado não passou na conferência</span>
          <span className="h-px min-w-4 flex-1 bg-vermelho/20" />
          <span className="rotulo">{problemas.length} problema(s)</span>
        </div>
        <p className="font-serif text-[22px] leading-tight text-tinta">
          O painel não vai mostrar esses números.
        </p>
        <p className="mt-3 text-[12.5px] leading-[1.6] text-tinta-2">
          O estado que chegou de <span className="font-mono text-tinta">{origem}</span> tem campo
          faltando ou com o tipo errado. Mostrar assim significaria inventar o que falta, e campo
          que falta vira zero na tela sem ninguém perceber. Então nada é mostrado, e o motivo vai
          inteiro aqui embaixo: cada linha é o caminho exato do campo no JSON.
        </p>
        <ul className="mt-3.5 max-h-72 space-y-1 overflow-y-auto rounded-md border border-linha bg-fundo-2/60 p-2.5">
          {problemas.slice(0, 60).map((p) => (
            <li key={p} className="font-mono text-[10.5px] leading-relaxed text-tinta-2">
              {p}
            </li>
          ))}
          {problemas.length > 60 && (
            <li className="rotulo pt-1">e mais {problemas.length - 60}, não listados aqui</li>
          )}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-vermelho/20 pt-3.5">
          <span className="rotulo">
            conserto: <span className="font-mono">python3 coletor/coletar_estado.py</span>
          </span>
          {aoTentarDeNovo && (
            <button
              type="button"
              onClick={aoTentarDeNovo}
              className="rounded-md border border-verde/40 bg-verde/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-verde uppercase transition-colors hover:bg-verde/16"
            >
              buscar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
