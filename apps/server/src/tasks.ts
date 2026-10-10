import fs from 'node:fs'
import path from 'node:path'
import { appPath } from './agentPaths.js'
import { RESEARCH_TARGET, frontMatter } from '@rw/core'
import YAML from 'yaml'
import { hashOf, isBackupCopy, localDate, localTime, writeAtomic } from './fsutil.js'
import { ConflictError, WorkbenchError, type Workbench } from './workbench.js'
import { inspectTask, TASK_ID as ID, TASK_STATES, type TaskDiagnostic, type TaskInspection } from './taskValidation.js'
import { t as tl } from './i18n.js'
import type { z } from 'zod'
import * as C from '@rw/core/contract/tasks'
import type { Task, TaskAnswer, TaskAsk, TaskIssue, TaskJudgment, TaskNext, TaskState, Verdict } from '@rw/core/contract/tasks'

/**
 * 맡긴 일 (작업 탭, 10/7 사용자 결정): 에이전트에게 맡긴 일 하나에 파일 하나, workbench/tasks/<날짜>-<이름>.md.
 * 이 파일이 곧 보고서다. 앱은 맡길 때 머리말을 쓰고, 에이전트는 같은 파일에 결과를 채우고, 사용자의 판단·답은 앱이 머리말에 적는다.
 * 실행은 앱 밖(맥의 Claude Code · Codex)이다. 형식과 규칙의 정본: docs/agent-delegated-work.md
 *
 *   ---
 *   title: V 상 유한온도 순서          # 작업 이름 = 보고서 제목
 *   topic: v-phase                     # 주제 id (선택)
 *   agent: claude-code                 # claude-code · codex (다른 이름도 그대로 보인다)
 *   created: 2026-10-05 09:10
 *   state: result                      # working 진행 · proposed 종결 조건 제안 · result 판단 대기 · done 해결 · paused 멈춤 · stopped 폐기
 *   task: 5색 정리의 반례 후보 지도 검사
 *   end-condition: L=16·24·32에서 η·helicity로 판정, 시작 배치 3개 일치   # 비면 에이전트가 proposal부터
 *   references: [workbench/notes/v-phase/note.md]
 *   avoid: 연구노트 본문은 고치지 않는다
 *   # ↓ 에이전트가 결과와 함께 채운다
 *   result-at: 2026-10-06 12:59
 *   conclusion: J_Γ/J_PD가 0.01을 넘으면 V 상의 대수 구간이 닫힌다.
 *   end-check: pass                    # pass 통과 · fail 미달 · unknown 확인 못 함
 *   ask:                               # 사용자 확인 요청 (질문, 3개까지). options가 없으면 예/아니요
 *     - 이 결론을 연구노트 "V 상"에 반영할까요?
 *     - { q: 반영한다면 어디에 넣을까요?, options: [결론 절, 새 절, 부록] }
 *   issues:                            # 남은 문제 (결론을 바꿀 수 있는 것부터)
 *     - { text: L=48을 계산하지 않아 0.01의 오차가 크다, impact: 결론의 숫자를 바꿀 수 있음, next: 1 }
 *   next:                              # 다음 지시 제안 (번호는 1부터)
 *     - { task: L=48 한 점만 더 계산한다, end-condition: 닫히는 값의 오차 ±0.001 이하 }
 *   outputs: [data-space/verification/261005-v-clock/results.csv]
 *   check: { machine: 수치 대조 통과 (test_v_clock.py) · 2026-10-05 }
 *   proposal: { end-condition: [..], reason: .. }   # state: proposed일 때
 *   # ↓ 앱이 쓴다
 *   answers: [{ n: 1, answer: 예, note: .., at: 2026-10-07 10:00 }]
 *   judged: [{ at: 2026-10-07 10:05, verdict: send-back, note: .., seconds: 240 }]
 *   ---
 *   ## 요약과 결론
 *   (쉬운 말 풀이)
 *   ## 근거
 *   (방법, 그림, 산출물)
 */

export type { TaskDiagnostic } from './taskValidation.js'
export type { Task, TaskAnswer, TaskAsk, TaskIssue, TaskJudgment, TaskNext, TaskState, Verdict } from '@rw/core/contract/tasks'

export const TASKS_DIR = 'tasks'
export { TASK_STATES } from './taskValidation.js'
export const VERDICTS = C.VERDICTS
export const AGENTS = ['claude-code', 'codex'] as const

