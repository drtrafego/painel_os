/**
 * Escritório vivo com o gráfico do V8: mesma dinâmica do Habblaud (sala monta
 * quando o squad trabalha, boneco entra pela recepção, caminha até a mesa,
 * levanta e sai, a luz apaga e a sala desmonta), desenhada pelo OfficeV7.
 * Estado de animação isolado da aba "Escritório IA".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { desenharEscritorioV7, type OfficeV7Hit } from '../office-v7/OfficeV7'
import { calcularLayoutSala, type ExecucaoVisual, type MesaVisual } from '../PixelOffice'
import { PIXEL_AGENT_SQUADS } from '../../dados/pixel-agents'
import {
  avancarEstadoAnimacao,
  calcularRotaEscritorio,
  criarEstadoInicialBoneco,
  pontoEntradaDoEscritorio,
  type EstadoAnimacaoBoneco,
  type FaseBoneco,
} from '../../dados/escritorio-animacao'
import {
  atualizarPresencaVivo,
  avancarSalasVivo,
  cenaDoVivo,
  liberarSaidasConcluidas,
  presencaVazia,
  RITMO_ANIMACAO_VIVO,
  squadsNaCena,
  type EstadoSalaVivo,
  type PresencaVivo,
} from './escritorio-vivo'
import './EscritorioVivoV8.css'

interface Props {
  execucoes: readonly ExecucaoVisual[]
  selecionadoId?: string | null
  aoSelecionarAgente?: (chave: string) => void
  aoAbrirModulo?: (modulo: string) => void
  pausado: boolean
  reduzirMovimento: boolean
  progressoDia: number
  /** `null` = enquadramento automático. */
  zoomManual: number | null
  aoZoomSugerido?: (zoom: number) => void
}

const SQUADS = PIXEL_AGENT_SQUADS.map((squad) => squad.id as string)

function alvoDaExecucao(execucao: ExecucaoVisual): 'trabalhando' | 'silencioso' | 'parado' {
  const estado = execucao.execucao.estado
  return estado === 'trabalhando' || estado === 'silencioso' ? estado : 'parado'
}

function poseDoEstado(estado: EstadoAnimacaoBoneco, corredorX: number) {
  const sentado = estado.fase === 'trabalhando' || estado.fase === 'silencioso' || estado.fase === 'descanso'
    ? 1 : estado.fase === 'sentando' ? estado.progressoFase : estado.fase === 'levantando' ? 1 - estado.progressoFase : 0
  const andando = estado.fase === 'caminhando_para_mesa' || estado.fase === 'caminhando_para_descanso'
  const direcao: 'esquerda' | 'direita' = estado.destinoX - estado.origemX < 0 ? 'esquerda' : 'direita'
  return { x: estado.x + corredorX, y: estado.y, sentado, andando, fase: estado.fase, direcao, progressoFase: estado.progressoFase }
}

