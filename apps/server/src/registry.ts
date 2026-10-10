import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_TEMPLATES, DEFAULT_TEMPLATE_ID, newTemplateId, normalizeAuthors, normalizePeople, normalizeTemplate, normalizeTemplates, normalizeUi, type Author, type LatexTemplate, type Person, type UiSettings } from '@rw/core'
import YAML from 'yaml'
import { isLatexSafePath, writeAtomic } from './fsutil.js'
import { describeTex, findRepoPreambles, listLibraryPreambles, type TexDefinitions } from './library.js'
import type { Engine } from './latex.js'
import { Workbench, WorkbenchError } from './workbench.js'
import { t as tl } from './i18n.js'
import { PROJECT_COLORS, type ProjectColor, type ProjectKind, type ProjectState, type ResearchListItem } from '@rw/core/contract/research'

/**
 * 이 컴퓨터에만 있는 앱 설정 (~/.config/research-workspace/config.yaml).
 * 연구 저장소 경로는 기기마다 다르므로 git 저장소가 아니라 여기에 둔다.
 */
/** load()가 읽어 AppConfig로 옮기는 키. latex는 예전 서식 하나(latexTemplates로 옮김). 이 밖의 키는 저장할 때 그대로 둔다 */
const CONFIG_KEYS = new Set(['engine', 'library', 'study', 'reviews', 'pdfFolders', 'personalRepo', 'researches', 'ui', 'latexTemplates', 'latexDefault', 'latexBuiltins', 'authors', 'people', 'latex'])

export interface AppConfig {
  engine: Engine
  /** 공유 라이브러리(research-library) 폴더. 없으면 라이브러리 서식을 쓰지 않는다 */
  library?: string
  /** Obsidian vault 폴더 (읽기만, 지식 화면). 없으면 보이지 않는다 */
  study?: string
  /** Topic Review 폴더 (읽기만, 지식 화면). 없으면 보이지 않는다 */
  reviews?: string
  /** 논문 PDF 폴더 (여러 개, iCloud·Google Drive 폴더 가능). 논문 라이브러리가 <bib 키>.pdf를 여기서 찾는다 */
  pdfFolders?: string[]
  /** 개인 저장소 주소 (personalRepo.ts가 이 파일에서 바로 읽는다). 저장할 때 잃지 않도록 함께 둔다 */
  personalRepo?: string
  researches: RegisteredResearch[]
  /** 설정 화면의 화면 설정 (테마, 글자 크기, 편집기 글꼴 등) */
  ui: UiSettings
  /** LaTeX 서식 모음 (article·PRL·beamer …). 서식마다 문서 종류 줄, 공통 줄, 패키지 */
  latexTemplates: LatexTemplate[]
  /** 내보낼 때 쓰는 서식의 id */
  latexDefault: string
  /** 이 설정이 이미 본 기본 서식 id. 새 기본 서식(예: PRB)을 예전 설정에 한 번만 더하는 데 쓴다 */
  latexBuiltins: string[]
  /** 저자와 소속. 내보낼 때 \author·\affiliation 줄로 넣는다 */
  authors: Author[]
  /** 네트워킹에 따로 더한 사람 (저자와 소속에 있는 사람은 저절로 들어간다) */
  people: Person[]
}

export interface Inspection {
  path: string
  exists: boolean
  isDirectory: boolean
  isGitRepo: boolean
  hasWorkbench: boolean
  /** 저장소 안에서 찾은, 함께 쓸 만한 서식 파일 (저장소 기준 경로) */
  repoPreambles: string[]
  /** 저장소 서식마다 그 안에서 정의하는 기호와 환경 */
  repoPreambleDetails: Record<string, TexDefinitions>
  alreadyRegistered: string | null
  suggestedTitle: string
  /** 등록은 되지만 알아 둘 점 */
  warnings: string[]
  /** 등록할 수 없는 이유 */
  errors: string[]
}