const TITLE_MAX = 80

const text = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return stamp(v)
  return undefined
}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v])
const strings = (v: unknown) => list(v).map(text).filter((s): s is string => !!s)
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined)
/** 로컬 시각 "YYYY-MM-DD HH:MM" */
export const stamp = (d = new Date()) => `${localDate(d)} ${localTime(d)}`

function parseAsk(v: unknown): TaskAsk | null {
  if (typeof v === 'string') return v.trim() ? { q: v.trim(), options: [] } : null
  const r = rec(v)
  const q = text(r.q ?? r.question)
  return q ? { q, options: strings(r.options) } : null
}

function parseIssue(v: unknown): TaskIssue | null {
  if (typeof v === 'string') return v.trim() ? { text: v.trim() } : null
  const r = rec(v)
  const t = text(r.text)
  if (!t) return null
  const impact = text(r.impact)
  const next = int(r.next)
  return { text: t, ...(impact ? { impact } : {}), ...(next ? { next } : {}) }
}

function parseNext(v: unknown): TaskNext | null {
  if (typeof v === 'string') return v.trim() ? { task: v.trim() } : null
  const r = rec(v)
  const t = text(r.task)
  if (!t) return null
  const endCondition = text(r['end-condition'])
  const started = text(r.started)
  return { task: t, ...(endCondition ? { endCondition } : {}), ...(started ? { started } : {}), ...(r.dropped === true ? { dropped: true } : {}) }
}

function parseAnswer(v: unknown): TaskAnswer | null {
  const r = rec(v)
  const n = int(r.n)
  const answer = text(r.answer)
  if (!n || !answer) return null
  const note = text(r.note)
  return { n, answer, ...(note ? { note } : {}), at: text(r.at) ?? '' }
}

function parseJudgment(v: unknown): TaskJudgment | null {
  const r = rec(v)
  const verdict = text(r.verdict)
  if (!verdict || !(VERDICTS as readonly string[]).includes(verdict)) return null
  const note = text(r.note)
  const seconds = int(r.seconds)
  return { at: text(r.at) ?? '', verdict: verdict as Verdict, ...(note ? { note } : {}), ...(seconds ? { seconds } : {}) }
}

const nonNull = <T>(x: T | null): x is T => x !== null

/** 유효한 작업만 읽는다. 잘못된 파일은 scanTasks의 진단에 남기고 원문은 그대로 둔다. */
export function parseTask(id: string, file: string, content: string, mtime = 0): Task | null {
  return taskFromInspection(id, file, content, mtime, inspectTask(file, content))
}

function taskFromInspection(id: string, file: string, content: string, mtime: number, inspection: TaskInspection): Task | null {
  if (inspection.diagnostics.length || !inspection.front) return null
  const fm = inspection.front
  const title = text(fm.title)!
  const state = fm.state as TaskState
  const ec = text(fm['end-check'])
  const check = rec(fm.check)
  const proposal = rec(fm.proposal)
  const proposed = strings(proposal['end-condition'])
  const optional = <K extends string>(k: K, v: string | undefined) => (v ? { [k]: v } as Record<K, string> : {})
  return {
    id, file, title,
    ...optional('topic', text(fm.topic)),
    agent: text(fm.agent) ?? '',
    created: text(fm.created) ?? '',
    state,
    task: text(fm.task) ?? '',
    ...optional('endCondition', text(fm['end-condition'])),
    references: strings(fm.references),
    ...optional('avoid', text(fm.avoid)),
    ...optional('resultAt', text(fm['result-at'])),
    ...optional('conclusion', text(fm.conclusion)),
    ...(ec === 'pass' || ec === 'fail' || ec === 'unknown' ? { endCheck: ec } : {}),
    asks: list(fm.ask).map(parseAsk).filter(nonNull),
    issues: list(fm.issues).map(parseIssue).filter(nonNull),
    next: list(fm.next).map(parseNext).filter(nonNull),
    outputs: strings(fm.outputs),
    check: { ...optional('machine', text(check.machine)), ...optional('repro', text(check.repro)), ...optional('human', text(check.human)) },
    ...(proposed.length ? { proposal: { endCondition: proposed, ...optional('reason', text(proposal.reason)) } } : {}),
    answers: list(fm.answers).map(parseAnswer).filter(nonNull),
    judged: list(fm.judged).map(parseJudgment).filter(nonNull),
    body: content.slice(inspection.bodyStart),
    hash: hashOf(content),
    mtime,
  }
}

