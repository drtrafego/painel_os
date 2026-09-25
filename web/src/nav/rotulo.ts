import type { Dado, Vista, VistaId } from './rotas'
import type { Estado } from '../dados/tipos'

/**
 * O ROTULO DE UMA VISTA SAI DO DADO, NAO DA MAO DE QUEM EDITOU POR ULTIMO.
 *
 * ‼️ POR QUE ISTO EXISTE. Ate 10/09/2026 o `tipo` de cada vista era digitado a
 * mao em `rotas.ts`, e ele venceu: Cobrancas, Ferramentas e Cofre estavam
 * escritos `'nenhum'` com as tres telas mostrando numero medido. A barra
 * lateral apagava a bolinha e o Centro de comando escrevia "sem dado ainda" por
 * extenso, em TODA tela do painel, sobre vistas que tinham 27 conexoes, 5
 * aprendizados e uma API financeira viva do outro lado.
 *
 * A prova de que era rotulo e nao medicao: Aprovacoes e Cobrancas tem a MESMA
 * estrutura (fonte lida, zero real, motivo escrito) e estavam rotuladas ao
 * contrario uma da outra. Consertar as tres a mao consertaria hoje; o `tipo`
 * voltaria a vencer na proxima tela que ganhasse fonte.
 *
 * COMO ESTE ARQUIVO DECIDE, e ele e deliberadamente conservador:
 *
 *   fonte RESPONDEU  + declarado 'nenhum'          -> promove, com a frase MEDIDA
 *   fonte RESPONDEU  + declarado 'medido'/'parcial'-> mantem o declarado
 *   fonte NAO respondeu                            -> rebaixa para 'nenhum'
 *   vista sem sonda (composta de varias fontes)    -> mantem o declarado
 *
 * Ele nunca MELHORA uma nota que alguem escreveu: `parcial` com ressalva
 * redigida continua `parcial`, porque a ressalva e julgamento editorial e o
 * codigo nao sabe reescreve-la. Ele so conserta as duas pontas que o dado
 * decide sozinho: fonte que existe nao pode se anunciar ausente, e fonte que
 * sumiu nao pode continuar prometendo numero.
 *
 * ⚠️ `null` NAO E "sem dado": e "esta vista soma varias fontes e eu nao sei
 * reduzir isso a uma nota". Nesse caso quem manda e o declarado. Confundir as
 * duas coisas seria repetir aqui dentro o erro que o arquivo veio consertar.
 */

/** O que a sonda de uma vista responde. `null` = nao sei medir esta vista. */
type Sonda = (estado: Estado) => Medida | null

type Medida =
  /** A fonte respondeu. `fonte` e a frase medida, usada so quando promove. */
  | { respondeu: true; fonte: string; deFora?: string }
  /** A fonte nao respondeu. `porque` e o motivo medido, nunca um chute. */
  | { respondeu: false; porque: string }

const hora = (iso: string | null | undefined): string =>
  iso ? `${new Date(iso).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc` : 'sem hora'

/**
 * As vistas de FONTE UNICA. As compostas (comando, estudio, diretores, agenda,
 * analitica) ficam de fora de proposito: elas somam fontes independentes e uma
 * nota so nao descreve o conjunto, entao o declarado continua mandando nelas.
 */
