// Run the real API against independent working-tree copies, never registered projects.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { tsxApi } from '../ci/tsx-api.mjs'

const require = createRequire(new URL('../../apps/server/package.json', import.meta.url))
const YAML = require('yaml')
let appModule
const loadApp = () => appModule ??= tsxApi().then((api) => api.tsImport('../../apps/server/src/app.ts', { parentURL: import.meta.url, tsconfig: false }))
const EXCLUDED = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', '.build', '.next', '.lake', '.DS_Store'])
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const isWithin = (root, target) => target === root || (!path.relative(root, target).startsWith(`..${path.sep}`) && path.relative(root, target) !== '..' && !path.isAbsolute(path.relative(root, target)))
const plainError = (error) => error instanceof Error ? error.message : String(error)
const enc = encodeURIComponent

function hashFile(file) {
  const h = createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const bytes = Buffer.alloc(1024 * 1024)
  try { let n; while ((n = fs.readSync(fd, bytes, 0, bytes.length, null))) h.update(bytes.subarray(0, n)) }
  finally { fs.closeSync(fd) }
  return h.digest('hex')
}

export function gitStatus(root) {
  const result = spawnSync('git', ['--no-optional-locks', '-C', root, 'status', '--porcelain=v1', '-uall', '--ignore-submodules=all'], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  return result.status === 0 ? { available: true, text: result.stdout } : { available: false, error: result.error?.message ?? result.stderr.trim() }
}

/** Copy bytes, including ignored and uncommitted files; never clone or hardlink. */
export function copyWorkingTree(source, destination) {
  const manifest = []
  const omissions = []
  const links = []
  const visit = (relative = '') => {
    const from = path.join(source, relative)
    const to = path.join(destination, relative)
    const st = fs.lstatSync(from)
    if (st.isSymbolicLink()) { links.push({ relative, target: fs.readlinkSync(from) }); return }
    if (st.isDirectory()) {
      fs.mkdirSync(to, { recursive: true })
      for (const name of fs.readdirSync(from).sort()) {
        if (EXCLUDED.has(name)) { omissions.push({ file: path.join(relative, name), reason: 'excluded-cache-or-git' }); continue }
        visit(path.join(relative, name))
      }
    } else if (st.isFile()) {
      fs.copyFileSync(from, to)
      fs.chmodSync(to, (st.mode & 0o777) | 0o200)
      const before = hashFile(from)
      if (hashFile(to) !== before) throw new Error(`복사하는 동안 원본이 바뀌었습니다: ${relative}`)
      manifest.push({ file: relative, hash: before, size: st.size })
    } else omissions.push({ file: relative, reason: 'unsupported-file-type' })
  }
  visit()
  for (const link of links) {
    let real
    try { real = fs.realpathSync(path.join(source, link.relative)) } catch { omissions.push({ file: link.relative, reason: 'dangling-symlink' }); continue }
    if (!isWithin(source, real)) { omissions.push({ file: link.relative, reason: 'external-symlink' }); continue }
    const relativeTarget = path.relative(source, real)
    const toTarget = path.join(destination, relativeTarget)
    if (!fs.existsSync(toTarget)) { omissions.push({ file: link.relative, reason: 'excluded-symlink-target' }); continue }
    const to = path.join(destination, link.relative)
    fs.symlinkSync(path.relative(path.dirname(to), toTarget), to)
    manifest.push({ file: link.relative, link: link.target })
  }
  return { manifest, omissions }
}

function safeFile(root, relative) {
  const absolute = path.resolve(root, relative)
  if (!isWithin(root, absolute)) throw new Error(`복사본 밖의 경로: ${relative}`)
  const real = fs.realpathSync(absolute)
  if (!isWithin(root, real) || !fs.statSync(real).isFile()) throw new Error(`복사본 밖을 가리키거나 파일이 아닌 경로: ${relative}`)
  return absolute
}

function assertTreeContained(root) {
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        if (!isWithin(root, fs.realpathSync(file))) throw new Error(`외부 링크가 복사본에 남았습니다: ${file}`)
      } else if (entry.isDirectory()) visit(file)
    }
  }
  visit(root)
}

