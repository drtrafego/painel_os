import { useEffect, useRef, useState } from 'react'

export type FaixaDeData = {
  inicio: Date
  fim: Date
  rotulo?: string
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

export function obterHojeSp(): Date {
  try {
    const formatador = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const partes = formatador.format(new Date()).split('-')
    const ano = parseInt(partes[0], 10)
    const mes = parseInt(partes[1], 10) - 1
    const dia = parseInt(partes[2], 10)
    return new Date(ano, mes, dia)
  } catch {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
}

export function obterFaixaPadrao(): FaixaDeData {
  const hoje = obterHojeSp()
  return {
    inicio: new Date(2026, 0, 1),
    fim: hoje,
    rotulo: 'Total histórico',
  }
}

export function identificarJanela(faixa?: FaixaDeData): 'hoje' | '7d' | '30d' | 'total' {
  if (!faixa) return 'total'
  const rotulo = (faixa.rotulo || '').toLowerCase()
  if (rotulo.includes('hoje')) return 'hoje'
  if (rotulo.includes('7 dia') || rotulo === '7d' || rotulo === '7dias') return '7d'
  if (rotulo.includes('30 dia') || rotulo === '30d' || rotulo === '30dias') return '30d'
  if (rotulo.includes('tudo') || rotulo.includes('total') || rotulo.includes('histórico')) return 'total'

  const hoje = obterHojeSp()
  const dInicio = new Date(faixa.inicio.getFullYear(), faixa.inicio.getMonth(), faixa.inicio.getDate())
  const dFim = new Date(faixa.fim.getFullYear(), faixa.fim.getMonth(), faixa.fim.getDate())

  if (mesmoDia(dInicio, dFim) && mesmoDia(dFim, hoje)) {
    return 'hoje'
  }

  const diffDias = Math.round((dFim.getTime() - dInicio.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDias >= 5 && diffDias <= 7 && mesmoDia(dFim, hoje)) {
    return '7d'
  }
  if (diffDias >= 27 && diffDias <= 31 && mesmoDia(dFim, hoje)) {
    return '30d'
  }

  if (faixa.inicio.getFullYear() < 2026 || diffDias > 90) {
    return 'total'
  }

  return 'total'
}

function mesmoDia(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

function entreDias(d: Date, inicio: Date, fim: Date): boolean {
  const t = d.getTime()
  const t1 = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime()
  const t2 = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime()
  const min = Math.min(t1, t2)
  const max = Math.max(t1, t2)
  return t >= min && t <= max
}

function formatarDataBr(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ano = String(d.getFullYear()).slice(-2)
  return `${dia}/${mes}/${ano}`
}

export function SeletorDeData({
  faixa,
  aoMudarFaixa,
}: {
  faixa?: FaixaDeData
  aoMudarFaixa?: (f: FaixaDeData) => void
}) {
  const [aberto, setAberto] = useState(false)

  // Intervalo ativo de data (Padrão: Total histórico ou faixa recebida)
  const [faixaAtiva, setFaixaAtiva] = useState<FaixaDeData>(() => {
    if (faixa) return faixa
    return obterFaixaPadrao()
  })

  // Rascunho temporário de seleção para o modal
  const [rascunhoInicio, setRascunhoInicio] = useState<Date>(faixaAtiva.inicio)
  const [rascunhoFim, setRascunhoFim] = useState<Date>(faixaAtiva.fim)
  const [etapaSelecao, setEtapaSelecao] = useState<'inicio' | 'fim'>('inicio')

  // Meses exibidos no calendário duplo
  const [mesVisivel, setMesVisivel] = useState(() => new Date(faixaAtiva.fim.getFullYear(), faixaAtiva.fim.getMonth(), 1))

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (faixa) {
      setFaixaAtiva(faixa)
      setRascunhoInicio(faixa.inicio)
      setRascunhoFim(faixa.fim)
      setMesVisivel(new Date(faixa.fim.getFullYear(), faixa.fim.getMonth(), 1))
    }
  }, [faixa])

  // Fecha o modal ao pressionar ESC ou clicar fora
  useEffect(() => {
    if (!aberto) return
    const aoClicarFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  // Navegação rápida de mês na barra superior (botões < Mês Ano >)
  const navegarMesAnterior = () => {
    const ref = faixaAtiva.fim || faixaAtiva.inicio
    const novoInicio = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    const novoFim = new Date(novoInicio.getFullYear(), novoInicio.getMonth() + 1, 0)
    const nova: FaixaDeData = { inicio: novoInicio, fim: novoFim, rotulo: `${NOMES_MESES[novoInicio.getMonth()]} ${novoInicio.getFullYear()}` }
    setFaixaAtiva(nova)
    setRascunhoInicio(novoInicio)
    setRascunhoFim(novoFim)
    setMesVisivel(novoInicio)
    aoMudarFaixa?.(nova)
  }

  const navegarProximoMes = () => {
    const ref = faixaAtiva.fim || faixaAtiva.inicio
    const novoInicio = new Date(ref.getFullYear(), ref.getMonth() + 1, 1)
    const novoFim = new Date(novoInicio.getFullYear(), novoInicio.getMonth() + 1, 0)
    const nova: FaixaDeData = { inicio: novoInicio, fim: novoFim, rotulo: `${NOMES_MESES[novoInicio.getMonth()]} ${novoInicio.getFullYear()}` }
    setFaixaAtiva(nova)
    setRascunhoInicio(novoInicio)
    setRascunhoFim(novoFim)
    setMesVisivel(novoInicio)
    aoMudarFaixa?.(nova)
  }

  // Presets da coluna esquerda (Hoje, Últimos 7 dias, etc.)
  const aplicarPreset = (tipo: 'hoje' | '7dias' | '30dias' | 'esteMes' | 'tudo') => {
    const hoje = obterHojeSp()
    let ini = new Date(hoje)
    let fim = new Date(hoje)
    let rotulo = 'Hoje'

    switch (tipo) {
      case 'hoje':
        rotulo = 'Hoje'
        break
      case '7dias':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)
        rotulo = 'Últimos 7 dias'
        break
      case '30dias':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29)
        rotulo = 'Últimos 30 dias'
        break
      case 'esteMes':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
        fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
        rotulo = `${NOMES_MESES[hoje.getMonth()]} ${hoje.getFullYear()}`
        break
      case 'tudo':
        ini = new Date(2026, 0, 1)
        rotulo = 'Total histórico'
        break
    }

    const nova: FaixaDeData = { inicio: ini, fim, rotulo }
    setRascunhoInicio(ini)
    setRascunhoFim(fim)
    setMesVisivel(new Date(fim.getFullYear(), fim.getMonth(), 1))
    setFaixaAtiva(nova)
    setAberto(false)
    aoMudarFaixa?.(nova)
  }

  // Seleção de dia no grid do calendário
  const aoClicarDia = (dia: Date) => {
    if (etapaSelecao === 'inicio') {
      setRascunhoInicio(dia)
      setRascunhoFim(dia)
      setEtapaSelecao('fim')
    } else {
      if (dia < rascunhoInicio) {
        setRascunhoInicio(dia)
        setRascunhoFim(rascunhoInicio)
      } else {
        setRascunhoFim(dia)
      }
      setEtapaSelecao('inicio')
    }
  }

  // Confirmação final no botão "Aplicar"
  const aoAplicar = () => {
    const min = rascunhoInicio < rascunhoFim ? rascunhoInicio : rascunhoFim
    const max = rascunhoInicio < rascunhoFim ? rascunhoFim : rascunhoInicio
    const nova: FaixaDeData = { inicio: min, fim: max }
    setFaixaAtiva(nova)
    setAberto(false)
    aoMudarFaixa?.(nova)
  }

  // Constrói a grade de um mês no calendário
  const gerarGridMes = (ano: number, mes: number) => {
    const primeiroDia = new Date(ano, mes, 1)
    const ultimoDia = new Date(ano, mes + 1, 0)
    const diaSemanaInicio = primeiroDia.getDay()
    const totalDias = ultimoDia.getDate()

    const diasAnteriores = new Date(ano, mes, 0).getDate()

    const celulas: { data: Date; pertenceAoMes: boolean }[] = []

    // Dias do mês anterior
    for (let i = diaSemanaInicio - 1; i >= 0; i--) {
      celulas.push({
        data: new Date(ano, mes - 1, diasAnteriores - i),
        pertenceAoMes: false,
      })
    }

    // Dias do mês atual
    for (let d = 1; d <= totalDias; d++) {
      celulas.push({
        data: new Date(ano, mes, d),
        pertenceAoMes: true,
      })
    }

    // Dias do próximo mês para completar semanas completas
    const sobra = (7 - (celulas.length % 7)) % 7
    for (let i = 1; i <= sobra; i++) {
      celulas.push({
        data: new Date(ano, mes + 1, i),
        pertenceAoMes: false,
      })
    }

    return celulas
  }

  const mes1 = mesVisivel
  const mes2 = new Date(mes1.getFullYear(), mes1.getMonth() + 1, 1)

  const gridMes1 = gerarGridMes(mes1.getFullYear(), mes1.getMonth())
  const gridMes2 = gerarGridMes(mes2.getFullYear(), mes2.getMonth())

  const nomeMesAnoAtivo = `${NOMES_MESES[faixaAtiva.fim.getMonth()]} ${faixaAtiva.fim.getFullYear()}`
  const textoFaixaFormatada = `${formatarDataBr(faixaAtiva.inicio)} — ${formatarDataBr(faixaAtiva.fim)}`

  return (
    <div ref={containerRef} className="relative inline-flex max-w-full items-center text-[var(--color-tinta)] font-sans">
      {/* BARRA DE NAVEGAÇÃO E SELETOR DE DATAS DA CABEÇA */}
      <div className="flex max-w-full items-center gap-1.5 sm:gap-2">
        {/* Controles rápidos de mês: < Mês Ano > */}
        <div className="flex items-center rounded-xl border border-[var(--color-linha)] bg-[var(--color-carta)] p-0.5 shadow-sm">
          <button
            type="button"
            onClick={navegarMesAnterior}
            title="Mês anterior"
            className="flex size-7 items-center justify-center rounded-lg text-[var(--color-tinta-2)] transition-colors hover:bg-[var(--color-fundo)] hover:text-[var(--color-tinta)] active:scale-95"
          >
            <span className="text-xs">‹</span>
          </button>
          <span className="px-1.5 font-mono text-[11px] font-semibold text-[var(--color-tinta)] sm:px-2.5 sm:text-[12px]">
            {nomeMesAnoAtivo}
          </span>
          <button
            type="button"
            onClick={navegarProximoMes}
            title="Próximo mês"
            className="flex size-7 items-center justify-center rounded-lg text-[var(--color-tinta-2)] transition-colors hover:bg-[var(--color-fundo)] hover:text-[var(--color-tinta)] active:scale-95"
          >
            <span className="text-xs">›</span>
          </button>
        </div>

        {/* Botão de Intervalo com Ícone de Calendário */}
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="flex min-w-0 items-center gap-1.5 rounded-xl border border-[var(--color-linha)] bg-[var(--color-carta)] px-2 py-1.5 font-mono text-[11px] font-medium text-[var(--color-tinta)] shadow-sm transition-all hover:border-[var(--color-linha-forte)] hover:bg-[var(--color-fundo)] active:scale-95 sm:gap-2.5 sm:px-3.5 sm:text-[12px]"
        >
          <span className="opacity-80">📅</span>
          <span className="whitespace-nowrap">
            {faixaAtiva.rotulo && <span className="hidden md:inline font-bold mr-1">{faixaAtiva.rotulo} ·</span>}
            {textoFaixaFormatada}
          </span>
        </button>
      </div>

      {/* POPOVER MODAL COMPLETO */}
      {aberto && (
        <div className="absolute right-0 top-full z-50 mt-2 flex w-[680px] max-w-[95vw] overflow-hidden rounded-2xl border border-[var(--color-linha)] bg-[var(--color-carta)] text-[var(--color-tinta)] shadow-2xl backdrop-blur-xl">
          {/* Coluna Esquerda: Presets */}
          <div className="w-44 shrink-0 border-r border-[var(--color-linha)] bg-[var(--color-fundo)] p-3 text-[13px] font-medium text-[var(--color-tinta-2)]">
            <div className="space-y-1">
              {[
                { key: 'hoje', label: 'Hoje' },
                { key: '7dias', label: 'Últimos 7 dias' },
                { key: '30dias', label: 'Últimos 30 dias' },
                { key: 'esteMes', label: 'Este mês' },
                { key: 'tudo', label: 'Total histórico' },
              ].map((p) => {
                const ativo = (p.key === 'hoje' && faixaAtiva.rotulo === 'Hoje') ||
                              (p.key === '7dias' && faixaAtiva.rotulo === 'Últimos 7 dias') ||
                              (p.key === '30dias' && faixaAtiva.rotulo === 'Últimos 30 dias') ||
                              (p.key === 'tudo' && faixaAtiva.rotulo === 'Total histórico')
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => aplicarPreset(p.key as any)}
                    className={`block w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      ativo
                        ? 'bg-[var(--color-verde)]/15 text-[var(--color-verde)] font-bold'
                        : 'hover:bg-[var(--color-carta)] hover:text-[var(--color-tinta)]'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Painel Direito: Calendários Duplos */}
          <div className="flex flex-1 flex-col p-4">
            {/* Cabeçalho de Navegação dos Calendários */}
            <div className="mb-4 flex items-center justify-between border-b border-[var(--color-linha)] pb-3">
              <button
                type="button"
                onClick={() => setMesVisivel(new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() - 1, 1))}
                className="flex size-7 items-center justify-center rounded-lg text-[var(--color-tinta-2)] hover:bg-[var(--color-fundo)] hover:text-[var(--color-tinta)]"
              >
                ‹
              </button>
              <div className="flex gap-16 font-mono text-[13px] font-bold text-[var(--color-tinta)]">
                <span>{NOMES_MESES[mes1.getMonth()]} {mes1.getFullYear()}</span>
                <span className="hidden sm:inline">{NOMES_MESES[mes2.getMonth()]} {mes2.getFullYear()}</span>
              </div>
              <button
                type="button"
                onClick={() => setMesVisivel(new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 1))}
                className="flex size-7 items-center justify-center rounded-lg text-[var(--color-tinta-2)] hover:bg-[var(--color-fundo)] hover:text-[var(--color-tinta)]"
              >
                ›
              </button>
            </div>

            {/* Grids dos Meses Side-by-Side */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Mês 1 */}
              <div>
                <div className="mb-2 grid grid-cols-7 text-center font-mono text-[11px] font-semibold text-[var(--color-tinta-2)] opacity-80">
                  {DIAS_SEMANA.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center font-mono text-[12px]">
                  {gridMes1.map((cel, idx) => {
                    const eInicio = mesmoDia(cel.data, rascunhoInicio)
                    const eFim = mesmoDia(cel.data, rascunhoFim)
                    const noIntervalo = entreDias(cel.data, rascunhoInicio, rascunhoFim)

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => aoClicarDia(cel.data)}
                        className={`flex h-8 w-full items-center justify-center font-semibold transition-all ${
                          !cel.pertenceAoMes ? 'opacity-30 text-[var(--color-tinta-2)]' : 'text-[var(--color-tinta)] hover:bg-[var(--color-fundo)]'
                        } ${
                          eInicio || eFim
                            ? '!bg-[var(--color-verde)] !text-white rounded-lg shadow-md font-bold'
                            : noIntervalo
                            ? '!bg-[var(--color-verde)]/20 !text-[var(--color-verde)]'
                            : 'rounded-lg'
                        }`}
                      >
                        {cel.data.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Mês 2 */}
              <div className="hidden sm:block">
                <div className="mb-2 grid grid-cols-7 text-center font-mono text-[11px] font-semibold text-[var(--color-tinta-2)] opacity-80">
                  {DIAS_SEMANA.map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center font-mono text-[12px]">
                  {gridMes2.map((cel, idx) => {
                    const eInicio = mesmoDia(cel.data, rascunhoInicio)
                    const eFim = mesmoDia(cel.data, rascunhoFim)
                    const noIntervalo = entreDias(cel.data, rascunhoInicio, rascunhoFim)

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => aoClicarDia(cel.data)}
                        className={`flex h-8 w-full items-center justify-center font-semibold transition-all ${
                          !cel.pertenceAoMes ? 'opacity-30 text-[var(--color-tinta-2)]' : 'text-[var(--color-tinta)] hover:bg-[var(--color-fundo)]'
                        } ${
                          eInicio || eFim
                            ? '!bg-[var(--color-verde)] !text-white rounded-lg shadow-md font-bold'
                            : noIntervalo
                            ? '!bg-[var(--color-verde)]/20 !text-[var(--color-verde)]'
                            : 'rounded-lg'
                        }`}
                      >
                        {cel.data.getDate()}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Rodapé com Ações (Cancelar & Aplicar) */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--color-linha)] pt-3">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="px-4 py-2 text-[13px] font-medium text-[var(--color-tinta-2)] transition-colors hover:text-[var(--color-tinta)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={aoAplicar}
                className="rounded-xl bg-[var(--color-verde)] px-5 py-2 text-[13px] font-semibold text-white shadow-md transition-all hover:opacity-90 active:scale-95"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
