import { useCallback, useSyncExternalStore } from 'react'
import { escreverHash, lerHash, type Rota, type VistaId } from './rotas'

/**
 * O roteador. Hash puro, sem biblioteca: pelo mesmo motivo que os icones e o
 * grafo sao escritos a mao, que e o motivo do proprio autor da referencia
 * ("cuando la interfaz depende de un paquete ajeno, el dia que ese paquete
 * cambia se rompe una pantalla que estaba andando").
 *
 * Hash e nao History API porque este painel e servido por um servidor Python
 * simples: com rota de verdade, recarregar em `/tarefas` daria 404, e o
 * conserto seria mexer no servidor, que hoje esta com outra pessoa.
 *
 * `useSyncExternalStore` e nao `useState` + `useEffect` porque o hash e estado
 * de FORA do React: com efeito, o primeiro render usa o valor velho e a tela
 * pisca na vista errada ao abrir um link direto.
 */
function assinar(aoMudar: () => void) {
  window.addEventListener('hashchange', aoMudar)
  return () => window.removeEventListener('hashchange', aoMudar)
}

function lerAgora() {
  return window.location.hash
}

/** No servidor nao ha `window`. Nao usamos SSR, mas custa uma linha nao quebrar. */
function lerNoServidor() {
  return ''
}

export function useRota() {
  const hash = useSyncExternalStore(assinar, lerAgora, lerNoServidor)
  const rota = lerHash(hash)

  const ir = useCallback((vista: VistaId, quem: string | null = null) => {
    const destino = escreverHash({ vista, quem })
    if (window.location.hash !== destino) window.location.hash = destino
    // Trocar de vista tem que voltar ao topo: a referencia desenhou cada tela
    // pra caber numa dobra, e chegar numa tela nova ja rolada e desorientador.
    window.scrollTo({ top: 0 })
  }, [])

  return { rota, ir } as { rota: Rota; ir: (vista: VistaId, quem?: string | null) => void }
}
