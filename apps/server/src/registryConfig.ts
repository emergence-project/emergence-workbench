/** 앱 설정의 모양 · 태그와 프로젝트 성격 값 · 이름 만들기 (registry.ts에서 나눔) */
import path from 'node:path'
import type { AgentSettings, SyncSettings, Author, LatexTemplate, Person, UiSettings } from '@rw/core'
import type { TexDefinitions } from './library.js'
import type { Engine } from './latex.js'
import type { ProjectColor, ProjectKind, ProjectState } from '@rw/core/contract/research'

/**
 * 이 컴퓨터에만 있는 앱 설정 (~/.config/research-workspace/config.yaml).
 * 연구 저장소 경로는 기기마다 다르므로 git 저장소가 아니라 여기에 둔다.
 */
/** load()가 읽어 AppConfig로 옮기는 키. latex는 예전 서식 하나(latexTemplates로 옮김). 이 밖의 키는 저장할 때 그대로 둔다 */
export const CONFIG_KEYS = new Set(['engine', 'library', 'study', 'reviews', 'pdfFolders', 'personalRepo', 'researches', 'ui', 'latexTemplates', 'latexDefault', 'latexBuiltins', 'authors', 'people', 'latex', 'agents', 'sync', 'gitIdentity', 'meAt', 'peopleAt'])

export interface AppConfig {
  engine: Engine
  /** 공유 라이브러리 폴더. 없으면 라이브러리 서식을 쓰지 않는다 */
  library?: string
  /** Obsidian vault 폴더 (읽기만, 지식 화면). 없으면 보이지 않는다 */
  study?: string
  /** Topic Review 폴더 (읽기만, 지식 화면). 없으면 보이지 않는다 */
  reviews?: string
  /** 논문 PDF 폴더 (여러 개, iCloud·Google Drive 폴더 가능). 논문 라이브러리가 <bib 키>.pdf를 여기서 찾는다 */
  pdfFolders?: string[]
  /** 개인 저장소 주소 (personalRepo.ts가 이 파일에서 바로 읽는다). 저장할 때 잃지 않도록 함께 둔다 */
  personalRepo?: string
  /** 계정 › 커밋 이름: 앱이 하는 커밋에만 쓴다 (git.ts setAppIdentity, 11/19). 없으면 git 전체 설정 */
  gitIdentity?: { name: string; email: string }
  /** 내 정보(저자 · 커밋 이름)를 마지막으로 고친 때. 컴퓨터 사이에 더 늦게 고친 쪽을 따른다 (meSync.ts, 11/20) */
  meAt?: string
  researches: RegisteredResearch[]
  /** 설정 화면의 화면 설정 (테마, 글자 크기, 편집기 글꼴 등) */
  ui: UiSettings
  /** 설정 › 에이전트 (지시를 맥의 Claude가 언제 하는지) */
  agents: AgentSettings
  /** 설정 › 동기화에서 바꾼 칸 (10/19). 없는 칸은 앱을 켤 때 정한 값 */
  sync: Partial<SyncSettings>
  /** LaTeX 서식 모음 (article·PRL·beamer …). 서식마다 문서 종류 줄, 공통 줄, 패키지 */
  latexTemplates: LatexTemplate[]
  /** 내보낼 때 쓰는 서식의 id */
  latexDefault: string
  /** 이 설정이 이미 본 기본 서식 id. 새 기본 서식(예: PRB)을 예전 설정에 한 번만 더하는 데 쓴다 */
  latexBuiltins: string[]
  /** 저자와 소속. 내보낼 때 \author·\affiliation 줄로 넣는다 */
  authors: Author[]
  /** 네트워킹에 따로 더한 사람 (저자와 소속에 있는 사람은 저절로 들어간다). peopleAt은 마지막으로 고친 때: 컴퓨터 사이에 더 늦게 고친 쪽을 따른다 (meSync.ts, 11/20) */
  people: Person[]; peopleAt?: string
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
export const PROJECT_KINDS: ProjectKind[] = ['research', 'work']
export const PROJECT_STATES: ProjectState[] = ['active', 'paused', 'done']
/** 예전 태그 하나로 섞어 쓰던 때 성격 업무를 뜻하던 태그 */
export const LEGACY_WORK_TAG = '업무'
/** 분야 이름은 개념노트 분류 이름이라 태그보다 길 수 있다 */
export const MAX_FIELD_LENGTH = 60

/** profileAt: 성격 · 분야 · 진행 상태 · 띠 · 색을 마지막으로 고친 때(ISO). 컴퓨터 사이에서 더 늦게 고친 쪽을 따른다 (profileSync.ts) */
export interface RegisteredResearch { id: string; path: string; kind?: unknown; fields?: string[]; state?: ProjectState; rail?: boolean; color?: string; tags?: string[]; profileAt?: string }

export interface ProjectProfile { kind: ProjectKind; fields: string[]; state: ProjectState; rail: boolean; color?: ProjectColor }

/** 설정 한 줄에서 성격 · 분야 · 진행 상태를 읽는다 (예전 tags · kind: work 포함) */

export function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'research'
}

export function uniqueId(base: string, taken: Set<string>): string {
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * Settings saved before the language option existed came from the Korean-only app:
 * keep those installs Korean. A fresh install (no projects yet) follows the browser.
 */
export function withLanguage(ui: unknown, existing: boolean): unknown {
  if (!existing) return ui
  if (!ui || typeof ui !== 'object') return { language: 'ko' }
  return 'language' in ui ? ui : { ...ui, language: 'ko' }
}
