/**
 * CT Studio — apresentação do escritório, sem decisões operacionais.
 * Objetos 3D pré-renderizados em sprites independentes + arquitetura vetorial.
 * Não é WebGL em tempo real, não é wallpaper, não adiciona polling/relógio.
 * O chamador continua sendo o PixelOffice existente: poses, filtros e salas vêm dele.
 */
import atlasUrl from './office-studio/studio-atlas.webp'
import atlasMetadata from './office-studio/studio-atlas.json'
import './office-studio/studio.css'

export interface PessoaGold {
  chave: string; animacaoChave: string; nome: string; squad: string; squadNome: string
  cor: string; corEscura: string; destaque: string; cabelo: string; pele: string
  acessorio: number; ativa: boolean; temporaria: boolean; ordem: number; objeto: string
  execucao: { estado: string; ferramenta?: string | null }
}
export interface MesaGold { x: number; y: number; descanso: { x: number; y: number }; execucao: PessoaGold }
export interface IlhaGold {
  x: number; y: number; largura: number; altura: number; squad: string
  nome: string; cor: string; tipo: string; compacta: boolean
  postos: ReadonlyArray<{ x: number; y: number }>; mesas: ReadonlyArray<MesaGold>
}
export interface PlantaGold {
  largura: number; altura: number; corredorX: number; descansoY: number
  descansoAberto: boolean; ocupantesDescanso: number
  ilhas: ReadonlyArray<IlhaGold>; mesas: ReadonlyArray<MesaGold>
}
export interface PoseGold { x: number; y: number; sentado: number; andando: boolean; fase: string }
export interface QuadroGold {
  layout: PlantaGold; personagens: ReadonlyArray<{ mesa: MesaGold; pose: PoseGold }>
  progressoDia: number; tempo: number; reduzirMovimento: boolean
  selecionadoId?: string | null; hoverId?: string | null; progressos?: ReadonlyMap<string, number>
}
export interface HitGold { chave: string; x: number; y: number; largura: number; altura: number; modulo?: string }
interface Frame { x:number; y:number; w:number; h:number; ax:number; ay:number; ppm:number }
interface Point { x:number; y:number }
const frames: Readonly<Record<string, Frame>> = atlasMetadata
const HAIRS = ['#302d29','#5a3825','#c08a48','#1f2c36','#6b3546','#ded0ad']
const SKINS = ['#f0c7a0','#dca778','#bd8059','#8c5a40','#f2d5bd']
const GOLD = '#f4d361', TEXT = '#eee9d9', MUTED = '#aba99d'
const NAV = [
  ['diretores','Agentes / Squads','01'], ['estudio','Conteúdo','02'],
  ['pipeline','Comercial','03'], ['financeiro','Financeiro','04'],
  ['cofre','Conhecimento','05'], ['ferramentas','Operação','06'],
] as const
const clamp = (n:number, lo=0, hi=1) => Math.max(lo,Math.min(hi,Number.isFinite(n)?n:lo))
let atlas: HTMLImageElement | null = null
let falhaAtlas = false
function imagem(): HTMLImageElement | null {
  if (!atlas && typeof Image !== 'undefined') {
    atlas = new Image(); atlas.decoding = 'async'
    atlas.onerror = () => { falhaAtlas = true }
    atlas.src = atlasUrl
  }
  return atlas && atlas.complete && atlas.naturalWidth > 0 ? atlas : null
}
function rgb(c:string): number[] {
  return /^#[0-9a-f]{6}$/i.test(c) ? [1,3,5].map(i=>parseInt(c.slice(i,i+2),16)) : [80,84,87]
}
function blend(a:string,b:string,t:number):string {
  const x=rgb(a), y=rgb(b)
  return `rgb(${x.map((v,i)=>Math.round(v+(y[i]-v)*clamp(t))).join(',')})`
}
function nearest(c:string, palette:readonly string[]):number {
  const v=rgb(c); let best=0, distance=Infinity
  palette.forEach((p,i)=>{const d=rgb(p).reduce((s,k,j)=>s+(k-v[j])**2,0); if(d<distance){best=i;distance=d}})
  return best
}


/**
 * Câmera oblíqua 3/4 da referência aprovada (preview/CT-ESCRITORIO.png do pacote ct-gold):
 * a profundidade desloca X e a largura eleva Y, então paredes laterais ganham face visível.
 * É a MESMA função para chão, móveis, sprites, sombras, etiquetas e alvos de clique.
 */
