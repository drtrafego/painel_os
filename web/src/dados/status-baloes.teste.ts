import { statusSeguroDaExecucao, type PessoaRpg } from '../ui/PixelOffice.rpg-data.ts'

const base: PessoaRpg = {
  chave: 'teste', animacaoChave: 'teste', nome: 'Agente', squad: 'bots', squadNome: 'Bots',
  cor: '#74c7c7', corEscura: '#173f3f', destaque: '#e1b657', cabelo: '#000000', pele: '#ffffff',
  acessorio: 0, ativa: true, temporaria: true, ordem: 0, objeto: 'codigo', tipoVisual: 'robo',
  execucao: { estado: 'trabalhando', ferramenta: 'Read' },
}

function conferir(nome: string, atual: unknown, esperado: unknown) {
  if (atual !== esperado) throw new Error(`${nome}: esperado ${String(esperado)}, recebeu ${String(atual)}`)
}

conferir('lead com PII vira categoria', statusSeguroDaExecucao({ ...base, execucao: { ...base.execucao, tarefa: 'Responder Maria Silva no WhatsApp +55 11 99999-9999 sobre R$ 9.000' } }), 'Respondendo lead')
conferir('contrato com CPF vira categoria', statusSeguroDaExecucao({ ...base, execucao: { ...base.execucao, tarefa: 'Contrato de João, CPF 123.456.789-00' } }), 'Gerando contrato')
conferir('documento vira ação segura', statusSeguroDaExecucao({ ...base, execucao: { ...base.execucao, tarefa: 'Revisar documento cliente@example.com' } }), 'Revisando documento')
conferir('metadado técnico vira ação', statusSeguroDaExecucao({ ...base, execucao: { ...base.execucao, tarefa: 'Implementar sprite robô em TypeScript' } }), 'Criando interface')
conferir('frase desconhecida nunca é repetida', statusSeguroDaExecucao({ ...base, objeto: 'cafe', execucao: { ...base.execucao, ferramenta: null, tarefa: 'Segredo literal sem palavras classificadas' } }), 'Processando tarefa')
conferir('inativo não mostra balão', statusSeguroDaExecucao({ ...base, ativa: false }), null)

console.log('APROVADO: balões usam somente categorias seguras e não repetem texto operacional bruto.')
