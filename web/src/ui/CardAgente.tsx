import { Icone, type NomeIcone } from './Icone'
import { Barra, Numero, Pilula, type Tom } from './primitivos'
import { atividade, diasParado, funcaoCurta } from '../dados/estado'
import type { Agente } from '../dados/tipos'

const ICONE_POR_ID: Record<string, NomeIcone> = {
  ceo: 'coroa', dev: 'codigo', qa: 'escudo', copy: 'texto', designer: 'pincel',
  analista: 'grafico', social: 'megafone', gestor: 'megafone', arquiteto: 'comando',
  deployer: 'seta', closer: 'pipeline', frank: 'grafico', lex: 'escudo', lara: 'bot',
  lp: 'pincel', paulo: 'pipeline', 'video-editor': 'pincel', 'video-validator': 'escudo',
  'vega-radar': 'radar', 'suri-estrategista': 'comando', 'theo-criador': 'texto',
  'cleo-produtor': 'texto', 'dani-designer': 'pincel', guardiao: 'escudo', maestro: 'coroa',
  'cont-radar': 'radar', 'cont-estrategista': 'comando', 'cont-copy': 'texto',
  'cont-designer': 'pincel', 'cont-qa': 'escudo', 'cont-corretor': 'escudo',
}

const TOM_ATIVIDADE: Record<string, Tom> = {
  recente: 'verde', semana: 'lima', parado: 'ambar', nunca: 'neutro',
}

export function CardAgente({
  agente, teto, cor, agora, aoAbrir, aoVivo, convocacoesJanela, rotuloJanela,
}: {
  agente: Agente
  teto: number
  cor: string
  agora: number
  aoAbrir?: () => void
  aoVivo?: { estado: 'trabalhando' | 'silencioso' | 'parado'; etapa?: string }
  convocacoesJanela?: number | null
  rotuloJanela?: string
}) {
  const at = atividade(agente, agora)
  const dias = diasParado(agente, agora)
  const totalConvocacoes = convocacoesJanela !== undefined ? convocacoesJanela : agente.convocacoes
  const fracao = totalConvocacoes === null ? null : teto > 0 ? totalConvocacoes / teto : 0

  return (
    <article
      className={
        'carta group flex flex-col p-3.5 text-left transition-colors duration-200 hover:border-linha-forte ' +
        (aoAbrir ? 'cursor-pointer' : '')
      }
      // Botao de verdade e nao div com onClick: o card e a porta do detalhe, e
      // quem navega por teclado tem que alcancar por Tab como todo mundo.
      {...(aoAbrir
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: aoAbrir,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                aoAbrir()
              }
            },
          }
        : {})}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-[7px] border"
          style={{ color: cor, borderColor: `color-mix(in oklab, ${cor} 26%, transparent)`, background: `color-mix(in oklab, ${cor} 11%, transparent)` }}
        >
          <Icone nome={ICONE_POR_ID[agente.id] ?? 'bot'} tamanho={14} />
        </span>
        <div className="flex items-center gap-1.5">
          {aoVivo?.estado === 'trabalhando' && (
            <span className="flex items-center gap-1 rounded-full border border-verde/30 bg-verde/10 px-2 py-0.5 font-mono text-[9px] text-verde animate-pulse" title={aoVivo.etapa ?? 'executando tarefa'}>
              <span className="size-1.5 rounded-full bg-verde" />
              ao vivo
            </span>
          )}
          <Pilula tom={TOM_ATIVIDADE[at.nivel]}>{at.texto}</Pilula>
        </div>
      </div>

      <h3 className="font-serif text-[19px] leading-tight text-tinta">{agente.nome}</h3>
      <p className="rotulo mt-1.5 line-clamp-2 !normal-case !tracking-normal text-[10.5px] leading-[1.45] text-tinta-3">
        {funcaoCurta(agente)}
      </p>

      <div className="mt-3.5 grid grid-cols-3 gap-2">
        <Numero rotulo={rotuloJanela ? `convoc. (${rotuloJanela})` : "convoc."} valor={totalConvocacoes} tamanho="text-[21px]" cor="text-tinta" />
        <Numero rotulo="últimas 24h" valor={agente.convocacoes_24h ?? null} tamanho="text-[21px]" cor="text-tinta-2" />
        <Numero rotulo="parado (d)" valor={dias} tamanho="text-[21px]" cor="text-tinta-2" />
      </div>

      <div className="mt-3">
        <Barra fracao={fracao} cor={cor} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-linha pt-2.5">
        <span className="rotulo">{agente.ferramentas ? `${agente.ferramentas.length} ferramentas` : 'ferramentas não declaradas'}</span>
        <span className={`font-mono text-[10px] ${agente.modelo ? 'text-tinta-2' : 'text-tinta-3'}`}>{agente.modelo ?? 'modelo não declarado'}</span>
      </div>
    </article>
  )
}
