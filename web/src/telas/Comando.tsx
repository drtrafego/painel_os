import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import { Parcial } from '../ui/SemDado'
import { Icone } from '../ui/Icone'
import { VISTAS, type VistaId, type Vista } from '../nav/rotas'
import { dadoDaVista } from '../nav/rotulo'
import { corDaSessao, corDoSquad, corPorIndice, IDENTIDADE } from '../ui/paleta'
import { maisAntiga, reprovadas, situacaoDaDiretiva, type SituacaoDiretiva } from '../dados/estado'
import { horaGastao, horaUtc, proximosDisparos } from '../dados/cron'
import { porModeloGeral } from '../dados/modelos'
import type { Origem } from '../dados/useEstado'
import type { AgenteSessao, Estado } from '../dados/tipos'

/**
 * CENTRO DE COMANDO.
 *
 * A tela mais densa e a mais importante da referencia. Ela e `parcial` aqui, e
 * a ressalva vai no topo colada no conteudo: dos blocos que a referencia
 * mostra, agora há fonte para tarefas, CRM agregado, follow-up, saúde dos
 * verificadores, o que dispara sozinho e de onde vieram as convocações. A
 * A diretiva atual vem de uma fonte canônica mínima e rastreável. O contexto de
 * raciocínio continua sem fonte publicável, pois os transcripts carregam PII.
 *
 * ‼️ Os que nao tem fonte aparecem DECLARADOS no lugar onde estariam, e nao
 * omitidos nem preenchidos com zero. Bloco ausente parece esquecimento; bloco
 * com zero parece medida; bloco declarado e a unica das tres opcoes que diz a
 * verdade.
 */
function ilegivel(s: AgenteSessao): boolean {
  const v = s.verificador
  return v.checagens === null || v.reprovadas === null || v.indeterminadas === null
}

