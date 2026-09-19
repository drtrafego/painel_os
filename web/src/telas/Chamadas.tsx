import { useMemo, useState } from 'react'
import { Cabecalho, Kpi, TituloDaTela } from '../ui/primitivos'
import { SemDado } from '../ui/SemDado'
import type { PropsTela } from './Vazias'

const TIPOS = [
  ['dor', 'var(--color-vermelho)'],
  ['objeção', 'var(--color-ambar)'],
  ['promessa', 'var(--color-ciano)'],
  ['falta', 'var(--color-pervinca)'],
  ['achado', 'var(--color-lima)'],
] as const

export function Chamadas({ estado, vista }: PropsTela) {
  const chamadas = estado.chamadas
  const semFonte = !chamadas || chamadas.status !== 'pronto'
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const no = chamadas?.nos.find((n) => n.id === selecionado) ?? chamadas?.nos[0] ?? null
  const citacoes = useMemo(() => {
    if (!chamadas || !no) return []
    return no.evidencias.flatMap((e) => {
      const registro = chamadas.registros.find((r) => r.id === e.chamada_id)
      return (registro?.citacoes ?? []).filter((c) => e.citacao_ids.includes(c.id)).map((c) => ({ ...c, chamada: e.chamada_id }))
    })
  }, [chamadas, no])

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
      <TituloDaTela
        titulo="Chamadas."
        pergunta={vista.pergunta}
        direita={<span className="rotulo !text-tinta-3">evidência rastreável, sem dados pessoais</span>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi rotulo="chamadas analisadas" valor={semFonte ? null : chamadas.total} nota={semFonte ? 'fonte ainda não ligada' : 'registros estruturados'} />
        <Kpi rotulo="padrões com citação" valor={semFonte ? null : chamadas.nos.length} nota="cada padrão aponta para uma fala" />
        <Kpi rotulo="última ingestão" valor={semFonte || !chamadas.atualizado_em ? null : new Date(chamadas.atualizado_em).toLocaleDateString('pt-BR')} nota="horário da fonte estruturada" />
      </div>

      <section className="carta mt-3 overflow-hidden">
        <div className="border-b border-linha px-4 pt-4">
          <Cabecalho cor="var(--color-lima)" meta={semFonte ? 'aguardando ingestão' : `${chamadas.total} chamadas`}>
            mapa de evidências
          </Cabecalho>
        </div>
        <div className="grid min-h-[430px] lg:grid-cols-[1fr_300px]">
          <div className="relative min-h-[360px] overflow-hidden border-b border-linha lg:border-r lg:border-b-0">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(var(--color-linha) 1px, transparent 1px), linear-gradient(90deg, var(--color-linha) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
            {semFonte ? (
              <div className="relative z-10 flex items-center justify-center p-6">
                <SemDado dado={vista.dado} pergunta={vista.pergunta} />
              </div>
            ) : (
              <Mapa chamadas={chamadas} selecionado={no?.id ?? null} aoSelecionar={setSelecionado} />
            )}
          </div>

          <aside className="bg-black/10 p-4">
            <Cabecalho cor="var(--color-ciano)">ficha da evidência</Cabecalho>
            <p className="font-serif text-[19px] leading-snug text-tinta">{no ? no.rotulo : 'Selecione um nó para ver frequência, origem e citações.'}</p>
            {no ? <div className="mt-4 space-y-3 text-[12px] leading-relaxed text-tinta-2">
              <div><div className="rotulo mb-1.5">frequência</div><p>{no.frequencia} chamada{no.frequencia === 1 ? '' : 's'} com este padrão</p></div>
              <div><div className="rotulo mb-1.5">citações</div>{citacoes.map((c) => <blockquote key={`${c.chamada}-${c.id}`} className="mb-2 border-l border-linha-forte pl-3 text-tinta">“{c.trecho}”<span className="mt-1 block font-mono text-[9px] text-tinta-3">origem {c.chamada} · {c.inicio_s ?? '—'}s</span></blockquote>)}</div>
            </div> : <div className="mt-5 space-y-4 text-[12px] leading-relaxed text-tinta-2">
              <div><div className="rotulo mb-1.5">origem</div><p>Identificador estável da chamada, nunca nome, telefone ou e-mail.</p></div>
              <div><div className="rotulo mb-1.5">prova</div><p>Trecho citado e posição na gravação. Sem citação, não vira achado.</p></div>
              <div><div className="rotulo mb-1.5">relação</div><p>Uma linha só existe quando os dois padrões aparecem na mesma evidência.</p></div>
            </div>}
          </aside>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-linha px-4 py-3">
          {TIPOS.map(([nome, cor]) => <span key={nome} className="rotulo flex items-center gap-2"><i className="size-1.5 rounded-full" style={{ background: cor }} />{nome}</span>)}
        </div>
      </section>
    </div>
  )
}

function Mapa({ chamadas, selecionado, aoSelecionar }: { chamadas: NonNullable<PropsTela['estado']['chamadas']>; selecionado: string | null; aoSelecionar: (id: string) => void }) {
  const pontos = new Map(chamadas.nos.map((n, i) => {
    const angulo = (i / Math.max(chamadas.nos.length, 1)) * Math.PI * 2
    const raio = 145 + (i % 3) * 42
    return [n.id, { x: 500 + Math.cos(angulo) * raio, y: 280 + Math.sin(angulo) * raio }]
  }))
  return <svg role="img" aria-label="Mapa das evidências das chamadas" viewBox="0 0 1000 560" className="absolute inset-0 size-full">
    {chamadas.arestas.map((a) => { const de = pontos.get(a.de); const para = pontos.get(a.para); return de && para ? <line key={`${a.de}-${a.para}`} x1={de.x} y1={de.y} x2={para.x} y2={para.y} stroke="var(--color-linha-forte)" strokeWidth={Math.min(5, a.frequencia)} /> : null })}
    {chamadas.nos.map((n) => { const p = pontos.get(n.id)!; const cor = TIPOS.find(([t]) => t.replace('ç', 'c').replace('ã', 'a') === n.tipo)?.[1] ?? 'var(--color-lima)'; const ativo = n.id === selecionado; return <g key={n.id} role="button" tabIndex={0} onClick={() => aoSelecionar(n.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && aoSelecionar(n.id)} className="cursor-pointer"><circle cx={p.x} cy={p.y} r={10 + Math.min(14, n.frequencia * 2)} fill={cor} fillOpacity={ativo ? 0.9 : 0.45} stroke={ativo ? 'var(--color-tinta)' : cor} strokeWidth={ativo ? 3 : 1} /><text x={p.x} y={p.y + 36} textAnchor="middle" fill="var(--color-tinta-2)" fontSize="16">{n.rotulo.slice(0, 28)}</text></g> })}
  </svg>
}
