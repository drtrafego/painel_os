/**
 * TESTE DO VALIDADOR.
 *
 * Rodar:
 *   cd web && node --experimental-strip-types src/dados/validar.teste.ts
 *
 * ‼️ METADE DESTE ARQUIVO SAO CASOS QUE TEM QUE REPROVAR, e isso e o ponto.
 * Um validador que so foi visto aprovando nao distingue "esta tudo certo" de
 * "eu parei de olhar", e um `return {ok:true}` passaria em qualquer suite que
 * so tivesse caso bom. Cada checagem do validador tem aqui um caso que a faz
 * disparar, PELO NOME, senao um ramo pode ter morrido numa edicao antiga e o
 * teste continuar verde.
 *
 * E o caso bom nao e inventado: e o `estado.json` de verdade, o mesmo que o
 * coletor escreve. Validador que so passa em objeto de laboratorio nao prova
 * nada sobre o arquivo que a tela usa.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validarEstado } from './validar.ts'

const aqui = dirname(fileURLToPath(import.meta.url))
const real: unknown = JSON.parse(readFileSync(join(aqui, 'estado.json'), 'utf8'))

let passou = 0
let falhou = 0

function ok(nome: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou += 1
    console.log(`  ok   ${nome}`)
  } else {
    falhou += 1
    console.log(`  FALHA ${nome}${detalhe ? ` -> ${detalhe}` : ''}`)
  }
}

/** Copia funda, pra um caso nao contaminar o proximo. */
function copia<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Estraga um campo e devolve o objeto. `undefined` remove o campo. */
function estragando(caminho: string[], valor: unknown): unknown {
  const c = copia(real) as Record<string, unknown>
  let alvo: any = c
  for (let i = 0; i < caminho.length - 1; i++) {
    const passo = caminho[i]
    const proximo = caminho[i + 1]
    if (/^\d+$/.test(passo)) {
      if (alvo[passo] === undefined || alvo[passo] === null) alvo[passo] = {}
      alvo = alvo[passo]
      continue
    }
    if (alvo[passo] === undefined || alvo[passo] === null) {
      // O snapshot versionado pode não ter ainda um ramo opcional (por
      // exemplo, fontes recebidas ou arestas de SOP). Materializa só o
      // caminho do caso negativo, sem inventar dados no estado de referência.
      if (passo === 'fontes_recebidas') {
        alvo[passo] = {
          itens: [{
            id: 'drive-0709', tipo: 'google_drive', origem: 'Google Drive compartilhado pelo Gastão',
            url: 'https://drive.google.com/drive/folders/147lM3cbpqmDcT1zWlIH1iuJiwhsv8FSk',
            recebido_em: '2026-09-09T13:17:26Z', estado: 'recebido_nao_importado', conjuntos: 5,
            arquivos: 51, bytes: 40340869, por_tipo: { png: 29, python: 9, jpg: 5, mp4: 4, json: 2, txt: 2 },
            observacao: 'Inventário registrado no recebimento. Este lote ainda não foi incorporado ao posts.json nem publicado.',
            assinatura_inventario_sha256: '64a39bf4047c9270e3d4482acf69f94b41883eaa968e9ee6952c0519b4a3cd53',
          }],
        }
      } else if (passo === 'arestas' && caminho[i - 1] === 'sops') {
        alvo[passo] = [{ de: 'sop-conteudo', para: 'agente:luana', tipo: 'executa', evidencia: 'skill:sop-conteudo/SKILL.md' }]
      } else {
        alvo[passo] = /^\d+$/.test(proximo) ? [] : {}
      }
    }
    alvo = alvo[passo]
  }
  const ultimo = caminho[caminho.length - 1]
  if (valor === undefined) delete alvo[ultimo]
  else alvo[ultimo] = valor
  return c
}

console.log('\nO CASO BOM: o estado.json de verdade')
{
  const r = validarEstado(real)
  ok('o estado real passa', r.ok, r.ok ? '' : (r.problemas ?? []).slice(0, 4).join(' | '))
}

