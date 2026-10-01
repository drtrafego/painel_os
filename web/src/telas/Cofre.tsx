import { useEffect, useMemo, useRef, useState } from 'react'
import { buscarNos, chaveRelacao, descreverRelacao, relacoesDoCaminho } from '../dados/cofre-confianca'
import { CofreConfianca } from '../ui/CofreConfianca'
import {
  caminhoMaisCurto, corDaArea, corDaAreaEscuro, encurtar, escolherRotulos,
  posicionarCofre, raioDeToque, CAIXA_CELULAR, CAIXA_MESA, FONTE_ROTULO, type Caixa, type Posto,
} from '../dados/cofre'
import type { ArestaCofre, Estado, NoMemoria } from '../dados/tipos'
import { Parcial } from '../ui/SemDado'
import { Cabecalho, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'
import { Grafo3DCofre } from '../ui/Grafo3DCofre'
import { PainelInstrumentoCofre } from '../ui/PainelInstrumentoCofre'
import { useRota } from '../nav/useRota'
import { useAgentesVivos } from '../dados/useAgentesVivos'
import { PIXEL_AGENTS, PIXEL_AGENT_SQUADS, mesclarRuntimesNoCatalogo, resolverAgenteNoCatalogo } from '../dados/pixel-agents'

function useFps(): number {
  const [fps, setFps] = useState(60)
  const quadrosRef = useRef(0)
  const ultimoTempoRef = useRef(performance.now())

  useEffect(() => {
    let handle: number
    let ativo = true

    const medir = () => {
      if (document.hidden) {
        return
      }
      quadrosRef.current++
      const agora = performance.now()
      if (agora - ultimoTempoRef.current >= 1000) {
        setFps(Math.round((quadrosRef.current * 1000) / (agora - ultimoTempoRef.current)))
        quadrosRef.current = 0
        ultimoTempoRef.current = agora
      }
      if (ativo) {
        handle = requestAnimationFrame(medir)
      }
    }

    const aoMudarVisibilidade = () => {
      if (!document.hidden) {
        ultimoTempoRef.current = performance.now()
        quadrosRef.current = 0
        handle = requestAnimationFrame(medir)
      }
    }

    document.addEventListener('visibilitychange', aoMudarVisibilidade)
    if (!document.hidden) {
      handle = requestAnimationFrame(medir)
    }

    return () => {
      ativo = false
      cancelAnimationFrame(handle)
      document.removeEventListener('visibilitychange', aoMudarVisibilidade)
    }
  }, [])

  return fps
}

function usarEstreito(): boolean {
  const [estreito, setEstreito] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  )
  useEffect(() => {
    const consulta = window.matchMedia('(max-width: 1023px)')
    const ouvir = () => setEstreito(consulta.matches)
    consulta.addEventListener('change', ouvir)
    return () => consulta.removeEventListener('change', ouvir)
  }, [])
  return estreito
}

export type ModoLayout = 'multi-anel' | 'orbita' | 'hierarquia'

