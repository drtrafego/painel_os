import { Icone } from './Icone'
import { encostados, maisAntiga, reprovadas } from '../dados/estado'
import { horaGastao, horaUtc, proximosDisparos } from '../dados/cron'
import type { Estado } from '../dados/tipos'

export type FiltroId = 'vencido' | 'reprovadas' | 'antiga' | 'cron' | 'encostados' | 'hoje'

export type Acao = {
  id: FiltroId
  rotulo: string
  valor: string | null
  frase: string
  linha: string
  urgente?: boolean
}

/**
 * Os quatro blocos do topo. Nao e um resumo da tela: e o que ha pra FAZER.
 * Monta so o que tem dado real medido. Se um candidato nao tiver dado, ele
 * simplesmente nao entra, e entra o proximo: nenhum bloco aqui e decorativo.
 */
export function montarAcoes(estado: Estado, agora: Date): Acao[] {
  const candidatos: (Acao | null)[] = []

  const vencidos = estado.sessao.filter((s) => s.verificador.vencido === true)
  candidatos.push(
    vencidos.length
      ? {
          id: 'vencido',
          rotulo: 'rodada vencida',
          valor: String(vencidos.length),
          frase: '',
          linha: `o cron de ${vencidos.map((v) => v.nome).join(' e ')} não rodou: o quadro abaixo está velho`,
          urgente: true,
        }
      : null,
  )

  const falhas = reprovadas(estado)
  candidatos.push(
    falhas.length
      ? {
          id: 'reprovadas',
          rotulo: 'reprovadas agora',
          valor: String(falhas.length),
          frase: '',
          linha: 'abra e veja quais são antes de mexer em qualquer coisa',
          urgente: true,
        }
      : null,
  )

  const antiga = maisAntiga(estado)
  candidatos.push(
    antiga
      ? {
          id: 'antiga',
          rotulo: 'aberta há mais tempo',
          valor: null,
          frase: antiga.falha.o_que,
          linha: `${antiga.dias.toLocaleString('pt-BR')} dia(s) reprovando · essa é a que ninguém foi consertar`,
        }
      : null,
  )

  const { disparos, ilegiveis } = proximosDisparos(estado.cron.jobs ?? [], agora, 60)
  // Expressao que nao deu pra ler nao pode sumir da conta em silencio: ela vai
  // colada no numero, senao "3 na proxima hora" quer dizer "3 das que eu li".
  const naoLidas = ilegiveis.length
    ? ` · ${ilegiveis.length} expressão(ões) que não consegui ler`
    : ''
  candidatos.push(
    estado.cron.jobs?.length
      ? {
          id: 'cron',
          rotulo: 'roda sozinho na próxima hora',
          valor: String(disparos.length),
          frase: '',
          linha:
            (disparos.length
              ? `o primeiro é ${horaUtc(disparos[0].primeiro)} utc (${horaGastao(disparos[0].primeiro)} no seu fuso)`
              : 'nada dispara na próxima hora') + naoLidas,
        }
      : null,
  )

  const parados = encostados(estado, agora.getTime())
  candidatos.push(
    parados.length
      ? {
          id: 'encostados',
          rotulo: 'agentes sem uso',
          valor: `${parados.length} de ${estado.resumo.agentes_casa}`,
          frase: '',
          linha: 'nunca convocados ou parados há mais de uma semana: usar ou aposentar',
        }
      : null,
  )

  // ‼️ ESTE NUMERO CONTA CARGO, NAO CHAMADA, e a linha de baixo dizia "os que
  // estao de fato trabalhando na operacao". Medido em 10/09: 6 cargos e 13
  // convocacoes na mesma janela, com o painel mostrando o 6 numa frase que se
  // le como quantidade de agentes trabalhando. Os dois numeros agora aparecem
  // juntos, porque separado o menor sempre vai ser lido como o total.
  const naJanela = estado.agentes.filter(
    (a) => a.ultima_convocacao && Date.parse(a.ultima_convocacao) > agora.getTime() - 86_400_000,
  )
  const chamadasNaJanela = naJanela.reduce((n, a) => n + (a.convocacoes_24h ?? 0), 0)
  candidatos.push(
    naJanela.length
      ? {
          id: 'hoje',
          rotulo: 'cargos convocados nas últimas 24h',
          valor: String(naJanela.length),
          frase: '',
          linha: chamadasNaJanela
            ? `${chamadasNaJanela} convocação(ões) nessa janela: um cargo chamado várias vezes conta uma vez aqui`
            : 'conta cargo distinto, não quantas vezes cada um foi chamado',
        }
      : null,
  )

  return candidatos.filter((c): c is Acao => c !== null).slice(0, 4)
}

export function Acoes({
  acoes, ativo, aoClicar,
}: { acoes: Acao[]; ativo: FiltroId | null; aoClicar: (id: FiltroId) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {acoes.map((a) => {
        const selecionado = ativo === a.id
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => aoClicar(a.id)}
            aria-pressed={selecionado}
            className={
              'group flex min-h-[128px] flex-col rounded-xl border p-3.5 text-left transition-colors duration-200 ' +
              (selecionado
                ? 'border-lima/45 bg-lima/8'
                : a.urgente
                  ? 'border-ambar/25 bg-carta hover:border-ambar/45'
                  : 'border-linha bg-carta hover:border-linha-forte')
            }
          >
            <div className="flex items-center gap-2">
              <span className={`rotulo ${a.urgente && !selecionado ? '!text-ambar' : ''} ${selecionado ? '!text-lima' : ''}`}>
                {a.rotulo}
              </span>
              <span className={`ml-auto shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 ${selecionado ? 'text-lima' : 'text-tinta-3'}`}>
                <Icone nome="seta" tamanho={13} />
              </span>
            </div>

            {a.valor !== null ? (
              <div className={`mt-2.5 font-serif text-[40px] leading-none ${a.urgente ? 'text-ambar' : 'text-tinta'}`}>
                {a.valor}
              </div>
            ) : (
              <p className="mt-2.5 line-clamp-3 font-serif text-[15px] leading-[1.3] text-tinta">
                “{a.frase}”
              </p>
            )}

            <p className="mt-auto pt-2.5 text-[11px] leading-[1.45] text-tinta-2">{a.linha}</p>
          </button>
        )
      })}
    </div>
  )
}