console.log('\nOS CASOS QUE TEM QUE REPROVAR (se algum passar, o validador parou de olhar)')

/** Cada caso: nome, o objeto estragado, e um pedaco do problema esperado. */
const RUINS: [string, unknown, string][] = [
  ['nao e objeto', 42, 'esperava objeto'],
  ['nulo', null, 'esperava objeto'],
  ['lista no lugar do estado', [], 'esperava objeto'],
  ['sem gerado_em', estragando(['gerado_em'], undefined), 'gerado_em'],
  ['gerado_em com data ilegivel', estragando(['gerado_em'], 'ontem de tarde'), 'não sabe ler'],
  ['resumo faltando', estragando(['resumo'], undefined), 'estado.resumo'],
  ['numero do resumo virou texto', estragando(['resumo', 'agentes_casa'], '31'), 'agentes_casa'],
  ['numero do resumo virou nulo', estragando(['resumo', 'convocacoes_total'], null), 'convocacoes_total'],
  ['agentes nao e lista', estragando(['agentes'], {}), 'estado.agentes'],
  ['squads faltando', estragando(['squads'], undefined), 'estado.squads'],
  ['cron.jobs nao e lista', estragando(['cron', 'jobs'], 'todos'), 'cron.jobs'],
  ['sessao nao e lista', estragando(['sessao'], null), 'estado.sessao'],
  ['diretiva com status inventado', estragando(['diretiva', 'status'], 'talvez'), 'estado.diretiva.status'],
  ['diretiva sem objetivo', estragando(['diretiva', 'objetivo'], undefined), 'estado.diretiva.objetivo'],
  ['SOP com responsável inventado', estragando(['sops', 'itens', '0', 'responsavel'], 'ninguém'), 'responsavel'],
  ['SOP com entradas fora de lista', estragando(['sops', 'itens', '0', 'entradas'], 'qualquer coisa'), 'entradas'],
  ['aresta de SOP com tipo inventado', estragando(['sops', 'arestas', '0', 'tipo'], 'imagina'), 'arestas[0].tipo'],
  ['fonte do Estúdio com link fora do Drive', estragando(['pecas', 'fontes_recebidas', 'itens', '0', 'url'], 'javascript:alert(1)'), 'url'],
  ['fonte do Estúdio com observação livre', estragando(['pecas', 'fontes_recebidas', 'itens', '0', 'observacao'], 'Arquivos da Cliente Teste'), 'observacao'],
  ['fonte do Estúdio sem fuso', estragando(['pecas', 'fontes_recebidas', 'itens', '0', 'recebido_em'], '2026-09-09T13:17:26'), 'sem fuso'],
  ['fonte do Estúdio com contagem negativa', estragando(['pecas', 'fontes_recebidas', 'itens', '0', 'arquivos'], -1), 'contagens'],
  ['fonte do Estúdio com tipo livre', estragando(['pecas', 'fontes_recebidas', 'itens', '0', 'por_tipo'], { 'nome-de-cliente': 51 }), 'tipo não permitido'],
]

for (const [nome, valor, esperado] of [
  ['caminho privado em campo novo', '/opt/segredo/arquivo.txt', 'caminho privado'],
  ['e-mail em campo novo', 'pessoa@exemplo.com', 'e-mail'],
  ['token em campo novo', 'Bearer segredo123456789', 'formato de segredo'],
] as const) {
  const c = copia(real) as Record<string, unknown>
  c.campo_novo_aninhado = { valor }
  RUINS.push([nome, c, esperado])
}
{
  const c = copia(real) as Record<string, unknown>
  c.integracao_nova = { api_key: 'mascarada' }
  RUINS.push(['chave de credencial em campo novo', c, 'chave de credencial proibida'])
}