function Mapa({
  nos, arestas, caixa, ordemAreas, escolhido, alvo, areaFoco, sempreVisiveis, caminho,
  modoComando,
  aoEscolher, aoLigar,
}: {
  nos: NoMemoria[]
  arestas: ArestaCofre[]
  caixa: Caixa
  ordemAreas: string[]
  escolhido: string
  alvo: string | null
  areaFoco: string | null
  sempreVisiveis: string[]
  caminho: string[] | null
  modoLayout?: ModoLayout
  animarSinal?: boolean
  modoComando?: boolean
  aoEscolher: (id: string) => void
  aoLigar: (id: string) => void
}) {
  const nosFiltrados = useMemo(
    () => (areaFoco === null ? nos : nos.filter((n) => n.area === areaFoco || sempreVisiveis.includes(n.area))),
    [nos, areaFoco, sempreVisiveis],
  )
  const mapaPostos = useMemo(
    () => posicionarCofre(nosFiltrados, caixa, ordemAreas),
    [nosFiltrados, caixa, ordemAreas],
  )
  const postos = useMemo(() => Array.from(mapaPostos.values()), [mapaPostos])

  const { arestasVisiveis } = useMemo(() => {
    const vis: Array<{ de: Posto; para: Posto; a: ArestaCofre }> = []
    for (const a of arestas) {
      const pDe = mapaPostos.get(a.de)
      const pPara = mapaPostos.get(a.para)
      if (pDe && pPara) {
        vis.push({ de: pDe, para: pPara, a })
      }
    }
    return { arestasVisiveis: vis }
  }, [arestas, mapaPostos])

  const arestasDoSalto = useMemo(
    () => relacoesDoCaminho(caminho, arestas),
    [caminho, arestas],
  )

  const rotulos = useMemo(
    () => {
      const getNome = (id: string) => nos.find((n) => n.id === id)?.rotulo ?? id
      const getPrioridade = (id: string) => nos.find((n) => n.id === id)?.grau ?? 1
      return escolherRotulos(mapaPostos, getNome, getPrioridade, caixa)
    },
    [mapaPostos, nos, caixa],
  )

  const clique = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey) aoLigar(id)
    else aoEscolher(id)
  }

  return (
    <>
      <div className={`poco relative mx-auto overflow-hidden rounded-xl border transition-all ${
        modoComando ? 'border-sky-500/40 bg-[#070b14] shadow-[0_0_30px_rgba(56,189,248,0.1)]' : 'border-linha bg-fundo'
      }`} style={{ maxWidth: caixa.largura }}>
        <svg
          viewBox={`0 0 ${caixa.largura} ${caixa.altura}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Grafo do Cofre de conhecimento"
        >
          <g className="arestas" strokeLinecap="round">
            {arestasVisiveis.map(({ de, para, a }) => {
              const chave = chaveRelacao(a)
              const noSalto = arestasDoSalto.has(chave)
              const tocaEscolhido = a.de === escolhido || a.para === escolhido
              const tocaAlvo = alvo !== null && (a.de === alvo || a.para === alvo)
              const destaque = noSalto || tocaEscolhido || tocaAlvo
              const cor = noSalto
                ? '#F59E0B'
                : destaque
                ? (modoComando ? '#38BDF8' : 'var(--color-tinta)')
                : a.ponte
                ? (modoComando ? 'rgba(56,189,248,0.2)' : 'color-mix(in srgb, var(--color-linha-forte) 75%, transparent)')
                : (modoComando ? 'rgba(56,189,248,0.1)' : 'var(--color-linha)')
              return (
                <line
                  key={chave}
                  x1={de.x} y1={de.y} x2={para.x} y2={para.y}
                  stroke={cor}
                  strokeWidth={noSalto ? 2.5 : destaque ? 1.8 : 1}
                  strokeDasharray={descreverRelacao(a).sugerida ? '4 4' : a.ponte && !destaque ? '3 3' : undefined}
                />
              )
            })}
          </g>

          <g className="nos">
            {postos.map((p) => {
              const ehEscolhido = p.id === escolhido
              const ehAlvo = p.id === alvo
              const noSalto = caminho ? caminho.includes(p.id) : false
              const cor = (modoComando ? corDaAreaEscuro : corDaArea)(p.area)
              return (
                <g key={p.id} onClick={(e) => clique(e, p.id)} className="cursor-pointer">
                  <circle cx={p.x} cy={p.y} r={raioDeToque(p.raio, 24)} fill="transparent" />
                  <circle
                    cx={p.x} cy={p.y} r={p.raio}
                    fill={ehEscolhido ? (modoComando ? '#38BDF8' : 'var(--color-tinta)') : cor}
                    stroke={ehAlvo || noSalto ? '#F59E0B' : ehEscolhido ? '#FFFFFF' : 'rgba(0,0,0,0.4)'}
                    strokeWidth={ehAlvo || noSalto ? 2.5 : ehEscolhido ? 2 : 1}
                  />
                </g>
              )
            })}
          </g>

          <g className="rotulos pointer-events-none">
            {rotulos.map((r) => (
              <text
                key={r.id}
                x={r.x} y={r.y}
                textAnchor="middle"
                fill={r.id === escolhido ? '#38BDF8' : modoComando ? '#94A3B8' : 'var(--color-tinta-2)'}
                fontSize={caixa.fonteRotulo ?? FONTE_ROTULO}
                fontFamily="var(--font-mono)"
                fontWeight={r.id === escolhido ? '700' : '400'}
              >
                {r.texto}
              </text>
            ))}
          </g>
        </svg>
      </div>
    </>
  )
}

/** Aba Principal: Cérebro Operacional Vivo */
function VisaoOperacao({
  estado,
  aoIrAtivos,
  aoIrConhecimento,
  aoIrAprovacoes,
}: {
  estado: Estado
  aoIrAtivos: (chave?: string) => void
  aoIrConhecimento: () => void
  aoIrAprovacoes: () => void
}) {
  const { dados: vivos, statusLeitura, recebidoEm, erro: erroSonda } = useAgentesVivos()
  const listaVivos = vivos?.agentes ?? []
  const ativosTrabalhando = listaVivos.filter((a) => a.estado === 'trabalhando')
  const aprovacoesItens = estado.aprovacoes?.itens ?? []
  const aprovacoesPendentes = aprovacoesItens.filter((i) => i.estado === 'aguardando' || i.estado === 'pendente')

  // Catálogo dinâmico mesclado com runtimes ao vivo
  const catalogoMesclado = useMemo(
    () => mesclarRuntimesNoCatalogo(PIXEL_AGENTS, listaVivos),
    [listaVivos]
  )

  // Console de Mudanças Detectadas entre Snapshots
  const [logMudancas, setLogMudancas] = useState<Array<{ hora: string; texto: string; tipo: 'ativo' | 'alerta' | 'info' }>>([])
  const agentesAnterioresRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!vivos?.ok) return
    const agora = new Date().toLocaleTimeString('pt-BR')
    const novoMapa = new Map<string, string>()
    const logsNovos: typeof logMudancas = []

    for (const ag of listaVivos) {
      const chave = ag.dono ? `${ag.dono}:${ag.id}` : ag.id
      novoMapa.set(chave, ag.estado)
      const anterior = agentesAnterioresRef.current.get(chave)
      if (anterior === undefined && ag.estado === 'trabalhando') {
        logsNovos.push({
          hora: agora,
          texto: `Execução detectada: ${ag.nome || ag.id} (${ag.dono || 'global'}) · ${ag.ferramenta ? `ferramenta ${ag.ferramenta}` : 'trabalhando'}`,
          tipo: 'ativo',
        })
      } else if (anterior && anterior !== ag.estado) {
        logsNovos.push({
          hora: agora,
          texto: `Transição de estado: ${ag.nome || ag.id} agora está ${ag.estado}`,
          tipo: 'info',
        })
      }
    }

    // Detecta agentes que saíram (Blocker 7: Ausente na leitura seguinte: ${nome || chave})
    for (const [chave, estadoAnt] of agentesAnterioresRef.current.entries()) {
      if (!novoMapa.has(chave) && estadoAnt === 'trabalhando') {
        logsNovos.push({
          hora: agora,
          texto: `Ausente na leitura seguinte: ${chave}`,
          tipo: 'info',
        })
      }
    }

    if (logsNovos.length > 0) {
      setLogMudancas((prev) => [...logsNovos, ...prev].slice(0, 8))
    }
    agentesAnterioresRef.current = novoMapa
  }, [vivos, listaVivos])

  // Contagem dinâmica por squad resolvida via catálogo compartilhado (Blocker 6)
  const ativosCoordenacao = useMemo(
    () =>
      ativosTrabalhando.filter(
        (a) => resolverAgenteNoCatalogo(a, catalogoMesclado)?.squad === 'coordenação'
      ),
    [ativosTrabalhando, catalogoMesclado]
  )

  const squadsComAtivos = useMemo(() => {
    return PIXEL_AGENT_SQUADS.filter((s) => s.id !== 'coordenação').map((squad) => {
      const ativosDoDepto = ativosTrabalhando.filter(
        (a) => resolverAgenteNoCatalogo(a, catalogoMesclado)?.squad === squad.id
      )
      return {
        ...squad,
        ativos: ativosDoDepto,
      }
    })
  }, [ativosTrabalhando, catalogoMesclado])

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4 font-mono">
      {/* Botões de Ação no Topo do Cérebro */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-black bg-[#0f172a] p-3 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-3 rounded-full bg-[#a3e635] shadow-[0_0_8px_#a3e635] animate-pulse" />
          <span className="text-xs sm:text-sm font-black uppercase text-[#facc15] truncate">
            CENTRO DA OPERAÇÃO · SISTEMA NERVOSO G4ST40VIB3
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => aoIrAtivos()}
            className="flex items-center gap-1.5 border-2 border-black bg-[#a3e635] px-3 py-1 text-xs font-black uppercase text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#bef264]"
          >
            <span>🎮 VER ATIVOS NO ESCRITÓRIO ({ativosTrabalhando.length})</span>
          </button>
          <button
            type="button"
            onClick={aoIrConhecimento}
            className="flex items-center gap-1.5 border-2 border-black bg-[#38bdf8] px-3 py-1 text-xs font-black uppercase text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#7dd3fc]"
          >
            <span>📚 EXPLORAR CONHECIMENTO</span>
          </button>
        </div>
      </div>

      {/* Alerta Âmbar de Decisões Humanas */}
      {aprovacoesPendentes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-amber-500/60 bg-[#451a03]/80 p-3 text-amber-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-[#facc15] animate-ping" />
            <span className="text-xs font-bold uppercase">
              ⚠️ {aprovacoesPendentes.length} decisão(ões) aguardando liberação na fila
            </span>
          </div>
          <button
            type="button"
            onClick={aoIrAprovacoes}
            className="border border-amber-400 bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-200 hover:bg-amber-500/30 rounded"
          >
            Abrir fila de aprovações ↗
          </button>
        </div>
      )}

      {/* Mapa Sinóptico Operacional (Núcleo + Squads + Execuções Vivas) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hub Central e Squads */}
        <div className="lg:col-span-2 rounded-lg border-2 border-black bg-[#070b14] p-4 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <span className="size-2 bg-[#38bdf8] rounded-full" />
              <h3 className="text-xs font-black uppercase text-[#38bdf8]">
                MAPA SINÓPTICO DA OPERAÇÃO
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              {statusLeitura === 'confirmado' && recebidoEm
                ? `Sonda viva há ${Math.max(0, Math.round((Date.now() - recebidoEm.getTime()) / 1000))}s`
                : statusLeitura === 'indisponivel'
                ? `Sonda indisponível (${erroSonda || 'falha'})`
                : 'Consultando presença...'}
            </span>
          </div>

          {/* Nós dos Squads com Conexão ao Core */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* Núcleo Central */}
            <div className="col-span-2 sm:col-span-3 border-2 border-[#84cc16] bg-[#84cc16]/10 p-3 rounded text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="text-[10px] uppercase font-black text-[#84cc16]">NÚCLEO CENTRAL DE COORDENAÇÃO</div>
                {ativosCoordenacao.length > 0 && (
                  <span className="text-[9px] font-bold bg-[#84cc16] text-black px-1.5 py-0.5 rounded-full">
                    {ativosCoordenacao.length} ativo{ativosCoordenacao.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="text-sm font-black text-white mt-0.5">LUANA · COORDENADORA GERAL</div>
              <div className="text-[10.5px] text-slate-300 mt-1">Supervisão autônoma, triagem de eventos e despacho</div>
            </div>

            {/* Squads Catalogados */}
            {squadsComAtivos.map((squad) => (
              <div
                key={squad.id}
                className="border border-slate-800 bg-[#0f172a] p-2.5 rounded flex flex-col justify-between"
                style={{ borderTopColor: squad.cor, borderTopWidth: 3 }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase truncate" style={{ color: squad.cor }}>
                      {squad.nome}
                    </span>
                    {squad.ativos.length > 0 && (
                      <span className="size-2 bg-[#a3e635] rounded-full animate-ping" />
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-1.5 text-[10px]">
                  <span className="text-slate-400">Ativos:</span>
                  <span className={`font-bold font-mono ${squad.ativos.length > 0 ? 'text-[#a3e635]' : 'text-slate-400'}`}>
                    {squad.ativos.length}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Execuções Ativas & Console de Mudanças */}
        <div className="space-y-4">
          {/* Card de Execuções Ativas ao Vivo */}
          <div className="rounded-lg border-2 border-black bg-[#070b14] p-4 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <span className="text-xs font-black uppercase text-[#a3e635] flex items-center gap-1.5">
                <span className="size-2 bg-[#a3e635] rounded-full" />
                EXECUÇÕES EM ANDAMENTO ({ativosTrabalhando.length})
              </span>
            </div>

            {ativosTrabalhando.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {ativosTrabalhando.map((ag) => {
                  const chave = ag.dono ? `${ag.dono}:${ag.id}` : ag.id
                  return (
                    <button
                      key={chave}
                      type="button"
                      onClick={() => aoIrAtivos(chave)}
                      className="w-full text-left border border-slate-800 bg-[#0f172a] hover:border-[#a3e635] p-2.5 rounded transition-all"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">{ag.nome || ag.id}</span>
                        <span className="text-[9px] font-bold text-[#a3e635] border border-[#a3e635]/40 px-1 rounded">
                          EXEC ↗
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-300 truncate">
                        {ag.tarefa || ag.etapa || 'Trabalhando'}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9.5px] text-slate-400 font-mono">
                        <span>{ag.ferramenta ? `tool: ${ag.ferramenta}` : ag.modelo || 'IA'}</span>
                        <span className="text-[#a3e635]">{ag.rodando_ha || ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded">
                Nenhum agente executando tarefas neste instante.
              </div>
            )}
          </div>

          {/* Console de Mudanças Detectadas */}
          <div className="rounded-lg border-2 border-black bg-[#070b14] p-3.5 text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="text-[10.5px] font-black uppercase text-slate-400 border-b border-slate-800 pb-1.5 mb-2">
              📟 CONSOLE DE EVENTOS OPERACIONAIS
            </div>
            {logMudancas.length > 0 ? (
              <ul className="space-y-1 text-[10.5px] font-mono max-h-40 overflow-y-auto">
                {logMudancas.map((item, idx) => (
                  <li key={idx} className="flex items-baseline gap-1.5 text-slate-300">
                    <span className="text-slate-500">[{item.hora}]</span>
                    <span className={item.tipo === 'ativo' ? 'text-[#a3e635]' : 'text-slate-200'}>
                      {item.texto}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[10px] text-slate-500 font-mono">
                Aguardando próximas medições da sonda...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Cofre({ estado, medidoEm, vista, agora }: PropsTela) {
  const { rota, ir } = useRota()
  const cofre = estado.cofre
  const estreito = usarEstreito()
  const fps = useFps()

  // Aba ativa: 'operacao' (padrão) ou 'conhecimento'
  const [visaoAtiva, setVisaoAtiva] = useState<'operacao' | 'conhecimento'>(() => {
    return rota.visao === 'conhecimento' ? 'conhecimento' : 'operacao'
  })

  useEffect(() => {
    if (rota.visao === 'conhecimento') {
      setVisaoAtiva('conhecimento')
    } else if (rota.visao === 'operacao') {
      setVisaoAtiva('operacao')
    }
  }, [rota.visao])

  const trocarAba = (novaAba: 'operacao' | 'conhecimento') => {
    setVisaoAtiva(novaAba)
    ir('cofre', null, { visao: novaAba })
  }

  const [escolhido, setEscolhido] = useState('')
  const [alvo, setAlvo] = useState<string | null>(null)
  const [areaFoco, setAreaFoco] = useState<string | null>(null)
  const [termoBusca, setTermoBusca] = useState('')
  const [modoComando, setModoComando] = useState(true)
  const [modoLayout, setModoLayout] = useState<ModoLayout>('multi-anel')
  const [animarSinal, setAnimarSinal] = useState(false)
  const [areasAbertas, setAreasAbertas] = useState(false)

  const alternarAreasAbertas = () => setAreasAbertas((prev) => !prev)
  const alternarModoComando = () => setModoComando((prev) => !prev)

  const nos = cofre?.nos ?? []
  useEffect(() => {
    if (!nos.length) return
    if (nos.some((n) => n.id === escolhido)) return
    const centro = [...nos].sort((a, b) => b.grau - a.grau || b.peso - a.peso)[0]
    setEscolhido(centro.id)
  }, [nos, escolhido])

  const caminho = useMemo(
    () => (alvo && escolhido && alvo !== escolhido
      ? caminhoMaisCurto(cofre?.arestas ?? [], escolhido, alvo)
      : null),
    [alvo, escolhido, cofre],
  )

  const nosFiltradosBusca = useMemo(() => {
    if (!termoBusca.trim()) return []
    return buscarNos(nos, termoBusca)
  }, [nos, termoBusca])

  const atual = nos.find((n) => n.id === escolhido) ?? nos[0]
  const alvoNo = alvo ? nos.find((n) => n.id === alvo) ?? null : null

  const entram = cofre?.arestas.filter((a) => a.para === atual?.id) ?? []
  const saem = cofre?.arestas.filter((a) => a.de === atual?.id) ?? []

  const nome = (id: string) => nos.find((n) => n.id === id)?.rotulo ?? id
  const curto = (id: string) => encurtar(nome(id), 32)
  const baixa = cofre?.cobertura !== null && (cofre?.cobertura ?? 0) < 25
  const familia = cofre?.familias.find((f) => f.id === atual?.familia)
  const truncado = cofre?.truncados.includes(atual?.id) ?? false
  const areaAtual = cofre?.areas.find((a) => a.id === atual?.area)

  const porqueDoSalto = (de: string, para: string) =>
    cofre?.arestas
      .filter((a) => (a.de === de && a.para === para) || (a.de === para && a.para === de))
      .map((a) => `${nome(a.de)} → ${nome(a.para)}: ${a.porque}`)
      .join(' · ') ?? ''

  const autores = useMemo(
    () => [...nos.reduce((m, n) => m.set(n.autor, (m.get(n.autor) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
    [nos],
  )
  const sempreVisiveis = useMemo(
    () => cofre?.areas.filter((a) => a.sempre_visivel === true || a.id === 'transversal').map((a) => a.id) ?? [],
    [cofre?.areas],
  )
  const ordemAreas = useMemo(() => cofre?.areas.map((a) => a.id) ?? [], [cofre?.areas])
  const escolher = (id: string) => { setEscolhido(id); setAlvo(null) }
  const ligar = (id: string) => setAlvo((antigo) => (antigo === id || id === escolhido ? null : id))

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden px-3 py-4 sm:px-6 lg:px-8 xl:px-10 font-mono text-slate-100">
      {/* Header com Seletor de Visão: Operação e Conhecimento */}
      <TituloDaTela
        mostrarSeletorData={false}
        titulo="Cérebro da Operação."
        pergunta="Centro operacional e mapa de memória viva do ecossistema G4ST40VIB3."
        direita={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center border-2 border-black bg-[#0f172a] p-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <button
                type="button"
                onClick={() => trocarAba('operacao')}
                aria-pressed={visaoAtiva === 'operacao'}
                className={`px-3 py-1 text-xs font-black uppercase transition-all ${
                  visaoAtiva === 'operacao'
                    ? 'bg-[#38bdf8] text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🧠 OPERAÇÃO
              </button>
              <button
                type="button"
                onClick={() => trocarAba('conhecimento')}
                aria-pressed={visaoAtiva === 'conhecimento'}
                className={`px-3 py-1 text-xs font-black uppercase transition-all ${
                  visaoAtiva === 'conhecimento'
                    ? 'bg-[#a3e635] text-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📚 CONHECIMENTO
              </button>
            </div>
            <span className="rotulo flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-verde animate-pulse" />
              medido {new Date(medidoEm).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'America/Sao_Paulo' })} BRT
            </span>
          </div>
        }
      />

      {visaoAtiva === 'operacao' ? (
        <VisaoOperacao
          estado={estado}
          aoIrAtivos={(chave) => ir('tarefas', null, { visao: 'ativos', execucao: chave })}
          aoIrConhecimento={() => trocarAba('conhecimento')}
          aoIrAprovacoes={() => ir('aprovacoes')}
        />
      ) : !cofre || cofre.erro || !nos.length ? (
        <div className="carta p-5 text-sm text-tinta-2">
          Não consegui medir o Cofre de conhecimento. {cofre?.erro ?? 'Fonte indisponível.'}
        </div>
      ) : (
        <CofreConfianca
          nos={nos} arestas={cofre.arestas} escolhido={atual.id}
          aoEscolher={escolher} agora={agora.getTime()} auditoria={cofre.auditoria_v2} avisos={cofre.avisos}
        >
        <PainelInstrumentoCofre
          fps={fps}
          cofre={cofre}
          nos={nos}
          termoBusca={termoBusca}
          setTermoBusca={setTermoBusca}
          nosFiltradosBusca={nosFiltradosBusca}
          escolher={escolher}
          modoComando={modoComando}
          modoLayout={modoLayout}
          setModoLayout={setModoLayout}
          animarSinal={animarSinal}
          setAnimarSinal={setAnimarSinal}
          alternarModoComando={alternarModoComando}
          baixa={baixa}
          areasAbertas={areasAbertas}
          alternarAreasAbertas={alternarAreasAbertas}
          areas={cofre.areas}
          areaFoco={areaFoco}
          setAreaFoco={setAreaFoco}
          autores={autores}
          atual={atual}
          areaAtual={areaAtual}
          familia={familia}
          truncado={truncado}
          caminho={caminho}
          alvoNo={alvoNo}
          entram={entram}
          saem={saem}
          nome={nome}
          curto={curto}
          porqueDoSalto={porqueDoSalto}
          setAlvo={setAlvo}
          grafo={
            <>
              <Cabecalho cor="var(--color-lima)" meta={`${cofre.conexoes} ligações · ${modoComando ? '3D Force Graph' : '2D SVG'}`}>
                mapa dos aprendizados
              </Cabecalho>
              {modoComando ? (
                <Grafo3DCofre
                  nos={nos}
                  arestas={cofre.arestas}
                  escolhido={atual.id}
                  alvo={alvo}
                  areaFoco={areaFoco}
                  sempreVisiveis={sempreVisiveis}
                  caminho={caminho}
                  modoLayout={modoLayout}
                  animarSinal={animarSinal}
                  modoComando={modoComando}
                  aoEscolher={escolher}
                  aoLigar={ligar}
                />
              ) : (
                <Mapa
                  nos={nos} arestas={cofre.arestas} caixa={estreito ? CAIXA_CELULAR : CAIXA_MESA}
                  ordemAreas={ordemAreas}
                  escolhido={atual.id} alvo={alvo} areaFoco={areaFoco} sempreVisiveis={sempreVisiveis}
                  caminho={caminho} modoLayout={modoLayout} animarSinal={animarSinal} modoComando={modoComando}
                  aoEscolher={escolher} aoLigar={ligar}
                />
              )}
            </>
          }
        />
        </CofreConfianca>
      )}

      <Parcial dado={vista.dado} />
    </div>
  )
}
