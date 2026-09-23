/**
 * Tipos centrais do Painel OS.
 *
 * Cada campo deste arquivo reflete exatamente o que `coletar_estado.py` monta
 * e o que `validar.ts` confere na entrada. Se um campo não pode ser medido no
 * disco ele sai como `null`, e a tela mostra um traço — nunca zero.
 *
 * Referência cruzada: o dicionário `estado` em coletar_estado.py:3076–3136.
 */

// ---------------------------------------------------------------------------
// Primitivos reutilizáveis
// ---------------------------------------------------------------------------

export type OrigemAgente = string

// ---------------------------------------------------------------------------
// Ferramentas (MCPs, plugins, componentes locais)
// ---------------------------------------------------------------------------

export type Ferramenta = {
  id: string
  nome: string
  tipo: string
  evidencia: string
  proveniencias: string[]
  fallback?: string
  estado: 'disponível' | 'fallback' | 'ausente'
}

// ---------------------------------------------------------------------------
// Cofre de conhecimento
// ---------------------------------------------------------------------------

export type NoMemoria = {
  id: string
  area: string
  rotulo: string
  grau: number
  peso: number
  autor: string
  quando: string
  especie: string
  corpo: string
  caso: string
  arquivo: string
  vencido: boolean
  familia: string
  linhas: number
}

export type ArestaCofre = {
  de: string
  para: string
  ponte: boolean
  porque: string
}

// ---------------------------------------------------------------------------
// Organograma / rede de convocações
// ---------------------------------------------------------------------------

export type Aresta = {
  de: string
  para: string
  vezes: number
  de_tipo?: 'sessao' | 'agente' | 'sem-cargo' | 'desconhecido'
}

// ---------------------------------------------------------------------------
// Agentes
// ---------------------------------------------------------------------------

export type Agente = {
  id: string
  squad: string
  nome: string
  ultima_convocacao?: string | null
  convocacoes: number | null
  convocacoes_24h?: number
  convocacoes_7d?: number
  origem: OrigemAgente
  modelo: string
  ferramentas: string[] | null
  descricao?: string
  linhas: number
  bytes: number
  modificado: string
  arquivo: string
  retornos_registrados?: number
}

export type AgenteSessao = {
  id: string
  nome: string
  papel: string
  camada: string
  cor: string
  resumo: string
  verificador: {
    checagens: number | null
    reprovadas: number | null
    indeterminadas: number | null
    vencido: boolean
    erro_leitura?: string
    falhas: { o_que: string; desde?: string }[]
    rodada?: string
    arquivo: string
  }
  motores?: {
    situacao?: 'um_ativo' | 'varios_ativos' | 'nenhum_ativo' | 'indeterminado'
    motivo?: string | null
    motor?: string | null
    ativos?: string[]
    servicos?: {
      service: string
      ativo?: boolean
      existe?: boolean | null
      estado?: string | null
      sub?: string | null
      motor?: string | null
      motor_fonte?: string
    }[]
  } | null
  memoria: { linhas: number; arquivos: number }
  diario: { arquivos: number }
  cron_linhas: number
}

// ---------------------------------------------------------------------------
// SOPs (playbooks operacionais)
// ---------------------------------------------------------------------------

export type Sop = {
  id: string
  nome: string
  objetivo: string
  autonomia: string
  ferramentas: string[]
  agentes: string[]
  entradas: string[]
  saidas: string[]
  gatilho: string
  frequencia: string
  fontes: unknown[]
  responsavel: string
}

// ---------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------

export type ItemBiblioteca = {
  id: string
  rotulo: string
  origem: 'acervo' | 'pronto' | 'cliente'
  acessivel: boolean
  modificado: string
  arquivos: number
}

// ---------------------------------------------------------------------------
// Estúdio de conteúdo
// ---------------------------------------------------------------------------

export type Peca = {
  n: number
  titulo: string
  status: string
  formato?: string
  tem_capa: boolean
  capa_url?: string
  tem_video: boolean
  agendado_para?: string
  data?: string
  canais: string[]
  artefato_disponivel: boolean
  aprovacao_disponivel: boolean
}

export type FonteRecebida = {
  id: string
  origem: string
  url: string
  estado: string
  recebido_em: string
  conjuntos: number
  arquivos: number
  bytes: number
  por_tipo: Record<string, number>
  observacao: string
  assinatura_inventario_sha256: string
}

export type Pecas = {
  erro?: string
  lista: Peca[]
  atualizado_em: string
  com_capa: number
  com_video: number
  capas_servidas: number
  pastas_sem_capa: number | null
  pastas_em_disco: number
  pastas_sem_capa_com_video?: number
  pastas_ausentes: number
  acoes_habilitadas: boolean
  acoes_bloqueio: string | null
  total: number | null
  analitica?: {
    por_status: Record<string, number>
    por_formato: Record<string, number>
    por_canal: Record<string, number>
    meta: { motivo: string }
    com_agenda: number
    total: number
    links_publicados: { instagram?: number; linkedin?: number }
  }
  fontes_recebidas?: {
    erro?: string
    itens: FonteRecebida[]
  }
}

// ---------------------------------------------------------------------------
// Agentes ao vivo (Feature A — sonda de presença)
// ---------------------------------------------------------------------------

