import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { inspect, apply, restore, gitBlob, sha256 } from '../scripts/aplicar-ct.mjs'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const final=fs.readFileSync(path.join(ROOT,'web/src/ui/PixelOffice.tsx'),'utf8')
const changes=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/visual-changes.json'),'utf8'))
let original=final
for(const c of [...changes].reverse()){
 assert.equal(original.split(c.after).length,2,`Âncora final de ${c.label}`)
 original=original.replace(c.after,c.before)
}
assert.equal(gitBlob(Buffer.from(original)),'86282b346ed24540a4fdf53461ef51da55597710')
const expected=['pixel-agents','escritorio-animacao','useAgentesVivos','ambiente','lancadores']
for(const id of expected)assert.ok(final.includes(`../dados/${id}'`))
assert.ok(!fs.existsSync(path.join(ROOT,'web/src/dados')),'Pacote não pode substituir dados/configuração')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ct-office-test-')),repo=path.join(temp,'repo')
fs.mkdirSync(path.join(repo,'web/src/ui'),{recursive:true});fs.writeFileSync(path.join(repo,'web/package.json'),'{}')
fs.writeFileSync(path.join(repo,'web/src/ui/PixelOffice.tsx'),original)
execFileSync('git',['init',repo],{stdio:'ignore'})
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'MANIFEST.json'),'utf8'))
// Na fixture do instalador, dependências têm sentinelas. O pacote real mantém os SHAs lidos do GitHub.
const testManifest=structuredClone(manifest)
for(const d of testManifest.dependencies){const p=path.join(repo,d.path);fs.mkdirSync(path.dirname(p),{recursive:true});const content=Buffer.from('// fixture imutável '+d.path);fs.writeFileSync(p,content);d.gitBlob=gitBlob(content)}
let assertions=0
const check=(label,fn)=>{fn();assertions++;console.log('OK',label)}
try {
 check('checagem não grava',()=>{const report=inspect(repo,ROOT,testManifest);assert.equal(report.plan.length,6);assert.equal(fs.readFileSync(path.join(repo,'web/src/ui/PixelOffice.tsx'),'utf8'),original)})
 check('dependência divergente bloqueia',()=>{const wrong=structuredClone(testManifest);wrong.dependencies[0].gitBlob='0'.repeat(40);assert.throws(()=>inspect(repo,ROOT,wrong),/Dependência/);assert.equal(fs.readFileSync(path.join(repo,'web/src/ui/PixelOffice.tsx'),'utf8'),original)})
 check('código concorrente bloqueia',()=>{const p=path.join(repo,'web/src/ui/PixelOffice.tsx');fs.appendFileSync(p,'\n// novo trabalho');assert.throws(()=>inspect(repo,ROOT,testManifest),/divergiu/);fs.writeFileSync(p,original)})
 check('CRLF da cópia Windows é aceito',()=>{const p=path.join(repo,'web/src/ui/PixelOffice.tsx');fs.writeFileSync(p,original.replace(/\n/g,'\r\n'));inspect(repo,ROOT,testManifest);fs.writeFileSync(p,original)})
 let installed
 check('instalação completa de seis arquivos',()=>{installed=apply(inspect(repo,ROOT,testManifest));assert.equal(installed.changed,6);assert.equal(fs.readFileSync(path.join(repo,'web/src/ui/PixelOffice.tsx'),'utf8'),final)})
 check('aplicação é idempotente',()=>assert.equal(apply(inspect(repo,ROOT,testManifest)).changed,0))
 check('backup exato e fora dos arquivos versionados',()=>{assert.ok(installed.backup.includes('.git'));const record=JSON.parse(fs.readFileSync(path.join(installed.backup,'backup.json'),'utf8'));const item=record.files.find(x=>x.path.endsWith('PixelOffice.tsx'));assert.equal(sha256(fs.readFileSync(path.join(installed.backup,item.backupFile))),sha256(Buffer.from(original)))})
 check('reversão protege edição posterior',()=>{const p=path.join(repo,'web/src/ui/PixelOffice.tsx');fs.appendFileSync(p,'\n// edição após aplicar');assert.throws(()=>restore(repo,installed.backup),/editado após/);fs.writeFileSync(p,final)})
 check('reversão integral',()=>{assert.equal(restore(repo,installed.backup),6);assert.equal(fs.readFileSync(path.join(repo,'web/src/ui/PixelOffice.tsx'),'utf8'),original);assert.equal(fs.existsSync(path.join(repo,'web/src/ui/PixelOffice.gold.ts')),false)})
 check('nova edição entre checar e aplicar bloqueia',()=>{const report=inspect(repo,ROOT,testManifest);const p=path.join(repo,'web/src/ui/PixelOffice.tsx');fs.appendFileSync(p,'\n// novo');assert.throws(()=>apply(report),/concorrente/);fs.writeFileSync(p,original)})
 console.log(JSON.stringify({checks:assertions,sourcePreservation:'exact original Git blob',base:'86282b346ed24540a4fdf53461ef51da55597710',result:'passed'}))
} finally {fs.rmSync(temp,{recursive:true,force:true})}
