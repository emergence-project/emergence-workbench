import { LIBRARY_SCOPE, type FigureBrief, type FigureKind, type FigureList, type FigureRow, type FigureUse } from '@rw/core/contract/figures'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { acceptedSubjects, readSubjects, readYamlHash } from './subjects.js'
import { parseCardFigureRef } from '@rw/core'
import { fileCache } from './readCache.js'
import { projectStamp } from './projectReadCache.js'
import type { Workbench } from './workbench.js'
import { listNotes } from './noteList.js'
import type { Registry } from './registry.js'
import { writeAtomic } from './fsutil.js'
import { WorkbenchError } from './workbench.js'
import { t as tl } from './i18n.js'

/**
 * 그림 라이브러리 (형식: docs/repo-format.md §8).
 * - 공용: research-library/figures/, 한 프로젝트 전용: <저장소>/workbench/figures/ (topics/ 같은 하위 폴더는 보지 않는다).
 * - 원본은 tikz(.tikz · .tex) · svg · png · jpg · pdf. 이름과 설명은 같은 폴더의 figures.yaml에 파일 이름별로 적는다:
 *     enclosed-country.tex: { name: 고리 지도 (원판), description: 원판 B와 그 바깥 고리 C }
 *   적지 않으면 이름은 파일 이름(확장자 뺌)이다.
 * - 노트에는 ![[이름]]으로 넣는다. 이름 · 파일 이름 · 확장자 뺀 파일 이름 어느 것으로 적어도 찾는다. 같은 이름이면 그 프로젝트 전용 그림이 먼저다.
 * - tikz는 맥의 latex + dvisvgm으로 SVG를 만들어 앱 설정 폴더(figure-cache/)에 둔다. 지워도 다시 만드는 캐시다.
 */

export const FIGURES_DIR = 'figures'
export const FIGURES_META = 'figures.yaml'
export { LIBRARY_SCOPE } from '@rw/core/contract/figures'
const KINDS = { '.tikz': 'tikz', '.tex': 'tikz', '.svg': 'svg', '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.pdf': 'pdf' } as const

// 응답 모양은 API 계약(@rw/core/contract/figures)에 있다
export type { FigureKind, FigureUse, FigureRow, FigureList, FigureBrief } from '@rw/core/contract/figures'
/** 그림 원본 하나 (분류 · 쓰는 노트를 읽기 전) */
export type FigureSource = Omit<FigureRow, 'uses' | 'subjects' | 'subjectsHash'>

/** skip: 그림으로 보이지 않을 파일 (프로젝트 카드 그림, 저장소 기준) */
interface Folder { scope: string; dir: string; repo: string; skip?: string }

const kindOf = (file: string): FigureKind | undefined => KINDS[path.extname(file).toLowerCase() as keyof typeof KINDS]
const stemOf = (file: string) => file.slice(0, file.length - path.extname(file).length)
/** 파일 이름: 글자 · 숫자 · 한글 · 공백 · ._-()만, 점으로 시작하지 않게 */
const SAFE_FILE = /^(?!\.)[\p{L}\p{N} ._()-]{1,120}$/u

function folders(registry: Registry): Folder[] {
  const out: Folder[] = []
  const lib = registry.libraryPath
  if (lib) out.push({ scope: LIBRARY_SCOPE, dir: path.join(lib, FIGURES_DIR), repo: lib })
  for (const r of registry.list()) {
    if (!r.available) continue
    try {
      const wb = registry.get(r.id)
      // 프로젝트 카드 그림(research.yaml image:)은 노트 그림이 아니라서 뺀다
      let skip: string | undefined
      try { skip = wb.readResearch().image } catch { /* 없음 */ }
      out.push({ scope: r.id, dir: wb.figuresDir, repo: wb.repo, ...(skip && { skip }) })
    } catch { /* 읽지 못하는 프로젝트는 건너뜀 */ }
  }
  return out
}

type FigureMeta = Record<string, { name?: string; description?: string; subjects?: unknown }>