/**
 * 프로젝트 태그 이름 규칙 (예전 tags와 분야가 함께 쓴다). 연구 저장소의 파일이 아니라 이 컴퓨터의 설정에만 둔다.
 */
export const MAX_TAGS = 8
export const MAX_TAG_LENGTH = 20
export function normalizeTags(raw: unknown, maxLength = MAX_TAG_LENGTH): string[] | null {
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string') return null
    const tag = t.replace(/\s+/g, ' ').trim().replace(/^#/, '')
    if (!tag) continue
    if (tag.length > maxLength) return null
    if (!out.includes(tag)) out.push(tag)
  }
  return out.length > MAX_TAGS ? null : out
}

/**
 * 프로젝트 성격 · 분야 · 진행 상태 (10/5 시안 "프로젝트 성격 · 분야", 홈 거르기).
 * - 성격(kind): 연구 research · 업무 work 중 하나. 업무 프로젝트만 노트 성격 "설계"를 고른다.
 * - 분야(fields): 개념노트 분류에서 고른 이름 여러 개 (사람의 주 연구 분야와 같은 목록). 보이기만 하고 거르지 않는다.
 * - 진행 상태(state): 진행 active(기본) · 멈춤 paused · 완료 done.
 * - 띠에 보이기(rail: true): 왼쪽 띠는 진행 중인 프로젝트만 보이고, 이것을 켜면 멈춤 · 완료여도 보인다 (10/10 12:59).
 * 예전 설정은 그대로 읽는다: tags의 "업무"(또는 더 예전의 kind: work)는 성격 업무, 나머지 태그는 분야.
 * 앱에서 고칠 때만 새 키(kind · fields · state)로 쓰고 tags를 뺀다.
 */
export type { ProjectKind, ProjectState, ResearchListItem } from '@rw/core/contract/research'
export const PROJECT_KINDS: ProjectKind[] = ['research', 'work']
export const PROJECT_STATES: ProjectState[] = ['active', 'paused', 'done']
/** 예전 태그 하나로 섞어 쓰던 때 성격 업무를 뜻하던 태그 */
export const LEGACY_WORK_TAG = '업무'
/** 분야 이름은 개념노트 분류 이름이라 태그보다 길 수 있다 */
export const MAX_FIELD_LENGTH = 60

interface RegisteredResearch { id: string; path: string; kind?: unknown; fields?: string[]; state?: ProjectState; rail?: boolean; color?: string; tags?: string[] }

export interface ProjectProfile { kind: ProjectKind; fields: string[]; state: ProjectState; rail: boolean; color?: ProjectColor }

/** 설정 한 줄에서 성격 · 분야 · 진행 상태를 읽는다 (예전 tags · kind: work 포함) */
export function profileOf(r: RegisteredResearch): ProjectProfile {
  const tags = r.tags ?? []
  const fresh = Array.isArray(r.fields)
  const work = r.kind === 'work' || (!fresh && tags.includes(LEGACY_WORK_TAG))
  const fields = fresh ? r.fields! : tags.filter((t) => t !== LEGACY_WORK_TAG)
  return { kind: work ? 'work' : 'research', fields, state: PROJECT_STATES.includes(r.state as ProjectState) ? r.state! : 'active', rail: r.rail === true, ...(isColor(r.color) && { color: r.color }) }
}

const isColor = (v: unknown): v is ProjectColor => PROJECT_COLORS.includes(v as ProjectColor)

/** 예전 태그 하나 목록 모양 (구글 동기화 · 검색이 아직 쓴다): 업무면 "업무"를 앞에, 그 뒤에 분야 */
const legacyTags = (p: ProjectProfile) => [...(p.kind === 'work' ? [LEGACY_WORK_TAG] : []), ...p.fields.filter((f) => f !== LEGACY_WORK_TAG)]

const ENGINES: Engine[] = ['xelatex', 'lualatex', 'pdflatex']

