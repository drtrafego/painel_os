import { useMemo, useState } from 'react'
import { useAgentesVivos } from '../dados/useAgentesVivos'
import { montarCatalogoPixel } from '../dados/pixel-agents'
import { PixelOffice } from '../ui/PixelOffice'
import type { PropsTela } from './Vazias'
import type { AgenteVivo } from '../dados/tipos'

const STATUS: [string, string][] = [
  ['todo', 'a fazer'],
  ['doing', 'em andamento'],
  ['waiting', 'aguardando'],
  ['backlog', 'backlog'],
]
const PRAZOS: [string, string][] = [
  ['atrasadas', 'atrasadas'],
  ['hoje', 'vencem hoje'],
  ['proximos_7_dias', 'próximos 7 dias'],
  ['depois', 'depois'],
  ['sem_prazo', 'sem prazo'],
]
const MOVIMENTO: [string, string][] = [
  ['ultimos_7_dias', 'movidas nos últimos 7 dias'],
  ['entre_7_e_30_dias', 'sem movimento de 7 a 30 dias'],
  ['sem_atualizacao_30_dias', 'sem movimento há 30 dias'],
]

/** Janela Estilo Pixel Art Retrô com Barra de Título e Botões */
function PixelJanela({
  titulo,
  subtitulo,
  badge,
  corBadge = 'text-[#38bdf8]',
  children,
  className = '',
}: {
  titulo: string
  subtitulo?: string
  badge?: string
  corBadge?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`border-4 border-black bg-[#1e293b] text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all ${className}`}
    >
      {/* Barra de Título da Janela Retrô */}
      <div className="flex items-center justify-between border-b-4 border-black bg-[#0f172a] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-block size-3 shrink-0 bg-[#a3e635] shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]" />
          <span className="truncate text-xs font-black uppercase tracking-wider text-[#facc15]">
            {titulo}
          </span>
          {subtitulo && <span className="hidden text-[11px] text-slate-400 sm:inline">· {subtitulo}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge && (
            <span className={`border-2 border-black bg-[#1e293b] px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${corBadge}`}>
              {badge}
            </span>
          )}
          <div className="flex items-center gap-1 font-mono text-[10px] text-slate-400 select-none">
            <span className="grid size-4 place-items-center border border-black bg-[#1e293b] text-[9px] hover:bg-slate-700">_</span>
            <span className="grid size-4 place-items-center border border-black bg-[#1e293b] text-[9px] hover:bg-slate-700">□</span>
            <span className="grid size-4 place-items-center border border-black bg-[#ef4444] text-[9px] text-white font-black hover:bg-red-600">✕</span>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

export function Tarefas({ estado, vista }: PropsTela) {
  const dados = estado.tarefas
  const { dados: vivos, carregando: carregandoVivos, erro: erroVivos, falhouHaSegundos } = useAgentesVivos()
  const erro = dados?.erro ?? (!dados ? 'a medição de tarefas não veio no estado atual' : null)
  const ativos = vivos?.contagem?.trabalhando ?? 0
  // A sonda é a única fonte de presença; o catálogo do escritório completa o restante.
  const listaVivos = vivos?.agentes ?? []
  const catalogoPixel = useMemo(() => montarCatalogoPixel(estado.agentes, estado.sessao), [estado.agentes, estado.sessao])

  const [modoExibicao, setModoExibicao] = useState<'office' | 'terminal' | 'squad'>('office')
  const [agenteInspecionado, setAgenteInspecionado] = useState<string | null>(null)

  const agenteSelecionado: AgenteVivo | undefined =
    listaVivos.find((a) => a.id === agenteInspecionado || `${a.dono}:${a.id}` === agenteInspecionado) ??
    (() => {
      const ficha = catalogoPixel.find((agente) => agente.id === agenteInspecionado || agente.aliases?.includes(agenteInspecionado ?? ''))
      if (!ficha) return undefined
      return {
        id: ficha.id,
        dono: undefined,
        estado: 'parado' as const,
        fase: ficha.área,
        etapa: ficha.descricao ?? ficha.papel,
        etapa_e_description: false,
        ferramenta: null,
        silencio_s: 0,
        arquivo: 'catálogo operacional',
      }
    })()

  return (
    <div className="w-full max-w-none space-y-6 px-3 py-4 font-mono sm:px-6 lg:px-8 xl:px-10">
      {/* Header Principal Retrô em Pixel Art */}
      <div className="border-4 border-black bg-[#1e293b] p-4 sm:p-6 text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-block size-5 bg-[#a3e635] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] animate-pulse" />
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-[#facc15]">
                [ 👾 PIXEL AGENTS & TAREFAS GTD ]
              </h1>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-4xl leading-relaxed">
              {vista.pergunta}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Alternador de Visualização: Virtual Office, Terminal Cards e mapa do squad */}
            <div className="flex flex-wrap items-center border-2 border-black bg-[#0f172a] p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" aria-label="Visualização dos agentes">
              <button
                type="button"
                onClick={() => setModoExibicao('office')}
                aria-pressed={modoExibicao === 'office'}
                className={`px-3 py-1.5 text-xs font-black uppercase transition-all ${
                  modoExibicao === 'office'
                    ? 'bg-[#a3e635] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🎮 VIRTUAL OFFICE
              </button>
              <button
                type="button"
                onClick={() => setModoExibicao('terminal')}
                aria-pressed={modoExibicao === 'terminal'}
                className={`px-3 py-1.5 text-xs font-black uppercase transition-all ${
                  modoExibicao === 'terminal'
                    ? 'bg-[#38bdf8] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                📟 TERMINAL CRT
              </button>
              <button
                type="button"
                onClick={() => setModoExibicao('squad')}
                aria-pressed={modoExibicao === 'squad'}
                className={`px-3 py-1.5 text-xs font-black uppercase transition-all ${
                  modoExibicao === 'squad'
                    ? 'bg-[#facc15] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🗺️ MAPA DO SQUAD
              </button>
            </div>

            <div className="border-2 border-black bg-[#0f172a] px-3.5 py-2 text-xs font-bold text-[#38bdf8] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {dados?.coletado_em ? `📡 SYNC: ${new Date(dados.coletado_em).toLocaleString('pt-BR')}` : 'OFFLINE'}
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de Falha da Sonda Viva */}
      {(erroVivos || vivos?.ok === false) && (
        <div className="border-4 border-black bg-[#450a0a] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-[#f87171]">
            <span>⚠ FALHA NA SONDA DE AGENTES AO VIVO</span>
            {falhouHaSegundos !== null && (
              <span className="border border-black bg-[#1e293b] px-2 py-0.5 text-[10px] text-[#facc15]">
                {falhouHaSegundos === 0 ? 'sonda falhou na inicialização' : `sonda falhou há ${falhouHaSegundos}s`}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-200">
            {erroVivos || vivos?.erro || vivos?.motivo || 'Erro ao comunicar com a sonda de agentes ao vivo.'}
          </p>
        </div>
      )}

      {/* Avisos Não-Fatais da Sonda Viva */}
      {vivos?.avisos && vivos.avisos.length > 0 && (
        <div className="border-3 border-black bg-[#451a03] p-3.5 text-xs text-[#fbbf24] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center gap-2 font-bold uppercase">
            <span>⚠️ Avisos da sonda ({vivos.avisos.length}):</span>
          </div>
          <ul className="mt-1 list-disc pl-5 space-y-0.5 text-[11px] text-amber-200">
            {vivos.avisos.map((aviso, idx) => (
              <li key={idx} className="break-words">{aviso}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Seletor do Modo Virtual Office (Canvas Pixel Art Estilo pixel-agents-hq) */}
      {modoExibicao === 'office' ? (
        <section className="space-y-3">
          <PixelOffice
            agentes={listaVivos}
            catalogo={catalogoPixel}
            aoSelecionarAgente={(id) => setAgenteInspecionado(id)}
            agenteSelecionadoId={agenteInspecionado}
          />

          {/* Ficha Inspector do Agente Clicado */}
          {agenteSelecionado && (
            <div className="border-4 border-black bg-[#0f172a] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`size-3 shrink-0 ${agenteSelecionado?.estado === 'trabalhando' ? 'bg-[#a3e635] animate-ping' : 'bg-slate-500'}`} />
                  <span className="text-sm font-black uppercase text-[#facc15]">
                    AGENTE INSPECCIONADO: {agenteSelecionado.id.toUpperCase()}
                  </span>
                  {agenteSelecionado.dono && (
                    <span className={`border border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                      agenteSelecionado.dono === 'luana' ? 'bg-[#38bdf8] text-black' :
                      agenteSelecionado.dono === 'renato' ? 'bg-[#c084fc] text-black' :
                      agenteSelecionado.dono === 'bia' ? 'bg-[#f472b6] text-black' :
                      'bg-slate-300 text-black'
                    }`}>
                      {agenteSelecionado.dono.toUpperCase()}
                    </span>
                  )}
                  <span className="border border-black bg-[#1e293b] px-2 py-0.5 text-[10px] text-[#38bdf8]">
                    {agenteSelecionado.arquivo === 'catálogo operacional' ? 'FORA DA EXECUÇÃO' : agenteSelecionado.estado === 'trabalhando' ? 'EM EXECUÇÃO' : 'OCIOSO'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 break-words break-all [overflow-wrap:anywhere]">
                  {agenteSelecionado.etapa ?? 'Sem descrição da tarefa atual'}
                </p>
                <div className="text-[10.5px] text-slate-400">
                  Ferramenta ativa: <span className="text-[#a3e635]">{agenteSelecionado.ferramenta ?? 'Nenhuma'}</span> · Fase: {agenteSelecionado.fase} · Silêncio: {agenteSelecionado.silencio_s ?? 0}s
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAgenteInspecionado(null)}
                className="shrink-0 border-2 border-black bg-[#1e293b] px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                FECHAR INSPECTOR ✕
              </button>
            </div>
          )}
        </section>
      ) : modoExibicao === 'terminal' ? (
        /* Modo Terminal CRT Cards */
        <PixelJanela
          titulo="⚡ SONDA DE AGENTES AO VIVO NA TAREFA"
          subtitulo="Monitoramento em tempo real de transcripts e subprocessos ativos"
          badge={
            carregandoVivos
              ? 'CONSULTANDO...'
              : erroVivos || vivos?.ok === false
              ? falhouHaSegundos !== null
                ? `FALHA (${falhouHaSegundos}s)`
                : 'FALHA'
              : vivos?.ok
              ? `${vivos.contagem?.vivos ?? 0} VIVOS (${ativos} EXEC)`
              : 'SONDA OFF'
          }
          corBadge={
            erroVivos || vivos?.ok === false
              ? 'text-[#ef4444]'
              : ativos > 0
              ? 'text-[#a3e635]'
              : 'text-slate-400'
          }
        >
          {listaVivos.length > 0 ? (
            <div className="grid grid-cols-1 min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {listaVivos.map((ag) => (
                <div
                  key={`${ag.dono ?? 'x'}:${ag.id}`}
                  className="flex min-w-0 flex-col justify-between border-2 border-black bg-[#0f172a] p-3.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1.5 border-b border-slate-700 pb-2">
                      <div className="flex min-w-0 items-center gap-1.5 truncate">
                        {ag.dono && (
                          <span
                            className={`shrink-0 border border-black px-1.5 py-0.5 text-[8.5px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                              ag.dono === 'luana' ? 'bg-[#38bdf8] text-black' :
                              ag.dono === 'renato' ? 'bg-[#c084fc] text-black' :
                              ag.dono === 'bia' ? 'bg-[#f472b6] text-black' :
                              'bg-slate-300 text-black'
                            }`}
                            title={`Origem: ${ag.dono.toUpperCase()}`}
                          >
                            {ag.dono.toUpperCase()}
                          </span>
                        )}
                        <span className="truncate text-xs font-black uppercase text-[#38bdf8]" title={ag.id}>
                          {ag.id}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 border border-black px-1.5 py-0.5 text-[9px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                          ag.estado === 'trabalhando' ? 'bg-[#a3e635] text-black' : ag.estado === 'silencioso' ? 'bg-[#facc15] text-black' : 'bg-slate-500 text-white'
                        }`}
                      >
                        {ag.estado === 'trabalhando' ? 'EXEC' : ag.estado === 'silencioso' ? 'OCIOSO' : 'FORA'}
                      </span>
                    </div>
                    <div
                      className="mt-2.5 min-w-0 border-l-2 border-[#38bdf8] pl-2 text-xs text-slate-200 line-clamp-3 leading-relaxed break-words break-all [overflow-wrap:anywhere]"
                      title={ag.etapa ?? 'Etapa não informada'}
                    >
                      {ag.etapa ?? 'ETAPA EM ANDAMENTO'}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-700/80 pt-2 text-[10px] text-slate-400">
                    <span className="truncate max-w-[120px] font-semibold">{ag.ferramenta ? `TOOL: ${ag.ferramenta}` : ag.fase}</span>
                    <span className="tabular-nums font-mono text-[#a3e635]">
                      {ag.silencio_s !== null && ag.silencio_s !== undefined ? `${ag.silencio_s}s` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-700 bg-[#0f172a]/60 p-6 text-center text-xs text-slate-400">
              Nenhum agente em execução ativa neste instante. Monitorando transcripts e processos a cada 10s.
            </div>
          )}
        </PixelJanela>
      ) : (
        <PixelJanela
          titulo="🗺️ ESTRUTURA DO SQUAD"
          subtitulo="Fluxo novo do conteúdo, com gates e destinos de distribuição"
          badge="ARCHIFY"
          corBadge="text-[#facc15]"
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b-2 border-slate-700 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black uppercase text-[#facc15]">Estrutura nova do conteúdo</h2>
                <p className="mt-2 max-w-4xl text-xs leading-relaxed text-slate-300">
                  Nova/Vega → Suri → aprovação do Gastão → Theo → Cleo → Dani → Corretor → Guardião → destino → D+3/D+7
                </p>
              </div>
              <a
                className="shrink-0 border-2 border-black bg-[#38bdf8] px-3 py-2 text-center text-[11px] font-black uppercase text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5"
                href="/mapas/pipeline-conteudo.html"
                target="_blank"
                rel="noreferrer"
              >
                abrir mapa completo ↗
              </a>
            </div>
            <iframe
              className="h-[min(72vw,620px)] min-h-[420px] w-full rounded border-2 border-black bg-[#101215]"
              src="/mapas/pipeline-conteudo.html"
              title="Estrutura nova do conteúdo, mapa interativo do pipeline"
              loading="lazy"
            />
          </div>
        </PixelJanela>
      )}

      {erro ? (
        <section
          className="border-4 border-black bg-[#450a0a] p-5 text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          data-erro-tarefas
        >
          <div className="flex items-center gap-2 text-sm font-black uppercase text-[#f87171]">
            <span>⚠ FONTE INCOMPLETA</span>
          </div>
          <p className="mt-2 text-xs text-slate-200">{erro}</p>
          <p className="mt-2 text-[11px] text-slate-400">
            Nenhuma contagem parcial virou zero. A carteira reaparece quando a API responder.
          </p>
        </section>
      ) : (
        <>
          {dados?.truncado && (
            <div className="border-3 border-black bg-[#451a03] p-3.5 text-xs text-[#fbbf24] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              ⚠️ Limite de 200 itens atingido num estado. Os números exibidos representam contagens mínimas.
            </div>
          )}

          {/* Grid de KPIs Pixel Art com Números Grandes */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PixelKpi
              rotulo="TAREFAS ABERTAS"
              valor={dados?.total_abertas}
              cor="text-[#facc15]"
              nota="carteira GTD total ativa"
            />
            <PixelKpi
              rotulo="EM ANDAMENTO"
              valor={dados?.por_status.doing}
              cor="text-[#38bdf8]"
              nota="sendo executadas agora"
            />
            <PixelKpi
              rotulo="ATRASADAS"
              valor={dados?.por_prazo.atrasadas}
              cor={(dados?.por_prazo.atrasadas ?? 0) > 0 ? 'text-[#f87171]' : 'text-[#a3e635]'}
              nota="requerem atenção urgente"
            />
            <PixelKpi
              rotulo="SEM PRAZO"
              valor={dados?.por_prazo.sem_prazo}
              cor="text-[#fbbf24]"
              nota="não agendadas no calendário"
            />
          </div>

          {/* 3 Janelas Secundárias de GTD */}
          <div className="grid gap-5 lg:grid-cols-3">
            <PixelJanela titulo="ESTADO DA CARTEIRA" badge={`${dados?.total_abertas ?? 0} ITENS`}>
              <div className="space-y-4">
                {STATUS.map(([chave, nome]) => (
                  <PixelLinha
                    key={chave}
                    nome={nome}
                    valor={dados?.por_status[chave]}
                    total={dados?.total_abertas}
                    cor="bg-[#38bdf8]"
                  />
                ))}
              </div>
            </PixelJanela>

            <PixelJanela titulo="PRESSÃO DE PRAZO" badge="DEADLINES" corBadge="text-[#facc15]">
              <div className="space-y-4">
                {PRAZOS.map(([chave, nome]) => (
                  <PixelLinha
                    key={chave}
                    nome={nome}
                    valor={dados?.por_prazo[chave]}
                    total={dados?.total_abertas}
                    cor={chave === 'atrasadas' ? 'bg-[#f87171]' : 'bg-[#facc15]'}
                  />
                ))}
              </div>
            </PixelJanela>

            <PixelJanela titulo="MOVIMENTO CADASTRO" badge="ATIVIDADE" corBadge="text-[#a3e635]">
              <div className="flex flex-col justify-between h-full">
                <div className="space-y-4">
                  {MOVIMENTO.map(([chave, nome]) => (
                    <PixelLinha
                      key={chave}
                      nome={nome}
                      valor={dados?.por_movimento[chave]}
                      total={dados?.total_abertas}
                      cor="bg-[#a3e635]"
                    />
                  ))}
                </div>
                <p className="mt-5 border-t border-slate-700 pt-2 text-[10px] text-slate-400">
                  Mede a última alteração do registro no sistema GTD.
                </p>
              </div>
            </PixelJanela>
          </div>

          {/* Carga por Projeto — Expansão Multi-Coluna */}
          <PixelJanela
            titulo="CARGA POR PROJETO"
            subtitulo="Estoque de tarefas abertas por projeto no gerenciador GTD"
            badge={`${dados?.por_projeto.length ?? 0} PROJETOS`}
            corBadge="text-[#c084fc]"
          >
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {dados?.por_projeto.map((p) => (
                <PixelLinha
                  key={p.projeto}
                  nome={p.projeto}
                  valor={p.total}
                  total={dados.total_abertas}
                  cor="bg-[#c084fc]"
                />
              ))}
            </div>
            <p className="mt-5 border-t border-slate-700 pt-3 text-xs text-slate-400">
              Estoque de tarefas abertas por projeto no gerenciador GTD. Títulos e dados sensíveis são omitidos por segurança.
            </p>
          </PixelJanela>
        </>
      )}
    </div>
  )
}

function PixelKpi({
  rotulo,
  valor,
  cor = 'text-white',
  nota,
}: {
  rotulo: string
  valor?: number | null
  cor?: string
  nota?: string
}) {
  return (
    <div className="border-4 border-black bg-[#0f172a] p-4 sm:p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">{rotulo}</div>
      <div className={`mt-2 text-3xl sm:text-4xl font-black tabular-nums ${cor}`}>
        {valor !== null && valor !== undefined ? valor : '—'}
      </div>
      {nota && <div className="mt-1.5 text-[10px] font-medium text-slate-400">{nota}</div>}
    </div>
  )
}

function PixelLinha({
  nome,
  valor,
  total,
  cor = 'bg-[#a3e635]',
}: {
  nome: string
  valor?: number
  total?: number | null
  cor?: string
}) {
  const fracao = total && valor !== undefined ? Math.min(100, (valor / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold uppercase text-slate-200">{nome}</span>
        <span className="font-black tabular-nums text-white">{valor ?? '—'}</span>
      </div>
      <div className="h-3 border-2 border-black bg-[#0f172a] p-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className={`h-full ${cor} transition-all duration-300`} style={{ width: `${fracao}%` }} />
      </div>
    </div>
  )
}