export function EscritorioVivoV8({ execucoes, selecionadoId, aoSelecionarAgente, aoAbrirModulo, pausado, reduzirMovimento, progressoDia, zoomManual, aoZoomSugerido }: Props) {
  const palcoRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hitsRef = useRef<OfficeV7Hit[]>([])
  const hoverIdRef = useRef<string | null>(null)
  const animacoesRef = useRef(new Map<string, EstadoAnimacaoBoneco>())
  const fasesRef = useRef(new Map<string, FaseBoneco>())
  const salasRef = useRef(new Map<string, EstadoSalaVivo>())
  const tempoRef = useRef(0)
  const [dimensoes, setDimensoes] = useState({ largura: 900, altura: 600, dpr: 1 })
  const [presenca, setPresenca] = useState<PresencaVivo>(presencaVazia)

  useEffect(() => {
    setPresenca((anterior) => atualizarPresencaVivo(anterior, execucoes, tempoRef.current * 1000))
  }, [execucoes])

  const cena = useMemo(() => cenaDoVivo(presenca), [presenca])
  const saindo = useMemo(() => new Set(presenca.saindo.keys()), [presenca])
  // Sem o conjunto de saída: a sala só fica "ativa" (acesa) enquanto alguém
  // trabalha. Quem está saindo caminha com a luz já apagada, como no Habblaud.
  const layout = useMemo(
    () => calcularLayoutSala(cena, { larguraDisponivel: dimensoes.largura, alturaDisponivel: dimensoes.altura }),
    [cena, dimensoes.altura, dimensoes.largura],
  )
  const zoom = zoomManual ?? layout.zoomSugerido

  useEffect(() => { aoZoomSugerido?.(layout.zoomSugerido) }, [aoZoomSugerido, layout.zoomSugerido])

  useEffect(() => {
    const palco = palcoRef.current
    if (!palco) return
    let quadro = 0
    const ajustar = () => {
      const largura = Math.max(1, palco.clientWidth - 2)
      const altura = Math.max(1, palco.clientHeight - 2)
      const dpr = window.devicePixelRatio || 1
      setDimensoes((atual) => atual.largura === largura && atual.altura === altura && atual.dpr === dpr ? atual : { largura, altura, dpr })
    }
    const agendar = () => { window.cancelAnimationFrame(quadro); quadro = window.requestAnimationFrame(ajustar) }
    agendar()
    const observador = new ResizeObserver(agendar); observador.observe(palco)
    return () => { observador.disconnect(); window.cancelAnimationFrame(quadro) }
  }, [])

  useEffect(() => {
    const palco = palcoRef.current
    if (!palco || !window.matchMedia('(max-width: 700px)').matches) return
    let final = 0
    const inicial = window.requestAnimationFrame(() => {
      final = window.requestAnimationFrame(() => {
        palco.scrollLeft = Math.max(0, (palco.scrollWidth - palco.clientWidth) / 2)
        palco.scrollTop = 0
      })
    })
    return () => { window.cancelAnimationFrame(inicial); window.cancelAnimationFrame(final) }
  }, [layout.largura, layout.zoomSugerido])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let ativo = true
    let quadro = 0
    let anterior = performance.now()
    const entrada = pontoEntradaDoEscritorio(layout.arquitetura)
    const estadoDaMesa = (mesa: MesaVisual, agoraMs: number) => {
      const chave = mesa.execucao.animacaoChave
      const posMesa = { x: mesa.x - layout.corredorX, y: mesa.y + 24 }
      const posSaida = { x: entrada.x - layout.corredorX, y: entrada.y }
      const alvo = saindo.has(chave) ? 'parado' : alvoDaExecucao(mesa.execucao)
      const anteriorEstado = animacoesRef.current.get(chave)
      const origem = anteriorEstado ? { x: anteriorEstado.x + layout.corredorX, y: anteriorEstado.y } : entrada
      const destino = alvo === 'parado' ? entrada : { x: mesa.x, y: mesa.y + 24 }
      const rota = calcularRotaEscritorio(layout.arquitetura, origem, destino).map((p) => ({ x: p.x - layout.corredorX, y: p.y }))
      const ferramenta = mesa.execucao.execucao.ferramenta
      // Primeira aparição de quem trabalha: nasce na recepção e caminha até a mesa.
      const base = anteriorEstado ?? criarEstadoInicialBoneco(chave, alvo === 'trabalhando' ? 'parado' : alvo, posMesa, posSaida, agoraMs, ferramenta)
      const proximo = avancarEstadoAnimacao(base, alvo, posMesa, posSaida, agoraMs, reduzirMovimento, ferramenta, rota)
      animacoesRef.current.set(chave, proximo)
      fasesRef.current.set(chave, proximo.fase)
      return proximo
    }
    const desenhar = (agora: number) => {
      if (!ativo) return
      const delta = Math.min(60, agora - anterior); anterior = agora
      const rodando = !pausado && !document.hidden
      if (rodando) tempoRef.current += delta / 1000
      const agoraMs = tempoRef.current * 1000
      salasRef.current = avancarSalasVivo(salasRef.current, squadsNaCena(cena), SQUADS, rodando ? delta : 0, agoraMs, reduzirMovimento)
      const progressos = new Map(Array.from(salasRef.current, ([squad, sala]) => [squad, sala.progresso]))
      const dpr = Math.min(dimensoes.dpr, 2)
      const larguraCss = Math.round(layout.largura * zoom); const alturaCss = Math.round(layout.altura * zoom)
      if (canvas.width !== Math.round(larguraCss * dpr)) canvas.width = Math.round(larguraCss * dpr)
      if (canvas.height !== Math.round(alturaCss * dpr)) canvas.height = Math.round(alturaCss * dpr)
      if (canvas.style.width !== `${larguraCss}px`) canvas.style.width = `${larguraCss}px`
      if (canvas.style.height !== `${alturaCss}px`) canvas.style.height = `${alturaCss}px`
      ctx.setTransform(zoom * dpr, 0, 0, zoom * dpr, 0, 0); ctx.clearRect(0, 0, layout.largura, layout.altura)
      const tempoAnimacao = agoraMs * RITMO_ANIMACAO_VIVO
      const estados = layout.mesas.map((mesa) => ({ mesa, estado: estadoDaMesa(mesa, tempoAnimacao) }))
      try {
        hitsRef.current = desenharEscritorioV7(ctx, {
          layout,
          personagens: estados.map(({ mesa, estado }) => ({ mesa, pose: poseDoEstado(estado, layout.corredorX) })),
          progressoDia,
          tempo: tempoRef.current,
          reduzirMovimento,
          selecionadoId,
          hoverId: hoverIdRef.current,
          progressos,
          modoVivo: true,
        })
      } catch (erro) {
        console.warn('EscritorioVivoV8: erro no renderer.', erro)
      }
      canvas.dataset.officeAgents = String(estados.length)
      canvas.dataset.officeLeaving = String(saindo.size)
      canvas.dataset.officeZoom = String(Math.round(zoom * 100))
      const liberada = liberarSaidasConcluidas(presenca, (chave) => fasesRef.current.get(chave), agoraMs)
      if (liberada) {
        presenca.saindo.forEach((_, chave) => {
          if (liberada.saindo.has(chave)) return
          animacoesRef.current.delete(chave); fasesRef.current.delete(chave)
        })
        // O efeito reinicia o laço com a presença nova.
        setPresenca((atual) => atual === presenca ? liberada : atual)
        return
      }
      quadro = requestAnimationFrame(desenhar)
    }
    quadro = requestAnimationFrame(desenhar)
    return () => { ativo = false; cancelAnimationFrame(quadro) }
  }, [cena, dimensoes.dpr, layout, pausado, presenca, progressoDia, reduzirMovimento, saindo, selecionadoId, zoom])

  const acharHit = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = evento.currentTarget.getBoundingClientRect()
    const x = (evento.clientX - rect.left) / zoom; const y = (evento.clientY - rect.top) / zoom
    return [...hitsRef.current].reverse().find((item) => x >= item.x && x <= item.x + item.largura && y >= item.y && y <= item.y + item.altura)
  }
  const tratarClique = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = acharHit(evento)
    if (hit?.modulo) { aoAbrirModulo?.(hit.modulo); return }
    if (hit) aoSelecionarAgente?.(hit.chave)
  }
  const tratarMovimento = (evento: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = acharHit(evento)
    evento.currentTarget.style.cursor = hit ? 'pointer' : 'default'
    hoverIdRef.current = hit?.chave ?? null
  }
  const tratarTeclado = (evento: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', ' '].includes(evento.key) || !cena.length) return
    evento.preventDefault()
    let indice = Math.max(0, cena.findIndex((item) => item.chave === selecionadoId))
    if (evento.key.startsWith('Arrow')) indice = (indice + (evento.key === 'ArrowLeft' || evento.key === 'ArrowUp' ? -1 : 1) + cena.length) % cena.length
    aoSelecionarAgente?.(cena[indice].chave)
  }

  const trabalhando = presenca.presentes.size
  const salasAbertas = squadsNaCena(cena).size

  return (
    <div className="ct-vivo" data-testid="office-vivo-v8">
      <div ref={palcoRef} className="ct-room-scroll" data-testid="office-vivo-scroll">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          role="group"
          data-testid="office-vivo-canvas"
          aria-label={`Escritório vivo com ${trabalhando} agentes trabalhando em ${salasAbertas} salas. Use as setas para escolher ou toque um boneco.`}
          onClick={tratarClique}
          onMouseMove={tratarMovimento}
          onMouseLeave={(evento) => { evento.currentTarget.style.cursor = 'default'; hoverIdRef.current = null }}
          onKeyDown={tratarTeclado}
        />
      </div>
      {cena.length === 0 && (
        <div className="ct-vivo-vazio" role="status" data-testid="office-vivo-empty">
          <strong>Ninguém trabalhando agora.</strong>
          <span>As salas são montadas quando um squad começa uma execução.</span>
        </div>
      )}
      <div className="ct-vivo-footer">
        <span data-testid="office-vivo-count">{trabalhando} trabalhando · {salasAbertas} {salasAbertas === 1 ? 'sala aberta' : 'salas abertas'}{saindo.size ? ` · ${saindo.size} saindo` : ''}</span>
        <span>Dados reais do Painel OS · movimento ilustrativo</span>
      </div>
    </div>
  )
}