export type AgenteVivo = {
  id: string
  /** Qual sessão da casa gerou este agente: luana, renato ou bia. */
  dono?: 'luana' | 'renato' | 'bia' | string
  /** Identidade operacional allowlisted, ou sessao-codex para desconhecidos. */
  identidade?: string | null
  papel?: string | null
  tarefa?: string | null
  tipo?: string | null
  motor?: 'claude' | 'codex' | string
  descricao?: string | null
  pai?: string | null
  profundidade?: number | null
  inicio?: string | null
  inicio_epoch?: number | null
  ultima_atividade?: string | null
  transcript_bytes?: number | null
  fase: string
  etapa: string
  /** Indica que a etapa veio da descrição de uma tool, não é texto de UI. */
  etapa_e_description?: boolean | null
  ferramenta?: string | null
  silencio_s: number
  estado: 'trabalhando' | 'silencioso' | 'parado'
  arquivo?: string
  problema?: string | null
}

export type AgentesVivos = {
  ok: boolean
  motivo: string
  erro?: string | null
  contagem: {
    trabalhando: number
    silencioso: number
    parado: number
    vivos?: number
    total?: number
    indeterminados?: number
  }
  agentes: AgenteVivo[]
  avisos: string[]
}

// ---------------------------------------------------------------------------
// Estado raiz
// ---------------------------------------------------------------------------

export type Estado = {
  gerado_em: string
  calculo_ms?: number
  fonte: Record<string, string>

  verificadores: {
    luana?: { reprovadas: number; total: number; vencido: boolean; arquivo: string; falhas: { o_que: string; desde?: string }[] }
    renato?: { reprovadas: number; total: number; vencido: boolean; arquivo: string; falhas: { o_que: string; desde?: string }[] }
    erro?: string
  }

  resumo: {
    agentes_casa: number
    agentes_sessao: number
    convocacoes_total: number
    convocacoes_casa: number
    convocacoes_pela_sessao?: number
    convocacoes_por_subagente?: number
    convocacoes_repetidas_descartadas?: number
    convocacoes_por_motor?: Record<string, number>
    convocacoes_por_modelo?: Record<string, number>
    transcripts_por_motor?: Record<string, number>
    transcripts_lidos: number
    cron_ativo: number | null
  }

  squads: Record<string, { nome: string; descricao: string }>
  agentes: Agente[]
  sessao: AgenteSessao[]
  arestas: Aresta[]
  convocacoes_fora_da_casa: Record<string, number>
  convocacoes_erro?: string
  chamador_nao_resolvido?: Record<string, number>

  sops: { status: string; itens: Sop[] } | null

  cofre: {
    nos: NoMemoria[]
    arestas: ArestaCofre[]
    erro?: string
    conexoes: number | null
    cobertura: number | null
    familias: { id: string; nome: string }[]
    areas: { id: string; nome: string; sempre_visivel?: boolean; total: number }[]
    truncados: string[]
    vencidos: string[]
    recusados: string[]
    arestas_recusadas: string[]
    arquivos: number | null
    grau_medio: number
  } | null

  cron: {
    jobs: { expressao: string; rotulo: string; dono?: string }[] | null
    fuso?: string
    total: number | null
    negacao?: { erro?: string; mascarados: number }
  }

  pecas: Pecas

  tarefas?: {
    erro?: string
    total_abertas: number | null
    por_status: Record<string, number>
    por_prazo: Record<string, number>
    por_movimento: Record<string, number>
    por_projeto: { projeto: string; total: number }[]
    truncado?: boolean
    coletado_em?: string
  }

  aprovacoes?: {
    erro?: string
    itens: { id: string; estado: string; tipo: string; origem: string; criado_em: string; titulo?: string }[]
    decisoes_habilitadas: boolean
    decisoes_bloqueio?: string
    total: number
  }

  cobrancas?: {
    erro?: string
    status: string
    atualizado_em: string
    faturas_atrasadas: number
    clientes_atrasados: number
    por_faixa: { faixa: string; faturas: number }[]
    por_moeda: { moeda: string; faturas: number; total: number | null }[]
  }

  chamadas?: {
    status: string
    total: number
    atualizado_em: string
    erro?: string
    nos: {
      id: string
      rotulo: string
      frequencia: number
      evidencias: { chamada_id: string; citacao_ids: string[] }[]
      tipo: string
    }[]
    arestas: { de: string; para: string; frequencia: number }[]
    registros: {
      id: string
      citacoes: { id: string; trecho: string; inicio_s?: number }[]
    }[]
  }

  pipeline?: {
    erro?: string
    total: number | null
    organizacoes: number
    etapas: { etapa: string; total: number }[]
    coletado_em?: string
  }

  followup?: {
    status: string
    envios_registrados_no_log: number | null
    erro?: string
    contatos_no_estado: number
  }

  diretiva?: {
    erro?: string
    status?: string
    objetivo: string | null
    prazo: string | null
    criada_em?: string | null
    atualizada_em?: string | null
    origem: { canal: string; mensagem_id: string } | null
  }

  calendario?: {
    erro?: string
    vencido: boolean
    totais?: { eventos_agendados: number; eventos_futuros_na_coleta: number }
    janela?: { inicio: string; fim: string }
    dias: {
      data: string
      eventos_agendados: number
      minutos_agendados: number
      futuros_na_coleta: number
    }[]
  }

  ferramentas?: {
    erro?: string
    itens: Ferramenta[]
    medidos: number
    por_tipo: Record<string, number>
    contagem: Record<string, number>
  }

  biblioteca?: {
    erro?: string
    atualizado_em: string
    total: number
    por_origem: Record<string, number>
    atalhos_quebrados: number
    rotulos_mascarados: number
    itens: ItemBiblioteca[]
  }
}