/** 기본 서식 id: 있는 것만. 없으면 PRL, 그것도 없으면 첫 서식 */
function defaultOf(list: LatexTemplate[], id: unknown): string {
  if (typeof id === 'string' && list.some((t) => t.id === id)) return id
  return list.some((t) => t.id === DEFAULT_TEMPLATE_ID) ? DEFAULT_TEMPLATE_ID : (list[0] ?? BUILTIN_TEMPLATES[0]!).id
}

export class Registry {
  private readonly file: string
  private config: AppConfig
  private readonly workbenches = new Map<string, Workbench>()
  private readonly saveListeners: (() => void)[] = []

  constructor(readonly configDir: string) {
    this.file = path.join(configDir, 'config.yaml')
    this.config = this.load()
  }

  get engine(): Engine { return this.config.engine }

  /** 라이브러리 폴더. 설정에 없거나 폴더가 없거나 LaTeX 경로로 쓸 수 없으면 undefined */
  get libraryPath(): string | undefined {
    const p = this.config.library
    if (!p || !fs.existsSync(p)) return undefined
    const real = fs.realpathSync(p)
    return isLatexSafePath(real) ? real : undefined
  }

  setLibrary(p: string): void {
    if (!path.isAbsolute(p) || !fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new WorkbenchError(400, tl('라이브러리 폴더가 없습니다.', 'The library folder does not exist.'))
    if (!isLatexSafePath(fs.realpathSync(p))) throw new WorkbenchError(400, tl('라이브러리 경로에 공백이나 특수문자가 있어 쓸 수 없습니다.', 'The library path has spaces or special characters, so it cannot be used.'))
    this.config.library = fs.realpathSync(p)
    this.save()
  }

  /** Obsidian vault (읽기만). 설정(config.yaml `study:`)에 없거나 폴더가 없으면 undefined */
  get studyPath(): string | undefined {
    const p = this.config.study
    return p && fs.existsSync(p) ? p : undefined
  }

  /** Topic Review 폴더 (읽기만). 설정(config.yaml `reviews:`)에 없거나 폴더가 없으면 undefined */
  get reviewsPath(): string | undefined {
    const p = this.config.reviews
    return p && fs.existsSync(p) ? p : undefined
  }

  setReviews(p: string): void {
    if (!path.isAbsolute(p) || !fs.existsSync(p)) throw new WorkbenchError(400, tl('Topic Review 폴더가 없습니다.', 'The Topic Review folder does not exist.'))
    this.config.reviews = p
    this.save()
  }

  /** 논문 PDF 폴더 중 지금 있는 것 */
  get pdfFolders(): string[] { return (this.config.pdfFolders ?? []).filter((p) => fs.existsSync(p)) }
  /** 설정에 적힌 PDF 폴더 전부 (없어진 폴더도: 설정 화면에서 "찾을 수 없음"으로 보인다) */
  get pdfFoldersSet(): string[] { return this.config.pdfFolders ?? [] }

  setPdfFolders(list: unknown): string[] {
    if (!Array.isArray(list) || list.some((p) => typeof p !== 'string')) throw new WorkbenchError(400, tl('PDF 폴더 목록이 아닙니다.', 'Not a list of PDF folders.'))
    const out: string[] = []
    for (const raw of list as string[]) {
      const p = raw.trim()
      if (!p) continue
      if (!path.isAbsolute(p)) throw new WorkbenchError(400, tl(`절대 경로가 아닙니다: ${p}`, `Not an absolute path: ${p}`))
      if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new WorkbenchError(400, tl(`폴더가 없습니다: ${p}`, `Folder does not exist: ${p}`))
      if (!out.includes(p)) out.push(p)
    }
    if (out.length) this.config.pdfFolders = out
    else delete this.config.pdfFolders
    this.save()
    return out
  }

  setStudy(p: string): void {
    if (!path.isAbsolute(p) || !fs.existsSync(p)) throw new WorkbenchError(400, tl('Study 폴더가 없습니다.', 'The Study folder does not exist.'))
    this.config.study = p
    this.save()
  }

  get ui(): UiSettings { return this.config.ui }

  /** 바꾼 항목만 받아 합친다. 고를 수 없는 값은 무시한다 */
  setUi(patch: unknown): UiSettings {
    this.config.ui = normalizeUi(patch, this.config.ui)
    this.save()
    return this.config.ui
  }

  get latexTemplates(): LatexTemplate[] { return this.config.latexTemplates }
  get latexDefault(): string { return this.config.latexDefault }
  get authors(): Author[] { return this.config.authors }

  template(id: string): LatexTemplate {
    const t = this.config.latexTemplates.find((x) => x.id === id)
    if (!t) throw new WorkbenchError(404, tl(`없는 LaTeX 서식: ${id}`, `No such LaTeX template: ${id}`))
    return t
  }

  /** 서식 하나의 바꾼 항목만 합친다 */
  setTemplate(id: string, patch: unknown): LatexTemplate {
    const next = normalizeTemplate(patch, this.template(id))
    this.config.latexTemplates = this.config.latexTemplates.map((t) => (t.id === id ? next : t))
    this.save()
    return next
  }

  /** 새 서식: from(없으면 기본 서식)을 복사해 이름만 바꾼다 */
  addTemplate(name: unknown, from?: unknown): LatexTemplate {
    const src = this.template(typeof from === 'string' ? from : this.config.latexDefault)
    const title = typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : tl(`${src.name} 사본`, `${src.name} copy`)
    const t = normalizeTemplate({ ...src, name: title }, { ...src, id: newTemplateId(title, this.config.latexTemplates.map((x) => x.id)) })
    this.config.latexTemplates = [...this.config.latexTemplates, t]
    this.save()
    return t
  }

  /** 서식을 지운다. 하나는 남긴다. 기본 서식을 지우면 첫 서식이 기본이 된다 */
  removeTemplate(id: string): void {
    this.template(id)
    if (this.config.latexTemplates.length <= 1) throw new WorkbenchError(400, tl('서식은 하나 이상 있어야 합니다.', 'At least one template is required.'))
    this.config.latexTemplates = this.config.latexTemplates.filter((t) => t.id !== id)
    if (this.config.latexDefault === id) this.config.latexDefault = this.config.latexTemplates[0]!.id
    this.save()
  }

  setDefaultTemplate(id: unknown): void {
    this.template(String(id))
    this.config.latexDefault = String(id)
    this.save()
  }

  /** 구글에서 되살릴 때: 목록 전체 */
  restoreTemplates(list: unknown, def: unknown): void {
    if (!Array.isArray(list)) return
    this.config.latexTemplates = normalizeTemplates(list)
    this.config.latexDefault = defaultOf(this.config.latexTemplates, def)
    this.save()
  }

  get people(): Person[] { return this.config.people }

  /** 네트워킹에 더한 사람 목록 전체를 바꾼다 */
  setPeople(list: unknown): Person[] {
    if (!Array.isArray(list)) throw new WorkbenchError(400, tl('사람 목록이 아닙니다.', 'Not a list of people.'))
    this.config.people = normalizePeople(list)
    this.save()
    return this.config.people
  }

  /** 목록 전체를 바꾼다 (순서가 곧 저자 순서) */
  setAuthors(list: unknown): Author[] {
    if (!Array.isArray(list)) throw new WorkbenchError(400, tl('저자 목록이 아닙니다.', 'Not a list of authors.'))
    this.config.authors = normalizeAuthors(list)
    this.save()
    return this.config.authors
  }

  private load(): AppConfig {
    const raw = fs.existsSync(this.file) ? YAML.parse(fs.readFileSync(this.file, 'utf8')) ?? {} : {}
    const engine = ENGINES.includes(raw.engine) ? raw.engine : 'xelatex'
    const library = typeof raw.library === 'string' ? raw.library : undefined
    const study = typeof raw.study === 'string' ? raw.study : undefined
    const reviews = typeof raw.reviews === 'string' ? raw.reviews : undefined
    const personalRepo = typeof raw.personalRepo === 'string' && raw.personalRepo.trim() ? raw.personalRepo : undefined
    const pdfFolders = Array.isArray(raw.pdfFolders) ? raw.pdfFolders.filter((p: unknown): p is string => typeof p === 'string' && path.isAbsolute(p)) : []
    const researches: RegisteredResearch[] = Array.isArray(raw.researches)
      ? raw.researches
        .filter((r: unknown): r is RegisteredResearch =>
          !!r && typeof (r as { id?: unknown }).id === 'string' && typeof (r as { path?: unknown }).path === 'string')
        // 읽은 키를 그대로 둔다: 예전 tags · kind: work도 고칠 때까지 그 모양으로 남는다
        .map((r: RegisteredResearch) => {
          const tags = normalizeTags(r.tags, MAX_FIELD_LENGTH) ?? []
          const fields = Array.isArray(r.fields) ? normalizeTags(r.fields, MAX_FIELD_LENGTH) ?? [] : undefined
          return {
            id: r.id, path: r.path,
            ...((r.kind === 'work' || r.kind === 'research') && { kind: r.kind }),
            ...(fields && { fields }),
            ...(PROJECT_STATES.includes(r.state as ProjectState) && r.state !== 'active' && { state: r.state }),
            ...(r.rail === true && { rail: true }),
            ...(isColor(r.color) && { color: r.color }),
            ...(tags.length && { tags }),
          }
        })
      : []
    // 예전 설정의 latex:(서식 하나)는 PRL 서식으로 옮긴다
    const latexTemplates = normalizeTemplates(raw.latexTemplates, raw.latex, raw.latexBuiltins)
    const latexBuiltins = BUILTIN_TEMPLATES.map((t) => t.id)
    return { engine, library, ...(study && { study }), ...(reviews && { reviews }), ...(pdfFolders.length && { pdfFolders }), ...(personalRepo && { personalRepo }), researches, ui: normalizeUi(withLanguage(raw.ui, researches.length > 0)), latexTemplates, latexDefault: defaultOf(latexTemplates, raw.latexDefault), latexBuiltins, authors: normalizeAuthors(raw.authors), people: normalizePeople(raw.people) }
  }

  private save(): void {
    writeAtomic(this.file, `# research-workspace 앱 설정 — 이 컴퓨터에만 해당한다.\n${YAML.stringify({ ...this.unknownKeys(), ...this.config })}`)
    for (const f of this.saveListeners) f()
  }

  /**
   * 파일에 있지만 이 앱이 모르는 맨 위 키 (다른 맥의 새 버전이 더한 설정, 손으로 적은 키).
   * 설정을 저장할 때 함께 써서 잃지 않는다 (10/10: personalRepo가 저장할 때마다 사라지던 것과 같은 종류)
   */
  private unknownKeys(): Record<string, unknown> {
    let raw: unknown
    try { raw = fs.existsSync(this.file) ? YAML.parse(fs.readFileSync(this.file, 'utf8')) : undefined } catch { return {} }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter(([k]) => !CONFIG_KEYS.has(k)))
  }

