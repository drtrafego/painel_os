import { useMemo, useState } from 'react'
import { Cabecalho, Kpi, Pilula, TituloDaTela, type Tom } from '../ui/primitivos'
import { Parcial } from '../ui/SemDado'
import type { PropsTela } from './Vazias'
import type { Peca, Pecas } from '../dados/tipos'
import { apiUrl } from '../dados/api'

/**
 * ESTUDIO DE CONTEUDO — "O que está pronto para sair."
 *
 * A unica tela que o dono citou pelo nome, e a unica do sistema onde a pessoa
 * OLHA a peca e a MANDA embora. Todas as outras mostram numero, estado e texto.
 *
 * MEDIDO NA 2a RODADA DA ESPEC (secoes 1.2 e 4.12 a 4.15), e o que mudou aqui:
 *   grade 5fr 8fr 5fr .......... 26,8 / 44,8 / 26,8, medido em dois dias com
 *                                enquadramentos diferentes, e as duas batem
 *   miniatura 3:5 .............. 27,7x46,0px, proporcao 1:1,66. NAO e 9:16
 *                                (que daria 1:1,78): a diferenca de 3px numa
 *                                miniatura de 46px esta FORA do erro dela. A
 *                                nossa capa e 1080x1920, entao entra com
 *                                `object-fit: cover`, cortando topo e base
 *   sem texto na miniatura ..... sem duracao, sem play, so a capa. E por isso
 *                                que a faixa parece uma parede
 *   anel dourado ............... a miniatura E O SELETOR da tela inteira, nao
 *                                enfeite: medido em movimento, ao trocar de
 *                                miniatura o visor e o titulo de SAIDA trocam
 *   cartoes sem cor propria .... quatro KPI da mesma faixa mediram #232F28,
 *                                #212629 e #1D3C3B: e o gradiente da pagina
 *                                varrendo por baixo de cartoes translucidos
 *   aninhamento ESCURECE ....... o palco do visor e mais escuro que o cartao
 *                                que o contem, ao contrario do resto do sistema
 *
 * ‼️ O KPI E O INDICE DO QUE ESTA NA TELA, nao enfeite: os numeros contam as
 * regioes abaixo deles. Se o KPI disser 122 e a parede mostrar 40, a tela
 * mente. Por isso a parede desenha TODAS, e rola.
 *
 * ‼️ E NAO EXISTE PORCENTAGEM DE ETAPA AQUI. A referencia mostra `subtitulos
 * 72%`, que e progresso dentro de uma etapa. Nos temos `status`, que e estado
 * DISCRETO. Fabricar 72% a partir de "pendente" seria inventar precisao que
 * nenhum arquivo tem, e e o tipo de numero que ninguem mais desconfia depois.
 */

const TOM_STATUS: Record<string, Tom> = {
  postado: 'verde',
  agendado: 'lima',
  pendente: 'ambar',
  publicacao_parcial: 'ambar',
  erro: 'vermelho',
  cancelado: 'neutro',
  arquivado: 'neutro',
}

const EM_PRODUCAO = new Set(['pendente', 'agendado', 'publicacao_parcial', 'erro'])
const DOURADO = 'var(--color-dourado)'