export function Comando({
  estado, agora, medidoEm, origem, aoIr, vista,
}: {
  estado: Estado
  agora: Date
  medidoEm: string
  origem: Origem
  aoIr: (v: VistaId, quem?: string | null) => void
  vista: Vista
}) {
  const lidos = estado.sessao.filter((s) => !ilegivel(s))
  const naoLidos = estado.sessao.filter(ilegivel)
  const checagens = lidos.reduce((n, s) => n + (s.verificador.checagens as number), 0)
  const falhas = reprovadas(estado)
  const antiga = maisAntiga(estado)
  const { disparos, ilegiveis } = proximosDisparos(estado.cron.jobs ?? [], agora, 60)
  const hora = new Date(medidoEm).toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour12: false })
  const aprovacoes = estado.aprovacoes
  const aprovacoesOk = Boolean(aprovacoes && !aprovacoes.erro && typeof aprovacoes.total === 'number')
  const totalPendentes = aprovacoesOk ? (aprovacoes?.itens.filter((i) => i.estado === 'aguardando' || i.estado === 'pendente').length ?? 0) : null
  const pipeline = estado.pipeline
  const pipelineOk = Boolean(pipeline && !pipeline.erro && pipeline.total !== null)
  const followup = estado.followup
  const followupOk = Boolean(followup && followup.status === 'pronto' && followup.envios_registrados_no_log !== null)
  const diretiva = estado.diretiva
  // ‼️ A checagem antiga era `objetivo && prazo`: ela conferia se o campo
  // EXISTIA e nunca o comparava com o relogio. Em 10/09 o cartao mais
  // importante da tela inicial mostrava como ATIVA uma diretiva com prazo
  // 09/09. A comparacao com a data mora agora em `situacaoDaDiretiva`, junto
  // do dado, e nao dentro desta tela: outro leitor herda a regra.
  const situacao = situacaoDaDiretiva(diretiva, agora.getTime())

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela
        titulo="Centro de operações."
        pergunta={vista.pergunta}
        direita={
          <span className={`rotulo ${origem === 'calculado-agora' ? '!text-verde' : '!text-ambar'}`}>
            {origem === 'calculado-agora'
              ? 'calculado ao abrir'
              : origem === 'coleta-em-andamento'
                ? 'coleta em andamento · snapshot'
                : 'números do arquivo'} · {hora} utc
          </span>
        }
      />
      <Parcial dado={vista.dado} />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          rotulo="checagens reprovadas"
          valor={naoLidos.length === estado.sessao.length ? null : falhas.length}
          cor={falhas.length ? 'text-ambar' : 'text-tinta'}
          nota={
            naoLidos.length
              ? `sem o verificador de ${naoLidos.map((s) => s.nome).join(' e ')}`
              : `de ${checagens} nos dois verificadores`
          }
        />
        <Kpi
          rotulo="dispara sozinho nesta hora"
          valor={disparos.length}
          nota={
            (disparos.length
              ? `o primeiro às ${horaGastao(disparos[0].primeiro)} (${horaUtc(disparos[0].primeiro)} utc)`
              : 'nada na próxima hora') +
            (ilegiveis.length ? ` · ${ilegiveis.length} expressão(ões) que não consegui ler` : '')
          }
        />
        <Kpi
          rotulo="aprovações pendentes"
          valor={aprovacoesOk ? totalPendentes : null}
          nota={aprovacoesOk ? `${totalPendentes} aguardando decisão humana` : (aprovacoes?.erro ?? 'fila de aprovações')}
        />
        <Kpi
          rotulo="convocações medidas"
          valor={estado.resumo.convocacoes_total}
          nota={estado.resumo.convocacoes_por_motor
            ? `${estado.resumo.convocacoes_por_motor.codex} Codex · ${estado.resumo.convocacoes_por_motor.claude} Claude legado`
            : 'contador vivo: sobe enquanto a operação roda'}
        />
        <Kpi
          rotulo="registros no CRM"
          valor={pipelineOk ? pipeline?.total : null}
          nota={pipelineOk ? `agregado de ${pipeline?.organizacoes} organizações isoladas` : (pipeline?.erro ?? 'fonte ainda não veio no estado')}
        />
        <Kpi
          rotulo="follow-ups enviados"
          valor={followupOk ? followup?.envios_registrados_no_log : null}
          nota={followupOk ? `${followup?.contatos_no_estado} contatos no estado do motor · envio registrado, não resposta` : (followup?.erro ?? 'fonte ainda não veio no estado')}
        />
      </div>

      <Cobertura estado={estado} aprovacoesOk={aprovacoesOk} totalPendentes={totalPendentes} pipelineOk={pipelineOk} followupOk={followupOk} />

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Saude estado={estado} antiga={antiga} aoIr={aoIr} />
        {situacao.estado === 'sem-fonte'
          ? <SemFonteGrande titulo="diretiva atual" oQue="a frase que orienta o dia, assinada e com hora" falta={situacao.porque} />
          : <Diretiva diretiva={diretiva} situacao={situacao} />}
        <SemFonteGrande
          titulo="contexto de raciocínio"
          oQue="o que a operação está pensando agora, ao vivo"
          falta="isso existiria lendo os transcripts em tempo real, e eles têm conversa de cliente com nome e telefone dentro: é dado que não pode ir para tela"
        />
      </div>

      <DeOndeVieram estado={estado} />
      <PorModelo estado={estado} />

      <section className="mt-3">
        <Cabecalho cor="var(--color-lima)" meta={`${VISTAS.length} telas`}>
          para onde ir
        </Cabecalho>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {VISTAS.filter((v) => v.id !== 'comando').map((v) => {
            // ‼️ Ate 10/09 esta linha lia `v.dado.tipo`, digitado a mao em
            // `rotas.ts`. O campo tinha vencido e o cartao escrevia "sem dado
            // ainda" sobre Cobrancas, Ferramentas e Cofre, as tres com numero
            // medido do outro lado do clique. Agora sai do estado.
            const tipo = dadoDaVista(v, estado).tipo
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => aoIr(v.id)}
                data-vista-atalho={v.id}
                data-vista-dado={tipo}
                className="carta group flex items-center gap-2.5 p-3 text-left transition-colors hover:border-linha-forte"
              >
                <span className="shrink-0 text-tinta-3 group-hover:text-lima">
                  <Icone nome={v.icone} tamanho={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-tinta">{v.nome}</span>
                  <span className="rotulo mt-0.5 block truncate">
                    {tipo === 'medido' ? 'com dado' : tipo === 'parcial' ? 'parcial' : 'sem dado ainda'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function Cobertura({ estado, aprovacoesOk, totalPendentes, pipelineOk, followupOk }: { estado: Estado; aprovacoesOk: boolean; totalPendentes: number | null; pipelineOk: boolean; followupOk: boolean }) {
  const fontes = [
    ['aprovações', aprovacoesOk, aprovacoesOk ? `${totalPendentes} aguardando decisão humana` : (estado.aprovacoes?.erro ?? 'não medida')],
    ['CRM agregado', pipelineOk, pipelineOk ? `${estado.pipeline?.total} registros em ${estado.pipeline?.organizacoes} organizações isoladas` : (estado.pipeline?.erro ?? 'não medido')],
    ['follow-up', followupOk, followupOk ? `${estado.followup?.envios_registrados_no_log} envios registrados no log` : (estado.followup?.erro ?? 'não medido')],
    ['verificadores', estado.sessao.some((s) => !ilegivel(s)), `${estado.sessao.filter((s) => !ilegivel(s)).length} de ${estado.sessao.length} lidos`],
    ['cron', estado.cron.total !== null, estado.cron.total === null ? 'não lido' : `${estado.cron.total} linhas ativas`],
    ['convocações', estado.convocacoes_erro == null, estado.convocacoes_erro ?? `${estado.resumo.convocacoes_total} medidas`],
  ] as const
  const ausentes = ['qualificação individual', 'resultado de chamadas', 'comparecimento a reuniões']
  return <section className="carta mt-3 p-4" data-cobertura-comando>
    <Cabecalho cor="var(--color-ciano)" meta={`${fontes.filter(([, ok]) => ok).length} de ${fontes.length} fontes operacionais`}>cobertura deste resumo</Cabecalho>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{fontes.map(([nome, ok, detalhe]) => <div key={nome} data-fonte-centro={nome} className="rounded-lg border border-linha bg-white/[0.018] p-3"><Pilula tom={ok ? 'verde' : 'ambar'}>{ok ? 'lida' : 'indisponível'}</Pilula><span className="mt-2 block text-[12px] text-tinta">{nome}</span><span className="mt-1 block text-[10.5px] leading-snug text-tinta-3">{detalhe}</span></div>)}</div>
    <div className="mt-3 border-t border-linha pt-3"><span className="rotulo !text-ambar">fora da cobertura, não é zero</span><p className="mt-1.5 text-[11.5px] leading-relaxed text-tinta-2">{ausentes.join(' · ')}</p></div>
  </section>
}

function Saude({
  estado, antiga, aoIr,
}: {
  estado: Estado
  antiga: ReturnType<typeof maisAntiga>
  aoIr: (v: VistaId, quem?: string | null) => void
}) {
  return (
    <section className="carta p-4">
      <Cabecalho cor="var(--color-verde)" meta="lido, não rodado">
        saúde do sistema
      </Cabecalho>
      <div className="space-y-2.5">
        {estado.sessao.map((s) => {
          const v = s.verificador
          const ok = v.reprovadas === 0 && v.vencido === false && v.indeterminadas === 0
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => aoIr('diretores', s.id)}
              className="flex w-full items-center gap-2 text-left"
            >
              <span
                className="h-2.5 w-[2px] shrink-0 rounded-full"
                style={{ background: corDaSessao(s.id) }}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-tinta-2">{s.nome}</span>
              <Pilula tom={v.checagens === null ? 'neutro' : ok ? 'verde' : 'ambar'}>
                {v.vencido
                  ? 'rodada vencida'
                  : v.checagens === null
                    ? 'ilegível'
                    : ok
                      ? `${v.checagens} no verde`
                      : `${v.reprovadas ?? '—'} reprovadas`}
              </Pilula>
            </button>
          )
        })}
      </div>
      {antiga && (
        <p className="mt-3 border-t border-linha pt-2.5 text-[11.5px] leading-[1.5] text-tinta-2">
          <span className="rotulo !text-ambar">aberta há mais tempo</span>
          <span className="mt-1 block">
            {antiga.falha.o_que} · {antiga.dias.toLocaleString('pt-BR')} dia(s) reprovando.
          </span>
        </p>
      )}
    </section>
  )
}

/**
 * DE ONDE VIERAM AS CONVOCACOES.
 *
 * A barra empilhada da referencia, com o dado que temos: por esquadrao, mais a
 * faixa de quem nao tem cargo. Ela e a unica das duas metades da pergunta do
 * dono que cabe num numero; a outra metade e a ligacao, e essa mora no grafo
 * da tela de diretores.
 */
function DeOndeVieram({ estado }: { estado: Estado }) {
  const porSquad = (Object.keys(estado.squads) as (keyof typeof estado.squads)[]).map((id) => ({
    id: String(id),
    nome: estado.squads[id].nome,
    cor: corDoSquad(String(id)),
    total: estado.agentes
      .filter((a) => a.squad === id)
      .reduce((n, a) => n + (a.convocacoes ?? 0), 0),
  }))
  const semCargo = Object.entries(estado.convocacoes_fora_da_casa).reduce((n, [, v]) => n + v, 0)
  const faixas = [
    ...porSquad,
    { id: 'sem-cargo', nome: 'Sem cargo', cor: IDENTIDADE.pervinca, total: semCargo },
  ].filter((f) => f.total > 0)
  const total = faixas.reduce((n, f) => n + f.total, 0)

  return (
    <section className="carta mt-3 p-4">
      <Cabecalho cor="var(--color-lima)" meta="contado por id de chamada">
        de onde vieram as {total.toLocaleString('pt-BR')} convocações
      </Cabecalho>

      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {faixas.map((f) => (
          <span
            key={f.id}
            style={{ width: `${(f.total / Math.max(total, 1)) * 100}%`, background: f.cor }}
            title={`${f.nome}: ${f.total}`}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {faixas.map((f) => (
          <div key={f.id} className="flex items-start gap-2">
            <span className="mt-0.5 h-7 w-[2px] shrink-0 rounded-full" style={{ background: f.cor }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-tinta-2">{f.nome}</span>
              <span className="rotulo mt-0.5 block">
                {((f.total / Math.max(total, 1)) * 100).toFixed(0)}% do total
              </span>
            </span>
            <span className="font-serif text-[21px] leading-none" style={{ color: f.cor }}>
              {f.total.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        “Sem cargo” reúne os auxiliares embutidos do Claude e os agentes temporários do Codex que não
        correspondem a uma especialidade permanente da casa. Os apelidos do Codex são preservados,
        mas briefing e conversa não atravessam para esta tela. A separação evita atribuir atividade
        recente a um cargo que existe apenas como especificação.
      </p>
    </section>
  )
}

/**
 * MODELOS DE IA EM USO.
 *
 * O mesmo padrao de barra empilhada de `DeOndeVieram`, agora por MODELO
 * especifico (sonnet-5, opus-5, haiku-4-5...), medido no `resolvedModel` de
 * cada chamada de subagente Claude (ver `porModelo` em `dados/modelos.ts`).
 *
 * ‼️ NAO MOSTRA CUSTO. Nao existe preco por token confiavel neste dado, e
 * numero de custo inventado e pior que numero ausente: parece medido e nao
 * e. O que se mede aqui e FREQUENCIA, e o rotulo diz isso explicitamente, em
 * vez de deixar a ausencia de custo parecer esquecimento.
 *
 * E' exclusivo do motor Claude: o Codex nao expoe este campo no rollout, e a
 * secao diz isso, em vez de deixar o Codex sumir sem explicacao.
 */
function PorModelo({ estado }: { estado: Estado }) {
  const usos = porModeloGeral(estado)
  if (usos.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-linha-forte mt-3 p-4">
        <Cabecalho meta="sem fonte">modelos de IA em uso</Cabecalho>
        <p className="text-[12px] leading-[1.6] text-tinta-2">
          Aqui ficaria o modelo especifico (sonnet, opus, haiku...) por trás de cada convocação.
          Não tem dado ainda: nenhuma chamada medida trouxe o modelo resolvido no resultado.
        </p>
      </section>
    )
  }

  const medido = usos.reduce((n, u) => n + u.total, 0)
  const totalClaude = estado.resumo.convocacoes_por_motor?.claude ?? null
  const piso = totalClaude !== null && medido < totalClaude

  return (
    <section className="carta mt-3 p-4">
      <Cabecalho cor="var(--color-ciano)" meta="resolvedModel, por id de chamada">
        modelos de IA em uso
      </Cabecalho>

      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {usos.map((u, i) => (
          <span
            key={u.modelo}
            style={{ width: `${u.percentual}%`, background: corPorIndice(i) }}
            title={`${u.modelo}: ${u.total} (${u.percentual}%)`}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {usos.map((u, i) => (
          <div key={u.modelo} className="flex items-start gap-2">
            <span className="mt-0.5 h-7 w-[2px] shrink-0 rounded-full" style={{ background: corPorIndice(i) }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] text-tinta-2">{u.modelo}</span>
              <span className="rotulo mt-0.5 block">{u.percentual}% do medido</span>
            </span>
            <span className="font-serif text-[21px] leading-none" style={{ color: corPorIndice(i) }}>
              {u.total.toLocaleString('pt-BR')}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        Custo não calculado: não existe preço por token confiável para este dado, e número
        inventado é pior que número ausente. Só o motor Claude expõe QUAL modelo específico
        rodou; o Codex entra como uma categoria só ("codex, motor inteiro"), sem discriminar
        modelo interno, porque ele não manda esse dado.{' '}
        {piso && (
          <>
            É PISO: {medido.toLocaleString('pt-BR')} de {totalClaude?.toLocaleString('pt-BR')} convocações
            Claude já têm o modelo medido; o resto ainda não trouxe resultado ou não foi lido.
          </>
        )}
      </p>
    </section>
  )
}

/**
 * O CARTAO DA DIRETIVA, que agora sabe a data.
 *
 * ‼️ QUANDO ELA VENCE, O CARTAO INTEIRO MUDA, e nao so uma palavra pequena no
 * canto. A regra desta casa e que numero certo em lugar errado e lido errado:
 * o painel ja mostrava o prazo 09/09 no dia 10, em cinza, ao lado da palavra
 * "ativa" no cabecalho, e quem batia o olho lia ATIVA. Vencida vira ambar, o
 * cabecalho diz ha quantos dias, e a frase escreve que ninguem substituiu.
 */
function Diretiva({
  diretiva, situacao,
}: {
  diretiva: Estado['diretiva']
  situacao: Exclude<SituacaoDiretiva, { estado: 'sem-fonte' }>
}) {
  const vencida = situacao.estado === 'vencida'
  const meta =
    situacao.estado === 'vencida'
      ? `vencida há ${situacao.diasVencida} ${situacao.diasVencida === 1 ? 'dia' : 'dias'}`
      : situacao.estado === 'encerrada'
        ? situacao.rotulo
        : situacao.diasAteVencer === 0
          ? 'ativa · vence hoje'
          : `ativa · ${situacao.diasAteVencer} ${situacao.diasAteVencer === 1 ? 'dia' : 'dias'}`
  return (
    <section
      className={'carta p-4' + (vencida ? ' !border-ambar/35 !bg-ambar/6' : '')}
      data-diretiva={situacao.estado}
    >
      <Cabecalho cor={vencida ? 'var(--color-ambar)' : 'var(--color-lima)'} meta={meta}>
        diretiva atual
      </Cabecalho>
      <p className={'text-[14px] leading-relaxed ' + (vencida ? 'text-tinta-2' : 'text-tinta')}>
        {diretiva?.objetivo}
      </p>
      {vencida && (
        <p className="mt-2.5 text-[12px] leading-[1.55] text-ambar">
          O prazo desta diretiva passou e ninguém escreveu outra no lugar. Ela continua sendo a
          última que existe, e por isso segue aqui, mas não descreve o dia de hoje.
        </p>
      )}
      <div className="mt-3 border-t border-linha pt-3 text-[11px] text-tinta-3">
        <span className={'rotulo' + (vencida ? ' !text-ambar' : '')}>prazo</span>
        <span className={'ml-2 ' + (vencida ? 'text-ambar' : 'text-tinta-2')}>{diretiva?.prazo}</span>
        <span className="mx-2">·</span>
        <span>origem {diretiva?.origem?.canal} #{diretiva?.origem?.mensagem_id}</span>
      </div>
    </section>
  )
}

function SemFonteGrande({ titulo, oQue, falta }: { titulo: string; oQue: string; falta: string }) {
  return (
    <section className="rounded-xl border border-dashed border-linha-forte p-4">
      <Cabecalho meta="sem fonte">{titulo}</Cabecalho>
      <p className="text-[12px] leading-[1.6] text-tinta-2">
        Aqui ficaria {oQue}. Não tem dado ainda, e por isso não tem número nem frase de mentira no
        lugar: {falta}.
      </p>
    </section>
  )
}
