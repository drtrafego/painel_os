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
  selecionadoId?: string | null; progressos?: ReadonlyMap<string, number>
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
      // Placeholder legível durante o carregamento; nunca reativa o desenho legado.
      rect(x+rw*.15,y+rh*.2,rw*.7,rh*.8,'#353a3c','#6c6248',10)
    }
    return {x,y,w:rw,h:rh}
  }
  const addHit=(key:string,b:{x:number;y:number;w:number;h:number},modulo?:string)=>{
    if([b.x,b.y,b.w,b.h].every(Number.isFinite)&&b.w>0&&b.h>0)
      hits.push({chave:key,x:b.x,y:b.y,largura:b.w,altura:b.h,...(modulo?{modulo}:{})})
  }
  const labelSize=Math.max(9,9/Math.max(.35,(parseFloat(ctx.canvas.style.width)||w)/w))
  const nameTag=(name:string,q:Point,key:string,color:string,max=112,selected=false)=>{
    ctx.font=`600 ${labelSize}px Inter, system-ui, sans-serif`
    let label=name; while(label.length>3&&ctx.measureText(label).width>max-25)label=label.slice(0,-2)+'…'
    const width=Math.max(42,Math.min(max,ctx.measureText(label).width+24))
    const b={x:q.x-width/2,y:q.y-labelSize/2-2,w:width,h:Math.max(17,labelSize+7)}
    rect(b.x,b.y,b.w,b.h,selected?'#333020':'#131a1feF',selected?GOLD:'#42474a',5)
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(b.x+8,q.y+1.5,2,0,Math.PI*2);ctx.fill()
    text(label,b.x+15,q.y+1.5,labelSize,selected?'#fff3c0':TEXT)
    addHit(key,b)
  }
  const plant=(x:number,z:number,unit=27)=>{
    const q=p(x,z);shadow(q,unit*.5*scale,unit*.25*scale,.35);sprite('plant',q,unit)
  }
  const glass=(x:number,z:number,width:number,depth:number,height:number)=>{
    const a=p(x,z,0),b=p(x+width,z+depth,0),c=p(x+width,z+depth,height),d=p(x,z,height)
    const grad=ctx.createLinearGradient(d.x,d.y,a.x,a.y);grad.addColorStop(0,'rgba(160,190,193,.13)');grad.addColorStop(1,'rgba(121,164,170,.035)')
    poly([a,b,c,d],grad,'rgba(181,199,192,.19)');line(d,c,'rgba(237,227,182,.43)',1)
    line(a,d,'#53605d',2);line(b,c,'#53605d',2)
  }
  ctx.save()
  try {
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
    const background=ctx.createLinearGradient(0,0,0,h);background.addColorStop(0,'#11191d');background.addColorStop(.55,'#141b1e');background.addColorStop(1,'#0d1215')
    ctx.fillStyle=background;ctx.fillRect(0,0,w,h)
    // Plataforma contínua, sem grandes blocos verdes/ciano.
    const floor=ctx.createLinearGradient(0,p(0,0).y,0,p(0,h).y)
    floor.addColorStop(0,day>.5?'#3b3f3d':'#2b3235');floor.addColorStop(1,'#222a30')
    shadow(p(w/2,h*.65),w*.54,h*.26,.48)
    box(12,4,w-24,h-18,-8,8,'#333a40')
    plane(12,4,w-24,h-18,0,floor,'#54584b')
    for(let z=30;z<h;z+=45)line(p(16,z),p(w-16,z),'rgba(193,197,192,.065)',.65)
    for(let x=30;x<w-16;x+=65)line(p(x,4),p(x,h-14),'rgba(193,197,192,.065)',.65)
    line(p(15,h-16,1),p(w-15,h-16,1),'#d9bc58',1.6,5)
    // Parede traseira: materiais e estações de navegação reais, sem skyline pixelado.
    const top=p(18,6,91),bottom=p(18,6,2), wall=ctx.createLinearGradient(0,top.y,0,bottom.y)
    wall.addColorStop(0,'#333a3d');wall.addColorStop(.45,'#1d292e');wall.addColorStop(1,'#172025')
    poly([top,p(w-18,6,91),p(w-18,6,2),bottom],wall,'#596057')
    line(top,p(w-18,6,91),'#e7cd83',2,3)
    // Slatted side panels + frame; regular material pattern, not pixel city blocks.
    const sideWidth=Math.min(115,w*.18)
    for(let x=24;x<sideWidth;x+=7){line(p(x,6,10),p(x,6,84),'#494d43',2);line(p(w-x,6,10),p(w-x,6,84),'#494d43',2)}
    const brand=p(w/2,6,62),brandWidth=Math.min(260,w*.42)
    rect(brand.x-brandWidth/2,brand.y-17,brandWidth,40,'#10191d','#877545',5)
    text('CASAL DO TRÁFEGO',brand.x,brand.y-2,Math.min(17,w/34),GOLD,'center',750)
    text('ESTÚDIO OPERACIONAL',brand.x,brand.y+13,7,'#c7c2ac','center',500)
    // Navigation consoles on a workbench, with separate targets and stable route IDs.
    const navGap=6,navWidth=(w-64-5*navGap)/6
    NAV.forEach(([route,title,index],i)=>{
      const x=32+i*(navWidth+navGap), a=p(x,70,34),b=p(x+navWidth,70,34)
      const width=b.x-a.x,height=30*scale
      box(x+navWidth*.43,65,navWidth*.14,8,0,15,'#444c4d')
      rect(a.x,a.y,width,height,'#111c21','#686346',4)
      line({x:a.x+4,y:a.y+height-2},{x:a.x+width-4,y:a.y+height-2},GOLD,.8,2)
      text(index,a.x+6,a.y+8,6*scale,'#b5a361')
      text(title,a.x+width/2,a.y+height*.60,Math.max(6.5,Math.min(10,width/11)),TEXT,'center',600)
      addHit(`navegacao:${route}`,{x:a.x,y:a.y,w:width,h:height},route)
    })
    box(28,94,w-56,15,0,10,'#323b3d');line(p(28,109,10),p(w-28,109,10),'#d2bd77',1.2,3)
    // Each island is created ONLY from layout.ilhas. No catalog/runtime decisions here.
    layout.ilhas.forEach((ilha,idx)=>{
      const opacity=alpha(ilha);if(opacity<=.001)return
      ctx.save();ctx.globalAlpha*=opacity
      plane(ilha.x+3,ilha.y+3,ilha.largura-6,ilha.altura-7,.3,idx%2?'#293337':'#2d3435','rgba(204,196,158,.19)')
      line(p(ilha.x+8,ilha.y+ilha.altura-8,1),p(ilha.x+ilha.largura-8,ilha.y+ilha.altura-8,1),'#ba9d49',1,2)
      // Entrance strip, name and capacity are existing data, never a fabricated number.
      const label=p(ilha.x+14,ilha.y+14,0)
      text(`${String(idx+1).padStart(2,'0')}  ${ilha.nome}`,label.x,label.y,Math.max(9,11*scale),TEXT,'left',650)
      const end=p(ilha.x+ilha.largura-15,ilha.y+14)
      text(`${ilha.mesas.length} / ${ilha.postos.length}`,end.x,end.y,Math.max(8,9*scale),MUTED,'right')
      ctx.fillStyle=ilha.cor;ctx.beginPath();ctx.arc(label.x-6,label.y,2.5,0,Math.PI*2);ctx.fill()
      glass(ilha.x+5,ilha.y+35,0,Math.min(ilha.altura-55,76),23)
      glass(ilha.x+ilha.largura-5,ilha.y+35,0,Math.min(ilha.altura-55,76),23)
      ctx.restore()
      const units=Math.max(32,Math.min(42,ilha.largura/(Math.min(4,Math.max(1,ilha.postos.length))*3.05)))
      ilha.postos.forEach((posto,i)=>{
        const person=ilha.mesas[i]?.execucao
        objects.push({z:posto.y,ilha,draw:()=>{
          const q=p(posto.x,posto.y+18)
          shadow(p(posto.x,posto.y+8),units*1.48*scale,units*.67*scale,.50)
          sprite(person?.execucao.estado==='trabalhando'||person?.execucao.estado==='silencioso'?'desk-on':'desk-off',q,units)
          // Actual status only. Animation time is the caller's clock (pause preserved).
          if(person){
            const dot=p(posto.x-units*1.25,posto.y,units*.9)
            ctx.fillStyle=person.ativa?'#95d8a0':person.execucao.estado==='silencioso'?'#d4b963':'#647076'
            ctx.beginPath();ctx.arc(dot.x,dot.y,1.8*scale,0,Math.PI*2);ctx.fill()
          }
        }})
        objects.push({z:posto.y+23,ilha,draw:()=>{
          sprite('chair',p(posto.x,posto.y+45),units*.95)
        }})
        if(!person){labels.push(()=>{
          ctx.save();ctx.globalAlpha*=alpha(ilha);const q=p(posto.x,posto.y+70)
          text('POSTO LIVRE',q.x,q.y,8,'#a9aba3','center');ctx.restore()
        })}
      })
      objects.push({z:ilha.y+40,ilha,draw:()=>plant(ilha.x+ilha.largura-18,ilha.y+44,23)})
      if(ilha.tipo==='coworking'){
        objects.push({z:ilha.y+ilha.altura-20,ilha,draw:()=>{
          const q=p(ilha.x+ilha.largura/2,ilha.y+ilha.altura-19)
          shadow(q,38*scale,12*scale);sprite('sofa',q,27)
        }})
      }
    })
    // Descanso keeps exactly the coordinates/occupants chosen by the original layout.
    const stopped=quadro.personagens.filter(({pose})=>pose.fase==='descanso')
    if(layout.descansoAberto){
      const q=p(w/2,layout.descansoY-2)
      text('LOUNGE / DESCANSO',q.x,q.y,8,GOLD,'center',650)
      // Keep free reserved seats during arrival without fabricating agents.
      layout.mesas.filter(m=>m.execucao.execucao.estado==='parado'&&islands.get(m.execucao.squad)?.tipo!=='coworking').forEach(m=>{
        objects.push({z:m.descanso.y-1,draw:()=>{shadow(p(m.descanso.x,m.descanso.y),24*scale,9*scale);sprite('sofa',p(m.descanso.x,m.descanso.y),24)}})
      })
    }
    quadro.personagens.forEach(({mesa,pose})=>{
      const person=mesa.execucao,ilha=islands.get(person.squad),opacity=alpha(ilha)
      if(opacity<.03)return
      const unit=Math.max(32,Math.min(42,(ilha?.largura??400)/(Math.min(4,Math.max(1,ilha?.postos.length??4))*3.0)))
      objects.push({z:pose.y+.5,ilha,draw:()=>{
        const selected=person.chave===quadro.selecionadoId
        const phase=faseSpriteStudio(pose,tempo,reduzirMovimento,person.ordem)
        const q=p(pose.x,pose.y+18),hair=nearest(person.cabelo,HAIRS),skin=nearest(person.pele,SKINS)
        shadow(q,15*scale,5.5*scale,.48)
        if(selected){ctx.save();ctx.strokeStyle=GOLD;ctx.lineWidth=1.8;ctx.shadowColor=GOLD;ctx.shadowBlur=7;ctx.beginPath();ctx.ellipse(q.x,q.y+2,19*scale,7*scale,0,0,Math.PI*2);ctx.stroke();ctx.restore()}
        const b=sprite(`agent-${hair}-${skin}-${phase.phase}-${phase.frame}`,q,unit)
        // The colour of the squad is retained as a small badge, not a whole coloured carpet.
        const badge=p(pose.x+12,pose.y+18,35)
        ctx.fillStyle=person.destaque;ctx.beginPath();ctx.arc(badge.x,badge.y,2*scale,0,Math.PI*2);ctx.fill()
        addHit(person.chave,{x:b.x-3,y:b.y-3,w:b.w+6,h:b.h+6})
        labels.push(()=>{
          if(opacity<.03)return
          ctx.save();ctx.globalAlpha*=opacity
          const status=person.ativa?'#95d8a0':person.execucao.estado==='silencioso'?'#e0c564':'#9aa6ac'
          nameTag(person.nome,p(pose.x,pose.y+36),person.chave,status,Math.max(80,Math.min(125,(ilha?.largura??400)/Math.min(4,Math.max(1,ilha?.postos.length??4))-8)),selected)
          ctx.restore()
        })
      }})
    })
    objects.sort((a,b)=>a.z-b.z).forEach(o=>{ctx.save();ctx.globalAlpha*=alpha(o.ilha);o.draw();ctx.restore()})
    // Final foreground planters frame the space without introducing a fake occupied room.
    plant(25,h-25,35);plant(w-25,h-25,35)
    labels.forEach(draw=>draw())
    if(!layout.ilhas.length){const q=p(w/2,h*.52);text('Nenhum ambiente visível neste filtro.',q.x,q.y,13,TEXT,'center');text('As salas seguem a atividade e a configuração existentes.',q.x,q.y+21,10,MUTED,'center')}
    if(!image){text(falhaAtlas?'Objetos 3D indisponíveis — confira os arquivos da instalação.':'Carregando objetos do estúdio…',w/2,h-10,10,'#e8cd78','center')}
    // Diagnostics are render facts, not operational telemetry.
    ctx.canvas.dataset.officeRenderer='ct-studio-v1'
    ctx.canvas.dataset.officeAssets=image?'ready':falhaAtlas?'error':'loading'
    ctx.canvas.dataset.officeSpriteAgents=String(quadro.personagens.length)
    ctx.canvas.dataset.officeSpriteResting=String(stopped.length)
  } finally {ctx.restore()}
  return hits
}
