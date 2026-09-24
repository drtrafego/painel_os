/** Validação de runtime do contrato público do painel. */

import type { Estado } from './tipos'

export type ResultadoValidacao =
  | { ok: true; estado: Estado }
  | { ok: false; problemas: string[] }

type Registro = Record<string, unknown>
type Contexto = { problemas: string[]; idsAgentes: Set<string>; idsSessoes: Set<string>; squads: Set<string> }

const TIPOS_ARESTA = new Set(['sessao', 'agente', 'sem-cargo', 'desconhecido'])
const TIPOS_ARESTA_SOP = new Set(['fundamenta', 'responsável', 'executa', 'usa'])
const TIPOS_ARQUIVO_ESTUDIO = new Set(['docx', 'jpeg', 'jpg', 'json', 'mp4', 'pdf', 'png', 'python', 'svg', 'txt', 'webp', 'zip'])
const ESTADOS_FONTE = new Set(['recebido_nao_importado', 'importado'])
const ESTADOS_MOTOR = new Set(['um_ativo', 'varios_ativos', 'nenhum_ativo', 'indeterminado'])
const ESTADOS_SESSAO = new Set(['ativo', 'ocioso', 'sem_sessao', 'indeterminado'])
const STATUS_DIRETIVA = new Set(['ativa', 'concluida', 'cancelada', 'pausada', 'erro'])

function objeto(v: unknown): v is Registro {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function caminho(parent: string, key: string | number): string { return typeof key === 'number' ? `${parent}[${key}]` : `${parent}.${key}` }
function texto(ctx: Contexto, v: unknown, p: string, obrigatorio = true): v is string {
  if (typeof v !== 'string' || (obrigatorio && v.trim() === '')) { ctx.problemas.push(`${p}: esperado texto`); return false }
  return true
}
function numero(ctx: Contexto, v: unknown, p: string, inteiro = false, naoNegativo = false): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || (inteiro && !Number.isInteger(v)) || (naoNegativo && v < 0)) { ctx.problemas.push(`${p}: esperado número${inteiro ? ' inteiro' : ''}${naoNegativo ? ' não negativo' : ''}`); return false }
  return true
}
function booleano(ctx: Contexto, v: unknown, p: string): v is boolean { if (typeof v !== 'boolean') { ctx.problemas.push(`${p}: esperado booleano`); return false }; return true }
function lista(ctx: Contexto, v: unknown, p: string): v is unknown[] { if (!Array.isArray(v)) { ctx.problemas.push(`${p}: esperado lista`); return false }; return true }
function objetoObrigatorio(ctx: Contexto, v: unknown, p: string): v is Registro { if (!objeto(v)) { ctx.problemas.push(`${p}: esperava objeto`); return false }; return true }
function opcionalTexto(ctx: Contexto, v: unknown, p: string, nulo = false) { if (v !== undefined && !(nulo && v === null)) texto(ctx, v, p) }
function opcionalNumero(ctx: Contexto, v: unknown, p: string, nulo = false, inteiro = false, naoNegativo = false) { if (v !== undefined && !(nulo && v === null)) numero(ctx, v, p, inteiro, naoNegativo) }
function dataIso(ctx: Contexto, v: unknown, p: string, obrigatoria = true) {
  if (v === undefined && !obrigatoria) return
  if (typeof v !== 'string' || !v.trim() || !Number.isFinite(Date.parse(v))) { ctx.problemas.push(`${p}: não sabe ler data ISO 8601`); return }
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) ctx.problemas.push(`${p}: sem fuso (data ISO 8601)`)
}
function dataDia(ctx: Contexto, v: unknown, p: string) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) { ctx.problemas.push(`${p}: data não sabe ler (esperado AAAA-MM-DD)`); return }
  const data = new Date(`${v}T00:00:00Z`)
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== v) ctx.problemas.push(`${p}: data não sabe ler (esperado AAAA-MM-DD)`)
}
function listaTextos(ctx: Contexto, v: unknown, p: string) { if (lista(ctx, v, p)) v.forEach((item, i) => texto(ctx, item, caminho(p, i))) }
function mapaNumeros(ctx: Contexto, v: unknown, p: string, inteiro = true) { if (objetoObrigatorio(ctx, v, p)) for (const [chave, valor] of Object.entries(v)) numero(ctx, valor, `${p}.${chave}`, inteiro, true) }
function mapaTextos(ctx: Contexto, v: unknown, p: string) { if (objetoObrigatorio(ctx, v, p)) for (const [chave, valor] of Object.entries(v)) texto(ctx, valor, `${p}.${chave}`) }