/** figures.yaml (보여 주기용: 못 읽는 파일·항목은 빈 것으로 본다. 고치기는 setFigureMeta가 따로 엄격히 읽는다) */
function readMeta(dir: string): FigureMeta {
  const f = path.join(dir, FIGURES_META)
  if (!fs.existsSync(f)) return {}
  try {
    if (!fs.realpathSync(f).startsWith(fs.realpathSync(dir) + path.sep)) return {}
    return cachedMeta(f)
  } catch { return {} }
}
const cachedMeta = fileCache((raw): FigureMeta => {
  const v = YAML.parse(raw) as unknown
  return v && typeof v === 'object' && !Array.isArray(v) ? v as FigureMeta : {}
})

/** 노트 본문의 ![[…]] 이름들 (|폭 뗌) */
export function embedNames(text: string, dir?: string): string[] {
  const embeds = [...text.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => m[1]!.trim())
  // 그림 문단 ![캡션](대상)도 노트 폴더에 그 파일이 없으면 라이브러리 그림이다 (figureEmbeds.ts와 같게)
  const targets = [...text.matchAll(/^!\[.*\]\(([^()\s]+)\)$/gm)].map((m) => m[1]!)
    .filter((t) => !dir || !fs.existsSync(path.resolve(dir, t)))
  return [...embeds, ...targets]
}

function figuresIn(f: Folder): FigureSource[] {
  if (!fs.existsSync(f.dir)) return []
  const meta = readMeta(f.dir)
  return fs.readdirSync(f.dir).flatMap((file) => {
    const kind = kindOf(file)
    if (!kind || file.startsWith('.')) return []
    const abs = path.join(f.dir, file)
    if (f.skip && path.relative(f.repo, abs) === path.normalize(f.skip)) return []
    // 끊긴 심볼릭 링크 등 읽지 못하는 파일은 건너뛴다 (하나 때문에 그림 화면 전체가 멈추지 않게)
    let st: fs.Stats
    try { st = fs.statSync(abs) } catch { return [] }
    if (!st.isFile()) return []
    const raw = meta[file]
    const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : stemOf(file)
    return [{
      id: `${f.scope}/${file}`, scope: f.scope, file, name, kind,
      ...(typeof m.description === 'string' && m.description.trim() && { description: m.description.trim() }),
      path: path.join(path.basename(f.repo), path.relative(f.repo, abs)), mtime: st.mtimeMs,
    }]
  })
}

/** 그림 이름이 ![[x]]의 x와 맞는지 */
const answersTo = (fig: Pick<FigureRow, 'name' | 'file'>, x: string) => x === fig.name || x === fig.file || x === stemOf(fig.file)

const cachedEmbeds = fileCache((text, file) => ({
  names: embedNames(text, path.dirname(file)),
  title: /^title:\s*(.+)$/m.exec(text.slice(0, 2000))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? path.basename(file, '.md'),
}))
const projectEmbeds = new WeakMap<Workbench, { stamp: string; notes: (FigureUse & { names: string[] })[] }>()

/** 바뀐 개념노트만 읽어서 ![[…]]를 갱신한다. 프로젝트는 프로젝트별 mtime 색인을 공유한다. */
function notesWithEmbeds(registry: Registry): (FigureUse & { names: string[] })[] {
  const out: (FigureUse & { names: string[] })[] = []
  for (const r of registry.list()) {
    if (!r.available) continue
    try {
      const wb = registry.get(r.id)
      const stamp = projectStamp(wb)
      let hit = projectEmbeds.get(wb)
      if (!hit || hit.stamp !== stamp) {
        const notes = listNotes(wb).filter((n) => n.format === 'md').flatMap((n) => {
          const { names } = cachedEmbeds(path.join(wb.repo, n.file))
          return names.length ? [{ rid: r.id, type: n.type, id: n.id, file: n.file, title: n.title, names }] : []
        })
        hit = { stamp, notes }; projectEmbeds.set(wb, hit)
      }
      out.push(...hit.notes)
    } catch { /* 읽지 못하는 연구 */ }
  }
  const concepts = registry.libraryPath && path.join(registry.libraryPath, 'concepts')
  if (concepts && fs.existsSync(concepts)) for (const f of fs.readdirSync(concepts)) {
    if (!f.endsWith('.md')) continue
    try {
      const { names, title } = cachedEmbeds(path.join(concepts, f))
      if (names.length) out.push({ type: 'concept', id: f.slice(0, -3), file: path.join('concepts', f), title, names })
    } catch { /* 삭제 중인 파일은 다음 갱신 때 */ }
  }
  return out
}

