import { Acoes, montarAcoes, type FiltroId } from '../ui/Acoes'
import { CardAgente } from '../ui/CardAgente'
import { CardComando } from '../ui/CardComando'
import { Detalhe } from '../ui/Detalhe'
import { Barra, Cabecalho, Pilula, Secao, TituloDaTela } from '../ui/primitivos'
import { corDoSquad } from '../ui/paleta'
import {
  ORDEM_SQUAD,
  atividade,
  encostados,
  porSquad,
} from '../dados/estado'
import { useAgentesVivos } from '../dados/useAgentesVivos'
import type { Origem } from '../dados/useEstado'
import type { VistaId, Vista } from '../nav/rotas'
import type { Agente, Estado, JanelaConvocacoes, Sop } from '../dados/tipos'
import { identificarJanela, type FaixaDeData } from '../ui/SeletorDeData'

function sopsDoEstado(estado: Estado): Sop[] {
  const dados = estado.sops
  return dados?.status === 'pronto' && Array.isArray(dados.itens) ? dados.itens : []
}

const CORES_AGENTE: Record<string, string> = {
  global: corDoSquad('global'),
  conteudo: corDoSquad('conteudo'),
  'pipeline-luana': corDoSquad('pipeline-luana'),
}

function Conector() {
  return (
    <div className="relative mx-auto my-1 hidden h-11 w-full max-w-5xl lg:block" aria-hidden="true">
      <span className="absolute top-0 left-1/4 h-[22px] w-px bg-linha-forte" />
      <span className="absolute top-0 left-3/4 h-[22px] w-px bg-linha-forte" />
      <span className="absolute top-[22px] left-[16.6%] h-px w-[66.8%] bg-linha-forte" />
      {['16.6%', '50%', '83.3%'].map((x) => (
        <span key={x} className="absolute top-[22px] h-[22px] w-px bg-linha-forte" style={{ left: x }}>
          <span className="absolute -bottom-[2px] -left-[2px] size-[5px] rounded-full bg-linha-forte" />
        </span>
      ))}
    </div>
  )
}

function Marcador({ origem, medidoEm, ms }: { origem: Origem; medidoEm: string; ms?: number }) {
  const hora = new Date(medidoEm).toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour12: false })
  if (origem === 'buscando') return <span className="rotulo">medindo agora…</span>
  if (origem === 'calculado-agora') {
    return (
      <span className="rotulo !text-verde">
        calculado ao abrir · {hora} utc{ms ? ` · ${ms}ms` : ''}
      </span>
    )
  }
  if (origem === 'coleta-em-andamento') {
    return (
      <span className="rotulo !text-ambar" title="a medição continua em segundo plano; estes números conservam a hora do snapshot salvo">
        coleta em andamento · snapshot de {hora} utc
      </span>
    )
  }
  if (origem === 'coletor-falhou') {
    return (
      <span className="rotulo !text-vermelho" title="o coletor não rodou nesta abertura; os números são do último arquivo gravado">
        coletor falhou · números de {hora} utc
      </span>
    )
  }
  return (
    <span className="rotulo !text-ambar" title="a API não respondeu; estes números são do arquivo do build">
      do arquivo · coletado {hora} utc
    </span>
  )
}

/**
 * O erro do coletor, na tela e por extenso. Sem isto o painel mostra numero
 * velho com cara de novo e o motivo morre no JSON, que ninguem abre.
 */
function AvisoColetor({ erro, medidoEm, agora }: { erro: string | null; medidoEm: string; agora: Date }) {
  const t = Date.parse(medidoEm)
  const quando = Number.isNaN(t)
    ? 'data que eu não sei ler'
    : new Date(t).toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false }) + ' utc'
  const horas = Number.isNaN(t) ? null : Math.floor((agora.getTime() - t) / 3_600_000)

  return (
    <div className="mb-3 rounded-xl border border-vermelho/40 bg-vermelho/8 p-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="size-[6px] shrink-0 rounded-full bg-vermelho" />
        <span className="rotulo !text-vermelho">o coletor falhou nesta abertura</span>
        <span className="h-px min-w-4 flex-1 bg-vermelho/20" />
        <span className="rotulo">dado gravado em {quando}{horas !== null && horas >= 1 ? ` · ${horas}h atrás` : ''}</span>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-tinta">
        Todo número desta tela é desse arquivo, não do momento em que você abriu. Não decida nada por
        eles: rode <span className="font-mono text-tinta-2">python3 coletor/coletar_estado.py</span> e
        leia o erro abaixo.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md border border-linha bg-fundo-2/60 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-tinta-2">
        {erro ?? 'o servidor não disse o motivo'}
      </pre>
    </div>
  )
}