function validarAgentes(ctx: Contexto, v: unknown) {
  if (!lista(ctx, v, 'estado.agentes')) return
  const ids = new Set<string>()
  v.forEach((item, i) => {
    const p = `estado.agentes[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return
    if (texto(ctx, item.id, `${p}.id`)) { if (ids.has(item.id)) ctx.problemas.push(`${p}.id: id repetido`); ids.add(item.id); ctx.idsAgentes.add(item.id) }
    texto(ctx, item.nome, `${p}.nome`)
    if (texto(ctx, item.squad, `${p}.squad`) && ctx.squads.size && !ctx.squads.has(item.squad)) ctx.problemas.push(`${p}.squad: esquadrão desconhecido`)
    texto(ctx, item.origem, `${p}.origem`); opcionalTexto(ctx, item.modelo, `${p}.modelo`, true); if (item.ferramentas !== null) listaTextos(ctx, item.ferramentas, `${p}.ferramentas`)
    numero(ctx, item.linhas, `${p}.linhas`, true, true); numero(ctx, item.bytes, `${p}.bytes`, true, true); texto(ctx, item.modificado, `${p}.modificado`); texto(ctx, item.arquivo, `${p}.arquivo`)
    opcionalTexto(ctx, item.descricao, `${p}.descricao`); opcionalTexto(ctx, item.ultima_convocacao, `${p}.ultima_convocacao`, true); opcionalNumero(ctx, item.convocacoes, `${p}.convocacoes`, true, true, true); opcionalNumero(ctx, item.convocacoes_24h, `${p}.convocacoes_24h`, false, true, true); opcionalNumero(ctx, item.convocacoes_7d, `${p}.convocacoes_7d`, false, true, true); opcionalNumero(ctx, item.retornos_registrados, `${p}.retornos_registrados`, false, true, true)
  })
}

function validarSquadsComAgentes(ctx: Contexto, v: unknown) {
  if (!Array.isArray(v) || ctx.squads.size === 0) return
  const contagem = new Map<string, number>()
  for (const item of v) {
    if (objeto(item) && typeof item.squad === 'string') {
      contagem.set(item.squad, (contagem.get(item.squad) ?? 0) + 1)
    }
  }
  for (const id of ctx.squads) {
    if ((contagem.get(id) ?? 0) === 0) ctx.problemas.push(`estado.squads.${id}: squad sem agentes`)
  }
}

function validarVerificador(ctx: Contexto, v: unknown, p: string) {
  if (!objetoObrigatorio(ctx, v, p)) return
  opcionalNumero(ctx, v.checagens, `${p}.checagens`, true, true, true); opcionalNumero(ctx, v.reprovadas, `${p}.reprovadas`, true, true, true); opcionalNumero(ctx, v.indeterminadas, `${p}.indeterminadas`, true, true, true); if (v.vencido !== null) booleano(ctx, v.vencido, `${p}.vencido`); texto(ctx, v.arquivo, `${p}.arquivo`); lista(ctx, v.falhas, `${p}.falhas`)
  if (Array.isArray(v.falhas)) v.falhas.forEach((falha, i) => { const fp = `${p}.falhas[${i}]`; if (objetoObrigatorio(ctx, falha, fp)) { texto(ctx, falha.o_que, `${fp}.o_que`); opcionalTexto(ctx, falha.desde, `${fp}.desde`) } })
  opcionalTexto(ctx, v.erro_leitura, `${p}.erro_leitura`, true); opcionalTexto(ctx, v.rodada, `${p}.rodada`, true)
}

function validarMotores(ctx: Contexto, v: unknown, p: string) {
  if (v === undefined || v === null) return
  if (!objetoObrigatorio(ctx, v, p)) return
  if (v.situacao !== undefined && (!texto(ctx, v.situacao, `${p}.situacao`) || !ESTADOS_MOTOR.has(v.situacao))) ctx.problemas.push(`${p}.situacao: situação de motor não permitida`)
  opcionalTexto(ctx, v.motivo, `${p}.motivo`, true); opcionalTexto(ctx, v.motor, `${p}.motor`, true); if (v.ativos !== undefined) listaTextos(ctx, v.ativos, `${p}.ativos`)
  if (v.servicos === undefined) return
  if (lista(ctx, v.servicos, `${p}.servicos`)) v.servicos.forEach((servico, i) => { const sp = `${p}.servicos[${i}]`; if (!objetoObrigatorio(ctx, servico, sp)) return; texto(ctx, servico.service, `${sp}.service`); for (const n of ['ativo', 'existe']) if (servico[n] !== undefined && servico[n] !== null) booleano(ctx, servico[n], `${sp}.${n}`); for (const n of ['estado', 'sub', 'motor']) opcionalTexto(ctx, servico[n], `${sp}.${n}`, true); if (!('motor_fonte' in servico)) ctx.problemas.push(`${sp}.motor_fonte: campo ausente`); else opcionalTexto(ctx, servico.motor_fonte, `${sp}.motor_fonte`, true) })
}

function validarSessao(ctx: Contexto, v: unknown) {
  if (!lista(ctx, v, 'estado.sessao')) return
  v.forEach((item, i) => {
    const p = `estado.sessao[${i}]`
    if (!objetoObrigatorio(ctx, item, p)) return
    if (texto(ctx, item.id, `${p}.id`)) ctx.idsSessoes.add(item.id)
    texto(ctx, item.nome, `${p}.nome`)
    texto(ctx, item.papel, `${p}.papel`)
    texto(ctx, item.camada, `${p}.camada`)
    texto(ctx, item.cor, `${p}.cor`)
    texto(ctx, item.resumo, `${p}.resumo`)
    const estadoSessao = item.estado
    if (estadoSessao !== undefined) {
      const estadoOk = texto(ctx, estadoSessao, `${p}.estado`)
      if (estadoOk && !ESTADOS_SESSAO.has(estadoSessao)) ctx.problemas.push(`${p}.estado: estado de sessão não permitido`)
    }
    if (item.ultima_atividade !== undefined && item.ultima_atividade !== null) dataIso(ctx, item.ultima_atividade, `${p}.ultima_atividade`)
    opcionalTexto(ctx, item.fonte_atividade, `${p}.fonte_atividade`)
    opcionalTexto(ctx, item.erro_atividade, `${p}.erro_atividade`, true)
    validarVerificador(ctx, item.verificador, `${p}.verificador`)
    validarMotores(ctx, item.motores, `${p}.motores`)
    if (item.service_prefixo !== undefined) texto(ctx, item.service_prefixo, `${p}.service_prefixo`)
    if (item.memoria === undefined || !objetoObrigatorio(ctx, item.memoria, `${p}.memoria`)) return
    numero(ctx, item.memoria.linhas, `${p}.memoria.linhas`, true, true)
    numero(ctx, item.memoria.arquivos, `${p}.memoria.arquivos`, true, true)
    if (item.diario === undefined || !objetoObrigatorio(ctx, item.diario, `${p}.diario`)) return
    numero(ctx, item.diario.arquivos, `${p}.diario.arquivos`, true, true)
    numero(ctx, item.cron_linhas, `${p}.cron_linhas`, true, true)
  })
}

function validarSops(ctx: Contexto, v: unknown) {
  if (v === null) return
  if (!objetoObrigatorio(ctx, v, 'estado.sops')) return
  texto(ctx, v.status, 'estado.sops.status'); opcionalTexto(ctx, v.erro, 'estado.sops.erro', true); opcionalNumero(ctx, v.total, 'estado.sops.total', true, true, true)
  if (!lista(ctx, v.itens, 'estado.sops.itens')) return
  v.itens.forEach((item, i) => { const p = `estado.sops.itens[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; for (const n of ['id', 'nome', 'objetivo', 'autonomia', 'gatilho']) texto(ctx, item[n], `${p}.${n}`); for (const n of ['ferramentas', 'agentes', 'entradas', 'saidas']) listaTextos(ctx, item[n], `${p}.${n}`); lista(ctx, item.fontes, `${p}.fontes`); const responsavel = item.responsavel; texto(ctx, responsavel, `${p}.responsavel`); if (typeof responsavel === 'string' && ctx.idsAgentes.size && ![...ctx.idsAgentes, ...ctx.idsSessoes].some((id) => id.toLocaleLowerCase() === responsavel.toLocaleLowerCase())) ctx.problemas.push(`${p}.responsavel: responsável desconhecido`); if (item.frequencia !== null && item.frequencia !== undefined) texto(ctx, item.frequencia, `${p}.frequencia`) })
  if (v.arestas === undefined) return
  if (lista(ctx, v.arestas, 'estado.sops.arestas')) v.arestas.forEach((item, i) => { const p = `estado.sops.arestas[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; texto(ctx, item.de, `${p}.de`); texto(ctx, item.para, `${p}.para`); if (!texto(ctx, item.tipo, `${p}.tipo`) || !TIPOS_ARESTA_SOP.has(item.tipo)) ctx.problemas.push(`${p}.tipo: tipo de aresta não permitido`); texto(ctx, item.evidencia, `${p}.evidencia`) })
}

function validarFontesEstudio(ctx: Contexto, v: unknown) {
  if (v === undefined) return
  if (!objetoObrigatorio(ctx, v, 'estado.pecas.fontes_recebidas')) return
  opcionalTexto(ctx, v.erro, 'estado.pecas.fontes_recebidas.erro', true); if (!lista(ctx, v.itens, 'estado.pecas.fontes_recebidas.itens')) return
  v.itens.forEach((item, i) => { const p = `estado.pecas.fontes_recebidas.itens[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; texto(ctx, item.id, `${p}.id`); texto(ctx, item.origem, `${p}.origem`); texto(ctx, item.url, `${p}.url`); if (typeof item.url === 'string' && !/^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]{10,128}$/.test(item.url)) ctx.problemas.push(`${p}.url: URL fora do Drive autorizado`); if (item.tipo !== undefined && (typeof item.tipo !== 'string' || item.tipo !== 'google_drive')) ctx.problemas.push(`${p}.tipo: tipo de fonte não permitido`); if (typeof item.origem === 'string' && item.origem !== 'Google Drive compartilhado pelo Gastão') ctx.problemas.push(`${p}.origem: origem fora da lista permitida`); dataIso(ctx, item.recebido_em, `${p}.recebido_em`); if (typeof item.estado !== 'string' || !ESTADOS_FONTE.has(item.estado)) ctx.problemas.push(`${p}.estado: estado de fonte não permitido`); for (const n of ['conjuntos', 'arquivos', 'bytes']) numero(ctx, item[n], `${p}.${n} (contagens)`, true, true); if (objetoObrigatorio(ctx, item.por_tipo, `${p}.por_tipo`)) { let soma = 0; for (const [tipo, quantidade] of Object.entries(item.por_tipo)) { if (!TIPOS_ARQUIVO_ESTUDIO.has(tipo)) ctx.problemas.push(`${p}.por_tipo.${tipo}: tipo não permitido`); if (numero(ctx, quantidade, `${p}.por_tipo.${tipo}`, true, true) && quantidade > 0) soma += quantidade }; if (typeof item.arquivos === 'number' && soma !== item.arquivos) ctx.problemas.push(`${p}.por_tipo: contagens não fecham com arquivos`) }; if (typeof item.assinatura_inventario_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(item.assinatura_inventario_sha256)) ctx.problemas.push(`${p}.assinatura_inventario_sha256: assinatura inválida`); texto(ctx, item.observacao, `${p}.observacao`); if (typeof item.estado === 'string' && typeof item.observacao === 'string') { const esperado = item.estado === 'importado' ? 'Inventário registrado no recebimento. O lote foi incorporado ao acervo, sem publicar conteúdo automaticamente.' : 'Inventário registrado no recebimento. Este lote ainda não foi incorporado ao posts.json nem publicado.'; if (item.observacao !== esperado) ctx.problemas.push(`${p}.observacao: observação livre não é permitida`) } })
}

function validarPecas(ctx: Contexto, v: unknown) {
  if (!objetoObrigatorio(ctx, v, 'estado.pecas')) return
  opcionalTexto(ctx, v.erro, 'estado.pecas.erro', true); if (!lista(ctx, v.lista, 'estado.pecas.lista')) return
  v.lista.forEach((item, i) => { const p = `estado.pecas.lista[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; numero(ctx, item.n, `${p}.n`, true, true); texto(ctx, item.titulo, `${p}.titulo`); texto(ctx, item.status, `${p}.status`); opcionalTexto(ctx, item.formato, `${p}.formato`); booleano(ctx, item.tem_capa, `${p}.tem_capa`); opcionalTexto(ctx, item.capa_url, `${p}.capa_url`, true); booleano(ctx, item.tem_video, `${p}.tem_video`); opcionalTexto(ctx, item.agendado_para, `${p}.agendado_para`, true); opcionalTexto(ctx, item.data, `${p}.data`, true); listaTextos(ctx, item.canais, `${p}.canais`); booleano(ctx, item.artefato_disponivel, `${p}.artefato_disponivel`); booleano(ctx, item.aprovacao_disponivel, `${p}.aprovacao_disponivel`) })
  for (const n of ['com_capa', 'com_video', 'capas_servidas', 'pastas_em_disco', 'pastas_ausentes']) numero(ctx, v[n], `estado.pecas.${n}`, true, true); opcionalNumero(ctx, v.pastas_sem_capa, 'estado.pecas.pastas_sem_capa', true, true, true); opcionalNumero(ctx, v.pastas_sem_capa_com_video, 'estado.pecas.pastas_sem_capa_com_video', false, true, true); opcionalNumero(ctx, v.total, 'estado.pecas.total', true, true, true); dataIso(ctx, v.atualizado_em, 'estado.pecas.atualizado_em'); booleano(ctx, v.acoes_habilitadas, 'estado.pecas.acoes_habilitadas'); opcionalTexto(ctx, v.acoes_bloqueio, 'estado.pecas.acoes_bloqueio', true); validarFontesEstudio(ctx, v.fontes_recebidas)
}

function validarCofre(ctx: Contexto, v: unknown) {
  if (v === null) return
  if (!objetoObrigatorio(ctx, v, 'estado.cofre')) return
  if (!lista(ctx, v.nos, 'estado.cofre.nos')) return
  const ids = new Set<string>(); v.nos.forEach((item, i) => { const p = `estado.cofre.nos[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; for (const n of ['id', 'area', 'rotulo', 'autor', 'quando', 'especie', 'corpo', 'caso', 'arquivo', 'familia']) texto(ctx, item[n], `${p}.${n}`); if (texto(ctx, item.id, `${p}.id`)) { if (ids.has(item.id)) ctx.problemas.push(`${p}.id: id repetido`); ids.add(item.id) }; numero(ctx, item.grau, `${p}.grau`, true, true); numero(ctx, item.peso, `${p}.peso`, true, true); numero(ctx, item.linhas, `${p}.linhas`, true, true); dataDia(ctx, item.quando, `${p}.quando`); booleano(ctx, item.vencido, `${p}.vencido`); if (typeof item.peso === 'number' && (item.peso < 1 || item.peso > 5)) ctx.problemas.push(`${p}.peso: fora de 1 a 5`); opcionalTexto(ctx, item.modificado, `${p}.modificado`); opcionalTexto(ctx, item.tipo, `${p}.tipo`) })
  if (!lista(ctx, v.arestas, 'estado.cofre.arestas')) return
  v.arestas.forEach((item, i) => { const p = `estado.cofre.arestas[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; for (const n of ['de', 'para', 'porque']) texto(ctx, item[n], `${p}.${n}`); booleano(ctx, item.ponte, `${p}.ponte`); if (typeof item.de === 'string' && !ids.has(item.de)) ctx.problemas.push(`${p}.de: nó inexistente`); if (typeof item.para === 'string' && !ids.has(item.para)) ctx.problemas.push(`${p}.para: nó inexistente`) })
  for (const n of ['truncados', 'vencidos', 'recusados', 'arestas_recusadas']) listaTextos(ctx, v[n], `estado.cofre.${n}`); for (const n of ['conexoes', 'cobertura', 'arquivos', 'grau_medio']) opcionalNumero(ctx, v[n], `estado.cofre.${n}`, true)
  if (lista(ctx, v.familias, 'estado.cofre.familias')) v.familias.forEach((item, i) => { const p = `estado.cofre.familias[${i}]`; if (objetoObrigatorio(ctx, item, p)) { texto(ctx, item.id, `${p}.id`); texto(ctx, item.nome, `${p}.nome`); opcionalNumero(ctx, item.total, `${p}.total`, false, true, true) } }); if (lista(ctx, v.areas, 'estado.cofre.areas')) v.areas.forEach((item, i) => { const p = `estado.cofre.areas[${i}]`; if (objetoObrigatorio(ctx, item, p)) { texto(ctx, item.id, `${p}.id`); texto(ctx, item.nome, `${p}.nome`); numero(ctx, item.total, `${p}.total`, true, true); if (item.sempre_visivel !== undefined) booleano(ctx, item.sempre_visivel, `${p}.sempre_visivel`) } })
  opcionalTexto(ctx, v.arquivo, 'estado.cofre.arquivo'); opcionalTexto(ctx, v.erro, 'estado.cofre.erro', true)
}

function validarArestas(ctx: Contexto, v: unknown) { if (v === undefined) return; if (lista(ctx, v, 'estado.arestas')) v.forEach((item, i) => { const p = `estado.arestas[${i}]`; if (!objetoObrigatorio(ctx, item, p)) return; texto(ctx, item.de, `${p}.de`); texto(ctx, item.para, `${p}.para`); numero(ctx, item.vezes, `${p}.vezes`, true, true); if (item.de_tipo !== undefined && (!texto(ctx, item.de_tipo, `${p}.de_tipo`) || !TIPOS_ARESTA.has(item.de_tipo))) ctx.problemas.push(`${p}.de_tipo: tipo de aresta não permitido`) }) }

function validarJanelas(ctx: Contexto, v: unknown) {
  if (v === undefined || v === null) return
  if (!objetoObrigatorio(ctx, v, 'estado.janelas')) return
  for (const [chave, janela] of Object.entries(v as Record<string, unknown>)) {
    const p = `estado.janelas.${chave}`
    if (!objetoObrigatorio(ctx, janela, p)) continue
    texto(ctx, (janela as Registro).rotulo, `${p}.rotulo`)
    numero(ctx, (janela as Registro).total, `${p}.total`, true, true)
    texto(ctx, (janela as Registro).mapa_src, `${p}.mapa_src`)
    mapaNumeros(ctx, (janela as Registro).por_agente, `${p}.por_agente`)
    mapaNumeros(ctx, (janela as Registro).convocacoes_fora_da_casa, `${p}.convocacoes_fora_da_casa`)
    if (lista(ctx, (janela as Registro).arestas, `${p}.arestas`)) {
      ((janela as Registro).arestas as unknown[]).forEach((item, i) => {
        const ap = `${p}.arestas[${i}]`
        if (!objetoObrigatorio(ctx, item, ap)) return
        texto(ctx, (item as Registro).de, `${ap}.de`)
        texto(ctx, (item as Registro).para, `${ap}.para`)
        numero(ctx, (item as Registro).vezes, `${ap}.vezes`, true, true)
      })
    }
  }
}

function validarPrivacidade(v: unknown, p = 'estado', problemas: string[] = []) {
  const chaveSecreta = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|credential|authorization|private[_-]?key|bearer)/i
  const caminhoPrivado = /(?:^|[\s"'=])(?:\/(?:opt|home|root|tmp|var|mnt|etc)\/|[A-Za-z]:\\|\\\\[^\\]+\\)/i
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  const segredo = /(?:^|\s)(?:bearer\s+[^\s]+|sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|eyJ[A-Za-z0-9_-]{20,})/i
  if (Array.isArray(v)) v.forEach((item, i) => validarPrivacidade(item, `${p}[${i}]`, problemas)); else if (objeto(v)) for (const [k, item] of Object.entries(v)) { const onde = `${p}.${k}`; if (chaveSecreta.test(k)) problemas.push(`${onde}: chave de credencial proibida`); if (caminhoPrivado.test(k)) problemas.push(`${onde}: caminho privado`); if (email.test(k)) problemas.push(`${onde}: e-mail`); if (segredo.test(k)) problemas.push(`${onde}: formato de segredo`); validarPrivacidade(item, onde, problemas) } else if (typeof v === 'string') { if (caminhoPrivado.test(v)) problemas.push(`${p}: caminho privado`); if (email.test(v)) problemas.push(`${p}: e-mail`); if (segredo.test(v)) problemas.push(`${p}: formato de segredo`) }
  return problemas
}

export function validarEstado(dado: unknown): ResultadoValidacao {
  if (!objeto(dado)) return { ok: false, problemas: ['estado: esperava objeto'] }
  const problemas: string[] = []; const ctx: Contexto = { problemas, idsAgentes: new Set(), idsSessoes: new Set(), squads: new Set() }; const e = dado
  dataIso(ctx, e.gerado_em, 'estado.gerado_em')
  if (objetoObrigatorio(ctx, e.fonte, 'estado.fonte')) mapaTextos(ctx, e.fonte, 'estado.fonte')
  if (objetoObrigatorio(ctx, e.squads, 'estado.squads')) for (const [id, squad] of Object.entries(e.squads)) { ctx.squads.add(id); const p = `estado.squads.${id}`; if (objetoObrigatorio(ctx, squad, p)) { texto(ctx, squad.nome, `${p}.nome`); texto(ctx, squad.descricao, `${p}.descricao`) } }
  if (objetoObrigatorio(ctx, e.resumo, 'estado.resumo')) { for (const n of ['agentes_casa', 'agentes_sessao', 'convocacoes_total', 'convocacoes_casa', 'transcripts_lidos']) numero(ctx, e.resumo[n], `estado.resumo.${n}`, true, true); opcionalNumero(ctx, e.resumo.convocacoes_pela_sessao, 'estado.resumo.convocacoes_pela_sessao', false, true, true); opcionalNumero(ctx, e.resumo.convocacoes_por_subagente, 'estado.resumo.convocacoes_por_subagente', false, true, true); opcionalNumero(ctx, e.resumo.convocacoes_repetidas_descartadas, 'estado.resumo.convocacoes_repetidas_descartadas', false, true, true); opcionalNumero(ctx, e.resumo.cron_ativo, 'estado.resumo.cron_ativo', true, true, true); for (const n of ['convocacoes_por_motor', 'convocacoes_por_modelo', 'transcripts_por_motor']) if (e.resumo[n] !== undefined) mapaNumeros(ctx, e.resumo[n], `estado.resumo.${n}`) }
  validarAgentes(ctx, e.agentes); validarSquadsComAgentes(ctx, e.agentes); validarSessao(ctx, e.sessao); validarArestas(ctx, e.arestas); validarJanelas(ctx, e.janelas)
  mapaNumeros(ctx, e.convocacoes_fora_da_casa, 'estado.convocacoes_fora_da_casa')
  if (objetoObrigatorio(ctx, e.verificadores, 'estado.verificadores')) for (const [nome, item] of Object.entries(e.verificadores)) { if (nome === 'erro') opcionalTexto(ctx, item, `estado.verificadores.${nome}`, true); else validarVerificador(ctx, item, `estado.verificadores.${nome}`) }
  if (objetoObrigatorio(ctx, e.cron, 'estado.cron')) { if (e.cron.jobs === null) { /* permitido pelo tipo */ } else if (lista(ctx, e.cron.jobs, 'estado.cron.jobs')) e.cron.jobs.forEach((j, i) => { const p = `estado.cron.jobs[${i}]`; if (objetoObrigatorio(ctx, j, p)) { texto(ctx, j.expressao, `${p}.expressao`); texto(ctx, j.rotulo, `${p}.rotulo`); opcionalTexto(ctx, j.dono, `${p}.dono`, true) } }); else ctx.problemas.push('estado.cron.jobs: campo ausente'); opcionalTexto(ctx, e.cron.fuso, 'estado.cron.fuso', true); opcionalNumero(ctx, e.cron.total, 'estado.cron.total', true, true, true); if (e.cron.negacao !== undefined && objetoObrigatorio(ctx, e.cron.negacao, 'estado.cron.negacao')) { opcionalTexto(ctx, e.cron.negacao.erro, 'estado.cron.negacao.erro', true); opcionalNumero(ctx, e.cron.negacao.mascarados, 'estado.cron.negacao.mascarados', false, true, true) } }
  validarSops(ctx, e.sops); validarCofre(ctx, e.cofre); validarPecas(ctx, e.pecas)
  if (e.diretiva !== undefined && objetoObrigatorio(ctx, e.diretiva, 'estado.diretiva')) {
    if (e.diretiva.status !== undefined && (!texto(ctx, e.diretiva.status, 'estado.diretiva.status') || !STATUS_DIRETIVA.has(e.diretiva.status))) ctx.problemas.push('estado.diretiva.status: status não permitido')
    if (!('objetivo' in e.diretiva)) ctx.problemas.push('estado.diretiva.objetivo: campo ausente'); else if (e.diretiva.objetivo !== null) texto(ctx, e.diretiva.objetivo, 'estado.diretiva.objetivo')
    if (e.diretiva.prazo !== null && e.diretiva.prazo !== undefined) dataDia(ctx, e.diretiva.prazo, 'estado.diretiva.prazo')
    if (e.diretiva.origem !== null && e.diretiva.origem !== undefined && objetoObrigatorio(ctx, e.diretiva.origem, 'estado.diretiva.origem')) { texto(ctx, e.diretiva.origem.canal, 'estado.diretiva.origem.canal'); texto(ctx, e.diretiva.origem.mensagem_id, 'estado.diretiva.origem.mensagem_id') }
    opcionalTexto(ctx, e.diretiva.criada_em, 'estado.diretiva.criada_em', true); opcionalTexto(ctx, e.diretiva.atualizada_em, 'estado.diretiva.atualizada_em', true)
  }
  const privacidade = validarPrivacidade(e); problemas.push(...privacidade)
  return problemas.length ? { ok: false, problemas } : { ok: true, estado: e as Estado }
}