const tasksDir = (wb: Workbench) => path.join(wb.root, TASKS_DIR)
const repoRel = (wb: Workbench, id: string) => path.posix.join(path.basename(wb.root), TASKS_DIR, `${id}.md`)

function taskPath(wb: Workbench, id: string): string {
  if (!ID.test(id)) throw new WorkbenchError(400, tl(`작업 id가 아님: ${id}`, `Not a task id: ${id}`))
  return path.join(tasksDir(wb), `${id}.md`)
}

export interface TaskScan { tasks: Task[]; diagnostics: TaskDiagnostic[] }

/** 잘못되거나 읽지 못한 파일도 파일·줄·이유로 남긴다. 하나의 읽기 실패가 다른 작업을 숨기지 않는다. */
export function scanTasks(wb: Workbench): TaskScan {
  const dir = tasksDir(wb)
  const out: TaskScan = { tasks: [], diagnostics: [] }
  let names: string[]
  try { names = fs.readdirSync(dir) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') out.diagnostics.push({ file: path.posix.join(path.basename(wb.root), TASKS_DIR), code: 'read', line: 1, message: tl(`폴더를 읽지 못했습니다: ${(e as Error).message}`, `Could not read the folder: ${(e as Error).message}`) })
    return out
  }
  for (const n of names.sort()) {
    if (!n.endsWith('.md') || n.startsWith('.')) continue
    const id = n.slice(0, -3)
    const file = repoRel(wb, id)
    if (isBackupCopy(n)) { out.diagnostics.push({ file, code: 'filename', line: 1, message: tl('백업 동기화가 남긴 GitHub 쪽 사본입니다. 원본과 견주어 합친 뒤 이 파일을 지우세요.', 'A GitHub-side copy left by backup sync. Compare it with the original, merge, then delete this file.') }); continue }
    if (!ID.test(id)) { out.diagnostics.push({ file, code: 'filename', line: 1, message: tl('파일 이름은 YYYY-MM-DD-영문이름.md로 적으세요.', 'Name the file YYYY-MM-DD-name.md (name in English letters).') }); continue }
    const p = path.join(dir, n)
    try {
      const st = fs.lstatSync(p)
      if (!st.isFile()) { out.diagnostics.push({ file, code: 'read', line: 1, message: tl('일반 작업 파일이 아닙니다. 링크·폴더는 읽지 않습니다.', 'Not a regular task file. Links and folders are not read.') }); continue }
      const content = fs.readFileSync(p, 'utf8')
      const inspection = inspectTask(file, content)
      out.diagnostics.push(...inspection.diagnostics)
      const t = taskFromInspection(id, file, content, st.mtimeMs, inspection)
      if (t) out.tasks.push(t)
    } catch (e) { out.diagnostics.push({ file, code: 'read', line: 1, message: tl(`파일을 읽지 못했습니다: ${(e as Error).message}`, `Could not read the file: ${(e as Error).message}`) }) }
  }
  out.tasks.sort((a, b) => (b.created || b.id).localeCompare(a.created || a.id) || b.id.localeCompare(a.id))
  return out
}

/** 맡긴 일 전부. 최근에 맡긴 것부터. 진단이 필요한 목록은 scanTasks를 쓴다. */
export function listTasks(wb: Workbench): Task[] { return scanTasks(wb).tasks }

export function readTask(wb: Workbench, id: string): Task {
  const p = taskPath(wb, id)
  if (!fs.existsSync(p) || !fs.lstatSync(p).isFile()) throw new WorkbenchError(404, tl(`맡긴 일이 없음: ${id}`, `No such delegated task: ${id}`))
  const file = repoRel(wb, id)
  const content = fs.readFileSync(p, 'utf8')
  const inspection = inspectTask(file, content)
  const t = taskFromInspection(id, file, content, fs.statSync(p).mtimeMs, inspection)
  if (!t) throw new WorkbenchError(422, inspection.diagnostics.map((d) => `${d.file}:${d.line} — ${d.message}`).join('\n'))
  return t
}