  /** 파일에서 설정을 다시 읽는다 (GitHub에서 받은 설정으로 바뀌었을 때, backup.ts) */
  reload(): void {
    this.config = this.load()
    this.workbenches.clear()
  }

  /** 설정이 바뀔 때마다 부른다 (구글 동기화가 저절로 올릴 때) */
  onSave(f: () => void): void { this.saveListeners.push(f) }

  list(): ResearchListItem[] {
    return this.config.researches.map((r) => {
      const { id, path: p } = r
      const profile = profileOf(r)
      const base = { id, path: p, ...profile, tags: legacyTags(profile) }
      try {
        return { ...base, title: this.get(id).readResearch().title, available: true }
      } catch (e) {
        return { ...base, title: path.basename(p), available: false, problem: (e as Error).message }
      }
    })
  }

  /** 예전 태그 하나 목록으로 고칠 때 (구글에서 되살리기): "업무"는 성격, 나머지는 분야로 나눠 새 키로 쓴다 */
  setTags(id: string, raw: unknown): ResearchListItem {
    const tags = normalizeTags(raw, MAX_FIELD_LENGTH)
    if (!tags) throw new WorkbenchError(400, tl(`태그는 ${MAX_TAGS}개까지, 하나에 ${MAX_FIELD_LENGTH}자까지`, `Up to ${MAX_TAGS} tags, ${MAX_FIELD_LENGTH} characters each`))
    return this.setProfile(id, { kind: tags.includes(LEGACY_WORK_TAG) ? 'work' : 'research', fields: tags.filter((t) => t !== LEGACY_WORK_TAG) })
  }

