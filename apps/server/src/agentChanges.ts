import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { frontMatter } from '@rw/core'
import type { WorkbenchDiagnostic } from './agentCheck.js'
import { t } from './i18n.js'
import { folderMap, usesStandardLayout } from './projectFolders.js'
import type { Workbench } from './workbench.js'
import { PROBLEM_CHECKS, problemChecker } from './problemChanges.js'

/**
 * 바뀐 것 검사 (`pnpm agent:check`, docs/repo-format.md §15). 공통 규칙 가운데 기계가 판정할 수 있는 것을
 * 기준 커밋 이후 바뀐 파일에서 찾는다. 파일은 읽기만 한다.
 */
export type CheckLevel = 'error' | 'warning' | 'off'
export const CHANGE_CHECKS = {
  'frozen-folder': 'error',
  locked: 'error',
  approval: 'error',
  'attempt-skipped': 'warning',
  'nonstandard-new-file': 'warning',
  'confirmed-edit': 'warning',
  'outside-workbench': 'warning',
  'move-delete': 'warning',
  ...PROBLEM_CHECKS,
} as const satisfies Record<string, CheckLevel>
export type ChangeCheckId = keyof typeof CHANGE_CHECKS
export type CheckLevels = Partial<Record<ChangeCheckId, CheckLevel>>

export interface ChangeDiagnostic extends WorkbenchDiagnostic { check: ChangeCheckId }
export interface ChangeReport {
  /** 기준 이름 (origin/main, 브랜치의 upstream, HEAD) */
  base: string
  /** 기준 뒤 올리지 않은 커밋 수 */
  commits: number
  files: number
  diagnostics: ChangeDiagnostic[]
}

const LEVELS = new Set<CheckLevel>(['error', 'warning', 'off'])
const isCheck = (k: string): k is ChangeCheckId => Object.hasOwn(CHANGE_CHECKS, k)

/** 공통 규칙 머리말의 `checks:` (검사 이름 → error · warning · off). 모르는 이름과 값은 넘어간다 */
export function checkLevels(rulesText: string | undefined): CheckLevels {
  const fm = rulesText ? frontMatter(rulesText) : null
  if (!fm) return {}
  let raw: unknown
  try { raw = YAML.parse(fm.yaml) } catch { return {} }
  const checks = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).checks : undefined
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) return {}
  const out: CheckLevels = {}
  for (const [k, v] of Object.entries(checks)) if (isCheck(k) && typeof v === 'string' && LEVELS.has(v as CheckLevel)) out[k] = v as CheckLevel
  return out
}

const git = (cwd: string, args: string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 })
  } catch { return null }
}

/** 기준: 주어진 ref, 없으면 origin의 기본 브랜치(origin/HEAD, 없으면 main·master), 그다음 upstream과 갈라진 곳. 모두 없으면 HEAD (커밋하지 않은 변경만) */
export function changeBase(repo: string, given?: string): { ref: string; name: string } | null {
  if (git(repo, ['rev-parse', '--verify', '-q', 'HEAD']) === null) return null
  for (const ref of given ? [given] : ['origin/HEAD', 'origin/main', 'origin/master', '@{upstream}']) {
    const at = git(repo, ['merge-base', 'HEAD', ref])?.trim()
    if (at) return { ref: at, name: git(repo, ['rev-parse', '--abbrev-ref', ref])?.trim() || ref }
  }
  return given ? null : { ref: 'HEAD', name: 'HEAD' }
}

interface Change { status: 'A' | 'M' | 'D' | 'R'; file: string; from?: string }

