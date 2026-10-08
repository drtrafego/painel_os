import { useId } from 'react'
import './office-studio/studio.css'

export interface OfficeApproval { id:string; titulo?:string; origem:string; tipo:string; estado:string }
export interface OfficeDepartment { id:string; nome:string; quantidade:number }
export interface OfficeTacticalProps {
  totalVivos:number; ativos:number; catalogoTotal:number
  convocacoes:number|null; retornos:number; departamentos:readonly OfficeDepartment[]
  totalAgentesDepartamento:number
  aprovacoes:readonly OfficeApproval[]
  aoAbrirAtivos:()=>void; aoAbrirAprovacoes:()=>void
}
const numero=(value:number|null|undefined)=>value==null?'—':value.toLocaleString('pt-BR')
const symbols=['◉','▦','◇','↗','✓','⌘']
/** Apresentação dos mesmos KPIs e das mesmas filas. Não calcula permissões nem executa aprovações. */
export function OfficeTacticalPanels(props:OfficeTacticalProps) {
  const id=useId()
  const metrics=[
    {name:'Agentes vivos',value:props.totalVivos,note:`${numero(props.ativos)} executando agora`,onClick:props.aoAbrirAtivos,status:'live'},
    {name:'Catálogo da frota',value:props.catalogoTotal,note:'Agentes catalogados'},
    {name:'Aprovações pendentes',value:props.aprovacoes.length,note:'Aguardando decisão humana',onClick:props.aoAbrirAprovacoes,status:props.aprovacoes.length?'attention':undefined},
    {name:'Convocações totais',value:props.convocacoes,note:'Chamadas registradas'},
    {name:'Retornos confirmados',value:props.retornos,note:'Relatórios e entregas'},
    {name:'Departamentos',value:props.departamentos.length,note:'Squads estruturados'},
  ]
  return <section className="ct-tactical" aria-labelledby={`${id}-title`} data-testid="ct-tactical">
    <header className="ct-tactical-header">
      <div><span className="ct-tactical-eyebrow">CT / LEITURA TÁTICA</span><h2 id={`${id}-title`}>A operação, em perspectiva.</h2></div>
      <span className="ct-tactical-subtitle">Presença, estrutura e decisões</span>
    </header>
    <div className="ct-tactical-metrics">
      {metrics.map((metric,index)=>{
        const content=<><span className="ct-tactical-metric-top"><span>{metric.name}</span><i aria-hidden="true">{symbols[index]}</i></span><strong>{numero(metric.value)}</strong><span className="ct-tactical-metric-note">{metric.note}{metric.onClick&&<b aria-hidden="true">↗</b>}</span></>
        return metric.onClick
          ?<button type="button" key={metric.name} onClick={metric.onClick} className="ct-tactical-metric" data-status={metric.status}>{content}</button>
          :<div key={metric.name} className="ct-tactical-metric" data-status={metric.status}>{content}</div>
      })}
    </div>
    <div className="ct-tactical-panels">
      <section className="ct-tactical-panel" aria-labelledby={`${id}-approvals`}>
        <header><div><span className="ct-tactical-eyebrow">01 / DECISÕES</span><h3 id={`${id}-approvals`}>Fila de aprovações</h3></div><span className="ct-tactical-count">{numero(props.aprovacoes.length)} pendentes</span></header>
        {props.aprovacoes.length?<ul className="ct-tactical-queue">{props.aprovacoes.slice(0,6).map(item=><li key={item.id}><div><strong>{item.titulo||item.id}</strong><small>{item.origem} · {item.tipo}</small></div><span>{item.estado}</span></li>)}</ul>:<div className="ct-tactical-empty"><span aria-hidden="true">✓</span><div><strong>Nenhuma aprovação pendente nesta leitura.</strong><p>A ausência de itens na fila não altera as permissões dos agentes.</p></div></div>}
        <footer>{props.aprovacoes.length>6&&<span>+ {props.aprovacoes.length-6} itens na fila</span>}<button type="button" onClick={props.aoAbrirAprovacoes}>Abrir aprovações <span aria-hidden="true">↗</span></button></footer>
      </section>
      <section className="ct-tactical-panel" aria-labelledby={`${id}-departments`}>
        <header><div><span className="ct-tactical-eyebrow">02 / ESTRUTURA</span><h3 id={`${id}-departments`}>Distribuição por departamento</h3></div><span className="ct-tactical-count">{numero(props.totalAgentesDepartamento)} agentes</span></header>
        {props.departamentos.length?<ul className="ct-tactical-departments">{props.departamentos.map(dept=>{
          const pct=props.totalAgentesDepartamento>0?Math.min(100,Math.max(0,dept.quantidade/props.totalAgentesDepartamento*100)):0
          return <li key={dept.id}><div><span>{dept.nome}</span><strong>{numero(dept.quantidade)}</strong></div><div className="ct-tactical-bar" role="img" aria-label={`${dept.nome}: ${numero(dept.quantidade)} de ${numero(props.totalAgentesDepartamento)} agentes`}><i style={{width:`${pct}%`}}/></div></li>
        })}</ul>:<p className="ct-tactical-no-dept">Nenhum departamento informado nesta leitura.</p>}
        <footer><span>Efetivo catalogado por departamento. Não é uma medida de atividade.</span></footer>
      </section>
    </div>
  </section>
}
