import { useMemo, useState } from 'react'
import { useAgentesVivos } from '../dados/useAgentesVivos'
import { contarAgentesVivosNaContagem } from '../dados/agentes-vivos'
import { montarCatalogoPixel } from '../dados/pixel-agents'
import { PixelOffice } from '../ui/PixelOffice'
import { porSquad, squadsComAgentes } from '../dados/estado'
import type { PropsTela } from './Vazias'
import type { AgenteVivo } from '../dados/tipos'

const CLASSE_DONO_PIXEL: Record<string, string> = {
  luana: 'bg-[#38bdf8] text-black',
  renato: 'bg-renato text-black',
  bia: 'bg-[#f472b6] text-black',
}

const classeDonoPixel = (dono: string | undefined) => (
  dono ? CLASSE_DONO_PIXEL[dono] ?? 'bg-slate-300 text-black' : 'bg-slate-300 text-black'
)

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
            <span className="grid size-4 place-items-center border border-black bg-[#ef4444] text-white hover:bg-red-600">
              <svg className="size-2.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

function InspectorAgente({
  agente,
  aoFechar,
}: {
  agente: AgenteVivo
  aoFechar: () => void
}) {
  const donoFormatado = agente.dono
    ? agente.dono.charAt(0).toUpperCase() + agente.dono.slice(1)
    : null

  const statusTexto =
    agente.status ||
    (agente.problema
      ? `erro (${agente.problema})`
      : agente.estado === 'trabalhando'
      ? 'executando'
      : agente.estado === 'silencioso'
      ? 'ocioso'
      : 'encerrado')

  const ultimaAtividade =
    agente.silencio_s !== null && agente.silencio_s !== undefined
      ? agente.silencio_s === 0
        ? 'agora'
        : `${agente.silencio_s}s atrás`
      : agente.ultima_atividade || '—'

  return (
    <div className="border-4 border-black bg-[#0f172a] p-4 text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-3 min-w-0">
      {/* Topo do Inspector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/80 pb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            className={`size-3 shrink-0 ${
              agente.estado === 'trabalhando' ? 'bg-[#a3e635] animate-ping' : 'bg-slate-500'
            }`}
          />
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-black uppercase text-[#facc15] truncate">
              INSPECTOR: {(agente.papel || agente.tipo || agente.identidade || agente.id).toUpperCase()}
            </span>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              ({agente.id})
            </span>
          </div>
          {donoFormatado && (
            <span
              className={`border border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                classeDonoPixel(agente.dono)
              }`}
            >
              {donoFormatado}
            </span>
          )}
          <span
            className={`border border-black px-2 py-0.5 text-[10px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
              agente.estado === 'trabalhando'
                ? 'bg-[#a3e635] text-black'
                : agente.estado === 'silencioso'
                ? 'bg-[#facc15] text-black'
                : 'bg-slate-600 text-white'
            }`}
          >
            {statusTexto.toUpperCase()}
          </span>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          className="self-start sm:self-auto shrink-0 border-2 border-black bg-[#1e293b] px-3 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1.5"
        >
          <span>FECHAR INSPECTOR</span>
          <svg className="size-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Descrição / Etapa em andamento */}
      <div className="min-w-0">
        <div className="text-[10px] uppercase font-bold text-slate-400">Tarefa / Etapa</div>
        <p className="mt-0.5 text-xs text-slate-200 break-words break-all [overflow-wrap:anywhere] leading-relaxed">
          {agente.tarefa || agente.descricao || agente.etapa || 'Sem descrição da tarefa atual'}
        </p>
      </div>

      {/* Grid de Métricas Ricas Pedidas pelo Gastão */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 min-w-0 pt-1">
        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Modelo</div>
          <div className="text-xs font-black text-[#38bdf8] truncate mt-0.5" title={agente.modelo_legivel || agente.modelo || '—'}>
            {agente.modelo_legivel || agente.modelo || '—'}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Esforço</div>
          <div className="text-xs font-black text-slate-100 truncate mt-0.5">
            {agente.esforco || '—'}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Dono</div>
          <div className="text-xs font-black text-slate-100 truncate mt-0.5">
            {donoFormatado || '—'}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Rodando há</div>
          <div className="text-xs font-black text-slate-100 truncate mt-0.5">
            {agente.rodando_ha || (agente.inicio ? `desde ${agente.inicio}` : '—')}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Última atividade</div>
          <div className="text-xs font-black text-[#a3e635] truncate mt-0.5">
            {ultimaAtividade}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Ferramentas usadas</div>
          <div className="text-xs font-black text-slate-100 truncate mt-0.5" title={agente.ferramenta ? `Ativa: ${agente.ferramenta}` : undefined}>
            {agente.ferramentas_usadas ?? 0}
            {agente.ferramenta ? ` (${agente.ferramenta})` : ''}
          </div>
        </div>

        <div className="border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400 truncate">Tokens gastos</div>
          <div className="text-xs font-black text-[#facc15] truncate mt-0.5" title={agente.tokens_total ? `${agente.tokens_total} tokens` : undefined}>
            {agente.tokens_formatado || (agente.tokens_total ? `${agente.tokens_total}` : '—')}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-2 lg:col-span-2 border border-slate-700 bg-[#1e293b]/70 p-2 min-w-0">
          <div className="text-[9.5px] uppercase font-bold text-slate-400">Quem mandou</div>
          <div className="text-xs font-black text-slate-100 mt-0.5 break-words [overflow-wrap:anywhere] leading-snug" title={agente.quem_mandou || agente.pai || '—'}>
            {agente.quem_mandou || agente.pai || '—'}
          </div>
        </div>
      </div>

      {/* Alerta de problema se houver */}
      {agente.problema && (
        <div className="border border-red-500/50 bg-red-950/40 p-2.5 text-xs text-red-200 break-words [overflow-wrap:anywhere]">
          <span className="font-bold text-red-400">Problema anotado: </span>
          {agente.problema}
        </div>
      )}
    </div>
  )
}

export function Tarefas({ estado, vista }: PropsTela) {
  const { dados: vivos, carregando: carregandoVivos, erro: erroVivos, falhouHaSegundos } = useAgentesVivos()
  const ativos = vivos?.contagem?.trabalhando ?? 0
  const totalVivos = contarAgentesVivosNaContagem(vivos?.contagem)
  // A sonda é a única fonte de presença; o catálogo do escritório completa o restante.
  const listaVivos = vivos?.agentes ?? []
  const catalogoPixel = useMemo(() => montarCatalogoPixel(estado.agentes, estado.sessao), [estado.agentes, estado.sessao])
  const squadIds = useMemo(() => squadsComAgentes(estado), [estado])

  const [modoExibicao, setModoExibicao] = useState<'office' | 'terminal' | 'squad'>('office')
  const [agenteInspecionado, setAgenteInspecionado] = useState<string | null>(null)

  const aprovacoesItens = estado.aprovacoes?.itens ?? []
  const aprovacoesPendentes = aprovacoesItens.filter((i) => i.estado === 'aguardando' || i.estado === 'pendente')
  const totalRetornos = estado.agentes.reduce((s, a) => s + (a.retornos_registrados || 0), 0)

  const agenteSelecionado: AgenteVivo | undefined =
    listaVivos.find((a) =>
      a.id === agenteInspecionado ||
      `${a.dono}:${a.id}` === agenteInspecionado ||
      (a.identidade && a.identidade === agenteInspecionado)
    ) ??
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
                [ 👾 ESCRITÓRIO DOS AGENTES ]
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
              {estado?.gerado_em ? `📡 SYNC: ${new Date(estado.gerado_em).toLocaleString('pt-BR')}` : 'OFFLINE'}
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
            <InspectorAgente
              agente={agenteSelecionado}
              aoFechar={() => setAgenteInspecionado(null)}
            />
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
          {agenteSelecionado && (
            <div className="mb-4">
              <InspectorAgente
                agente={agenteSelecionado}
                aoFechar={() => setAgenteInspecionado(null)}
              />
            </div>
          )}

          {listaVivos.length > 0 ? (
            <div className="grid grid-cols-1 min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {listaVivos.map((ag) => {
                const chave = ag.dono ? `${ag.dono}:${ag.id}` : ag.id
                const isSelected = agenteInspecionado === chave || agenteInspecionado === ag.id
                return (
                  <div
                    key={chave}
                    onClick={() => setAgenteInspecionado(isSelected ? null : chave)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setAgenteInspecionado(isSelected ? null : chave)
                      }
                    }}
                    className={`flex min-w-0 flex-col justify-between border-2 border-black bg-[#0f172a] p-3.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5 cursor-pointer text-left ${
                      isSelected ? 'ring-2 ring-[#a3e635] bg-[#1e293b]' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-1.5 border-b border-slate-700 pb-2">
                        <div className="flex min-w-0 items-center gap-1.5 truncate">
                          {ag.dono && (
                            <span
                              className={`shrink-0 border border-black px-1.5 py-0.5 text-[8.5px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                                classeDonoPixel(ag.dono)
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
                            ag.estado === 'trabalhando'
                              ? 'bg-[#a3e635] text-black'
                              : ag.estado === 'silencioso'
                              ? 'bg-[#facc15] text-black'
                              : 'bg-slate-500 text-white'
                          }`}
                        >
                          {ag.estado === 'trabalhando' ? 'EXEC' : ag.estado === 'silencioso' ? 'OCIOSO' : 'FORA'}
                        </span>
                      </div>

                      {/* Chips compactos de modelo, tokens e esforço */}
                      {(ag.modelo_legivel || ag.tokens_formatado || ag.esforco) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {ag.modelo_legivel && (
                            <span
                              className="border border-slate-700 bg-slate-800/90 px-1.5 py-0.5 text-[9px] font-bold text-[#38bdf8] truncate max-w-[140px]"
                              title={ag.modelo_legivel}
                            >
                              🤖 {ag.modelo_legivel}
                            </span>
                          )}
                          {ag.tokens_formatado && (
                            <span
                              className="border border-slate-700 bg-slate-800/90 px-1.5 py-0.5 text-[9px] font-bold text-[#facc15]"
                              title={`${ag.tokens_total ?? ''} tokens`}
                            >
                              🪙 {ag.tokens_formatado}
                            </span>
                          )}
                          {ag.esforco && (
                            <span className="border border-slate-700 bg-slate-800/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                              ⚡ {ag.esforco}
                            </span>
                          )}
                        </div>
                      )}

                      <div
                        className="mt-2.5 min-w-0 border-l-2 border-[#38bdf8] pl-2 text-xs text-slate-200 line-clamp-3 leading-relaxed break-words break-all [overflow-wrap:anywhere]"
                        title={ag.tarefa || ag.descricao || ag.etapa || 'Etapa não informada'}
                      >
                        {ag.tarefa || ag.descricao || ag.etapa || 'ETAPA EM ANDAMENTO'}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-700/80 pt-2 text-[10px] text-slate-400">
                      <span className="truncate max-w-[120px] font-semibold">
                        {ag.ferramenta ? `TOOL: ${ag.ferramenta}` : ag.fase}
                      </span>
                      <span className="tabular-nums font-mono text-[#a3e635]">
                        {ag.silencio_s !== null && ag.silencio_s !== undefined ? `${ag.silencio_s}s` : ''}
                      </span>
                    </div>
                  </div>
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

      {/* Grid de KPIs Pixel Art com Números Grandes */}
      <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <PixelKpi
          rotulo="AGENTES VIVOS"
          valor={totalVivos}
          cor="text-[#a3e635]"
          nota={`${ativos} executando agora`}
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
      <div className="grid gap-5 lg:grid-cols-2">
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

      {/* Nota de Governança de Arquitetura */}
      <div className="border-2 border-black bg-[#0f172a] p-4 text-xs text-slate-300 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#a3e635]">
          <span>🛡️ ISOLAMENTO DE CARTEIRA PESSOAL</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
          O Painel OS exibe exclusivamente a operação e o trabalho dos agentes autônomos. As tarefas pessoais e compromissos GTD foram isolados no sistema pessoal do Gastão, sem cruzamento com o painel público.
        </p>
      </div>
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
          {valor ?? '—'}
          {isClickable && <span className="ml-1 text-[10px] text-[#facc15]">▼</span>}
        </span>
      </div>
      <div className="h-3 border-2 border-black bg-[#0f172a] p-0.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
        <div className={`h-full ${cor} transition-all duration-300`} style={{ width: `${fracao}%` }} />
      </div>
    </div>
  )
}