/** `git diff --name-status -z` + 추적하지 않는 새 파일 */
function changesSince(repo: string, base: string): Change[] {
  const tokens = (git(repo, ['diff', '--name-status', '-z', '-M', '--relative', base]) ?? '').split('\0')
  const out: Change[] = []
  for (let i = 0; i < tokens.length && tokens[i];) {
    const code = tokens[i]![0]!
    if (code === 'R' || code === 'C') {
      out.push(code === 'R' ? { status: 'R', from: tokens[i + 1]!, file: tokens[i + 2]! } : { status: 'A', file: tokens[i + 2]! })
      i += 3
    } else {
      out.push({ status: code === 'A' ? 'A' : code === 'D' ? 'D' : 'M', file: tokens[i + 1]! })
      i += 2
    }
  }
  for (const file of (git(repo, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '').split('\0')) if (file) out.push({ status: 'A', file })
  return out
}

const yamlOf = (text: string | undefined): Record<string, unknown> | undefined => {
  if (text === undefined) return undefined
  try {
    const v = YAML.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined
  } catch { return undefined }
}
const headOf = (text: string | undefined) => {
  const fm = text === undefined ? null : frontMatter(text)
  return fm ? yamlOf(fm.yaml) : undefined
}
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : []
const NOTE_DIR = /^(workbench\/(?:notes|calc)\/[^/]+|workbench\/topics\/[^/]+\/[^/]+)\/[^/]/
const TASK = /^workbench\/tasks\/[^/]+\.md$/
const DOC = /^workbench\/(?:decisions|rules)\/[^/]+\.md$/
const noteDone = (y: Record<string, unknown> | undefined) => y?.state === 'done' || y?.done === true

/** 기준 이후 바뀐 파일을 공통 규칙에 비춰 본다. git 기록이 없으면 null */
export function checkChanges(wb: Workbench, opts: { base?: string; levels?: CheckLevels } = {}): ChangeReport | null {
  const repo = wb.repo
  const base = changeBase(repo, opts.base)
  if (!base) return null
  const level = (id: ChangeCheckId): CheckLevel => opts.levels?.[id] ?? CHANGE_CHECKS[id]
  const diagnostics: ChangeDiagnostic[] = []
  const add = (check: ChangeCheckId, file: string, ko: string, en: string) => {
    const l = level(check)
    if (l !== 'off') diagnostics.push({ level: l, file, line: 1, message: t(ko, en), check })
  }
  const oldText = (file: string) => git(repo, ['show', `${base.ref}:./${file}`]) ?? undefined
  const newText = (file: string) => { try { return fs.readFileSync(path.join(repo, file), 'utf8') } catch { return undefined } }
  const top = (file: string) => file.split('/')[0]!
  const changes = changesSince(repo, base.ref)
  const other = usesStandardLayout(wb) ? new Set(folderMap(wb).other) : new Set<string>()
  const outside = new Map<string, number>()
  const removed: string[] = []
  const moved: string[] = []
  const confirmedNotes = new Set<string>()
  /** 바뀐 노트 (폴더) */
  const work = new Map<string, string>()
  const problems = problemChecker(repo, add)

  for (const c of changes) {
    const before = c.status === 'A' ? undefined : oldText(c.from ?? c.file)
    const after = c.status === 'D' ? undefined : newText(c.file)
    const old = c.from ?? c.file

    // 원자료·보존본: 있는 파일을 고치거나 지우거나 옮기지 않는다 (새로 넣는 것은 옮기기·바깥 경고로).
    // 폴더 맨 위 README.md는 안내와 옛 경로 → 새 경로 표라 옮길 때마다 고친다 (바깥 경고만)
    if (c.status !== 'A' && (top(old) === 'sources' || top(old) === 'archive') && !/^(sources|archive)\/README\.md$/.test(old)) {
      add('frozen-folder', old, top(old) === 'sources' ? '원자료(sources/)의 있는 파일을 고치거나 지웠습니다. 되돌리세요.' : '보존본(archive/)의 있는 파일을 고치거나 지웠습니다. 되돌리세요.',
        top(old) === 'sources' ? 'An existing file in sources/ (original material) was changed or removed. Revert it.' : 'An existing file in archive/ (preserved copy) was changed or removed. Revert it.')
      continue
    }
    if (c.status !== 'A' && (headOf(before)?.locked === true || (/\.ya?ml$/.test(old) && yamlOf(before)?.locked === true))) {
      add('locked', old, '잠긴 파일(locked: true)을 고쳤습니다. 되돌리세요.', 'A locked file (locked: true) was changed. Revert it.')
      continue
    }
    if (c.status === 'D') removed.push(c.file)
    if (c.status === 'R') moved.push(`${c.from} → ${c.file}`)
    // 흐름과 시도 나무 (11/11): 사용자만 하는 것 · 판정 · 일하는 규칙은 problemChanges.ts
    if (problems.file(c, old, before, after)) continue
    if (!c.file.startsWith('workbench/')) {
      outside.set(top(c.file), (outside.get(top(c.file)) ?? 0) + 1)
      if (c.status === 'A' && other.has(top(c.file))) add('nonstandard-new-file', c.file, `표준 밖 폴더 ${top(c.file)}/에 새 파일을 만들었습니다. 할 일·인계·제안은 workbench/tasks/, 결정은 workbench/decisions/, 규칙은 workbench/rules/에 둡니다.`,
        `A new file was created in the non-standard folder ${top(c.file)}/. Tasks, handoffs and proposals go in workbench/tasks/, decisions in workbench/decisions/, rules in workbench/rules/.`)
      continue
    }
    if (after === undefined) continue

    // 승인은 사용자만 한다
    const dir = NOTE_DIR.exec(c.file)?.[1]
    if (dir && c.file === `${dir}/note.yaml` && noteDone(yamlOf(after)) && !noteDone(yamlOf(before))) {
      add('approval', c.file, '노트를 해결(state: done)로 바꿨습니다. 해결은 사용자만 정합니다.', 'The note was marked solved (state: done). Only the user marks notes solved.')
    } else if (dir && c.status !== 'A' && !confirmedNotes.has(dir) && noteDone(yamlOf(oldText(`${dir}/note.yaml`)))) {
      confirmedNotes.add(dir)
      add('confirmed-edit', c.file, '사용자가 해결로 정한 노트를 고쳤습니다. 허락받았는지 답에 적으세요.', 'A note the user marked solved was changed. Say in your reply whether you had permission.')
    }
    if (TASK.test(c.file)) {
      const a = headOf(after); const b = headOf(before)
      if (a?.state === 'done' && b?.state !== 'done') add('approval', c.file, '맡긴 일을 done으로 바꿨습니다. 승인은 사용자가 앱에서 합니다. 결과를 냈으면 state: result로 둡니다.', 'The task was set to done. The user approves in the app; leave a finished result as state: result.')
      if (list(a?.judged).length > list(b?.judged).length || list(a?.answers).length > list(b?.answers).length) add('approval', c.file, '판단·답 기록(judged · answers)을 썼습니다. 이 칸은 앱이 사용자의 선택으로만 씁니다.', 'Judgement or answer records (judged · answers) were written. Only the app writes them from the user\'s choices.')
    }
    if (dir && !work.has(dir)) work.set(dir, c.file)
    if (DOC.test(c.file) && c.status !== 'A' && headOf(before)?.status === 'accepted') {
      add('confirmed-edit', c.file, '사용자가 확정한(accepted) 결정·규칙을 고쳤습니다. 허락받았는지 답에 적으세요.', 'An accepted decision or rule was changed. Say in your reply whether you had permission.')
    }
  }

  problems.finish()
  // 진행 중인 흐름이 있는데 바뀐 노트를 가리키는 시도가 없다 (11/11: 새 일은 흐름 아래의 시도로 하고, 결과 노트는 시도 보고의 파일에 적는다).
  // 사용자가 직접 시킨 일로 고친 노트도 걸리므로 경고다
  const pointed = work.size ? problems.pointed() : null
  if (pointed) {
    const inNote = (f: string, key: string) => f === key || f.startsWith(`${key}/`)
    const skipped = [...work].filter(([key]) => !pointed.some((f) => inNote(f, key)))
    if (skipped.length) {
      const names = skipped.map(([key]) => key.replace(/^workbench\//, '')).slice(0, 3).join(', ') + (skipped.length > 3 ? ' …' : '')
      add('attempt-skipped', skipped[0]![1], `진행 중인 흐름이 있는데, 바꾼 노트 ${skipped.length}개를 가리키는 시도가 없습니다 (${names}). 흐름의 시도로 한 일이면 보고의 파일에 그 노트를 적으세요(attempt_report · pnpm agent:problem … report --file). 사용자가 직접 시킨 일이면 그대로 둡니다.`,
        `A flow is open, but no attempt points to the ${skipped.length} changed note(s) (${names}). If this was work on an attempt, list the note in the report's files (attempt_report · pnpm agent:problem … report --file). Leave it if the user asked for the edit directly.`)
    }
  }

  for (const [folder, n] of [...outside].sort()) {
    add('outside-workbench', `${folder}${changes.some((c) => c.file === folder) ? '' : '/'}`, `workbench/ 밖 파일 ${n}개를 바꿨습니다. 사용자가 요청하거나 허락한 것인지 답에 적으세요.`, `${n} file(s) outside workbench/ changed. Say in your reply whether the user asked for or allowed it.`)
  }
  const sample = (xs: string[]) => xs.slice(0, 3).join(', ') + (xs.length > 3 ? ` …` : '')
  if (removed.length) add('move-delete', removed[0]!, `파일 ${removed.length}개를 지웠습니다 (${sample(removed)}). 허락받았는지 답에 적으세요.`, `${removed.length} file(s) removed (${sample(removed)}). Say in your reply whether you had permission.`)
  if (moved.length) add('move-delete', moved[0]!.split(' → ')[1]!, `파일 ${moved.length}개를 옮겼습니다 (${sample(moved)}). 허락받았는지 답에 적으세요.`, `${moved.length} file(s) moved (${sample(moved)}). Say in your reply whether you had permission.`)

  const commits = base.ref === 'HEAD' ? 0 : Number(git(repo, ['rev-list', '--count', `${base.ref}..HEAD`])?.trim() ?? 0)
  return { base: base.name, commits, files: changes.length, diagnostics }
}
