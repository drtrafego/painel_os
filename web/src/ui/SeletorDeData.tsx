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

  // Intervalo ativo de data (Padrão: Setembro 2026 - conforme o print do usuário)
  const [faixaAtiva, setFaixaAtiva] = useState<FaixaDeData>(() => {
    if (faixa) return faixa
    const inicio = new Date(2026, 8, 1)  // 01/09/2026
    const fim = new Date(2026, 8, 30)   // 30/09/2026
    return { inicio, fim, rotulo: 'Este mês' }
  })

  // Rascunho temporário de seleção para o modal
  const [rascunhoInicio, setRascunhoInicio] = useState<Date>(faixaAtiva.inicio)
  const [rascunhoFim, setRascunhoFim] = useState<Date>(faixaAtiva.fim)
  const [etapaSelecao, setEtapaSelecao] = useState<'inicio' | 'fim'>('inicio')

  // Meses exibidos no calendário duplo
  const [mesVisivel, setMesVisivel] = useState(() => new Date(faixaAtiva.inicio.getFullYear(), faixaAtiva.inicio.getMonth(), 1))

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (faixa) {
      setFaixaAtiva(faixa)
      setRascunhoInicio(faixa.inicio)
      setRascunhoFim(faixa.fim)
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
    const novoInicio = new Date(faixaAtiva.inicio.getFullYear(), faixaAtiva.inicio.getMonth() - 1, 1)
    const novoFim = new Date(novoInicio.getFullYear(), novoInicio.getMonth() + 1, 0)
    const nova = { inicio: novoInicio, fim: novoFim, rotulo: `${NOMES_MESES[novoInicio.getMonth()]} ${novoInicio.getFullYear()}` }
    setFaixaAtiva(nova)
    setRascunhoInicio(novoInicio)
    setRascunhoFim(novoFim)
    setMesVisivel(novoInicio)
    aoMudarFaixa?.(nova)
  }

  const navegarProximoMes = () => {
    const novoInicio = new Date(faixaAtiva.inicio.getFullYear(), faixaAtiva.inicio.getMonth() + 1, 1)
    const novoFim = new Date(novoInicio.getFullYear(), novoInicio.getMonth() + 1, 0)
    const nova = { inicio: novoInicio, fim: novoFim, rotulo: `${NOMES_MESES[novoInicio.getMonth()]} ${novoInicio.getFullYear()}` }
    setFaixaAtiva(nova)
    setRascunhoInicio(novoInicio)
    setRascunhoFim(novoFim)
    setMesVisivel(novoInicio)
    aoMudarFaixa?.(nova)
  }

  // Presets da coluna esquerda (Hoje, Últimos 7 dias, etc.)
  const aplicarPreset = (tipo: 'hoje' | '7dias' | '30dias' | '60dias' | 'esteMes' | 'tudo') => {
    const hoje = new Date(2026, 8, 30) // Âncorado no tempo da aplicação (Set/2026)
    let ini = new Date(hoje)
    let fim = new Date(hoje)

    switch (tipo) {
      case 'hoje':
        break
      case '7dias':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)
        break
      case '30dias':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29)
        break
      case '60dias':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 59)
        break
      case 'esteMes':
        ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
        fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
        break
      case 'tudo':
        ini = new Date(2026, 0, 1)
        break
    }

    setRascunhoInicio(ini)
    setRascunhoFim(fim)
    setMesVisivel(new Date(ini.getFullYear(), ini.getMonth(), 1))
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
    const nova = { inicio: min, fim: max }
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

  const nomeMesAnoAtivo = `${NOMES_MESES[faixaAtiva.inicio.getMonth()]} ${faixaAtiva.inicio.getFullYear()}`
  const textoFaixaFormatada = `${formatarDataBr(faixaAtiva.inicio)} — ${formatarDataBr(faixaAtiva.fim)}`

  return (
    <div ref={containerRef} className="relative inline-flex items-center text-[var(--color-tinta)] font-sans">
      {/* BARRA DE NAVEGAÇÃO E SELETOR DE DATAS DA CABEÇA (Conforme Imagem 1) */}
      <div className="flex items-center gap-2">
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
          <span className="px-2.5 font-mono text-[12px] font-semibold text-[var(--color-tinta)]">
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
          className="flex items-center gap-2.5 rounded-xl border border-[var(--color-linha)] bg-[var(--color-carta)] px-3.5 py-1.5 font-mono text-[12px] font-medium text-[var(--color-tinta)] shadow-sm transition-all hover:border-[var(--color-linha-forte)] hover:bg-[var(--color-fundo)] active:scale-95"
        >
          <span className="opacity-80">📅</span>
          <span>{textoFaixaFormatada}</span>
        </button>
      </div>

      {/* POPOVER MODAL COMPLETO (Conforme Imagem 2) */}
      {aberto && (
        <div className="absolute right-0 top-full z-50 mt-2 flex w-[680px] max-w-[95vw] overflow-hidden rounded-2xl border border-[var(--color-linha)] bg-[var(--color-carta)] text-[var(--color-tinta)] shadow-2xl backdrop-blur-xl">
          {/* Coluna Esquerda: Presets */}
          <div className="w-44 shrink-0 border-r border-[var(--color-linha)] bg-[var(--color-fundo)] p-3 text-[13px] font-medium text-[var(--color-tinta-2)]">
            <div className="space-y-1">
              {[
                { key: 'hoje', label: 'Hoje' },
                { key: '7dias', label: 'Últimos 7 dias' },
                { key: '30dias', label: 'Últimos 30 dias' },
                { key: '60dias', label: 'Últimos 60 dias' },
                { key: 'esteMes', label: 'Este mês' },
                { key: 'tudo', label: 'Tudo' },
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => aplicarPreset(p.key as any)}
                  className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--color-carta)] hover:text-[var(--color-tinta)] active:scale-98"
                >
                  {p.label}
                </button>
              ))}
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