/** 제목에서 파일 이름: 영문·숫자 낱말 다섯까지, 없으면 task. 같은 이름이 있으면 -2, -3 … */
export function taskIdFor(wb: Workbench, title: string, date = localDate()): string {
  const words = title.toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, ' ').match(/[a-z0-9]+/g) ?? []
  const base = `${date}-${words.slice(0, 5).join('-').slice(0, 50).replace(/-+$/, '') || 'task'}`
  let id = base
  for (let n = 2; fs.existsSync(path.join(tasksDir(wb), `${id}.md`)); n++) id = `${base}-${n}`
  return id
}

/** 맡기기 요청 (모양은 라우트가 계약으로 검사한 뒤) */
export type NewTask = z.output<typeof C.NewTaskBody>
type Judge = z.output<typeof C.JudgeBody>
type Answer = z.output<typeof C.AnswerBody>
type Next = z.output<typeof C.NextBody>

const BODY_HINT = '<!-- 결과는 머리말(result-at · conclusion · end-check · ask · issues · next · outputs · check)과 아래 두 절에 적는다. 규칙: research-workspace/docs/agent-delegated-work.md -->\n\n## 요약과 결론\n\n## 근거\n'

/** 맡기기: 파일을 새로 만든다. 종결 조건이 비면 에이전트가 먼저 제안한다(state는 working, end-condition 없음) */
export function createTask(wb: Workbench, input: NewTask, now = new Date()): Task {
  const title = input.title.replace(/\s+/g, ' ').trim()
  if (!title) throw new WorkbenchError(400, tl('제목이 필요함', 'A title is required'))
  if ([...title].length > TITLE_MAX) throw new WorkbenchError(400, tl(`제목은 ${TITLE_MAX}자까지`, `Titles are up to ${TITLE_MAX} characters`))
  const task = input.task.trim()
  if (!task) throw new WorkbenchError(400, tl('작업 내용이 필요함', 'The task description is required'))
  const one = (v: string | null | undefined) => v?.trim() || undefined
  const agent = one(input.agent) ?? 'claude-code'
  const topic = one(input.topic)
  if (topic && !/^[a-z0-9][a-z0-9-]*$/.test(topic)) throw new WorkbenchError(400, tl(`주제 id가 아님: ${topic}`, `Not a topic id: ${topic}`))
  const references = (input.references ?? []).map((r) => r.trim()).filter(Boolean)
  const fm: Record<string, unknown> = {
    title,
    ...(topic ? { topic } : {}),
    agent,
    created: stamp(now),
    state: 'working',
    task,
  }
  const end = one(input.endCondition)
  if (end) fm['end-condition'] = end
  if (references.length) fm.references = references
  const avoid = one(input.avoid)
  if (avoid) fm.avoid = avoid
  const id = taskIdFor(wb, title, localDate(now))
  const content = `---\n${YAML.stringify(fm, { lineWidth: 0 })}---\n\n${BODY_HINT}`
  writeAtomic(taskPath(wb, id), content)
  return readTask(wb, id)
}

/** 읽은 뒤 바뀐 파일은 고치지 않는다 (에이전트가 쓰는 중일 수 있다) */
function checkHash(t: Task, baseHash: string) {
  if (baseHash !== t.hash) {
    throw new ConflictError(tl('그새 파일이 바뀌었습니다. 다시 읽은 뒤 고치세요', 'The file changed in the meantime. Read it again, then edit'), t.hash)
  }
}

/** 머리말만 고친다: 본문과 머리말의 다른 칸·주석은 그대로 */
function editFront(wb: Workbench, t: Task, edit: (doc: YAML.Document) => void): Task {
  const p = taskPath(wb, t.id)
  const content = fs.readFileSync(p, 'utf8')
  const { yaml, body, eol } = frontMatter(content)!
  const doc = YAML.parseDocument(yaml)
  edit(doc)
  const front = doc.toString({ lineWidth: 0 }).replace(/\n$/, '').split('\n').join(eol)
  writeAtomic(p, `---${eol}${front}${eol}---${eol}${body}`)
  return readTask(wb, t.id)
}

const appendTo = (doc: YAML.Document, key: string, item: Record<string, unknown>) => {
  const seq = doc.get(key)
  if (YAML.isSeq(seq)) seq.add(doc.createNode(item, { flow: true }))
  else doc.set(key, doc.createNode([item], { flow: false }))
}

const VERDICT_LABEL: Record<Verdict, string> = { approve: '승인', 'send-back': '수정 요청', pause: '멈춤', discard: '폐기' }

const minutes = (s?: number) => (s === undefined ? '' : s < 60 ? ` · ${s}초` : ` · ${Math.round(s / 60)}분`)

