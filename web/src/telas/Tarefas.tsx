import { OfficeTacticalPanels } from '../ui/OfficeTacticalPanels'
import { useMemo, useState, useEffect } from 'react'
import { useAgentesVivos, montarResumoAgenteVivo, type ResumoAgenteVivo } from '../dados/useAgentesVivos'
import { contarAgentesVivosNaContagem } from '../dados/agentes-vivos'
import { montarCatalogoPixel } from '../dados/pixel-agents'
import { AgenteVivoCard, classeDonoPixel } from '../ui/AgenteVivoCard'
import { PixelOffice } from '../ui/PixelOffice'
import { porSquad, squadsComAgentes } from '../dados/estado'
import { useRota } from '../nav/useRota'
import type { PropsTela } from './Vazias'
import type { AgenteVivo } from '../dados/tipos'

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
      className={`min-w-0 border-4 border-black bg-[#1e293b] text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all ${className}`}
    >
      <div className="flex items-center justify-between border-b-4 border-black bg-[#0f172a] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-block size-3 shrink-0 bg-[#a3e635] shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]" />
          <span className="truncate text-xs font-black uppercase tracking-wider text-[#facc15]">
            {titulo}
          </span>
          {subtitulo && <span className="hidden text-[11px] text-slate-400 sm:inline">· {subtitulo}</span>}
        </div>
        {badge && (
          <span className={`border-2 border-black bg-[#1e293b] px-2 py-0.5 font-mono text-[10px] font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${corBadge}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

/** Inspetor Único e Acessível do Agente Selecionado */
function InspectorUnificadoAgente({
  resumo,
  aoFechar,
}: {
  resumo: ResumoAgenteVivo
  aoFechar: () => void
}) {
  const [expandido, setExpandido] = useState(false)
  const [detalhesTecnicosAbertos, setDetalhesTecnicosAbertos] = useState(false)

  return (
    <div className="border-4 border-black bg-[#0f172a] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-3.5 min-w-0">
      {/* Barra de Título do Inspector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`size-3 shrink-0 ${
              resumo.estado === 'trabalhando' ? 'bg-[#a3e635] animate-ping' : 'bg-slate-500'
            }`}
          />
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm sm:text-base font-black uppercase text-[#facc15] truncate">
              INSPETOR: {resumo.nome.toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              ({resumo.id})
            </span>
          </div>
          {resumo.donoFormatado && (
            <span
              className={`border border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                classeDonoPixel(resumo.dono)
              }`}
            >
              {resumo.donoFormatado}
            </span>
          )}
          <span
            className={`border border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
              resumo.estado === 'trabalhando'
                ? 'bg-[#a3e635] text-black'
                : resumo.estado === 'silencioso'
                ? 'bg-[#facc15] text-black'
                : 'bg-slate-600 text-white'
            }`}
          >
            {resumo.statusTexto.toUpperCase()}
          </span>
        </div>

        <button
          type="button"
          onClick={aoFechar}
          className="self-start sm:self-auto shrink-0 border-2 border-black bg-[#1e293b] px-3 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1.5"
        >
          <span>✕ FECHAR INSPETOR</span>
        </button>
      </div>

      {/* Tarefa em 2 a 3 linhas com expansor acessível */}
      <div className="min-w-0 bg-[#1e293b]/60 border border-slate-700/80 p-3 rounded">
        <div className="flex items-center justify-between gap-2 text-[10.5px] uppercase font-bold text-slate-400">
          <span>TAREFA EM ANDAMENTO</span>
          {resumo.tarefa.length > 120 && (
            <button
              type="button"
              onClick={() => setExpandido(!expandido)}
              className="text-[#38bdf8] hover:underline font-mono text-[10px]"
            >
              {expandido ? '▲ RECOLHER' : '▼ VER TEXTO COMPLETO'}
            </button>
          )}
        </div>
        <p
          className={`mt-1.5 text-xs sm:text-sm text-slate-100 break-words leading-relaxed font-sans ${
            !expandido ? 'line-clamp-3' : ''
          }`}
        >
          {resumo.tarefa}
        </p>
      </div>

      {/* 4 Campos Principais: Ferramenta Atual, Tempo de Execução, Modelo e Dono */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 min-w-0 pt-1">
        <div className="border border-slate-700 bg-[#1e293b]/80 p-2.5 min-w-0 rounded">
          <div className="text-[10px] uppercase font-bold text-slate-400 truncate">Ferramenta Atual</div>
          <div className="text-xs sm:text-sm font-black text-[#a3e635] truncate mt-0.5" title={resumo.ferramenta || 'Nenhuma ferramenta no instante'}>
            {resumo.ferramenta ? `🔧 ${resumo.ferramenta}` : '— (trabalho direto)'}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/80 p-2.5 min-w-0 rounded">
          <div className="text-[10px] uppercase font-bold text-slate-400 truncate">Tempo de Execução</div>
          <div className="text-xs sm:text-sm font-black text-slate-100 truncate mt-0.5">
            ⏱ {resumo.tempoFormatado}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/80 p-2.5 min-w-0 rounded">
          <div className="text-[10px] uppercase font-bold text-slate-400 truncate">Modelo de IA</div>
          <div className="text-xs sm:text-sm font-black text-[#38bdf8] truncate mt-0.5" title={resumo.modelo}>
            🤖 {resumo.modelo}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/80 p-2.5 min-w-0 rounded">
          <div className="text-[10px] uppercase font-bold text-slate-400 truncate">Dono / Squad</div>
          <div className="text-xs sm:text-sm font-black text-slate-100 truncate mt-0.5">
            👤 {resumo.donoFormatado || 'Operação Global'}
          </div>
        </div>
      </div>

      {/* Detalhes Técnicos Recolhidos (Tokens, IDs, Quem mandou) */}
      <div className="border-t border-slate-700/80 pt-2">
        <button
          type="button"
          onClick={() => setDetalhesTecnicosAbertos(!detalhesTecnicosAbertos)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-white"
        >
          <span>{detalhesTecnicosAbertos ? '▼ Ocultar dados técnicos' : '▶ Ver dados técnicos (tokens, IDs e hierarquia)'}</span>
        </button>

        {detalhesTecnicosAbertos && (
          <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 border border-slate-800 bg-[#090d16] p-2.5 rounded text-[11px]">
            <div>
              <span className="text-slate-400">Tokens Gastos:</span>{' '}
              <span className="text-[#facc15] font-bold font-mono">
                {resumo.tokensFormatado ? `${resumo.tokensFormatado} tokens` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Esforço Anotado:</span>{' '}
              <span className="text-slate-200 font-mono">{resumo.esforco || '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">Quem mandou:</span>{' '}
              <span className="text-slate-200 font-mono truncate block" title={resumo.quemMandou || '—'}>
                {resumo.quemMandou || '—'}
              </span>
            </div>
          </div>
        )}
      </div>

      {resumo.problema && (
        <div className="border border-red-500/50 bg-red-950/40 p-2.5 text-xs text-red-200 break-words rounded">
          <span className="font-bold text-red-400">⚠️ Problema reportado: </span>
          {resumo.problema}
        </div>
      )}
    </div>
  )
}

export function Tarefas({ estado, vista }: PropsTela) {
  const { rota, ir } = useRota()
  const { dados: vivos, carregando: carregandoVivos, erro: erroVivos, falhouHaSegundos } = useAgentesVivos()

  const ativos = vivos?.contagem?.trabalhando ?? 0
  const totalVivos = contarAgentesVivosNaContagem(vivos?.contagem)
  const listaVivos = vivos?.agentes ?? []
  const catalogoPixel = useMemo(() => montarCatalogoPixel(estado.agentes, estado.sessao), [estado.agentes, estado.sessao])
  const squadIds = useMemo(() => squadsComAgentes(estado), [estado])

  const [modoExibicao, setModoExibicao] = useState<'office' | 'terminal' | 'squad'>('office')
  const [soAtivos, setSoAtivos] = useState(() => rota.visao === 'ativos')
  const [agenteInspecionado, setAgenteInspecionado] = useState<string | null>(() => rota.execucao ?? null)

  // Sincroniza com parâmetros de URL
  useEffect(() => {
    if (rota.visao === 'ativos') {
      setSoAtivos(true)
      setModoExibicao('office')
    }
    if (rota.execucao) {
      setAgenteInspecionado(rota.execucao)
    }
  }, [rota.visao, rota.execucao])

  // Ação unificada para abrir agentes ativos
  const abrirAgentesAtivos = (chaveExecucao?: string) => {
    setModoExibicao('office')
    setSoAtivos(true)
    if (chaveExecucao) {
      setAgenteInspecionado(chaveExecucao)
    }
    ir('tarefas', null, {
      visao: 'ativos',
      execucao: chaveExecucao ?? agenteInspecionado,
    })
  }

  // Resolução da execução concreta ou catálogo por chave compósita rigorosa (dono+id)
  const agenteSelecionadoObj: AgenteVivo | undefined = useMemo(() => {
    if (!agenteInspecionado) return undefined
    const encontradoVivo = listaVivos.find((a) => {
      const chave = a.dono ? `${a.dono}:${a.id}` : a.id
      return chave === agenteInspecionado
    })
    if (encontradoVivo) return encontradoVivo

    // Fallback de catálogo (sem rebaixar viva para encerrada)
    const ficha = catalogoPixel.find((ag) => ag.id === agenteInspecionado || ag.aliases?.includes(agenteInspecionado))
    if (!ficha) return undefined
    return {
      id: ficha.id,
      nome: ficha.nome,
      dono: undefined,
      estado: 'parado' as const,
      fase: ficha.área,
      etapa: ficha.descricao ?? ficha.papel,
      etapa_e_description: false,
      ferramenta: null,
      silencio_s: null,
      arquivo: 'catálogo operacional',
    }
  }, [agenteInspecionado, listaVivos, catalogoPixel])

  const resumoSelecionado = useMemo(() => {
    return montarResumoAgenteVivo(agenteSelecionadoObj)
  }, [agenteSelecionadoObj])

  const aprovacoesItens = estado.aprovacoes?.itens ?? []
  const aprovacoesPendentes = aprovacoesItens.filter((i) => i.estado === 'aguardando' || i.estado === 'pendente')
  const totalRetornos = estado.agentes.reduce((s, a) => s + (a.retornos_registrados || 0), 0)

  return (
    <div className="w-full max-w-none space-y-5 px-3 py-4 font-mono sm:px-6 lg:px-8 xl:px-10">
      {/* O escritório aprovado já tem cabeçalho próprio; o cabeçalho legado fica nas visões antigas. */}
      {modoExibicao !== 'office' && <div className="border-4 border-black bg-[#1e293b] p-4 sm:p-5 text-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-block size-5 bg-[#a3e635] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] animate-pulse" />
              <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-[#facc15]">
                [ 👾 ESCRITÓRIO DOS AGENTES ]
              </h1>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-4xl leading-relaxed">
              {vista.pergunta}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Alternador de Visualização */}
            <div className="flex flex-wrap items-center border-2 border-black bg-[#0f172a] p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" aria-label="Visualização dos agentes">
              <button
                type="button"
                onClick={() => setModoExibicao('office')}
                aria-pressed={false}
                className="px-3 py-1.5 text-xs font-black uppercase text-slate-400 transition-all hover:text-white"
              >
                🎮 ESCRITÓRIO VOXEL
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

            <button
              type="button"
              onClick={() => ir('cofre', null, { visao: 'operacao' })}
              className="border-2 border-black bg-[#0284c7] px-3.5 py-2 text-xs font-bold text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-[#0369a1]"
            >
              🧠 CÉREBRO OPERACIONAL
            </button>
          </div>
        </div>
      </div>}

      {/* Faixa de Agentes Ativos (Trabalhando Agora) */}
      {modoExibicao !== 'office' && listaVivos.filter((a) => a.estado === 'trabalhando').length > 0 && (
        <div className="border-2 border-black bg-[#0f172a] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-2 mb-2">
            <span className="text-[11px] font-bold text-[#a3e635] uppercase flex items-center gap-1.5">
              <span className="size-2 bg-[#a3e635] rounded-full animate-ping" />
              Agentes trabalhando agora ({listaVivos.filter((a) => a.estado === 'trabalhando').length}):
            </span>
            <button
              type="button"
              onClick={() => abrirAgentesAtivos()}
              className="text-[10px] font-bold text-[#38bdf8] hover:underline"
            >
              Ver todos no escritório ↗
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {listaVivos
              .filter((a) => a.estado === 'trabalhando')
              .map((ag) => {
                const chave = ag.dono ? `${ag.dono}:${ag.id}` : ag.id
                return (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => abrirAgentesAtivos(chave)}
                    className="flex items-center gap-2 border border-slate-700 bg-[#1e293b] px-2.5 py-1.5 text-xs text-left hover:border-[#a3e635] hover:bg-[#0f172a] transition-all rounded shadow-sm"
                  >
                    <span className="size-2 bg-[#a3e635] rounded-full" />
                    <span className="font-bold text-white">{ag.nome || ag.id}</span>
                    {ag.dono && (
                      <span className={`px-1 py-0.5 text-[9px] font-black uppercase rounded ${classeDonoPixel(ag.dono)}`}>
                        {ag.dono}
                      </span>
                    )}
                    {ag.ferramenta && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        · {ag.ferramenta}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Alerta de Falha da Sonda Viva */}
      {modoExibicao !== 'office' && (erroVivos || vivos?.ok === false) && (
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
            {erroVivos || vivos?.erro || vivos?.motivo || 'Não foi possível confirmar os agentes ativos.'}
          </p>
        </div>
      )}

      {/* Modo Escritório Voxel */}
      {modoExibicao === 'office' ? (
        <section className="space-y-4">
          <PixelOffice
            agentes={listaVivos}
            catalogo={catalogoPixel}
            estado={estado}
            soAtivos={soAtivos}
            aoAlternarSoAtivos={(novo) => {
              setSoAtivos(novo)
              ir('tarefas', null, {
                visao: novo ? 'ativos' : null,
                execucao: agenteInspecionado,
              })
            }}
            aoSelecionarAgente={(chave) => {
              setAgenteInspecionado(chave)
              ir('tarefas', null, {
                visao: soAtivos ? 'ativos' : null,
                execucao: chave,
              })
            }}
            agenteSelecionadoId={agenteInspecionado}
            aoAbrirCerebro={() => ir('cofre', null, { visao: 'operacao' })}
            tarefasDiretores={vivos?.tarefas_diretores}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 text-[10px] font-bold uppercase text-slate-400">
            <span className="mr-auto">Outras visões</span>
            <button type="button" onClick={() => setModoExibicao('terminal')} className="min-h-11 rounded border border-slate-700 bg-[#0f172a] px-3 hover:text-white">Terminal CRT</button>
            <button type="button" onClick={() => setModoExibicao('squad')} className="min-h-11 rounded border border-slate-700 bg-[#0f172a] px-3 hover:text-white">Mapa do squad</button>
            <button type="button" onClick={() => ir('cofre', null, { visao: 'operacao' })} className="min-h-11 rounded border border-slate-700 bg-[#0f172a] px-3 text-[#38bdf8]">Cérebro</button>
          </div>
        </section>
      ) : modoExibicao === 'terminal' ? (
        /* Modo Terminal CRT */
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
              ? `${totalVivos} VIVOS (${ativos} EXEC)`
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
          {resumoSelecionado && (
            <div className="mb-4">
              <InspectorUnificadoAgente
                resumo={resumoSelecionado}
                aoFechar={() => setAgenteInspecionado(null)}
              />
            </div>
          )}

          {listaVivos.length > 0 ? (
            <div className="grid grid-cols-1 min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {listaVivos.map((ag) => {
                const chave = ag.dono ? `${ag.dono}:${ag.id}` : ag.id
                const isSelected = agenteInspecionado === chave
                return (
                  <AgenteVivoCard
                    key={chave}
                    agente={ag}
                    catalogo={catalogoPixel}
                    selecionado={isSelected}
                    onClick={() => abrirAgentesAtivos(chave)}
                    modo="terminal"
                  />
                )
              })}
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-700 bg-[#0f172a]/60 p-6 text-center text-xs text-slate-400">
              Nenhum agente em execução ativa neste instante. Monitorando transcripts e processos a cada 10s.
            </div>
          )}
        </PixelJanela>
      ) : (
        /* Modo Mapa do Squad */
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

      {/* CT Studio: mesmos dados e ações; muda somente a apresentação no modo office. */}
      {modoExibicao === 'office' ? (
        <OfficeTacticalPanels
          totalVivos={totalVivos}
          ativos={ativos}
          catalogoTotal={catalogoPixel.length}
          convocacoes={estado.resumo.convocacoes_total}
          retornos={totalRetornos}
          aprovacoes={aprovacoesPendentes}
          departamentos={squadIds.map((id) => ({ id, nome: estado.squads[id]?.nome ?? id, quantidade: porSquad(estado, id).length }))}
          totalAgentesDepartamento={estado.agentes.length}
          aoAbrirAtivos={() => abrirAgentesAtivos()}
          aoAbrirAprovacoes={() => ir('aprovacoes')}
        />
      ) : (<>
      {/* Grid de KPIs Pixel Art */}
      <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <PixelKpi
          rotulo="AGENTES VIVOS"
          valor={totalVivos}
          cor="text-[#a3e635]"
          nota={`${ativos} executando agora`}
          onClick={() => abrirAgentesAtivos()}
        />
        <PixelKpi
          rotulo="CATÁLOGO FROTA"
          valor={catalogoPixel.length}
          cor="text-[#38bdf8]"
          nota="agentes catalogados"
        />
        <PixelKpi
          rotulo="APROVAÇÕES PENDENTES"
          valor={aprovacoesPendentes.length}
          cor="text-[#facc15]"
          nota="aguardando decisão humana"
          onClick={() => ir('aprovacoes')}
        />
        <PixelKpi
          rotulo="CONVOCAÇÕES TOTAIS"
          valor={estado.resumo.convocacoes_total}
          cor="text-[#c084fc]"
          nota="chamadas registradas"
        />
        <PixelKpi
          rotulo="RETORNOS CONFIRMADOS"
          valor={totalRetornos}
          cor="text-[#34d399]"
          nota="relatórios e entregas"
        />
        <PixelKpi
          rotulo="DEPARTAMENTOS"
          valor={squadIds.length}
          cor="text-[#fb923c]"
          nota="squads estruturados"
        />
      </div>

      {/* Janelas Secundárias de Trabalho dos Agentes */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <PixelJanela
          titulo="FILA DE APROVAÇÕES DE AGENTES"
          badge={`${aprovacoesPendentes.length} PENDENTES`}
          corBadge={aprovacoesPendentes.length > 0 ? 'text-[#facc15]' : 'text-[#a3e635]'}
        >
          {aprovacoesPendentes.length > 0 ? (
            <div className="space-y-2.5">
              {aprovacoesPendentes.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-2 border-black bg-[#0f172a] p-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block size-2 rounded-full bg-[#facc15]" />
                      <span className="truncate font-mono text-xs font-bold text-white">
                        {item.titulo || item.id}
                      </span>
                    </div>
                    <span className="mt-0.5 block text-[10.5px] text-slate-400">
                      Origem: {item.origem} · Tipo: {item.tipo}
                    </span>
                  </div>
                  <span className="border border-black bg-[#facc15]/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#facc15]">
                    {item.estado}
                  </span>
                </div>
              ))}
              {aprovacoesPendentes.length > 6 && (
                <div className="text-center text-[11px] text-slate-400 pt-1">
                  + {aprovacoesPendentes.length - 6} item(ns) aguardando na fila
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400 border-2 border-dashed border-slate-700 bg-[#0f172a]/50">
              Nenhuma aprovação pendente no momento. Toda a frota está liberada para execução.
            </div>
          )}
        </PixelJanela>

        <PixelJanela
          titulo="DISTRIBUIÇÃO POR DEPARTAMENTO"
          badge={`${estado.agentes.length} AGENTES`}
          corBadge="text-[#38bdf8]"
        >
          <div className="space-y-4">
            {squadIds.map((squadId) => {
              const squadAgentes = porSquad(estado, squadId)
              const nome = estado.squads[squadId]?.nome ?? squadId
              return (
                <PixelLinha
                  key={squadId}
                  nome={nome}
                  valor={squadAgentes.length}
                  total={estado.agentes.length}
                  cor="bg-[#38bdf8]"
                />
              )
            })}
          </div>
          <p className="mt-4 border-t border-slate-700 pt-2.5 text-[10.5px] text-slate-400">
            Mede o efetivo catalogado em cada departamento ativo do painel.
          </p>
        </PixelJanela>
      </div>
      </>)}
    </div>
  )
}

function PixelKpi({
  rotulo,
  valor,
  cor = 'text-white',
  nota,
  onClick,
  ativo,
}: {
  rotulo: string
  valor?: number | null
  cor?: string
  nota?: string
  onClick?: () => void
  ativo?: boolean
}) {
  const clicavel = Boolean(onClick)
  return (
    <div
      onClick={onClick}
      role={clicavel ? 'button' : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onKeyDown={
        clicavel
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick?.()
            }
          : undefined
      }
      className={`border-4 border-black bg-[#0f172a] p-4 sm:p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all ${
        clicavel ? 'cursor-pointer hover:-translate-y-0.5 hover:border-slate-500' : ''
      } ${ativo ? 'ring-4 ring-[#facc15] bg-[#1e293b]' : ''}`}
    >
      <div className="flex items-center justify-between gap-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
        <span>{rotulo}</span>
        {clicavel && (
          <span className="text-[10px] font-mono text-[#facc15]">
            {ativo ? '▲ FECHAR' : '▼ ABRIR'}
          </span>
        )}
      </div>
      <div className={`mt-2 text-3xl sm:text-4xl font-black tabular-nums ${cor}`}>
        {valor !== null && valor !== undefined ? valor : 'sem dado'}
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
  onClick,
  clicavel = false,
}: {
  nome: string
  valor?: number
  total?: number | null
  cor?: string
  onClick?: () => void
  clicavel?: boolean
}) {
  const fracao = total && valor !== undefined ? Math.min(100, (valor / total) * 100) : 0
  const isClickable = Boolean(onClick || clicavel)
  return (
    <div
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick?.()
            }
          : undefined
      }
      className={`space-y-1.5 ${
        isClickable ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold uppercase text-slate-200">{nome}</span>
        <span className="font-black tabular-nums text-white">
          {valor ?? 'sem dado'}
          {isClickable && <span className="ml-1 text-[10px] text-[#facc15]">▼</span>}
        </span>
      </div>
      <div className="h-3 border-2 border-black bg-[#0f172a] p-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className={`h-full ${cor} transition-all duration-300`} style={{ width: `${fracao}%` }} />
      </div>
    </div>
  )
}