export function declaredManuscripts(root) {
  const file = path.join(root, 'workbench/research.yaml')
  if (!fs.existsSync(file)) return []
  const raw = YAML.parse(fs.readFileSync(safeFile(root, 'workbench/research.yaml'), 'utf8')) ?? {}
  const value = raw.sources?.manuscript
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map((line) => ({
    declaration: line,
    file: typeof line === 'string' ? line.split(/\s+[—-]\s+/)[0].trim() : null,
  }))
}

function sourceChanges(source, manifest) {
  const changed = []
  for (const item of manifest) {
    try {
      const file = path.join(source, item.file)
      const st = fs.lstatSync(file)
      if (item.link !== undefined) { if (!st.isSymbolicLink() || fs.readlinkSync(file) !== item.link) changed.push(item.file) }
      else if (!st.isFile() || hashFile(file) !== item.hash) changed.push(item.file)
    } catch { changed.push(item.file) }
  }
  return changed
}

async function jsonRequest(app, url, method = 'GET', payload) {
  const response = await app.inject({ method, url, ...(payload !== undefined && { payload }) })
  if (response.statusCode !== 200) throw new Error(`${method} ${url}: HTTP ${response.statusCode} ${response.body.slice(0, 300)}`)
  return response.json()
}

async function allConcepts(app) {
  const rows = []
  let total = Infinity
  while (rows.length < total) {
    const page = await jsonRequest(app, `/api/concepts/list?filter=all&showEmpty=1&limit=500&offset=${rows.length}`)
    total = page.total
    if (!page.items.length && rows.length < total) throw new Error('개념노트 페이지가 끝나기 전에 비었습니다.')
    rows.push(...page.items)
  }
  return rows
}

/** Values that should survive closing the app and discarding its search database. */
async function snapshot(app, rid, libraryPresent) {
  const result = {}
  if (rid) {
    const base = `/api/researches/${enc(rid)}`
    const research = await jsonRequest(app, base)
    // File mtimes are not canonical state and change during no-op writes.
    result.research = { research: research.research, tree: research.tree, blocks: research.blocks.map(({ mtime, ...rest }) => rest), statements: research.statements.map(({ mtime, ...rest }) => rest) }
    result.manuscripts = await jsonRequest(app, `${base}/manuscripts`)
    result.topics = await jsonRequest(app, `${base}/topics`)
    const comments = await jsonRequest(app, `${base}/comments`)
    result.comments = { ...comments, contents: await Promise.all(comments.files.map(({ target }) => jsonRequest(app, `${base}/comments/${enc(target)}`))) }
  }
  if (libraryPresent) {
    const rows = await allConcepts(app)
    result.concepts = []
    // L2b 목록의 mtime도 저장·복원 때 바뀐다. 위 연구노트처럼 내용·관계만 비교한다.
    for (const { mtime, ...row } of rows) result.concepts.push({ row, note: await jsonRequest(app, `/api/concepts/${enc(row.id)}`), links: await jsonRequest(app, `/api/concepts/${enc(row.id)}/links`), memo: await jsonRequest(app, `/api/concepts/${enc(row.id)}/memo`) })
  }
  return result
}

async function checkEditable(app, copy, target) {
  const result = { kind: target.kind, file: target.file, noOp: {}, conflict: {} }
  let file, original
  try {
    file = safeFile(copy, target.file)
    original = fs.readFileSync(file)
    const read = await jsonRequest(app, target.url)
    const content = target.body ? read.body : read.content
    const payload = target.body ? { body: content, baseHash: read.hash } : { ...target.extra, content, baseHash: read.hash }
    const response = await app.inject({ method: 'PUT', url: target.putUrl ?? target.url, payload })
    const identical = fs.readFileSync(file).equals(original)
    const locked = target.body && read.meta.locked
    result.noOp = { status: locked && response.statusCode === 423 && identical ? 'locked' : response.statusCode === 200 && identical ? 'pass' : 'fail', http: response.statusCode, identical, before: sha(original), after: hashFile(file), ...(response.statusCode !== 200 && { message: response.body.slice(0, 250) }) }
    fs.writeFileSync(file, original)

    // The rejected draft remains in the caller; the API does not persist a second file.
    const current = await jsonRequest(app, target.url)
    const external = Buffer.concat([original, Buffer.from('\n% rw-safety external edit\n')])
    const draft = `${target.body ? current.body : current.content}\n% rw-safety unsaved draft\n`
    const conflictPayload = target.body ? { body: draft, baseHash: current.hash } : { ...target.extra, content: draft, baseHash: current.hash }
    const draftHash = sha(Buffer.from(draft))
    fs.writeFileSync(file, external)
    const conflict = await app.inject({ method: 'PUT', url: target.putUrl ?? target.url, payload: conflictPayload })
    const externalPreserved = fs.readFileSync(file).equals(external)
    const draftPreserved = sha(Buffer.from(target.body ? conflictPayload.body : conflictPayload.content)) === draftHash
    result.conflict = { status: conflict.statusCode === 409 && externalPreserved && draftPreserved ? 'pass' : 'fail', http: conflict.statusCode, externalPreserved, requestDraftPreserved: draftPreserved, browserRecovery: '미확인: API 검사만 수행', externalHash: sha(external), draftHash }
  } catch (error) {
    result.error = plainError(error)
    if (!result.noOp.status) result.noOp = { status: 'fail' }
    if (!result.conflict.status) result.conflict = { status: 'unverified' }
  } finally {
    if (file && original) {
      fs.writeFileSync(file, original)
      result.restored = fs.readFileSync(file).equals(original)
    }
  }
  return result
}

