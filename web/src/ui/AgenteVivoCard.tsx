import type { AgenteVivo } from '../dados/tipos'
import {
  chaveAgente,
  normalizarDonoId,
  normalizarId,
  resolverAgenteNoCatalogo,
  type PixelAgent,
} from '../dados/pixel-agents'

const TEXTO_SEM_DADO = 'sem dado'

const CLASSE_DONO_PIXEL: Record<string, string> = {
  luana: 'bg-[#38bdf8] text-black',
  renato: 'bg-renato text-black',
  bia: 'bg-[#f472b6] text-black',
}

export const classeDonoPixel = (dono: string | undefined | null) => (
  dono ? CLASSE_DONO_PIXEL[normalizarDonoId(dono) ?? dono] ?? 'bg-slate-300 text-black' : 'bg-slate-300 text-black'
)

const DONO_LABEL: Record<string, string> = {
  luana: 'Luana',
  renato: 'Renato',
  bia: 'Bia',
}

function textoUtil(valor: string | null | undefined, agente: AgenteVivo) {
  const texto = valor?.trim()
  if (!texto) return null
  const cru = normalizarId(texto)
  const id = normalizarId(agente.id)
  const chave = normalizarId(chaveAgente(agente.dono, agente.id))
  if (cru === id || cru === chave) return null
  return texto
}

