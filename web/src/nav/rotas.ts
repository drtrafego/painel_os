import type { NomeIcone } from '../ui/Icone'

/**
 * AS VISTAS, NUM LUGAR SO.
 *
 * O principio de arquitetura da referencia: todo o estado vive num arquivo
 * tipado e as vistas leem dele, entao somar uma vista (ou um diretor) e
 * acrescentar uma entrada, nao refazer tela. Este arquivo e o lugar dessa
 * entrada para a NAVEGACAO; `dados/tipos.ts` e o lugar para o DADO.
 *
 * ⚠️ QUANTAS SAO: O ALVO SE MOVE, E ISSO NAO E DETALHE.
 * O numero "onze" veio de um texto de referencia que era FOTO DE UM MOMENTO.
 * Medido na serie de reels do autor: ele foi de 6 agentes em 16/08 para 13 em
 * 25/08 e 14 em 01/09, e o painel cresceu junto. Em 08/09 o menu dele tem 13
 * itens, todos nomeados aqui. O décimo terceiro é Llamadas, provado nos frames
 * `0827_LLAMADAS_*`, e aparece em português como Chamadas.
 *
 * O que mudou em 08/09, medido e nao deduzido:
 *   ENTROU  aprovacoes, cobrancas e o estudio de conteudo
 *   SAIU    chat, que estava na nossa lista e NAO existe no menu dele
 *
 * Mais a vista do detalhe de um diretor, que nao aparece no menu porque so
 * existe com um diretor escolhido.
 *
 * `dado` NAO e enfeite: e o que a tela tem direito de mostrar. Vista marcada
 * 'nenhum' escreve na propria tela que nao tem dado ainda, em vez de desenhar
 * grafico bonito com numero inventado. Zero de ausencia e zero de erro chegam
 * na tela iguais, e esta casa ja gastou um dia inteiro por causa disso.
 */

export type VistaId =
  | 'comando'
  | 'estudio'
  | 'aprovacoes'
  | 'cobrancas'
  | 'financeiro'
  | 'redes'
  | 'diretores'
  | 'tarefas'
  | 'pipeline'
  | 'chamadas'
  | 'agenda'
  | 'analitica'
  | 'biblioteca'
  | 'ferramentas'
  | 'cofre'
  | 'falta'

/** De onde a vista tira o que mostra. */
export type Dado =
  /** Ha fonte medida no disco e a tela mostra numero de verdade. */
  | { tipo: 'medido'; fonte: string }
  /**
   * Nao ha fonte nossa ainda. `mostraria` e o que a tela vai mostrar quando
   * houver, e `falta` e o que precisa existir pra isso: a lista do que falta
   * e o que separa conserto de remendo, e vira a fila de trabalho.
   */
  | { tipo: 'nenhum'; mostraria: string; falta: string }
  /**
   * Ha fonte, mas ela cobre so parte do que a vista promete. O pedaco de fora
   * vai escrito, porque cobertura parcial apresentada como completa e a mesma
   * familia do numero sem hora.
   */
  | { tipo: 'parcial'; fonte: string; deFora: string }

export type Vista = {
  id: VistaId
  nome: string
  /** O que a tela responde. Vai no cabecalho dela, nao e slogan. */
  pergunta: string
  icone: NomeIcone
  dado: Dado
}

