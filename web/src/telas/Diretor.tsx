import { Icone, type NomeIcone } from '../ui/Icone'
import { Barra, Cabecalho, Numero, Pilula, TEXTO_DO_TOM, TituloDaTela, type Tom } from '../ui/primitivos'
import { descreverServico, lerMotores, nomeMotor } from '../dados/motores'
import { corDaSessao, corDoSquad } from '../ui/paleta'
import { acharAgente, acharSessao, atividade, convocadores, convocados, diasParado } from '../dados/estado'
import { useAgentesVivos } from '../dados/useAgentesVivos'
import type { VistaId, Vista } from '../nav/rotas'
import type { Agente, AgenteSessao, Estado, Sop } from '../dados/tipos'

function sopsLigados(estado: Estado, agenteId: string): Sop[] {
  const dados = estado.sops
  if (!dados || dados.status !== 'pronto' || !Array.isArray(dados.itens)) return []
  return dados.itens.filter((sop) => sop.agentes.includes(agenteId))
}

const ICONE_POR_ID: Record<string, NomeIcone> = {
  ceo: 'coroa', dev: 'codigo', qa: 'escudo', copy: 'texto', designer: 'pincel',
  analista: 'grafico', social: 'megafone', gestor: 'megafone', arquiteto: 'comando',
  deployer: 'seta', closer: 'pipeline', frank: 'grafico', lex: 'escudo', lara: 'bot',
  lp: 'pincel', paulo: 'pipeline', 'video-editor': 'pincel', 'video-validator': 'escudo',
  'vega-radar': 'radar', 'suri-estrategista': 'comando', 'theo-criador': 'texto',
  'cleo-produtor': 'texto', 'dani-designer': 'pincel', guardiao: 'escudo', maestro: 'coroa',
  'cont-radar': 'radar', 'cont-estrategista': 'comando', 'cont-copy': 'texto',
  'cont-designer': 'pincel', 'cont-qa': 'escudo', 'cont-corretor': 'escudo',
  luana: 'coroa', renato: 'bot',
}

const TOM_ATIVIDADE: Record<string, Tom> = {
  hoje: 'verde', semana: 'lima', parado: 'ambar', nunca: 'neutro',
}

/**
 * A DECIMA PRIMEIRA VISTA: O DETALHE DE UM DIRETOR.
 *
 * ‼️ E UM COMPONENTE COM PROPS, NAO UMA TELA POR CARGO. A espec visual mediu
 * quatro dos seis detalhes na referencia e achou template IDENTICO, trocando
 * so cor, icone e conteudo. Isso e o mesmo principio do arquivo de estado:
 * acrescentar um diretor e acrescentar uma entrada, nao refazer a tela. Aqui
 * ele vale duas vezes, porque a mesma tela desenha os 31 especialistas E os 2
 * agentes de sessao, que sao coisas diferentes com campos diferentes.
 *
 * O QUE E MEDIDO E O QUE NAO E, e isto vai NA TELA e nao aqui no comentario:
 * cabeçalho, ferramentas e ligações saem do disco. A atividade vem das
 * convocações e retornos registrados; a fila de tarefas só entra agregada,
 * pois a API não oferece responsável. Isso nunca vira carga atual por agente.
 */
