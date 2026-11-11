// 예외 기록 (workbench/problems/_exceptions/<시각>-<무작위>.yaml, docs/repo-format.md §16 "예외 기록").
// 흐름의 규칙대로 되지 않은 일을 한 줄씩 모은다: 앱이 규칙으로 거절한 것은 앱이 적고(refused), 에이전트와 사용자는 한 줄을 더한다.
// 11/11 사용자 결정 "해 보면서 판단": 2주 써 본 뒤 이 기록으로 규칙을 다시 본다. 항목 하나에 파일 하나라 두 컴퓨터가 함께 적어도 부딪히지 않는다.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { EXCEPTION_KINDS, localDate, stamp } from '@rw/core'
import type { FlowException, NewExceptionBody } from '@rw/core/contract/problems'
import { writeAtomic } from './fsutil.js'
import { t } from './i18n.js'
import { WorkbenchError, type Workbench } from './workbench.js'

/** 흐름 id가 될 수 없는 이름(밑줄로 시작)이라 흐름 목록과 바뀐 것 검사가 흐름으로 읽지 않는다 */
export const EXCEPTIONS_DIR = '_exceptions'
const FORMAT = 1
const dirOf = (wb: Workbench) => path.join(wb.root, 'problems', EXCEPTIONS_DIR)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v.trim() || undefined : v instanceof Date ? v.toISOString().slice(0, 16) : undefined)

function parse(id: string, text: string): FlowException | null {
  let o: unknown
  try { o = YAML.parse(text) } catch { return null }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const r: Record<string, unknown> = Object.fromEntries(Object.entries(o))
  const at = str(r.at), by = str(r.by), what = str(r.what)
  if (!at || !by || !what) return null
  return {
    id, at, by, kind: EXCEPTION_KINDS.find((k) => k === r.kind) ?? 'other',
    ...(str(r.problem) && { problem: str(r.problem) }), ...(str(r.attempt) && { attempt: str(r.attempt) }),
    what, ...(str(r.instead) && { instead: str(r.instead) }), ...(str(r.rule) && { rule: str(r.rule) }),
  }
}

/** 새것부터 */
export function listExceptions(wb: Workbench): FlowException[] {
  const dir = dirOf(wb)
  if (!fs.existsSync(dir)) return []
  const out: FlowException[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.yaml') || f.startsWith('.')) continue
    const e = parse(f.slice(0, -5), fs.readFileSync(path.join(dir, f), 'utf8'))
    if (e) out.push(e)
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
}

function write(wb: Workbench, e: Omit<FlowException, 'id'>): FlowException {
  const id = `${stamp('compact')}-${crypto.randomBytes(3).toString('hex')}`
  const { at, by, kind, problem, attempt, what, instead, rule } = e
  writeAtomic(path.join(dirOf(wb), `${id}.yaml`), YAML.stringify({
    format: FORMAT, at, by, kind, ...(rule && { rule }), ...(problem && { problem }), ...(attempt && { attempt }), what, ...(instead && { instead }),
  }, { lineWidth: 0 }))
  return { id, ...e }
}

/** 사용자나 에이전트가 적는 한 줄 */
export function addException(wb: Workbench, body: NewExceptionBody, actor: string): FlowException {
  const problem = body.problem?.trim(), attempt = body.attempt?.trim().toLowerCase(), instead = body.instead?.trim()
  if (problem && !fs.existsSync(path.join(wb.root, 'problems', problem, 'problem.yaml'))) throw new WorkbenchError(400, t(`없는 흐름입니다: ${problem}`, `No such flow: ${problem}`))
  return write(wb, { at: stamp('t'), by: actor, kind: body.kind, ...(problem && { problem }), ...(problem && attempt && { attempt }), what: body.what, ...(instead && { instead }) })
}

/**
 * 앱이 규칙으로 거절한 일을 적는다. 같은 쪽이 같은 날 같은 자리에서 같은 규칙에 다시 걸린 것은 한 번만 적는다(다시 해 보는 것이 줄을 늘리지 않게).
 * 거절을 알리는 길을 막지 않도록 적다 난 오류는 삼킨다
 */
export function logRefusal(wb: Workbench, actor: string, where: { problem?: string; attempt?: string }, rule: string, what: string): void {
  try {
    const today = localDate()
    const dup = listExceptions(wb).some((e) => e.kind === 'refused' && e.rule === rule && e.by === actor && e.problem === where.problem && e.attempt === where.attempt && e.at.startsWith(today))
    if (!dup) write(wb, { at: stamp('t'), by: actor, kind: 'refused', rule, ...(where.problem && { problem: where.problem }), ...(where.attempt && { attempt: where.attempt }), what })
  } catch { /* 기록하지 못해도 거절은 그대로 알린다 */ }
}