const SONDAS: Partial<Record<VistaId, Sonda>> = {
  aprovacoes: (e) => {
    const d = e.aprovacoes
    if (!d) return { respondeu: false, porque: 'a fila de aprovações não veio no estado atual' }
    if (d.erro) return { respondeu: false, porque: d.erro }
    if (d.total === null) return { respondeu: false, porque: 'a fila foi encontrada e não deu para contar' }
    return {
      respondeu: true,
      fonte: `fila local persistente, lida inteira: ${d.total} item(ns) registrados`,
    }
  },

  cobrancas: (e) => {
    const d = e.cobrancas
    if (!d) return { respondeu: false, porque: 'o relatório de atrasos não veio no estado atual' }
    if (d.status === 'erro' || d.erro) {
      return { respondeu: false, porque: d.erro ?? 'a fonte financeira respondeu com erro' }
    }
    if (d.faturas_atrasadas === null) {
      return { respondeu: false, porque: 'a fonte respondeu e não deu para contar as faturas' }
    }
    return {
      respondeu: true,
      fonte:
        `relatório canônico de atrasos da API financeira, consultado ${hora(d.atualizado_em)}: ` +
        `${d.faturas_atrasadas} fatura(s) e ${d.clientes_atrasados ?? '—'} cliente(s). ` +
        'Nome, telefone, e-mail, id e vencimento individual são descartados antes do estado',
    }
  },

  financeiro: (e) => {
    const d = e.financeiro
    if (!d) return { respondeu: false, porque: 'os dados financeiros não vieram no estado atual' }
    if (d.status === 'erro' || d.erro) return { respondeu: false, porque: d.erro ?? 'a API financeira retornou erro' }
    return {
      respondeu: true,
      fonte: `API financeira consultada ${hora(d.atualizado_em)}: MRR R$ ${d.mrr_atual?.toLocaleString('pt-BR') ?? 0}`,
    }
  },

  redes: (e) => {
    const d = e.redes
    if (!d) return { respondeu: false, porque: 'os dados de redes sociais não vieram no estado atual' }
    if (d.status === 'erro' || d.erro) return { respondeu: false, porque: d.erro ?? 'erro ao ler dados de redes' }
    return {
      respondeu: true,
      fonte: `Instagram @gastaomatos: ${d.instagram?.seguidores ?? 0} seguidores e ${d.instagram?.alcance_agregado ?? 0} alcance`,
      deFora: d.linkedin?.motivo ? `LinkedIn: ${d.linkedin.motivo}` : undefined,
    }
  },

  ferramentas: (e) => {
    const d = e.ferramentas
    if (!d) return { respondeu: false, porque: 'o inventário de ferramentas não veio no estado atual' }
    if (!d.itens.length) {
      return { respondeu: false, porque: d.erro ?? 'o inventário foi lido e voltou vazio' }
    }
    const fonte =
      `inventário medido nos adaptadores desta máquina: ${d.medidos} conexão(ões), ` +
      `${d.contagem.disponível} disponível(is), ${d.contagem.fallback} em fallback e ` +
      `${d.contagem.ausente} ausente(s)`
    return d.erro
      ? { respondeu: true, fonte, deFora: d.erro }
      : {
          respondeu: true,
          fonte,
          deFora:
            'disponível prova configuração local, não login eterno nem sucesso da última ação',
        }
  },

  cofre: (e) => {
    const d = e.cofre
    if (!d) return { respondeu: false, porque: 'o cofre não veio no estado atual' }
    if (d.erro) return { respondeu: false, porque: d.erro }
    if (!d.nos.length || d.conexoes === null) {
      return { respondeu: false, porque: d.erro ?? 'o cofre foi lido e não tem nó nenhum' }
    }
    return {
      respondeu: true,
      fonte: `${d.nos.length} aprendizado(s) declarados e ${d.conexoes} ligação(ões) escritas na fonte`,
      // Grafo sem aresta e lista. Enquanto a ligacao nao estiver escrita, a
      // promocao para desta vista para no 'parcial'.
      deFora: d.arestas.length
        ? 'ligação achada por semelhança nunca vira aresta: só entra o que a fonte escreveu'
        : 'nenhuma ligação escrita ainda, então o mapa é uma lista e não um grafo',
    }
  },

  chamadas: (e) => {
    const d = e.chamadas
    if (!d) return { respondeu: false, porque: 'a ingestão de chamadas não veio no estado atual' }
    if (d.status !== 'pronto' || d.total === null) {
      return { respondeu: false, porque: d.erro ?? 'não existe caminho de ingestão de transcrições ligado' }
    }
    return { respondeu: true, fonte: `${d.total} chamada(s) ingeridas com origem, hora e citação rastreáveis` }
  },

  tarefas: (e) => {
    if (!e.agentes || !e.agentes.length) {
      return { respondeu: false, porque: 'o catálogo de agentes operacionais não veio no estado atual' }
    }
    return {
      respondeu: true,
      fonte: `${e.agentes.length} agente(s) no catálogo operacional · escritório integrado com terminal ao vivo`,
    }
  },

  pipeline: (e) => {
    const d = e.pipeline
    if (!d) return { respondeu: false, porque: 'o CRM não veio no estado atual' }
    if (d.erro || d.total === null) {
      return { respondeu: false, porque: d.erro ?? 'o CRM respondeu e não deu para contar' }
    }
    return { respondeu: true, fonte: `${d.total} registro(s) agregados de ${d.organizacoes ?? '—'} organização(ões)` }
  },

  biblioteca: (e) => {
    const d = e.biblioteca
    if (!d) return { respondeu: false, porque: 'o índice da biblioteca não veio no estado atual' }
    if (d.erro) return { respondeu: false, porque: d.erro }
    return { respondeu: true, fonte: `${d.total} entrada(s) indexadas no acervo, sem caminho nem nome de cliente` }
  },
}

/**
 * O `Dado` que vale para esta vista AGORA, medido no estado quando da.
 *
 * Quem desenha rotulo (a bolinha da barra lateral, o cartao do Centro, a
 * declaracao de tela vazia) chama isto e nunca `vista.dado` direto: e o unico
 * jeito de a tela e a navegacao nao discordarem uma da outra.
 */
export function dadoDaVista(vista: Vista, estado: Estado): Dado {
  const sonda = SONDAS[vista.id]
  const medida = sonda ? sonda(estado) : null
  if (!medida) return vista.dado

  if (!medida.respondeu) {
    // A fonte sumiu. Vista que ja se declarava sem dado mantem a propria
    // prosa, que e a fila de trabalho; vista que prometia numero e rebaixada
    // com o motivo MEDIDO, nunca com um zero no lugar.
    return vista.dado.tipo === 'nenhum'
      ? vista.dado
      : { tipo: 'nenhum', mostraria: vista.pergunta, falta: medida.porque }
  }

  // A fonte respondeu e alguem ja declarou a nota com a ressalva redigida:
  // mantem. Ressalva e julgamento editorial, e o codigo nao sabe reescrever.
  if (vista.dado.tipo !== 'nenhum') return vista.dado

  return medida.deFora
    ? { tipo: 'parcial', fonte: medida.fonte, deFora: medida.deFora }
    : { tipo: 'medido', fonte: medida.fonte }
}
