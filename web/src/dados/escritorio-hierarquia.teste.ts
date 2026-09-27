import type { AgenteVivo } from './tipos.ts'
import { montarArvoreLancadosPor } from '../ui/PixelOffice.tsx'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) {
    console.log(`ok   ${nome}`)
    return
  }
  falhas += 1
  console.error(`FALHOU: ${nome}\n  Obtido:   ${JSON.stringify(obtido)}\n  Esperado: ${JSON.stringify(esperado)}`)
}

const agente = (id: string, quemMandou: string | null, estado: AgenteVivo['estado'] = 'trabalhando'): AgenteVivo => ({
  id,
  nome: id.replace(/-/g, ' '),
  identidade: id,
  dono: 'luana',
  quem_mandou: quemMandou,
  estado,
  fase: 'execução',
  etapa: `tarefa ${id}`,
})

const agentes: AgenteVivo[] = [
  agente('filho-um', 'Luana'),
  agente('filho-dois', 'luana'),
  agente('filho-tres', 'LUANA'),
  agente('neto-um', 'filho-um'),
  agente('encerrado', 'luana', 'parado'),
  agente('outro-dono', 'renato'),
]

const arvore = montarArvoreLancadosPor(agentes, ['luana'])
conferir('três filhos vivos aparecem no primeiro nível', arvore.map((no) => no.agente.id), ['filho-um', 'filho-dois', 'filho-tres'])
conferir('neto fica aninhado no agente que o lançou', arvore[0].filhos.map((no) => no.agente.id), ['neto-um'])
conferir('irmãos sem filhos não recebem o neto', arvore.slice(1).map((no) => no.filhos.length), [0, 0])
conferir('agente parado e agente de outro lançador ficam fora', arvore.flatMap((no) => [no.agente.id, ...no.filhos.map((filho) => filho.agente.id)]), ['filho-um', 'neto-um', 'filho-dois', 'filho-tres'])

const legadoComPai = agente('filho-legado', null)
legadoComPai.pai = 'luana'
conferir('campo pai continua sendo aceito como fallback', montarArvoreLancadosPor([legadoComPai], ['luana']).map((no) => no.agente.id), ['filho-legado'])

const cicloA = agente('ciclo-a', 'ciclo-b')
const cicloB = agente('ciclo-b', 'ciclo-a')
const arvoreCiclo = montarArvoreLancadosPor([cicloA, cicloB], ['ciclo-a', 'ciclo-b'])
const idsCiclo = arvoreCiclo.flatMap((no) => [no.agente.id, ...no.filhos.map((filho) => filho.agente.id)])
conferir('ciclo pai-filho mostra cada agente uma vez só', idsCiclo.sort(), ['ciclo-a', 'ciclo-b'])

if (falhas > 0) process.exit(1)
console.log('\nTodos os testes de hierarquia do escritório passaram com sucesso!')
