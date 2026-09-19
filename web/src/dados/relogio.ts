import type { Agente, Estado } from './tipos'

/**
 * O QUE SE MEDE CONTRA O RELOGIO, NUM LUGAR SO.
 *
 * ‼️ POR QUE ESTAS DUAS FUNCOES MORAM AQUI E NAO DENTRO DE UMA TELA. As duas
 * consertam o mesmo defeito de 10/09/2026: um campo PREENCHIDO sendo lido como
 * um fato CONFERIDO. A diretiva com prazo 09/09 aparecia "ativa" no dia 10
 * porque o Centro de comando so perguntava se `prazo` existia; e a pilula do
 * agente dizia "ativo hoje" medindo uma janela de 24 horas.
 *
 * Regra que mora dentro de quem decide, a proxima edicao apaga. Aqui, quem
 * ler diretiva ou atividade herda a comparacao com o relogio sem pedir, e
 * quem quiser mudar a regua mexe num arquivo so e o teste ao lado grita.
 *
 * ⚠️ E ELE NAO IMPORTA `estado.json`: e por isso que da pra testar com
 * `node --experimental-strip-types`, sem carregar o painel inteiro.
 */

/** Dias inteiros desde a ultima convocacao. null quando nunca foi convocado. */
export function diasParado(agente: Agente, agora = Date.now()): number | null {
  if (!agente.ultima_convocacao) return null
  const t = Date.parse(agente.ultima_convocacao)
  if (Number.isNaN(t)) return null
  return Math.floor((agora - t) / 86_400_000)
}

export type Atividade =
  /** Convocado dentro de uma JANELA DE 24 HORAS, que nao e o mesmo que hoje. */
  | { nivel: 'recente'; texto: string }
  | { nivel: 'semana'; texto: string }
  | { nivel: 'parado'; texto: string }
  | { nivel: 'nunca'; texto: string }

/**
 * ‼️ O ROTULO DIZ 24H PORQUE A MEDIDA E 24H (mudou em 10/09/2026).
 *
 * Ate hoje esta funcao devolvia "ativo hoje" quando `diasParado` era 0, e
 * `diasParado` conta JANELA DE 24 HORAS decorrida, nao dia do calendario. Um
 * agente chamado ontem as 22h aparecia como "ativo hoje" as 9h da manha, e o
 * numero da tela nao batia com o que a operacao estava fazendo naquele minuto.
 *
 * A janela FICA e o rotulo e que muda, por dois motivos medidos:
 *   1. dia de calendario zeraria a cada meia-noite e a tela leria "operacao
 *      parada" as 00h05 de um dia de trabalho normal;
 *   2. o painel ja mede a MESMA janela em `convocacoes_24h`, e o cartao do
 *      Centro ja a chamava de "nas ultimas 24h". Havia um numero so com dois
 *      nomes na mesma tela, e o nome errado era o que estava em mais lugares.
 *
 * ⚠️ E ISTO CONTA CARGO, NAO INSTANCIA. Um cargo chamado quinze vezes na mesma
 * hora conta como UM aqui. Quantas vezes ele foi chamado esta em
 * `convocacoes_24h`, ao lado, e as duas perguntas sao diferentes.
 */
export function atividade(agente: Agente, agora = Date.now()): Atividade {
  const d = diasParado(agente, agora)
  if (d === null) return { nivel: 'nunca', texto: 'nunca convocado' }
  if (d <= 0) return { nivel: 'recente', texto: 'ativo nas últimas 24h' }
  if (d <= 7) return { nivel: 'semana', texto: `há ${d}d` }
  return { nivel: 'parado', texto: `parado ${d}d` }
}

export type SituacaoDiretiva =
  | { estado: 'sem-fonte'; porque: string }
  | { estado: 'encerrada'; rotulo: string }
  | { estado: 'vigente'; rotulo: string; diasAteVencer: number }
  | { estado: 'vencida'; rotulo: string; diasVencida: number }

/**
 * A DIRETIVA DO TOPO CONFERIDA CONTRA O RELOGIO, e nao so contra o campo.
 *
 * ‼️ Ate 10/09/2026 o Centro de comando so perguntava se `objetivo` e `prazo`
 * existiam. A diretiva do arquivo tinha prazo 09/09 e o painel a mostrava como
 * ATIVA no dia 10, no cartao mais importante da tela inicial. Prazo que passou
 * e escrito ao lado da palavra "ativa" nao e ressalva: e o painel afirmando o
 * contrario do que o proprio dado diz.
 *
 * ⚠️ O PRAZO E UMA DATA DE CALENDARIO, e por isso ele vence no FIM do dia, no
 * fuso de quem escreveu a diretiva (America/Sao_Paulo, que nao tem horario de
 * verao desde 2019, entao -03:00 e exato e nao aproximacao). Comparar com UTC
 * mataria a diretiva tres horas antes da hora dela.
 */
export function situacaoDaDiretiva(
  diretiva: Estado['diretiva'],
  agora = Date.now(),
): SituacaoDiretiva {
  if (!diretiva) return { estado: 'sem-fonte', porque: 'fonte canônica ainda não veio no estado' }
  if (diretiva.status === 'erro' || diretiva.erro) {
    return { estado: 'sem-fonte', porque: diretiva.erro ?? 'a fonte da diretiva respondeu com erro' }
  }
  if (!diretiva.objetivo || !diretiva.prazo) {
    return { estado: 'sem-fonte', porque: 'a diretiva veio sem objetivo ou sem prazo' }
  }
  if (diretiva.status !== 'ativa') {
    return { estado: 'encerrada', rotulo: diretiva.status ?? 'sem status' }
  }
  const fimDoPrazo = Date.parse(`${diretiva.prazo}T23:59:59.999-03:00`)
  if (Number.isNaN(fimDoPrazo)) {
    return { estado: 'sem-fonte', porque: `prazo "${diretiva.prazo}" não é uma data que dê para ler` }
  }
  const dia = 86_400_000
  if (agora > fimDoPrazo) {
    return { estado: 'vencida', rotulo: 'vencida', diasVencida: Math.floor((agora - fimDoPrazo) / dia) + 1 }
  }
  return { estado: 'vigente', rotulo: 'ativa', diasAteVencer: Math.floor((fimDoPrazo - agora) / dia) }
}
