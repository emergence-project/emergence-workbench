import YAML from 'yaml'
import { t } from './i18n.js'

export const TASK_STATES = ['working', 'proposed', 'result', 'done', 'paused', 'stopped'] as const
export const TASK_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/
export const TASK_FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
export interface TaskDiagnostic {
  file: string
  code: 'filename' | 'frontmatter' | 'yaml' | 'schema' | 'read'
  message: string
  line: number
  column?: number
}
export interface TaskInspection { front?: Record<string, unknown>; bodyStart: number; diagnostics: TaskDiagnostic[] }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text)
const optionalText = (r: Record<string, unknown>, key: string) => r[key] === undefined || r[key] === null || typeof r[key] === 'string'
const oneOf = (v: unknown, values: readonly string[]): v is string => typeof v === 'string' && values.includes(v)
const valueLabel = (v: unknown): string => {
  if (v === undefined) return t('(없음)', '(missing)')
  if (v === null) return t('(빈 값)', '(empty)')
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return Array.isArray(v) ? t('(목록)', '(list)') : t('(객체)', '(object)')
}

/** 읽기 전용. 화면·STATUS·제출 전 검사가 같은 진단을 쓴다. */
export function inspectTask(file: string, content: string): TaskInspection {
  const diagnostics: TaskDiagnostic[] = []
  const m = TASK_FRONT.exec(content)
  if (!m) return { bodyStart: 0, diagnostics: [{ file, code: 'frontmatter', line: 1, message: t('YAML 머리말이 없습니다. 파일 맨 위를 ---로 감싸세요.', 'No YAML front matter. Wrap the top of the file in ---.') }] }
  const counter = new YAML.LineCounter()
  const doc = YAML.parseDocument(m[1]!, { lineCounter: counter, prettyErrors: false })
  for (const error of doc.errors) {
    const loc = counter.linePos(error.pos[0])
    diagnostics.push({ file, code: 'yaml', line: loc.line + 1, column: loc.col, message: t(`YAML 오류: ${error.message.split('\n')[0]}`, `YAML error: ${error.message.split('\n')[0]}`) })
  }
  if (diagnostics.length) return { bodyStart: m[0].length, diagnostics }
  let data: unknown
  try { data = doc.toJSON() } catch (e) {
    return { bodyStart: m[0].length, diagnostics: [{ file, code: 'yaml', line: 2, message: t(`YAML 오류: ${(e as Error).message}`, `YAML error: ${(e as Error).message}`) }] }
  }
  if (!record(data)) return { bodyStart: m[0].length, diagnostics: [{ file, code: 'schema', line: 2, message: t('머리말은 칸 이름과 값으로 적어야 합니다.', 'Front matter must be written as field names and values.') }] }
  const issue = (key: string, message: string) => {
    const pair = YAML.isMap(doc.contents) ? doc.contents.items.find((p) => YAML.isScalar(p.key) && p.key.value === key) : undefined
    const pos = YAML.isScalar(pair?.key) ? pair.key.range?.[0] : undefined
    diagnostics.push({ file, code: 'schema', line: pos === undefined ? 2 : counter.linePos(pos).line + 1, message })
  }
  for (const key of ['title', 'task']) if (!text(data[key])) issue(key, t(`${key}: 비어 있지 않은 글이 필요합니다.`, `${key}: non-empty text is required.`))
  if (!oneOf(data.state, TASK_STATES)) issue('state', t(`state: ${valueLabel(data.state)} — ${TASK_STATES.join(' · ')} 중 하나로 적으세요.`, `state: ${valueLabel(data.state)}. Use one of ${TASK_STATES.join(' · ')}.`))
  for (const key of ['topic', 'agent', 'created', 'end-condition', 'avoid', 'result-at', 'conclusion']) {
    if (!optionalText(data, key)) issue(key, t(`${key}: 글로 적어야 합니다.`, `${key}: must be text.`))
  }
  if (data['end-check'] !== undefined && !oneOf(data['end-check'], ['pass', 'fail', 'unknown'])) issue('end-check', t('end-check: pass · fail · unknown 중 하나로 적으세요.', 'end-check: use one of pass · fail · unknown.'))
  for (const key of ['references', 'outputs']) if (data[key] !== undefined && !strings(data[key])) issue(key, t(`${key}: 글 목록으로 적어야 합니다.`, `${key}: must be a list of text.`))
  if (data.proposal !== undefined || data.state === 'proposed') {
    const proposal = data.proposal
    if (!record(proposal) || !strings(proposal['end-condition']) || !proposal['end-condition'].length || !optionalText(proposal, 'reason')) {
      issue('proposal', t('proposal: end-condition에 비어 있지 않은 글 목록을 적고, reason은 글로 적으세요.', 'proposal: give end-condition as a non-empty list of text, and reason as text.'))
    }
  }
  const validateList = (key: string, valid: (item: unknown) => boolean, shape: string, max?: number) => {
    const value = data[key]
    if (value === undefined || value === null) return
    if (!Array.isArray(value) || (max !== undefined && value.length > max) || !value.every(valid)) issue(key, `${key}: ${shape}`)
  }
  validateList('ask', (v) => text(v) || (record(v) && text(v.q ?? v.question) && (v.options === undefined || strings(v.options))), t('질문 글 또는 { q, options: [선택지] } 목록을 3개까지 적으세요.', 'Give up to 3 items, each question text or { q, options: [choices] }.'), 3)
  validateList('next', (v) => text(v) || (record(v) && text(v.task) && optionalText(v, 'end-condition') && optionalText(v, 'started') && (v.dropped === undefined || typeof v.dropped === 'boolean')), t('지시 글 또는 { task, end-condition } 목록으로 적으세요.', 'Give a list of instruction text or { task, end-condition }.'))
  validateList('issues', (v) => text(v) || (record(v) && text(v.text) && optionalText(v, 'impact') && (v.next === undefined || (Number.isInteger(v.next) && Number(v.next) > 0))), t('문제 글 또는 { text, impact, next: 번호 } 목록으로 적으세요.', 'Give a list of issue text or { text, impact, next: number }.'))
  validateList('answers', (v) => record(v) && Number.isInteger(v.n) && Number(v.n) > 0 && text(v.answer) && optionalText(v, 'note') && optionalText(v, 'at'), t('{ n: 질문 번호, answer, note, at } 목록으로 적으세요.', 'Give a list of { n: question number, answer, note, at }.'))
  validateList('judged', (v) => record(v) && oneOf(v.verdict, ['approve', 'send-back', 'pause', 'discard']) && optionalText(v, 'note') && optionalText(v, 'at') && (v.seconds === undefined || (Number.isInteger(v.seconds) && Number(v.seconds) >= 0)), t('{ verdict: approve|send-back|pause|discard, note, at, seconds } 목록으로 적으세요.', 'Give a list of { verdict: approve|send-back|pause|discard, note, at, seconds }.'))
  if (data.check !== undefined && (!record(data.check) || !['machine', 'repro', 'human'].every((key) => optionalText(data.check as Record<string, unknown>, key)))) issue('check', t('check: machine · repro · human 칸은 글로 적으세요.', 'check: the machine · repro · human fields must be text.'))
  return { front: data, bodyStart: m[0].length, diagnostics }
}
