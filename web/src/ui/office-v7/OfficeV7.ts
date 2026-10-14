import {
  CONTRATO_SPRITE,
  imagemDoFrame,
  personagemDoAgente,
  quadroAtivo,
  type EstadoSprite,
} from './sprites'

/**
 * Casal do Tráfego · Office V7 — cenário tycoon 2.5D em Canvas.
 * Apenas renderização: reutiliza integralmente o quadro, poses, estados,
 * seleção e hit targets de PixelOffice.tsx. Não consulta APIs nem cria pessoas.
 * A arquitetura é uma maquete de verdade: volumes, vidro, corredores,
 * salas e convivência em 3 pequenas zonas (sem fila/grade de 25 robôs).
 */

type Point = { x: number; y: number }
type Zone = { x: number; z: number; largura: number; profundidade: number }
type Room = Zone & {
  id: string; label: string; alturaVidro: number; abertura: number;
  tipo?: 'squad'|'reuniao'|'apoio'; squad?: string; cor?: string; ativa?: boolean; ocupantes?: number
}
type Agent = {
  chave: string; nome: string; squad: string; tipoVisual: 'humano'|'robo';
  ativa: boolean; ordem: number; cor?: string; cabelo?: string; pele?: string;
  ficha?: { id: string };
  execucao: { estado: string; tarefa?: string|null; ferramenta?: string|null }
}
type Desk = { x: number; y: number; execucao: Agent }
type Actor = { mesa: Desk; pose: {
  x:number;y:number;andando:boolean;sentado:number;fase:string
  /** Sentido do deslocamento atual (quando `andando`), para escolher o ciclo
   * de caminhada espelhado certo. Ausente fora de fases de caminhada. */
  direcao?:'esquerda'|'direita'
  /** Progresso 0..1 da fase atual (vem da máquina de estados). Usado pelas
   * transições de um só sentido (levantar/sentar) para escolher o quadro. */
  progressoFase?:number
} }
type Architecture = {
  salas: readonly Room[]; corredor:Zone; recepcao:Zone; lounge:Zone;
  coordenacao:Zone; planoAberto:Zone;
  postosLivres?: readonly {x:number;y:number}[];
  assentosDescanso?: readonly {x:number;y:number}[];
}
type Layout = { largura:number; altura:number; arquitetura:Architecture; mesas: readonly Desk[] }
export type OfficeV7Frame = {
  layout:Layout; personagens:readonly Actor[]; tempo:number; progressoDia:number;
  reduzirMovimento:boolean; selecionadoId?:string|null;hoverId?:string|null
  /** Progresso de entrada/saída (0..1) por squad "sob demanda", calculado em
   * PixelOffice.tsx (transição de 720ms, ver DURACAO_TRANSICAO_AMBIENTE_MS).
   * Antes este valor era calculado e nunca chegava ao renderer: a sala
   * aparecia/sumia seca. Squad ausente do mapa (ex. coordenação, que não é
   * sob demanda) é tratado como sempre visível (progresso 1). */
  progressos?: ReadonlyMap<string, number>
}
export type OfficeV7Hit = { chave:string;x:number;y:number;largura:number;altura:number;modulo?:string }
type View = { P:(x:number,z:number,e?:number)=>Point; sceneW:number;sceneH:number }
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
function alpha(hex:string,opacity:number){
  const clean=hex.replace('#','')
  if(clean.length!==6)return `rgba(90,105,105,${opacity})`
  const value=Number.parseInt(clean,16)
  return `rgba(${value>>16},${value>>8&255},${value&255},${opacity})`
}
function identidadeDoAgente(agent:Agent){
  return (agent.ficha?.id||agent.nome).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\s+/)[0]
}
/** Traduz a fase real da maquina de estados (escritorio-animacao.ts) para o
 * estado de sprite correspondente. 'descanso'/padrao cai em 'parado' (de pe,
 * respiracao procedural) como fallback discreto, na pratica um agente comum
 * some da cena antes de chegar la (ver retencao em PixelOffice.tsx); so
 * diretores e frames de borda chegam a usar esse fallback. */
