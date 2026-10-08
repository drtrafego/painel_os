/**
 * Tradução visual dos estados do motor de IA dos agentes da sessão.
 */

export type Tom = 'verde' | 'lima' | 'ambar' | 'vermelho' | 'neutro'

export type MotorInfo = {
  tom: Tom
  rotulo: string
  detalhe: string
}

export type ServicoMotor = {
  service: string
  existe?: boolean | null
  estado?: string | null
  sub?: string | null
  ativo?: boolean
  motor?: string | null
  modelo?: string | null
  esforco?: string | null
  motor_fonte?: string
}

export type MotoresSessao = {
  situacao?: 'um_ativo' | 'varios_ativos' | 'nenhum_ativo' | 'indeterminado'
  motivo?: string | null
  motor?: string | null
  modelo?: string | null
  esforco?: string | null
  ativos?: string[]
  servicos?: ServicoMotor[]
}

export function lerMotores(dados?: MotoresSessao | null): MotorInfo {
  if (!dados || !dados.situacao) {
    return {
      tom: 'neutro',
      rotulo: 'não medido',
      detalhe: 'estado dos services não medido',
    }
  }

  switch (dados.situacao) {
    case 'um_ativo':
      return {
        tom: 'verde',
        rotulo: nomeMotor(dados.motor, dados.modelo, dados.esforco),
        detalhe: dados.servicos ? `${dados.servicos.filter((s) => s.ativo).length} no ar` : '1 service ativo',
      }
    case 'varios_ativos':
      return {
        tom: 'vermelho',
        rotulo: `conflito: ${dados.ativos?.length ?? 'vários'} no ar`,
        detalhe: dados.motivo ?? 'dois ou mais services do mesmo agente no ar ao mesmo tempo',
      }
    case 'nenhum_ativo':
      return {
        tom: 'ambar',
        rotulo: 'fora do ar',
        detalhe: dados.motivo ?? 'nenhum service em execução',
      }
    case 'indeterminado':
    default:
      return {
        tom: 'neutro',
        rotulo: 'indeterminado',
        detalhe: dados.motivo ?? 'a sonda do systemd não respondeu',
      }
  }
}

export function nomeMotor(motor?: string | null, modelo?: string | null, esforco?: string | null): string {
  const motorLegivel = motor || 'motor não identificado'
  return [motorLegivel, modelo, esforco].filter(Boolean).join(' · ')
}

export function descreverServico(s: ServicoMotor): string {
  if (!s.existe) return 'não instalado'
  if (s.ativo) return 'ativo'
  return s.sub ?? s.estado ?? 'parado'
}