function executable(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const file = path.join(dir, name)
    try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return fs.realpathSync(file) } catch {}
  }
  return null
}

export function sandboxProfile(temporary) {
  const protectedConfig = path.join(os.homedir(), '.config/research-workspace')
  return `(version 1)\n(allow default)\n(deny network*)\n(deny file-write*)\n(allow file-write* (subpath ${JSON.stringify(temporary)}) (literal "/dev/null"))\n(deny file-read* (subpath ${JSON.stringify(protectedConfig)}))\n`
}

/** Enforce the write boundary at the OS level; never rely on TeX flags alone. */
export function compileStandalone(copy, temporary, declaration, { noCompile = false, timeout = 180_000 } = {}) {
  const result = { file: declaration.file, status: 'unverified' }
  if (!declaration.file) return { ...result, status: 'fail', reason: '원고 선언이 문자열이 아닙니다.' }
  let file, content
  try { file = safeFile(copy, declaration.file); content = fs.readFileSync(file, 'utf8') } catch (e) { return { ...result, reason: plainError(e) } }
  if (!/\.tex$/i.test(file) || !/^[^%\n]*\\documentclass/m.test(content)) return { ...result, status: 'not-applicable', reason: '독립 LaTeX 원고가 아닌 Markdown 또는 본문 조각입니다.' }
  if (noCompile) return { ...result, reason: '--no-compile로 컴파일을 생략했습니다.' }
  const latexmk = executable('latexmk')
  if (!latexmk) return { ...result, reason: 'latexmk가 없어 미확인입니다.' }
  const sandbox = process.platform === 'darwin' ? executable('sandbox-exec') : null
  if (!sandbox) return { ...result, reason: '복사본 밖 쓰기를 막는 OS 격리를 사용할 수 없어 컴파일하지 않았습니다.' }
  const engine = /%\s*!TeX\s+program\s*=\s*(xelatex|lualatex|pdflatex)\b/i.exec(content.slice(0, 500))?.[1]?.toLowerCase() ?? 'xelatex'
  if (!executable(engine)) return { ...result, reason: `${engine}가 없어 미확인입니다.` }
  const build = path.join(temporary, 'latex', sha(Buffer.from(declaration.file)).slice(0, 12))
  const cache = path.join(temporary, 'tex-cache')
  for (const dir of [build, cache, path.join(temporary, 'process-tmp')]) fs.mkdirSync(dir, { recursive: true })
  const args = ['-p', sandboxProfile(temporary), latexmk, '-norc', `-${engine}`, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', `-outdir=${build}`, path.basename(file)]
  const env = { ...process.env, TEXMFVAR: cache, TEXMFCONFIG: cache, TEXMFCACHE: cache, XDG_CACHE_HOME: cache, TMPDIR: path.join(temporary, 'process-tmp'), TEXMFOUTPUT: build, openout_any: 'p', max_print_line: '10000' }
  delete env.TEXINPUTS; delete env.BIBINPUTS; delete env.BSTINPUTS; delete env.LATEXMKRCSYS
  const run = spawnSync(sandbox, args, { cwd: path.dirname(file), env, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 })
  const log = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  const pdf = path.join(build, path.basename(file, '.tex') + '.pdf')
  const hasPdf = fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(-2048).includes(Buffer.from('%%EOF'))
  const sandboxDenied = /sandbox-exec:|sandbox_apply:|Operation not permitted/.test(log)
  return { ...result, status: run.status === 0 && hasPdf ? 'pass' : sandboxDenied ? 'unverified' : 'fail', engine, exitCode: run.status, hasPdf, reason: run.error?.message ?? (sandboxDenied ? 'OS 격리 제한으로 미확인입니다.' : run.status === 0 && hasPdf ? '앱 없이 독립 컴파일 완료' : '안전 제한 아래 독립 컴파일 실패'), logTail: log.split('\n').slice(-24).join('\n'), restrictions: '-norc, no-shell-escape, temporary caches, OS write boundary; repository rc files are not executed' }
}

export async function runRepositoryCheck(input, options = {}) {
  const source = fs.realpathSync(path.resolve(input))
  if (!fs.statSync(source).isDirectory()) throw new Error('저장소 폴더 경로가 필요합니다.')
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rw-safety-'))
  if (isWithin(source, temporary)) { fs.rmSync(temporary, { recursive: true, force: true }); throw new Error('임시 폴더를 포함하는 경로 전체는 검사할 수 없습니다. 연구 저장소 하나를 지정하세요.') }
  const copy = path.join(temporary, 'repository')
  const config = path.join(temporary, 'config')
  const report = { source, startedAt: new Date().toISOString(), status: 'unverified', scope: '현재 작업 파일의 독립 복사본 · API 검사 · 브라우저 복구는 미확인', targets: [], declarations: [], compilation: [], index: {}, warnings: [], isolation: { temporaryConfig: true, watch: false, serverListening: false, realConfigRead: false }, sourceIntegrity: {} }
  const beforeStatus = gitStatus(source)
  let copied, app
  try {
    copied = copyWorkingTree(source, copy)
    report.copy = { files: copied.manifest.length, bytes: copied.manifest.reduce((n, x) => n + (x.size ?? 0), 0), omissions: copied.omissions }
    assertTreeContained(copy)
    if (copied.omissions.some((x) => x.reason !== 'excluded-cache-or-git')) report.warnings.push('외부·깨진 링크 또는 특수 파일을 제외했습니다. 해당 경로는 미확인입니다.')
    const hasWorkbench = fs.existsSync(path.join(copy, 'workbench'))
    const libraryPresent = fs.existsSync(path.join(copy, 'concepts')) || fs.existsSync(path.join(copy, 'papers'))
    const emptyLibrary = path.join(temporary, 'empty-library')
    const study = path.join(temporary, 'empty-study')
    const reviews = path.join(temporary, 'empty-reviews')
    for (const dir of [config, emptyLibrary, study, reviews]) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(config, 'config.yaml'), YAML.stringify({ researches: [], library: libraryPresent ? copy : emptyLibrary, study, reviews }))
    const { buildApp } = await loadApp()
    const createApp = () => buildApp({ configDir: config, watch: false, fetch: async () => { throw new Error('Safety check forbids network requests') }, ask: async () => { throw new Error('Safety check forbids agent execution') } })
    app = createApp()
    let rid
    if (hasWorkbench) rid = (await jsonRequest(app, '/api/researches', 'POST', { path: copy })).id
    report.project = rid ? 'existing-workbench' : 'not-applicable: workbench 없음; 만들지 않음'
    const targets = []
    const declarations = declaredManuscripts(copy)
    if (rid) {
      const base = `/api/researches/${enc(rid)}`
      const manuscripts = await jsonRequest(app, `${base}/manuscripts`)
      for (const declaration of declarations) {
        let valid = true, reason
        try { if (!declaration.file) throw new Error('문자열 선언이 아닙니다.'); safeFile(copy, declaration.file) } catch (e) { valid = false; reason = plainError(e) }
        const visible = valid && manuscripts.some((m) => m.main === declaration.file)
        report.declarations.push({ ...declaration, status: visible ? 'pass' : 'fail', visible, ...(reason && { reason }) })
      }
      const seen = new Set()
      for (const manuscript of manuscripts) for (const file of [manuscript.main, ...manuscript.parts.map((part) => part.file)]) {
        if (seen.has(file)) continue
        seen.add(file)
        targets.push({ kind: file.endsWith('.md') ? 'research-note-md' : 'manuscript-tex', file, url: `${base}/manuscript/part?file=${enc(file)}`, putUrl: `${base}/manuscript/part`, extra: { file } })
      }
      const project = await jsonRequest(app, base)
      for (const block of project.blocks) targets.push({ kind: `block-${block.format}`, file: `workbench/blocks/${block.id}.${block.format}`, url: `${base}/blocks/${enc(block.id)}` })
    }
    if (libraryPresent) {
      const library = await jsonRequest(app, '/api/library')
      for (const note of library.notes) targets.push(note.format === 'md'
        ? { kind: 'concept-md', file: `concepts/${note.id}.md`, url: `/api/concepts/${enc(note.id)}`, body: true }
        : { kind: `${note.kind}-tex`, file: `${note.kind === 'concept' ? 'concepts' : 'papers'}/${note.id}.tex`, url: `/api/library/notes/${note.kind}/${enc(note.id)}` })
    }
    const before = await snapshot(app, rid, libraryPresent)
    for (const target of targets) report.targets.push(await checkEditable(app, copy, target))
    const afterWrites = await snapshot(app, rid, libraryPresent)
    let preservedAfterWrites = true
    try { assert.deepStrictEqual(afterWrites, before) } catch { preservedAfterWrites = false }
    const changedCopyFiles = sourceChanges(copy, copied.manifest.filter((item) => item.hash))
    report.copyRestoration = { status: changedCopyFiles.length === 0 ? 'pass' : 'fail', changedFiles: changedCopyFiles }
    const indexDir = path.join(config, 'index')
    const diskBefore = fs.existsSync(indexDir) ? fs.readdirSync(indexDir).filter((f) => f.endsWith('.sqlite')) : []
    await app.close(); app = null
    fs.rmSync(indexDir, { recursive: true, force: true })
    app = createApp()
    const after = await snapshot(app, rid, libraryPresent)
    const diskAfter = fs.existsSync(indexDir) ? fs.readdirSync(indexDir).filter((f) => f.endsWith('.sqlite')) : []
    let identical = true
    try { assert.deepStrictEqual(after, before) } catch { identical = false }
    report.index = { status: identical && preservedAfterWrites && (!libraryPresent || diskBefore.length > 0 && diskAfter.length > 0) ? 'pass' : 'fail', identical, preservedAfterWrites, baseline: '등록 직후 저장 검사 전', projectStorage: '별도 디스크 색인 없음: 파일에서 상태·관계·카드 연결·코멘트 다시 읽기', conceptIndex: libraryPresent ? 'SQLite 삭제 후 재생성' : '해당 없음: 이 저장소에 개념 라이브러리 없음', diskBefore, diskAfter, concepts: before.concepts?.length ?? 0, commentFiles: before.comments?.files.length ?? 0, topics: before.topics?.topics.length ?? 0 }
    await app.close(); app = null
    const compilationTargets = [...declarations]
    for (const file of options.manuscripts ?? []) if (!compilationTargets.some((d) => d.file === file)) compilationTargets.push({ file, selection: 'explicit' })
    for (const declaration of compilationTargets) report.compilation.push({ ...compileStandalone(copy, temporary, declaration, options), ...(declaration.selection && { selection: declaration.selection }) })
    if (!report.compilation.length) report.compilation.push({ status: 'not-applicable', reason: '설정에 선언된 독립 원고가 없습니다.' })
    if (!targets.length) report.warnings.push('앱에서 읽을 수 있는 편집 대상이 없어 저장 검사는 해당 없음입니다.')
  } catch (error) { report.error = plainError(error) }
  finally {
    if (app) { try { await app.close() } catch (e) { report.closeError = plainError(e) } }
    const afterStatus = gitStatus(source)
    const changed = copied ? sourceChanges(source, copied.manifest) : []
    const sameFiles = !!copied && changed.length === 0
    const sameGit = beforeStatus.available && afterStatus.available && beforeStatus.text === afterStatus.text
    report.sourceIntegrity = { status: !sameFiles || beforeStatus.available && afterStatus.available && !sameGit ? 'fail' : sameGit ? 'pass' : 'unverified', filesStatus: sameFiles ? 'pass' : 'fail', gitBefore: beforeStatus, gitAfter: afterStatus, changedFiles: changed, hashedFiles: copied?.manifest.filter((x) => x.hash).length ?? 0 }
    const failed = !!report.error || !!report.closeError || report.copyRestoration?.status === 'fail' || report.sourceIntegrity.status === 'fail' || report.index.status === 'fail' || report.declarations.some((d) => d.status === 'fail') || report.targets.some((t) => t.noOp.status === 'fail' || t.conflict.status === 'fail' || t.restored === false) || report.compilation.some((c) => c.status === 'fail')
    const unknown = report.sourceIntegrity.status === 'unverified' || report.compilation.some((c) => c.status === 'unverified') || report.targets.some((t) => t.conflict.status === 'unverified') || report.warnings.length > 0
    report.status = failed ? 'fail' : unknown ? 'unverified' : 'pass'
    report.finishedAt = new Date().toISOString()
    if (options.keepTemp) report.temporary = temporary
    else fs.rmSync(temporary, { recursive: true, force: true })
  }
  return report
}

