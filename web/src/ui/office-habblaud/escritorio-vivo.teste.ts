import type { ExecucaoVisual } from '../PixelOffice'
import { desenharEscritorioV7, type OfficeV7Frame } from '../office-v7/OfficeV7.ts'
import {
  atualizarPresencaVivo,
  avancarSalasVivo,
  cenaDoVivo,
  DURACAO_MONTAGEM_SALA_MS,
  ESPERA_DESMONTAR_SALA_MS,
  liberarSaidasConcluidas,
  LIMITE_SAIDA_MS,
  presencaVazia,
} from './escritorio-vivo.ts'

let falhas = 0
function conferir(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) console.log(`ok   ${nome}`)
  else { falhas += 1; console.error(`FALHOU: ${nome}${detalhe ? ` (${detalhe})` : ''}`) }
}

function visual(chave: string, squad: string, estado: 'trabalhando' | 'silencioso' | 'parado'): ExecucaoVisual {
  return {
    chave, animacaoChave: chave, nome: chave, squad, squadNome: squad, ativa: estado === 'trabalhando',
    execucao: { id: chave, estado } as ExecucaoVisual['execucao'],
  } as ExecucaoVisual
}

// Presença: entra trabalhando, sai como "parado" e só some quando chega à recepção.
let p = atualizarPresencaVivo(presencaVazia(), [visual('a', 'bots', 'trabalhando'), visual('b', 'bots', 'parado')], 0)
conferir('só quem trabalha entra na cena', cenaDoVivo(p).map((v) => v.chave).join() === 'a')
p = atualizarPresencaVivo(p, [visual('a', 'bots', 'silencioso')], 1000)
const saida = p.saindo.get('a')
conferir('quem para de trabalhar vira saída, não some no mesmo quadro', cenaDoVivo(p).length === 1 && Boolean(saida))
conferir('a saída caminha como "parado" e apaga a luz (ativa=false)', saida?.visual.execucao.estado === 'parado' && saida?.visual.ativa === false)
conferir('liberar não remove quem ainda está caminhando', liberarSaidasConcluidas(p, () => 'caminhando_para_descanso', 2000) === null)
const liberada = liberarSaidasConcluidas(p, () => 'descanso', 2000)
conferir('chegou à recepção: sai da cena', liberada !== null && cenaDoVivo(liberada).length === 0)
conferir('saída presa é liberada pela rede de segurança', liberarSaidasConcluidas(p, () => 'levantando', 1000 + LIMITE_SAIDA_MS + 1) !== null)

let q = atualizarPresencaVivo(presencaVazia(), [visual('t', 'sala mista', 'trabalhando')], 0)
q = atualizarPresencaVivo(q, [], 500)
conferir('execução que some da sonda também sai caminhando', q.saindo.get('t')?.visual.squad === 'sala mista')
q = atualizarPresencaVivo(q, [visual('t', 'sala mista', 'trabalhando')], 800)
conferir('quem volta a trabalhar no meio da saída cancela a saída', q.saindo.size === 0 && q.presentes.has('t'))

// Salas: montagem, espera com luz apagada, desmontagem.
const squads = ['bots', 'tráfego']
let salas = avancarSalasVivo(new Map(), new Set(['bots']), squads, DURACAO_MONTAGEM_SALA_MS / 2, 0, false)
conferir('sala ocupada começa a montar', Math.abs((salas.get('bots')?.progresso ?? 0) - 0.5) < 1e-9)
conferir('sala sem ninguém não existe', salas.get('tráfego')?.progresso === 0)
salas = avancarSalasVivo(salas, new Set(['bots']), squads, DURACAO_MONTAGEM_SALA_MS, 600, false)
conferir('montagem termina em 1', salas.get('bots')?.progresso === 1)
salas = avancarSalasVivo(salas, new Set(), squads, 100, 1000, false)
conferir('último saiu: a sala espera antes de desmontar', salas.get('bots')?.progresso === 1)
salas = avancarSalasVivo(salas, new Set(), squads, DURACAO_MONTAGEM_SALA_MS / 4, 1000 + ESPERA_DESMONTAR_SALA_MS, false)
conferir('depois da espera a sala desmonta', (salas.get('bots')?.progresso ?? 1) < 1 && (salas.get('bots')?.progresso ?? 0) > 0)
salas = avancarSalasVivo(salas, new Set(['bots']), squads, 0, 5000, false)
conferir('squad volta a trabalhar: zera a espera', salas.get('bots')?.vaziaDesde === null)
const reduzidas = avancarSalasVivo(new Map(), new Set(['bots']), squads, 0, 0, true)
conferir('movimento reduzido monta a sala na hora', reduzidas.get('bots')?.progresso === 1)

