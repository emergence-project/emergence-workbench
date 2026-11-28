/**
 * 앱이 다시 켜져도 남는 허락 카드 (11/28 사용자 결정 "다시 켠 뒤 허락 카드").
 *
 * 예전에는 앱이 다시 켜지면 기다리던 허락 · 계획 카드를 「답하기 전에 멈춤」(거절)으로 닫았고, 그래서 업데이트도 카드에 답할 때까지
 * 미뤘다(11/20 "미루자"). 이제는 물을 때 작업 폴더의 상태(base)와 그 호출의 지문(match)을 적어 두고, 다시 켜진 뒤 카드를 그대로 띄운다.
 * 사용자가 답하면 같은 세션을 이어 가고, 허락했으면 「글자까지 같은 호출」만 한 번 묻지 않고 통과시킨다(preAllowed).
 * 카드에는 물은 뒤 바뀐 것(since: 작업 폴더의 파일 · 브랜치의 커밋 · main의 새 커밋 · CI)을 보인다.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AskSince } from '@rw/core/contract/agentChats'
import { git, GIT_TIMEOUT } from './git.js'
import { t } from './i18n.js'

/** 물을 때의 작업 폴더: HEAD, 받아 둔 main, 커밋하지 않은 고침(파일 → 내용 해시, 추적하지 않는 새 파일 포함), PR 검사 */
export interface AskBase { head?: string; main?: string; files: Record<string, string>; ci?: string }

/** 카드를 다시 띄우고 답을 이어 가는 데 필요한 것 (서버에만, 화면에는 보내지 않는다) */
export interface AskMeta {
  /** 호출의 지문: 도구 이름과 입력 전부. 다시 켠 뒤 이것과 똑같은 호출만 한 번 통과한다 */
  match: string
  /** 「늘」 허락의 열쇠 · 이름 · 켤 토글 (살아 있는 카드와 같게) */
  key: string; label: string; turnOn?: 'read' | 'web' | 'edit'
  plan?: true
  base?: AskBase
}

/** 키 순서와 상관없는 JSON (지문이 입력 객체의 키 순서에 흔들리지 않게) */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

export const matchOf = (tool: string, input: Record<string, unknown>): string =>
  crypto.createHash('sha256').update(`${tool}\n${stable(input)}`).digest('hex')

const quiet = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined)
const opts = { timeout: GIT_TIMEOUT.read }

async function mainRef(repo: string): Promise<string | undefined> {
  for (const ref of ['origin/main', 'origin/master', 'origin/HEAD']) {
    const r = await quiet(git(repo, ['rev-parse', '--verify', '--quiet', ref], opts))
    if (r) return r
  }
  return undefined
}

/** 커밋하지 않은 고침: 파일 → 내용 해시 (지운 파일은 'gone'). 줄 수가 아니라 내용으로 견주어 +1 −1 같은 고침도 놓치지 않는다 */
async function dirty(repo: string): Promise<Record<string, string>> {
  const out = await quiet(git(repo, ['status', '--porcelain', '-uall', '-z'], opts))
  const names: string[] = []
  const parts = (out ?? '').split('\0')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    if (p.length < 4) continue
    names.push(p.slice(3))
    if (p[0] === 'R' || p[0] === 'C') i++ // 옮긴 파일은 옛 이름이 뒤따른다
  }
  const m: Record<string, string> = {}
  for (const f of names) {
    const full = path.join(repo, f)
    m[f] = fs.existsSync(full) && fs.statSync(full).isFile() ? crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex') : 'gone'
  }
  return m
}

/** 화면에 보일 +n −n (HEAD와 견줌, 새 파일은 줄 수) */
async function counts(repo: string, files: string[]): Promise<Record<string, [number, number]>> {
  const m: Record<string, [number, number]> = {}
  const out = await quiet(git(repo, ['diff', 'HEAD', '--numstat', '--', ...files], opts))
  for (const line of (out ?? '').split('\n')) {
    const [a, r, ...f] = line.split('\t')
    if (f.length) m[f.join('\t')] = [Number(a) || 0, Number(r) || 0]
  }
  const tracked = new Set((await quiet(git(repo, ['ls-files', '--', ...files], opts)) ?? '').split('\n'))
  for (const f of files) {
    if (m[f]) continue
    if (tracked.has(f)) { m[f] = [0, 0]; continue } // HEAD와 같아짐 (고쳤다가 되돌림)
    const full = path.join(repo, f)
    m[f] = [fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full, 'utf8').split('\n').filter(Boolean).length : 0, 0]
  }
  return m
}

