#!/usr/bin/env node
/** Instalação local conservadora. Nunca executa git add/commit/push ou comandos no servidor. */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED = new Set([
  'web/src/ui/PixelOffice.tsx', 'web/src/ui/PixelOffice.gold.ts',
  'web/src/ui/PixelOffice.gold.css', 'web/src/ui/PixelOffice.wall.tsx',
  'web/src/ui/PixelOffice.wall-data.ts', 'web/src/assets/casal-do-trafego.png',
])
const bytes = file => fs.readFileSync(file)
const canonical = (b, file) => /\.(tsx?|css)$/.test(file) ? Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n')) : b
export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex')
export const gitBlob = b => crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')
const digest = (b, file) => sha256(canonical(b, file))
function destination(repo, relative) {
  if (!relative || relative.split('/').includes('..') || path.isAbsolute(relative)) throw new Error(`Caminho inválido: ${relative}`)
  const dest = path.resolve(repo, relative)
  if (!dest.startsWith(repo + path.sep)) throw new Error('Destino fora do repositório')
  let current = repo
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Link simbólico recusado: ${current}`)
  }
  return dest
}
function gitDir(repo) {
  try { return path.resolve(repo, execFileSync('git', ['-C', repo, 'rev-parse', '--git-dir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()) }
  catch { throw new Error('Use uma cópia Git do projeto. Não aplique diretamente sobre a pasta de produção.') }
}
export function inspect(repoArg, packageDir = PACKAGE, manifestOverride) {
  const repo = fs.realpathSync(path.resolve(repoArg))
  gitDir(repo)
  const manifest = manifestOverride || JSON.parse(fs.readFileSync(path.join(packageDir, 'MANIFEST.json'), 'utf8'))
  if (!fs.existsSync(destination(repo, 'web/package.json'))) throw new Error('A raiz informada não contém web/package.json')
  for (const item of manifest.dependencies || []) {
    const file = destination(repo, item.path)
    if (!fs.existsSync(file) || gitBlob(canonical(bytes(file), item.path)) !== item.gitBlob) throw new Error(`Dependência mudou ou falta: ${item.path}. Reconciliar com a versão atual; nada foi gravado.`)
  }
  const plan = []
  for (const item of manifest.files) {
    if (!ALLOWED.has(item.path)) throw new Error(`Arquivo fora do escopo autorizado: ${item.path}`)
    const src = path.join(packageDir, item.path), target = destination(repo, item.path)
    const content = bytes(src)
    if (digest(content, item.path) !== item.sha256) throw new Error(`Pacote alterado ou corrompido: ${item.path}`)
    const exists = fs.existsSync(target), old = exists ? bytes(target) : null
    const same = old !== null && digest(old, item.path) === item.sha256
    if (!same && item.beforeGitBlob && (old === null || gitBlob(canonical(old, item.path)) !== item.beforeGitBlob)) throw new Error(`PixelOffice.tsx divergiu da base. Não sobrescrever; comparar o patch. Nada foi gravado.`)
    if (!same && old !== null && !item.beforeGitBlob) throw new Error(`Arquivo já existe com outro conteúdo: ${item.path}. Nada foi gravado.`)
    plan.push({ ...item, src, target, exists, same, beforeHash: old === null ? null : sha256(old) })
  }
  return { repo, plan, baseCommit: manifest.baseCommit }
}
function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.ct-${crypto.randomUUID()}.tmp`
  try { fs.writeFileSync(temp, content, { flag: 'wx' }); fs.renameSync(temp, file) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}
function currentMatches(item) {
  return item.exists ? fs.existsSync(item.target) && sha256(bytes(item.target)) === item.beforeHash : !fs.existsSync(item.target)
}
export function apply(report) {
  const pending = report.plan.filter(item => !item.same)
  if (!pending.length) return { changed: 0, backup: null }
  for (const item of report.plan) if (!currentMatches(item)) throw new Error(`Edição concorrente detectada: ${item.path}. Nada foi gravado.`)
  const backup = path.join(gitDir(report.repo), 'ct-office-backups', `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`)
  fs.mkdirSync(backup, { recursive: true })
  const record = { repo: report.repo, files: pending.map((item, i) => ({ path: item.path, existed: item.exists, beforeHash: item.beforeHash, installedHash: sha256(bytes(item.src)), backupFile: item.exists ? `${i}.original` : null })) }
  pending.forEach((item, i) => { if (item.exists) fs.writeFileSync(path.join(backup, `${i}.original`), bytes(item.target), { flag: 'wx' }) })
  fs.writeFileSync(path.join(backup, 'backup.json'), JSON.stringify(record, null, 2))
  const done = []
  try {
    for (const item of pending) {
      if (!currentMatches(item)) throw new Error(`Edição concorrente: ${item.path}`)
      const content = bytes(item.src)
      if (digest(content, item.path) !== item.sha256) throw new Error(`Pacote mudou durante a aplicação: ${item.path}`)
      atomicWrite(item.target, content); done.push(item)
    }
  } catch (error) {
    for (const item of [...done].reverse()) {
      const previous = record.files.find(r => r.path === item.path)
      if (fs.existsSync(item.target) && sha256(bytes(item.target)) === previous.installedHash) {
        if (previous.existed) atomicWrite(item.target, bytes(path.join(backup, previous.backupFile)))
        else fs.unlinkSync(item.target)
      }
    }
    throw new Error(`Aplicação interrompida: ${error.message}. Backup: ${backup}`)
  }
  return { changed: pending.length, backup }
}
export function restore(repoArg, backupArg) {
  const repo = fs.realpathSync(path.resolve(repoArg)), base = path.resolve(gitDir(repo), 'ct-office-backups')
  const backup = fs.realpathSync(path.resolve(backupArg))
  if (!backup.startsWith(base + path.sep)) throw new Error('Use somente o backup criado por este instalador em .git/ct-office-backups')
  const record = JSON.parse(fs.readFileSync(path.join(backup, 'backup.json'), 'utf8'))
  if (record.repo !== repo) throw new Error('O backup pertence a outro repositório')
  for (const item of record.files) {
    if (!ALLOWED.has(item.path)) throw new Error('Arquivo inesperado no backup')
    const target = destination(repo, item.path)
    if (!fs.existsSync(target) || sha256(bytes(target)) !== item.installedHash) throw new Error(`Arquivo editado após a instalação: ${item.path}. Reversão bloqueada para proteger o trabalho novo.`)
    if (item.existed && (!/^\d+\.original$/.test(item.backupFile) || sha256(bytes(path.join(backup, item.backupFile))) !== item.beforeHash)) throw new Error('Backup não confere')
  }
  for (const item of [...record.files].reverse()) {
    const target = destination(repo, item.path)
    if (item.existed) atomicWrite(target, bytes(path.join(backup, item.backupFile)))
    else fs.unlinkSync(target)
  }
  return record.files.length
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), repo = args[0]
    if (!repo || repo.startsWith('--')) throw new Error('Uso: node scripts/aplicar-ct.mjs CAMINHO_DO_REPO [--check | --apply | --restore CAMINHO_DO_BACKUP]')
    const mode = args[1] || '--check'
    if (!['--check', '--apply', '--restore'].includes(mode)) throw new Error('Opção desconhecida. Nada foi gravado.')
    if (mode === '--restore') { if (!args[2]) throw new Error('Informe o backup'); console.log(`Restaurados ${restore(repo, args[2])} arquivos. Nenhum commit/push feito.`) }
    else {
      const report = inspect(repo)
      console.log(`Base: ${report.baseCommit}`)
      report.plan.forEach(item => console.log(`${item.same ? 'JÁ IGUAL' : item.exists ? 'SUBSTITUIR' : 'ADICIONAR'}  ${item.path}`))
      if (mode === '--apply') { const result = apply(report); console.log(`${result.changed} arquivos aplicados. Backup: ${result.backup || 'sem alteração'}. Execute o build/testes antes do commit. Nenhum commit/push feito.`) }
      else console.log('Verificação aprovada. Nada foi gravado. Use --apply para aplicar nesta cópia Git.')
    }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
