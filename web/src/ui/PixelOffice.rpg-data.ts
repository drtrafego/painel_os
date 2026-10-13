export interface PessoaRpg {
  chave: string; animacaoChave: string; nome: string; squad: string; squadNome: string
  cor: string; corEscura: string; destaque: string; cabelo: string; pele: string
  acessorio: number; ativa: boolean; temporaria: boolean; ordem: number; objeto: string
  tipoVisual: 'humano' | 'robo'
  execucao: {
    estado: string; ferramenta?: string | null; tarefa?: string | null; etapa?: string | null
    descricao?: string | null; papel?: string | null; tipo?: string | null; arquivo?: string | null
  }
}
export interface MesaRpg { x: number; y: number; descanso: { x: number; y: number }; execucao: PessoaRpg }
export interface IlhaRpg {
  x: number; y: number; largura: number; altura: number; squad: string
  nome: string; cor: string; tipo: string; compacta: boolean
  postos: ReadonlyArray<{ x: number; y: number }>; mesas: ReadonlyArray<MesaRpg>
}
export interface SalaArquiteturaRpg {
  id: string; label: string; x: number; z: number; largura: number; profundidade: number
  alturaVidro: number; abertura: number
}
export interface ArquiteturaRpg {
  salas: ReadonlyArray<SalaArquiteturaRpg>
  alaEsquerda: { x: number; largura: number }
  corredor: { x: number; z: number; largura: number; profundidade: number }
  recepcao: { x: number; z: number; largura: number; profundidade: number }
  lounge: { x: number; z: number; largura: number; profundidade: number }
  coordenacao: { x: number; z: number; largura: number; profundidade: number }
  planoAberto: { x: number; z: number; largura: number; profundidade: number }
}
export interface PlantaRpg {
  largura: number; altura: number; corredorX: number; descansoY: number
  descansoAberto: boolean; ocupantesDescanso: number
  ilhas: ReadonlyArray<IlhaRpg>; mesas: ReadonlyArray<MesaRpg>
  arquitetura: ArquiteturaRpg
}
export interface PoseRpg { x: number; y: number; sentado: number; andando: boolean; fase: string }
export interface QuadroRpg {
  layout: PlantaRpg; personagens: ReadonlyArray<{ mesa: MesaRpg; pose: PoseRpg }>
  progressoDia: number; tempo: number; reduzirMovimento: boolean
  selecionadoId?: string | null; hoverId?: string | null; progressos?: ReadonlyMap<string, number>
}
export interface HitRpg { chave: string; x: number; y: number; largura: number; altura: number; modulo?: string }

function limparTextoAtividade(value?: string | null) {
  return value?.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim() || ''
}

export function statusSeguroDaExecucao(person: PessoaRpg) {
  if (!person.ativa) return null
  const source = limparTextoAtividade(person.execucao.tarefa || person.execucao.etapa || person.execucao.descricao)
  const normalized = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const tool = limparTextoAtividade(person.execucao.ferramenta).toLowerCase()
  const role = limparTextoAtividade(`${person.execucao.papel || ''} ${person.execucao.tipo || ''} ${person.objeto}`).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  if (/contrato|proposta|juridic|assinatura/.test(normalized)) return 'Gerando contrato'
  if (/documento|arquivo|pdf|drive/.test(normalized)) return /revis|valid|conf/.test(normalized) ? 'Revisando documento' : 'Processando documento'
  if (/whatsapp|lead|mensagem|atendimento|cliente|crm|contato/.test(normalized)) return 'Respondendo lead'
  if (/campanh|anuncio|criativo|meta ads|trafego/.test(normalized + role)) return /revis|valid|qa|conf/.test(normalized + role) ? 'Revisando campanha' : 'Otimizando campanha'
  if (/teste|testando|playwright|qa|valid|verific|confer/.test(normalized + tool + role)) return 'Validando entrega'
  if (/design|layout|visual|interface|sprite|css/.test(normalized + role)) return 'Criando interface'
  if (/codigo|code|implement|desenvol|patch|typescript|tsx|python|build/.test(normalized + tool + role)) return 'Implementando melhoria'
  if (/pesquis|search|explor|levant|investig/.test(normalized + tool + role)) return 'Pesquisando referências'
  if (/escrev|redig|copy|roteiro|conteudo|texto/.test(normalized + tool + role)) return 'Preparando conteúdo'
  if (/metric|relatorio|analise|analis/.test(normalized + role)) return 'Analisando resultados'
  if (/public|deploy|envio|entrega/.test(normalized + tool + role)) return 'Publicando entrega'
  if (/read|ler|leitura/.test(tool)) return 'Lendo contexto'
  if (/edit|write/.test(tool)) return 'Trabalhando na tarefa'
  if (/bash|terminal|command|exec/.test(tool)) return 'Executando operação'
  return 'Processando tarefa'
}

