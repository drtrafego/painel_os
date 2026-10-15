/** Integração visual em iframe. O Painel OS continua sendo a única origem de dados. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExecucaoVisual } from '../PixelOffice'
import './EscritorioHabblaud.css'

interface Props {
  execucoes: readonly ExecucaoVisual[]
  statusSonda: string
  selecionadoId?: string | null
  aoSelecionarAgente?: (id: string) => void
}

type AgenteDaCena = {
  id: string; name: string; squadId: string; squadName: string
  role: string; task: string | null; tool: string | null; model: string | null
  owner: string | null; parent: string | null; engine: string | null
  status: 'trabalhando' | 'silencioso' | 'parado'; active: boolean
  human: boolean; startedAt: number | null; lastActivityAt: number | null; tokenCount: number | null
}

function toTime(value?: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
function mapAgent(v: ExecucaoVisual): AgenteDaCena {
  const a = v.execucao
  return {
    id: v.chave, name: v.nome, squadId: v.squad, squadName: v.squadNome,
    role: a.papel || v.ficha?.nome || 'Agente de IA', task: a.tarefa ?? null,
    tool: a.ferramenta ?? null, model: a.modelo_legivel || a.modelo || null,
    owner: a.dono ?? null, parent: a.quem_mandou || a.pai || null,
    engine: a.motor ?? null, status: a.estado, active: v.ativa,
    human: v.tipoVisual === 'humano', startedAt: a.inicio_epoch ?? toTime(a.inicio),
    lastActivityAt: toTime(a.ultima_atividade), tokenCount: a.tokens_total ?? null,
  }
}

export function EscritorioHabblaud({ execucoes, statusSonda, selecionadoId, aoSelecionarAgente }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const send = useCallback((payload: object) => {
    iframeRef.current?.contentWindow?.postMessage(payload, window.location.origin)
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return
      if (event.data?.type === 'CT_HABBLAUD_READY') { setPronto(true); setErro(null) }
      if (event.data?.type === 'CT_HABBLAUD_AGENT_SELECTED' && typeof event.data.id === 'string') {
        aoSelecionarAgente?.(event.data.id)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [aoSelecionarAgente])

  useEffect(() => {
    if (pronto) return
    const timeout = window.setTimeout(() => setErro('Não foi possível iniciar o escritório vivo. A versão V8 continua disponível na aba Escritório IA.'), 12000)
    return () => window.clearTimeout(timeout)
  }, [pronto])

  useEffect(() => {
    if (!pronto) return
    send({ type: 'CT_PANEL_SNAPSHOT_V1', agents: execucoes.map(mapAgent), sondaStatus: statusSonda })
  }, [execucoes, pronto, send, statusSonda])
  useEffect(() => {
    if (pronto) send({ type: 'CT_PANEL_SELECT_V1', id: selecionadoId ?? null })
  }, [pronto, selecionadoId, send])

  return (
    <div className="ct-habblaud" data-testid="office-habblaud-view">
      {!pronto && !erro && <span className="ct-habblaud-status" role="status">Carregando escritório interativo…</span>}
      {erro && <div className="ct-habblaud-status ct-habblaud-error" role="alert">{erro}</div>}
      <iframe
        ref={iframeRef}
        title="Escritório virtual por squads · Habblaud adaptado ao Painel OS"
        src="/oficina-habblaud/index.html?ct-painel=1"
        onLoad={() => { /* handshake do filho, nunca presumir que abriu com sucesso */ }}
        onError={() => setErro('O build visual não foi encontrado. Mantenha a visualização V8 até concluir a instalação.')}
        loading="eager"
      />
      <div className="ct-habblaud-footer">
        <span>Visual experimental · {execucoes.filter((e) => e.ativa).length} agentes executando</span>
        <span>Dados reais do Painel OS · movimento ilustrativo</span>
      </div>
    </div>
  )
}