const CAMERA = { cisalhamento: .10, subida: .035, profundidade: .78, topo: 104 } as const
function camera(w:number,h:number):(x:number,z:number,e?:number)=>Point {
  const raw=(x:number,z:number,e:number):Point=>({x:x-z*CAMERA.cisalhamento,y:x*CAMERA.subida+z*CAMERA.profundidade-e})
  const lim=[raw(0,0,CAMERA.topo),raw(w,0,CAMERA.topo),raw(0,h,0),raw(w,h,0),raw(0,0,0),raw(w,0,0)]
  const minX=Math.min(...lim.map(q=>q.x)),maxX=Math.max(...lim.map(q=>q.x))
  const minY=Math.min(...lim.map(q=>q.y)),maxY=Math.max(...lim.map(q=>q.y))
  const escala=Math.max(.01,Math.min((w-20)/(maxX-minX),(h-20)/(maxY-minY)))
  const dx=(w-(maxX-minX)*escala)/2-minX*escala, dy=(h-(maxY-minY)*escala)/2-minY*escala
  return (x,z,e=0)=>{const q=raw(x,z,e);return {x:dx+q.x*escala,y:dy+q.y*escala}}
}
/** Projeção única para desenho e alvos de clique; não altera layout/poses. */
export function projeterStudio(layout:Pick<PlantaGold,'largura'|'altura'>,x:number,z:number,elevation=0):Point {
  return camera(layout.largura,layout.altura)(x,z,elevation)
}

/**
 * Compactação só de apresentação: aproxima os postos de cada coluna de ilhas quando
 * há poucos por fileira, com uma função contínua e monotônica aplicada a TODO ponto
 * desenhado (mesa, pose, ilha, etiqueta e alvo). Faixa de descanso e parede ficam fixas.
 * Não muda quem aparece, coordenadas recebidas, poses nem temporizadores.
 */
const ESPACO_POSTO = 150, BORDA_ILHA = 28
interface Coluna { x0:number; x1:number; topo:number; fundo:number; fator:number }
export function compactacaoStudio(layout:PlantaGold):{mapa:(x:number,z:number)=>number;colunas:Coluna[]} {
  const colunas:Coluna[]=[]
  layout.ilhas.forEach(ilha=>{
    const porFileira=Math.max(1,new Set(ilha.postos.map(posto=>Math.round(posto.x))).size)
    const fator=Math.min(1,Math.max(.45,(porFileira*ESPACO_POSTO+2*BORDA_ILHA)/Math.max(1,ilha.largura)))
    const existente=colunas.find(c=>Math.abs(c.x0-ilha.x)<1)
    if(existente){
      existente.topo=Math.min(existente.topo,ilha.y); existente.fundo=Math.max(existente.fundo,ilha.y+ilha.altura)
      existente.fator=Math.max(existente.fator,fator)
    } else colunas.push({x0:ilha.x,x1:ilha.x+ilha.largura,topo:ilha.y,fundo:ilha.y+ilha.altura,fator})
  })
  colunas.sort((a,b)=>a.x0-b.x0)
  const pontos:Array<[number,number]>=[[-1e6,-1e6]]
  colunas.forEach(c=>{const centro=(c.x0+c.x1)/2,meia=(c.x1-c.x0)/2;pontos.push([c.x0,centro-meia*c.fator],[c.x1,centro+meia*c.fator])})
  pontos.push([1e6,1e6])
  const g=(x:number)=>{
    for(let i=1;i<pontos.length;i++){
      const [a,fa]=pontos[i-1],[b,fb]=pontos[i]
      if(x<=b)return b===a?fb:fa+(x-a)*(fb-fa)/(b-a)
    }
    return x
  }
  const inicio=colunas.length?Math.min(...colunas.map(c=>c.topo))-20:0
  const fim=layout.descansoY
  const peso=(z:number)=>clamp((z-inicio)/16)*clamp((fim+2-z)/16)
  return {colunas,mapa:(x,z)=>{const s=peso(z);return s<=0?x:x+(g(x)-x)*s}}
}

export function faseSpriteStudio(pose:PoseGold, tempo:number, reduzirMovimento:boolean, ordem=0):{phase:string;frame:number} {
  const t=reduzirMovimento?0:Math.max(0,tempo)
  if(pose.andando) return {phase:'walk',frame:reduzirMovimento?0:Math.floor(t*9+ordem)%4}
  if(pose.fase==='trabalhando') return {phase:'work',frame:reduzirMovimento?0:Math.floor(t*8+ordem)%4}
  if(pose.fase==='descanso') return {phase:'rest',frame:0}
  if(pose.fase==='silencioso') return {phase:'idle',frame:0}
  return {phase:pose.sentado>.5?'idle':'stand',frame:0}
}

