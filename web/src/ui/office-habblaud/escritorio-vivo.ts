/**
 * Dinâmica do "Escritório vivo" (herdada do Habblaud) desenhada pelo renderer V8.
 *
 * Contrato do Habblaud mantido: a cena mostra só quem está `trabalhando`.
 * Quem deixa de trabalhar (vira parado/silencioso OU some da sonda) continua
 * na cena como saída, levanta, caminha até a recepção e só então sai. A sala
 * do squad é montada quando alguém do squad está na cena e desmontada depois
 * que o último sai e a luz apaga. Nada aqui cria agente ou atividade.
 */
import type { FaseBoneco } from '../../dados/escritorio-animacao'
import type { ExecucaoVisual } from '../PixelOffice'

/** O motor de caminhada do V8 cruza o andar em 900 ms; no vivo o passo é mais calmo. */
export const RITMO_ANIMACAO_VIVO = 0.45
export const DURACAO_MONTAGEM_SALA_MS = 1100
/** Tempo entre o último sair (luz apaga) e a sala começar a desmontar. */
export const ESPERA_DESMONTAR_SALA_MS = 900
/** Rede de segurança: uma saída nunca prende o boneco na cena para sempre. */
export const LIMITE_SAIDA_MS = 15000

export interface Saida { visual: ExecucaoVisual; desde: number }
export interface PresencaVivo {
  presentes: ReadonlyMap<string, ExecucaoVisual>
  saindo: ReadonlyMap<string, Saida>
}

export function presencaVazia(): PresencaVivo {
  return { presentes: new Map(), saindo: new Map() }
}

function comoSaida(visual: ExecucaoVisual): ExecucaoVisual {
  return { ...visual, ativa: false, execucao: { ...visual.execucao, estado: 'parado' } }
}

export function atualizarPresencaVivo(anterior: PresencaVivo, execucoes: readonly ExecucaoVisual[], agoraMs: number): PresencaVivo {
  const presentes = new Map(execucoes.filter((item) => item.ativa).map((item) => [item.animacaoChave, item]))
  const saindo = new Map(anterior.saindo)
  presentes.forEach((_, chave) => saindo.delete(chave))
  anterior.presentes.forEach((visual, chave) => {
    if (presentes.has(chave) || saindo.has(chave)) return
    const atual = execucoes.find((item) => item.animacaoChave === chave)
    saindo.set(chave, { visual: comoSaida(atual ?? visual), desde: agoraMs })
  })
  return { presentes, saindo }
}

export function cenaDoVivo(presenca: PresencaVivo): ExecucaoVisual[] {
  return [...presenca.presentes.values(), ...Array.from(presenca.saindo.values(), (saida) => saida.visual)]
}

/** Devolve a presença sem quem já chegou à recepção, ou `null` se nada mudou. */
export function liberarSaidasConcluidas(
  presenca: PresencaVivo,
  faseAtual: (chave: string) => FaseBoneco | undefined,
  agoraMs: number,
): PresencaVivo | null {
  const concluidas = Array.from(presenca.saindo.entries())
    .filter(([chave, saida]) => faseAtual(chave) === 'descanso' || agoraMs - saida.desde > LIMITE_SAIDA_MS)
    .map(([chave]) => chave)
  if (!concluidas.length) return null
  const saindo = new Map(presenca.saindo)
  concluidas.forEach((chave) => saindo.delete(chave))
  return { presentes: presenca.presentes, saindo }
}

export function squadsNaCena(cena: readonly ExecucaoVisual[]): Set<string> {
  return new Set(cena.map((item) => item.squad))
}

export interface EstadoSalaVivo { progresso: number; vaziaDesde: number | null }

/** Avança a montagem (0 → 1) ou desmontagem (1 → 0) de cada sala de squad. */
export function avancarSalasVivo(
  anteriores: ReadonlyMap<string, EstadoSalaVivo>,
  ocupados: ReadonlySet<string>,
  squads: readonly string[],
  deltaMs: number,
  agoraMs: number,
  reduzirMovimento: boolean,
): Map<string, EstadoSalaVivo> {
  const passo = Math.max(0, deltaMs) / DURACAO_MONTAGEM_SALA_MS
  const proximas = new Map<string, EstadoSalaVivo>()
  for (const squad of squads) {
    const atual = anteriores.get(squad) ?? { progresso: 0, vaziaDesde: null }
    if (ocupados.has(squad)) {
      proximas.set(squad, { progresso: reduzirMovimento ? 1 : Math.min(1, atual.progresso + passo), vaziaDesde: null })
      continue
    }
    const vaziaDesde = atual.vaziaDesde ?? agoraMs
    const desmontando = agoraMs - vaziaDesde >= ESPERA_DESMONTAR_SALA_MS
    const progresso = reduzirMovimento ? 0 : desmontando ? Math.max(0, atual.progresso - passo) : atual.progresso
    proximas.set(squad, { progresso, vaziaDesde })
  }
  return proximas
}