export const VISTAS: readonly Vista[] = [
  {
    id: 'comando',
    nome: 'Centro de comando',
    pergunta: 'o que precisa da sua decisão agora',
    icone: 'comando',
    dado: {
      tipo: 'parcial',
      fonte: 'diretiva vigente, tarefas, CRM agregado, follow-up, verificadores, cron e convocações, todos com origem ou hora visíveis',
      deFora:
        'qualificação individual e resultado das chamadas continuam sem fonte; ausência não vira zero',
    },
  },
  {
    id: 'estudio',
    nome: 'Estúdio de conteúdo',
    pergunta: 'o que está pronto para sair, e por onde',
    icone: 'pincel',
    dado: {
      tipo: 'parcial',
      fonte:
        'produtor_conteudo/data/posts.json e as pastas de out/: a peça, o formato, o estado, ' +
        'os canais, o agendamento, e a capa e o vídeo que existem mesmo em disco',
      deFora:
        'os botões de publicar e baixar não existem, e é decisão e não falta: este painel só ' +
        'lê disco e não tem caminho de escrita nenhum. YouTube Shorts e TikTok também ficam ' +
        'de fora porque esta casa não publica neles',
    },
  },
  {
    id: 'aprovacoes',
    nome: 'Aprovações',
    pergunta: 'o que está esperando o seu sim',
    icone: 'escudo',
    dado: {
      tipo: 'medido',
      fonte: 'fila local persistente painel_os/data/aprovacoes.json, validada inteira e somente lida pelo coletor',
    },
  },
  {
    id: 'cobrancas',
    nome: 'Cobranças',
    pergunta: 'quem deve, quanto, e desde quando',
    icone: 'grafico',
    dado: {
      tipo: 'nenhum',
      mostraria: 'o que está a receber, por cliente e por vencimento',
      falta:
        'não procurei fonte para esta ainda, e digo isso em vez de escrever uma frase que ' +
        'parece levantamento. ⚠️ E ela leva nome de cliente e valor por dentro: quando existir, ' +
        'entra agregada, porque nome de cliente não aparece em tela nenhuma desta casa.',
    },
  },
  {
    id: 'financeiro',
    nome: 'Financeiro',
    pergunta: 'quanto a operação fatura, arrecada e tem a receber',
    icone: 'grafico',
    dado: {
      tipo: 'medido',
      fonte: 'GET /dashboard/metrics da API financeira, reduzido a KPIs agregados sem PII',
    },
  },
  {
    id: 'redes',
    nome: 'Redes sociais',
    pergunta: 'qual o alcance e engajamento orgânico das mídias sociais',
    icone: 'megafone',
    dado: {
      tipo: 'parcial',
      fonte: 'Composio Instagram Graph API para @gastaomatos (seguidores, alcance, salvamentos)',
      deFora: 'LinkedIn orgânico requer escopo r_organization_social adicional na conexão OAuth',
    },
  },
  {
    id: 'diretores',
    nome: 'Diretores',
    pergunta: 'quem trabalha nesta operação, e quem está encostado',
    icone: 'equipe',
    dado: {
      tipo: 'medido',
      fonte: 'coletor/coletar_estado.py: frontmatter dos agentes, transcripts de sessão, os dois verificadores e o crontab',
    },
  },
  {
    id: 'tarefas',
    nome: 'Escritório',
    pergunta: 'o que está em aberto, de quem é, e o que vence primeiro',
    icone: 'tarefas',
    dado: {
      tipo: 'medido',
      fonte: 'API REST v1 do gestor de tarefas, consultada somente para leitura e reduzida a contagens sem texto livre, ids ou dados pessoais',
    },
  },
  {
    id: 'pipeline',
    nome: 'Pipeline comercial',
    pergunta: 'quantos leads entraram, em que etapa estão, e quanto virou venda',
    icone: 'pipeline',
    dado: {
      tipo: 'medido',
      fonte:
        'analytics da API canônica do CRM, agregado entre organizações: somente contagem por etapa; nenhuma rota de leads ou contatos é consultada',
    },
  },
  {
    id: 'chamadas',
    nome: 'Chamadas',
    pergunta: 'o que as conversas provam, e quais padrões se repetem',
    icone: 'chat',
    dado: {
      tipo: 'nenhum',
      mostraria:
        'as chamadas transcritas, os trechos citáveis e as relações verificáveis entre dor, objeção, promessa, falta e achado',
      falta:
        'não existe hoje uma ingestão estruturada de transcrições no painel. O contrato já está no coletor, mas só aceitará registros com origem, identificador estável, horário e citações; nome, telefone, e-mail e texto sem origem ficam de fora. A conexão com o Drive ainda precisa ser ligada.',
    },
  },
  {
    id: 'agenda',
    nome: 'Agenda',
    pergunta: 'o que está marcado, e o que dispara sozinho',
    icone: 'agenda',
    dado: {
      tipo: 'parcial',
      fonte: 'crontab, publicações com status agendado e snapshot agregado do Google Calendar primário',
      deFora:
        'o calendário comprova eventos agendados, nunca presença ou reunião ocorrida. Título, participantes, descrição, local, URL e IDs não entram no painel',
    },
  },
  {
    id: 'analitica',
    nome: 'Analítica de conteúdo',
    pergunta: 'o que foi publicado, e o que aquilo rendeu',
    icone: 'analitica',
    dado: {
      tipo: 'parcial',
      fonte:
        'produtor_conteudo/data/posts.json: estados, formatos, canais, agenda e cobertura de links, isolados somente na marca gastaomatos',
      deFora:
        'alcance, impressão, clique, curtida, comentário, compartilhamento e conversão. Esta sessão não tem conector de insights orgânicos; o token local cobre só parte da frota e não serve para varredura segura',
    },
  },
  {
    id: 'biblioteca',
    nome: 'Biblioteca',
    pergunta: 'que peças existem prontas, e onde elas estão',
    icone: 'biblioteca',
    dado: {
      tipo: 'medido',
      fonte:
        'coletor/coletar_estado.py: índice sanitizado das entradas atuais de produtor_conteudo/out, PRONTOS e PRONTOS-CLIENTES; atalhos quebrados ficam contados e nenhum caminho ou nome de cliente entra na tela',
    },
  },
  {
    id: 'ferramentas',
    nome: 'Ferramentas',
    pergunta: 'o que esta casa tem instalado, e o que disso responde',
    icone: 'ferramentas',
    dado: {
      tipo: 'nenhum',
      mostraria: 'as integrações e os scripts da casa, com o estado de cada um',
      falta:
        'há três fontes parciais em disco e nenhuma completa: Ferramentas/FERRAMENTAS.txt ' +
        'cataloga 3 ferramentas e está parado desde 02/07; conexoes_comuns/ tem 14 ' +
        'integrações em markdown, viva; luana/.mcp.json declara 1 servidor. ⚠️ Nenhuma ' +
        'delas explica as dezenas de conectores que a sessão de fato tem, e o agente que ' +
        'procurou em 08/09 declarou que não achou o arquivo: eles devem vir da conta, não ' +
        'do disco. Somar as três daria um inventário que parece completo e não é.',
    },
  },
  {
    id: 'cofre',
    nome: 'Cofre de conhecimento',
    pergunta: 'o que a operação já aprendeu, e o que se liga a quê',
    icone: 'cofre',
    dado: {
      /**
       * ‼️ MUDOU EM 10/09, e a entrada velha descrevia OUTRA TELA. Ela dizia
       * "cada arquivo como nó e cada referência como aresta" e citava a medição
       * de 08/09 (zero link entre os arquivos de memória) como o que faltava.
       * Aquilo era a ESTANTE. O nó agora é um APRENDIZADO declarado em
       * `data/cofre.json`, com autor, data, corpo, caso e fonte, e a aresta só
       * nasce quando o texto da fonte escreve a ligação.
       *
       * Enquanto isto dizia 'nenhum', a barra lateral e o Centro marcavam o
       * Cofre como "sem dado ainda" enquanto a tela mostrava número medido: a
       * navegação contradizia a própria tela.
       */
      tipo: 'parcial',
      fonte:
        'painel_os/data/cofre.json: cada nó é um aprendizado com espécie, área, família, ' +
        'autor, data, peso, corpo e caso, e o coletor confere a âncora de cada um contra o ' +
        'arquivo citado antes de emitir. Âncora que sumiu vira nó vencido e continua na lista',
      deFora:
        'o Cofre só sabe o que alguém escreveu em `cofre.json`: aprendizado que ainda não foi ' +
        'declarado não existe aqui, e ligação achada por semelhança nunca vira aresta. ' +
        'Cobertura mede quantos aprendizados estão amarrados a algum outro, não quanto a ' +
        'operação aprendeu',
    },
  },
  {
    id: 'falta',
    nome: 'O que falta',
    pergunta: 'o que falta para a operação rodar com autonomia e sem pontos cegos',
    icone: 'radar',
    dado: {
      tipo: 'medido',
      fonte: 'auditoria cruzada do estado: fontes sem conexão, nós soltos no cofre, checagens reprovadas e agentes encostados',
    },
  },
]

export const POR_ID: Record<VistaId, Vista> = Object.fromEntries(
  VISTAS.map((v) => [v.id, v]),
) as Record<VistaId, Vista>

/**
 * A rota. `diretores` com `quem` preenchido e a decima primeira vista, o
 * detalhe de um diretor. Ela nao esta no menu porque so existe depois de
 * alguem escolher um diretor, e menu com item que nao abre e o comeco de um
 * painel em que ninguem confia.
 */
export type Rota = { vista: VistaId; quem: string | null }

export const ROTA_PADRAO: Rota = { vista: 'comando', quem: null }

/** Le a rota do hash. O que nao souber ler cai no padrao, nunca em tela branca. */
export function lerHash(hash: string): Rota {
  const limpo = hash.replace(/^#\/?/, '').split('?')[0]
  if (limpo === '') return ROTA_PADRAO
  const [vista, quem] = limpo.split('/').map((p) => decodeURIComponent(p))
  if (!(vista in POR_ID)) return ROTA_PADRAO
  return { vista: vista as VistaId, quem: quem ? quem : null }
}

export function escreverHash(rota: Rota): string {
  return rota.quem ? `#/${rota.vista}/${encodeURIComponent(rota.quem)}` : `#/${rota.vista}`
}
