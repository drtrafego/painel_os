// Rode com:
//   node --experimental-strip-types src/ui/card-comando-modelo.teste.ts
import { corDaSessao } from './paleta.ts'
import { corDoCardComando, leituraEstadoSessao, leituraEstadoSessaoComPresencaAoVivo, llmDoCardComando } from './card-comando-modelo.ts'

let falhas = 0
function conferir(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  if (!ok) falhas++
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
}

for (const id of ['luana', 'renato', 'bia']) {
  conferir(`CardComando usa a mesma cor da Sidebar para ${id}`, corDoCardComando(id), corDaSessao(id))
}

const agora = new Date('2026-09-24T15:00:00-03:00')
conferir(
  'sessão ativa aparece como trabalhando',
  leituraEstadoSessao('ativo', '2026-09-24T14:58:00-03:00', 'luana', agora).texto,
  'trabalhando',
)
conferir(
  'sessão ociosa mostra idade curta em minutos',
  leituraEstadoSessao('ocioso', '2026-09-24T14:12:00-03:00', 'luana', agora).texto,
  'ociosa há 48min',
)
conferir(
  'sessão ociosa mostra idade curta em horas',
  leituraEstadoSessao('ocioso', '2026-09-24T12:01:00-03:00', 'luana', agora).texto,
  'ociosa há 2h',
)
conferir(
  'campo vazio não inventa estado',
  leituraEstadoSessao(undefined, null, 'luana', agora).texto,
  'sem leitura',
)
conferir(
  'presença Codex viva vence snapshot antigo da sessão',
  leituraEstadoSessaoComPresencaAoVivo('ocioso', '2026-09-23T02:00:00Z', 'luana', [
    { id: 'codex-1', dono: 'luana', estado: 'trabalhando', fase: 'atividade_codex', etapa: 'teste' },
  ], agora).texto,
  'trabalhando',
)
conferir(
  'sonda viva sem tarefa não recicla ociosidade histórica',
  leituraEstadoSessaoComPresencaAoVivo('ocioso', '2026-09-23T02:00:00Z', 'luana', [], agora).texto,
  'sem atividade agora',
)

conferir(
  'cartão escolhe a sessão raiz mais recente do dono',
  llmDoCardComando([
    { id: 'filho', dono: 'luana', pai: 'raiz', profundidade: 1, estado: 'trabalhando', silencio_s: 0, modelo_legivel: 'GPT-5.6 Sol', modelo: 'gpt-5.6-sol', esforco: 'alto', fase: '', etapa: '' },
    { id: 'raiz-antiga', dono: 'luana', pai: null, profundidade: 0, estado: 'trabalhando', silencio_s: 60, modelo_legivel: 'GPT-5.6 Terra', modelo: 'gpt-5.6-terra', esforco: 'médio', fase: '', etapa: '' },
    { id: 'raiz-atual', dono: 'luana', pai: null, profundidade: 0, estado: 'trabalhando', silencio_s: 2, modelo_legivel: 'GPT-5.6 Luna', modelo: 'gpt-5.6-luna', esforco: 'máximo (xhigh)', fase: '', etapa: '' },
  ], 'luana'),
  { modelo: 'GPT-5.6 Luna', esforco: 'máximo (xhigh)', medido: true },
)
conferir(
  'cartão declara esforço ausente sem inventar fallback',
  llmDoCardComando([{ id: 'renato', dono: 'renato', pai: null, profundidade: 0, estado: 'trabalhando', silencio_s: 1, modelo_legivel: 'Sonnet 5', modelo: 'claude-sonnet-5', esforco: null, fase: '', etapa: '' }], 'renato'),
  { modelo: 'Sonnet 5', esforco: null, medido: true },
)
conferir(
  'cartão usa modelo de evidência quando a raiz não o expõe',
  llmDoCardComando([
    { id: 'raiz-sem-modelo', dono: 'bia', pai: null, profundidade: 0, estado: 'trabalhando', silencio_s: 1, modelo_legivel: null, modelo: null, esforco: null, fase: '', etapa: '' },
    { id: 'filho-com-modelo', dono: 'bia', pai: 'raiz-sem-modelo', profundidade: 1, estado: 'trabalhando', silencio_s: 2, modelo_legivel: 'Sonnet 5', modelo: 'claude-sonnet-5', esforco: 'alto', fase: '', etapa: '' },
  ], 'bia'),
  { modelo: 'Sonnet 5', esforco: 'alto', medido: true },
)

// ‼️ Concordância de gênero por diretor, fonte única em paleta.ts
// (GENERO_DA_SESSAO). Renato é "ocioso", Luana e Bia são "ociosa".
conferir(
  'Luana ociosa concorda no feminino',
  leituraEstadoSessao('ocioso', '2026-09-24T14:12:00-03:00', 'luana', agora).texto,
  'ociosa há 48min',
)
conferir(
  'Bia ociosa concorda no feminino',
  leituraEstadoSessao('ocioso', '2026-09-24T14:12:00-03:00', 'bia', agora).texto,
  'ociosa há 48min',
)
conferir(
  'Renato ocioso concorda no masculino',
  leituraEstadoSessao('ocioso', '2026-09-24T14:12:00-03:00', 'renato', agora).texto,
  'ocioso há 48min',
)

if (falhas) process.exit(1)
console.log('APROVADO: CardComando compartilha cor canônica e formata estado da sessão.')