export function Estudio({ estado, vista }: PropsTela) {
  const pecas = estado.pecas
  const [escolhida, setEscolhida] = useState<number | null>(null)

  const prontas = useMemo(
    () => (pecas?.lista ?? []).filter((p) => p.tem_capa && p.capa_url),
    [pecas],
  )
  const naMesa = useMemo(
    () => (pecas?.lista ?? []).filter((p) => EM_PRODUCAO.has(p.status)),
    [pecas],
  )
  const peca = useMemo(
    () => (pecas?.lista ?? []).find((p) => p.n === escolhida) ?? prontas[0] ?? naMesa[0] ?? null,
    [pecas, escolhida, prontas, naMesa],
  )

  if (!pecas || pecas.erro) {
    return (
      <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
        <TituloDaTela titulo="O que está pronto para sair." pergunta={vista.pergunta} />
        <section className="mt-4 max-w-2xl rounded-xl border border-vermelho/35 bg-vermelho/8 p-4">
          <Cabecalho cor="var(--color-vermelho)" meta="não lido">
            não consegui ler as peças
          </Cabecalho>
          <p className="text-[12.5px] leading-[1.6] text-tinta-2">
            Esta tela não vai mostrar zero, porque zero aqui seria mentira: o acervo pode estar
            cheio e eu é que não consegui abrir o arquivo. O motivo exato:
          </p>
          <pre className="mt-2.5 overflow-x-auto rounded-md border border-linha bg-fundo-2/60 p-2.5 font-mono text-[10.5px] whitespace-pre-wrap text-tinta-2">
            {pecas?.erro ?? 'o coletor deste estado é anterior a 08/09 e ainda não media peças'}
          </pre>
        </section>
        <FontesRecebidas fontes={pecas?.fontes_recebidas} />
      </div>
    )
  }

  return (
    <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
      <TituloDaTela
        titulo="O que está pronto para sair."
        pergunta={vista.pergunta}
        direita={
          <span className="rotulo">
            posts.json de{' '}
            {pecas.atualizado_em
              ? new Date(pecas.atualizado_em).toLocaleString('pt-BR', { timeZone: 'UTC', hour12: false }) + ' utc'
              : 'data não lida'}
          </span>
        }
      />
      <Parcial dado={vista.dado} />

      {/* Quatro colunas IGUAIS, e nao uma grade que se adapta ao numero de
          digitos: medido, 4 cartoes de 155px com vao de 7px. */}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi rotulo="na mesa" valor={naMesa.length} nota="é o número exato de itens na coluna A MESA" />
        <Kpi rotulo="prontas" valor={prontas.length} nota="é o número exato de miniaturas na parede" />
        <Kpi rotulo="com vídeo em disco" valor={pecas.com_video} nota="conferido arquivo a arquivo, não declarado" />
        <Kpi
          rotulo="sem capa em out/"
          valor={pecas.pastas_sem_capa ?? null}
          cor={pecas.pastas_sem_capa ? 'text-ambar' : 'text-tinta'}
          nota={
            pecas.pastas_em_disco
              ? `de ${pecas.pastas_em_disco} pastas no acervo · ${pecas.pastas_sem_capa_com_video ?? 0} delas têm mp4`
              : 'não consegui abrir a pasta out/'
          }
        />
      </div>

      {/* 5fr 8fr 5fr: derivado de 26,8 / 44,8 / 26,8, e a espec diz que e
          DERIVADO e nao lido do CSS. Empilha no celular, onde tres colunas de
          27% nao cabem em 390px. */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[5fr_8fr_5fr]">
        <Mesa lista={naMesa} escolhida={peca?.n ?? null} aoEscolher={setEscolhida} />
        <Visor peca={peca} />
        <Saida peca={peca} acoesHabilitadas={pecas.acoes_habilitadas} bloqueio={pecas.acoes_bloqueio} />
      </div>

      <Prontos lista={prontas} escolhida={peca?.n ?? null} aoEscolher={setEscolhida} />
      <FontesRecebidas fontes={pecas.fontes_recebidas} />
    </div>
  )
}

function FontesRecebidas({ fontes }: { fontes: Pecas['fontes_recebidas'] }) {
  if (!fontes) return null
  return (
    <section className="carta-vidro mt-3 p-4" data-estudio-fontes>
      <Cabecalho cor={DOURADO} meta={fontes.erro ? 'não lido' : `${fontes.itens.length}`}>fontes recebidas</Cabecalho>
      {fontes.erro ? (
        <p className="text-[11.5px] text-vermelho">{fontes.erro}</p>
      ) : fontes.itens.length === 0 ? (
        <p className="text-[11.5px] text-tinta-3">Nenhum lote externo registrado.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {fontes.itens.map((fonte) => (
            <li key={fonte.id} className="rounded-md border border-linha bg-white/4 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={fonte.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-tinta underline decoration-linha-forte underline-offset-4">
                  {fonte.origem}
                </a>
                <Pilula tom={fonte.estado === 'importado' ? 'verde' : 'ambar'} ponto={false}>
                  {fonte.estado === 'importado' ? 'registro: importado' : 'registro: recebido, não importado'}
                </Pilula>
              </div>
              <p className="mt-2 font-mono text-[9.5px] text-tinta-3">
                recebido em {new Date(fonte.recebido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false })} BRT
              </p>
              <p className="mt-2 font-mono text-[10.5px] text-tinta-2">
                {fonte.conjuntos} conjuntos · {fonte.arquivos} arquivos · {(fonte.bytes / 1_000_000).toFixed(1)} MB
              </p>
              <p className="mt-1 font-mono text-[9.5px] text-tinta-3">
                {Object.entries(fonte.por_tipo).map(([tipo, total]) => `${tipo} ${total}`).join(' · ')}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-tinta-3">{fonte.observacao}</p>
              <p className="mt-1 font-mono text-[9.5px] text-tinta-3">registro SHA-256 {fonte.assinatura_inventario_sha256.slice(0, 16)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 border-t border-linha pt-2 text-[10.5px] leading-relaxed text-tinta-3">
        Estes lotes não entram nos KPIs de produção até serem incorporados ao posts.json e ao acervo local.
      </p>
    </section>
  )
}

/**
 * LA MESA. Item de tres linhas, como a referencia, MENOS a barra de progresso:
 * a linha 2 dela e `subtitulos 72%`, progresso DENTRO de uma etapa, e nos temos
 * estado discreto. A pilula ocupa esse lugar e diz o que sabemos.
 */
function Mesa({
  lista, escolhida, aoEscolher,
}: {
  lista: Peca[]
  escolhida: number | null
  aoEscolher: (n: number) => void
}) {
  return (
    <section className="carta-vidro flex max-h-[520px] flex-col p-4">
      <Cabecalho cor={DOURADO} meta={`${lista.length}`}>
        a mesa
      </Cabecalho>
      {lista.length === 0 ? (
        <p className="text-[12px] leading-[1.55] text-tinta-2">
          Nenhuma peça em produção agora. Isso é o que o posts.json diz, e não uma tela que não
          conseguiu ler: as que já saíram estão na parede, embaixo.
        </p>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {lista.map((p) => (
            <li key={p.n} className="border-b border-linha last:border-b-0">
              <button
                type="button"
                onClick={() => aoEscolher(p.n)}
                aria-pressed={escolhida === p.n}
                className="w-full py-2.5 text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-[5px] shrink-0 rounded-full"
                    style={{ background: escolhida === p.n ? DOURADO : 'var(--color-tinta-3)' }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-[12.5px] ${escolhida === p.n ? 'text-tinta' : 'text-tinta-2'}`}
                    title={p.titulo}
                  >
                    {p.titulo}
                  </span>
                </span>
                <span className="mt-1.5 flex items-center gap-2 pl-3">
                  <Pilula tom={TOM_STATUS[p.status] ?? 'neutro'} ponto={false}>
                    {p.status.replace('_', ' ')}
                  </Pilula>
                  <span className="rotulo ml-auto shrink-0">{p.formato ?? 'formato —'}</span>
                </span>
                <span className="rotulo mt-1 block truncate pl-3 !normal-case !tracking-normal">
                  {p.agendado_para ?? p.data ?? 'sem data'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 shrink-0 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        ‼️ A referência mostra aqui o progresso dentro da etapa (<span className="font-mono">subtitulos 72%</span>).
        Nós temos <span className="font-mono text-tinta-2">status</span>, que é estado discreto, e
        não uma porcentagem. Fabricar 72% a partir de “pendente” seria inventar precisão que nenhum
        arquivo tem.
      </p>
    </section>
  )
}

function Visor({ peca }: { peca: Peca | null }) {
  if (!peca) {
    return (
      <section className="carta-vidro grid min-h-[320px] place-items-center p-4">
        <p className="max-w-xs text-center text-[12px] leading-[1.55] text-tinta-2">
          Escolha uma peça na mesa ou na parede para vê-la aqui.
        </p>
      </section>
    )
  }
  return (
    <section className="carta-vidro flex flex-col p-4">
      <Cabecalho cor={DOURADO} meta={`#${peca.n}`}>
        visor
      </Cabecalho>

      {/* O palco usa somente tintas funcionais da identidade. O xadrez tênue
          indica transparência e aparece nas quatro bordas porque a peça é
          vertical e o palco é largo. */}
      <div
        className="poco grid min-h-[300px] flex-1 place-items-center p-4"
        style={{
          backgroundImage:
            'linear-gradient(45deg, color-mix(in srgb, var(--color-tinta) 3%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--color-tinta) 3%, transparent) 75%), linear-gradient(45deg, color-mix(in srgb, var(--color-tinta) 3%, transparent) 25%, transparent 25%, transparent 75%, color-mix(in srgb, var(--color-tinta) 3%, transparent) 75%)',
          backgroundSize: '22px 22px',
          backgroundPosition: '0 0, 11px 11px',
        }}
      >
        {peca.capa_url ? (
          // A peca e POUSADA no palco, nao esticada nele: vertical, cantos
          // arredondados, altura quase cheia e sobra generosa dos dois lados.
          <img
            src={peca.capa_url}
            alt={`Capa da peça ${peca.n}`}
            width={180}
            height={320}
            className="block h-[300px] w-auto rounded object-contain"
          />
        ) : (
          <span className="rotulo">sem capa em disco</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-linha pt-2.5">
        {/* Rodape em MONO: numero de tabela e mono, numero de KPI e serifa.
            Serifa impressiona, mono compara. */}
        <span className="font-mono text-[10.5px] text-tinta-2">
          {peca.n} · {peca.formato ?? 'formato —'} · {peca.tem_video ? 'mp4 em disco' : 'sem mp4'}
        </span>
        <span className="font-mono text-[10.5px] text-tinta-3">
          {peca.status === 'postado' && peca.data ? `publicado em ${peca.data}` : peca.status.replace('_', ' ')}
        </span>
      </div>

      <p className="mt-2.5 rounded-md border border-ambar/25 bg-ambar/6 px-3 py-2.5 text-[11px] leading-[1.55] text-tinta-2">
        <span className="rotulo !text-ambar">a prévia usa a capa</span>
        <span className="mt-1 block">
          O palco mostra a capa para não carregar o acervo inteiro. Quando disponível, o botão de
          download busca o artefato real por ID técnico, em rota autenticada, sem revelar o caminho
          do arquivo.
        </span>
      </p>
    </section>
  )
}

function Saida({ peca, acoesHabilitadas, bloqueio }: { peca: Peca | null; acoesHabilitadas: boolean; bloqueio: string | null }) {
  const canais = peca?.canais ?? []
  const [ocupado, setOcupado] = useState<'download' | 'aprovacao' | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)

  const baixar = async () => {
    if (!peca) return
    setOcupado('download'); setMensagem(null)
    try {
      const resposta = await fetch(`${apiUrl('estudio/artefato')}?id=${peca.n}`, { cache: 'no-store' })
      if (!resposta.ok) throw new Error((await resposta.json().catch(() => null))?.erro ?? `falha ${resposta.status}`)
      const blob = await resposta.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url
      const nome = resposta.headers.get('Content-Disposition')?.match(/filename="(peca-[0-9]+(?:\.[a-z0-9]+)?)"/i)?.[1]
      link.download = nome ?? `peca-${peca.n}`
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
      setMensagem('Artefato baixado.')
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : 'Não foi possível baixar.') }
    finally { setOcupado(null) }
  }

  const enviarAprovacao = async () => {
    if (!peca) return
    setOcupado('aprovacao'); setMensagem(null)
    try {
      const chave = `estudio_${crypto.randomUUID().replaceAll('-', '')}`
      const resposta = await fetch(apiUrl('estudio/aprovacoes'), { method:'POST', headers:{'Content-Type':'application/json','X-Painel-Intent':'enviar-aprovacao'}, body:JSON.stringify({id:peca.n,chave_idempotencia:chave}) })
      const corpo = await resposta.json().catch(() => null)
      if (!resposta.ok) throw new Error(corpo?.erro ?? `falha ${resposta.status}`)
      setMensagem(corpo.idempotente ? 'A peça já estava na fila de Aprovações.' : 'Peça enviada para Aprovações. Nada foi publicado.')
    } catch (erro) { setMensagem(erro instanceof Error ? erro.message : 'Não foi possível enviar.') }
    finally { setOcupado(null) }
  }
  return (
    <section className="carta-vidro flex flex-col p-4">
      <Cabecalho cor={DOURADO} meta={peca ? `#${peca.n}` : undefined}>
        saída
      </Cabecalho>

      {/* O titulo da peca selecionada, em sans, sem truncar: ele troca junto
          com a miniatura, e e assim que se sabe que a parede e o seletor. */}
      <h2 className="text-[14px] leading-[1.4] font-semibold text-tinta">
        {peca?.titulo ?? 'nenhuma peça selecionada'}
      </h2>

      <div className="mt-3.5">
        <span className="rotulo">redes</span>
        <ul className="mt-1.5 space-y-1.5">
          {canais.length === 0 ? (
            <li className="text-[11.5px] text-tinta-3">
              Esta peça não declara canal nenhum no posts.json.
            </li>
          ) : (
            canais.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="size-[11px] shrink-0 rounded-full border border-linha-forte" />
                <span className="text-[12px] text-tinta-2 capitalize">{c}</span>
              </li>
            ))
          )}
        </ul>
        {canais.length > 0 && (
          <p className="rotulo mt-2 !normal-case !tracking-normal text-[10px] leading-relaxed">
            Círculo vazio porque é assim que está na referência: em nenhum frame se viu um marcado,
            então o estado selecionado deles não foi medido e não é inventado aqui.
          </p>
        )}
      </div>

      {/* Botoes empilhados, largura cheia: DESCARGAR preenchido, PUBLICAR
          apagado. DESABILITADOS, e o motivo vai colado: botao que nao faz nada
          e pior que botao nenhum, porque a pessoa clica e acha que publicou. */}
      <div className="mt-4 space-y-2">
        <button
          type="button"
          disabled={!peca?.artefato_disponivel || !acoesHabilitadas || ocupado !== null}
          onClick={baixar}
          title={!acoesHabilitadas ? bloqueio ?? 'ação indisponível' : !peca?.artefato_disponivel ? 'nenhum artefato seguro disponível' : 'baixar artefato'}
          className="w-full rounded-md border border-linha-forte bg-white/8 px-3 py-2 font-mono text-[10px] tracking-[0.2em] text-tinta-2 uppercase disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ocupado === 'download' ? 'baixando' : 'baixar artefato'}
        </button>
        <button
          type="button"
          disabled={!peca?.aprovacao_disponivel || !acoesHabilitadas || ocupado !== null}
          onClick={enviarAprovacao}
          title={!acoesHabilitadas ? bloqueio ?? 'ação indisponível' : !peca?.aprovacao_disponivel ? 'somente peça pendente com artefato entra na fila' : 'enviar para decisão humana'}
          className="w-full rounded-md border border-linha-forte px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-tinta uppercase disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ocupado === 'aprovacao' ? 'enviando' : 'enviar para aprovações'}
        </button>
        <p className="rotulo !normal-case !tracking-normal text-[10px] leading-relaxed">
          {acoesHabilitadas
            ? 'O download entrega somente arquivos validados da marca própria. Enviar cria um registro aguardando decisão e nunca publica.'
            : `As duas ações estão bloqueadas: ${bloqueio ?? 'o canal HTTPS ainda não foi confirmado'}.`}
        </p>
        {mensagem && <p data-estudio-resposta className="rounded-md border border-linha bg-white/4 px-3 py-2 text-[11px] text-tinta-2">{mensagem}</p>}
      </div>

      <p className="mt-auto border-t border-linha pt-3 text-[11px] leading-[1.6] text-tinta-2">
        Não existe botão de publicar nesta tela. Aprovar registra uma decisão, mas a publicação continua sendo uma ação humana separada.
      </p>
    </section>
  )
}

/**
 * A PAREDE. E o seletor da tela: trocar de miniatura troca o visor e o titulo
 * de SAIDA. Anel dourado de 1px na escolhida — nao e escala, nao e brilho, nao
 * e opacidade nos vizinhos, que foi o que a espec descartou explicitamente.
 *
 * Desenha TODAS as prontas, e nao um pedaco: o KPI diz esse numero, e KPI que
 * nao bate com a lista faz a tela mentir. A faixa rola DENTRO da propria caixa,
 * entao a pagina nunca rola de lado.
 *
 * ⚠️ Como a rolagem se comporta la nao foi medido (nos frames ela nunca rolou),
 * entao `overflow-x:auto` aqui e escolha nossa, nao reproducao.
 */
function Prontos({
  lista, escolhida, aoEscolher,
}: {
  lista: Peca[]
  escolhida: number | null
  aoEscolher: (n: number) => void
}) {
  return (
    <section className="carta-vidro mt-3 p-4">
      <Cabecalho cor={DOURADO} meta={`${lista.length}`}>
        prontas
      </Cabecalho>
      {lista.length === 0 ? (
        <p className="text-[12px] leading-[1.55] text-tinta-2">
          Nenhuma peça com capa em disco. O posts.json pode declarar capa e o arquivo não existir:
          o que está contado aqui é arquivo aberto, não campo preenchido.
        </p>
      ) : (
        <div className="-mx-1 flex gap-[5px] overflow-x-auto px-1 pb-2">
          {lista.map((p) => (
            <button
              key={p.n}
              type="button"
              onClick={() => aoEscolher(p.n)}
              aria-pressed={escolhida === p.n}
              aria-label={`Peça ${p.n}: ${p.titulo}`}
              title={`#${p.n} · ${p.titulo}`}
              className="w-[50px] shrink-0 overflow-hidden rounded-[3px]"
              style={{
                // Anel de 1px, e so isso: a espec descartou escala, brilho e
                // opacidade nos vizinhos, uma por uma.
                boxShadow: escolhida === p.n ? `0 0 0 1px ${DOURADO}` : '0 0 0 1px var(--color-linha)',
              }}
            >
              {/* 3:5, medido, e NAO 9:16. A capa e 1080x1920, entao entra com
                  `cover`, cortando um pouco do topo e da base do reel. Sem
                  texto, sem duração, sem play: é isso que faz parecer parede. */}
              <img
                data-miniatura
                src={p.capa_url!}
                alt=""
                width={50}
                height={83}
                loading="lazy"
                className="block aspect-[3/5] w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <p className="mt-2 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">
        Cada miniatura é o <span className="font-mono text-tinta-2">cover.jpg</span> real da pasta
        da peça, copiado pelo coletor com o número dela como nome de arquivo, nunca com o slug:
        slug de peça de cliente carrega o nome do cliente, e endereço também é tela. A caixa é 3:5
        e a capa é 1080x1920, então ela entra cortada em cima e embaixo, de propósito.
      </p>
    </section>
  )
}
