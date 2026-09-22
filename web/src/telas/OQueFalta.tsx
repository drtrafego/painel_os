import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import { VISTAS } from '../nav/rotas'
import { dadoDaVista } from '../nav/rotulo'
import { useAgentesVivos } from '../dados/useAgentesVivos'
import { encostados } from '../dados/estado'
import type { PropsTela } from './Vazias'

export function OQueFalta({ estado, agora, vista }: PropsTela) {
  const { dados: vivos } = useAgentesVivos()

  // 1. Fontes e Telas
  const dadosVistas = VISTAS.map((v) => ({
    vista: v,
    dado: dadoDaVista(v, estado),
  }))
  const semFonte = dadosVistas.filter((d) => d.dado.tipo === 'nenhum')
  const parcial = dadosVistas.filter((d) => d.dado.tipo === 'parcial')
  const medidos = dadosVistas.filter((d) => d.dado.tipo === 'medido')

  // 2. Cofre
  const cofre = estado.cofre
  const nosSoltos = (cofre?.nos ?? []).filter((n) => n.grau === 0)
  const nosVencidos = cofre?.vencidos ?? []

  // 3. Agentes encostados
  const agentesEncostados = encostados(estado, agora.getTime())

  // 4. Verificadores de frota
  const verifLuana = estado.verificadores?.luana
  const verifRenato = estado.verificadores?.renato
  const falhasLuana = verifLuana?.falhas ?? []
  const falhasRenato = verifRenato?.falhas ?? []

  // 5. Tarefas sem prazo ou paradas
  const tarefas = estado.tarefas
  const tarefasSemPrazo = tarefas?.por_prazo?.sem_prazo ?? 0
  const tarefasSemMovimento = tarefas?.por_movimento?.sem_atualizacao_30_dias ?? 0

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela
        titulo="O que falta."
        pergunta={vista.pergunta}
        direita={<span className="rotulo">{vivos?.ok ? `${vivos.contagem?.trabalhando ?? 0} agentes ao vivo · auditoria` : 'auditoria do sistema'}</span>}
      />

      {/* Visão sintética dos gargalos */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          rotulo="telas sem fonte"
          valor={semFonte.length}
          cor={semFonte.length > 0 ? 'text-vermelho' : 'text-verde'}
          nota={`${medidos.length} medidas · ${parcial.length} parciais`}
        />
        <Kpi
          rotulo="aprendizados soltos"
          valor={nosSoltos.length}
          cor={nosSoltos.length > 0 ? 'text-ambar' : 'text-verde'}
          nota={`de ${cofre?.nos?.length ?? 0} no cofre (${cofre?.cobertura ?? 0}% cobertos)`}
        />
        <Kpi
          rotulo="checagens reprovadas"
          valor={falhasLuana.length + falhasRenato.length}
          cor={falhasLuana.length + falhasRenato.length > 0 ? 'text-vermelho' : 'text-verde'}
          nota={`Luana: ${falhasLuana.length} · Renato: ${falhasRenato.length}`}
        />
        <Kpi
          rotulo="agentes encostados"
          valor={agentesEncostados.length}
          cor={agentesEncostados.length > 0 ? 'text-ambar' : 'text-verde'}
          nota="sem convocação há >30 dias"
        />
      </div>

      <div className="space-y-4">
        {/* Bloco 1: Conexões de Dados Ausentes */}
        <section className="carta p-4">
          <div className="flex items-center justify-between">
            <Cabecalho cor="var(--color-vermelho)">1. Fontes de dados e conexões em aberto</Cabecalho>
            <span className="rotulo">{semFonte.length + parcial.length} telas com lacunas</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-tinta-3">
            O painel nunca inventa dado nem substitui ausência por zero. Estas são as integrações que ainda não possuem caminho automatizado de leitura:
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="poco p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold text-tinta">Chamadas (Reuniões e Vendas)</span>
                <Pilula tom="vermelho">sem ingestão</Pilula>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-2">
                A ingestão estruturada de transcrições locais/Drive não está ligada. As chamadas gravadas não alimentam o catálogo de objeções, dores e promessas.
              </p>
              <span className="mt-2 block font-mono text-[9.5px] text-tinta-3">Falta: conectar sincronizador do Google Drive com sanitização estrita de PII.</span>
            </div>

            <div className="poco p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold text-tinta">Cobranças & ERP Financeiro</span>
                <Pilula tom={estado.cobrancas?.status === 'pronto' ? 'lima' : 'ambar'}>
                  {estado.cobrancas?.status === 'pronto' ? 'snapshot manual' : 'sem API direta'}
                </Pilula>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-2">
                A leitura depende de relatório estático gerado por terceiros. Falta a API de faturas e recebíveis responder em tempo real sem intervenção do operador.
              </p>
              <span className="mt-2 block font-mono text-[9.5px] text-tinta-3">Falta: webhook ou polling seguro com agregação anônima por moeda e faixa.</span>
            </div>

            <div className="poco p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold text-tinta">Analítica Orgânica de Redes</span>
                <Pilula tom="ambar">métricas bloqueadas</Pilula>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-2">
                Posts e canais são catalogados pelo produtor local, mas alcance, impressões, cliques e conversões ficam nulos por falta de conector oficial de Meta e LinkedIn.
              </p>
              <span className="mt-2 block font-mono text-[9.5px] text-tinta-3">Falta: credencial oficial de API com token de escopo restrito de leitura.</span>
            </div>

            <div className="poco p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold text-tinta">Agenda & Calendário</span>
                <Pilula tom={estado.calendario?.vencido ? 'vermelho' : 'lima'}>
                  {estado.calendario?.vencido ? 'snapshot vencido' : 'parcial'}
                </Pilula>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-2">
                O arquivo <code className="text-tinta">calendario.json</code> é lido pelo painel, mas não possui nenhum job no cron que o atualize automaticamente no servidor.
              </p>
              <span className="mt-2 block font-mono text-[9.5px] text-tinta-3">Falta: rotina agendada no crontab para extrair o snapshot das próximas 24h.</span>
            </div>
          </div>
        </section>

        {/* Bloco 2: Gargalos Operacionais e Decisão Humana */}
        <section className="carta p-4">
          <Cabecalho cor="var(--color-ambar)">2. Decisões do operador & fluxo de aprovações</Cabecalho>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="poco p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold text-tinta">Critério de "Pendente" no Estúdio</span>
                <Pilula tom="ambar">decisão pendente</Pilula>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-2">
                No coletor, peças marcadas como <code className="text-tinta">pendente</code> não possuem pasta em disco porque ainda não foram geradas, tornando o botão "enviar para aprovação" desabilitado em 100% dos casos.
              </p>
              <span className="mt-2 block font-mono text-[9.5px] text-tinta-3">O dono precisa definir o vocabulário: qual status identifica "peça produzida aguardando decisão"?</span>
            </div>

            <div className="poco p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[12px] font-semibold text-tinta">Tarefas Paradas na Carteira GTD</span>
                <Pilula tom={tarefasSemMovimento > 0 ? 'ambar' : 'neutro'}>{tarefasSemMovimento} estagnadas</Pilula>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-2">
                {tarefasSemPrazo} tarefas sem prazo definido e {tarefasSemMovimento} tarefas sem movimentação de cadastro há mais de 30 dias na carteira aberta.
              </p>
              <span className="mt-2 block font-mono text-[9.5px] text-tinta-3">Falta: triagem e encerramento ou priorização no gestor de tarefas.</span>
            </div>
          </div>
        </section>

        {/* Bloco 3: Lacunas no Conhecimento e na Frota */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Cofre */}
          <section className="carta p-4">
            <div className="flex items-center justify-between">
              <Cabecalho cor="var(--color-lima)">3. Lacunas no Cofre de Conhecimento</Cabecalho>
              <span className="rotulo">{nosSoltos.length} isolados</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-tinta-3">
              Um aprendizado sem conexões com outros padrões ou travas é conhecimento que não se propaga entre agentes:
            </p>
            {nosSoltos.length > 0 ? (
              <ul className="mt-2.5 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {nosSoltos.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 border-b border-linha/40 pb-1 text-[11px]">
                    <span className="truncate text-tinta-2">{n.rotulo}</span>
                    <Pilula tom="neutro">{n.area}</Pilula>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-verde">Todos os aprendizados possuem ao menos uma ligação declarada na fonte.</p>
            )}
            {nosVencidos.length > 0 && (
              <div className="mt-3 rounded border border-vermelho/30 bg-vermelho/10 p-2 text-[10.5px] text-tinta-2">
                <span className="font-bold text-vermelho">{nosVencidos.length} nós com âncora vencida</span>: os arquivos de origem foram modificados e a citação exata não foi encontrada.
              </div>
            )}
          </section>

          {/* Frota e Verificadores */}
          <section className="carta p-4">
            <div className="flex items-center justify-between">
              <Cabecalho cor="var(--color-ciano)">4. Verificadores e Especialistas</Cabecalho>
              <span className="rotulo">{falhasLuana.length + falhasRenato.length} checagens</span>
            </div>
            <div className="mt-2 space-y-2.5">
              <div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-tinta">Frota Luana</span>
                  <span className={falhasLuana.length > 0 ? 'text-vermelho font-mono' : 'text-verde font-mono'}>
                    {falhasLuana.length > 0 ? `${falhasLuana.length} reprovadas` : 'todas aprovadas'}
                  </span>
                </div>
                {falhasLuana.length > 0 && (
                  <ul className="mt-1 space-y-1 text-[10px] text-tinta-3 font-mono">
                    {falhasLuana.slice(0, 3).map((f, i) => (
                      <li key={i} className="truncate">• {f.o_que}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-linha/60 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-tinta">Frota Renato</span>
                  <span className={falhasRenato.length > 0 ? 'text-vermelho font-mono' : 'text-verde font-mono'}>
                    {falhasRenato.length > 0 ? `${falhasRenato.length} reprovadas` : 'todas aprovadas'}
                  </span>
                </div>
                {falhasRenato.length > 0 && (
                  <ul className="mt-1 space-y-1 text-[10px] text-tinta-3 font-mono">
                    {falhasRenato.slice(0, 3).map((f, i) => (
                      <li key={i} className="truncate">• {f.o_que}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-linha/60 pt-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-tinta">Agentes Encostados ({agentesEncostados.length})</span>
                  <span className="rotulo text-[10px]">parados</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {agentesEncostados.slice(0, 6).map((ag) => (
                    <Pilula key={ag.id} tom="ambar">{ag.nome}</Pilula>
                  ))}
                  {agentesEncostados.length > 6 && (
                    <span className="text-[10px] text-tinta-3 font-mono">+{agentesEncostados.length - 6} outros</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
