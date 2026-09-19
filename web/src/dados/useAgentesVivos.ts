/**
 * Hook para monitoramento contínuo da presença dos agentes ao vivo.
 *
 * Consulta /api/agentes-vivos em polling periódico a cada 10 segundos.
 */

import { useEffect, useState } from 'react'
import type { AgentesVivos } from './tipos'

export type HookAgentesVivos = {
  dados: AgentesVivos | null
  carregando: boolean
  erro: string | null
}

export function useAgentesVivos(intervaloMs = 10000): HookAgentesVivos {
  const [dados, setDados] = useState<AgentesVivos | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    async function buscar() {
      try {
        const r = await fetch('/api/agentes-vivos', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })
        if (cancelado) return

        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`)
        }

        const json: AgentesVivos = await r.json()
        if (cancelado) return

        setDados(json)
        setErro(null)
      } catch (e) {
        if (cancelado) return
        setErro(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }

    buscar()
    const timer = setInterval(buscar, intervaloMs)

    return () => {
      cancelado = true
      clearInterval(timer)
    }
  }, [intervaloMs])

  return { dados, carregando, erro }
}
