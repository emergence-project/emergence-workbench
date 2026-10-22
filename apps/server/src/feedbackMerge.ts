import YAML from 'yaml'
import { mergeJournalText } from '@rw/core'

/**
 * 두 컴퓨터가 같은 피드백 파일을 따로 고쳤을 때의 세 갈래 합치기 (10/22 "두 맥 동기화와 충돌 대비").
 * 줄 단위 합치기(git merge-file · git merge)는 같은 날짜 파일 끝에 양쪽이 덧붙인 항목을 부딪힘으로 보고 멈춘다.
 * - 날짜 파일(YYYY-MM-DD.md): "## 시각 · 유형 · 부위" 항목 단위 (일지와 같은 규칙, mergeJournalText)
 * - reviews.yaml · status.yaml · handoff.yaml: 맨 위 키(피드백 항목) 단위, 같은 키를 양쪽이 고쳤으면 칸 단위.
 *   목록 칸(comments · replies · revised)은 양쪽이 더한 것을 모두 둔다. 같은 칸을 서로 다르게 고쳤으면 null(사람이 합친다).
 *   handoff.yaml은 같은 항목을 양쪽이 맡았으면 먼저 맡은 쪽(at이 이른 쪽)을 둔다.
 * 합칠 수 없는 파일이면 undefined (부르는 쪽이 git의 줄 단위 합치기를 쓴다)
 */
export type TextMerge = (base: string, ours: string, theirs: string) => string | null

export function feedbackMergeFor(file: string): TextMerge | undefined {
  const name = file.split('/').pop() ?? ''
  if (/^\d{4}-\d{2}-\d{2}\.md$/.test(name)) return mergeJournalText
  if (name === 'handoff.yaml') return (b, o, th) => mergeYamlMap(b, o, th, earlierClaim)
  if (name === 'reviews.yaml' || name === 'status.yaml') return (b, o, th) => mergeYamlMap(b, o, th)
  return undefined
}

const CONFLICT = Symbol('conflict')
type Merged = unknown | typeof CONFLICT

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function merge3(b: unknown, o: unknown, th: unknown): Merged {
  if (same(o, th)) return o
  if (same(b, o)) return th
  if (same(b, th)) return o
  if (Array.isArray(o) && Array.isArray(th) && (b === undefined || Array.isArray(b))) {
    const key = (x: unknown) => JSON.stringify(x)
    const base = new Set((b as unknown[] | undefined ?? []).map(key))
    const mine = new Set(o.map(key))
    const theirs = new Set(th.map(key))
    // 양쪽에 남은 것과 이쪽이 더한 것은 이쪽 차례대로, 저쪽이 더한 것은 끝에. 한쪽이 지운 것은 뺀다
    return [...o.filter((x) => theirs.has(key(x)) || !base.has(key(x))), ...th.filter((x) => !mine.has(key(x)) && !base.has(key(x)))]
  }
  if (isMap(o) && isMap(th) && (b === undefined || isMap(b))) {
    const out: Record<string, unknown> = {}
    const bm = (b ?? {}) as Record<string, unknown>
    for (const k of new Set([...Object.keys(o), ...Object.keys(th)])) {
      const v = merge3(bm[k], o[k], th[k])
      if (v === CONFLICT) return CONFLICT
      if (v !== undefined) out[k] = v
    }
    return out
  }
  return CONFLICT
}

/** handoff.yaml: 같은 피드백을 두 컴퓨터가 맡았으면 먼저 맡은 쪽 (같은 때면 컴퓨터 이름 차례) */
function earlierClaim(o: unknown, th: unknown): unknown {
  const at = (v: unknown) => (isMap(v) && typeof v.at === 'string' ? Date.parse(v.at) : NaN)
  const [a, b] = [at(o), at(th)]
  if (Number.isNaN(a)) return th
  if (Number.isNaN(b)) return o
  if (a !== b) return a < b ? o : th
  return String((o as { machine?: unknown }).machine) <= String((th as { machine?: unknown }).machine) ? o : th
}

/**
 * 맨 위가 키 → 값인 YAML 파일을 키 단위로 합친다. 이 컴퓨터의 파일 모양(주석 · 차례)을 두고 바뀐 키만 고친다.
 * resolve: 같은 키를 양쪽이 서로 다르게 고쳤을 때 고를 값 (없으면 칸 단위로 합쳐 보고, 안 되면 null)
 */
export function mergeYamlMap(base: string, ours: string, theirs: string, resolve?: (o: unknown, th: unknown) => unknown): string | null {
  let b: unknown, o: unknown, th: unknown
  try { [b, o, th] = [base, ours, theirs].map((s) => (s.trim() ? YAML.parse(s) : {}) ?? {}) } catch { return null }
  if (!isMap(o) || !isMap(th) || !isMap(b)) return null
  const doc = ours.trim() ? YAML.parseDocument(ours) : new YAML.Document({})
  if (!isMap(doc.toJS())) return null
  for (const k of new Set([...Object.keys(o), ...Object.keys(th)])) {
    let v = merge3(b[k], o[k], th[k])
    if (v === CONFLICT) {
      if (!resolve) return null
      v = resolve(o[k], th[k])
    }
    if (same(v, o[k])) continue
    if (v === undefined) doc.delete(k)
    else doc.set(k, v)
  }
  return doc.toString({ lineWidth: 0 })
}
