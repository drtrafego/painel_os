/**
 * Hook central de carregamento, validação e polling do estado operacional do Painel OS.
 */

import { useEffect, useState } from 'react'
import type { Estado } from './tipos'
import { validarEstado } from './validar'
import estadoEstatico from './estado.json'

export type Origem =
  | 'buscando'
  | 'calculado-agora'
  | 'coleta-em-andamento'
  | 'coletor-falhou'
  | 'arquivo'
  | 'estado-invalido'

export type EstadoHook = {
  estado: Estado | null
  origem: Origem
  erro: string | null
  problemas: string[] | null
  medidoEm: string | null
}

export function useEstado(): EstadoHook {
  // Inicializa validando o estado estático do build
  const validacaoInicial = validarEstado(estadoEstatico)
  const [estado, setEstado] = useState<Estado | null>(
    validacaoInicial.ok ? validacaoInicial.estado : null
  )
  const [origem, setOrigem] = useState<Origem>(
    validacaoInicial.ok ? 'arquivo' : 'estado-invalido'
  )
  const [erro, setErro] = useState<string | null>(null)
  const [problemas, setProblemas] = useState<string[] | null>(
    validacaoInicial.ok ? null : validacaoInicial.problemas
  )
  const [medidoEm, setMedidoEm] = useState<string | null>(
    validacaoInicial.ok ? validacaoInicial.estado.gerado_em : null
  )

  useEffect(() => {
    let cancelado = false
    let timer: number | null = null
    let tentativasColeta = 0
    const MAX_TENTATIVAS = 16

    async function buscarEstado() {
      try {
        const resposta = await fetch('/api/estado', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        })

        if (cancelado) return

        if (!resposta.ok) {
          throw new Error(`HTTP ${resposta.status}: ${resposta.statusText}`)
        }

        const json = await resposta.json()
        if (cancelado) return

        const validacao = validarEstado(json)
        if (!validacao.ok) {
          setOrigem('estado-invalido')
          setProblemas(validacao.problemas)
          return
        }

        const novoEstado = validacao.estado
        setEstado(novoEstado)
        setProblemas(null)
        setErro(null)
        setMedidoEm(novoEstado.gerado_em)

        // Se o servidor indicou que uma coleta ainda está rodando em segundo plano
        if (json.coleta_em_andamento === true) {
          setOrigem('coleta-em-andamento')
          if (tentativasColeta < MAX_TENTATIVAS) {
            tentativasColeta++
            timer = window.setTimeout(buscarEstado, 2500)
          }
        } else {
          setOrigem('calculado-agora')
        }
      } catch (err) {
        if (cancelado) return
        // Se a API não respondeu (ex: modo estático local sem servidor Python ligado),
        // preserva o estado do arquivo estático
        if (!estado) {
          setErro(err instanceof Error ? err.message : String(err))
        }
      }
    }

    buscarEstado()

    return () => {
      cancelado = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  return { estado, origem, erro, problemas, medidoEm }
}