  /** 성격 · 분야 · 진행 상태 · 띠에 보이기 · 색 중 받은 것만 바꾼다. 고치면 새 키로 쓰고 예전 tags는 뺀다 */
  setProfile(id: string, patch: { kind?: unknown; fields?: unknown; state?: unknown; rail?: unknown; color?: unknown }): ResearchListItem {
    const entry = this.config.researches.find((r) => r.id === id)
    if (!entry) throw new WorkbenchError(404, tl(`등록되지 않은 연구: ${id}`, `Project not registered: ${id}`))
    const next = { ...profileOf(entry) }
    if (patch.kind !== undefined) {
      if (!PROJECT_KINDS.includes(patch.kind as ProjectKind)) throw new WorkbenchError(400, tl('성격은 research(연구) · work(업무) 중 하나', 'kind must be research or work'))
      next.kind = patch.kind as ProjectKind
    }
    if (patch.fields !== undefined) {
      const fields = normalizeTags(patch.fields, MAX_FIELD_LENGTH)
      if (!fields) throw new WorkbenchError(400, tl(`분야는 ${MAX_TAGS}개까지, 하나에 ${MAX_FIELD_LENGTH}자까지`, `Up to ${MAX_TAGS} fields, ${MAX_FIELD_LENGTH} characters each`))
      next.fields = fields
    }
    if (patch.state !== undefined) {
      if (!PROJECT_STATES.includes(patch.state as ProjectState)) throw new WorkbenchError(400, tl('진행 상태는 active(진행) · paused(멈춤) · done(완료) 중 하나', 'state must be active, paused or done'))
      next.state = patch.state as ProjectState
    }
    if (patch.rail !== undefined) {
      if (typeof patch.rail !== 'boolean') throw new WorkbenchError(400, tl('rail은 true · false', 'rail must be true or false'))
      next.rail = patch.rail
    }
    if (patch.color !== undefined) {
      if (patch.color !== null && !isColor(patch.color)) throw new WorkbenchError(400, tl(`색은 ${PROJECT_COLORS.join(' · ')} 중 하나이거나 null(자동)`, `color must be one of ${PROJECT_COLORS.join(', ')} or null (auto)`))
      if (patch.color === null) delete next.color
      else next.color = patch.color
    }
    delete entry.tags
    entry.kind = next.kind
    entry.fields = next.fields
    if (next.state === 'active') delete entry.state
    else entry.state = next.state
    if (next.rail) entry.rail = true
    else delete entry.rail
    if (next.color) entry.color = next.color
    else delete entry.color
    this.save()
    return this.list().find((r) => r.id === id)!
  }