/** 이 노트(rid 프로젝트, 없으면 라이브러리)에서 ![[x]]가 가리키는 그림: 그 프로젝트 전용 먼저, 그다음 공용 */
export function resolveFigure<T extends Pick<FigureRow, 'scope' | 'name' | 'file'>>(figs: T[], x: string, rid?: string): T | undefined {
  return (rid ? figs.find((f) => f.scope === rid && answersTo(f, x)) : undefined) ?? figs.find((f) => f.scope === LIBRARY_SCOPE && answersTo(f, x))
}

/** 원본 목록만 읽는다 (내보내기·컴파일에서는 사용처 노트 전체를 읽을 필요가 없다). */
export function listFigureSources(registry: Registry, scopes?: readonly string[]): FigureSource[] {
  return folders(registry).filter((f) => !scopes || scopes.includes(f.scope)).flatMap(figuresIn)
}

export function listFigures(registry: Registry): FigureList {
  const dirs = new Map(folders(registry).map((f) => [f.scope, f.dir]))
  const tree = readSubjects(registry.libraryPath)
  const figs = listFigureSources(registry).map((f) => ({ ...f, subjects: acceptedSubjects(tree, readMeta(dirs.get(f.scope)!)[f.file]?.subjects), subjectsHash: readYamlHash(path.join(dirs.get(f.scope)!, FIGURES_META)) }))
  const uses = new Map<string, FigureUse[]>(figs.map((f) => [f.id, []]))
  // 이름 → 그림을 한 번만 만든다 (노트 수 × 그림 수 탐색을 피함). 먼저 나온 이름의 우선순위는 resolveFigure와 같다.
  const byScope = new Map<string, Map<string, string>>()
  for (const f of figs) {
    let names = byScope.get(f.scope)
    if (!names) { names = new Map(); byScope.set(f.scope, names) }
    for (const name of [f.name, f.file, stemOf(f.file)]) if (!names.has(name)) names.set(name, f.id)
  }
  for (const n of notesWithEmbeds(registry)) {
    const { names, ...use } = n
    const hit = new Set(names.map((x) => (n.rid ? byScope.get(n.rid)?.get(x) : undefined) ?? byScope.get(LIBRARY_SCOPE)?.get(x)).filter((x): x is string => !!x))
    for (const id of hit) uses.get(id)!.push(use)
  }
  const projects = registry.list().filter((r) => r.available).map((r) => ({ id: r.id, title: r.title }))
  const order = (s: string) => (s === LIBRARY_SCOPE ? 0 : 1)
  return {
    library: registry.libraryPath ?? null,
    projects,
    figures: figs.map((f) => ({ ...f, uses: uses.get(f.id)!, ...(f.kind === 'tikz' && tikzBroken(registry.configDir, path.join(dirs.get(f.scope) ?? '', f.file)) && { broken: true as const }) }))
      .sort((a, b) => order(a.scope) - order(b.scope) || a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name)),
  }
}

