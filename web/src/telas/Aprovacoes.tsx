import { useState } from 'react'
import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import type { PropsTela } from './Vazias'
import { apiUrl } from '../dados/api'

export function Aprovacoes({ estado, vista }: PropsTela) {
  const dados = estado.aprovacoes
  const [itens, setItens] = useState(() => dados?.itens ?? [])
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const erro = dados?.erro ?? (!dados ? 'a fila não veio no estado atual' : null)
  const contar = (alvo: string) => itens.filter((x) => x.estado === alvo).length
  const decidir = async (id: string, decisao: 'aprovado' | 'reprovado' | 'cancelado') => {
    if (!window.confirm(`Registrar “${decisao}” para este item? Isso não publica nada.`)) return
    setOcupado(id); setMensagem(null)
    const chave = `painel_${crypto.randomUUID().replaceAll('-', '')}`
    try {
      const r = await fetch(apiUrl('aprovacoes/decidir'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Painel-Intent': 'decisao-humana' }, body: JSON.stringify({ id, decisao, esperado: 'aguardando', chave_idempotencia: chave }) })
      const resposta = await r.json()
      if (!r.ok) throw new Error(resposta.erro || `HTTP ${r.status}`)
      setItens((lista) => lista.map((x) => x.id === id ? { ...x, estado: decisao } : x))
      setMensagem(`Decisão registrada: ${decisao}. Nenhuma publicação foi disparada.`)
    } catch (e) { setMensagem(`Não registrei a decisão: ${e instanceof Error ? e.message : 'erro desconhecido'}`) }
    finally { setOcupado(null) }
  }
  const esperando = contar('aguardando')
  return <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
    <TituloDaTela titulo="Aprovações." pergunta={vista.pergunta} direita={<span className="rotulo">somente leitura · nenhuma ação automática</span>} />
    {erro ? <section className="rounded-xl border border-vermelho/30 bg-vermelho/6 p-4" data-aprovacoes-erro><Cabecalho cor="var(--color-vermelho)">fila indisponível</Cabecalho><p className="text-[12px] text-tinta-2">{erro}</p><p className="mt-2 text-[11px] text-tinta-3">Nenhum número parcial aparece no lugar.</p></section> : <>
      {!dados?.decisoes_habilitadas && <div data-decisoes-bloqueadas className="mb-3 rounded-lg border border-ambar/30 bg-ambar/8 px-3 py-2.5 text-[11px] leading-relaxed text-tinta-2"><span className="font-mono uppercase tracking-[.16em] text-ambar">Decisões bloqueadas.</span> {dados?.decisoes_bloqueio}. A fila continua disponível somente para leitura.</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi rotulo="esperando decisão" valor={esperando} cor={esperando > 0 ? 'text-ambar' : 'text-tinta'} nota="estado aguardando" /><Kpi rotulo="aprovadas registradas" valor={contar('aprovado')} nota="registro não publica" /><Kpi rotulo="reprovadas" valor={contar('reprovado')} /><Kpi rotulo="canceladas" valor={contar('cancelado')} /></div>
      {mensagem && <div data-resposta-aprovacao className="mt-3 rounded-lg border border-linha bg-white/3 px-3 py-2 text-[11px] text-tinta-2">{mensagem}</div>}
      <section className="carta mt-4 p-4" data-aprovacoes-fila><Cabecalho meta={`${dados?.total ?? 0} item(ns)`}>fila persistente</Cabecalho>
        {itens.length ? <div className="space-y-2">{itens.map((item) => <div key={item.id} className="grid gap-2 rounded-lg border border-linha bg-white/[0.018] p-3 sm:grid-cols-[auto_1fr_auto]"><Pilula tom={item.estado === 'aguardando' ? 'ambar' : item.estado === 'aprovado' ? 'verde' : 'neutro'}>{item.estado}</Pilula><span className="text-[12px] text-tinta-2">{item.tipo} · origem {item.origem}</span><div className="flex flex-wrap items-center justify-end gap-1.5">{item.estado === 'aguardando' && dados?.decisoes_habilitadas ? <><button disabled={ocupado === item.id} onClick={() => decidir(item.id, 'aprovado')} className="rounded border border-verde/30 px-2 py-1 font-mono text-[9px] uppercase text-verde">aprovar</button><button disabled={ocupado === item.id} onClick={() => decidir(item.id, 'reprovado')} className="rounded border border-ambar/30 px-2 py-1 font-mono text-[9px] uppercase text-ambar">reprovar</button><button disabled={ocupado === item.id} onClick={() => decidir(item.id, 'cancelado')} className="rounded border border-linha px-2 py-1 font-mono text-[9px] uppercase text-tinta-3">cancelar</button></> : <span className="font-mono text-[10px] text-tinta-3">{item.estado === 'aguardando' ? 'somente leitura' : new Date(item.criado_em).toLocaleString('pt-BR')}</span>}</div></div>)}</div> : <p className="text-[12px] leading-relaxed text-tinta-2">A fila foi lida e está vazia. Este zero é real: nenhum artefato foi registrado aguardando decisão.</p>}
        <p className="mt-3 border-t border-linha pt-2.5 text-[10.5px] leading-relaxed text-tinta-3">Cada decisão exige confirmação humana e passa pela autenticação global. Registrar “aprovado” só muda a fila e grava auditoria mínima; nunca dispara publicação.</p>
      </section>
    </>}
  </div>
}
