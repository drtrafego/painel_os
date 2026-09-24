import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Sidebar } from './ui/Sidebar'
import { Topbar } from './ui/Topbar'
import { EstadoInvalido, Rede } from './ui/Erro'
import { useEstado } from './dados/useEstado'
import { useRota } from './nav/useRota'
import { POR_ID } from './nav/rotas'
import type { FiltroId } from './ui/Acoes'
import type { Agente } from './dados/tipos'
import { obterFaixaPadrao, type FaixaDeData } from './ui/SeletorDeData'

// Cada tela vira um chunk próprio. A moldura, a autenticação e o estado ficam
// no bundle inicial; só o conteúdo da rota escolhida é baixado depois. O
// fallback abaixo mantém a SPA visível enquanto esse arquivo chega.
const Comando = lazy(() => import('./telas/Comando').then((m) => ({ default: m.Comando })))
const Diretores = lazy(() => import('./telas/Diretores').then((m) => ({ default: m.Diretores })))
const Diretor = lazy(() => import('./telas/Diretor').then((m) => ({ default: m.Diretor })))
const Tarefas = lazy(() => import('./telas/Tarefas').then((m) => ({ default: m.Tarefas })))
const Pipeline = lazy(() => import('./telas/Pipeline').then((m) => ({ default: m.Pipeline })))
const Chamadas = lazy(() => import('./telas/Chamadas').then((m) => ({ default: m.Chamadas })))
const Agenda = lazy(() => import('./telas/Agenda').then((m) => ({ default: m.Agenda })))
const Analitica = lazy(() => import('./telas/Analitica').then((m) => ({ default: m.Analitica })))
const Biblioteca = lazy(() => import('./telas/Biblioteca').then((m) => ({ default: m.Biblioteca })))
const Ferramentas = lazy(() => import('./telas/Ferramentas').then((m) => ({ default: m.Ferramentas })))
const Cofre = lazy(() => import('./telas/Cofre').then((m) => ({ default: m.Cofre })))
const Estudio = lazy(() => import('./telas/Estudio').then((m) => ({ default: m.Estudio })))
const Aprovacoes = lazy(() => import('./telas/Aprovacoes').then((m) => ({ default: m.Aprovacoes })))
const Cobrancas = lazy(() => import('./telas/Cobrancas').then((m) => ({ default: m.Cobrancas })))
const OQueFalta = lazy(() => import('./telas/OQueFalta').then((m) => ({ default: m.OQueFalta })))

function CarregandoTela() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-none flex min-h-56 items-center px-3 py-4 sm:px-6 lg:px-8 xl:px-10"
    >
      <div className="flex items-center gap-3 text-tinta-2">
        <span className="size-2 animate-pulse rounded-full bg-verde" aria-hidden="true" />
        <span className="rotulo">carregando esta área</span>
      </div>
    </div>
  )
}

/** Um relógio só para a tela inteira: cada card lendo a hora sozinho divergiria. */
function useAgora(intervaloMs = 1000) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs)
    return () => clearInterval(id)
  }, [intervaloMs])
  return agora
}

