from pathlib import Path
import json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000})
 page.clock.install()
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((root/'PREVIA-CT-ANIMADA.html').read_text())
 page.wait_for_function('window.__officeDemo?.frame.personagens.length===24')
 page.clock.fast_forward(1000)
 page.evaluate('window.__demoController().setData(d=>({...d,agentes:d.agentes.map(a=>({...a,estado:"parado"}))}))')
 page.wait_for_timeout(80)
 page.clock.fast_forward(179000)
 before=page.evaluate('window.__officeDemo.frame.layout.ilhas.map(i=>i.squad)')
 assert len(before)==4,before
 page.clock.fast_forward(1050)
 page.wait_for_timeout(30)
 exiting=page.evaluate('[...window.__officeDemo.frame.progressos.keys()]')
 page.clock.fast_forward(850)
 page.wait_for_timeout(80)
 after=page.evaluate('window.__officeDemo.frame.layout.ilhas.map(i=>i.squad)')
 assert after==['coordenação'],after
 page.evaluate('window.__demoController().setData(d=>({...d,agentes:d.agentes.map((a,i)=>i===3?{...a,estado:"trabalhando"}:a)}))')
 page.wait_for_timeout(60);page.clock.fast_forward(1000);page.wait_for_timeout(60)
 reopened=page.evaluate('window.__officeDemo.frame.layout.ilhas.map(i=>i.squad)')
 assert 'bots' in reopened,reopened
 assert not errors,errors
 result={'environment':'Prévia com relógio virtual do Playwright; dados simulados', 'before179s':before,'after180sPlus720ms':after,'reactivated':reopened,'errors':errors,'result':'passed'}
 (root/'docs/QA-SQUADS.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result))
 b.close()