/** id(<scope>/<파일>)의 실제 파일. 폴더 밖이나 없는 파일은 거절 */
export function figureFile(registry: Registry, id: unknown): { abs: string; folder: Folder; file: string; kind: FigureKind } {
  if (typeof id !== 'string') throw new WorkbenchError(400, tl('id가 필요함', 'id is required'))
  const i = id.indexOf('/')
  const scope = id.slice(0, i), file = id.slice(i + 1)
  const folder = folders(registry).find((f) => f.scope === scope)
  const kind = kindOf(file)
  if (i < 1 || !folder || !kind || !SAFE_FILE.test(file)) throw new WorkbenchError(404, tl(`없는 그림: ${id}`, `No such figure: ${id}`))
  const abs = path.join(folder.dir, file)
  if (!fs.existsSync(abs)) throw new WorkbenchError(404, tl(`없는 그림: ${id}`, `No such figure: ${id}`))
  return { abs, folder, file, kind }
}

/** 카드에는 이 프로젝트와 공용 그림만 건다. 예전 경로는 각 카드의 기존 검사로 넘긴다. */
export function cardFigureRef(registry: Registry, rid: string, value: unknown) {
  if (typeof value !== 'string' || !value.trim().startsWith('figure:')) return null
  const ref = parseCardFigureRef(value.trim())
  if (!ref) throw new WorkbenchError(400, tl('그림 라이브러리 참조가 올바르지 않습니다', 'Invalid figure library reference'))
  if (ref.scope !== rid && ref.scope !== LIBRARY_SCOPE) throw new WorkbenchError(400, tl('이 프로젝트 또는 공용 그림을 골라 주세요', 'Choose a figure from this project or the shared library'))
  const { abs, folder } = figureFile(registry, ref.id)
  const root = fs.realpathSync(folder.dir)
  const real = fs.realpathSync(abs)
  if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) throw new WorkbenchError(403, tl('그림 폴더 밖의 파일입니다', 'The file is outside the figure folder'))
  return ref
}

/** 새 그림 (끌어다 놓은 파일). 같은 이름(대소문자만 다른 것도)이 있으면 거절 */
export function addFigure(registry: Registry, scope: unknown, name: unknown, body: Buffer): { id: string } {
  const folder = folders(registry).find((f) => f.scope === scope)
  if (!folder) throw new WorkbenchError(400, tl(`둘 곳이 없음: ${String(scope)}`, `No place to store it: ${String(scope)}`))
  const file = typeof name === 'string' ? path.basename(name.trim()) : ''
  if (!SAFE_FILE.test(file) || !kindOf(file)) throw new WorkbenchError(400, tl('그림은 tikz(.tikz · .tex) · svg · png · jpg · pdf 파일이어야 합니다', 'A figure must be a tikz (.tikz · .tex) · svg · png · jpg · pdf file'))
  if (!body?.length) throw new WorkbenchError(400, tl('빈 파일', 'Empty file'))
  fs.mkdirSync(folder.dir, { recursive: true })
  const clash = fs.readdirSync(folder.dir).find((f) => f.toLowerCase() === file.toLowerCase())
  if (clash) throw new WorkbenchError(409, tl(`이미 있는 그림: ${clash}`, `Figure already exists: ${clash}`))
  writeAtomic(path.join(folder.dir, file), body)
  return { id: `${folder.scope}/${file}` }
}

