/**
 * Construtor de URLs para a API do Painel OS.
 */

export function apiUrl(caminho: string): string {
  const limpo = caminho.startsWith('/') ? caminho.slice(1) : caminho
  return `/api/${limpo}`
}
