import { lerMotores, nomeMotor } from './motores.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

conferir(
  'modelo e esforço acompanham o motor na mesma leitura',
  nomeMotor('Codex', 'gpt-5.6-luna', 'xhigh'),
  'Codex · gpt-5.6-luna · xhigh',
)
conferir(
  'resumo do service ativo mostra modelo e esforço',
  lerMotores({ situacao: 'um_ativo', motor: 'Claude Code', modelo: 'claude-opus-4-6', esforco: 'high' }).rotulo,
  'Claude Code · claude-opus-4-6 · high',
)

if (falhas) process.exit(1)
console.log('APROVADO: a tela mostra motor, modelo e esforço juntos.')