/**
 * 판단 (승인 · 수정 요청 · 멈춤 · 폐기). 판단 결과는 노트 상태 이름을 그대로 쓴다(10/7):
 * - 결과(result)를 승인 → done(해결), check.human에 "승인 · 날짜"
 * - 종결 조건 제안(proposed)을 승인 → 제안을 end-condition으로 옮기고 working(진행): 에이전트가 시작한다
 * - 수정 요청 → working, 고칠 것 한 줄(note)이 필요하다
 * - 멈춤 → paused, 폐기 → stopped
 * 판단에 쓴 시간(seconds, 화면이 잰다)과 함께 그날 일지에 상태 한 줄을 남긴다.
 */
export function judgeTask(wb: Workbench, id: string, body: Judge, now = new Date()): Task {
  const t = readTask(wb, id)
  checkHash(t, body.baseHash)
  const verdict = body.verdict
  const note = body.note?.replace(/\s+/g, ' ').trim() ?? ''
  if (verdict === 'send-back' && !note) throw new WorkbenchError(400, tl('무엇을 고칠지 한 줄이 필요함', 'Write one line on what to change'))
  if (verdict === 'approve' && t.state !== 'result' && t.state !== 'proposed') throw new WorkbenchError(409, tl('판단 대기나 종결 조건 제안만 승인할 수 있음', 'Only tasks awaiting decision or proposed completion criteria can be approved'))
  const seconds = body.seconds === undefined ? undefined : Math.round(body.seconds)
  const at = stamp(now)
  const after = editFront(wb, t, (doc) => {
    if (verdict === 'approve' && t.state === 'proposed') {
      // 고쳐서 승인: 사용자가 고친 종결 조건이 오면 제안 대신 그것을 쓴다
      const edited = body.endCondition?.trim() ?? ''
      const conds = t.proposal!.endCondition
      doc.set('end-condition', edited || (conds.length === 1 ? conds[0] : conds.map((c, i) => `${i + 1}) ${c}`).join(' ')))
      doc.delete('proposal')
      doc.set('state', 'working')
    } else if (verdict === 'approve') {
      doc.set('state', 'done')
      doc.setIn(['check', 'human'], `승인 · ${at}`)
    } else {
      doc.set('state', verdict === 'send-back' ? 'working' : verdict === 'pause' ? 'paused' : 'stopped')
    }
    appendTo(doc, 'judged', { at, verdict, ...(note ? { note } : {}), ...(seconds !== undefined ? { seconds } : {}) })
  })
  const what = t.state === 'proposed' && verdict === 'approve' ? '종결 조건 승인' : VERDICT_LABEL[verdict]
  wb.appendJournal({ date: localDate(now), time: localTime(now), kind: 'status', target: RESEARCH_TARGET, text: `판단 · ${t.title} · ${what}${minutes(seconds)}${note ? ` · ${note}` : ''}` })
  return after
}

/** 사용자 확인 요청에 답하기: n번(1부터) 요청에 고른 답과 덧붙일 말. 같은 번호에 다시 답하면 새 답이 앞의 답을 대신한다 */
export function answerTask(wb: Workbench, id: string, body: Answer, now = new Date()): Task {
  const t = readTask(wb, id)
  checkHash(t, body.baseHash)
  const n = body.n
  if (n > t.asks.length) throw new WorkbenchError(400, tl(`없는 확인 요청: ${String(body.n)}`, `No such review request: ${String(body.n)}`))
  const answer = body.answer.trim()
  if (!answer) throw new WorkbenchError(400, tl('답이 필요함', 'An answer is required'))
  const note = body.note?.replace(/\s+/g, ' ').trim() ?? ''
  return editFront(wb, t, (doc) => {
    const seq = doc.get('answers')
    if (YAML.isSeq(seq)) seq.items = seq.items.filter((it) => !(YAML.isMap(it) && Number(it.get('n')) === n))
    appendTo(doc, 'answers', { n, answer, ...(note ? { note } : {}), at: stamp(now) })
  })
}

/**
 * 다음 지시 (보고서 4절): i번(1부터) 제안을
 * - start: 새 작업 파일로 맡긴다(edit가 있으면 고친 칸으로). 이 보고서가 참고 자료로 붙고, 제안 줄에 started: <새 id>
 * - drop: 목록에서 뺀다(dropped: true), restore: 되살린다
 */
