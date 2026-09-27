import { ambienteForcadoDaUrl, minutosEmBrasilia, resolverAmbiente } from './ambiente.ts'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) console.log(`ok   ${nome}`)
  else {
    falhas += 1
    console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`)
  }
}

const data = (hora: string) => new Date(`2026-09-27T${hora}:00-03:00`)

conferir('modo forçado da URL aceita dia/noite/auto', ambienteForcadoDaUrl('?ambiente=dia') === 'dia' && ambienteForcadoDaUrl('?ambiente=noite') === 'noite' && ambienteForcadoDaUrl('?ambiente=auto') === 'auto')
conferir('modo inválido volta ao automático', ambienteForcadoDaUrl('?ambiente=qualquer') === 'auto')
conferir('a hora usada é a de Brasília', minutosEmBrasilia(data('06:00')) === 360)
conferir('06:00 é dia', resolverAmbiente(data('06:00')).progressoDia === 1 && resolverAmbiente(data('06:00')).fase === 'dia')
conferir('05:45 está no meio do amanhecer', resolverAmbiente(data('05:45')).fase === 'transicao' && resolverAmbiente(data('05:45')).progressoDia === 0.5)
conferir('18:00 inicia o anoitecer', resolverAmbiente(data('18:00')).fase === 'transicao' && resolverAmbiente(data('18:00')).progressoDia === 1)
conferir('18:15 está no meio do anoitecer', resolverAmbiente(data('18:15')).progressoDia === 0.5)
conferir('modo forçado não depende da hora', resolverAmbiente(data('02:00'), 'dia').progressoDia === 1 && resolverAmbiente(data('14:00'), 'noite').progressoDia === 0)

if (falhas) process.exit(1)
console.log('\nTodos os testes de ambiente passaram!')
