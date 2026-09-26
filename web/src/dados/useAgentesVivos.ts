/**
 * Hook para monitoramento contínuo e compartilhado da presença dos agentes ao vivo.
 *
 * Consulta /api/agentes-vivos em polling periódico a cada 10 segundos compartilhando
 * uma única requisição em voo entre todos os componentes montados na tela.
 */

import { useSyncExternalStore } from 'react'
import type { AgenteVivo, AgentesVivos } from './tipos'

export type EstadoSonda = 'consultando' | 'confirmado' | 'leitura_vencida' | 'indisponivel'

export type HookAgentesVivos = {
  dados: AgentesVivos | null
  carregando: boolean
  erro: string | null
  falhouHaSegundos: number | null
  recebidoEm: Date | null
  statusLeitura: EstadoSonda
}

export type ResumoAgenteVivo = {
  chave: string
  id: string
  nome: string
  dono: string | null
  donoFormatado: string | null
  papel: string
  tarefa: string
  ferramenta: string | null
  tempoFormatado: string
  modelo: string
  statusTexto: string
  estado: 'trabalhando' | 'silencioso' | 'parado'
  silencioSegundos: number | null
  tokensTotal: number | null
  tokensFormatado: string | null
  esforco: string | null
  quemMandou: string | null
  problema: string | null
}

export function montarResumoAgenteVivo(agente?: AgenteVivo | null): ResumoAgenteVivo | null {
  if (!agente) return null
  const chave = agente.dono ? `${agente.dono}:${agente.id}` : agente.id
  const donoFormatado = agente.dono
    ? agente.dono.charAt(0).toUpperCase() + agente.dono.slice(1)
    : null

  const papel = agente.papel || agente.tipo || agente.identidade || agente.id
  const nome = (agente.nome || papel || agente.id).replace(/\s+/g, ' ').trim()
  const tarefa = agente.tarefa || agente.descricao || agente.etapa || 'Sem descrição da tarefa atual'
  const ferramenta = agente.ferramenta || null
  const tempoFormatado = agente.rodando_ha || (agente.inicio ? `desde ${agente.inicio}` : '—')
  const modelo = agente.modelo_legivel || agente.modelo || '—'

  const estado = agente.estado === 'trabalhando' ? 'trabalhando' : agente.estado === 'silencioso' ? 'silencioso' : 'parado'
  const statusTexto =
    agente.status ||
    (agente.problema
      ? `erro (${agente.problema})`
      : estado === 'trabalhando'
      ? 'executando'
      : estado === 'silencioso'
      ? 'ocioso'
      : 'encerrado')

  return {
    chave,
    id: agente.id,
    nome,
    dono: agente.dono || null,
    donoFormatado,
    papel,
    tarefa,
    ferramenta,
    tempoFormatado,
    modelo,
    statusTexto,
    estado,
    silencioSegundos: agente.silencio_s ?? null,
    tokensTotal: agente.tokens_total ?? null,
    tokensFormatado: agente.tokens_formatado || (agente.tokens_total ? `${agente.tokens_total.toLocaleString('pt-BR')}` : null),
    esforco: agente.esforco || null,
    quemMandou: agente.quem_mandou || agente.pai || null,
    problema: agente.problema || null,
  }
}

// Singleton state
let estadoCompartilhado: HookAgentesVivos = {
  dados: null,
  carregando: true,
  erro: null,
  falhouHaSegundos: null,
  recebidoEm: null,
  statusLeitura: 'consultando',
}

const ouvintes = new Set<() => void>()
let timerPolling: number | null = null
let timerStaleCheck: number | null = null
let controllerEmVoo: AbortController | null = null
let requisicaoEmVoo = false
let ultimoSucessoTimestamp: number | null = null
let sequenciaBusca = 0

function notificar() {
  ouvintes.forEach((cb) => cb())
}

