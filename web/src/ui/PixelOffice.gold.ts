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

/** Projeção única para desenho e alvos de clique; não altera layout/poses. */
export function projeterStudio(layout:Pick<PlantaGold,'largura'|'altura'>,x:number,z:number,elevation=0):Point {
  const w=layout.largura,h=layout.altura
  // Vista frontal elevada, compatível com a câmera usada para renderizar as sprites.
  const scale=Math.max(.01,Math.min((w-24)/w,(h-24)/(.82*h+74)))
  return {x:w/2+(x-w/2)*scale, y:(h-(.82*h+74)*scale)/2+(74+.82*z-.774*elevation)*scale}
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
  const p=(x:number,z:number,e=0)=>projeterStudio(layout,x,z,e)
  const scale=p(w,0).x-p(w-1,0).x
  const alpha=(ilha?:IlhaGold)=>ilha?clamp(quadro.progressos?.get(ilha.squad)??1):1

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
  const sprite=(name:string,q:Point,unit:number):{x:number;y:number;w:number;h:number}=>{
    const f=frames[name]; if(!f)return {x:q.x,y:q.y,w:0,h:0}
    const factor=unit*scale/f.ppm, x=q.x-f.ax*factor, y=q.y-f.ay*factor*.78
    const rw=f.w*factor,rh=f.h*factor*.78
    if(image)ctx.drawImage(image,f.x,f.y,f.w,f.h,x,y,rw,rh)
    else {
      rect(x+rw*.15,y+rh*.2,rw*.7,rh*.8,'#353a3c','#6c6248',10)
    }
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
    rect(b.x,b.y,b.w,b.h,selected?'#333020':'#131a1feF',selected?GOLD:'#42474a',5)
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(b.x+8,q.y+1.5,2.2,0,Math.PI*2);ctx.fill()
    text(label,b.x+15,q.y+1.5,labelSize,selected?'#fff3c0':TEXT)
    addHit(key,b)
  }

  const plant=(x:number,z:number,unit=28)=>{
    const q=p(x,z);shadow(q,unit*.5*scale,unit*.25*scale,.38);sprite('plant',q,unit)
  }

  const glassPartition=(x:number,z:number,width:number,depth:number,height=24)=>{
    const a=p(x,z,0),b=p(x+width,z+depth,0),c=p(x+width,z+depth,height),d=p(x,z,height)
    const grad=ctx.createLinearGradient(d.x,d.y,a.x,a.y)
    grad.addColorStop(0,'rgba(244,206,75,0.18)')
    grad.addColorStop(.5,'rgba(56,189,248,0.12)')
    grad.addColorStop(1,'rgba(15,23,42,0.4)')
    poly([a,b,c,d],grad,'rgba(244,206,75,0.45)')
    line(d,c,'rgba(254,240,138,0.8)',1.2,4)
    line(a,d,'#475569',1.8);line(b,c,'#475569',1.8)
  }

  const floatingSectorBadge=(name:string,count:number,q:Point,color=GOLD)=>{
    const title=`● ${name} (${count})`
    ctx.font=`600 ${Math.max(8.5,10*scale)}px Inter, system-ui, sans-serif`
    const tw=ctx.measureText(title).width
    const bw=Math.max(76,tw+22), bh=Math.max(18,13*scale+6)
    const bx=q.x-bw/2, by=q.y-bh/2
    ctx.save()
    ctx.shadowColor='rgba(0,0,0,0.6)';ctx.shadowBlur=8
    rect(bx,by,bw,bh,'rgba(15,20,24,0.92)',color,bh/2)
    ctx.restore()
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(bx+11,q.y,3,0,Math.PI*2);ctx.fill()
    text(`${name} (${count})`,bx+19,q.y,Math.max(8.5,10*scale),TEXT,'left',600)
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

  const drawWorkstation=(posto:{x:number;y:number},person:PessoaGold|undefined,units:number)=>{
    const q=p(posto.x,posto.y+18)
    shadow(p(posto.x,posto.y+8),units*1.55*scale,units*.7*scale,.55)
    // Desk surface & structure
    sprite(person?.execucao.estado==='trabalhando'||person?.execucao.estado==='silencioso'?'desk-on':'desk-off',q,units)
    // Dual glowing widescreen monitors
    const monL=p(posto.x-units*.48,posto.y+3,units*.45)
    const monR=p(posto.x+units*.48,posto.y+3,units*.45)
    const mw=units*.65*scale, mh=units*.38*scale
    // Left screen
    rect(monL.x-mw/2,monL.y-mh,mw,mh,'#090d12','#334155',2)
    rect(monL.x-mw/2+1.5,monL.y-mh+1.5,mw-3,mh-3,person?.ativa?'#0369a1':'#0f172a')
    if(person?.ativa){
      for(let l=0;l<3;l++){
        ctx.fillStyle='#38bdf8';ctx.fillRect(monL.x-mw/2+3,monL.y-mh+3+l*3.5,mw*(.5+l*.15),1.2)
      }
    }
    // Right screen
    rect(monR.x-mw/2,monR.y-mh,mw,mh,'#090d12','#334155',2)
    rect(monR.x-mw/2+1.5,monR.y-mh+1.5,mw-3,mh-3,person?.ativa?'#713f12':'#0f172a')
    if(person?.ativa){
      for(let l=0;l<3;l++){
        ctx.fillStyle=GOLD;ctx.fillRect(monR.x-mw/2+3,monR.y-mh+3+l*3.5,mw*(.6-l*.1),1.2)
      }
    }
    // Ergonomic executive chair with golden chevron on headrest
    const chairPos=p(posto.x,posto.y+45)
    sprite('chair',chairPos,units*.95)
    const headrest=p(posto.x,posto.y+38,units*.6)
    ctx.fillStyle=GOLD;ctx.beginPath()
    ctx.moveTo(headrest.x-2.5,headrest.y-1.5);ctx.lineTo(headrest.x+2.5,headrest.y-1.5);ctx.lineTo(headrest.x,headrest.y+1.5);ctx.closePath();ctx.fill()

    if(person){
      const dot=p(posto.x-units*1.25,posto.y,units*.9)
      ctx.fillStyle=person.ativa?'#4ade80':person.execucao.estado==='silencioso'?'#facc15':'#64748b'
      ctx.beginPath();ctx.arc(dot.x,dot.y,2.2*scale,0,Math.PI*2);ctx.fill()
    }
  }

  ctx.save()
  try {
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
    // 1. Deep Space Command Center Background
    const background=ctx.createLinearGradient(0,0,0,h)
    background.addColorStop(0,'#090c0f')
    background.addColorStop(.4,'#0e1216')
    background.addColorStop(1,'#070a0c')
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h)

    // 2. High-Tech Slate Floor Platform with Warm Amber Bevel
    const floorTop=p(12,4,0), floorBottom=p(w-12,h-14,0)
    const floor=ctx.createLinearGradient(0,floorTop.y,0,floorBottom.y)
    floor.addColorStop(0,day>.5?'#2b3338':'#181e23')
    floor.addColorStop(.5,'#14191d')
    floor.addColorStop(1,'#0d1114')
    shadow(p(w/2,h*.65),w*.56,h*.28,.55)
    box(12,4,w-24,h-18,-10,10,'#20262b')
    plane(12,4,w-24,h-18,0,floor,'#3d4540')

    // Fine floor seam grid
    for(let z=30;z<h;z+=42)line(p(16,z),p(w-16,z),'rgba(244,206,75,0.04)',.7)
    for(let x=30;x<w-16;x+=58)line(p(x,4),p(x,h-14),'rgba(244,206,75,0.04)',.7)

    // Luminous Golden Neon LED Floor Baseboard Runner
    line(p(14,h-15,1),p(w-14,h-15,1),GOLD,2.2,8)
    line(p(14,4,1),p(14,h-15,1),'rgba(244,206,75,0.3)',1,3)
    line(p(w-14,4,1),p(w-14,h-15,1),'rgba(244,206,75,0.3)',1,3)

    // 3. Rear Architectural Wall with Integrated Downlights
    const top=p(18,6,96), bottom=p(18,6,2)
    const wall=ctx.createLinearGradient(0,top.y,0,bottom.y)
    wall.addColorStop(0,'#232a2f');wall.addColorStop(.5,'#151b1f');wall.addColorStop(1,'#101518')
    poly([top,p(w-18,6,96),p(w-18,6,2),bottom],wall,'#3a4347')
    line(top,p(w-18,6,96),GOLD,2.2,6)

    // Warm ambient light cones from ceiling
    for(let lx=w*.2;lx<=w*.85;lx+=w*.25){
      const lp=p(lx,6,90)
      const lg=ctx.createRadialGradient(lp.x,lp.y,2,lp.x,lp.y+50*scale,80*scale)
      lg.addColorStop(0,'rgba(254,240,138,0.18)')
      lg.addColorStop(1,'rgba(254,240,138,0)')
      ctx.fillStyle=lg;ctx.beginPath();ctx.arc(lp.x,lp.y+30*scale,65*scale,0,Math.PI*2);ctx.fill()
    }

    // 4. Left Perspective Brand Wall (Monolith)
    poly([p(18,6,94),p(Math.min(105,w*.15),8,94),p(Math.min(105,w*.15),h*.72,0),p(18,h*.72,0)],'#11171a','rgba(244,206,75,0.35)')
    line(p(18,6,94),p(Math.min(105,w*.15),8,94),GOLD,1.5,4)
    line(p(Math.min(105,w*.15),8,94),p(Math.min(105,w*.15),h*.72,0),GOLD,1.2,3)
    const brandLeft=p(Math.min(65,w*.09),h*.32,45)
    ctx.save();ctx.translate(brandLeft.x,brandLeft.y);ctx.rotate(-0.06)
    ctx.fillStyle=GOLD;ctx.beginPath()
    ctx.moveTo(0,-10);ctx.lineTo(10,5);ctx.lineTo(-10,5);ctx.closePath();ctx.fill()
    text('CASAL DO TRÁFEGO',0,14,Math.max(7,9*scale),GOLD,'center',750)
    text('OPERAÇÕES IA',0,24,Math.max(6,7*scale),'#cbd5e1','center',600)
    text('PLANEJAMENTO EM REALIDADE',0,33,Math.max(5,6*scale),'#94a3b8','center',500)
    ctx.restore()

    // 5. Center Hub Brand Plaque
    const brand=p(w/2,6,68), brandWidth=Math.min(280,w*.44)
    rect(brand.x-brandWidth/2,brand.y-18,brandWidth,42,'#0f171b','#c8a245',6)
    line({x:brand.x-brandWidth/2+8,y:brand.y-16},{x:brand.x+brandWidth/2-8,y:brand.y-16},GOLD,1.2,3)
    text('CASAL DO TRÁFEGO',brand.x,brand.y-2,Math.min(17,w/33),GOLD,'center',750)
    text('NÚCLEO OPERACIONAL DE AGENTES',brand.x,brand.y+13,Math.max(7,8*scale),'#cbd5e1','center',550)

    // 6. Navigation Consoles on Sleek Stands
    const navGap=6, navWidth=(w-64-5*navGap)/6
    NAV.forEach(([route,title,index],i)=>{
      const x=32+i*(navWidth+navGap), a=p(x,68,36), b=p(x+navWidth,68,36)
      const width=b.x-a.x, height=30*scale
      box(x+navWidth*.43,64,navWidth*.14,8,0,16,'#334155')
      rect(a.x,a.y,width,height,'#0f172a','#64748b',5)
      line({x:a.x+4,y:a.y+height-2},{x:a.x+width-4,y:a.y+height-2},GOLD,1,3)
      text(index,a.x+7,a.y+8,Math.max(6.5,7*scale),'#facc15')
      text(title,a.x+width/2,a.y+height*.62,Math.max(6.5,Math.min(10,width/10.5)),TEXT,'center',600)
      addHit(`navegacao:${route}`,{x:a.x,y:a.y,w:width,h:height},route)
    })
    box(28,94,w-56,15,0,10,'#1e293b')
    line(p(28,109,10),p(w-28,109,10),GOLD,1.5,4)

    // 7. Right Monolith
    const rightP=p(w-32,h*.65,30)
    poly([p(w-42,h*.55,55),p(w-18,h*.55,55),p(w-18,h*.75,0),p(w-42,h*.75,0)],'#11171a','rgba(244,206,75,0.4)')
    line(p(w-42,h*.55,55),p(w-18,h*.55,55),GOLD,1.2,3)
    ctx.fillStyle=GOLD;ctx.beginPath()
    ctx.moveTo(rightP.x,-rightP.y+10);ctx.lineTo(rightP.x+6,-rightP.y+20);ctx.lineTo(rightP.x-6,-rightP.y+20);ctx.closePath()
    text('MAIS POSSIBILIDADES',rightP.x,rightP.y+12,Math.max(5.5,6.5*scale),'#94a3b8','center',600)

    // 8. Islands / Squad Cubicles
    layout.ilhas.forEach((ilha,idx)=>{
      const opacity=alpha(ilha);if(opacity<=.001)return
      ctx.save();ctx.globalAlpha*=opacity

      // Glowing Neon Floor Contour for this Cubicle
      const f1=p(ilha.x+2,ilha.y+2,0), f2=p(ilha.x+ilha.largura-2,ilha.y+2,0)
      const f3=p(ilha.x+ilha.largura-2,ilha.y+ilha.altura-2,0), f4=p(ilha.x+2,ilha.y+ilha.altura-2,0)
      poly([f1,f2,f3,f4],idx%2?'#182025':'#1b2329','rgba(244,206,75,0.35)')
      line(f1,f2,GOLD,1.5,5);line(f2,f3,GOLD,1.5,5)
      line(f3,f4,GOLD,1.8,6);line(f4,f1,GOLD,1.5,5)

      // Modern Partitions & Glass Dividers
      glassPartition(ilha.x+4,ilha.y+15,ilha.largura-8,0,22)
      glassPartition(ilha.x+4,ilha.y+15,0,Math.min(ilha.altura-25,80),22)
      glassPartition(ilha.x+ilha.largura-4,ilha.y+15,0,Math.min(ilha.altura-25,80),22)

      // Floating Sector Pill Badge hovering above the cubicle
      const badgePos=p(ilha.x+ilha.largura/2,ilha.y+8,24)
      floatingSectorBadge(ilha.nome,ilha.mesas.length,badgePos,ilha.cor||GOLD)

      ctx.restore()

      const units=Math.max(34,Math.min(44,ilha.largura/(Math.min(4,Math.max(1,ilha.postos.length))*3.0)))
      ilha.postos.forEach((posto,i)=>{
        const person=ilha.mesas[i]?.execucao
        objects.push({z:posto.y,ilha,draw:()=>{
          drawWorkstation(posto,person,units)
        }})
        if(!person){
          labels.push(()=>{
            if(opacity<.03)return
            ctx.save();ctx.globalAlpha*=alpha(ilha)
            const q=p(posto.x,posto.y+65,12)
            availablePositionBadge(q)
            ctx.restore()
          })
        }
      })
      objects.push({z:ilha.y+35,ilha,draw:()=>plant(ilha.x+ilha.largura-16,ilha.y+38,24)})
      if(ilha.tipo==='coworking'){
        objects.push({z:ilha.y+ilha.altura-20,ilha,draw:()=>{
          const q=p(ilha.x+ilha.largura/2,ilha.y+ilha.altura-19)
          shadow(q,42*scale,14*scale);sprite('sofa',q,28)
        }})
      }
    })

    // 9. Conference Room ("Reuniões") in Lower Left
    const confX=24, confZ=h-95, confW=Math.min(180,w*.24), confH=75
    objects.push({z:confZ,draw:()=>{
      const cp1=p(confX,confZ,0), cp2=p(confX+confW,confZ,0), cp3=p(confX+confW,confZ+confH,0), cp4=p(confX,confZ+confH,0)
      poly([cp1,cp2,cp3,cp4],'#131a20','rgba(244,206,75,0.4)')
      line(cp1,cp2,GOLD,1.5,4);line(cp2,cp3,GOLD,1.5,4);line(cp3,cp4,GOLD,1.8,6);line(cp4,cp1,GOLD,1.5,4)
      glassPartition(confX+2,confZ+2,confW-4,0,26)
      glassPartition(confX+2,confZ+2,0,confH-4,26)
      glassPartition(confX+confW-2,confZ+2,0,confH-4,26)
      // Boardroom table
      const tbl=p(confX+confW/2,confZ+confH*.55,0)
      shadow(tbl,45*scale,18*scale,.5)
      box(confX+confW*.25,confZ+confH*.35,confW*.5,confH*.3,0,14,'#1e293b')
      // Floating Reuniões Badge & Slogan
      const confBadge=p(confX+confW/2,confZ+4,28)
      floatingSectorBadge('Reuniões',6,confBadge,'#facc15')
      const sign=p(confX+confW/2,confZ+confH*.7,22)
      text('IDEIAS · PLANEJAMENTO · RESULTADOS',sign.x,sign.y,Math.max(6,7*scale),'#fef08a','center',600)
      plant(confX+12,confZ+confH-12,25)
    }})

    // 10. Lounge / Área de Descanso
    const stopped=quadro.personagens.filter(({pose})=>pose.fase==='descanso')
    if(layout.descansoAberto){
      const q=p(w/2,layout.descansoY-6,26)
      floatingSectorBadge('Área de Descanso',layout.ocupantesDescanso,q,'#e2e8f0')
      const wallSign=p(w/2,layout.descansoY+10,18)
      text('BOAS IDEIAS TAMBÉM DESCANSAM',wallSign.x,wallSign.y,Math.max(7.5,9*scale),GOLD,'center',700)
      layout.mesas.filter(m=>m.execucao.execucao.estado==='parado'&&islands.get(m.execucao.squad)?.tipo!=='coworking').forEach(m=>{
        objects.push({z:m.descanso.y-1,draw:()=>{
          shadow(p(m.descanso.x,m.descanso.y),26*scale,10*scale)
          sprite('sofa',p(m.descanso.x,m.descanso.y),26)
        }})
      })
    }

    // 11. Characters / Agents
    quadro.personagens.forEach(({mesa,pose})=>{
      const person=mesa.execucao, ilha=islands.get(person.squad), opacity=alpha(ilha)
      if(opacity<.03)return
      const unit=Math.max(34,Math.min(44,(ilha?.largura??400)/(Math.min(4,Math.max(1,ilha?.postos.length??4))*3.0)))
      objects.push({z:pose.y+.5,ilha,draw:()=>{
        const selected=person.chave===quadro.selecionadoId
        const phase=faseSpriteStudio(pose,tempo,reduzirMovimento,person.ordem)
        const q=p(pose.x,pose.y+18), hair=nearest(person.cabelo,HAIRS), skin=nearest(person.pele,SKINS)
        shadow(q,16*scale,6*scale,.5)

        // Selected Golden Aura Ring on floor
        if(selected){
          ctx.save();ctx.strokeStyle=GOLD;ctx.lineWidth=2.2
          ctx.shadowColor=GOLD;ctx.shadowBlur=9
          ctx.beginPath();ctx.ellipse(q.x,q.y+2,21*scale,8*scale,0,0,Math.PI*2);ctx.stroke()
          ctx.restore()
        } else if(person.chave===quadro.hoverId){
          ctx.save();ctx.strokeStyle='rgba(74,222,128,0.6)';ctx.lineWidth=1.5
          ctx.shadowColor='rgba(74,222,128,0.45)';ctx.shadowBlur=6
          ctx.beginPath();ctx.ellipse(q.x,q.y+2,19*scale,7*scale,0,0,Math.PI*2);ctx.stroke()
          ctx.restore()
        }

        const b=sprite(`agent-${hair}-${skin}-${phase.phase}-${phase.frame}`,q,unit)

        // Floating Animated Sleep Indicator Z z when resting
        if(pose.fase==='descanso'){
          const zt=reduzirMovimento?0:tempo
          const zpos=p(pose.x+8,pose.y+10,48)
          ctx.save();ctx.fillStyle=GOLD;ctx.font='700 11px Inter, sans-serif'
          ctx.fillText('Z',zpos.x+Math.sin(zt*2)*2,zpos.y-Math.cos(zt*2)*2)
          ctx.font='600 8px Inter, sans-serif'
          ctx.fillText('z',zpos.x+7+Math.sin(zt*2+1)*2,zpos.y-6-Math.cos(zt*2+1)*2)
          ctx.restore()
        }

        // Squad identity dot badge on character shoulder
        const badge=p(pose.x+13,pose.y+18,36)
        ctx.fillStyle=person.destaque;ctx.beginPath();ctx.arc(badge.x,badge.y,2.5*scale,0,Math.PI*2);ctx.fill()
        addHit(person.chave,{x:b.x-3,y:b.y-3,w:b.w+6,h:b.h+6})

        labels.push(()=>{
          if(opacity<.03)return
          ctx.save();ctx.globalAlpha*=opacity
          const status=person.ativa?'#4ade80':person.execucao.estado==='silencioso'?'#facc15':'#94a3b8'
          nameTag(person.nome,p(pose.x,pose.y+36),person.chave,status,Math.max(85,Math.min(130,(ilha?.largura??400)/Math.min(4,Math.max(1,ilha?.postos.length??4))-8)),selected)
          if(selected&&person.execucao.ferramenta){
            const toolQ=p(pose.x,pose.y+18,52)
            const toolTxt=person.execucao.ferramenta.slice(0,18)
            rect(toolQ.x-36,toolQ.y-8,72,16,'rgba(15,23,42,0.95)',GOLD,4)
            text(toolTxt,toolQ.x,toolQ.y,7.5,'#fef08a','center',600)
          }
          ctx.restore()
        })
      }})
    })

    // Sort objects by depth and render
    objects.sort((a,b)=>a.z-b.z).forEach(o=>{ctx.save();ctx.globalAlpha*=alpha(o.ilha);o.draw();ctx.restore()})

    // Corner decorative planters
    plant(25,h-24,36);plant(w-25,h-24,36)
    labels.forEach(draw=>draw())

    if(!layout.ilhas.length){
      const q=p(w/2,h*.52)
      text('Nenhum ambiente visível neste filtro.',q.x,q.y,13,TEXT,'center')
      text('As salas seguem a atividade e a configuração existentes.',q.x,q.y+21,10,MUTED,'center')
    }
    if(!image){
      text(falhaAtlas?'Objetos 3D indisponíveis — confira os arquivos da instalação.':'Carregando objetos do estúdio…',w/2,h-10,10,GOLD,'center')
    }

    // Canvas dataset indicators
    ctx.canvas.dataset.officeRenderer = 'ct-office-integrado-v2'
    ctx.canvas.dataset.officeVersion = '2.0.0'
    ctx.canvas.dataset.officeAssets = image ? 'ready' : falhaAtlas ? 'error' : 'loading'
    ctx.canvas.dataset.officeSpriteAgents = String(quadro.personagens.length)
    ctx.canvas.dataset.officeSpriteResting = String(stopped.length)
  } finally {ctx.restore()}
  return hits
}