export function nextTask(wb: Workbench, id: string, body: Next, now = new Date()): { task: Task; started?: Task } {
  const t = readTask(wb, id)
  checkHash(t, body.baseHash)
  const i = body.i
  const item = t.next[i - 1]
  if (!item) throw new WorkbenchError(400, tl(`없는 다음 지시: ${String(body.i)}`, `No such next instruction: ${String(body.i)}`))
  const setItem = (doc: YAML.Document, key: string, value: unknown) => {
    const seq = doc.get('next')
    const node = YAML.isSeq(seq) ? seq.items[i - 1] : undefined
    if (YAML.isMap(node)) { if (value === undefined) node.delete(key); else node.set(key, value) }
    else if (YAML.isSeq(seq)) {
      seq.items[i - 1] = doc.createNode({ task: item.task, ...(value === undefined ? {} : { [key]: value }) }, { flow: true }) as never
    }
  }
  if (body.action === 'drop' || body.action === 'restore') {
    if (item.started) throw new WorkbenchError(409, tl('이미 맡긴 제안', 'This proposal is already delegated'))
    return { task: editFront(wb, t, (doc) => setItem(doc, 'dropped', body.action === 'drop' ? true : undefined)) }
  }
  if (item.started) throw new WorkbenchError(409, tl('이미 맡긴 제안', 'This proposal is already delegated'))
  const edit = body.edit ?? {}
  const started = createTask(wb, {
    title: edit.title ?? item.task,
    topic: edit.topic ?? t.topic,
    agent: edit.agent ?? (t.agent || undefined),
    task: edit.task ?? item.task,
    endCondition: edit.endCondition ?? item.endCondition,
    references: edit.references ?? [t.file],
    avoid: edit.avoid ?? t.avoid,
  }, now)
  const task = editFront(wb, t, (doc) => { setItem(doc, 'dropped', undefined); setItem(doc, 'started', started.id) })
  return { task, started }
}

/** 규칙 문서: 이 앱 저장소의 docs/agent-delegated-work.md (STATUS.md 맨 위 한 줄이 가리킨다). 집 폴더는 ~로 줄인다 */
export const RULES_DOC = appPath('docs/agent-delegated-work.md')

/** STATUS.md의 "맡긴 일" 절: 끝나지 않은 일과 에이전트가 할 것 */
export function statusSection(wb: Workbench): string[] {
  const scan = scanTasks(wb)
  const out = scan.diagnostics.length ? [`## 작업 파일 오류 ${scan.diagnostics.length}`, '', '> 이 파일들은 작업 상태를 읽지 못했습니다. 원문을 고친 뒤 agent:check-tasks로 다시 검사하세요.', ...scan.diagnostics.map((d) => `- \`${d.file}:${d.line}${d.column ? `:${d.column}` : ''}\` — ${d.message}`), ''] : []
  const open = scan.tasks.filter((t) => t.state !== 'done' && t.state !== 'stopped')
  if (!open.length) return out
  out.push(`## 맡긴 일 ${open.length}`, '',
    '> 사용자가 앱 작업 탭에서 맡긴 일. 파일 하나가 일 하나이자 보고서다. 결과는 같은 파일 머리말과 본문에 채운다(형식은 맨 위 규칙 문서).',
    '> state: working = 할 차례(end-condition이 비었으면 proposal부터 적고 state: proposed), result = 사용자 판단 대기, paused = 멈춤. judged의 마지막 note가 수정 요청이면 그것부터 고친다.', '')
  const label: Record<TaskState, string> = { working: '진행', proposed: '종결 조건 승인 대기', result: '판단 대기', done: '해결', paused: '멈춤', stopped: '폐기' }
  for (const t of open) {
    const last = t.judged[t.judged.length - 1]
    const todo = t.state === 'working' && !t.endCondition ? '종결 조건부터 제안' : t.state === 'working' && last?.verdict === 'send-back' ? `수정 요청: ${last.note ?? ''}` : ''
    out.push(`- \`${t.file}\` · ${label[t.state]} · ${t.title}${t.agent ? ` · ${t.agent}` : ''}${todo ? ` — ${todo}` : ''}`)
    const answered = t.answers.length ? t.answers.map((a) => `${a.n}번 ${a.answer}${a.note ? ` (${a.note})` : ''}`).join(', ') : ''
    if (answered) out.push(`  - 사용자 답: ${answered}`)
  }
  out.push('')
  return out
}