for (const [nome, objeto, esperado] of RUINS) {
  const r = validarEstado(objeto)
  const reprovou = !r.ok
  const disseOMotivo = !r.ok && (r.problemas ?? []).some((p) => p.includes(esperado))
  ok(`${nome}: reprova`, reprovou)
  if (reprovou) ok(`${nome}: diz onde ("${esperado}")`, disseOMotivo, (r as { problemas: string[] }).problemas.slice(0, 3).join(' | '))
}

console.log('\nOS CASOS DENTRO DE UMA LISTA (o erro tem que vir com o indice)')
{
  const c = copia(real) as { agentes: Record<string, unknown>[] }
  c.agentes[2].linhas = 'muitas'
  const r = validarEstado(c)
  ok('agente com campo errado reprova', !r.ok)
  ok(
    'e o problema aponta o indice e o campo',
    !r.ok && (r.problemas ?? []).some((p) => p.includes('agentes[2].linhas')),
    !r.ok ? r.problemas[0] : '',
  )
}
{
  const c = copia(real) as { agentes: Record<string, unknown>[] }
  c.agentes[0].squad = 'esquadrao-que-nao-existe'
  const r = validarEstado(c)
  ok('esquadrao desconhecido reprova', !r.ok)
}
{
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  ;(c.sessao[0].verificador as Record<string, unknown>).falhas = [{ desde: 'ontem' }]
  const r = validarEstado(c)
  ok('falha sem o_que reprova', !r.ok)
  ok(
    'e aponta a falha certa',
    !r.ok && (r.problemas ?? []).some((p) => p.includes('falhas[0].o_que')),
    !r.ok ? (r.problemas ?? []).join(' | ').slice(0, 120) : '',
  )
}

// O bloco `motores` nasceu em 10/09. Ele e OPCIONAL, entao o risco dele nao e
// reprovar demais: e passar calado com o campo torto e virar pilula em branco.
// Cada ramo abaixo dispara uma checagem diferente, pelo nome.
{
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  ;(c.sessao[0].motores as Record<string, unknown>).situacao = 'meio_ativo'
  const r = validarEstado(c)
  ok('situacao de motor inventada reprova', !r.ok)
  ok(
    'e aponta o campo certo',
    !r.ok && (r.problemas ?? []).some((p) => p.includes('motores.situacao')),
    !r.ok ? (r.problemas ?? []).join(' | ').slice(0, 140) : '',
  )
}
{
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  const m = c.sessao[0].motores as { servicos: Record<string, unknown>[] }
  delete m.servicos[0].motor_fonte
  const r = validarEstado(c)
  ok('service sem a fonte do motor reprova', !r.ok)
  ok(
    'e aponta a fonte que falta',
    !r.ok && (r.problemas ?? []).some((p) => p.includes('servicos[0].motor_fonte')),
    !r.ok ? (r.problemas ?? []).join(' | ').slice(0, 140) : '',
  )
}
{
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  const m = c.sessao[0].motores as { servicos: Record<string, unknown>[] }
  m.servicos[0].existe = 'sim'
  const r = validarEstado(c)
  ok('existe fora de booleano/nulo reprova', !r.ok)
}
{
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  ;(c.sessao[0].motores as Record<string, unknown>).ativos = 'luana.service'
  const r = validarEstado(c)
  ok('lista de ativos que nao e lista reprova', !r.ok)
}
{
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  c.sessao[0].service_prefixo = 42
  const r = validarEstado(c)
  ok('sessao com service_prefixo inválido reprova', !r.ok)
}