/** 이름과 설명 (figures.yaml). 빈 글은 지운다 */
export function setFigureMeta(registry: Registry, id: unknown, patch: { name?: unknown; description?: unknown }): void {
  const { folder, file } = figureFile(registry, id)
  const f = path.join(folder.dir, FIGURES_META)
  // 다른 그림의 항목·주석은 그대로 두고 이 그림의 항목만 고친다
  const doc = fs.existsSync(f) ? YAML.parseDocument(fs.readFileSync(f, 'utf8')) : new YAML.Document({})
  if (doc.errors.length) throw new WorkbenchError(422, tl(`${FIGURES_META}을 읽을 수 없어 고치지 않았습니다. 파일의 YAML을 먼저 고쳐 주세요`, `Could not read ${FIGURES_META}, so nothing was changed. Fix the YAML in the file first`))
  if (doc.contents != null && !YAML.isMap(doc.contents)) {
    throw new WorkbenchError(422, tl(`${FIGURES_META}이 '파일 이름: {name, description}' 꼴이 아니어서 고치지 않았습니다`, `${FIGURES_META} is not in the form 'file name: {name, description}', so nothing was changed`))
  }
  const prev = doc.get(file, true)
  // 'a.svg:'처럼 값이 빈 항목은 없는 것으로 본다
  if (YAML.isScalar(prev) && prev.value == null) doc.delete(file)
  else if (prev != null && !YAML.isMap(prev)) {
    throw new WorkbenchError(422, tl(`${FIGURES_META}의 ${file} 항목이 {name, description} 꼴이 아니어서 고치지 않았습니다`, `The ${file} entry in ${FIGURES_META} is not in the form {name, description}, so nothing was changed`))
  }
  for (const k of ['name', 'description'] as const) {
    const v = patch[k]
    if (v === undefined) continue
    if (typeof v !== 'string') throw new WorkbenchError(400, tl(`${k}는 글이어야 합니다`, `${k} must be text`))
    const t = k === 'name' ? v.replace(/\s+/g, ' ').trim() : v.trim()
    if (k === 'name' && /[[\]|#]/.test(t)) throw new WorkbenchError(400, tl('이름에 [ ] | #는 쓸 수 없습니다 (노트의 ![[이름]]과 부딪힘)', 'Names cannot contain [ ] | # (they clash with ![[name]] in notes)'))
    if (t && !(k === 'name' && t === stemOf(file))) doc.setIn([file, k], t)
    else if (doc.hasIn([file, k])) doc.deleteIn([file, k])
  }
  const entry = doc.get(file)
  if (YAML.isMap(entry) && !entry.items.length) doc.delete(file)
  const empty = doc.contents == null || (YAML.isMap(doc.contents) && !doc.contents.items.length)
  if (empty && !doc.commentBefore && !doc.comment) { if (fs.existsSync(f)) fs.rmSync(f); return }
  writeAtomic(f, String(doc))
}

// ---------- tikz → SVG ----------

export const TIKZ_LIBS = 'arrows.meta,calc,decorations.pathmorphing,decorations.markings,patterns,positioning,shapes.geometric'
/** tikz 원본을 그대로 컴파일되는 문서로: \documentclass가 있으면 그대로, tikzpicture가 없으면 감싼다 */
export function tikzDocument(src: string): string {
  if (/\\documentclass/.test(src)) return src
  const body = /\\begin\{tikzpicture\}/.test(src) ? src : `\\begin{tikzpicture}\n${src}\n\\end{tikzpicture}`
  return ['\\documentclass[tikz,border=2pt]{standalone}', '\\usepackage{amsmath,amssymb}', `\\usetikzlibrary{${TIKZ_LIBS}}`, '\\begin{document}', body, '\\end{document}', ''].join('\n')
}

type Runner = (cmd: string, args: string[], cwd: string) => Promise<void>
const execRun: Runner = (cmd, args, cwd) => new Promise((resolve, reject) =>
  execFile(cmd, args, { cwd, timeout: 60_000 }, (e) => (e ? reject(e) : resolve())))
let runner: Runner = execRun
/** 테스트가 latex · dvisvgm 대신 쓴다 */
export function useTikzRunner(r: Runner | null): void { runner = r ?? execRun }

const making = new Map<string, Promise<string>>()
/** 그림 첫 화면이 tikz 여러 개를 한꺼번에 부르면 latex가 한꺼번에 뜬다. 동시에 둘까지만 */
const TIKZ_AT_ONCE = 2
let tikzRunning = 0
const tikzWaiting: (() => void)[] = []
async function withTikzSlot<T>(work: () => Promise<T>): Promise<T> {
  if (tikzRunning >= TIKZ_AT_ONCE) await new Promise<void>((go) => tikzWaiting.push(go))
  tikzRunning++
  try { return await work() } finally { tikzRunning--; tikzWaiting.shift()?.() }
}
/** tikz 그림의 SVG (캐시: <설정 폴더>/figure-cache/<내용 해시>.svg). 만들지 못하면 422와 로그 끝 */
const tikzHash = fileCache((raw) => crypto.createHash('sha1').update(tikzDocument(raw)).digest('hex').slice(0, 20))
export function tikzCachePath(configDir: string, abs: string): string {
  return path.join(configDir, 'figure-cache', `${tikzHash(abs)}.svg`)
}

/** 바꾸다 실패한 tikz는 캐시 옆에 <해시>.err를 남긴다 (원본을 고치면 해시가 바뀌어 다시 시도한다) */
const failMark = (cache: string) => cache.replace(/\.svg$/, '.err')
export function tikzBroken(configDir: string, abs: string): boolean {
  try {
    const cache = tikzCachePath(configDir, abs)
    return fs.existsSync(failMark(cache)) && !fs.existsSync(cache)
  } catch { return false }
}

export function tikzSvg(configDir: string, abs: string): Promise<string> {
  const doc = tikzDocument(fs.readFileSync(abs, 'utf8'))
  const cache = tikzCachePath(configDir, abs)
  const hash = path.basename(cache, '.svg')
  if (fs.existsSync(cache)) return Promise.resolve(cache)
  const running = making.get(hash)
  if (running) return running
  const p = (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rw-fig-'))
    try {
      fs.writeFileSync(path.join(dir, 'fig.tex'), doc)
      try {
        await withTikzSlot(async () => {
          await runner('latex', ['-interaction=nonstopmode', '-halt-on-error', 'fig.tex'], dir)
          await runner('dvisvgm', ['--no-fonts', '--exact-bbox', '-o', 'fig.svg', 'fig.dvi'], dir)
        })
      } catch (e) {
        const log = fs.existsSync(path.join(dir, 'fig.log')) ? fs.readFileSync(path.join(dir, 'fig.log'), 'utf8') : String((e as Error).message)
        const err = /^! .*$/m.exec(log)?.[0] ?? ((e as NodeJS.ErrnoException).code === 'ENOENT' ? tl('TeX(latex · dvisvgm)가 없음', 'TeX (latex · dvisvgm) is not installed') : log.split('\n').slice(-6).join('\n'))
        try { writeAtomic(failMark(cache), err) } catch { /* 표시만 못 남김 */ }
        throw new WorkbenchError(422, tl(`tikz 그림을 그리지 못했습니다: ${err}`, `Could not draw the tikz figure: ${err}`))
      }
      fs.rmSync(failMark(cache), { force: true })
      // 같은 때 온 요청이 반쯤 쓴 SVG를 읽지 않게 한 번에 바꿔 넣는다
      writeAtomic(cache, fs.readFileSync(path.join(dir, 'fig.svg')))
      return cache
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      making.delete(hash)
    }
  })()
  making.set(hash, p)
  return p
}

// ---------- 그림 첫 화면 (라이브러리 L2, requirements §8.1 "라이브러리 첫 화면") ----------


/** 화면의 거르기와 같은 조건으로 센다 (FiguresPage.tsx FILTERS) */
export function figureBrief(list: FigureList, recent = 8): FigureBrief {
  const f = list.figures
  const count = (t: (x: FigureRow) => boolean) => f.filter(t).length
  const own = f.filter((x) => x.scope !== LIBRARY_SCOPE)
  return {
    total: f.length,
    projects: list.projects,
    recent: [...f].sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name)).slice(0, recent),
    check: { broken: count((x) => !!x.broken) },
    stats: {
      tikz: count((x) => x.kind === 'tikz'), svg: count((x) => x.kind === 'svg'),
      photo: count((x) => x.kind === 'png' || x.kind === 'jpg'), pdf: count((x) => x.kind === 'pdf'),
      unused: count((x) => x.uses.length === 0),
      ...(readSubjects(list.library ?? undefined).enabled && { unclassified: count((x) => !x.subjects?.length) }),
    },
    store: { library: f.length - own.length, projects: new Set(own.map((x) => x.scope)).size, inProjects: own.length },
  }
}