export function Diretor({
  estado, agora, quem, aoIr, vista, compacto = false,
}: {
  estado: Estado
  agora: Date
  quem: string
  aoIr: (v: VistaId, quem?: string | null) => void
  vista: Vista
  compacto?: boolean
}) {
  const agente = acharAgente(estado, quem)
  const sessao = agente ? null : acharSessao(estado, quem)

  if (!agente && !sessao) {
    return (
      <div className={`mx-auto max-w-2xl px-4 py-8 sm:px-6 ${compacto ? 'min-h-full' : ''}`}>
        <TituloDaTela titulo="Esse diretor não existe." pergunta={vista.pergunta} />
        <p className="carta p-4 text-[12.5px] leading-[1.6] text-tinta-2">
          Não há nenhum agente com o identificador{' '}
          <span className="font-mono text-tinta">{quem}</span> no estado que foi medido. Isso
          costuma ser endereço digitado à mão ou link de um estado antigo, e não defeito.
        </p>
        <button
          type="button"
          onClick={() => aoIr('diretores')}
          className="rotulo mt-4 transition-colors hover:!text-lima"
        >
          ← voltar para a rede
        </button>
      </div>
    )
  }

  const cor = agente ? corDoSquad(agente.squad) : corDaSessao(sessao!.id)
  const saem = convocados(estado, quem)
  const chegam = convocadores(estado, quem)
  const sops = sopsLigados(estado, quem)
  const { dados: aoVivo } = useAgentesVivos()
  const aoVivoItem = aoVivo?.agentes?.find((a) => a.id === quem || a.id.includes(quem))

  return (
    <div className={`${compacto ? 'max-w-none px-5 py-5' : 'w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10'}`}>
      <button
        type="button"
        onClick={() => aoIr('diretores')}
        className="rotulo mb-4 inline-flex items-center gap-1.5 transition-colors hover:!text-lima"
      >
        ← voltar para a rede
      </button>

      {agente ? (
        <CabecalhoAgente agente={agente} cor={cor} agora={agora} />
      ) : (
        <CabecalhoSessao sessao={sessao!} cor={cor} />
      )}

      {aoVivoItem && (
        <section className="mt-3 rounded-xl border border-verde/35 bg-verde/8 p-4" data-agente-ao-vivo>
          <div className="flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-verde" />
            <span className="rotulo !text-verde">agente em execução ao vivo</span>
            <span className="ml-auto font-mono text-[10px] text-tinta-3">fase: {aoVivoItem.fase} · silêncio: {aoVivoItem.silencio_s}s</span>
          </div>
          <p className="mt-2 font-mono text-[12.5px] leading-relaxed text-tinta">{aoVivoItem.etapa}</p>
        </section>
      )}

      <div className={`mt-3 grid gap-3 ${compacto ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
        <div className="space-y-3">
          <section className="carta p-4">
            <Cabecalho cor={cor} meta={agente ? 'do frontmatter' : 'do coletor'}>
              o que ele faz
            </Cabecalho>
            <p className="text-[12.5px] leading-[1.65] text-tinta-2">
              {agente?.descricao ?? sessao!.resumo}
            </p>
          </section>

          <section className="carta p-4">
            <Cabecalho cor={cor} meta={ferramentasDe(agente)?.length ?? '—'}>
              ferramentas habilitadas
            </Cabecalho>
            {agente === null ? (
              <p className="text-[12px] leading-[1.55] text-tinta-3">
                Agente de sessão não declara ferramenta em arquivo: ele tem as da própria sessão.
                Não há o que medir aqui, e um “todas” escrito à mão seria chute.
              </p>
            ) : agente.ferramentas === null ? (
              <p className="text-[12px] leading-[1.55] text-tinta-3">
                O arquivo dele não declara <span className="font-mono">tools:</span>. Isso é
                ausência de informação, não “todas” nem uma lista vazia; o painel não atribui uma
                capacidade que a fonte não declarou.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {agente.ferramentas.map((f) => (
                  <li
                    key={f}
                    className="rounded border border-linha bg-white/3 px-1.5 py-1 font-mono text-[10px] text-tinta-2"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {agente && <ContratoOperacional sops={sops} estado={estado} cor={cor} aoIr={aoIr} />}

          <CargaETarefas agente={agente} estado={estado} cor={cor} />
        </div>

        <div className="space-y-3">
          <section className="carta p-4">
            <Cabecalho cor={cor} meta={`${saem.length + chegam.length} ligações`}>
              conexões
            </Cabecalho>
            <Lado titulo="ele convoca" lista={saem} campo="para" cor={cor} aoIr={aoIr} estado={estado} />
            <Lado titulo="convocam ele" lista={chegam} campo="de" cor={cor} aoIr={aoIr} estado={estado} />
            <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
              Contado por id de chamada nos transcripts, inclusive nos de subagente. ‼️ Diz quem
              chamou quem e quantas vezes, e nada mais: a descrição que o chamador escreve não
              descreve o assunto de verdade, então não existe aqui rótulo de intenção.
            </p>
          </section>

          {agente && (
            <section className="carta p-4">
              <Cabecalho cor={cor} meta={`${agente.linhas.toLocaleString('pt-BR')} linhas`}>
                o arquivo dele
              </Cabecalho>
              <p className="font-mono text-[10.5px] leading-relaxed break-all text-tinta-2">
                {agente.arquivo}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-linha pt-3">
                <Numero rotulo="linhas" valor={agente.linhas} tamanho="text-[21px]" cor="text-tinta-2" />
                <Numero rotulo="bytes" valor={agente.bytes} tamanho="text-[21px]" cor="text-tinta-2" />
                <Numero
                  rotulo="modificado"
                  valor={new Date(agente.modificado).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                  tamanho="text-[17px]"
                  cor="text-tinta-2"
                />
              </div>
            </section>
          )}

          <Registros agente={agente} sessao={sessao} cor={cor} />
        </div>
      </div>
    </div>
  )
}

function ListaContrato({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="rounded-lg border border-linha bg-black/10 p-3">
      <span className="rotulo">{titulo}</span>
      {itens.length ? (
        <ul className="mt-2 space-y-1.5">
          {itens.map((item) => (
            <li key={item} className="flex gap-2 text-[11px] leading-snug text-tinta-2">
              <span className="mt-[6px] size-1 shrink-0 rounded-full bg-tinta-3" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[10.5px] leading-relaxed text-tinta-3">Não declarado na fonte.</p>
      )}
    </div>
  )
}

function ContratoOperacional({
  sops, estado, cor, aoIr,
}: {
  sops: Sop[]
  estado: Estado
  cor: string
  aoIr: (v: VistaId, quem?: string | null) => void
}) {
  return (
    <section className="carta overflow-hidden" data-contrato-operacional>
      <div className="border-b border-linha p-4">
        <Cabecalho cor={cor} meta={`${sops.length} ${sops.length === 1 ? 'SOP ligado' : 'SOPs ligados'}`}>
          contrato operacional
        </Cabecalho>
        <p className="text-[11.5px] leading-relaxed text-tinta-2">
          O SOP define quando esta função entra, de que precisa e o que deve entregar. Campos ausentes continuam visíveis como não declarados.
        </p>
      </div>
      {sops.length === 0 ? (
        <div className="p-4">
          <p className="text-[11.5px] leading-relaxed text-tinta-3">
            A fonte confirma o cargo e suas ferramentas, mas nenhum SOP medido aponta para este agente. A ficha não transforma a descrição do cargo em processo.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-linha">
          {sops.map((sop, indice) => (
            <article key={sop.id} className="p-4" data-sop-detalhe={sop.id}>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start">
                <div className="flex min-w-0 items-start gap-2.5 sm:flex-1">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border font-mono text-[9px]" style={{ color: cor, borderColor: `color-mix(in oklab, ${cor} 35%, var(--color-linha))` }}>
                    {String(indice + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1" data-sop-texto>
                    <h3 className="text-[14px] leading-tight text-tinta">{sop.nome}</h3>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-tinta-3">{sop.objetivo}</p>
                  </div>
                </div>
                <div className="ml-[38px] flex flex-wrap gap-1.5 sm:ml-0 sm:shrink-0">
                  <Pilula tom="verde">{sop.agentes.length ? `${sop.agentes.length} agentes` : 'sem agente ligado'}</Pilula>
                  {/Gastão|confirmação|ordem explícita/i.test(sop.autonomia) && <Pilula tom="ambar">humano decide</Pilula>}
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-linha bg-white/2 px-3 py-2.5">
                <span className="rotulo">fronteira de autonomia</span>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-tinta-2">{sop.autonomia}</p>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ListaContrato titulo="entrada" itens={sop.entradas} />
                <ListaContrato titulo="saída" itens={sop.saidas} />
              </div>

              <div className="mt-3 grid gap-3 border-t border-linha pt-3 sm:grid-cols-2">
                <div>
                  <span className="rotulo">disparo</span>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-tinta-2">{sop.gatilho || 'Não declarado na fonte.'}</p>
                  {sop.frequencia && <p className="mt-1 font-mono text-[9px] text-tinta-3">frequência: {sop.frequencia}</p>}
                </div>
                <div>
                  <span className="rotulo">responsáveis ligados</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sop.agentes.map((id) => {
                      const existe = estado.agentes.some((a) => a.id === id)
                      return existe ? (
                        <button key={id} type="button" onClick={() => aoIr('diretores', id)} className="rounded border border-linha bg-white/3 px-2 py-1 font-mono text-[9px] text-tinta-2 transition-colors hover:border-lima/40 hover:text-lima">
                          {estado.agentes.find((a) => a.id === id)?.nome ?? id}
                        </button>
                      ) : <span key={id} className="rounded border border-linha px-2 py-1 font-mono text-[9px] text-tinta-3">{id}</span>
                    })}
                    {!sop.agentes.length && <span className="text-[10.5px] text-tinta-3">Nenhum agente declarado.</span>}
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <span className="rotulo">ferramentas do fluxo</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sop.ferramentas.map((ferramenta) => (
                    <span key={ferramenta} className="rounded border border-linha bg-white/3 px-1.5 py-1 font-mono text-[9px] text-tinta-3">{ferramenta}</span>
                  ))}
                  {!sop.ferramentas.length && <span className="text-[10.5px] text-tinta-3">Não declaradas neste SOP.</span>}
                </div>
              </div>

              <p className="mt-3 border-t border-linha pt-2 font-mono text-[8.5px] leading-relaxed text-tinta-3">
                {sop.fontes.length ? `${sop.fontes.length} ${sop.fontes.length === 1 ? 'fonte rastreável' : 'fontes rastreáveis'}` : 'sem fonte rastreável'} · responsável: {sop.responsavel}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function ferramentasDe(a: Agente | null) {
  return a?.ferramentas ?? null
}

function CabecalhoAgente({ agente, cor, agora }: { agente: Agente; cor: string; agora: Date }) {
  const at = atividade(agente, agora.getTime())
  return (
    <section
      className="rounded-xl border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${cor} 22%, var(--color-linha))`,
        background: `linear-gradient(150deg, color-mix(in oklab, ${cor} 7%, transparent), transparent 58%), var(--color-carta-alta)`,
      }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-lg border"
          style={{
            color: cor,
            borderColor: `color-mix(in oklab, ${cor} 30%, transparent)`,
            background: `color-mix(in oklab, ${cor} 12%, transparent)`,
          }}
        >
          <Icone nome={ICONE_POR_ID[agente.id] ?? 'bot'} tamanho={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="titulo-pagina">{agente.nome}.</h1>
          <span className="mt-1 block font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: cor }}>
            {agente.squad}
          </span>
        </div>
        <Pilula tom={TOM_ATIVIDADE[at.nivel]}>{at.texto}</Pilula>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5 border-t border-linha pt-3.5 sm:grid-cols-4">
        <Numero rotulo="convocações" valor={agente.convocacoes} tamanho="text-[27px]" />
        <Numero rotulo="parado (dias)" valor={diasParado(agente, agora.getTime())} tamanho="text-[27px]" cor="text-tinta-2" />
        <Numero rotulo="origem" valor={agente.origem} tamanho="text-[13px]" cor="text-tinta-2" />
        <Numero rotulo="modelo" valor={agente.modelo} tamanho="text-[15px]" cor="text-tinta-2" />
      </div>
    </section>
  )
}

function CabecalhoSessao({ sessao, cor }: { sessao: AgenteSessao; cor: string }) {
  const v = sessao.verificador
  const motor = lerMotores(sessao.motores)
  const verdes =
    v.checagens !== null && v.reprovadas !== null && v.indeterminadas !== null
      ? v.checagens - v.reprovadas - v.indeterminadas
      : null
  return (
    <section
      className="rounded-xl border p-4"
      style={{
        borderColor: `color-mix(in oklab, ${cor} 22%, var(--color-linha))`,
        background: `linear-gradient(150deg, color-mix(in oklab, ${cor} 7%, transparent), transparent 58%), var(--color-carta-alta)`,
      }}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-lg border"
          style={{
            color: cor,
            borderColor: `color-mix(in oklab, ${cor} 30%, transparent)`,
            background: `color-mix(in oklab, ${cor} 12%, transparent)`,
          }}
        >
          <Icone nome={ICONE_POR_ID[sessao.id] ?? 'bot'} tamanho={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="titulo-pagina">{sessao.nome}.</h1>
          <span className="mt-1 block font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: cor }}>
            {sessao.papel} · {sessao.camada}
          </span>
        </div>
        <Pilula tom={motor.tom}>{motor.rotulo}</Pilula>
      </div>

      {/*
        A LISTA INTEIRA DOS SERVICES DO AGENTE.
        O Gastao mantem mais de um por agente e troca qual sobe para trocar o
        motor, entao a pergunta dele nao e "esta ativo?", e "qual esta no ar e
        por qual motor?". A pilula acima responde o resumo; esta lista mostra
        cada service medido, inclusive os parados, para ele ver a alternativa
        que existe. Dois no ar ao mesmo tempo aparece em vermelho: e defeito.
      */}
      <div className="mt-3 border-t border-linha pt-3">
        <div className="flex items-baseline gap-2">
          <span className="rotulo">services</span>
          <span className="rotulo text-tinta-3">{motor.detalhe}</span>
        </div>
        <ul className="mt-2 space-y-1">
          {(sessao.motores?.servicos ?? []).map((s) => (
            <li key={s.service} className="flex items-baseline gap-2 text-[11px]">
              <span className={s.ativo ? TEXTO_DO_TOM[motor.tom] : 'text-tinta-3'}>
                {s.ativo ? '●' : '○'}
              </span>
              <span className={s.ativo ? 'text-tinta' : 'text-tinta-3'}>{s.service}</span>
              <span className="rotulo">{descreverServico(s)}</span>
              <span className="rotulo ml-auto truncate" title={s.motor_fonte}>
                {nomeMotor(s.motor)}
              </span>
            </li>
          ))}
          {!sessao.motores && (
            <li className="rotulo">estado não medido neste snapshot</li>
          )}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3.5 border-t border-linha pt-3.5 sm:grid-cols-4">
        <Numero rotulo="checagens" valor={v.checagens} tamanho="text-[27px]" />
        <Numero rotulo="reprovadas" valor={v.reprovadas} tamanho="text-[27px]" cor={v.reprovadas ? 'text-ambar' : 'text-tinta'} />
        <Numero rotulo="indeterminadas" valor={v.indeterminadas} tamanho="text-[27px]" cor={v.indeterminadas ? 'text-ambar' : 'text-tinta'} />
        <Numero rotulo="memória (linhas)" valor={sessao.memoria.linhas} tamanho="text-[27px]" cor="text-tinta-2" />
      </div>
      <div className="mt-3">
        <Barra fracao={verdes !== null && v.checagens ? verdes / v.checagens : null} cor={cor} />
      </div>
    </section>
  )
}

function Lado({
  titulo, lista, campo, cor, aoIr, estado,
}: {
  titulo: string
  lista: { de: string; para: string; vezes: number }[]
  campo: 'de' | 'para'
  cor: string
  aoIr: (v: VistaId, quem?: string | null) => void
  estado: Estado
}) {
  const teto = Math.max(...lista.map((l) => l.vezes), 1)
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="rotulo">{titulo}</span>
        <span className="h-px flex-1 bg-linha" />
        <span className="rotulo">{lista.length}</span>
      </div>
      {lista.length === 0 ? (
        <p className="text-[11.5px] leading-snug text-tinta-3">
          Nenhuma ligação registrada nesse sentido. Isso é o que os transcripts têm, e não um juízo
          sobre com quem ele deveria trabalhar.
        </p>
      ) : (
        <ul className="space-y-[5px]">
          {lista.slice(0, 10).map((l) => {
            const outro = l[campo]
            const clicavel = estado.agentes.some((a) => a.id === outro)
            return (
              <li key={l.de + l.para} className="flex items-center gap-2">
                {clicavel ? (
                  <button
                    type="button"
                    onClick={() => aoIr('diretores', outro)}
                    className="min-w-0 flex-1 truncate text-left text-[11.5px] text-tinta-2 transition-colors hover:text-tinta"
                  >
                    {outro}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-tinta-2">{outro}</span>
                )}
                <span className="w-14 shrink-0">
                  <Barra fracao={l.vezes / teto} cor={cor} altura={3} />
                </span>
                <span className="w-7 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-tinta-2">
                  {l.vezes}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CargaETarefas({ agente, estado, cor }: { agente: Agente | null; estado: Estado; cor: string }) {
  const tarefas = estado.tarefas
  const tarefasOk = Boolean(tarefas && !tarefas.erro && tarefas.total_abertas !== null)
  return (
    <section className="carta p-4" data-carga-agente>
      <Cabecalho cor={cor} meta="fontes independentes">atividade e tarefas</Cabecalho>
      <div className="grid grid-cols-3 gap-2">
        <Numero rotulo="convoc. 24h" valor={agente ? agente.convocacoes_24h ?? 0 : null} tamanho="text-[22px]" />
        <Numero rotulo="convoc. 7d" valor={agente ? agente.convocacoes_7d ?? 0 : null} tamanho="text-[22px]" />
        <Numero rotulo="carteira GTD" valor={tarefasOk ? tarefas?.total_abertas : null} tamanho="text-[22px]" cor="text-tinta-2" />
      </div>
      <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        Convocação é chamada registrada em transcript, não tarefa em execução. A API de tarefas mede
        {tarefasOk ? ` ${tarefas?.total_abertas} abertas, ${tarefas?.por_status.doing ?? 0} em andamento e ${tarefas?.por_prazo.sem_prazo ?? 0} sem prazo` : ' a carteira como indisponível'},
        mas não oferece responsável. Por isso nenhuma dessas tarefas foi atribuída a este agente na ficha.
      </p>
    </section>
  )
}

function Registros({ agente, sessao, cor }: { agente: Agente | null; sessao: AgenteSessao | null; cor: string }) {
  if (agente) {
    return (
      <section className="carta p-4" data-registros-agente>
        <Cabecalho cor={cor} meta="fontes disponíveis">memória e saídas</Cabecalho>
        <div className="grid grid-cols-2 gap-2">
          <Numero rotulo="retornos registrados" valor={agente.retornos_registrados ?? 0} tamanho="text-[22px]" />
          <Numero
            rotulo="última convocação"
            valor={agente.ultima_convocacao ? new Date(agente.ultima_convocacao).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null}
            tamanho="text-[16px]"
            cor="text-tinta-2"
          />
        </div>
        <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
          Retorno é o relatório do agente chegando: a notificação de conclusão, ou o resultado do
          agente síncrono. O recibo de lançamento não conta — até 10/09 contava, e por isso este
          número aparecia colado no de convocações. É piso: notificação sem id de chamada fica de
          fora. {agente.convocacoes ? `${agente.convocacoes - (agente.retornos_registrados ?? 0)} convocação(ões) deste cargo não têm relatório registrado.` : ''}
          {' '}Não prova qualidade nem conclusão do trabalho. Especialistas não têm memória
          individual identificável nesta fonte; o arquivo acima é instrução, não memória.
        </p>
      </section>
    )
  }
  return (
    <section className="carta p-4" data-registros-agente>
      <Cabecalho cor={cor} meta="arquivos da sessão">memória e saídas</Cabecalho>
      <div className="grid grid-cols-3 gap-2">
        <Numero rotulo="memória, arquivos" valor={sessao?.memoria.arquivos ?? null} tamanho="text-[22px]" />
        <Numero rotulo="diário, arquivos" valor={sessao?.diario.arquivos ?? null} tamanho="text-[22px]" />
        <Numero rotulo="falhas registradas" valor={sessao?.verificador.falhas.length ?? null} tamanho="text-[22px]" />
      </div>
      <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        Memória e diário são contagens dos arquivos próprios da sessão. Falha é saída do último verificador lido, não tarefa nem produção atribuída.
      </p>
    </section>
  )
}