console.log('\nO QUE TEM QUE CONTINUAR PASSANDO (senao o validador e rigido demais e alguem desliga)')
{
  // Snapshot gravado antes de 10/09 nao tem `motores`. Ausente ele passa e a
  // tela escreve "nao medido": derrubar a tela inteira seria pior que a falta.
  const c = copia(real) as { sessao: Record<string, unknown>[] }
  delete c.sessao[0].motores
  const r = validarEstado(c)
  ok('estado antigo, sem o campo motores, continua valido', r.ok, r.ok ? '' : (r.problemas ?? []).join(' | ').slice(0, 140))
}
{
  const c = copia(real) as Record<string, unknown>
  c.campo_que_o_coletor_ganhou_depois = { qualquer: 'coisa' }
  ok('campo novo no topo passa', validarEstado(c).ok)
}
{
  const c = copia(real) as { agentes: Record<string, unknown>[] }
  c.agentes[0].modelo = null
  c.agentes[0].ferramentas = null
  c.agentes[0].convocacoes = null
  c.agentes[0].ultima_convocacao = null
  ok('nulo onde o coletor pode nao ter medido passa', validarEstado(c).ok)
}
{
  const c = copia(real) as Record<string, unknown>
  delete c.arestas
  ok('estado sem `arestas` (anterior a 08/09) passa', validarEstado(c).ok)
}
{
  const c = copia(real) as { arestas?: unknown[] }
  c.arestas = [{ de: 'a', de_tipo: 'sessao', para: 'b', vezes: 2 }]
  ok('aresta bem formada passa', validarEstado(c).ok)
  c.arestas = [{ de: 'a', de_tipo: 'telepatia', para: 'b', vezes: 2 }]
  ok('aresta com de_tipo inventado reprova', !validarEstado(c).ok)
}

