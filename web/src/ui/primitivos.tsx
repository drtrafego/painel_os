import type { ReactNode } from 'react'
import { SeletorDeData } from './SeletorDeData'

const TOM = {
  verde: { texto: 'text-verde', ponto: 'bg-verde', fundo: 'bg-verde/10', borda: 'border-verde/25' },
  lima: { texto: 'text-lima', ponto: 'bg-lima', fundo: 'bg-lima/10', borda: 'border-lima/25' },
  ambar: { texto: 'text-ambar', ponto: 'bg-ambar', fundo: 'bg-ambar/10', borda: 'border-ambar/25' },
  vermelho: { texto: 'text-vermelho', ponto: 'bg-vermelho', fundo: 'bg-vermelho/10', borda: 'border-vermelho/25' },
  neutro: { texto: 'text-tinta-3', ponto: 'bg-tinta-3', fundo: 'bg-white/4', borda: 'border-linha-forte' },
} as const

export type Tom = keyof typeof TOM

/** Só a cor do texto de cada tom, para quem mostra o tom sem a pílula. */
export const TEXTO_DO_TOM = Object.fromEntries(
  Object.entries(TOM).map(([nome, t]) => [nome, t.texto]),
) as Record<Tom, string>

export function Pilula({ tom = 'neutro', ponto = true, children }: { tom?: Tom; ponto?: boolean; children: ReactNode }) {
  const t = TOM[tom]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] ${t.fundo} ${t.borda}`}>
      {ponto && <span className={`size-[5px] rounded-full ${t.ponto}`} />}
      <span className={`font-mono text-[9px] leading-none tracking-[0.14em] uppercase ${t.texto}`}>{children}</span>
    </span>
  )
}

/** Numero medido. Valor null vira traco: painel nao inventa numero. */
export function Numero({
  rotulo, valor, cor = 'text-tinta', tamanho = 'text-[26px]',
}: { rotulo: string; valor: number | string | null | undefined; cor?: string; tamanho?: string }) {
  const vazio = valor === null || valor === undefined || valor === ''
  const texto = vazio ? '—' : typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor
  return (
    <div data-numero className="min-w-0">
      <div className="rotulo mb-1.5 truncate" title={rotulo}>{rotulo}</div>
      <div
        className={`font-serif leading-none ${tamanho} ${vazio ? 'text-tinta-3' : cor}`}
        title={vazio ? 'nao ha registro deste numero' : undefined}
      >
        {texto}
      </div>
    </div>
  )
}

export function Barra({
  fracao, cor = 'var(--color-lima)', altura = 3,
}: { fracao: number | null; cor?: string; altura?: number }) {
  const vazio = fracao === null || Number.isNaN(fracao)
  const largura = vazio ? 0 : Math.max(0, Math.min(1, fracao)) * 100
  return (
    <div className="w-full rounded-full bg-white/6" style={{ height: altura }}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${largura}%`, background: cor, boxShadow: vazio ? undefined : `0 0 10px -2px ${cor}` }}
      />
    </div>
  )
}

export function Secao({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="rotulo min-w-0 whitespace-normal sm:whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-linha" />
    </div>
  )
}

/**
 * O CABECALHO-ATOMO: barrinha vertical na cor do dono + rotulo micro em caixa
 * alta + meta a direita em mono. E o componente mais reaproveitado do sistema
 * de referencia ("| DIRECTIVA ACTUAL ......... firmada 06:31") e e o que
 * costura a tela: sem ele, cada cartao parece de um painel diferente.
 */
export function Cabecalho({
  cor = 'var(--color-tinta-3)',
  children,
  meta,
}: {
  cor?: string
  children: ReactNode
  meta?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="h-2.5 w-[2px] shrink-0 rounded-full" style={{ background: cor }} />
      <span className="rotulo">{children}</span>
      {meta !== undefined && (
        <>
          <span className="h-px min-w-4 flex-1 bg-linha" />
          <span className="rotulo shrink-0">{meta}</span>
        </>
      )}
    </div>
  )
}

/**
 * O cabecalho de uma das onze telas.
 *
 * ‼️ O TITULO TERMINA EM PONTO FINAL, e isso nao e descuido de revisao: e um
 * tique editorial da referencia, medido nos frames ("Red de agentes." · "Cola
 * de trabajo." · "Memoria compartida."). Sai de graca e e metade do que faz a
 * reproducao parecer a mesma coisa. O ponto vem escrito no texto que cada tela
 * passa, e nao concatenado aqui, pra ninguem apanhar no dia em que um titulo
 * precisar de outra pontuacao.
 */
export function TituloDaTela({
  titulo,
  pergunta,
  direita,
  mostrarSeletorData = true,
}: {
  titulo: string
  pergunta: string
  direita?: ReactNode
  mostrarSeletorData?: boolean
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
      <div className="min-w-0 flex-1">
        <h1 className="titulo-pagina">{titulo}</h1>
        <p className="rotulo mt-1.5">{pergunta}</p>
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:w-auto sm:shrink-0">
        {mostrarSeletorData && <SeletorDeData />}
        {direita}
      </div>
    </div>
  )
}

/** Cartão de KPI: rótulo micro em cima, número em serifa embaixo. Com efeito de profundidade 3D interativa. */
export function Kpi({
  rotulo,
  valor,
  nota,
  cor = 'text-tinta',
}: {
  rotulo: string
  valor: number | string | null | undefined
  nota?: string
  cor?: string
}) {
  const vazio = valor === null || valor === undefined || valor === ''
  const texto = vazio ? '—' : typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor
  return (
    <div
      data-kpi
      className="group relative overflow-hidden rounded-[10px] border border-linha bg-carta-alta/80 p-3.5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-linha-forte hover:shadow-lg hover:shadow-lima/10"
    >
      {/* Luz neon sutil de fundo ao passar o ponteiro */}
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-lima/5 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
      
      <div className="rotulo relative z-10 mb-2 truncate" title={rotulo}>
        {rotulo}
      </div>
      <div
        className={`font-serif text-[32px] leading-none relative z-10 ${vazio ? 'text-tinta-3' : cor}`}
        title={vazio ? 'não há registro deste número' : undefined}
      >
        {texto}
      </div>
      {nota && <div className="relative z-10 mt-2 font-mono text-[10px] leading-snug text-tinta-3">{nota}</div>}
    </div>
  )
}
