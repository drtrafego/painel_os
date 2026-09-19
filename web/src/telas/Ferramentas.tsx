import { useState } from 'react'
import type { Ferramenta } from '../dados/tipos'
import { Cabecalho, Kpi, Pilula, TituloDaTela } from '../ui/primitivos'
import { Parcial } from '../ui/SemDado'
import { dadoDaVista } from '../nav/rotulo'
import type { PropsTela } from './Vazias'

const TOM: Record<Ferramenta['estado'], 'verde' | 'ambar' | 'neutro'> = {
  disponível: 'verde', fallback: 'ambar', ausente: 'neutro',
}

export function Ferramentas({ estado, medidoEm, vista }: PropsTela) {
  const dados = estado.ferramentas
  // ‼️ Ate 10/09 esta vista se declarava 'nenhum' em `rotas.ts` com 27 conexoes
  // medidas na tela. Agora o rotulo sai do estado, e a ressalva que ele traz
  // junto tem que APARECER: rotulo "parcial" sem a ressalva na tela e cobertura
  // parcial apresentada como completa, so que com o nome certo.
  const dado = dadoDaVista(vista, estado)
  const [filtro, setFiltro] = useState<Ferramenta['estado'] | 'todos'>('todos')
  if (!dados) return <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6"><TituloDaTela titulo="Ferramentas." pergunta={vista.pergunta} /><div className="carta p-5 text-sm text-tinta-2">O estado ainda não tem o inventário de ferramentas.</div></div>
  const itens = filtro === 'todos' ? dados.itens : dados.itens.filter((x) => x.estado === filtro)
  const grupos = ['MCP', 'App', 'Integração', 'Script'] as const
  return <div className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6">
    <TituloDaTela titulo="Ferramentas." pergunta="O que a operação alcança, independentemente do motor de IA, e por quais adaptadores." direita={<span className="rotulo">medido {new Date(medidoEm).toLocaleTimeString('pt-BR', { hour12: false, timeZone: 'UTC' })} utc</span>} />
    <Parcial dado={dado} />
    {dados.erro && <div className="mt-3 mb-3 rounded-lg border border-ambar/30 bg-ambar/8 px-3 py-2 text-xs text-tinta-2">Inventário parcial: {dados.erro}</div>}
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Kpi rotulo="conexões medidas" valor={dados.medidos} nota={`${dados.por_tipo.MCP} MCPs · ${dados.por_tipo.Integração} integrações`} /><Kpi rotulo="disponíveis" valor={dados.contagem.disponível} cor="text-verde" /><Kpi rotulo="fallback" valor={dados.contagem.fallback} cor="text-ambar" /><Kpi rotulo="ausentes" valor={dados.contagem.ausente} cor="text-tinta-2" /></div>
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="filtrar ferramentas">{(['todos', 'disponível', 'fallback', 'ausente'] as const).map((x) => <button key={x} type="button" aria-pressed={filtro === x} onClick={() => setFiltro(x)} className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.16em] ${filtro === x ? 'border-lima/40 bg-lima/10 text-lima' : 'border-linha bg-white/2 text-tinta-3'}`}>{x}</button>)}</div>
    <div className="grid gap-3 lg:grid-cols-2">{grupos.map((grupo) => {
      const lista = itens.filter((x) => x.tipo === grupo)
      if (!lista.length) return null
      return <section data-grupo-ferramentas={grupo} key={grupo} className="carta p-4"><Cabecalho cor={grupo === 'MCP' ? 'var(--color-lima)' : grupo === 'App' ? 'var(--color-ciano)' : grupo === 'Integração' ? 'var(--color-ambar)' : 'var(--color-pervinca)'} meta={`${lista.length} de ${dados.por_tipo[grupo]}`}>{grupo}</Cabecalho><ul className="divide-y divide-linha">{lista.map((item) => <li data-ferramenta key={item.id} className="grid gap-2 py-3 first:pt-1 sm:grid-cols-[145px_minmax(0,1fr)_auto] sm:items-start"><div className="text-[13px] font-medium text-tinta">{item.nome}</div><div><p className="text-[11px] leading-relaxed text-tinta-2">{item.evidencia}</p><p className="mt-1 font-mono text-[9px] leading-relaxed text-tinta-3">fontes: {item.proveniencias.join(' · ')}</p>{item.fallback && <p className="mt-1 font-mono text-[9px] leading-relaxed text-ambar">via {item.fallback}</p>}</div><Pilula tom={TOM[item.estado]}>{item.estado}</Pilula></li>)}</ul></section>
    })}</div>
    <p className="mt-4 max-w-3xl text-[10px] leading-relaxed text-tinta-3">MCP é só um tipo de adaptador. APIs diretas, apps e componentes locais continuam no inventário quando Claude ou Codex mudam. Disponível prova configuração local, não login eterno nem sucesso da última ação. Nenhum comando, URL privada, caminho ou credencial vai ao navegador.</p>
  </div>
}
