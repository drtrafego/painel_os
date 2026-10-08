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

/** Painel Executivo Integrado do Núcleo Operacional */
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
      className={`relative min-w-0 overflow-hidden rounded-2xl border border-[#383324]/80 bg-gradient-to-b from-[#15191d] via-[#101416] to-[#0c0f12] text-[#eeeade] shadow-[0_12px_32px_rgba(0,0,0,0.55)] transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#f4ce4b]/35 before:to-transparent ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[#2d291e]/80 bg-[#0e1215]/90 px-4 py-3 sm:px-5 backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-block size-2 shrink-0 rounded-full bg-[#f4ce4b] shadow-[0_0_8px_#f4ce4b]" />
          <span className="truncate text-xs font-bold uppercase tracking-wider text-[#f4ce4b]">
            {titulo}
          </span>
          {subtitulo && <span className="hidden truncate text-[11px] text-[#aaa99e] sm:inline">· {subtitulo}</span>}
        </div>
        {badge && (
          <span className={`rounded-full border border-[#423c28] bg-[#1a1f23]/90 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider shadow-inner ${corBadge}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5 lg:p-6">{children}</div>
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
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-[#383324]/80 bg-gradient-to-b from-[#161a1e] to-[#0e1215] p-4 text-[#eeeade] shadow-[0_8px_24px_rgba(0,0,0,0.5)] space-y-3.5 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#f4ce4b]/30 before:to-transparent">
      {/* Barra de Título do Inspector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2d291e] pb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`size-2.5 shrink-0 rounded-full ${
              resumo.estado === 'trabalhando' ? 'bg-[#a3e635] shadow-[0_0_8px_#a3e635] animate-ping' : 'bg-slate-500'
            }`}
          />
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm sm:text-base font-bold uppercase tracking-wide text-[#f4ce4b] truncate">
              INSPETOR: {resumo.nome.toUpperCase()}
            </span>
            <span className="text-[10px] text-[#aaa99e] font-mono shrink-0">
              ({resumo.id})
            </span>
          </div>
          {resumo.donoFormatado && (
            <span
              className={`rounded border border-black/40 px-2 py-0.5 text-[10px] font-bold uppercase shadow-sm ${
                classeDonoPixel(resumo.dono)
              }`}
            >
              {resumo.donoFormatado}
            </span>
          )}
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-sm ${
              resumo.estado === 'trabalhando'
                ? 'bg-[#a3e635]/20 text-[#a3e635] border-[#a3e635]/40'
                : resumo.estado === 'silencioso'
                ? 'bg-[#facc15]/20 text-[#facc15] border-[#facc15]/40'
                : 'bg-slate-700/50 text-[#aaa99e] border-[#3c3726]'
            }`}
          >
            {resumo.statusTexto.toUpperCase()}
          </span>
        </div>

        <button
          type="button"
          onClick={aoFechar}
          className="self-start sm:self-auto shrink-0 rounded-lg border border-[#3f3929] bg-[#1a1f23] px-3 py-1 text-xs font-semibold text-[#cfcbba] hover:border-[#f4ce4b] hover:text-[#f4ce4b] transition-colors flex items-center gap-1.5"
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
    <div className="w-full max-w-none space-y-6 px-3 py-4 font-sans text-[#eeeade] sm:px-6 lg:px-8 xl:px-10">
      {/* O escritório aprovado já tem cabeçalho próprio; o cabeçalho legado fica nas visões antigas. */}
      {modoExibicao !== 'office' && (
        <div className="relative overflow-hidden rounded-2xl border border-[#383324]/80 bg-gradient-to-b from-[#181d22] via-[#121619] to-[#0c0f12] p-5 text-[#eeeade] shadow-[0_12px_32px_rgba(0,0,0,0.5)] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#f4ce4b]/35 before:to-transparent">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="inline-block size-3 rounded-full bg-[#f4ce4b] shadow-[0_0_8px_#f4ce4b] animate-pulse" />
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-[#f4ce4b]">
                  [ ESCRITÓRIO DOS AGENTES ]
                </h1>
              </div>
              <p className="mt-2 text-xs sm:text-sm text-[#aaa99e] max-w-4xl leading-relaxed">
                {vista.pergunta}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Alternador de Visualização */}
              <div className="flex flex-wrap items-center rounded-xl border border-[#383324] bg-[#0e1215] p-1 shadow-inner" aria-label="Visualização dos agentes">
                <button
                  type="button"
                  onClick={() => setModoExibicao('office')}
                  aria-pressed={false}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold uppercase text-[#aaa99e] transition-all hover:text-[#eeeade]"
                >
                  🎮 ESCRITÓRIO VOXEL
                </button>
                <button
                  type="button"
                  onClick={() => setModoExibicao('terminal')}
                  aria-pressed={modoExibicao === 'terminal'}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition-all ${
                    modoExibicao === 'terminal'
                      ? 'border border-[#38bdf8]/50 bg-[#0e2536] text-[#7dd3fc] shadow-sm'
                      : 'text-[#aaa99e] hover:text-[#eeeade]'
                  }`}
                >
                  📟 TERMINAL CRT
                </button>
                <button
                  type="button"
                  onClick={() => setModoExibicao('squad')}
                  aria-pressed={modoExibicao === 'squad'}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition-all ${
                    modoExibicao === 'squad'
                      ? 'border border-[#f4ce4b]/50 bg-[#292518] text-[#f4ce4b] shadow-sm'
                      : 'text-[#aaa99e] hover:text-[#eeeade]'
                  }`}
                >
                  🗺️ MAPA DO SQUAD
                </button>
              </div>

              <button
                type="button"
                onClick={() => ir('cofre', null, { visao: 'operacao' })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#0284c7] bg-[#0369a1]/80 px-3.5 py-2 text-xs font-bold text-white shadow-[0_0_16px_rgba(2,132,199,0.3)] hover:bg-[#0284c7] transition-all"
              >
                <span>🧠 CÉREBRO OPERACIONAL</span>
                <span className="text-[10px]">↗</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Faixa de Agentes Ativos (Trabalhando Agora) */}
      {modoExibicao !== 'office' && listaVivos.filter((a) => a.estado === 'trabalhando').length > 0 && (
        <div className="rounded-xl border border-[#383324]/70 bg-gradient-to-r from-[#14181b] to-[#0f1316] p-3 shadow-md">
          <div className="flex items-center justify-between gap-2 border-b border-[#2d291e] pb-2 mb-2">
            <span className="text-[11px] font-bold text-[#84d99a] uppercase flex items-center gap-1.5">
              <span className="size-2 bg-[#84d99a] rounded-full animate-ping" />
              Agentes trabalhando agora ({listaVivos.filter((a) => a.estado === 'trabalhando').length}):
            </span>
            <button
              type="button"
              onClick={() => abrirAgentesAtivos()}
              className="text-[10px] font-bold text-[#f4ce4b] hover:underline"
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
                    className="flex items-center gap-2 rounded-lg border border-[#383324] bg-[#161b1e] px-2.5 py-1.5 text-xs text-left hover:border-[#84d99a] hover:bg-[#121619] transition-all shadow-sm"
                  >
                    <span className="size-2 bg-[#84d99a] rounded-full" />
                    <span className="font-bold text-[#eeeade]">{ag.nome || ag.id}</span>
                    {ag.dono && (
                      <span className={`px-1 py-0.5 text-[9px] font-bold uppercase rounded ${classeDonoPixel(ag.dono)}`}>
                        {ag.dono}
                      </span>
                    )}
                    {ag.ferramenta && (
                      <span className="text-[10px] text-[#aaa99e] font-mono">
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
        <div className="rounded-xl border border-red-900/60 bg-gradient-to-r from-red-950/70 to-[#1b0a0a] p-4 text-[#eeeade] shadow-md">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-400">
            <span>⚠ FALHA NA SONDA DE AGENTES AO VIVO</span>
            {falhouHaSegundos !== null && (
              <span className="rounded border border-red-800/80 bg-red-950/80 px-2 py-0.5 text-[10px] text-[#f4ce4b]">
                {falhouHaSegundos === 0 ? 'sonda falhou na inicialização' : `sonda falhou há ${falhouHaSegundos}s`}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#d5d0bf]">
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

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#353024]/70 bg-gradient-to-r from-[#14181b] via-[#101416] to-[#0d1012] px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-[#b8b4a2]">
              <span className="inline-block size-1.5 rounded-full bg-[#f4ce4b] shadow-[0_0_8px_#f4ce4b]" />
              <span className="text-[10px] uppercase tracking-widest text-[#d8bd65]">Perspectivas Operacionais</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModoExibicao('terminal')}
                className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-[#3f3929]/70 bg-[#161b1e] px-3.5 text-xs font-semibold tracking-wide text-[#dcd8c9] shadow-sm transition-all hover:border-[#f4ce4b]/70 hover:bg-[#1f2529] hover:text-[#f4ce4b] active:scale-95"
              >
                <span>📟</span>
                <span>Terminal CRT</span>
                <span className="text-[10px] text-[#8e875d]">↗</span>
              </button>
              <button
                type="button"
                onClick={() => setModoExibicao('squad')}
                className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-[#3f3929]/70 bg-[#161b1e] px-3.5 text-xs font-semibold tracking-wide text-[#dcd8c9] shadow-sm transition-all hover:border-[#f4ce4b]/70 hover:bg-[#1f2529] hover:text-[#f4ce4b] active:scale-95"
              >
                <span>🗺️</span>
                <span>Mapa do Squad</span>
                <span className="text-[10px] text-[#8e875d]">↗</span>
              </button>
              <button
                type="button"
                onClick={() => ir('cofre', null, { visao: 'operacao' })}
                className="min-h-11 inline-flex items-center gap-1.5 rounded-lg border border-[#38bdf8]/40 bg-[#0e1f2b]/60 px-3.5 text-xs font-semibold tracking-wide text-[#7dd3fc] shadow-[0_0_12px_rgba(56,189,248,0.1)] transition-all hover:border-[#38bdf8] hover:bg-[#0e2536] hover:text-white active:scale-95"
              >
                <span>🧠</span>
                <span>Cérebro</span>
                <span className="text-[10px] text-[#38bdf8]">↗</span>
              </button>
            </div>
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

      {/* Faixa de KPIs Operacionais Premium */}
      <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <PixelKpi
          rotulo="AGENTES VIVOS"
          valor={totalVivos}
          cor="text-[#84d99a]"
          nota={`${ativos} executando agora`}
          onClick={() => abrirAgentesAtivos()}
          ativo={rota.visao === 'ativos'}
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
          cor={aprovacoesPendentes.length > 0 ? 'text-[#f4ce4b]' : 'text-[#84d99a]'}
          nota={aprovacoesPendentes.length > 0 ? 'aguardando decisão humana' : 'em conformidade'}
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

      {/* Painéis Táticos Integrados */}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <PixelJanela
          titulo="FILA DE APROVAÇÕES DE AGENTES"
          badge={`${aprovacoesPendentes.length} PENDENTES`}
          corBadge={aprovacoesPendentes.length > 0 ? 'text-[#f4ce4b]' : 'text-[#84d99a]'}
        >
          {aprovacoesPendentes.length > 0 ? (
            <div className="space-y-2.5">
              {aprovacoesPendentes.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="group flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#3b3527]/70 bg-gradient-to-r from-[#171c20] to-[#111518] p-3 shadow-sm hover:border-[#f4ce4b]/50 transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block size-2 shrink-0 rounded-full bg-[#f4ce4b] shadow-[0_0_8px_#f4ce4b] animate-pulse" />
                      <span className="truncate font-mono text-xs font-bold text-[#eeeade]">
                        {item.titulo || item.id}
                      </span>
                    </div>
                    <span className="mt-1 block text-[11px] text-[#aaa99e]">
                      Origem: <span className="text-[#ded9c5]">{item.origem}</span> · Tipo: <span className="text-[#ded9c5]">{item.tipo}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#f4ce4b]/40 bg-[#f4ce4b]/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#f4ce4b]">
                      {item.estado}
                    </span>
                    <button
                      type="button"
                      onClick={() => ir('aprovacoes')}
                      className="rounded-lg border border-[#3f3929] bg-[#1a1f23] px-2 py-1 text-[10px] font-semibold text-[#d8bd65] hover:border-[#f4ce4b] hover:text-[#f4ce4b] transition-colors"
                      title="Analisar aprovação"
                    >
                      Analisar ↗
                    </button>
                  </div>
                </div>
              ))}
              {aprovacoesPendentes.length > 6 && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-[#aaa99e]">
                  <span>+ {aprovacoesPendentes.length - 6} item(ns) aguardando na fila</span>
                  <button
                    type="button"
                    onClick={() => ir('aprovacoes')}
                    className="font-semibold text-[#f4ce4b] hover:underline"
                  >
                    Ver todos na Central de Aprovações ↗
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#2e3a32]/60 bg-gradient-to-b from-[#111915]/50 to-[#0c120f]/60 p-6 sm:p-7 text-center">
              <div className="flex size-10 items-center justify-center rounded-full border border-[#34d399]/40 bg-[#14231b] text-base text-[#34d399] shadow-[0_0_16px_rgba(52,211,153,0.2)]">
                ✓
              </div>
              <h4 className="mt-3 text-sm font-bold uppercase tracking-wider text-[#84d99a]">
                Toda a frota operando em conformidade
              </h4>
              <p className="mt-1.5 max-w-md text-xs text-[#aaa99e] leading-relaxed">
                Nenhuma solicitação pendente de liberação humana no momento. Todos os agentes atuam com autonomia autorizada.
              </p>
              <button
                type="button"
                onClick={() => ir('aprovacoes')}
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-[#3a443b] bg-[#142018] px-3.5 py-1.5 text-xs font-semibold text-[#84d99a] transition-all hover:border-[#84d99a] hover:bg-[#1a2d20]"
              >
                <span>Consultar histórico de aprovações</span>
                <span className="text-[10px]">↗</span>
              </button>
            </div>
          )}
        </PixelJanela>

        <PixelJanela
          titulo="DISTRIBUIÇÃO POR DEPARTAMENTO"
          badge={`${estado.agentes.length} AGENTES`}
          corBadge="text-[#38bdf8]"
        >
          <div className="space-y-3.5">
            {squadIds.map((squadId) => {
              const squadAgentes = porSquad(estado, squadId)
              const nome = estado.squads[squadId]?.nome ?? squadId
              const chave = squadId.toLowerCase()
              const configCor = CORES_DEPARTAMENTO[chave] ?? {
                bar: 'bg-gradient-to-r from-[#eaca56] to-[#f4ce4b]',
                dot: 'bg-[#f4ce4b]',
              }
              return (
                <PixelLinha
                  key={squadId}
                  nome={nome}
                  valor={squadAgentes.length}
                  total={estado.agentes.length}
                  cor={configCor.bar}
                  corDot={configCor.dot}
                />
              )
            })}
          </div>
          <p className="mt-4 border-t border-[#2d291e] pt-2.5 text-[11px] text-[#aaa99e]">
            Mede o efetivo catalogado em cada departamento ativo do painel.
          </p>
        </PixelJanela>
      </div>
    </div>
  )
}

const CORES_DEPARTAMENTO: Record<string, { bar: string; dot: string }> = {
  conteudo: { bar: 'bg-gradient-to-r from-[#38bdf8] to-[#60a5fa]', dot: 'bg-[#38bdf8]' },
  comercial: { bar: 'bg-gradient-to-r from-[#34d399] to-[#10b981]', dot: 'bg-[#34d399]' },
  financeiro: { bar: 'bg-gradient-to-r from-[#f4ce4b] to-[#f59e0b]', dot: 'bg-[#f4ce4b]' },
  conhecimento: { bar: 'bg-gradient-to-r from-[#c084fc] to-[#a855f7]', dot: 'bg-[#c084fc]' },
  operacao: { bar: 'bg-gradient-to-r from-[#fb923c] to-[#f97316]', dot: 'bg-[#fb923c]' },
  diretoria: { bar: 'bg-gradient-to-r from-[#f4ce4b] to-[#fbbf24]', dot: 'bg-[#f4ce4b]' },
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
      className={`group relative min-w-0 overflow-hidden rounded-xl border p-4 sm:p-5 transition-all duration-200 ${
        ativo
          ? 'border-[#f4ce4b] bg-gradient-to-b from-[#24261c] to-[#14181a] shadow-[0_0_24px_rgba(244,206,75,0.22)]'
          : 'border-[#383324]/65 bg-gradient-to-b from-[#161a1e] via-[#121619] to-[#0d1013] shadow-[0_6px_20px_rgba(0,0,0,0.45)]'
      } ${
        clicavel
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#f4ce4b]/70 hover:shadow-[0_10px_26px_rgba(0,0,0,0.6)]'
          : ''
      } before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#f4ce4b]/30 before:to-transparent`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a8a493]">
          {rotulo}
        </span>
        {clicavel && (
          <span
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium tracking-wide transition-colors ${
              ativo
                ? 'border-[#f4ce4b] bg-[#f4ce4b]/20 text-[#f4ce4b]'
                : 'border-[#453e2b] bg-[#1a1f23] text-[#cfcbba] group-hover:border-[#f4ce4b]/60 group-hover:text-[#f4ce4b]'
            }`}
          >
            {ativo ? 'Ativo' : 'Acessar'}
            <span className="text-[10px]">↗</span>
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight tabular-nums ${cor}`}>
          {valor !== null && valor !== undefined ? valor : '—'}
        </span>
      </div>
      {nota && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#aaa99e]">
          <span className="inline-block size-1 rounded-full bg-[#f4ce4b]/70" />
          <span className="truncate">{nota}</span>
        </div>
      )}
    </div>
  )
}

function PixelLinha({
  nome,
  valor,
  total,
  cor = 'bg-gradient-to-r from-[#eaca56] to-[#f4ce4b]',
  corDot = 'bg-[#f4ce4b]',
  onClick,
  clicavel = false,
}: {
  nome: string
  valor?: number
  total?: number | null
  cor?: string
  corDot?: string
  onClick?: () => void
  clicavel?: boolean
}) {
  const percentual = total && valor !== undefined ? Math.round((valor / total) * 100) : 0
  const fracao = total && valor !== undefined ? Math.min(100, Math.max(0, (valor / total) * 100)) : 0
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
      className={`group space-y-1.5 ${
        isClickable ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`size-1.5 shrink-0 rounded-full ${corDot}`} />
          <span className="truncate font-semibold tracking-wide text-[#eeeade]">{nome}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
          <span className="font-bold text-[#f4ce4b] tabular-nums">
            {valor ?? '—'}{' '}
            <span className="text-[10px] font-normal text-[#aaa99e]">
              {valor === 1 ? 'agente' : 'agentes'}
            </span>
          </span>
          <span className="text-[#6d6b5e]">·</span>
          <span className="text-[#a8a594] tabular-nums">{percentual}%</span>
          {isClickable && <span className="ml-0.5 text-[10px] text-[#f4ce4b]">↗</span>}
        </div>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#14181a] border border-[#2b2f33]/80">
        <div
          className={`h-full ${cor} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${fracao}%` }}
        />
      </div>
    </div>
  )
}
