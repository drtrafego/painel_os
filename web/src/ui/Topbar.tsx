import { Icone } from './Icone'
import { Pilula, type Tom } from './primitivos'
import { SeletorDeData } from './SeletorDeData'
import type { AgenteSessao, Estado } from '../dados/tipos'

/**
 * A pilula do topo. Nao ha `?? 0` aqui, e isso e o ponto:
 *
 * com `(a.verificador.checagens ?? 0)`, verificador ilegivel somava zero e a
 * frase virava "0 CHECAGENS NO VERDE", em VERDE, no lugar mais visivel da
 * tela. Ausencia de medicao aparecendo como aprovacao. O denominador que nao
 * existe nao vira zero: vira "nao consegui ler o verificador de X", em tom
 * neutro, com o nome de quem nao deu pra ler.
 */
function ilegivel(s: AgenteSessao): boolean {
  const v = s.verificador
  return v.checagens === null || v.reprovadas === null || v.indeterminadas === null
}

export function Topbar({
  hora,
  estado,
  vista,
  aoAbrirMenu,
  expandido,
  aoAlternarExpandido,
}: {
  hora: string
  estado: Estado
  vista: string
  aoAbrirMenu: () => void
  expandido?: boolean
  aoAlternarExpandido?: () => void
}) {
  const naoLidos = estado.sessao.filter(ilegivel)
  const lidos = estado.sessao.filter((s) => !ilegivel(s))
  const soma = (f: (s: AgenteSessao) => number | null) =>
    lidos.reduce((total, s) => total + (f(s) as number), 0)

  const checagens = soma((s) => s.verificador.checagens)
  const reprovadas = soma((s) => s.verificador.reprovadas)
  const indeterminadas = soma((s) => s.verificador.indeterminadas)
  const vencido = estado.sessao.some((s) => s.verificador.vencido === true)
  const nomes = naoLidos.map((s) => s.nome).join(' e ')

  let tom: Tom = 'neutro'
  let frase = ''
  if (vencido) {
    tom = 'vermelho'
    frase = 'rodada vencida: o cron não rodou'
  } else if (reprovadas > 0) {
    tom = 'ambar'
    frase =
      `${reprovadas} de ${checagens} checagens reprovadas` +
      (indeterminadas > 0 ? ` · ${indeterminadas} indeterminadas` : '') +
      (naoLidos.length ? ` · ${nomes} ilegível` : '')
  } else if (naoLidos.length) {
    tom = 'neutro'
    frase = `não consegui ler o verificador de ${nomes}`
  } else if (indeterminadas > 0) {
    // Indeterminada nao passou: ela nao conseguiu medir. Contar como verde e
    // a mesma familia do zero de cima.
    tom = 'ambar'
    frase = `${indeterminadas} de ${checagens} checagens não conseguiram medir`
  } else if (checagens > 0) {
    tom = 'verde'
    frase = `${checagens} checagens no verde`
  } else {
    tom = 'neutro'
    frase = 'nenhuma checagem para ler'
  }

  const aoClicarExpandir = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      } else {
        document.exitFullscreen().catch(() => {})
      }
    } else {
      aoAlternarExpandido?.()
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-linha bg-topo/70 px-3 sm:px-5">
      <button
        type="button"
        onClick={aoAbrirMenu}
        aria-label="abrir o menu das doze telas"
        className="grid size-7 shrink-0 place-items-center rounded-md border border-linha text-tinta-2 transition-colors hover:text-tinta lg:hidden"
      >
        <Icone nome="menu" tamanho={15} />
      </button>
      <span className="min-w-0 truncate font-mono text-[10.5px] whitespace-nowrap text-tinta-3">
        gastao-os <span className="text-linha-forte">/</span>{' '}
        <span className="text-tinta-2">{vista}</span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
        {/* Seletor de Datas Interativo */}
        <SeletorDeData />

        <span className="rotulo hidden xl:inline">
          convocações de agente{' '}
          <span className="text-tinta-2">{estado.resumo.convocacoes_casa.toLocaleString('pt-BR')}</span>
        </span>
        <span
          className="hidden sm:inline"
          title={
            naoLidos
              .map((s) => `${s.nome}: ${s.verificador.erro_leitura ?? 'sem motivo escrito'}`)
              .join(' · ') || undefined
          }
        >
          <Pilula tom={tom}>{frase}</Pilula>
        </span>
        <span className="font-mono text-[12px] tabular-nums text-tinta-2">{hora}</span>

        {aoAlternarExpandido && (
          <button
            type="button"
            onClick={aoClicarExpandir}
            title={
              expandido
                ? 'Usar largura padrão (centralizado) · Shift+Clique para tela cheia do navegador'
                : 'Expandir para a tela toda (100% da largura) · Shift+Clique para tela cheia do navegador'
            }
            aria-label={expandido ? 'Usar largura padrão' : 'Expandir para tela toda'}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-linha bg-carta/50 text-tinta-2 transition-all hover:border-linha-forte hover:bg-carta hover:text-tinta active:scale-95"
          >
            <Icone nome={expandido ? 'tela-normal' : 'tela-cheia'} tamanho={14} />
          </button>
        )}
      </div>
    </header>
  )
}