// ‼️ AS TRAVAS DO COFRE, com controle. Elas nasceram em 10/09 e ficaram um dia
// VIVAS E SEM TESTE: o QA provou que funcionavam naquele momento, e sem caso
// aqui a próxima edição as apaga sem ninguém ver. Regra que mora onde alguém
// decide, a próxima edição apaga; regra com teste, não.
{
  const c = copia(real) as { cofre?: { nos: Record<string, unknown>[]; arestas: Record<string, unknown>[] } }
  if (!c.cofre?.nos?.length) {
    ok('o estado de referência tem Cofre pra estas travas medirem alguma coisa', false,
      'sem `cofre` no estado: as checagens abaixo passariam por não estar olhando nada')
  } else {
    ok('o Cofre real passa como está', validarEstado(copia(real)).ok)

    const nos = copia(real) as { cofre: { nos: Record<string, unknown>[] } }
    nos.cofre.nos.push({ ...nos.cofre.nos[0] })
    const rep = validarEstado(nos)
    ok('id de nó repetido REPROVA', !rep.ok && (rep.problemas ?? []).some((x) => x.includes('id repetido')),
      (rep.problemas ?? []).slice(0, 2).join(' | '))

    const orfa = copia(real) as { cofre: { arestas: Record<string, unknown>[] } }
    if (orfa.cofre.arestas.length) {
      orfa.cofre.arestas[0].para = 'nó-que-nunca-existiu'
      const r = validarEstado(orfa)
      ok('aresta apontando pra nó inexistente REPROVA',
        !r.ok && (r.problemas ?? []).some((x) => x.includes('inexistente')),
        (r.problemas ?? []).slice(0, 2).join(' | '))
    }

    // E os campos do aprendizado, que a ficha desenha: sem eles a tela mostra
    // `undefined` no meio do texto, que é o zero calado em forma de tela.
    for (const campo of ['autor', 'corpo', 'caso', 'especie', 'area', 'familia', 'quando']) {
      const falta = copia(real) as { cofre: { nos: Record<string, unknown>[] } }
      delete falta.cofre.nos[0][campo]
      const r = validarEstado(falta)
      ok(`nó do Cofre sem \`${campo}\` REPROVA`, !r.ok && (r.problemas ?? []).some((x) => x.includes(campo)),
        (r.problemas ?? []).slice(0, 1).join(''))
    }
    const semPonte = copia(real) as { cofre: { arestas: Record<string, unknown>[] } }
    if (semPonte.cofre.arestas.length) {
      delete semPonte.cofre.arestas[0].ponte
      const r = validarEstado(semPonte)
      ok('aresta sem `ponte` REPROVA, porque é ela que o filtro não pode esconder',
        !r.ok && (r.problemas ?? []).some((x) => x.includes('ponte')), (r.problemas ?? []).slice(0, 1).join(''))
    }

    // ‼️ E O RESTO DO BLOCO, que ficou sem caso na primeira leva: o QA desligou
    // cada uma destas checagens e o teste seguiu verde. Trava sem caso que a
    // faça disparar pelo nome é trava que já morreu uma vez nesta casa.
    const detalhe = (r: { problemas?: string[] }) => (r.problemas ?? []).slice(0, 1).join('')
    for (const campo of ['vencido', 'linhas', 'peso', 'grau', 'modificado', 'rotulo', 'arquivo', 'tipo', 'id']) {
      const c = copia(real) as { cofre: { nos: Record<string, unknown>[] } }
      if (!(campo in c.cofre.nos[0])) c.cofre.nos[0][campo] = campo === 'modificado' || campo === 'tipo' ? 42 : campo === 'vencido' ? false : campo === 'peso' || campo === 'grau' || campo === 'linhas' ? 1 : 'valor de teste'
      else delete c.cofre.nos[0][campo]
      const r = validarEstado(c)
      ok(`nó do Cofre sem \`${campo}\` REPROVA`,
        !r.ok && (r.problemas ?? []).some((x) => x.includes(campo)), detalhe(r))
    }
    for (const campo of ['porque', 'de', 'para']) {
      const c = copia(real) as { cofre: { arestas: Record<string, unknown>[] } }
      if (!c.cofre.arestas.length) break
      delete c.cofre.arestas[0][campo]
      const r = validarEstado(c)
      ok(`aresta do Cofre sem \`${campo}\` REPROVA`,
        !r.ok && (r.problemas ?? []).some((x) => x.includes(campo)), detalhe(r))
    }
    for (const eixo of ['areas', 'familias']) {
      for (const campo of ['total', 'nome', 'id']) {
        const c = copia(real) as { cofre: Record<string, Record<string, unknown>[]> }
        if (!c.cofre[eixo]?.length) continue
        if (!(campo in c.cofre[eixo][0])) c.cofre[eixo][0][campo] = campo === 'total' ? 'texto onde ia número' : 'valor de teste'
        else delete c.cofre[eixo][0][campo]
        const r = validarEstado(c)
        ok(`\`${eixo}\` sem \`${campo}\` REPROVA`,
          !r.ok && (r.problemas ?? []).some((x) => x.includes(campo)), detalhe(r))
      }
    }
    // O ÚLTIMO ÓRFÃO do bloco: a checagem de que as quatro contagens são lista.
    // É ela que segura o banner de conferência, que faz `cofre.vencidos.length`
    // direto: com um objeto ali, a tela quebra em vez de avisar.
    for (const conta of ['vencidos', 'truncados', 'recusados', 'arestas_recusadas']) {
      const c = copia(real) as { cofre: Record<string, unknown> }
      c.cofre[conta] = { nao: 'sou lista' }
      const r = validarEstado(c)
      ok(`\`cofre.${conta}\` que não é lista REPROVA`,
        !r.ok && (r.problemas ?? []).some((x) => x.includes(conta)), detalhe(r))
    }
    for (const campo of ['arquivo', 'erro', 'grau_medio', 'cobertura']) {
      const c = copia(real) as { cofre: Record<string, unknown> }
      // `erro` aceita texto OU nulo, então mandar texto ali não é tipo errado:
      // o caso tem que ser número, senão o teste "reprova" o próprio teste.
      c.cofre[campo] = campo === 'arquivo' || campo === 'erro' ? 42 : 'texto onde ia número'
      const r = validarEstado(c)
      ok(`\`cofre.${campo}\` com tipo errado REPROVA`,
        !r.ok && (r.problemas ?? []).some((x) => x.includes(campo)), detalhe(r))
    }
  }
}

console.log(`\n${passou} passaram, ${falhou} falharam`)
if (falhou > 0) process.exit(1)