// Renderer: o modo vivo obedece o progresso; o V8 continua ignorando.
function contexto() {
  const canvas = { dataset: {} as DOMStringMap }
  let gradientes = 0
  const ctx = new Proxy({ canvas }, {
    get(alvo, prop) {
      if (prop in alvo) return alvo[prop as keyof typeof alvo]
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => { gradientes += 1; return { addColorStop() {} } }
      return () => undefined
    },
    set() { return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, canvas, gradientes: () => gradientes }
}
function frame(progresso: number, modoVivo: boolean, ativa = true): OfficeV7Frame {
  const area = { x: 0, z: 0, largura: 1, profundidade: 1 }
  const agente = { chave: 'bots-1', nome: 'bots', squad: 'bots', tipoVisual: 'robo' as const, ativa, ordem: 1, execucao: { estado: ativa ? 'trabalhando' : 'parado' } }
  return {
    layout: {
      largura: 1430, altura: 820,
      arquitetura: {
        salas: [{ id: 'squad-bots', label: 'BOTS', tipo: 'squad', squad: 'bots', x: 100, z: 100, largura: 300, profundidade: 180, alturaVidro: 90, abertura: 70, ativa, ocupantes: ativa ? 1 : 0 }],
        corredor: area, recepcao: area, lounge: area, coordenacao: area, planoAberto: area,
      },
      ilhas: [{ squad: 'bots', postos: [{ x: 130, y: 150 }, { x: 160, y: 150 }] }],
      mesas: [{ x: 130, y: 150, execucao: agente }],
    },
    personagens: [], tempo: 0, progressoDia: 0, reduzirMovimento: false,
    progressos: new Map([['bots', progresso]]), modoVivo,
  }
}
const vazio = contexto(); const hitsVazio = desenharEscritorioV7(vazio.ctx, frame(0, true))
const montada = contexto(); const hitsMontada = desenharEscritorioV7(montada.ctx, frame(1, true))
conferir('vivo: sala com progresso 0 não desenha mobília', vazio.gradientes() < montada.gradientes(), `${vazio.gradientes()}/${montada.gradientes()}`)
conferir('vivo: sala desmontada não é clicável', !hitsVazio.some((h) => h.chave === 'bots-1') && hitsMontada.some((h) => h.chave === 'bots-1'))
conferir('vivo: canvas declara o modo e as salas visíveis', montada.canvas.dataset.officeMode === 'vivo' && montada.canvas.dataset.officeVisibleModules === '1' && vazio.canvas.dataset.officeVisibleModules === '0')
const apagada = contexto(); desenharEscritorioV7(apagada.ctx, frame(1, true, false))
conferir('vivo: sala acesa só com alguém trabalhando', montada.canvas.dataset.officeLitModules === '1' && apagada.canvas.dataset.officeLitModules === '0')
const v8zero = contexto(); desenharEscritorioV7(v8zero.ctx, frame(0, false))
const v8um = contexto(); desenharEscritorioV7(v8um.ctx, frame(1, false))
conferir('V8 sem modo vivo ignora progresso 0 (sala física preservada)', v8zero.gradientes() === v8um.gradientes())
conferir('V8 sem modo vivo não ganha atributo de modo', v8um.canvas.dataset.officeMode === undefined)

if (falhas) { console.error(`${falhas} falha(s) em escritorio-vivo.teste.ts`); process.exit(1) }
