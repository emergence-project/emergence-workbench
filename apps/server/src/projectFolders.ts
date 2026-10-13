import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { frontMatter } from '@rw/core'
import { STATEMENT_DIRS } from './statements.js'
import type { Workbench } from './workbench.js'

/**
 * 연구 저장소의 폴더 (10/13 결정 "연구 저장소 폴더"): 맨 위 표준 여섯 폴더, 고유 폴더(research.yaml folders:),
 * workbench 안의 결정(decisions/)과 프로젝트 규칙(rules/). 형식은 docs/repo-format.md §1.1 · §13.
 *
 * research.yaml
 *   folders:                         # 표준 밖의 고유 폴더 (맨 위 폴더 이름 — 설명)
 *     - biz-space — 사업 계획 (statements/처럼 앱이 읽는 폴더는 적지 않아도 된다)
 *
 * 앱은 맨 위 폴더를 고치거나 만들지 않는다. STATUS.md "폴더와 편집 규칙" 절과 agent:check가 읽기만 한다.
 */

/** 맨 위 표준 폴더와 에이전트 편집 규칙 (D7). 순서가 STATUS.md에 보이는 순서다 */
export const STANDARD_FOLDERS = [
  { name: 'workbench', role: '앱: 주제·노트·작업·결정·규칙·일지', edit: '앱 형식(docs/repo-format.md)대로. 해결 노트·확인한 개념노트·accepted 규칙과 결정은 허락받은 뒤' },
  { name: 'docs', role: '우리가 쓴 글: 설계·안내·원고·검토 보고(reviews/)', edit: '저장소 규칙대로. 원고는 사용자가 요청할 때만' },
  { name: 'sources', role: '원자료와 받은 원본', edit: '고치지 않는다. 근거로만 쓴다' },
  { name: 'code-space', role: '패키지·스크립트·예제·테스트·모형 정의', edit: '저장소 규칙대로' },
  { name: 'data-space', role: '계산이 만든 그림과 데이터', edit: '손으로 고치지 않고 스크립트로만 다시 만든다' },
  { name: 'archive', role: '더 고치지 않는 보존본 (날짜-이름/)', edit: '고치지 않는다' },
] as const

export const DECISIONS_DIR = 'decisions'
export const RULES_DIR = 'rules'
/** 결정 파일 이름: 날짜-이름.md (Court-Precedents와 같은 모양) */
export const DECISION_FILE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*\.md$/
/** 규칙 파일 이름: 이름.md */
export const RULE_FILE = /^[a-z0-9][a-z0-9-]*\.md$/

export interface OwnFolder { name: string; note: string; edit: string }

/** 앱이 맨 위에서 읽는 고유 폴더: folders:에 적지 않아도 고유 폴더로 센다. 옮기면 앱이 못 찾는다 */
export const APP_FOLDERS: OwnFolder[] = STATEMENT_DIRS.map((name) => ({ name, note: '진술: 정의·정리', edit: '앱이 읽는다. 앱 형식(docs/repo-format.md)대로 고치고 옮기지 않는다' }))

/** research.yaml folders: (고유 폴더). 읽지 못하면 빈 목록 */
export function readOwnFolders(wb: Workbench): OwnFolder[] {
  let raw: unknown
  try { raw = YAML.parse(fs.readFileSync(wb.researchPath, 'utf8')) } catch { return [] }
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).folders : undefined
  return (Array.isArray(v) ? v : []).flatMap((line) => {
    if (typeof line !== 'string') return []
    const [name, ...rest] = line.split(/\s+[—-]\s+/)
    const n = name!.trim().replace(/\/+$/, '')
    return n ? [{ name: n, note: rest.join(' — ').trim(), edit: '저장소 규칙대로' }] : []
  })
}

/** 저장소 맨 위의 폴더 이름 (점으로 시작하는 것 빼고, 이름순) */
export function topLevelFolders(wb: Workbench): string[] {
  try { return fs.readdirSync(wb.repo, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '__pycache__').map((e) => e.name).sort() } catch { return [] }
}

/** 표준 배치를 쓰기 시작한 저장소: 주제 폴더(workbench/topics/)나 research.yaml folders:가 있다. 이때만 표준 밖 폴더를 경고한다 */
export function usesStandardLayout(wb: Workbench): boolean {
  if (wb.usesTopicFolders()) return true
  try { const raw = YAML.parse(fs.readFileSync(wb.researchPath, 'utf8')); return !!raw && typeof raw === 'object' && 'folders' in raw } catch { return false }
}

export interface FolderMap {
  standard: { name: string; role: string; edit: string }[]
  own: OwnFolder[]
  /** 표준도 고유도 아닌 맨 위 폴더 (옮기거나 folders:에 적을 것) */
  other: string[]
}

/** 지금 있는 맨 위 폴더를 표준 · 고유 · 그 밖으로 나눈다 */
export function folderMap(wb: Workbench): FolderMap {
  const present = new Set(topLevelFolders(wb))
  const app = APP_FOLDERS.filter((f) => present.has(f.name))
  const own = [...app, ...readOwnFolders(wb).filter((f) => present.has(f.name) && !app.some((a) => a.name === f.name))]
  const known = new Set([...STANDARD_FOLDERS.map((f) => f.name as string), ...own.map((f) => f.name)])
  return {
    standard: STANDARD_FOLDERS.filter((f) => present.has(f.name)),
    own,
    other: [...present].filter((n) => !known.has(n)),
  }
}

/** 결정·규칙 문서 하나: 제목은 머리말 title, 없으면 첫 # 제목, 그것도 없으면 파일 이름 */
export interface GovernDoc { file: string; title: string; status: string }

/** 폴더 맨 위의 .md (이름 모양은 agent:check가 본다) */
function readDocs(wb: Workbench, dir: string): GovernDoc[] {
  const abs = path.join(wb.root, dir)
  let names: string[]
  try { names = fs.readdirSync(abs) } catch { return [] }
  return names.filter((n) => n.endsWith('.md') && !n.startsWith('.')).sort().flatMap((n) => {
    const p = path.join(abs, n)
    try {
      if (!fs.lstatSync(p).isFile()) return []
      const text = fs.readFileSync(p, 'utf8')
      const f = frontMatter(text)
      let fm: Record<string, unknown> = {}
      if (f) { try { fm = YAML.parse(f.yaml) ?? {} } catch { fm = {} } }
      const h1 = /^#\s+(.+)$/m.exec(f ? f.body : text)?.[1]
      return [{ file: path.relative(wb.repo, p).split(path.sep).join('/'), title: String(fm.title ?? h1 ?? n.replace(/\.md$/, '')).trim(), status: typeof fm.status === 'string' ? fm.status : '' }]
    } catch { return [] }
  })
}

/** workbench/rules/의 프로젝트 규칙 */
export const listRules = (wb: Workbench): GovernDoc[] => readDocs(wb, RULES_DIR)
/** workbench/decisions/의 결정 */
export const listDecisions = (wb: Workbench): GovernDoc[] => readDocs(wb, DECISIONS_DIR)