export default function App() {
  const agora = useAgora()
  const { estado, origem, erro, problemas, medidoEm } = useEstado()
  const { rota, ir } = useRota()
  const [filtro, setFiltro] = useState<FiltroId | null>(null)
  const [faixa, setFaixa] = useState<FaixaDeData>(obterFaixaPadrao)
  // Fica acima da tela para sobreviver enquanto a ficha ocupa o drawer. Ao
  // fechar, a pessoa volta exatamente ao departamento que estava examinando.
  const [departamento, setDepartamento] = useState<'todos' | Agente['squad']>('todos')
  const [menuAberto, setMenuAberto] = useState(false)
  const [sidebarRecolhida, setSidebarRecolhida] = useState(() => {
    try {
      return localStorage.getItem('painel_os:sidebar_recolhida') === 'true'
    } catch {
      return false
    }
  })

  const [larguraExpandida, setLarguraExpandida] = useState(() => {
    try {
      const salvo = localStorage.getItem('painel_os:largura_expandida')
      return salvo === null ? true : salvo === 'true'
    } catch {
      return true
    }
  })

  const alternarSidebar = () => {
    setSidebarRecolhida((prev) => {
      const prox = !prev
      try {
        localStorage.setItem('painel_os:sidebar_recolhida', String(prox))
      } catch {}
      return prox
    })
  }

  const alternarLarguraExpandida = () => {
    setLarguraExpandida((prev) => {
      const prox = !prev
      try {
        localStorage.setItem('painel_os:largura_expandida', String(prox))
      } catch {}
      return prox
    })
  }

  const hora = agora.toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'America/Sao_Paulo' })
  const sidebarWidth = sidebarRecolhida ? 64 : 268

  // Trocar de tela fecha a gaveta: no celular ela cobre a tela inteira e
  // ficaria por cima do que a pessoa acabou de pedir pra ver.
  useEffect(() => {
    setMenuAberto(false)
  }, [rota.vista, rota.quem])

  // E comeca do topo. Quem rola e o `main`, nao a janela, entao o
  // `window.scrollTo` do roteador nao alcanca: a tela abria no meio e parecia
  // que faltava conteudo em cima.
  const areaRef = useRef<HTMLElement>(null)
  useEffect(() => {
    areaRef.current?.scrollTo({ top: 0 })
  }, [rota.vista, rota.quem])

  useEffect(() => {
    if (!menuAberto) return
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false)
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [menuAberto])

  useEffect(() => {
    if (rota.vista !== 'diretores' || !rota.quem) return
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && ir('diretores')
    window.addEventListener('keydown', fechar)
    return () => window.removeEventListener('keydown', fechar)
  }, [ir, rota.quem, rota.vista])

  // O estado do build nao passou na conferencia E a rede tambem nao trouxe um
  // valido. Nao ha numero nenhum de que se possa falar, e a tela diz isso em
  // vez de desenhar uma casca vazia que parece funcionando.
  if (estado === null) {
    return (
      <EstadoInvalido
        problemas={problemas ?? ['o estado não chegou e o motivo não foi registrado']}
        origem="estado.json do build"
      />
    )
  }

  const vista = POR_ID[rota.vista]
  const comum = { estado, agora, medidoEm: medidoEm ?? estado.gerado_em, vista, faixa, aoMudarFaixa: setFaixa }

  function desenhar() {
    switch (rota.vista) {
      case 'comando':
        return <Comando {...comum} aoIr={ir} origem={origem} />
      case 'diretores':
        // No celular a ficha continua sendo uma tela inteira. No desktop a
        // rede permanece visível como contexto e a mesma URL abre um drawer.
        if (rota.quem) return (
          <>
            <div className="hidden lg:block" aria-hidden="true">
              <Diretores
                {...comum}
                origem={origem}
                erro={erro}
                filtro={filtro}
                aoFiltrar={(id) => setFiltro((a) => (a === id ? null : id))}
                departamento={departamento}
                aoMudarDepartamento={setDepartamento}
                aoIr={ir}
              />
            </div>
            <div
              className="w-full lg:fixed lg:top-11 lg:right-0 lg:bottom-0 lg:z-40 lg:left-[var(--sidebar-w)] transition-all duration-300"
              style={{
                ['--sidebar-w' as string]: `${sidebarWidth}px`,
                ['--drawer-w' as string]: `min(720px, calc(100vw - ${sidebarWidth}px))`,
              } as React.CSSProperties}
            >
              <button
                type="button"
                aria-label="fechar a ficha e voltar para a rede"
                onClick={() => ir('diretores')}
                className="absolute inset-0 hidden bg-black/45 backdrop-blur-[1px] lg:block"
              />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label="ficha do agente"
                data-ficha-drawer
                className="w-full max-w-full min-w-0 bg-fundo lg:absolute lg:inset-y-0 lg:right-0 lg:w-[var(--drawer-w)] lg:max-w-[calc(100vw-var(--sidebar-w))] lg:overflow-y-auto lg:overflow-x-hidden lg:border-l lg:border-linha lg:shadow-[-24px_0_70px_rgba(0,0,0,.42)] transition-all duration-300"
              >
                <Diretor {...comum} quem={rota.quem} aoIr={ir} compacto />
              </aside>
            </div>
          </>
        )
        return (
          <Diretores
            {...comum}
            origem={origem}
            erro={erro}
            filtro={filtro}
            aoFiltrar={(id) => setFiltro((a) => (a === id ? null : id))}
            departamento={departamento}
            aoMudarDepartamento={setDepartamento}
            aoIr={ir}
          />
        )
      case 'tarefas':
        return <Tarefas {...comum} />
      case 'pipeline':
        return <Pipeline {...comum} />
      case 'chamadas':
        return <Chamadas {...comum} />
      case 'agenda':
        return <Agenda {...comum} />
      case 'analitica':
        return <Analitica {...comum} />
      case 'biblioteca':
        return <Biblioteca {...comum} />
      case 'ferramentas':
        return <Ferramentas {...comum} />
      case 'cofre':
        return <Cofre {...comum} />
      case 'estudio':
        return <Estudio {...comum} />
      case 'aprovacoes':
        return <Aprovacoes {...comum} />
      case 'cobrancas':
        return <Cobrancas {...comum} />
      case 'falta':
        return <OQueFalta {...comum} />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={
          'hidden shrink-0 flex-col overflow-y-auto border-r border-linha bg-fundo-2/70 transition-all duration-300 ease-in-out lg:flex ' +
          (sidebarRecolhida ? 'w-[64px]' : 'w-[268px]')
        }
      >
        <Sidebar
          hora={hora}
          estado={estado}
          atual={rota.vista}
          aoIr={ir}
          recolhido={sidebarRecolhida}
          aoAlternarRecolher={alternarSidebar}
        />
      </aside>

      {/* A gaveta do celular. `fixed`, entao ela nao entra na largura do
          documento e nao cria rolagem horizontal na pagina. */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="fechar o menu"
            onClick={() => setMenuAberto(false)}
            className="absolute inset-0 bg-black/60"
          />
          <aside
            data-gaveta
            className="relative flex w-[268px] max-w-[86vw] flex-col overflow-y-auto border-r border-linha bg-fundo-2"
          >
            <Sidebar hora={hora} estado={estado} atual={rota.vista} aoIr={ir} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col" data-expandido={larguraExpandida ? 'true' : 'false'}>
        <Topbar
          hora={hora}
          estado={estado}
          vista={vista.nome}
          aoAbrirMenu={() => setMenuAberto(true)}
          expandido={larguraExpandida}
          aoAlternarExpandido={alternarLarguraExpandida}
          faixa={faixa}
          aoMudarFaixa={setFaixa}
        />
        <main ref={areaRef} className="min-h-0 flex-1 overflow-y-auto">
          {/* Resposta nova rejeitada: os numeros abaixo sao os anteriores, e
              isso vai dito ANTES deles, nao num rodape que ninguem acha. */}
          {origem === 'estado-invalido' && problemas && (
            <div className="w-full max-w-none px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
              <EstadoInvalido problemas={problemas} origem="/api/estado" />
            </div>
          )}
          <Rede ondeEstava={vista.nome}>
            <Suspense fallback={<CarregandoTela />}>{desenhar()}</Suspense>
          </Rede>
        </main>
      </div>
    </div>
  )
}
