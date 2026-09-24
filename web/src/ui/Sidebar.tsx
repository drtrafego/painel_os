import { Icone } from './Icone'
import { Pilula } from './primitivos'
import { VISTAS, type VistaId } from '../nav/rotas'
import { dadoDaVista } from '../nav/rotulo'
import { corDaSessao } from './paleta'
import { lerMotores } from '../dados/motores'
import { squadsComAgentes } from '../dados/estado'
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
  recolhido = false,
  aoAlternarRecolher,
}: {
  hora: string
  estado: Estado
  atual: VistaId
  aoIr: (v: VistaId) => void
  recolhido?: boolean
  aoAlternarRecolher?: () => void
}) {
  const squadIds = squadsComAgentes(estado)

  return (
    <>
      <div className={`flex items-center py-4 ${recolhido ? 'flex-col gap-2 px-2' : 'justify-between px-4'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-lima/30 bg-lima/12 text-lima">
            <Icone nome="equipe" tamanho={14} />
          </span>
          {!recolhido && (
            <span className="min-w-0">
              <span className="block font-mono text-[11px] font-medium tracking-[0.13em] text-tinta">
                G4ST4OVIB3 OS
              </span>
              <span className="rotulo block truncate">operação gastão matos</span>
            </span>
          )}
        </div>
        {aoAlternarRecolher && (
          <button
            type="button"
            onClick={aoAlternarRecolher}
            title={recolhido ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            aria-label={recolhido ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="grid size-7 shrink-0 place-items-center rounded-md text-tinta-3 transition-colors hover:bg-white/5 hover:text-tinta"
          >
            <Icone nome={recolhido ? 'expandir' : 'recolher'} tamanho={14} />
          </button>
        )}
      </div>

      <nav className={recolhido ? 'px-2' : 'px-2.5'} aria-label="telas do painel">
        {VISTAS.map((v) => {
          const aqui = atual === v.id
          const sinal = SINAL[dadoDaVista(v, estado).tipo]
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => aoIr(v.id)}
              aria-current={aqui ? 'page' : undefined}
              title={recolhido ? `${v.nome} (${sinal.titulo})` : undefined}
              className={
                'group relative mb-0.5 flex w-full items-center rounded-md text-left transition-colors duration-200 ' +
                (recolhido ? 'justify-center p-2.5 ' : 'gap-2.5 px-2.5 py-[7px] ') +
                (aqui ? 'bg-lima/10 text-lima' : 'text-tinta-2 hover:bg-white/4 hover:text-tinta')
              }
            >
              <Icone nome={v.icone} tamanho={14} />
              {!recolhido && <span className="truncate text-[12.5px]">{v.nome}</span>}
              <span
                className={
                  sinal.classe +
                  (recolhido
                    ? ' absolute top-1 right-1 size-[5px] shrink-0 rounded-full'
                    : ' ml-auto size-[5px] shrink-0 rounded-full')
                }
                title={sinal.titulo}
              />
              {aqui && (
                <span
                  className={
                    'absolute bg-lima rounded-full ' +
                    (recolhido ? 'left-0.5 top-2 bottom-2 w-[2px]' : 'top-1.5 right-1 bottom-1.5 w-[2px]')
                  }
                />
              )}
            </button>
          )
        })}
      </nav>

      {!recolhido ? (
        <div className="mt-5 px-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="rotulo">camada de comando</span>
            <span className="rotulo">{estado.sessao.length}</span>
          </div>
          {estado.sessao.map((s) => {
            const v = s.verificador
            const ok = v.reprovadas === 0 && v.vencido === false && v.indeterminadas === 0
            const motor = lerMotores(s.motores)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => aoIr('diretores')}
                className="group relative mb-2 block w-full overflow-hidden rounded-lg border border-linha bg-carta/80 p-2.5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-linha-forte hover:shadow-md"
              >
                {/* Indicador Neon Lateral de Identidade */}
                <div
                  className="absolute inset-y-0 left-0 w-[3px] transition-all group-hover:w-[4px]"
                  style={{ background: corDaSessao(s.id) }}
                />
                
                <div className="flex items-center gap-2 pl-1.5">
                  {/* Status Indicator com Pulso Animado (Agent Dock) */}
                  <span className="relative flex size-2 shrink-0">
                    <span
                      className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                        ok ? 'bg-verde' : 'bg-ambar'
                      }`}
                    />
                    <span
                      className={`relative inline-flex size-2 rounded-full ${
                        ok ? 'bg-verde' : 'bg-ambar'
                      }`}
                    />
                  </span>

                  <span className="text-[12.5px] font-semibold text-tinta">{s.nome}</span>

                  <span className="ml-auto" title={motor.detalhe}>
                    <Pilula tom={motor.tom} ponto={false}>{motor.rotulo}</Pilula>
                  </span>
                </div>
                <div className="rotulo mt-1 pl-1.5 truncate text-[9.5px] text-tinta-3">{s.camada}</div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 px-2">
          <div className="mb-1 text-center font-mono text-[9px] tracking-wider text-tinta-3" title="Camada de comando">
            CMD
          </div>
          {estado.sessao.map((s) => {
            const v = s.verificador
            const ok = v.reprovadas === 0 && v.vencido === false && v.indeterminadas === 0
            const motor = lerMotores(s.motores)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => aoIr('diretores')}
                title={`${s.nome} (${s.camada}) - Motor: ${motor.rotulo}`}
                className="relative mb-1 flex w-full items-center justify-center rounded-md border border-linha bg-carta/60 p-2 transition-colors hover:border-linha-forte"
              >
                <span
                  className="h-3 w-[3px] rounded-full"
                  style={{ background: corDaSessao(s.id) }}
                />
                {!ok && (
                  <span className="absolute top-0.5 right-0.5 text-[8px] leading-none text-ambar">●</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {!recolhido ? (
        <div className="mt-4 px-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="rotulo">especialistas</span>
            <span className="rotulo">{estado.resumo.agentes_casa}</span>
          </div>
          {squadIds.map((id) => (
            <div key={id} className="mb-1 flex items-baseline gap-2">
              <span className="truncate text-[11.5px] text-tinta-2">{estado.squads[id].nome}</span>
              <span className="h-px flex-1 bg-linha" />
              <span className="font-mono text-[10.5px] text-tinta-3">
                {estado.agentes.filter((a) => a.squad === id).length}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="mt-4 flex flex-col items-center px-2 font-mono text-[10px] text-tinta-3"
          title={`${estado.resumo.agentes_casa} especialistas em ${squadIds.length} squads`}
        >
          <span className="text-[9px] uppercase tracking-wider text-tinta-3">AG</span>
          <span className="font-semibold text-tinta">{estado.resumo.agentes_casa}</span>
        </div>
      )}

      <div className={`mt-auto flex items-center border-t border-linha py-3 ${recolhido ? 'justify-center px-2' : 'justify-between px-4'}`}>
        {!recolhido ? (
          <>
            <span className="rotulo">{VISTAS.length} telas</span>
            <span className="font-mono text-[10px] text-tinta-3">{hora}</span>
          </>
        ) : (
          <span className="font-mono text-[9.5px] text-tinta-3" title={`${VISTAS.length} telas | ${hora}`}>
            {hora.slice(0, 5)}
          </span>
        )}
      </div>
    </>
  )
}
