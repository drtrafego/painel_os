/**
 * Hook para monitoramento contínuo da presença dos agentes ao vivo.
 *
 * Consulta /api/agentes-vivos em polling periódico a cada 10 segundos.
 */

import { useEffect, useRef, useState } from 'react'
import type { AgentesVivos } from './tipos'

export type HookAgentesVivos = {
  dados: AgentesVivos | null
  carregando: boolean
  erro: string | null
  falhouHaSegundos: number | null
}

export function useAgentesVivos(intervaloMs = 10000): HookAgentesVivos {
  const [dados, setDados] = useState<AgentesVivos | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [falhouHaSegundos, setFalhouHaSegundos] = useState<number | null>(null)
  const ultimoSucessoRef = useRef<number | null>(null)

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

        if (json.ok === false) {
          const motivo = json.erro || json.motivo || 'Sonda retornou falha'
          setErro(motivo)
          if (ultimoSucessoRef.current !== null) {
            setFalhouHaSegundos(Math.max(1, Math.round((Date.now() - ultimoSucessoRef.current) / 1000)))
          } else {
            setFalhouHaSegundos(0)
          }
          setDados(json)
          return
        }

        ultimoSucessoRef.current = Date.now()
        setDados(json)
        setErro(null)
        setFalhouHaSegundos(null)
      } catch (e) {
        if (cancelado) return
        const msg = e instanceof Error ? e.message : String(e)
        setErro(msg)
        if (ultimoSucessoRef.current !== null) {
          setFalhouHaSegundos(Math.max(1, Math.round((Date.now() - ultimoSucessoRef.current) / 1000)))
        } else {
          setFalhouHaSegundos(0)
        }
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

  return { dados, carregando, erro, falhouHaSegundos }
}