export function desenharEscritorioGold(ctx:CanvasRenderingContext2D, quadro:QuadroGold):HitGold[] {
  const {layout,tempo,reduzirMovimento}=quadro, w=layout.largura, h=layout.altura
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=24||h<=24) return []
  const image=imagem(), day=clamp(quadro.progressoDia)
  const hits:HitGold[]=[], objects:Array<{z:number;ilha?:IlhaGold;draw:()=>void}>=[]
  const labels:Array<()=>void>=[]
  const islands=new Map(layout.ilhas.map(i=>[i.squad,i]))
  const proj=camera(w,h)
  const {mapa,colunas}=compactacaoStudio(layout)
  const p=(x:number,z:number,e=0)=>proj(mapa(x,z),z,e)
  const scale=proj(w,0).x-proj(w-1,0).x
  const inclinacao=Math.atan(CAMERA.subida)
  const alpha=(ilha?:IlhaGold)=>ilha?clamp(quadro.progressos?.get(ilha.squad)??1):1
  const fatorIlha=(ilha?:IlhaGold)=>ilha?colunas.find(c=>Math.abs(c.x0-ilha.x)<1)?.fator??1:1
  const unidade=(ilha?:IlhaGold)=>{
    if(!ilha)return 38
    const porFileira=Math.max(1,new Set(ilha.postos.map(posto=>Math.round(posto.x))).size)
    return Math.max(27,Math.min(33,ilha.largura*fatorIlha(ilha)/porFileira/3.8))
  }

  const text=(s:string,x:number,y:number,size=10,color=TEXT,align:CanvasTextAlign='left',weight=550)=>{
    ctx.font=`${weight} ${size}px Inter, system-ui, sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(s,x,y)
  }
  const line=(a:Point,b:Point,color:string,width=1,glow=0)=>{
    ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width
    if(glow){ctx.shadowColor=color;ctx.shadowBlur=glow}ctx.stroke();ctx.restore()
  }
  const poly=(points:Point[],fill:string|CanvasGradient,stroke?:string)=>{
    ctx.beginPath();points.forEach((a,i)=>i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill()
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.75;ctx.stroke()}
  }
  const rect=(x:number,y:number,width:number,height:number,fill:string|CanvasGradient,stroke?:string,radius=6)=>{
    if(width<=0||height<=0)return
    ctx.beginPath();ctx.roundRect(x,y,width,height,Math.min(radius,width/2,height/2));ctx.fillStyle=fill;ctx.fill()
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}
  }
  const plane=(x:number,z:number,width:number,depth:number,e:number,fill:string|CanvasGradient,stroke?:string)=>
    poly([p(x,z,e),p(x+width,z,e),p(x+width,z+depth,e),p(x,z+depth,e)],fill,stroke)
  const box=(x:number,z:number,width:number,depth:number,e:number,height:number,color:string)=>{
    poly([p(x,z+depth,e),p(x+width,z+depth,e),p(x+width,z+depth,e+height),p(x,z+depth,e+height)],blend(color,'#05090c',.24))
    poly([p(x+width,z,e),p(x+width,z+depth,e),p(x+width,z+depth,e+height),p(x+width,z,e+height)],blend(color,'#05090c',.38))
    plane(x,z,width,depth,e+height,blend(color,'#abb5bf',.07))
  }
  const shadow=(q:Point,rx:number,ry:number,strength=.4)=>{
    ctx.save();ctx.translate(q.x,q.y);ctx.scale(Math.max(.01,rx),Math.max(.01,ry));const g=ctx.createRadialGradient(0,0,.05,0,0,1)
    g.addColorStop(0,`rgba(0,0,0,${strength})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore()
  }
  // Proporção nativa do asset: largura e altura usam o MESMO fator.
  const sprite=(name:string,q:Point,unit:number):{x:number;y:number;w:number;h:number}=>{
    const f=frames[name]; if(!f)return {x:q.x,y:q.y,w:0,h:0}
    const factor=unit*scale/f.ppm, x=q.x-f.ax*factor, y=q.y-f.ay*factor
    const rw=f.w*factor,rh=f.h*factor
    if(image)ctx.drawImage(image,f.x,f.y,f.w,f.h,x,y,rw,rh)
    else rect(x+rw*.15,y+rh*.2,rw*.7,rh*.8,'#353a3c','#6c6248',10)
    return {x,y,w:rw,h:rh}
  }
  const addHit=(key:string,b:{x:number;y:number;w:number;h:number},modulo?:string)=>{
    if([b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0)
      hits.push({chave:key,x:b.x,y:b.y,largura:b.w,altura:b.h,...(modulo?{modulo}:{})})
  }

  const labelSize=Math.max(9,9/Math.max(.35,(parseFloat(ctx.canvas.style.width)||w)/w))
  const nameTag=(name:string,q:Point,key:string,color:string,max=120,selected=false)=>{
    ctx.font=`600 ${labelSize}px Inter, system-ui, sans-serif`
    let label=name; while(label.length>3&&ctx.measureText(label).width>max-25)label=label.slice(0,-2)+'…'
    const width=Math.max(42,Math.min(max,ctx.measureText(label).width+24))
    const b={x:q.x-width/2,y:q.y-labelSize/2-2,w:width,h:Math.max(17,labelSize+7)}
    rect(b.x,b.y,b.w,b.h,selected?'#333020':'#131a1fef',selected?GOLD:'#42474a',5)
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(b.x+8,q.y+1.5,2.2,0,Math.PI*2);ctx.fill()
    text(label,b.x+15,q.y+1.5,labelSize,selected?'#fff3c0':TEXT)
    addHit(key,b)
  }
  // Placa de setor como na referência: índice, barra na cor do squad e nome, presa à divisória.
  const sectorTag=(index:string,name:string,detail:string,q:Point,color:string)=>{
    const size=Math.max(8.5,Math.min(11,10*scale))
    ctx.font=`700 ${size}px Inter, system-ui, sans-serif`
    const titulo=`${index}  ${name.toLocaleUpperCase('pt-BR')}`
    const tw=ctx.measureText(titulo).width
    ctx.font=`550 ${size*.9}px Inter, system-ui, sans-serif`
    const dw=detail?ctx.measureText(detail).width+10:0
    const bw=tw+dw+22, bh=Math.max(17,size+9)
    ctx.save();ctx.translate(q.x,q.y);ctx.rotate(inclinacao)
    ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=6
    rect(0,-bh/2,bw,bh,'rgba(17,21,24,.95)','#5b5134',4)
    ctx.shadowBlur=0
    rect(0,-bh/2,3,bh,color,undefined,1)
    text(titulo,10,0,size,'#f7f4ed','left',700)
    if(detail)text(detail,14+tw,0,size*.9,MUTED,'left',550)
    ctx.restore()
  }

  const plant=(x:number,z:number,unit=28)=>{
    const q=p(x,z);shadow(q,unit*.5*scale,unit*.25*scale,.38);sprite('plant',q,unit)
  }
  const glassPartition=(x:number,z:number,width:number,depth:number,height=24)=>{
    const a=p(x,z,0),b=p(x+width,z+depth,0),c=p(x+width,z+depth,height),d=p(x,z,height)
    const grad=ctx.createLinearGradient(d.x,d.y,a.x,a.y)
    grad.addColorStop(0,'rgba(222,214,180,0.16)')
    grad.addColorStop(1,'rgba(120,150,160,0.05)')
    poly([a,b,c,d],grad,'rgba(205,190,140,0.30)')
    line(d,c,'rgba(244,206,75,0.75)',1.2,3)
    line(a,d,'#4b5257',1.6);line(b,c,'#4b5257',1.6)
  }
  // Sala com profundidade: piso, mureta traseira com vidro e laterais visíveis na câmera 3/4.
  const room=(x:number,z:number,a:number,b:number,cor:string,piso:string)=>{
    poly([p(x+2,z+2),p(x+a-2,z+2),p(x+a-2,z+b-2),p(x+2,z+b-2)],piso,'rgba(236,208,113,0.20)')
    plane(x+12,z+30,a-24,Math.max(10,b-44),.5,blend(cor,'#1e2428',.91))
    line(p(x+4,z+b-3,.8),p(x+a-4,z+b-3,.8),blend(cor,'#d8cfa8',.25),1.6,2)
    box(x+4,z+4,a-8,5,0,14,'#2a3033')
    glassPartition(x+4,z+8,a-8,0,30)
    const lateral=Math.min(b-26,96)
    glassPartition(x+4,z+8,0,lateral,26)
    glassPartition(x+a-4,z+8,0,lateral,26)
  }

  const availablePositionBadge=(q:Point)=>{
    const title='Posição disponível +'
    ctx.font=`600 ${Math.max(7.5,8.5*scale)}px Inter, system-ui, sans-serif`
    const tw=ctx.measureText(title).width
    const bw=tw+18, bh=Math.max(16,11*scale+5)
    const bx=q.x-bw/2, by=q.y-bh/2
    ctx.save()
    ctx.shadowColor='rgba(244,206,75,0.35)';ctx.shadowBlur=6
    rect(bx,by,bw,bh,'rgba(22,27,34,0.92)','#e5b83b',bh/2)
    ctx.restore()
    text(title,q.x,q.y,Math.max(7.5,8.5*scale),'#fef08a','center',600)
  }

  // Um único par de monitores por posto: o do próprio sprite desk-on/desk-off.
  const drawWorkstation=(posto:{x:number;y:number},person:PessoaGold|undefined,units:number)=>{
    const q=p(posto.x,posto.y+18)
    shadow(p(posto.x,posto.y+10),units*1.45*scale,units*.62*scale,.55)
    const ligado=person?.execucao.estado==='trabalhando'||person?.execucao.estado==='silencioso'
    const mesa=sprite(ligado?'desk-on':'desk-off',q,units)
    if(person?.ativa&&mesa.w>0){
      const pulso=reduzirMovimento?.5:.42+Math.sin(tempo*2.2+person.ordem)*.12
      const brilho=ctx.createRadialGradient(q.x,mesa.y+mesa.h*.12,1,q.x,mesa.y+mesa.h*.12,mesa.w*.55)
      brilho.addColorStop(0,`rgba(244,211,97,${(pulso*.32).toFixed(3)})`);brilho.addColorStop(1,'rgba(244,211,97,0)')
      ctx.fillStyle=brilho;ctx.fillRect(mesa.x,mesa.y-mesa.h*.2,mesa.w,mesa.h*.75)
    }
    sprite('chair',p(posto.x,posto.y+45),units*.95)
    const headrest=p(posto.x,posto.y+38,units*.6)
    ctx.fillStyle=GOLD;ctx.beginPath()
    ctx.moveTo(headrest.x-2.5,headrest.y-1.5);ctx.lineTo(headrest.x+2.5,headrest.y-1.5);ctx.lineTo(headrest.x,headrest.y+1.5);ctx.closePath();ctx.fill()
    if(person){
      const dot=p(posto.x-units*1.25,posto.y,units*.9)
      ctx.fillStyle=person.ativa?'#4ade80':person.execucao.estado==='silencioso'?'#facc15':'#64748b'
      ctx.beginPath();ctx.arc(dot.x,dot.y,2.2*scale,0,Math.PI*2);ctx.fill()
    }
  }

  // Sala de reunião só entra onde a planta recebida deixa espaço livre de verdade,
  // fora do corredor por onde os bonecos andam (mesa->descanso usa SEMPRE a mesma
  // coluna x=layout.corredorX, igual a calcularWaypoints/interpolarWaypoints em
  // escritorio-animacao.ts). Largura de passagem reaproveita o mesmo footprint que
  // já desenha o personagem andando (unidade(), sem ilha, é o valor-base do sprite).
  const margemCorredor=unidade()
  const corredorX0=layout.corredorX-margemCorredor, corredorX1=layout.corredorX+margemCorredor
  const semCorredor=(x0:number,x1:number):Array<{x0:number;x1:number}>=>{
    const partes:Array<{x0:number;x1:number}>=[]
    if(x0<corredorX0)partes.push({x0,x1:Math.min(x1,corredorX0)})
    if(x1>corredorX1)partes.push({x0:Math.max(x0,corredorX1),x1})
    return partes.filter(seg=>seg.x1-seg.x0>0)
  }
  const reservaReuniao=():{x:number;z:number;a:number;b:number}|null=>{
    const livres:Array<{x:number;z:number;a:number;b:number}>=[]
    colunas.forEach(c=>{
      const z0=c.fundo+18, z1=layout.descansoY-10
      if(z1-z0<78)return
      semCorredor(c.x0,c.x1).forEach(seg=>{
        if(seg.x1-seg.x0>=180)livres.push({x:seg.x0,z:z0,a:seg.x1-seg.x0,b:z1-z0})
      })
    })
    if(layout.descansoAberto){
      const larguraLounge=Math.min(w-60,140+layout.ocupantesDescanso*44), xLounge=(w-larguraLounge)/2
      const z0=layout.descansoY+4, z1=h-14
      if(z1-z0>=80){
        semCorredor(24,xLounge-14).forEach(seg=>{
          if(seg.x1-seg.x0>=180)livres.push({x:seg.x0,z:z0,a:seg.x1-seg.x0,b:z1-z0})
        })
      }
    }
    if(!livres.length)return null
    const melhor=livres.sort((m,n)=>n.a*n.b-m.a*m.b)[0]
    const a=Math.min(230,melhor.a), b=Math.min(96,melhor.b)
    return {x:melhor.x+(melhor.a-a)/2,z:melhor.z+(melhor.b-b)/2,a,b}
  }

  ctx.save()
  try {
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
    const background=ctx.createLinearGradient(0,0,0,h)
    background.addColorStop(0,'#0b0d10');background.addColorStop(1,'#13161a')
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h)
    const luz=ctx.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,w*.6);luz.addColorStop(0,'#f5d77412');luz.addColorStop(1,'#00000000');ctx.fillStyle=luz;ctx.fillRect(0,0,w,h)

    // Plataforma em corte: base com espessura visível e piso único.
    const sombraBase=[p(12,30),p(w-8,30),p(w-8,h-4),p(12,h-4)].map(q=>({x:q.x+8*scale,y:q.y+12*scale}))
    poly(sombraBase,'rgba(0,0,0,.6)')
    box(12,4,w-24,h-18,-14,14,'#1d2226')
    const floor=ctx.createLinearGradient(0,p(12,4).y,0,p(12,h-14).y)
    floor.addColorStop(0,day>.5?'#2e3337':'#262a2e');floor.addColorStop(1,'#1e2226')
    plane(12,4,w-24,h-18,0,floor,'#3d4540')
    for(let z=40;z<h-16;z+=36)line(p(16,z),p(w-16,z),'rgba(220,214,190,0.045)',.7)
    for(let x=40,r=0;x<w-16;x+=72,r++)line(p(x,4),p(x,h-14),'rgba(220,214,190,0.035)',.7)
    line(p(14,h-15,1),p(w-14,h-15,1),GOLD,2.2,7)

    // Parede dos fundos: janelas com skyline nas pontas e letreiro central, como na referência.
    const wallTop=96
    poly([p(18,6,wallTop),p(w-18,6,wallTop),p(w-18,6,2),p(18,6,2)],'#151a1e','#3a4347')
    box(18,4,w-36,4,wallTop-4,5,'#585446')
    const centro=w/2, painel=Math.min(280,w*.40)
    const janela=(x0:number,largura:number)=>{
      if(largura<40)return
      poly([p(x0,6.2,16),p(x0+largura,6.2,16),p(x0+largura,6.2,80),p(x0,6.2,80)],blend('#151b22','#303a42',day))
      for(let xx=x0+4;xx<x0+largura-8;xx+=13){
        const alto=10+(Math.floor(xx*7)%26)
        poly([p(xx,6.3,16),p(xx+9,6.3,16),p(xx+9,6.3,16+alto),p(xx,6.3,16+alto)],blend('#1f2a33','#526574',day))
        for(let yy=20;yy<14+alto;yy+=7)line(p(xx+2.5,6.4,yy),p(xx+5.5,6.4,yy),blend('#dfc375','#acbabb',day),1.6*scale)
      }
      for(let xx=x0;xx<=x0+largura+.5;xx+=Math.max(30,largura/4))line(p(xx,6.5,16),p(xx,6.5,80),'#4b4b43',2*scale)
      line(p(x0,6.5,16),p(x0+largura,6.5,16),'#cfc3a2',1.4*scale)
      line(p(x0,6.5,80),p(x0+largura,6.5,80),'#4b4b43',2*scale)
    }
    janela(30,centro-painel/2-48)
    janela(centro+painel/2+18,centro-painel/2-48)
    for(let lx=w*.2;lx<=w*.85;lx+=w*.3){
      const lp=p(lx,6,88)
      const lg=ctx.createRadialGradient(lp.x,lp.y,2,lp.x,lp.y+40*scale,70*scale)
      lg.addColorStop(0,'rgba(254,240,138,0.12)');lg.addColorStop(1,'rgba(254,240,138,0)')
      ctx.fillStyle=lg;ctx.beginPath();ctx.arc(lp.x,lp.y+30*scale,60*scale,0,Math.PI*2);ctx.fill()
    }
    poly([p(centro-painel/2,6.6,30),p(centro+painel/2,6.6,30),p(centro+painel/2,6.6,86),p(centro-painel/2,6.6,86)],'#0f1518','#c8a245')
    line(p(centro-painel/2+10,6.7,34),p(centro+painel/2-10,6.7,34),GOLD,1.4,3)
    const letreiro=p(centro,6.7,64)
    ctx.save();ctx.translate(letreiro.x,letreiro.y);ctx.rotate(inclinacao)
    text('CASAL DO TRÁFEGO',0,0,Math.max(10,Math.min(20,w/40)*scale),GOLD,'center',750)
    text('NÚCLEO OPERACIONAL DE AGENTES',0,15*scale,Math.max(6.5,7.5*scale),'#cbd5e1','center',550)
    ctx.restore()

    // Consoles de navegação: mesmo alvo e rota de antes, agora na mesma câmera.
    const navGap=6, navWidth=(w-64-5*navGap)/6
    box(28,94,w-56,15,0,10,'#232a2f')
    line(p(28,109,10),p(w-28,109,10),GOLD,1.3,3)
    NAV.forEach(([route,title,index],i)=>{
      const x=32+i*(navWidth+navGap), a=p(x,68,36), b=p(x+navWidth,68,36)
      const width=b.x-a.x, height=28*scale
      box(x+navWidth*.43,64,navWidth*.14,8,0,16,'#3a4246')
      ctx.save();ctx.translate(a.x,a.y);ctx.rotate(inclinacao)
      rect(0,0,width,height,'#10171b','#6b6448',5)
      line({x:4,y:height-2},{x:width-4,y:height-2},GOLD,1,3)
      text(index,7,8,Math.max(6.5,7*scale),'#facc15')
      text(title,width/2,height*.62,Math.max(6.5,Math.min(10,width/10.5)),TEXT,'center',600)
      ctx.restore()
      addHit(`navegacao:${route}`,{x:a.x,y:Math.min(a.y,b.y),w:width,h:height+Math.abs(b.y-a.y)},route)
    })

    // Ilhas: cada uma vira uma sala com profundidade, criada SÓ a partir de layout.ilhas.
    layout.ilhas.forEach((ilha,idx)=>{
      const opacity=alpha(ilha);if(opacity<=.001)return
      ctx.save();ctx.globalAlpha*=opacity
      const cor=ilha.cor||GOLD
      room(ilha.x,ilha.y,ilha.largura,ilha.altura,cor,idx%2?'#1d2327':'#20262a')
      const tag=p(ilha.x+16,ilha.y+8,34)
      sectorTag(String(idx+1).padStart(2,'0'),ilha.nome,`${ilha.mesas.length}`,tag,cor)
      ctx.restore()

      const units=unidade(ilha)
      ilha.postos.forEach((posto,i)=>{
        const person=ilha.mesas[i]?.execucao
        objects.push({z:posto.y,ilha,draw:()=>drawWorkstation(posto,person,units)})
        if(!person){
          labels.push(()=>{
            if(opacity<.03)return
            ctx.save();ctx.globalAlpha*=alpha(ilha)
            availablePositionBadge(p(posto.x,posto.y+62,0))
            ctx.restore()
          })
        }
      })
      objects.push({z:ilha.y+30,ilha,draw:()=>plant(ilha.x+ilha.largura-20,ilha.y+34,22)})
      if(ilha.tipo==='coworking'){
        objects.push({z:ilha.y+ilha.altura-20,ilha,draw:()=>{
          const q=p(ilha.x+ilha.largura/2,ilha.y+ilha.altura-19)
          shadow(q,42*scale,14*scale);sprite('sofa',q,28)
        }})
      }
    })

    // Sala de reunião: decorativa, sem contador e só em espaço que a planta deixou livre.
    const reuniao=reservaReuniao()
    if(reuniao){
      const {x,z,a,b}=reuniao
      room(x,z,a,b,'#8a7a4c','#1b2125')
      const mesaX=x+a*.28, mesaZ=z+b*.42, mesaA=a*.44, mesaB=Math.min(26,b*.28)
      objects.push({z:mesaZ-6,draw:()=>{
        for(const f of [.3,.7])sprite('chair',p(mesaX+mesaA*f,mesaZ-4),24)
      }})
      objects.push({z:mesaZ+mesaB/2,draw:()=>{
        shadow(p(mesaX+mesaA/2,mesaZ+mesaB/2+4),mesaA*.62*scale,mesaB*.7*scale,.45)
        box(mesaX,mesaZ,mesaA,mesaB,12,3,'#4b4130')
        for(const [xx,zz] of [[4,3],[mesaA-7,3],[4,mesaB-6],[mesaA-7,mesaB-6]])box(mesaX+xx,mesaZ+zz,3,3,0,12,'#36393c')
      }})
      objects.push({z:mesaZ+mesaB+8,draw:()=>{
        for(const f of [.3,.7])sprite('chair',p(mesaX+mesaA*f,mesaZ+mesaB+22),24)
      }})
      objects.push({z:z+b-14,draw:()=>plant(x+a-18,z+b-16,22)})
      labels.push(()=>sectorTag('','Sala de reunião','',p(x+16,z+8,34),'#c8a245'))
    }

    // Descanso: ocupa exatamente a faixa e os lugares escolhidos pela planta operacional.
    const stopped=quadro.personagens.filter(({pose})=>pose.fase==='descanso')
    if(layout.descansoAberto){
      const larguraLounge=Math.min(w-60,140+layout.ocupantesDescanso*44), xLounge=(w-larguraLounge)/2
      plane(xLounge,layout.descansoY,larguraLounge,Math.max(16,h-layout.descansoY-16),.4,'rgba(192,171,91,0.08)','rgba(192,171,91,0.22)')
      labels.push(()=>{
        const q=p(xLounge+4,layout.descansoY+6,0)
        ctx.save();ctx.translate(q.x,q.y);ctx.rotate(inclinacao)
        text(`DESCANSO · ${layout.ocupantesDescanso}`,0,0,Math.max(8.5,9.5*scale),'#d7ca8e','left',750)
        ctx.restore()
      })
      layout.mesas.filter(m=>m.execucao.execucao.estado==='parado'&&islands.get(m.execucao.squad)?.tipo!=='coworking').forEach(m=>{
        objects.push({z:m.descanso.y-1,draw:()=>{
          shadow(p(m.descanso.x,m.descanso.y),24*scale,9*scale)
          sprite('sofa',p(m.descanso.x,m.descanso.y),24)
        }})
      })
    }

    // Personagens: pose e fase vêm do PixelOffice; aqui só se escolhe o quadro do sprite.
    quadro.personagens.forEach(({mesa,pose})=>{
      const person=mesa.execucao, ilha=islands.get(person.squad), opacity=alpha(ilha)
      if(opacity<.03)return
      const unit=pose.fase==='descanso'?Math.min(31,unidade(ilha)):unidade(ilha)
      objects.push({z:pose.y+.5,ilha,draw:()=>{
        const selected=person.chave===quadro.selecionadoId
        const phase=faseSpriteStudio(pose,tempo,reduzirMovimento,person.ordem)
        const q=p(pose.x,pose.y+18), hair=nearest(person.cabelo,HAIRS), skin=nearest(person.pele,SKINS)
        shadow(q,15*scale,5.5*scale,.5)
        if(selected){
          ctx.save();ctx.strokeStyle=GOLD;ctx.lineWidth=2.2;ctx.shadowColor=GOLD;ctx.shadowBlur=9
          ctx.beginPath();ctx.ellipse(q.x,q.y+2,21*scale,8*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore()
        } else if(person.chave===quadro.hoverId){
          ctx.save();ctx.strokeStyle='rgba(74,222,128,0.6)';ctx.lineWidth=1.5;ctx.shadowColor='rgba(74,222,128,0.45)';ctx.shadowBlur=6
          ctx.beginPath();ctx.ellipse(q.x,q.y+2,19*scale,7*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore()
        }
        const b=sprite(`agent-${hair}-${skin}-${phase.phase}-${phase.frame}`,q,unit)
        if(pose.fase==='descanso'){
          const zt=reduzirMovimento?0:tempo
          const zpos={x:b.x+b.w*.78,y:b.y+b.h*.08}
          ctx.save();ctx.fillStyle=GOLD;ctx.font=`700 ${Math.max(8,10*scale)}px Inter, sans-serif`
          ctx.fillText('Z',zpos.x+Math.sin(zt*2)*1.5,zpos.y-Math.cos(zt*2)*1.5)
          ctx.font=`600 ${Math.max(6,7*scale)}px Inter, sans-serif`
          ctx.fillText('z',zpos.x+6*scale+Math.sin(zt*2+1)*1.5,zpos.y-6*scale-Math.cos(zt*2+1)*1.5)
          ctx.restore()
        }
        const badge={x:b.x+b.w*.8,y:b.y+b.h*.42}
        ctx.fillStyle=person.destaque;ctx.beginPath();ctx.arc(badge.x,badge.y,2.4*scale,0,Math.PI*2);ctx.fill()
        addHit(person.chave,{x:b.x-3,y:b.y-3,w:b.w+6,h:b.h+6})

        labels.push(()=>{
          if(opacity<.03)return
          ctx.save();ctx.globalAlpha*=opacity
          const status=person.ativa?'#4ade80':person.execucao.estado==='silencioso'?'#facc15':'#94a3b8'
          const escalonar=pose.fase==='descanso'&&stopped.findIndex(s=>s.mesa===mesa)%2===1?20:0
          const largura=pose.fase==='descanso'?78:Math.max(85,Math.min(130,(ilha?.largura??400)*fatorIlha(ilha)/Math.min(4,Math.max(1,ilha?.postos.length??4))-8))
          nameTag(person.nome,p(pose.x,pose.y+(pose.fase==='descanso'?30:27)+escalonar),person.chave,status,largura,selected)
          if(selected&&person.execucao.ferramenta){
            const toolQ={x:b.x+b.w/2,y:b.y-8}
            const toolTxt=person.execucao.ferramenta.slice(0,18)
            rect(toolQ.x-36,toolQ.y-8,72,16,'rgba(15,23,42,0.95)',GOLD,4)
            text(toolTxt,toolQ.x,toolQ.y,7.5,'#fef08a','center',600)
          }
          ctx.restore()
        })
      }})
    })

    objects.sort((a,b)=>a.z-b.z).forEach(o=>{ctx.save();ctx.globalAlpha*=alpha(o.ilha);o.draw();ctx.restore()})
    plant(30,h-26,34);plant(w-30,h-26,34)
    labels.forEach(draw=>draw())

    if(!layout.ilhas.length){
      const q=p(w/2,h*.52)
      text('Nenhum ambiente visível neste filtro.',q.x,q.y,13,TEXT,'center')
      text('As salas seguem a atividade e a configuração existentes.',q.x,q.y+21,10,MUTED,'center')
    }
    if(!image){
      text(falhaAtlas?'Objetos 3D indisponíveis — confira os arquivos da instalação.':'Carregando objetos do estúdio…',w/2,h-10,10,GOLD,'center')
    }

    ctx.canvas.dataset.officeRenderer = 'ct-office-integrado-v2'
    ctx.canvas.dataset.officeVersion = '2.1.0'
    ctx.canvas.dataset.officeCamera = 'obliqua-3-4'
    ctx.canvas.dataset.officeAssets = image ? 'ready' : falhaAtlas ? 'error' : 'loading'
    ctx.canvas.dataset.officeSpriteAgents = String(quadro.personagens.length)
    ctx.canvas.dataset.officeSpriteResting = String(stopped.length)
    ctx.canvas.dataset.officeMeetingRoom = reuniao ? 'reservada' : 'sem-espaco'
  } finally {ctx.restore()}
  return hits
}