/** 물을 때의 상태. git 저장소가 아니면 비어 있는 것을 돌려준다 (바뀐 것을 셀 수 없음) */
export async function askBase(repo: string, ci?: string): Promise<AskBase> {
  const [head, main, files] = await Promise.all([quiet(git(repo, ['rev-parse', 'HEAD'], opts)), mainRef(repo), dirty(repo)])
  return { ...(head && { head }), ...(main && { main }), files, ...(ci && { ci }) }
}

const count = async (repo: string, from: string, to: string): Promise<number> =>
  Number(await quiet(git(repo, ['rev-list', '--count', `${from}..${to}`], opts))) || 0

/** 다시 켜질 때 카드가 여럿이어도 저장소마다 origin을 한 번만 받는다 (ref 잠금이 부딪히지 않게) */
const fetching = new Map<string, Promise<unknown>>()
function fetchOnce(repo: string): Promise<unknown> {
  let p = fetching.get(repo)
  if (!p) {
    p = quiet(git(repo, ['fetch', '--quiet', 'origin'], { timeout: GIT_TIMEOUT.remote }))
    fetching.set(repo, p)
    void p.finally(() => setTimeout(() => fetching.delete(repo), 60_000).unref?.())
  }
  return p
}

/** 물은 뒤 바뀐 것. main은 받아 와서 본다(실패하면 받아 둔 것으로). 셀 수 없으면 error */
export async function sinceOf(repo: string, base: AskBase | undefined, ci?: string): Promise<AskSince> {
  if (!base?.head || !fs.existsSync(repo)) return { files: [], commits: 0, main: 0, error: t('물을 때의 상태가 없어 바뀐 것을 셀 수 없습니다', 'No record of the state when it asked, so changes cannot be counted') }
  await fetchOnce(repo)
  const [head, main, now] = await Promise.all([quiet(git(repo, ['rev-parse', 'HEAD'], opts)), mainRef(repo), dirty(repo)])
  const was = base.files ?? {}
  const moved = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((f) => was[f] !== now[f])
  const n = moved.length ? await counts(repo, moved) : {}
  const files: AskSince['files'] = moved.map((f) => ({ file: f, added: n[f]?.[0] ?? 0, removed: n[f]?.[1] ?? 0 }))
  // 브랜치가 움직였으면(새 커밋 · 되돌림) 그 사이 커밋 수, 되돌렸으면 최소 1
  const commits = head && head !== base.head ? Math.max(1, await count(repo, base.head, head)) : 0
  const mainNew = base.main && main && main !== base.main ? await count(repo, base.main, main) : 0
  return { files, commits, main: mainNew, ...(ci !== base.ci && (ci || base.ci) && { ci: { ...(base.ci && { from: base.ci }), ...(ci && { to: ci }) } }) }
}

export const nothingChanged = (s: AskSince): boolean => !s.error && !s.files.length && !s.commits && !s.main && !s.ci

/** 에이전트에게 보낼 바뀐 것 (영어, 에이전트가 읽는다) */
export function sinceText(s: AskSince | undefined): string {
  if (!s) return 'The app could not tell what changed in the meantime.'
  if (s.error) return 'The app could not tell what changed in the meantime.'
  if (nothingChanged(s)) return 'Nothing changed in the work folder in the meantime.'
  const lines = [
    ...s.files.map((f) => `- file ${f.file} now differs (+${f.added} -${f.removed} against HEAD)`),
    ...(s.commits ? [`- the branch moved by ${s.commits} commit(s)`] : []),
    ...(s.main ? [`- main has ${s.main} new commit(s)`] : []),
    ...(s.ci ? [`- PR checks changed: ${s.ci.from ?? 'none'} -> ${s.ci.to ?? 'none'}`] : []),
  ]
  return `In the meantime these changed:\n${lines.join('\n')}`
}