  /** 프로젝트 순서 (홈 카드를 끌어 바꾼다, 왼쪽 띠도 이 순서). ids에 없는 프로젝트는 원래 순서대로 뒤에 */
  setOrder(ids: unknown): ResearchListItem[] {
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw new WorkbenchError(400, tl('ids는 프로젝트 id 목록', 'ids must be a list of project ids'))
    const rank = new Map((ids as string[]).map((x, i) => [x, i]))
    const at = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER
    this.config.researches = this.config.researches.map((r, i) => ({ r, i })).sort((a, b) => at(a.r.id) - at(b.r.id) || a.i - b.i).map((x) => x.r)
    this.save()
    return this.list()
  }

  get(id: string): Workbench {
    const entry = this.config.researches.find((r) => r.id === id)
    if (!entry) throw new WorkbenchError(404, tl(`등록되지 않은 연구: ${id}`, `Project not registered: ${id}`))
    let wb = this.workbenches.get(id)
    if (!wb) {
      const root = path.join(entry.path, 'workbench')
      if (!fs.existsSync(root)) throw new WorkbenchError(404, tl(`workbench 폴더가 없음: ${root}`, `No workbench folder: ${root}`))
      wb = new Workbench(root)
      this.workbenches.set(id, wb)
    }
    return wb
  }

