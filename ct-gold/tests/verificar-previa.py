"""QA local da prévia React (dados/adaptadores simulados; não é build de produção).
Requer Python + playwright e Chromium. Não consulta rede nem o servidor do usuário.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os
ROOT = Path(__file__).resolve().parents[1]
RESULT = {'environment':'Chromium local + React 18.2 da prévia; não React 19/Vite de produção', 'checks':[], 'viewports':[], 'errors':[]}

def ok(label):
    RESULT['checks'].append(label)
    print('OK',label,flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1672,'height':1100},device_scale_factor=1)
    page.on('pageerror',lambda err: RESULT['errors'].append(str(err)))
    page.set_content((ROOT/'PREVIA-CT-ANIMADA.html').read_text(),wait_until='load')
    page.wait_for_function('window.__officeDemo && window.__officeDemo.frame.personagens.length === 24')
    page.wait_for_timeout(850)
    ok('TSX real atualizado montado na prévia com 24 agentes simulados')
    page.get_by_role('button',name='Pausar',exact=True).click()
    page.wait_for_timeout(50)
    time_before=page.evaluate('window.__officeDemo.frame.tempo')
    page.wait_for_timeout(150)
    assert page.evaluate('window.__officeDemo.frame.tempo')==time_before
    ok('Pausa congela o relógio de animação')
    RESULT['renderer']=page.evaluate('''() => {
      const {frame,renderer}=window.__officeDemo;
      const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(freeze)}return o};
      const c=document.createElement('canvas');c.width=1600;c.height=1800;const ctx=c.getContext('2d');let calls=0;
      for(const day of [0,.25,.5,.75,1])for(const phase of ['trabalhando','silencioso','descanso','sentando','levantando','caminhando_para_mesa','caminhando_para_descanso'])for(const reduced of [true,false]){
        const f=structuredClone(frame); f.progressoDia=day;f.reduzirMovimento=reduced;
        f.personagens.forEach(d=>{d.pose.fase=phase;d.pose.andando=phase.startsWith('caminhando');d.pose.sentado=phase==='sentando'?.5:phase==='levantando'?.3:1});
        const before=JSON.stringify(f);freeze(f);ctx.setTransform(1.2,0,0,1.2,13,9);ctx.globalAlpha=.8;ctx.lineWidth=5;ctx.fillStyle='#123456';const saved=[ctx.getTransform().toString(),ctx.globalAlpha,ctx.lineWidth,ctx.fillStyle];
        const hits=renderer(ctx,f);
        if(JSON.stringify(f)!==before)throw Error('Mutação dos dados');
        if(JSON.stringify(saved)!==JSON.stringify([ctx.getTransform().toString(),ctx.globalAlpha,ctx.lineWidth,ctx.fillStyle]))throw Error('Contexto não restaurado');
        if(new Set(hits.map(h=>h.chave)).size!==f.personagens.length)throw Error('Agentes a mais/menos');
        if(hits.some(h=>![h.x,h.y,h.largura,h.altura].every(Number.isFinite)||h.largura<=0||h.altura<=0))throw Error('Hit inválido');calls++;
      }
      for(const t of [0,.25,.5,.75,1]){
        const f={...frame,progressos:new Map(frame.layout.ilhas.map(i=>[i.squad,t]))};const before=JSON.stringify([...f.progressos]);
        if(new Set(renderer(ctx,f).map(h=>h.chave)).size!==frame.personagens.length)throw Error('Identidade perdida');if(before!==JSON.stringify([...f.progressos]))throw Error('Mutação de progressos');calls++;
      }
      const empty=structuredClone(frame);empty.layout.ilhas=[];empty.layout.mesas=[];empty.layout.ocupantesDescanso=0;empty.layout.descansoAberto=false;empty.personagens=[];if(renderer(ctx,freeze(empty)).length)throw Error('Agente inventado');
      const one=structuredClone(frame);one.layout.ilhas=one.layout.ilhas.slice(0,1);one.layout.mesas=one.layout.ilhas[0].mesas;one.personagens=one.personagens.filter(d=>d.mesa.execucao.squad===one.layout.ilhas[0].squad);if(new Set(renderer(ctx,freeze(one)).map(h=>h.chave)).size!==one.personagens.length)throw Error('Squad oculto desenhado');
      return {calls,phases:7,reducedMotion:true,inputMutation:false,canvasStateRestored:true,emptyAndHidden:'passed'};
    }''')
    ok('75 cenários gráficos: fases, dia/noite, movimento reduzido e transições; sem mutações')
    RESULT['adapters']=page.evaluate('''() => {
      const m=window.__modules('/ui/PixelOffice.wall-data');let tests=0;const eq=(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(JSON.stringify({a,b}));tests++};
      eq(m.numeroMedido(null),null);eq(m.numeroMedido(0),0);eq(m.numeroMedido(-1),null);eq(m.numeroMedido(NaN),null);eq(m.numeroMedido(Infinity),null);eq(m.numeroMedido('10'),null);
      eq(m.totalizarGastos(),[]);eq(m.totalizarGastos({itens:[{moeda:'BRL',valor:0},{moeda:'USD',valor:10}]}),[{moeda:'BRL',valor:0},{moeda:'USD',valor:10}]);
      eq(m.totalizarGastos({itens:[{moeda:'BRL',valor:null},{moeda:'BRL',valor:10}]}),[{moeda:'BRL',valor:null}]);
      eq(m.totalizarGastos({itens:[{moeda:'BRL',valor:2},{moeda:'brl',valor:3}]}),[{moeda:'BRL',valor:5}]);
      eq(m.montarUsoParede().map(p=>[p.percentual,p.tokens,p.observado]),[[null,null,false],[null,null,false]]);
      const groups=[{id:'renato',nome:'Renato',agentes:[{id:'x',dono:'renato',estado:'trabalhando',tarefa:'A'},{id:'x',dono:'renato',estado:'trabalhando',tarefa:'A'}]},{id:'luana',nome:'Luana',agentes:[{id:'x',dono:'luana',estado:'silencioso',tarefa:'B'}]},{id:'bia',nome:'Bia',agentes:[{id:'z',dono:'bia',estado:'trabalhando'}]}];
      const result=m.montarTarefasParede(groups,a=>({chave:a.dono+':'+a.id,nome:a.id}));eq(result.map(c=>c.tarefas.map(t=>t.chave)),[['renato:x'],['luana:x']]);eq(result[1].tarefas[0].estado,'silencioso');
      eq(m.montarTarefasParede(groups,()=>undefined).map(c=>c.tarefas),[[],[]]);return {tests,result:'passed'};
    }''')
    ok('14 testes dos adaptadores: nulo ≠ zero, moedas separadas e lançador declarado')
    # Click labels using exact canvas CSS scale, including scrolling within the room.
    page.locator('.ct-room').scroll_into_view_if_needed()
    keys=page.evaluate('window.__officeDemo.frame.personagens.map(d=>d.mesa.execucao.chave)')
    for key in keys:
        point=page.evaluate('''key=>{const h=[...window.__officeDemo.hits].reverse().find(h=>h.chave===key);const canvas=document.querySelector('canvas'),box=canvas.parentElement;
          const sx=parseFloat(canvas.style.width)/window.__officeDemo.frame.layout.largura,sy=parseFloat(canvas.style.height)/window.__officeDemo.frame.layout.altura;
          box.scrollTop=Math.max(0,(h.y+h.altura/2)*sy-box.clientHeight/2);box.scrollLeft=Math.max(0,(h.x+h.largura/2)*sx-box.clientWidth/2);
          const r=canvas.getBoundingClientRect();return{x:r.left+(h.x+h.largura/2)*sx,y:r.top+(h.y+h.altura/2)*sy};}''',key)
        page.mouse.click(point['x'],point['y'])
        page.wait_for_function('(key)=>window.__demoController().selected===key',arg=key,timeout=2000)
    ok('24 etiquetas clicadas no canvas e associadas ao agente correto')
    page.locator('canvas').focus();page.keyboard.press('ArrowRight');page.wait_for_timeout(100)
    assert page.evaluate('window.__demoController().selected') in keys
    ok('Seleção pelo teclado')
    page.get_by_role('button',name='Só ativos',exact=True).click();page.wait_for_timeout(100)
    assert page.evaluate('window.__officeDemo.frame.personagens.every(d=>d.mesa.execucao.ativa)')
    page.get_by_role('button',name='Só ativos',exact=True).click();page.wait_for_timeout(100)
    ok('Filtro Só ativos usa as regras existentes')
    page.locator('[data-testid="office-tasks-renato"] button').first.click();page.wait_for_timeout(100)
    assert page.evaluate('window.__demoController().selected')=='renato:sessao-renato'
    ok('Tarefa na parede seleciona a execução sem alterar o trabalho')
    page.get_by_role('button',name='Retomar',exact=True).click()
    page.locator('#demo-state').click();page.wait_for_timeout(90)
    phases=page.evaluate('window.__officeDemo.frame.personagens.filter(d=>d.mesa.execucao.nome==="Renato").map(d=>d.pose.fase)')
    assert phases[0] in ['levantando','caminhando_para_descanso'],phases
    page.wait_for_function('window.__officeDemo.frame.personagens.some(d=>d.mesa.execucao.nome==="Renato" && d.pose.fase==="descanso")',timeout=8000)
    page.locator('#demo-state').click()
    page.wait_for_function('window.__officeDemo.frame.personagens.some(d=>d.mesa.execucao.nome==="Renato" && d.pose.fase==="trabalhando")',timeout=8000)
    ok('Mudança de estado: trabalhar → levantar/caminhar → descansar → voltar à mesa')
    page.locator('#demo-sonda').click();page.wait_for_timeout(80)
    assert 'VERIFICAR SONDA' in page.locator('.ct-header-status').inner_text()
    assert 'Leitura não confirmada' in page.locator('.ct-tasks').inner_text()
    page.locator('#demo-sonda').click()
    ok('Falha da sonda é exibida; não aparece saúde operacional inventada')
    page.locator('#demo-day').click();page.wait_for_timeout(80)
    assert page.locator('canvas').get_attribute('data-office-environment')=='dia'
    page.locator('#demo-day').click()
    ok('Dia/noite continua ligado ao ambiente')
    RESULT['populations']=[]
    for count in [0,12,24,48,96]:
        page.locator('#demo-count').select_option(str(count));page.wait_for_timeout(850)
        actual=page.evaluate('window.__officeDemo.frame.personagens.length')
        assert actual==count,(count,actual)
        RESULT['populations'].append({'input':count,'visible':actual,'coworking':page.locator('canvas').get_attribute('data-office-coworking')})
    ok('0, 12, 24, 48 e 96 agentes; expansão do coworking sem limite fixo de 40')
    page.get_by_role('button',name='Pausar',exact=True).click();page.wait_for_timeout(100)
    RESULT['regression']=page.evaluate('''() => {
      const n=window.__modules('/ui/PixelOffice'),o=window.__modules('/ui/Original'),d=window.__demoController().data;let compared=0;
      for(const count of [0,1,12,24,48,96]){
        const args=[d.agentes.slice(0,count),d.catalogo.slice(0,Math.min(count,24)),{sessao:[]}];
        const a=n.montarExecucoesVisuais(...args),b=o.montarExecucoesVisuais(...args);if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Execuções diferem');compared++;
        for(const width of [320,900,1600])for(const height of [420,600]){
          const opts={larguraDisponivel:width,alturaDisponivel:height};if(JSON.stringify(n.calcularLayoutSala(a,opts))!==JSON.stringify(o.calcularLayoutSala(b,opts)))throw Error('Layout difere');compared++;
        }
      }return {comparisons:compared,result:'iguais ao componente original; catálogo simulado da prévia'};
    }''')
    ok('42 comparações das funções do original e novo: mesmos agentes e coordenadas')
    RESULT['rendererTiming96']=page.evaluate('''() => {const {frame,renderer}=window.__officeDemo,c=document.createElement('canvas');c.width=1600;c.height=1000;const ctx=c.getContext('2d'),times=[];for(let i=0;i<20;i++){const t=performance.now();renderer(ctx,frame);times.push(performance.now()-t)}times.sort((a,b)=>a-b);return {medianMs:times[10],p95Ms:times[18],note:'Somente renderer na máquina de QA; não mede FPS nem servidor do usuário'};}''')
    page.locator('#demo-count').select_option('24');page.wait_for_timeout(850)
    for width in [320,390,768,1100,1440,1672,1920]:
        page.set_viewport_size({'width':width,'height':1100});page.wait_for_timeout(120)
        metrics=page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelector("canvas").width,internalScroll:document.querySelector(".ct-room-scroll").scrollWidth>document.querySelector(".ct-room-scroll").clientWidth})')
        assert metrics['scroll']<=width,(width,metrics)
        RESULT['viewports'].append(metrics)
        if width==390:page.screenshot(path=str(ROOT/'preview/CT-MOBILE.png'),full_page=True)
        if width==1672:
            page.screenshot(path=str(ROOT/'preview/CT-DESKTOP.png'),full_page=True)
            page.locator('.ct-room').screenshot(path=str(ROOT/'preview/CT-ESCRITORIO.png'))
    ok('7 larguras de tela sem overflow horizontal da página')
    page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(80)
    assert page.evaluate('window.__officeDemo.frame.reduzirMovimento')
    ok('Preferência de movimento reduzido chega ao renderer')
    assert not RESULT['errors'],RESULT['errors']
    browser.close()
(ROOT/'docs/QA-PREVIA.json').write_text(json.dumps(RESULT,ensure_ascii=False,indent=2))
print(json.dumps(RESULT,ensure_ascii=False,indent=2))