function formatarDono(dono: string | null | undefined) {
  const normalizado = normalizarDonoId(dono)
  if (normalizado) return DONO_LABEL[normalizado]
  const texto = dono?.trim()
  if (!texto) return TEXTO_SEM_DADO
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function formatarSegundos(total: number) {
  if (total < 60) return `${total}s`
  const minutos = Math.floor(total / 60)
  if (minutos < 60) return `${minutos}min`
  const horas = Math.floor(minutos / 60)
  const restoMinutos = minutos % 60
  return restoMinutos > 0 ? `${horas}h ${restoMinutos}min` : `${horas}h`
}

function nomeAgente(agente: AgenteVivo, ficha?: PixelAgent) {
  const identidade = agente.identidade === 'sessao-codex' || agente.identidade === 'sessao-claude' ? null : agente.identidade
  const candidatos = [
    ficha?.nome,
    textoUtil(identidade, agente),
    textoUtil(agente.tipo, agente),
    textoUtil(agente.papel, agente),
    textoUtil(agente.motor, agente),
  ]
  return candidatos.find((valor): valor is string => Boolean(valor)) ?? TEXTO_SEM_DADO
}

function textoDaTarefa(agente: AgenteVivo) {
  return (
    textoUtil(agente.tarefa, agente) ??
    textoUtil(agente.descricao, agente) ??
    textoUtil(agente.etapa, agente) ??
    TEXTO_SEM_DADO
  )
}

function textoRodandoHa(agente: AgenteVivo) {
  if (agente.rodando_ha) return agente.rodando_ha
  if (agente.rodando_ha_s !== null && agente.rodando_ha_s !== undefined) {
    return formatarSegundos(agente.rodando_ha_s)
  }
  return TEXTO_SEM_DADO
}

function textoTokens(agente: AgenteVivo) {
  if (agente.tokens_formatado) return agente.tokens_formatado
  if (agente.tokens_total !== null && agente.tokens_total !== undefined) return agente.tokens_total.toLocaleString('pt-BR')
  return TEXTO_SEM_DADO
}

function textoUltimaAtividade(agente: AgenteVivo) {
  if (agente.silencio_s !== null && agente.silencio_s !== undefined) {
    return agente.silencio_s === 0 ? 'agora' : `${agente.silencio_s}s atrás`
  }
  return agente.ultima_atividade || TEXTO_SEM_DADO
}

export type ResumoAgenteVivo = {
  chave: string
  focoId: string
  idCru: string
  nome: string
  donoId: string | null
  dono: string
  tarefa: string
  ferramenta: string
  rodandoHa: string
  modelo: string
  tokens: string
  ultimaAtividade: string
  estado: AgenteVivo['estado']
}

export function montarResumoAgenteVivo(agente: AgenteVivo, catalogo?: PixelAgent[]): ResumoAgenteVivo {
  const ficha = catalogo ? resolverAgenteNoCatalogo(agente, catalogo) : undefined
  const donoId = normalizarDonoId(agente.dono)
  const chave = chaveAgente(agente.dono, agente.id)

  return {
    chave,
    focoId: ficha?.id ?? chave,
    idCru: agente.id,
    nome: nomeAgente(agente, ficha),
    donoId: donoId ?? agente.dono ?? null,
    dono: formatarDono(agente.dono),
    tarefa: textoDaTarefa(agente),
    ferramenta: textoUtil(agente.ferramenta, agente) ?? TEXTO_SEM_DADO,
    rodandoHa: textoRodandoHa(agente),
    modelo: textoUtil(agente.modelo_legivel, agente) ?? textoUtil(agente.modelo, agente) ?? TEXTO_SEM_DADO,
    tokens: textoTokens(agente),
    ultimaAtividade: textoUltimaAtividade(agente),
    estado: agente.estado,
  }
}

export function AgenteVivoCard({
  agente,
  catalogo,
  selecionado = false,
  onClick,
  modo = 'terminal',
  className = '',
}: {
  agente: AgenteVivo
  catalogo?: PixelAgent[]
  selecionado?: boolean
  onClick?: () => void
  modo?: 'terminal' | 'faixa'
  className?: string
}) {
  const resumo = montarResumoAgenteVivo(agente, catalogo)
  const tarefaLinhas = modo === 'faixa' ? 'line-clamp-1' : 'line-clamp-3'
  const padding = modo === 'faixa' ? 'p-3' : 'p-3.5'
  const detalhes = [
    ['Ferramenta', resumo.ferramenta],
    ['Rodando há', resumo.rodandoHa],
    ['Modelo', resumo.modelo],
    ['Tokens', resumo.tokens],
  ]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-col justify-between border-2 border-black bg-[#0f172a] ${padding} text-left font-mono text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-transform hover:-translate-y-0.5 ${
        onClick ? 'cursor-pointer' : 'cursor-default'
      } ${selecionado ? 'ring-2 ring-[#a3e635] bg-[#1e293b]' : ''} ${className}`}
      aria-pressed={selecionado}
    >
      <span className="min-w-0">
        <span className="flex items-start justify-between gap-2 border-b border-slate-700 pb-2">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={`shrink-0 border border-black px-1.5 py-0.5 text-[8.5px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${classeDonoPixel(resumo.donoId)}`}
                title={`Dono: ${resumo.dono}`}
              >
                {resumo.dono}
              </span>
              <span className="truncate text-xs font-black text-[#38bdf8]" title={resumo.nome}>
                {resumo.nome}
              </span>
            </span>
            <span className="truncate text-[9px] font-semibold text-slate-500" title={resumo.idCru}>
              id {resumo.idCru}
            </span>
          </span>
          <span
            className={`shrink-0 border border-black px-1.5 py-0.5 text-[9px] font-black uppercase shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
              resumo.estado === 'trabalhando'
                ? 'bg-[#a3e635] text-black'
                : resumo.estado === 'silencioso'
                  ? 'bg-[#facc15] text-black'
                  : 'bg-slate-500 text-white'
            }`}
          >
            {resumo.estado === 'trabalhando' ? 'EXEC' : resumo.estado === 'silencioso' ? 'OCIOSO' : 'FORA'}
          </span>
        </span>

        <span
          className={`mt-2.5 block min-w-0 border-l-2 border-[#38bdf8] pl-2 text-xs leading-relaxed text-slate-200 ${tarefaLinhas} break-words [overflow-wrap:anywhere]`}
          title={resumo.tarefa}
        >
          {resumo.tarefa}
        </span>

        <span className="mt-2 grid grid-cols-2 gap-1.5">
          {detalhes.map(([rotulo, valor]) => (
            <span key={rotulo} className="min-w-0 border border-slate-700 bg-slate-800/80 px-1.5 py-1">
              <span className="block truncate text-[8.5px] font-black uppercase text-slate-400">{rotulo}</span>
              <span className="mt-0.5 block truncate text-[10px] font-bold text-slate-100" title={valor}>
                {valor}
              </span>
            </span>
          ))}
        </span>
      </span>

      <span className="mt-2 flex items-center justify-between border-t border-slate-700/80 pt-2 text-[10px] text-slate-400">
        <span className="truncate font-semibold">Última atividade</span>
        <span className="shrink-0 font-mono tabular-nums text-[#a3e635]">{resumo.ultimaAtividade}</span>
      </span>
    </button>
  )
}