  ids(): string[] {
    return this.config.researches.map((r) => r.id)
  }

  inspect(input: string): Inspection {
    const errors: string[] = []
    const warnings: string[] = []
    const abs = path.resolve(input)
    const exists = path.isAbsolute(input) && fs.existsSync(abs)
    if (!path.isAbsolute(input)) errors.push(tl('절대 경로가 필요합니다.', 'An absolute path is required.'))
    else if (!exists) errors.push(tl('폴더가 없습니다.', 'The folder does not exist.'))
    const real = exists ? fs.realpathSync(abs) : abs
    const isDirectory = exists && fs.statSync(real).isDirectory()
    if (exists && !isDirectory) errors.push(tl('폴더가 아니라 파일입니다.', 'This is a file, not a folder.'))
    const isGitRepo = isDirectory && fs.existsSync(path.join(real, '.git'))
    const hasWorkbench = isDirectory && fs.existsSync(path.join(real, 'workbench'))
    const alreadyRegistered = this.config.researches.find((r) => r.path === real)?.id ?? null
    if (alreadyRegistered) errors.push(tl(`이미 등록된 연구입니다 (${alreadyRegistered}).`, `This project is already registered (${alreadyRegistered}).`))
    if (isDirectory && !isGitRepo) warnings.push(tl('git 저장소가 아닙니다. 변경 이력이 남지 않습니다.', 'Not a git repository. No change history will be kept.'))
    if (!isLatexSafePath(real)) warnings.push(tl('경로에 공백이나 특수문자가 있어 지금은 컴파일할 수 없습니다.', 'The path has spaces or special characters, so compiling is not possible for now.'))
    if (isDirectory && !hasWorkbench) warnings.push(tl('workbench/ 폴더가 없습니다. 만들지 확인한 뒤에만 새로 만듭니다.', 'There is no workbench/ folder. It is created only after you confirm.'))
    const repoPreambles = isDirectory ? findRepoPreambles(real) : []
    const repoPreambleDetails = Object.fromEntries(repoPreambles.map((f) => [f, describeTex(fs.readFileSync(path.join(real, f), 'utf8'))]))
    return { path: real, exists, isDirectory, isGitRepo, hasWorkbench, repoPreambles, repoPreambleDetails, alreadyRegistered, suggestedTitle: path.basename(real), warnings, errors }
  }