type Point = { x: number; y: number }
type Coluna = { x0: number; x1: number; topo: number; fundo: number; fator: number }
// CT-VISUAL-VIDEO-2026-10-12: projecao 3/4 aplicada igualmente a objetos e cliques.
const CAMERA = { cisalhamento: .18, subida: .085, profundidade: .76, topo: 104 } as const
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))

function camera(width: number, height: number): (x: number, z: number, elevation?: number) => Point {
  const raw = (x: number, z: number, elevation: number): Point => ({ x: x - z * CAMERA.cisalhamento, y: x * CAMERA.subida + z * CAMERA.profundidade - elevation })
  const limits = [raw(0, 0, CAMERA.topo), raw(width, 0, CAMERA.topo), raw(0, height, 0), raw(width, height, 0), raw(0, 0, 0), raw(width, 0, 0)]
  const minX = Math.min(...limits.map((point) => point.x)), maxX = Math.max(...limits.map((point) => point.x))
  const minY = Math.min(...limits.map((point) => point.y)), maxY = Math.max(...limits.map((point) => point.y))
  const scale = Math.max(.01, Math.min((width - 20) / (maxX - minX), (height - 20) / (maxY - minY)))
  const dx = (width - (maxX - minX) * scale) / 2 - minX * scale, dy = (height - (maxY - minY) * scale) / 2 - minY * scale
  return (x, z, elevation = 0) => { const point = raw(x, z, elevation); return { x: dx + point.x * scale, y: dy + point.y * scale } }
}

export function projetarRpg(layout: Pick<PlantaRpg, 'largura' | 'altura'>, x: number, z: number, elevation = 0): Point {
  return camera(layout.largura, layout.altura)(x, z, elevation)
}

export function compactacaoRpg(layout: PlantaRpg): { mapa: (x: number, z: number) => number; colunas: Coluna[] } {
  const colunas: Coluna[] = []
  layout.ilhas.forEach((ilha) => {
    const porFileira = Math.max(1, new Set(ilha.postos.map((posto) => Math.round(posto.x))).size)
    const fator = Math.min(1, Math.max(.45, (porFileira * 150 + 56) / Math.max(1, ilha.largura)))
    const existente = colunas.find((coluna) => Math.abs(coluna.x0 - ilha.x) < 1)
    if (existente) { existente.topo = Math.min(existente.topo, ilha.y); existente.fundo = Math.max(existente.fundo, ilha.y + ilha.altura); existente.fator = Math.max(existente.fator, fator) }
    else colunas.push({ x0: ilha.x, x1: ilha.x + ilha.largura, topo: ilha.y, fundo: ilha.y + ilha.altura, fator })
  })
  colunas.sort((a, b) => a.x0 - b.x0)
  // A grade compacta já tem passo uniforme. Seus setores podem atravessar
  // fileiras e ter extents sobrepostos; não interpolar limites por squad.
  if (colunas.every((coluna) => coluna.fator === 1)) return { colunas, mapa: (x: number, _z: number) => x }
  const pontos: Array<[number, number]> = [[-1e6, -1e6]]
  colunas.forEach((coluna) => { const centro = (coluna.x0 + coluna.x1) / 2, meia = (coluna.x1 - coluna.x0) / 2; pontos.push([coluna.x0, centro - meia * coluna.fator], [coluna.x1, centro + meia * coluna.fator]) })
  pontos.push([1e6, 1e6])
  const mapearX = (x: number) => {
    for (let index = 1; index < pontos.length; index += 1) {
      const [a, fa] = pontos[index - 1], [b, fb] = pontos[index]
      if (x <= b) return b === a ? fb : fa + (x - a) * (fb - fa) / (b - a)
    }
    return x
  }
  const inicio = colunas.length ? Math.min(...colunas.map((coluna) => coluna.topo)) - 20 : 0
  const peso = (z: number) => clamp((z - inicio) / 16) * clamp((layout.descansoY + 2 - z) / 16)
  return { colunas, mapa: (x, z) => { const atual = peso(z); return atual <= 0 ? x : x + (mapearX(x) - x) * atual } }
}