function humanReport(reports) {
  const label = { pass: '통과', fail: '실패', unverified: '미확인', locked: '잠금: 저장 거부·바이트 보존', 'not-applicable': '해당 없음' }
  for (const r of reports) {
    console.log(`\n${r.source} — ${label[r.status]}`)
    console.log('| 대상 | 무수정 바이트 | 오래된 해시 거절 |')
    console.log('| --- | --- | --- |')
    for (const t of r.targets) console.log(`| ${t.file.replace(/\|/g, '\\|')} | ${label[t.noOp.status]} | ${label[t.conflict.status]} |`)
    console.log(`색인·재읽기: ${label[r.index.status] ?? '미확인'} / 원본 보존: ${label[r.sourceIntegrity.status]}`)
    for (const c of r.compilation) console.log(`컴파일 ${c.file ?? ''}: ${label[c.status]} — ${c.reason}`)
    for (const d of r.declarations.filter((d) => !d.visible)) console.log(`API에 보이지 않는 원고: ${d.file ?? String(d.declaration)} — ${d.reason ?? '앱 목록에서 누락'}`)
    for (const w of r.warnings) console.log(`주의: ${w}`)
    if (r.error) console.log(`오류: ${r.error}`)
    console.log('409 검사는 외부 파일과 요청 초안의 보존만 확인합니다. 브라우저 재시작·복구는 미확인입니다.')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const paths = args.filter((x) => !x.startsWith('--'))
  const flags = new Set(args.filter((x) => x.startsWith('--')))
  if (!paths.length || flags.has('--help')) {
    console.log('사용법: pnpm safety:check [--json] [--no-compile] [--keep-temp] [--manuscript=상대/경로.tex] /절대/저장소/경로 [...]\n--manuscript: 앱에 등록하지 않은 원고도 독립 컴파일 (저장소 하나일 때만, 반복 가능).\n--json: 상세 JSON을 표 대신 출력. 실패=종료 1, 미확인=종료 2, 통과=종료 0.\n현재 작업 파일을 임시 복사하며, 원본과 실사용 설정에는 쓰지 않습니다.')
    process.exitCode = paths.length || flags.has('--help') ? 0 : 1
  } else {
    const manuscripts = [...flags].filter((x) => x.startsWith('--manuscript=')).map((x) => x.slice('--manuscript='.length))
    if (manuscripts.length && (paths.length !== 1 || manuscripts.some((x) => !x || path.isAbsolute(x)))) throw new Error('--manuscript는 저장소 하나와 저장소 안 상대 경로를 지정해야 합니다.')
    const unknownFlags = [...flags].filter((x) => !['--json', '--no-compile', '--keep-temp'].includes(x) && !x.startsWith('--manuscript='))
    if (unknownFlags.length) throw new Error(`알 수 없는 옵션: ${unknownFlags.join(', ')}`)
    const reports = []
    for (const input of paths) {
      try { reports.push(await runRepositoryCheck(input, { noCompile: flags.has('--no-compile'), keepTemp: flags.has('--keep-temp'), manuscripts })) }
      catch (error) { reports.push({ source: input, status: 'fail', error: plainError(error), targets: [], index: {}, sourceIntegrity: {}, declarations: [], compilation: [], warnings: [] }) }
    }
    if (flags.has('--json')) console.log(JSON.stringify({ version: 1, reports }, null, 2))
    else humanReport(reports)
    process.exitCode = reports.some((r) => r.status === 'fail') ? 1 : reports.some((r) => r.status === 'unverified') ? 2 : 0
  }
}
