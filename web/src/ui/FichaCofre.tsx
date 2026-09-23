import { corDaArea, corDaAreaEscuro } from '../dados/cofre'
import type { ArestaCofre, Estado, NoMemoria } from '../dados/tipos'
import { Cabecalho, Pilula } from './primitivos'

export function FichaCofre(props: {
  atual: NoMemoria
  areaAtual: NonNullable<Estado['cofre']>['areas'][number] | undefined
  familia: NonNullable<Estado['cofre']>['familias'][number] | undefined
  truncado: boolean
  caminho: string[] | null
  alvoNo: NoMemoria | null
  entram: ArestaCofre[]
  saem: ArestaCofre[]
  nome: (id: string) => string
  curto: (id: string) => string
  porqueDoSalto: (de: string, para: string) => string
  escolher: (id: string) => void
  setAlvo: (id: string | null) => void
  modoComando: boolean
  nos: NoMemoria[]
}) {
  const {
    atual, areaAtual, familia, truncado, caminho, alvoNo, entram, saem, nome, curto,
    porqueDoSalto, escolher, setAlvo, modoComando, nos,
  } = props

  return (
    <aside data-ficha-cofre className={`carta p-4 transition-colors ${modoComando ? 'bg-[#0B0F17]/90 border-sky-500/30' : ''}`}>
      <Cabecalho cor="var(--color-ciano)" meta={<span data-ficha-especie>{atual.especie}</span>}>
        ficha do aprendizado
      </Cabecalho>
      <h2 className="font-serif text-[22px] leading-tight font-bold">{atual.rotulo}</h2>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span data-ficha-autor className="text-[12px]">
          <span className="rotulo mr-1.5">quem</span>{atual.autor}
        </span>
        <span data-ficha-quando className="font-mono text-[10px] opacity-70">
          {atual.quando.split('-').reverse().join('/')}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span data-ficha-area className="inline-flex items-center gap-1.5 rounded-full border border-linha-forte px-2 py-[3px]">
          <span className="size-[5px] rounded-full" style={{ background: (modoComando ? corDaAreaEscuro : corDaArea)(atual.area) }} />
          <span className="font-mono text-[9px] leading-none uppercase tracking-[0.14em] opacity-80">{areaAtual?.nome ?? atual.area}</span>
        </span>
        <span data-ficha-familia><Pilula tom="lima">{familia?.nome ?? atual.familia}</Pilula></span>
        {atual.vencido && <Pilula tom="vermelho">âncora vencida</Pilula>}
      </div>

      {/* ‼️ CORRIGIDO 21/09/2026: o utilitário `.poco` usa as CSS vars do tema
          CLARO (fundo creme), e nunca foi adaptado pra `modoComando` (dark)
          como todo o resto desta tela — o número ficava quase invisível,
          texto escuro sobre fundo creme dentro de um card escuro. Achado
          olhando o print real dele (peso/ligações/linhas ilegíveis). */}
      <div className="my-3.5 grid grid-cols-3 gap-2">
        <div data-ficha-peso className={modoComando ? 'rounded-lg border border-sky-500/25 bg-slate-900/70 p-2.5 text-slate-100' : 'poco p-2.5'}>
          <div className="rotulo mb-1.5">peso</div>
          <div className="font-serif text-xl">{atual.peso}<span className="text-[11px] opacity-70">/5</span></div>
        </div>
        <div className={modoComando ? 'rounded-lg border border-sky-500/25 bg-slate-900/70 p-2.5 text-slate-100' : 'poco p-2.5'}>
          <div className="rotulo mb-1.5">ligações</div>
          <div className="font-serif text-xl">{atual.grau}</div>
        </div>
        <div className={modoComando ? 'rounded-lg border border-sky-500/25 bg-slate-900/70 p-2.5 text-slate-100' : 'poco p-2.5'}>
          <div className="rotulo mb-1.5">linhas</div>
          <div className="font-serif text-xl">
            {atual.linhas || '—'}
            {truncado && <span className="ml-1 text-[10px] text-ambar" title="o bloco bateu no teto de 60 linhas">no teto</span>}
          </div>
        </div>
      </div>

      <p data-ficha-corpo className="text-[12px] leading-relaxed opacity-90">{atual.corpo}</p>
      <div data-ficha-caso className="mt-3 rounded-md border border-linha bg-white/5 p-2.5">
        <div className="rotulo mb-1.5">o caso</div>
        <p className="text-[11px] leading-relaxed opacity-85">{atual.caso}</p>
      </div>
      <p className="mt-2 break-all font-mono text-[10px] opacity-60">{atual.arquivo}</p>

      {/* ROTA / CAMINHO SELECIONADO */}
      {caminho !== null && alvoNo && (
        <div data-caminho-cofre className="mt-3.5 rounded-md border border-vermelho/30 bg-vermelho/10 p-2.5">
          <div className="rotulo mb-1.5 text-vermelho">caminho até {alvoNo.rotulo}</div>
          <ol className="space-y-1.5">
            {caminho.slice(1).map((id, i) => (
              <li data-caminho-salto key={id} className="text-[11px] leading-relaxed">
                <button type="button" className="text-left font-medium underline underline-offset-2" onClick={() => escolher(id)}>
                  {nome(id)}
                </button>
                <span className="block font-mono text-[9px] opacity-70">porque: {porqueDoSalto(caminho[i], id)}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="rotulo mt-2 underline underline-offset-2" onClick={() => setAlvo(null)}>limpar caminho</button>
        </div>
      )}

      {/* RELAÇÕES DIRIGIDAS ESTILO KIMI (PRE: ANTECEDENTES -> NEXT: DESTRAVA) */}
      <div className="mt-4 space-y-3.5 border-t border-linha pt-3">
        {/* PRE / ANTECEDENTES */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="rotulo flex items-center gap-1">
              <span className="rounded bg-amber-500/20 px-1 font-bold text-amber-400">PRE</span>
              antecedentes (de onde veio)
            </span>
            <span className="font-mono text-[10px] opacity-60">{entram.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entram.length ? entram.map((a) => (
              <button
                type="button"
                key={`${a.de}:${a.para}`}
                title={`PRE: ${a.porque}`}
                onClick={() => escolher(a.de)}
                className="group transition-transform active:scale-95"
              >
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-left font-mono text-[10.5px] hover:border-amber-400">
                  <span className="size-1.5 rounded-full" style={{ background: (modoComando ? corDaAreaEscuro : corDaArea)(nos.find((n) => n.id === a.de)?.area ?? '') }} />
                  <span className="truncate max-w-[280px]">{curto(a.de)}</span>
                </span>
              </button>
            )) : <span className="text-xs opacity-50">nenhum antecedente declarado</span>}
          </div>
        </div>

        {/* NEXT / DESTRAVA */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="rotulo flex items-center gap-1">
              <span className="rounded bg-sky-500/20 px-1 font-bold text-sky-400">NEXT</span>
              destrava / consequências
            </span>
            <span className="font-mono text-[10px] opacity-60">{saem.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {saem.length ? saem.map((a) => (
              <button
                type="button"
                key={`${a.de}:${a.para}`}
                title={`NEXT: ${a.porque}`}
                onClick={() => escolher(a.para)}
                className="group transition-transform active:scale-95"
              >
                <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-left font-mono text-[10.5px] hover:border-sky-400">
                  <span className="size-1.5 rounded-full" style={{ background: (modoComando ? corDaAreaEscuro : corDaArea)(nos.find((n) => n.id === a.para)?.area ?? '') }} />
                  <span className="truncate max-w-[280px]">{curto(a.para)}</span>
                </span>
              </button>
            )) : <span className="text-xs opacity-50">não destrava outro registro diretamente</span>}
          </div>
        </div>

        {/* Nota de Privacidade & Auditoria */}
        <div className="border-t border-linha pt-3 font-mono text-[10px] leading-relaxed opacity-60">
          Registro auditado na fonte. Título, corpo, caso e autor passam pela trava sanitizadora de PII do coletor.
        </div>
      </div>
    </aside>
  )
}