  /**
   * 등록. workbench/가 없으면 createWorkbench가 true일 때만 만든다(사용자가 화면에서 확인한 경우).
   * 저장소의 다른 파일은 건드리지 않는다.
   */
  register(input: string, opts: { createWorkbench?: boolean; title?: string; question?: string; kind?: unknown; fields?: unknown; tags?: string[]; libraryPreambles?: string[]; repoPreambles?: string[] } = {}): ResearchListItem {
    const ins = this.inspect(input)
    if (ins.errors.length) throw new WorkbenchError(400, ins.errors.join(' '))
    const wbRoot = path.join(ins.path, 'workbench')
    if (!ins.hasWorkbench) {
      if (!opts.createWorkbench) throw new WorkbenchError(409, tl('workbench/ 폴더가 없습니다. 만들려면 확인이 필요합니다.', 'There is no workbench/ folder. Creating it needs confirmation.'))
      Workbench.scaffold(wbRoot, { title: opts.title?.trim() || ins.suggestedTitle, question: opts.question, preamble: this.preambleChoice(ins, opts) })
    }
    const id = uniqueId(slug(ins.suggestedTitle), new Set(this.ids()))
    // 성격 · 분야를 새 키로. 예전 화면이 보내는 tags도 받는다("업무"는 성격, 나머지는 분야)
    const tags = normalizeTags(opts.tags ?? [], MAX_FIELD_LENGTH)
    if (!tags) throw new WorkbenchError(400, tl(`태그는 ${MAX_TAGS}개까지, 하나에 ${MAX_FIELD_LENGTH}자까지`, `Up to ${MAX_TAGS} tags, ${MAX_FIELD_LENGTH} characters each`))
    const fields = opts.fields === undefined ? tags.filter((t) => t !== LEGACY_WORK_TAG) : normalizeTags(opts.fields, MAX_FIELD_LENGTH)
    if (!fields) throw new WorkbenchError(400, tl(`분야는 ${MAX_TAGS}개까지, 하나에 ${MAX_FIELD_LENGTH}자까지`, `Up to ${MAX_TAGS} fields, ${MAX_FIELD_LENGTH} characters each`))
    const kind = opts.kind === undefined ? (tags.includes(LEGACY_WORK_TAG) ? 'work' : 'research') : opts.kind
    if (!PROJECT_KINDS.includes(kind as ProjectKind)) throw new WorkbenchError(400, tl('성격은 research(연구) · work(업무) 중 하나', 'kind must be research or work'))
    this.config.researches.push({ id, path: ins.path, kind: kind as ProjectKind, fields })
    this.save()
    return this.list().find((r) => r.id === id)!
  }

  /** 등록 창에서 고른 서식을 \\input 경로로 바꾼다. 아무것도 고르지 않았으면 기본 서식 */
  private preambleChoice(ins: Inspection, opts: { libraryPreambles?: string[]; repoPreambles?: string[] }) {
    const libNames = opts.libraryPreambles ?? []
    const repoFiles = opts.repoPreambles ?? []
    if (libNames.length === 0 && repoFiles.length === 0) return undefined
    const lib = listLibraryPreambles(this.libraryPath)
    for (const n of libNames) if (!lib.some((p) => p.name === n)) throw new WorkbenchError(400, tl(`라이브러리에 없는 서식: ${n}`, `Template not in the library: ${n}`))
    for (const f of repoFiles) if (!ins.repoPreambles.includes(f)) throw new WorkbenchError(400, tl(`저장소에서 쓸 수 없는 서식 파일: ${f}`, `Template file not usable from the repository: ${f}`))
    const chosen = lib.filter((p) => libNames.includes(p.name))
    return {
      first: chosen.filter((p) => p.place === 'first').map((p) => p.file),
      repo: repoFiles.map((f) => `../${f}`),
      last: chosen.filter((p) => p.place === 'last').map((p) => p.file),
    }
  }

  /** 목록에서만 뺀다. 저장소의 파일은 지우지 않는다. */
  unregister(id: string): void {
    const before = this.config.researches.length
    this.config.researches = this.config.researches.filter((r) => r.id !== id)
    if (this.config.researches.length === before) throw new WorkbenchError(404, tl(`등록되지 않은 연구: ${id}`, `Project not registered: ${id}`))
    this.workbenches.delete(id)
    this.save()
  }
}

function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'research'
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * Settings saved before the language option existed came from the Korean-only app:
 * keep those installs Korean. A fresh install (no projects yet) follows the browser.
 */
function withLanguage(ui: unknown, existing: boolean): unknown {
  if (!existing) return ui
  if (!ui || typeof ui !== 'object') return { language: 'ko' }
  return 'language' in ui ? ui : { ...ui, language: 'ko' }
}
