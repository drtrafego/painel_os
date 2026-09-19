import { Icone } from './Icone'
import { Pilula } from './primitivos'
import { VISTAS, type VistaId } from '../nav/rotas'
import { dadoDaVista } from '../nav/rotulo'
import { corDaSessao } from './paleta'
import { lerMotores } from '../dados/motores'
import type { Estado } from '../dados/tipos'

/**
 * A NAVEGACAO DAS DOZE VISTAS.
 *
 * O menu sai de `nav/rotas.ts`: acrescentar vista e acrescentar entrada la, e
 * este arquivo nao muda. Ate 08/09 as entradas eram uma lista chumbada aqui
 * dentro, com oito delas `pronta: false` e desabilitadas.
 *
 * ‼️ E O MENU DIZ QUAL TEM DADO ANTES DE A PESSOA CLICAR. O ponto ao lado do
 * nome nao e enfeite: cheio quer dizer medido, vazado quer dizer parcial,
 * apagado quer dizer que aquela tela ainda nao tem fonte. Sem esse sinal, a
 * pessoa clica em seis telas pra descobrir na sexta que quatro estao vazias, e
 * um painel que faz isso ensina a nao confiar nele.
 *
 * ‼️ E DESDE 10/09 A BOLINHA SAI DO DADO, nao do `tipo` digitado em `rotas.ts`.
 * Aquele campo tinha vencido: Cobrancas e Ferramentas estavam escritas `nenhum`
 * e as telas mostravam numero medido, entao o menu apagava a bolinha de vista
 * cheia. Sinal errado e pior que sinal nenhum, porque a pessoa deixa de abrir.
 */
const SINAL = {
  medido: { classe: 'bg-verde', titulo: 'tem dado medido no disco' },
  parcial: { classe: 'bg-ambar/70 ring-1 ring-ambar', titulo: 'tem dado, mas só de parte' },
  nenhum: { classe: 'bg-transparent ring-1 ring-tinta-3/60', titulo: 'ainda não tem dado' },
} as const

export function Sidebar({
  hora,
  estado,
  atual,
  aoIr,
}: {
  hora: string
  estado: Estado
  atual: VistaId
  aoIr: (v: VistaId) => void
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid size-7 place-items-center rounded-[7px] border border-lima/30 bg-lima/12 text-lima">
          <Icone nome="equipe" tamanho={14} />
        </span>
        <span className="min-w-0">
          <span className="block font-mono text-[11px] font-medium tracking-[0.13em] text-tinta">
            G4ST4OVIB3 OS
          </span>
          <span className="rotulo block">operação gastão matos</span>
        </span>
      </div>

      <nav className="px-2.5" aria-label="telas do painel">
        {VISTAS.map((v) => {
          const aqui = atual === v.id
          const sinal = SINAL[dadoDaVista(v, estado).tipo]
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => aoIr(v.id)}
              aria-current={aqui ? 'page' : undefined}
              className={
                'group relative mb-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left transition-colors duration-200 ' +
                (aqui ? 'bg-lima/10 text-lima' : 'text-tinta-2 hover:bg-white/4 hover:text-tinta')
              }
            >
              <Icone nome={v.icone} tamanho={14} />
              <span className="truncate text-[12.5px]">{v.nome}</span>
              <span
                className={`ml-auto size-[5px] shrink-0 rounded-full ${sinal.classe}`}
                title={sinal.titulo}
              />
              {aqui && <span className="absolute top-1.5 right-1 bottom-1.5 w-[2px] rounded-full bg-lima" />}
            </button>
          )
        })}
      </nav>

      <div className="mt-5 px-4">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="rotulo">camada de comando</span>
          <span className="rotulo">{estado.sessao.length}</span>
        </div>
        {estado.sessao.map((s) => {
          const v = s.verificador
          // A mesma regra do card: indeterminada nao e aprovada, entao o ponto
          // verde da barra lateral tambem nao pode acender com ela na conta.
          const ok = v.reprovadas === 0 && v.vencido === false && v.indeterminadas === 0
          // Ate 10/09 a pilula daqui misturava duas medidas: a COR vinha do
          // verificador e o TEXTO vinha do service. Verificador reprovado
          // pintava de ambar uma pilula escrita "active", e um service parado
          // ficava verde se as checagens tivessem passado. Agora a pilula e so
          // do motor, e o verificador tem sinal proprio ao lado.
          const motor = lerMotores(s.motores)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => aoIr('diretores')}
              className="mb-1.5 block w-full rounded-md border border-linha bg-carta/60 px-2.5 py-2 text-left transition-colors hover:border-linha-forte"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-[2px] shrink-0 rounded-full"
                  style={{ background: corDaSessao(s.id) }}
                />
                <span className="text-[12px] text-tinta">{s.nome}</span>
                {!ok && (
                  <span
                    className="text-[10px] leading-none text-ambar"
                    title="o verificador deste agente tem checagem reprovada, vencida ou indeterminada"
                  >
                    ●
                  </span>
                )}
                <span className="ml-auto" title={motor.detalhe}>
                  <Pilula tom={motor.tom} ponto={false}>{motor.rotulo}</Pilula>
                </span>
              </div>
              <div className="rotulo mt-1 truncate">{s.camada}</div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 px-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="rotulo">especialistas</span>
          <span className="rotulo">{estado.resumo.agentes_casa}</span>
        </div>
        {(Object.keys(estado.squads) as (keyof typeof estado.squads)[]).map((id) => (
          <div key={id} className="mb-1 flex items-baseline gap-2">
            <span className="truncate text-[11.5px] text-tinta-2">{estado.squads[id].nome}</span>
            <span className="h-px flex-1 bg-linha" />
            <span className="font-mono text-[10.5px] text-tinta-3">
              {estado.agentes.filter((a) => a.squad === id).length}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-linha px-4 py-3">
        <span className="rotulo">{VISTAS.length} telas</span>
        <span className="font-mono text-[10px] text-tinta-3">{hora}</span>
      </div>
    </>
  )
}