function verificarStale() {
  if (ultimoSucessoTimestamp === null) {
    if (!estadoCompartilhado.carregando && estadoCompartilhado.statusLeitura !== 'indisponivel') {
      estadoCompartilhado = {
        ...estadoCompartilhado,
        statusLeitura: 'indisponivel',
      }
      notificar()
    }
    return
  }

  const decorrido = Date.now() - ultimoSucessoTimestamp
  if (decorrido > 25000 && estadoCompartilhado.statusLeitura === 'confirmado') {
    estadoCompartilhado = {
      ...estadoCompartilhado,
      statusLeitura: 'leitura_vencida',
      falhouHaSegundos: Math.round(decorrido / 1000),
    }
    notificar()
  } else if (estadoCompartilhado.erro) {
    estadoCompartilhado = {
      ...estadoCompartilhado,
      falhouHaSegundos: Math.max(1, Math.round(decorrido / 1000)),
    }
    notificar()
  }
}

async function buscarSonda() {
  if (requisicaoEmVoo) return
  requisicaoEmVoo = true
  const idTentativa = ++sequenciaBusca

  if (controllerEmVoo) {
    controllerEmVoo.abort()
  }
  const controller = new AbortController()
  controllerEmVoo = controller

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, 8000)

  try {
    const r = await fetch('/api/agentes-vivos', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (idTentativa !== sequenciaBusca) return

    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`)
    }

    const json = await r.json()
    if (idTentativa !== sequenciaBusca) return

    if (json.ok === false) {
      const motivo = json.erro || json.motivo || 'Sonda retornou falha'
      const decorrido = ultimoSucessoTimestamp ? Math.round((Date.now() - ultimoSucessoTimestamp) / 1000) : 0
      estadoCompartilhado = {
        dados: json,
        carregando: false,
        erro: motivo,
        falhouHaSegundos: decorrido,
        recebidoEm: estadoCompartilhado.recebidoEm,
        statusLeitura: 'indisponivel',
      }
      notificar()
      return
    }

    ultimoSucessoTimestamp = Date.now()
    estadoCompartilhado = {
      dados: json,
      carregando: false,
      erro: null,
      falhouHaSegundos: null,
      recebidoEm: new Date(),
      statusLeitura: 'confirmado',
    }
    notificar()
  } catch (e: unknown) {
    clearTimeout(timeoutId)
    if (idTentativa !== sequenciaBusca) return
    const isAbort = e instanceof DOMException && e.name === 'AbortError'
    const msg = isAbort ? 'Tempo limite da sonda esgotado (8s)' : e instanceof Error ? e.message : String(e)
    const decorrido = ultimoSucessoTimestamp ? Math.round((Date.now() - ultimoSucessoTimestamp) / 1000) : 0

    estadoCompartilhado = {
      ...estadoCompartilhado,
      carregando: false,
      erro: msg,
      falhouHaSegundos: decorrido,
      statusLeitura: estadoCompartilhado.dados ? 'leitura_vencida' : 'indisponivel',
    }
    notificar()
  } finally {
    requisicaoEmVoo = false
    controllerEmVoo = null
  }
}

function iniciarServico() {
  if (timerPolling === null && typeof window !== 'undefined') {
    buscarSonda()
    timerPolling = window.setInterval(buscarSonda, 10000)
    timerStaleCheck = window.setInterval(verificarStale, 1000)
  }
}

function pararServico() {
  if (ouvintes.size === 0 && typeof window !== 'undefined') {
    if (timerPolling !== null) {
      window.clearInterval(timerPolling)
      timerPolling = null
    }
    if (timerStaleCheck !== null) {
      window.clearInterval(timerStaleCheck)
      timerStaleCheck = null
    }
    if (controllerEmVoo) {
      controllerEmVoo.abort()
      controllerEmVoo = null
    }
  }
}

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar)
  if (ouvintes.size === 1) {
    iniciarServico()
  }
  return () => {
    ouvintes.delete(aoMudar)
    if (ouvintes.size === 0) {
      pararServico()
    }
  }
}

function lerEstado(): HookAgentesVivos {
  return estadoCompartilhado
}

function lerEstadoServidor(): HookAgentesVivos {
  return {
    dados: null,
    carregando: true,
    erro: null,
    falhouHaSegundos: null,
    recebidoEm: null,
    statusLeitura: 'consultando',
  }
}

export function useAgentesVivos(_intervaloMs = 10000): HookAgentesVivos {
  return useSyncExternalStore(assinar, lerEstado, lerEstadoServidor)
}