function estadoSpriteDaPose(pose:Actor['pose']):EstadoSprite{
  // `andando` manda primeiro: cobre as duas fases de caminhada E o modo de
  // depuração (?debug_walk=1), que usa uma fase própria sem nome oficial.
  if(pose.andando)return pose.direcao==='esquerda'?'andar-baixo-esquerda':'andar-baixo-direita'
  switch(pose.fase){
    case 'trabalhando':return 'digitar'
    case 'silencioso':return 'sentado-parado'
    case 'sentando':return 'sentar'
    case 'levantando':return 'levantar'
    default:return 'parado'
  }
}
function v(layout:Layout):View {
  const w=layout.largura,h=layout.altura
  const scale=Math.min(1,w/1430,h/820)
  const dx=160*scale,dy=182*scale
  return {sceneW:w,sceneH:h,P:(x,z,e=0)=>({
    x:dx+(x*.85-z*.235)*scale,
    y:dy+(x*.073+z*.575-e*.79)*scale,
  })}
}
function polygon(ctx:CanvasRenderingContext2D,p:Point[],fill:string|CanvasGradient,stroke?:string,width=1){
  if(!p.length)return;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);
  for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}
}
function path(ctx:CanvasRenderingContext2D,p:Point[],stroke:string,width=1){
  if(!p.length)return;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);
  for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);
  ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()
}
function rect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fill:string|CanvasGradient,rad=4,stroke?:string){
  if(w<=0||h<=0)return;ctx.beginPath();ctx.roundRect(x,y,w,h,rad);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.lineWidth=1;ctx.strokeStyle=stroke;ctx.stroke()}
}
function text(ctx:CanvasRenderingContext2D,s:string,x:number,y:number,size=10,fill='#e7ecdc',weight=700,align:CanvasTextAlign='center'){
  ctx.font=`${weight} ${size}px Inter, Arial, sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=fill;ctx.fillText(s,x,y)
}
function ellipse(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string|CanvasGradient){
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,2*Math.PI);ctx.fillStyle=fill;ctx.fill()
}
function roundedArea(ctx:CanvasRenderingContext2D,V:View,a:Zone,fill:string,stroke?:string){
  polygon(ctx,[V.P(a.x,a.z),V.P(a.x+a.largura,a.z),V.P(a.x+a.largura,a.z+a.profundidade),V.P(a.x,a.z+a.profundidade)],fill,stroke)
}
function box(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,w:number,d:number,height:number,opt:{top:string;front:string;side:string;bottom?:number;stroke?:string}){
  const b=opt.bottom??0;const P=V.P;
  const a=P(x,z,b+height),c=P(x+w,z+d,b+height),ab=P(x+w,z,b+height),cd=P(x,z+d,b+height);
  polygon(ctx,[cd,c,P(x+w,z+d,b),P(x,z+d,b)],opt.front,opt.stroke,.65);
  polygon(ctx,[ab,c,P(x+w,z+d,b),P(x+w,z,b)],opt.side,opt.stroke,.65);
  polygon(ctx,[a,ab,c,cd],opt.top,opt.stroke,.7)
}
function shadow(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,rx:number,ry:number,a=.23){
  const p=V.P(x,z);ctx.save();ctx.filter='blur(6px)';ellipse(ctx,p.x,p.y,rx,ry,`rgba(38,34,23,${a})`);ctx.restore()
}
function sign(ctx:CanvasRenderingContext2D,s:string,p:Point,width?:number){
  const ww=width??clamp(s.length*6+24,76,178);
  ctx.save();ctx.shadowColor='#10232788';ctx.shadowBlur=7;ctx.shadowOffsetY=2;
  rect(ctx,p.x-ww/2,p.y-11,ww,22,'#263b40',4,'#c4b082');ctx.restore();
  rect(ctx,p.x-ww/2+5,p.y-6,3,12,'#77c5b9',1);
  text(ctx,s,p.x+2,p.y+.2,9.2,'#fff4d6',800)
}
function plant(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,size=1){
  const p=V.P(x,z);shadow(ctx,V,x,z,10*size,3.5*size,.18);
  const pot=ctx.createLinearGradient(p.x-6*size,p.y-5*size,p.x+9*size,p.y+10*size);
  pot.addColorStop(0,'#a39b82');pot.addColorStop(1,'#575949');
  polygon(ctx,[{x:p.x-6*size,y:p.y-7*size},{x:p.x+6*size,y:p.y-7*size},{x:p.x+4*size,y:p.y+6*size},{x:p.x-4*size,y:p.y+6*size}],pot,'#655b4b');
  const greens=['#345d3b','#498454','#87b966','#bfd18d','#3d7d55'];
  for(let i=0;i<11;i++){
    const t=i*2.399963;const r=(4+(i%4)*2.2)*size;
    const xx=p.x+Math.sin(t)*r,yy=p.y-(13+(i%3)*5)*size+Math.cos(t)*r*.53;
    const grad=ctx.createRadialGradient(xx-2*size,yy-3*size,0,xx,yy,10*size);
    grad.addColorStop(0,greens[(i+2)%greens.length]);grad.addColorStop(1,greens[i%greens.length]);
    ellipse(ctx,xx,yy,5.5*size,8*size,grad);
  }
}
function lamp(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,e:number){
  const p=V.P(x,z,e);const gradient=ctx.createRadialGradient(p.x,p.y,1,p.x,p.y,48);
  gradient.addColorStop(0,'#ffebaf77');gradient.addColorStop(.55,'#ffe5a71a');gradient.addColorStop(1,'#ffe6a700');
  ctx.fillStyle=gradient;ctx.fillRect(p.x-48,p.y-48,96,96);
  rect(ctx,p.x-2.3,p.y-13,4.6,26,'#f4d9a2',2,'#b18d59')
}
function floorAndWalls(ctx:CanvasRenderingContext2D,V:View,depth=780){
  const P=V.P;
  shadow(ctx,V,710,790,620,44,.30);
  // Espessura da maquete: base de porcelanato claro sobre chapa cinza.
  polygon(ctx,[P(25,depth),P(1405,depth),P(1405,depth,-17),P(25,depth,-17)],'#798180','#aab0a0',1.8);
  polygon(ctx,[P(1405,26),P(1405,depth),P(1405,depth,-17),P(1405,26,-17)],'#7d8177');
  const floor=ctx.createLinearGradient(P(0,50).x,P(0,50).y,P(1400,depth-30).x,P(1400,depth-30).y);
  floor.addColorStop(0,'#f7eed3');floor.addColorStop(.6,'#e7dcc1');floor.addColorStop(1,'#d7cba7');
  polygon(ctx,[P(25,26),P(1405,26),P(1405,depth),P(25,depth)],floor,'#f5e5ba',2);
  // Parede em ripado vertical, plano posterior e parede lateral grafite.
  const wood=ctx.createLinearGradient(0,P(20,30,145).y,0,P(20,30).y);
  wood.addColorStop(0,'#e8cf91');wood.addColorStop(.52,'#c6a66e');wood.addColorStop(1,'#967644');
  polygon(ctx,[P(25,26,145),P(1405,26,145),P(1405,26),P(25,26)],wood,'#b89c64',1.8);
  for(let x=31;x<1403;x+=10){const a=P(x,26,141),b=P(x,26,5);
    path(ctx,[a,b],'#755b3c77',1.05);const aa=P(x+2,26,141),bb=P(x+2,26,5);path(ctx,[aa,bb],'#fff4cb58',.8)
  }
  polygon(ctx,[P(25,26,145),P(25,650,145),P(25,650),P(25,26)],'#293f44','#a3b3ac',1.2);
  polygon(ctx,[P(26,86,126),P(26,625,126),P(26,625,25),P(26,86,25)],'#77b6bf1a','#8cc3c5',1.5);
  for(const z of [185,347,509])path(ctx,[P(26,z,142),P(26,z)],'#d5eeead1',1.7);
  path(ctx,[P(25,26),P(1405,26)],'#e9d2a2',3);
  for(const x of [150,680,1220])lamp(ctx,V,x,26,111);
  // O centro do ripado fica livre: os atalhos dos módulos ocupam essa faixa.
  // A marca já aparece no cabeçalho da aplicação.
  // Dois painéis operacionais decorativos sem indicadores fabricados.
  for(const x of [355,1080]){
    const p=P(x,26,98);rect(ctx,p.x-69,p.y-23,138,46,'#233c42',4,'#647d7b');
    for(let i=0;i<17;i++){
      const bh=7+(i*17%25);rect(ctx,p.x-62+i*7.3,p.y+15-bh,3.1,bh,i%4===0?'#86bcaf':'#567984',.5)
    }
  }
}
function sofa(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,w:number,rot=false){
  shadow(ctx,V,x+w/2,z+28,32,9,.17);
  box(ctx,V,x,z,w,34,11,{top:'#a7b8b2',front:'#556c6d',side:'#314a50'});
  box(ctx,V,x,z,w,11,21,{top:'#8a9d99',front:'#607a79',side:'#455e60',bottom:12});
  for(let i=0;i<3;i++){
    box(ctx,V,x+6+i*(w-16)/3,z+8,(w-22)/3,21,5,{top:i%2?'#a8b8ac':'#bbc9bd',front:'#82998f',side:'#5d7771',bottom:12})
  }
  if(rot)box(ctx,V,x+w-12,z-3,12,40,25,{top:'#9aaea4',front:'#677e7b',side:'#4d6667'});
  box(ctx,V,x-1,z,12,37,20,{top:'#9aada6',front:'#667f7d',side:'#4d6368'})
}
function chair(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,scale=1){
  const p=V.P(x,z);shadow(ctx,V,x,z,10*scale,4*scale,.14);
  const bg=ctx.createLinearGradient(p.x-12*scale,p.y-26*scale,p.x+15*scale,p.y);
  bg.addColorStop(0,'#a8b8bf');bg.addColorStop(1,'#475f69');
  rect(ctx,p.x-12*scale,p.y-31*scale,24*scale,29*scale,bg,6*scale,'#485e66');
  rect(ctx,p.x-15*scale,p.y-9*scale,30*scale,10*scale,'#465e68',5*scale);
  path(ctx,[{x:p.x,y:p.y},{x:p.x,y:p.y+8*scale}],'#57666c',2*scale);
  path(ctx,[{x:p.x-10*scale,y:p.y+10*scale},{x:p.x+10*scale,y:p.y+10*scale}],'#384b50',2*scale)
}
function desk(ctx:CanvasRenderingContext2D,V:View,x:number,z:number,kind:'work'|'leader'|'meeting'='work'){
  const w=kind==='meeting'?140:kind==='leader'?95:80,d=kind==='meeting'?53:kind==='leader'?48:42;
  const wood=kind==='meeting'?'#d7a45e':kind==='leader'?'#c89450':'#b77e47';
  shadow(ctx,V,x,z,27,10,.17);
  box(ctx,V,x-w/2,z-d/2,w,d,23,{top:'#ab6e3c',front:'#81502c',side:'#654025'});
  box(ctx,V,x-w/2-2,z-d/2-2,w+4,d+4,5,{top:wood,front:'#c48b51',side:'#946039',bottom:23,stroke:'#e6bc80'});
  // gaveteiro e filetes, visíveis de frente no ângulo do vídeo
  box(ctx,V,x+w/2-19,z+d/2-12,17,17,16,{top:'#ab7340',front:'#78472e',side:'#694029',bottom:7});
  if(kind!=='meeting'){
    const base=V.P(x,z-10,30),up=V.P(x,z-10,58);
    shadow(ctx,V,x,z-10,10,3,.10);
    // Monitor com chassis cinza e tela azul-escura.
    const grad=ctx.createLinearGradient(base.x-17,up.y,base.x+16,base.y);
    grad.addColorStop(0,'#485963');grad.addColorStop(.12,'#263945');grad.addColorStop(1,'#101e27');
    rect(ctx,up.x-17,up.y-1,34,26,grad,3,'#667982');
    rect(ctx,up.x-14,up.y+3,28,18,'#10212d',1);
    rect(ctx,up.x-11,up.y+7,15,1,'#72abaf');rect(ctx,up.x-11,up.y+12,22,1,'#405c6e');
    rect(ctx,base.x-3,base.y-1,6,9,'#53616a',1);
    const kb=V.P(x,z+5,30);rect(ctx,kb.x-13,kb.y-1,26,5,'#34424a',1);
    const paper=V.P(x-w/2+16,z+4,29);rect(ctx,paper.x-7,paper.y-5,14,10,'#f5e9c9',1,'#d8c6a0');
    const mug=V.P(x+w/2-13,z+2,29);ellipse(ctx,mug.x,mug.y-3,4,4,'#354b53');
  }
}
function glassPanel(ctx:CanvasRenderingContext2D,V:View,x1:number,z1:number,x2:number,z2:number,h:number,fill='#b1e3e637',stroke='#678b93bd'){
  const P=V.P;const corners=[P(x1,z1),P(x2,z2),P(x2,z2,h),P(x1,z1,h)];
  polygon(ctx,corners,fill,stroke,1.45);
  path(ctx,[corners[3],corners[2]],'#e5fffbe0',2.1);
  path(ctx,[corners[0],corners[1]],'#526f7588',1.5);
  path(ctx,[corners[0],corners[3]],'#789ca3b8',1.5);
  path(ctx,[corners[1],corners[2]],'#789ca3b8',1.5);
  const a=P(x1,z1,h*.72),b=P(x2,z2,h*.38);path(ctx,[a,b],'#ffffff37',2.6)
}
/**
 * Sala de vidro. `opacidade` (0..1) é a transição de entrada/saída do squad
 * (ver OfficeV7Frame.progressos); abaixo do limiar a sala não desenha NADA
 * (ela realmente some, em vez de ficar com um indício morto na tela).
 *
 * Squad sem ninguém ativo agora (room.ativa===false) não desenha mais
 * parede/porta/mobília fantasma com a etiqueta "OCULTO" (achado 1 da
 * auditoria de 14/10/2026): vira um indício mínimo, só o contorno do piso e
 * o nome da sala — sem fingir um ambiente fechado que não existe.
 */
function glassRoom(ctx:CanvasRenderingContext2D,V:View,room:Room,opcoes:{opacidade?:number}={}){
  const opacidade=opcoes.opacidade??1;
  if(opacidade<=0.01)return;
  const {x,z,largura:w,profundidade:d,alturaVidro:h,abertura:door}=room;
  const isSquad=room.tipo==='squad';
  const active=isSquad&&room.ativa===true;
  const color=room.cor||'#77938e';
  ctx.save();ctx.globalAlpha=opacidade;
  if(isSquad&&!active){
    roundedArea(ctx,V,room,alpha(color,.08),alpha(color,.3));
    const p=V.P(x+w/2,z+d/2,10);
    const ww=clamp(room.label.length*5.2+34,64,140);
    rect(ctx,p.x-ww/2,p.y-9,ww,18,'#1c2b2d9c',4,alpha(color,.4));
    text(ctx,room.label,p.x,p.y,7.4,'#c7cfc8',760);
    ctx.restore();
    return;
  }
  const floor=isSquad?alpha(color,.25):'#e8e3d0';
  const inner=isSquad?alpha(color,.13):'#cfd6d0a1';
  const glassFill=isSquad?alpha(color,.12):'#b1e3e637';
  const glassStroke=isSquad?alpha(color,.82):'#678b93bd';
  roundedArea(ctx,V,room,floor,isSquad?color:'#8c928c');
  roundedArea(ctx,V,{x:x+7,z:z+7,largura:w-14,profundidade:d-14},inner);
  glassPanel(ctx,V,x,z,x+w,z,h,glassFill,glassStroke);
  glassPanel(ctx,V,x,z,x,z+d,h,glassFill,glassStroke);
  glassPanel(ctx,V,x+w,z,x+w,z+d,h,glassFill,glassStroke);
  if(room.id==='reuniao'){
    desk(ctx,V,x+w/2,z+d/2,'meeting');
    for(const offset of [-48,-10,28,55])chair(ctx,V,x+w/2+offset,z+d/2+37,.7);
    for(const offset of [-37,22])chair(ctx,V,x+w/2+offset,z+d/2-37,.7);
  }else if(room.id==='apoio'){
    desk(ctx,V,x+w*.33,z+d*.55,'work');desk(ctx,V,x+w*.72,z+d*.55,'work');
    for(const offset of [.34,.73])chair(ctx,V,x+w*offset,z+d*.88,.78);
  }
  const half=(w-door)/2;
  glassPanel(ctx,V,x,z+d,x+half,z+d,h,glassFill,glassStroke);
  glassPanel(ctx,V,x+half+door,z+d,x+w,z+d,h,glassFill,glassStroke);
  if(isSquad){
    const p=V.P(x+w/2,z+8,h+18);const status='ATIVO';
    const ww=clamp(room.label.length*6.7+58,112,185);
    ctx.save();ctx.shadowColor='#0b1719aa';ctx.shadowBlur=8;rect(ctx,p.x-ww/2,p.y-13,ww,27,'#20383a',4,color);ctx.restore();
    rect(ctx,p.x-ww/2+6,p.y-7,4,14,color,1);
    text(ctx,room.label,p.x-8,p.y-3,8.7,'#fff5d8',820);
    text(ctx,status,p.x-8,p.y+7,6.5,color,800);
  }else{
    sign(ctx,room.label,V.P(x+w/2,z+10,h+17),clamp(room.label.length*6.7+28,125,197));
  }
  ctx.restore();
}
function drawZones(ctx:CanvasRenderingContext2D,V:View,architecture:Architecture,depth=780){
  roundedArea(ctx,V,{x:315,z:55,largura:1070,profundidade:350},'#d4d0bb','#f0e6cc');
  roundedArea(ctx,V,{x:400,z:420,largura:520,profundidade:235},'#d7d0b8','#f4eacb');
  roundedArea(ctx,V,{x:45,z:370,largura:315,profundidade:215},'#d4d0bc','#eee5cd');
  roundedArea(ctx,V,architecture.lounge,'#c7d0c8','#f0e6d5');
  roundedArea(ctx,V,{x:410,z:748,largura:555,profundidade:Math.max(90,depth-755)},'#d8d1b2','#f4edcd');
  sofa(ctx,V,1015,500,285,true);sofa(ctx,V,1030,635,260);
  sofa(ctx,V,455,770,170);sofa(ctx,V,765,770,165,true);
  for(const p of [[995,480],[1372,485],[995,690],[1375,692],[420,795],[950,805]] as const)plant(ctx,V,p[0],p[1],1.15);
  sign(ctx,'ÁREA DE DESCANSO',V.P(1185,475,38),158);
  sign(ctx,'ESPERA / LOUNGE',V.P(690,760,32),149);
  // Salas de squad NÃO entram no fundo cacheado: a opacidade delas depende
  // do progresso de transição por quadro (ver drawSquadRooms), então são
  // desenhadas de novo a cada frame em desenharEscritorioV7. Aqui só as
  // salas fixas (reunião/apoio), que não têm transição de entrada/saída.
  for(const room of architecture.salas.filter(r=>r.tipo!=='squad'))glassRoom(ctx,V,room);
  path(ctx,[V.P(372,70),V.P(372,820)],'#b9a77f88',1.8);
  for(let z=100;z<810;z+=63){const p=V.P(375,z);ellipse(ctx,p.x,p.y,1.5,1.5,'#c4ae85')}
  const rec=architecture.recepcao;
  box(ctx,V,rec.x,rec.z,rec.largura,rec.profundidade,32,{top:'#f4e8c7',front:'#c9b58c',side:'#987e5a'});
  box(ctx,V,rec.x-3,rec.z-4,rec.largura+6,rec.profundidade+8,7,{top:'#fff2d2',front:'#e1cda3',side:'#c2a579',bottom:32});
  sign(ctx,'RECEPÇÃO',V.P(rec.x+rec.largura/2,rec.z+rec.profundidade,22),104);
  for(const p of [[50,690],[315,700],[350,380],[350,570]] as const)plant(ctx,V,p[0],p[1],1.2)
}
function drawHuman(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,seed:number,isWorking:boolean,walking:boolean,t:number){
  const skin=['#ecc49d','#c99572','#d7a67f','#a66d51'][seed%4];
  const hair=['#2a2526','#513a2c','#b57d45','#42292e'][Math.floor(seed/2)%4];
  const jacket=['#263e5a','#a86a54','#47535e','#635567'][seed%4];
  const bob=walking?Math.sin(t*10+seed)*3:Math.sin(t*2+seed)*.55;
  ctx.save();ctx.translate(x,y+bob);ctx.scale(size,size);
  shadowScreen(ctx,0,0,16,5);
  // sapatos e pernas, discretos no personagem sentado.
  if(!isWorking){rect(ctx,-9,-15,8,13,'#273640',3);rect(ctx,2,-15,8,13,'#273640',3)}
  const coat=ctx.createLinearGradient(-13,-37,15,-12);
  coat.addColorStop(0,'#a3acb3');coat.addColorStop(.3,jacket);coat.addColorStop(1,'#1f333e');
  rect(ctx,-15,-40,30,32,coat,10,'#41545e');
  rect(ctx,-4,-37,8,22,'#e0d7c3',2);
  polygon(ctx,[{x:-4,y:-35},{x:0,y:-26},{x:4,y:-35}], '#647c87');
  // Cabeça/hair toy 3D.
  const face=ctx.createRadialGradient(-5,-54,2,0,-49,21);
  face.addColorStop(0,'#fff0d3');face.addColorStop(.45,skin);face.addColorStop(1,'#956f59');
  ellipse(ctx,0,-51,17,17,face);
  rect(ctx,-17,-68,34,11,hair,7);ellipse(ctx,-10,-62,10,7,hair);ellipse(ctx,8,-64,12,6,hair);
  for(const ex of [-6,6])ellipse(ctx,ex,-51,1.7,1.8,'#283a42');
  path(ctx,[{x:-3,y:-44},{x:3,y:-44}],'#a06857',1.3);
  if(!isWorking){rect(ctx,-19,-35,6,21,jacket,4);rect(ctx,13,-35,6,21,jacket,4)}
  ctx.restore()
}
function shadowScreen(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number){ellipse(ctx,x,y,rx,ry,'#263a3e30')}
function drawRobot(ctx:CanvasRenderingContext2D,x:number,y:number,size:number,seed:number,isWorking:boolean,walking:boolean,t:number){
  const colors=[['#3ae5ad','#008b78'],['#8a64e6','#5640bc'],['#4aaff2','#2771bd'],['#eee6c7','#aaa281'],['#5bc89a','#248e78']];
  const [light,dark]=colors[seed%colors.length];
  const bob=walking?Math.sin(t*11+seed)*2.4:Math.sin(t*2+seed)*.7;
  ctx.save();ctx.translate(x,y+bob);ctx.scale(size,size);
  shadowScreen(ctx,0,0,16,5);
  // pernas arredondadas curtas: não cápsulas sem pé.
  if(!isWorking){rect(ctx,-11,-15,9,12,dark,4);rect(ctx,3,-15,9,12,dark,4)}
  const body=ctx.createLinearGradient(-17,-47,18,-18);body.addColorStop(0,'#f5fff4');body.addColorStop(.14,light);body.addColorStop(.7,dark);body.addColorStop(1,'#263d50');
  rect(ctx,-17,-47,34,34,body,12,'#2a4655');
  // arms with soft highlights
  rect(ctx,-22,-38,7,21,light,4,'#406277');rect(ctx,15,-38,7,21,dark,4,'#406277');
  const dome=ctx.createRadialGradient(-9,-61,1,2,-53,26);
  dome.addColorStop(0,'#f8fff4');dome.addColorStop(.21,light);dome.addColorStop(.68,dark);dome.addColorStop(1,'#214b5b');
  rect(ctx,-21,-76,42,38,dome,17,'#3f6472');
  const visor=ctx.createLinearGradient(-11,-68,14,-46);visor.addColorStop(0,'#1a3747');visor.addColorStop(.65,'#0b2334');visor.addColorStop(1,'#071b2d');
  rect(ctx,-15,-66,30,16,visor,8,'#668c94');
  ellipse(ctx,0,-58,9.5,4.3,'#8aeff2');ellipse(ctx,-2,-59,4.5,1.7,'#e2ffff');
  path(ctx,[{x:0,y:-77},{x:0,y:-85}],'#527586',2.5);
  ellipse(ctx,0,-86,4,4,'#f1d57c');ellipse(ctx,-1,-87,2,2,'#fff4bd');
  rect(ctx,-5,-36,10,7,'#def7f1',2,'#78b3b9');
  ctx.restore()
}
/**
 * Desenha o sprite real (384x512, âncora do chão em 192,496) no quadro certo
 * do ciclo da fase atual. `ancoraX,ancoraY` é o ponto do CHÃO onde os pés do
 * personagem devem pisar (mesmo ponto que `drawHuman`/`drawRobot` usavam).
 * Devolve null quando a imagem ainda não carregou (fallback do chamador
 * desenha o boneco vetorial antigo sem deixar o quadro em branco).
 */
function drawSpriteAgent(ctx:CanvasRenderingContext2D,agent:Agent,pose:Actor['pose'],ancoraX:number,ancoraY:number,population:number,tempo:number){
  const personagem=personagemDoAgente(identidadeDoAgente(agent),agent.tipoVisual)
  const estadoSprite=estadoSpriteDaPose(pose)
  const indiceFrame=quadroAtivo(estadoSprite,tempo,pose.progressoFase??0)
  const image=imagemDoFrame(personagem,estadoSprite,indiceFrame)
  if(!image||!image.complete||!image.naturalWidth)return null
  const targetHeight=population>16?47:population>9?57:population>5?68:82
  const scale=targetHeight/CONTRATO_SPRITE.alturaEmPePx
  const width=CONTRATO_SPRITE.largura*scale
  const height=CONTRATO_SPRITE.altura*scale
  const left=ancoraX-CONTRATO_SPRITE.ancoraX*scale
  const top=ancoraY-CONTRATO_SPRITE.ancoraY*scale
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,left,top,width,height);ctx.restore()
  return {left,top,width,height}
}
function drawAgent(ctx:CanvasRenderingContext2D,V:View,character:Actor,frame:OfficeV7Frame):OfficeV7Hit{
  const a=character.mesa.execucao,pose=character.pose;
  const atDesk=pose.fase==='trabalhando'||pose.fase==='silencioso'||pose.fase==='sentando'||pose.fase==='levantando';
  const point=atDesk?V.P(character.mesa.x,character.mesa.y+15):V.P(pose.x,pose.y);
  const idhash=Array.from(a.chave).reduce((n,ch)=>Math.imul(n^ch.charCodeAt(0),16777619)>>>0,2166136261);
  const selected=frame.selecionadoId===a.chave,hover=frame.hoverId===a.chave;
  const size=atDesk?.55:.64;
  const drawY=point.y+(atDesk?10:0);
  if(selected||hover){ctx.save();ctx.strokeStyle=selected?'#f4c75e':'#62cc99';ctx.lineWidth=selected?3:2;ctx.beginPath();ctx.ellipse(point.x,drawY,21,6,0,0,2*Math.PI);ctx.stroke();ctx.restore()}
  const population=frame.layout.mesas.filter(d=>d.execucao.squad===a.squad&&d.execucao.ativa).length;
  const seated=drawSpriteAgent(ctx,a,pose,point.x,drawY,population,frame.tempo);
  if(!seated){
    if(a.tipoVisual==='humano')drawHuman(ctx,point.x,drawY,size,idhash,atDesk,pose.andando,frame.tempo);
    else drawRobot(ctx,point.x,drawY,size,idhash,atDesk,pose.andando,frame.tempo);
  }
  if(atDesk&&(a.ativa||pose.fase==='silencioso')){
    ellipse(ctx,point.x+(seated?seated.width*.38:17),drawY-(seated?seated.height*.7:31),3.5,3.5,a.ativa?'#70e7aa':'#d9bf70')
  }
  // Tags só dos trabalhando/direção e seleção: descanso não gera parede de etiquetas.
  const isChief=a.squad==='coordenação';
  if(selected||hover||isChief||a.ativa){
    let label=a.nome.replace(/\s+/g,' ').trim();if(label.length>16)label=label.slice(0,15)+'…';
    const ww=clamp(label.length*6.5+22,48,136), yy=seated?seated.top-7:drawY-(a.tipoVisual==='robo'?64:59);
    rect(ctx,point.x-ww/2,yy-10,ww,19,selected?'#665228':'#233a3d',4,selected?'#f1c460':'#b0bca5');
    text(ctx,label,point.x,yy+.3,10.2,'#fff4d3',770)
  }
  return seated
    ? {chave:a.chave,x:seated.left,y:seated.top-18,largura:seated.width,altura:seated.height+33}
    : {chave:a.chave,x:point.x-24,y:drawY-71,largura:48,altura:79}
}
const nav=[['diretores','AGENTES'],['estudio','CONTEÚDO'],['pipeline','COMERCIAL'],['financeiro','FINANCEIRO'],['cofre','CONHECIMENTO'],['ferramentas','OPERAÇÃO']] as const;
function moduleWall(ctx:CanvasRenderingContext2D,V:View):OfficeV7Hit[]{
  const hits:OfficeV7Hit[]=[];
  for(let i=0;i<nav.length;i++){
    const [key,label]=nav[i],x=405+i*165,z=32;
    const p=V.P(x,z,137);
    const ww=136;
    rect(ctx,p.x-ww/2,p.y-13,ww,25,'#2c4145',4,'#9f9b82');
    text(ctx,label,p.x,p.y,9.1,'#e9ebdf',750);
    hits.push({chave:`navegacao:${key}`,modulo:key,x:p.x-ww/2,y:p.y-13,largura:ww,altura:25})
  }
  return hits
}
/** Caixa de clique (AABB) do volume projetado da sala — parede, porta e
 * placa inteiras ficam clicáveis, não só o ponto exato do letreiro. */
function roomAabb(V:View,room:Zone&{alturaVidro:number}):{x:number;y:number;largura:number;altura:number}{
  const {x,z,largura:w,profundidade:d,alturaVidro:h}=room;
  // +40 de margem acima do vidro: a placa (sign/status) flutua acima do
  // telhado (h+18 na hora de desenhar) e também precisa estar dentro da
  // área clicável — "placa" é parte do que o achado 3 pediu.
  const topo=h+40;
  const pontos=[V.P(x,z),V.P(x+w,z),V.P(x,z+d),V.P(x+w,z+d),V.P(x,z,topo),V.P(x+w,z,topo),V.P(x,z+d,topo),V.P(x+w,z+d,topo)];
  const xs=pontos.map(p=>p.x),ys=pontos.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  return {x:minX,y:minY,largura:maxX-minX,altura:maxY-minY};
}
/** Sala de reunião e apoio/administrativo eram decorativas (achado 2): clicar
 * nelas agora abre o módulo que representa o que a sala mostraria — quem
 * está reunido (lista de agentes) e o painel administrativo (financeiro). */
const MODULO_DA_SALA_ESPECIAL:Record<string,string>={reuniao:'diretores',apoio:'financeiro'};
function salaEspecialHits(V:View,arquitetura:Architecture):OfficeV7Hit[]{
  return arquitetura.salas
    .filter(room=>room.tipo!=='squad'&&MODULO_DA_SALA_ESPECIAL[room.id])
    .map(room=>{
      const modulo=MODULO_DA_SALA_ESPECIAL[room.id];
      return {chave:`navegacao:${modulo}`,modulo,...roomAabb(V,room)};
    });
}
/**
 * Desenha as salas de squad FORA do fundo cacheado (opacidade muda a cada
 * quadro) e devolve um hit por sala inteira (parede/porta/placa), achado 3:
 * clicar em qualquer ponto da sala seleciona o mesmo agente que clicar na
 * mesa dele (o ativo, ou o primeiro da ficha quando ninguém está ativo).
 * Sala com progresso 0 nem desenha nem gera hit — ela realmente some
 * (achado 4: a transição de 720ms de PixelOffice.tsx finalmente chega aqui).
 */
function drawSquadRooms(ctx:CanvasRenderingContext2D,V:View,frame:OfficeV7Frame):OfficeV7Hit[]{
  const hits:OfficeV7Hit[]=[];
  for(const room of frame.layout.arquitetura.salas){
    if(room.tipo!=='squad')continue;
    const progresso=room.squad!=null?(frame.progressos?.get(room.squad)??1):1;
    glassRoom(ctx,V,room,{opacidade:progresso});
    if(progresso<=0.01)continue;
    const mesasDoSquad=frame.layout.mesas.filter(mesa=>mesa.execucao.squad===room.squad);
    if(!mesasDoSquad.length)continue;
    const alvo=mesasDoSquad.find(mesa=>mesa.execucao.ativa)??mesasDoSquad[0];
    hits.push({chave:alvo.execucao.chave,...roomAabb(V,room)});
  }
  return hits;
}
function paintStatic(ctx:CanvasRenderingContext2D,V:View,frame:OfficeV7Frame){
  ctx.fillStyle='#0a1520';ctx.fillRect(0,0,V.sceneW,V.sceneH);
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const depth=Math.max(780,frame.layout.altura-40);
  floorAndWalls(ctx,V,depth);drawZones(ctx,V,frame.layout.arquitetura,depth);
  // As poses sentadas já incluem mesa e cadeira. Os módulos ativos deixam o
  // posto livre para esse sprite; os inativos desenham só mobiliário fantasma.
  for(const p of [[972,450],[1390,455],[976,790],[1395,790],[390,420],[390,735]] as const)plant(ctx,V,p[0],p[1],.8);
  ctx.restore()
}
type Cache={key:string;canvas:HTMLCanvasElement};let staticCache:Cache|null=null;
function base(ctx:CanvasRenderingContext2D,V:View,f:OfficeV7Frame){
  const key=JSON.stringify([V.sceneW,V.sceneH,f.layout.arquitetura.salas]);
  if(typeof document==='undefined'){paintStatic(ctx,V,f);return}
  if(!staticCache||staticCache.key!==key){
    const canvas=document.createElement('canvas');canvas.width=V.sceneW;canvas.height=V.sceneH;
    const cx=canvas.getContext('2d');if(cx)paintStatic(cx,V,f);
    staticCache={key,canvas};
  }
  ctx.drawImage(staticCache.canvas,0,0)
}
export function desenharEscritorioV7(ctx:CanvasRenderingContext2D,frame:OfficeV7Frame):OfficeV7Hit[]{
  const V=v(frame.layout);const hits:OfficeV7Hit[]=[];
  ctx.save();try{
    base(ctx,V,frame);
    hits.push(...moduleWall(ctx,V));
    hits.push(...salaEspecialHits(V,frame.layout.arquitetura));
    hits.push(...drawSquadRooms(ctx,V,frame));
    const avatars=[...frame.personagens].sort((a,b)=>{
      const pa=(a.pose.fase==='descanso')?V.P(a.pose.x,a.pose.y):V.P(a.mesa.x,a.mesa.y+15);
      const pb=(b.pose.fase==='descanso')?V.P(b.pose.x,b.pose.y):V.P(b.mesa.x,b.mesa.y+15);
      return pa.y-pb.y;
    });
    for(const character of avatars)hits.push(drawAgent(ctx,V,character,frame));
    // O palco é uma representação; contagem somente de dados recebidos.
    const counts={active:frame.personagens.filter(a=>a.mesa.execucao.ativa).length,rests:frame.personagens.filter(a=>a.mesa.execucao.execucao.estado==='parado').length};
    const p=V.P(1170,677,16);
    text(ctx,`${counts.rests} EM DESCANSO  ·  ${counts.active} ATIVOS`,p.x,p.y,10,'#425454',760)
  }finally{ctx.restore()}
  const squadRooms=frame.layout.arquitetura.salas.filter(room=>room.tipo==='squad');
  ctx.canvas.dataset.officeRenderer='ct-modular-v8';
  ctx.canvas.dataset.officeSpriteAgents=String(frame.personagens.length);
  ctx.canvas.dataset.officeSeatedAgents=String(frame.personagens.filter(a=>a.pose.fase==='trabalhando'&&a.mesa.execucao.ativa).length);
  ctx.canvas.dataset.officeRobotAgents=String(frame.personagens.filter(a=>a.mesa.execucao.tipoVisual==='robo').length);
  ctx.canvas.dataset.officeHumanAgents=String(frame.personagens.filter(a=>a.mesa.execucao.tipoVisual==='humano').length);
  ctx.canvas.dataset.officeResting=String(frame.personagens.filter(a=>a.mesa.execucao.execucao.estado==='parado').length);
  // Diagnóstico opcional da animação (achado "loop visual precisa de sprites
  // animados"): quantos atores estão em cada fase de transição agora mesmo.
  // Lido do próprio `frame.personagens`, nunca inventado.
  ctx.canvas.dataset.officeDigitando=String(frame.personagens.filter(a=>a.pose.fase==='trabalhando').length);
  ctx.canvas.dataset.officeCaminhando=String(frame.personagens.filter(a=>a.pose.fase==='caminhando_para_mesa'||a.pose.fase==='caminhando_para_descanso').length);
  ctx.canvas.dataset.officeLevantando=String(frame.personagens.filter(a=>a.pose.fase==='levantando').length);
  ctx.canvas.dataset.officeSentando=String(frame.personagens.filter(a=>a.pose.fase==='sentando').length);
  ctx.canvas.dataset.officeModuleRooms=String(squadRooms.length);
  ctx.canvas.dataset.officeActiveModules=String(squadRooms.filter(room=>room.ativa).length);
  ctx.canvas.dataset.officeHiddenModules=String(squadRooms.filter(room=>!room.ativa).length);
  // Prova de que a transição de PixelOffice.tsx chega ao renderer (achado 4):
  // quantas salas estão a meio de entrar/sair agora mesmo (0<progresso<1).
  ctx.canvas.dataset.officeTransitioningModules=String(squadRooms.filter(room=>{
    const progresso=room.squad!=null?frame.progressos?.get(room.squad):undefined;
    return progresso!==undefined&&progresso>0.01&&progresso<0.99;
  }).length);
  return hits
}