export function Diretores({
  estado, agora, origem, erro, medidoEm, filtro, aoFiltrar, departamento, aoMudarDepartamento, aoIr, vista, faixa, aoMudarFaixa,
}: {
  estado: Estado
  agora: Date
  origem: Origem
  erro: string | null
  medidoEm: string
  filtro: FiltroId | null
  aoFiltrar: (id: FiltroId) => void
  departamento: 'todos' | Agente['squad']
  aoMudarDepartamento: (id: 'todos' | Agente['squad']) => void
  aoIr: (v: VistaId, quem?: string | null) => void
  vista: Vista
  faixa?: FaixaDeData
  aoMudarFaixa?: (f: FaixaDeData) => void
}) {
  const acoes = montarAcoes(estado, agora)
  const { dados: vivos } = useAgentesVivos()
  const mapaVivos = new Map((vivos?.agentes ?? []).map((a) => [a.id, a]))

  const janelaAtiva = identificarJanela(faixa)
  const janelas = estado.janelas
  const dadosJanela: JanelaConvocacoes = (janelas && janelas[janelaAtiva]) ? janelas[janelaAtiva] : {
    rotulo: 'Total histórico',
    total: estado.resumo.convocacoes_casa,
    por_agente: Object.fromEntries(estado.agentes.map(a => [a.id, a.convocacoes ?? 0])),
    arestas: estado.arestas,
    convocacoes_fora_da_casa: estado.convocacoes_fora_da_casa,
    mapa_src: '/mapas/quem-convoca-quem-total.html',
  }

  const idsEncostados = new Set(encostados(estado, agora.getTime()).map((a) => a.id))
  const idsHoje = new Set(
    estado.agentes
      .filter((a) => a.ultima_convocacao && Date.parse(a.ultima_convocacao) > agora.getTime() - 86_400_000)
      .map((a) => a.id),
  )
  const filtrar = (lista: Agente[]) => {
    if (filtro === 'encostados') return lista.filter((a) => idsEncostados.has(a.id))
    if (filtro === 'hoje') return lista.filter((a) => idsHoje.has(a.id))
    return lista
  }

  const ativosAgora = (vivos?.contagem?.trabalhando ?? 0)

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      {origem === 'coletor-falhou' && <AvisoColetor erro={erro} medidoEm={medidoEm} agora={agora} />}
      <TituloDaTela
        titulo="Rede de agentes."
        pergunta={vista.pergunta}
        faixa={faixa}
        aoMudarFaixa={aoMudarFaixa}
        direita={
          <>
            <Marcador origem={origem} medidoEm={medidoEm} ms={estado.calculo_ms} />
            {vivos?.ok && ativosAgora > 0 && (
              <span className="rotulo !text-verde font-bold animate-pulse">
                ● {ativosAgora} ao vivo
              </span>
            )}
            <span className="rotulo">{dadosJanela.total.toLocaleString('pt-BR')} convocações ({dadosJanela.rotulo})</span>
            <span className="rotulo">{estado.resumo.agentes_casa} agentes</span>
          </>
        }
      />

      <Acoes acoes={acoes} ativo={filtro} aoClicar={aoFiltrar} />
      {filtro && <Detalhe filtro={filtro} estado={estado} agora={agora} aoFechar={() => aoFiltrar(filtro)} />}

      <nav className="mt-5" aria-label="Navegar por departamento" data-departamentos>
        <div className="mb-2 flex items-center gap-2">
          <span className="rotulo">departamentos</span>
          <span className="h-px flex-1 bg-linha" />
          <span className="rotulo">{estado.agentes.length} especialistas</span>
        </div>
        <div className="flex flex-wrap gap-2 pb-1">
          <button
            type="button"
            aria-pressed={departamento === 'todos'}
            onClick={() => aoMudarDepartamento('todos')}
            className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${departamento === 'todos' ? 'border-lima/40 bg-lima/8' : 'border-linha bg-white/2 hover:border-linha-forte'}`}
          >
            <span className={`block font-mono text-[9px] uppercase tracking-[.18em] ${departamento === 'todos' ? 'text-lima' : 'text-tinta-3'}`}>visão geral</span>
            <span className="mt-1 block text-[12px] text-tinta">Toda a operação</span>
          </button>
          {ORDEM_SQUAD.map((id) => {
            const quantidade = porSquad(estado, id).length
            const ativo = departamento === id
            const cor = CORES_AGENTE[id]
            return (
              <button
                key={id}
                type="button"
                aria-pressed={ativo}
                onClick={() => aoMudarDepartamento(id)}
                className="min-w-[174px] shrink-0 rounded-lg border bg-white/2 px-3 py-2 text-left transition-colors hover:border-linha-forte"
                style={{ borderColor: ativo ? `color-mix(in oklab, ${cor} 42%, var(--color-linha))` : undefined }}
              >
                <span className="block font-mono text-[9px] uppercase tracking-[.18em]" style={{ color: ativo ? cor : 'var(--color-tinta-3)' }}>
                  {quantidade} agentes
                </span>
                <span className="mt-1 block truncate text-[12px] text-tinta">{estado.squads[id].nome}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-tinta-3">
          Departamento organiza responsabilidade. A ficha de cada agente mostra o contrato operacional que a fonte realmente declara.
        </p>
      </nav>

      <div className="mt-6">
        <Secao>camada de comando · roda no systemd, fala pelo telegram</Secao>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {estado.sessao.map((s) => <CardComando key={s.id} agente={s} />)}
      </div>

      <Conector />

      {departamento !== 'todos' && (
        <OperacoesDepartamento estado={estado} squadId={departamento} aoIr={aoIr} />
      )}

      {ORDEM_SQUAD.filter((squadId) => departamento === 'todos' || departamento === squadId).map((squadId) => {
        const agentes = filtrar(porSquad(estado, squadId))
        const getConvocacoes = (a: Agente) => {
          if (dadosJanela.por_agente && a.id in dadosJanela.por_agente) {
            return dadosJanela.por_agente[a.id]
          }
          if (janelaAtiva === 'total') return a.convocacoes ?? 0
          return 0
        }
        const teto = Math.max(...porSquad(estado, squadId).map(getConvocacoes), 1)
        if (agentes.length === 0) return null
        return (
          <div key={squadId} className="mb-6">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="rotulo whitespace-nowrap" style={{ color: CORES_AGENTE[squadId] }}>
                {estado.squads[squadId].nome}
              </span>
              <span className="text-[11.5px] text-tinta-3">{estado.squads[squadId].descricao}</span>
              <span className="h-px min-w-6 flex-1 bg-linha" />
              <span className="rotulo whitespace-nowrap">
                {agentes.length} {filtro === 'encostados' || filtro === 'hoje' ? 'em foco' : 'agentes'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {agentes.map((a) => (
                <CardAgente
                  key={a.id}
                  agente={a}
                  teto={teto}
                  convocacoesJanela={getConvocacoes(a)}
                  rotuloJanela={dadosJanela.rotulo}
                  cor={CORES_AGENTE[squadId]}
                  agora={agora.getTime()}
                  aoAbrir={() => aoIr('diretores', a.id)}
                  aoVivo={mapaVivos.get(a.id)}
                />
              ))}
            </div>
          </div>
        )
      })}

      <MapaQuemConvocaQuem dadosJanela={dadosJanela} />

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Repartido estado={estado} dadosJanela={dadosJanela} />
        <Encostados estado={estado} agora={agora} />
      </div>

      <footer className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-linha pt-3.5">
        <span className="rotulo">de onde veio cada número</span>
        {Object.entries(estado.fonte).map(([chave, valor]) => (
          <span key={chave} className="text-[10.5px] text-tinta-3">
            <span className="font-mono text-tinta-2">{chave}</span> · {valor}
          </span>
        ))}
      </footer>
    </div>
  )
}

function OperacoesDepartamento({
  estado, squadId, aoIr,
}: {
  estado: Estado
  squadId: Agente['squad']
  aoIr: (v: VistaId, quem?: string | null) => void
}) {
  const agentes = porSquad(estado, squadId)
  const ids = new Set(agentes.map((agente) => agente.id))
  const operacoes = sopsDoEstado(estado).filter((sop) => sop.agentes.some((id) => ids.has(id)))
  const cor = CORES_AGENTE[squadId]

  return (
    <section className="carta mb-4 overflow-hidden" data-operacoes-departamento>
      <div className="border-b border-linha px-4 py-3.5">
        <Cabecalho cor={cor} meta={`${operacoes.length} ${operacoes.length === 1 ? 'operação ligada' : 'operações ligadas'}`}>
          mapa operacional do departamento
        </Cabecalho>
        <p className="max-w-3xl text-[11.5px] leading-relaxed text-tinta-2">
          Cada fluxo abaixo vem de um SOP identificado no repositório. A ligação mostra quem executa e quais ferramentas a fonte declara, sem atribuir autonomia por inferência.
        </p>
      </div>
      {operacoes.length === 0 ? (
        <p className="px-4 py-4 text-[11.5px] leading-relaxed text-tinta-3">
          Nenhum SOP medido aponta para agentes deste departamento. Isso é uma lacuna de documentação, não ausência de processo.
        </p>
      ) : (
        <div className="grid gap-px bg-linha sm:grid-cols-2 xl:grid-cols-3">
          {operacoes.slice(0, 9).map((sop) => {
            const executores = sop.agentes.filter((id) => ids.has(id))
            return (
              <article key={sop.id} className="bg-carta px-4 py-3.5" data-sop={sop.id}>
                <div className="flex items-start gap-2.5">
                  <span className="mt-1 size-2 shrink-0 rounded-full border" style={{ borderColor: cor, background: `color-mix(in oklab, ${cor} 45%, transparent)` }} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] leading-snug text-tinta">{sop.nome}</h3>
                    <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-tinta-3">{sop.objetivo}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-linha pt-2.5">
                  <Pilula tom={/Gastão|confirmação|ordem explícita/i.test(sop.autonomia) ? 'ambar' : 'neutro'}>
                    {/Gastão|confirmação|ordem explícita/i.test(sop.autonomia) ? 'humano decide' : 'limite declarado'}
                  </Pilula>
                  <span className="rotulo">{sop.ferramentas.length} ferramentas</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {executores.map((id) => (
                    <button key={id} type="button" onClick={() => aoIr('diretores', id)} className="rounded border border-linha bg-white/3 px-2 py-1 font-mono text-[9px] text-tinta-2 transition-colors hover:border-lima/40 hover:text-lima">
                      abrir {estado.agentes.find((a) => a.id === id)?.nome ?? id}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Repartido({ estado, dadosJanela }: { estado: Estado; dadosJanela: JanelaConvocacoes }) {
  const getConvocacoes = (a: Agente) => {
    if (dadosJanela.por_agente && a.id in dadosJanela.por_agente) {
      return dadosJanela.por_agente[a.id]
    }
    return 0
  }
  const lista = [...estado.agentes]
    .map((a) => ({ ...a, convocacoesJanela: getConvocacoes(a) }))
    .sort((a, b) => b.convocacoesJanela - a.convocacoesJanela)
    .slice(0, 9)
  const teto = lista[0]?.convocacoesJanela || 1

  return (
    <section className="carta p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="rotulo">convocações por agente</span>
        <span className="rotulo">{dadosJanela.total.toLocaleString('pt-BR')} ({dadosJanela.rotulo})</span>
      </div>
      <div className="space-y-[9px]">
        {lista.map((a) => (
          <div key={a.id} className="flex items-center gap-2.5">
            <span className="w-[104px] shrink-0 truncate text-[11.5px] text-tinta-2">{a.nome}</span>
            <span className="flex-1"><Barra fracao={a.convocacoesJanela / teto} cor={CORES_AGENTE[a.squad]} altura={5} /></span>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-tinta-2">{a.convocacoesJanela}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        {estado.resumo.transcripts_lidos} transcripts lidos:{' '}
        {estado.resumo.convocacoes_por_motor
          ? `${estado.resumo.convocacoes_por_motor.codex} chamadas Codex e ${estado.resumo.convocacoes_por_motor.claude} Claude legado. `
          : ''}
        {Object.keys(dadosJanela.convocacoes_fora_da_casa || {}).length} identidades de execução não têm ficha própria no catálogo e ficam separadas.
      </p>
    </section>
  )
}

function Encostados({ estado, agora }: { estado: Estado; agora: Date }) {
  const parados = encostados(estado, agora.getTime())
  return (
    <section className="carta p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="rotulo">quem está encostado</span>
        <span className="rotulo">{parados.length} de {estado.resumo.agentes_casa}</span>
      </div>
      <ul className="space-y-[7px]">
        {parados.slice(0, 9).map((a) => {
          const at = atividade(a, agora.getTime())
          return (
            <li key={a.id} className="flex items-center gap-2.5 text-[11.5px]">
              <span className={`size-[5px] shrink-0 rounded-full ${at.nivel === 'nunca' ? 'bg-tinta-3' : 'bg-ambar'}`} />
              <span className="truncate text-tinta-2">{a.nome}</span>
              <span className="h-px flex-1 bg-linha" />
              <span className="rotulo shrink-0">{at.texto}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        Medido pelas convocações registradas nos transcripts. Agente sem nenhuma nunca foi chamado,
        e isso é fato do registro, não juízo sobre a utilidade dele.
      </p>
    </section>
  )
}

/**
 * MAPA INTERATIVO: QUEM CONVOCA QUEM
 *
 * Exibe o fluxo geral da casa agregando Luana, Renato e Bia convocando
 * especialistas agrupados por squad e subagentes sem cargo como "outros".
 * Respeita a janela ativa de dados ('hoje', '7d', '30d', 'total').
 */
function MapaQuemConvocaQuem({ dadosJanela }: { dadosJanela: JanelaConvocacoes }) {
  return (
    <section className="carta mt-6 w-full min-w-0 overflow-hidden" aria-labelledby="mapa-fluxo-quem-convoca-quem">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-4 py-4">
        <div className="min-w-0 max-w-2xl flex-1">
          <Cabecalho cor="var(--color-lima)" meta={`${dadosJanela.total} chamadas · ${dadosJanela.arestas.length} ligações`}>
            quem convoca quem
          </Cabecalho>
          <p id="mapa-fluxo-quem-convoca-quem" className="mt-1 text-[12px] leading-relaxed text-tinta-2">
            Fluxo geral da casa ({dadosJanela.rotulo}): diretores (Luana, Renato e Bia) convocando especialistas e subagentes agrupados por squad.
          </p>
        </div>
        <a
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-linha px-3 py-2 text-[11px] text-lima transition-colors hover:border-linha-forte hover:bg-white/5"
          href={dadosJanela.mapa_src}
          target="_blank"
          rel="noreferrer"
        >
          abrir mapa completo ↗
        </a>
      </div>
      <div className="bg-black/10 p-2 sm:p-3">
        <iframe
          className="h-[min(76vw,520px)] min-h-[340px] w-full rounded-lg border border-linha bg-[#101215]"
          src={dadosJanela.mapa_src}
          title={`Quem convoca quem - ${dadosJanela.rotulo}`}
          loading="lazy"
        />
      </div>
      <p className="border-t border-linha px-4 py-3 text-[10.5px] leading-relaxed text-tinta-3">
        O mapa é um artefato versionado gerado a partir das convocações reais da janela ativa. Use o link para abrir a leitura completa em nova aba com tema e centralização.
      </p>
    </section>
  )
}
