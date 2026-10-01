import type { Rota, VistaId } from '../../nav/rotas'

/** Navegação apenas. Nenhuma fonte de dados ou regra de agentes é duplicada. */
export interface AreaNucleo {
  id: string
  nome: string
  sinal: string
  estacao: string
  vistas: readonly VistaId[]
}
export const AREAS_NUCLEO: readonly AreaNucleo[] = [
  { id: 'inicio', nome: 'Visão geral', sinal: '⌂', estacao: 'Centro de comando', vistas: ['tarefas', 'comando'] },
  { id: 'agentes', nome: 'Agentes', sinal: '◈', estacao: 'Diretores · squads · histórico', vistas: ['diretores'] },
  { id: 'conteudo', nome: 'Conteúdo', sinal: '▧', estacao: 'Estúdio de conteúdo', vistas: ['estudio', 'redes', 'analitica', 'biblioteca'] },
  { id: 'comercial', nome: 'Comercial', sinal: '↗', estacao: 'Central comercial', vistas: ['pipeline', 'chamadas', 'aprovacoes', 'cobrancas'] },
  { id: 'financeiro', nome: 'Financeiro', sinal: '▥', estacao: 'Financeiro', vistas: ['financeiro'] },
  { id: 'conhecimento', nome: 'Conhecimento', sinal: '◇', estacao: 'Cofre de conhecimento', vistas: ['cofre'] },
  { id: 'operacao', nome: 'Operação', sinal: '⌘', estacao: 'Agenda · ferramentas · lacunas', vistas: ['agenda', 'ferramentas', 'falta'] },
]

/** Mantém as URLs anteriores. O comando detalhado continua acessível pela mesma rota. */
export function moduloAberto(rota: Rota): boolean {
  if (rota.vista === 'tarefas') return false
  if (rota.vista === 'comando') return rota.visao === 'painel'
  return true
}
export function normalizarBusca(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()
}
export function validarCobertura(vistas: readonly { id: string }[]) {
  const ids = AREAS_NUCLEO.flatMap(area => [...area.vistas])
  return {
    ausentes: vistas.filter(vista => !ids.includes(vista.id as VistaId)).map(vista => vista.id),
    duplicadas: ids.filter((id, i) => ids.indexOf(id) !== i),
    inexistentes: ids.filter(id => !vistas.some(vista => vista.id === id)),
  }
}
