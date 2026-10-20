// 흐름의 빈틈과 해결 문턱 (10/20 사용자 결정, docs/repo-format.md §14 "빈틈" · "해결 문턱").
// 빈틈은 앱이 계산해 화면 · STATUS · MCP가 같은 것을 본다. 문턱은 점이 끝남으로 넘어갈 때만 검사한다(옛 점은 빈틈으로만 보인다).
import fs from 'node:fs'
import path from 'node:path'
import { FLOW_REQUIRED, type FlowGap, type FlowNode } from '@rw/core/contract/flow'
import { hashOf, isInside } from './fsutil.js'
import { t as tl } from './i18n.js'

/** 설명 칸 이름 (문턱 · 빈틈 글에 쓴다) */
export const FIELD_NAME: Record<string, () => string> = {
  question: () => tl('물음', 'question'), motivation: () => tl('동기', 'motivation'), guess: () => tl('예상 답', 'expected answer'), criterion: () => tl('판정 기준', 'criterion'),
  statement: () => tl('진술', 'statement'), condition: () => tl('조건', 'conditions'), goal: () => tl('목적', 'goal'), setup: () => tl('설정', 'setup'),
  method: () => tl('방법', 'method'), result: () => tl('결과', 'result'), interpretation: () => tl('해석', 'interpretation'), assumptions: () => tl('가정', 'assumptions'),
  reading: () => tl('문헌', 'reading'), gain: () => tl('얻은 것', 'what it gave'), use: () => tl('쓰는 곳', 'where it is used'),
}
const fieldName = (f: string) => FIELD_NAME[f]?.() ?? f

/** 제목 줄의 수준 (Markdown #, TeX \section 계열). 제목이 아니면 0 */
function headingOf(line: string): { level: number; name: string } | null {
  const md = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
  if (md) return { level: md[1]!.length, name: md[2]! }
  const tex = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{(.*)\}\s*$/.exec(line)
  if (tex) return { level: ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph'].indexOf(tex[1]!) + 1, name: tex[2]! }
  return null
}
const norm = (s: string) => s.replace(/[`*_$\\{}]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * 근거의 지금 내용 해시: 절 이름이 있으면 그 절(다음 같은 수준 이하의 제목 전까지), 없으면 파일 전체.
 * 파일이 없으면 'missing', 절이 없으면 'no-section'
 */
export function evidenceHash(repo: string, file: string, section?: string): string | 'missing' | 'no-section' {
  const p = path.join(repo, file)
  if (!isInside(repo, p)) return 'missing'
  let text: string
  try { text = fs.readFileSync(p, 'utf8') } catch { return 'missing' }
  if (!section) return hashOf(text)
  const lines = text.split('\n')
  const want = norm(section)
  const at = lines.findIndex((l) => { const h = headingOf(l); return !!h && norm(h.name) === want })
  if (at < 0) return 'no-section'
  const level = headingOf(lines[at]!)!.level
  let end = lines.length
  for (let i = at + 1; i < lines.length; i++) { const h = headingOf(lines[i]!); if (h && h.level <= level) { end = i; break } }
  return hashOf(lines.slice(at, end).join('\n'))
}
/** 단계의 내용 해시 (글 · 쓰는 것) */
export const stepHash = (s: { text: string; uses?: string }) => hashOf(`${s.text}\n${s.uses ?? ''}`)

/** 그 역할의 지금 확인 (마지막 기록이 거둔 것도 낡은 것도 아니면) */
export const confirmed = (x: { checks: FlowNode['evidence'][number]['checks']; stale?: boolean }, role: 'agent' | 'human') => {
  const c = x.checks.filter((y) => y.role === role).pop()
  return !!c && !c.revoked && !x.stale
}

/** 근거 · 단계의 낡은 확인 표시 (마지막 확인의 hash가 지금 내용과 다르면) */
export function markStale(repo: string, n: FlowNode): void {
  for (const e of n.evidence) {
    const last = [...e.checks].reverse().find((c) => !c.revoked && c.hash)
    if (!last || !e.file) continue
    const now = evidenceHash(repo, e.file, e.section)
    if (now !== last.hash) e.stale = true
  }
  for (const s of n.steps) {
    const last = [...s.checks].reverse().find((c) => !c.revoked && c.hash)
    if (last && last.hash !== stepHash(s)) s.stale = true
  }
}

const ACTS = new Set<FlowNode['kind']>(['calc', 'analytic', 'proof'])
const isSolved = (n: FlowNode) => n.progress === 'done' && (n.result ?? 'solved') === 'solved'
/** 누가 확인한 근거가 하나라도 있는 발견 (정리 포함) */
const checkedFinding = (n: FlowNode) => n.theorem || n.evidence.some((e) => confirmed(e, 'agent') || confirmed(e, 'human'))

/** 점마다 빈틈. nodes는 한 흐름의 점 전부 (선을 따라 보려고) */
export function computeGaps(repo: string, nodes: FlowNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const hasNext = new Set(nodes.flatMap((n) => n.from.map((f) => f.id)))
  for (const n of nodes) {
    const gaps: FlowGap[] = []
    const add = (code: FlowGap['code'], ko: string, en: string) => gaps.push({ code, text: tl(ko, en) })
    if (isSolved(n) && n.kind !== 'question' && !n.evidence.length && !(n.kind === 'finding' && n.from.some((f) => f.type === 'support'))) add('no-evidence', '해결인데 근거가 없다', 'solved without evidence')
    for (const f of n.from) {
      const m = byId.get(f.id)
      if (m && m.kind === 'finding' && (f.type === 'support' || f.type === 'use') && !checkedFinding(m)) add('unverified-base', `검토 안 된 발견 "${m.short}" 위에 쌓았다`, `built on the unreviewed finding "${m.short}"`)
    }
    if (n.progress === 'done' && ACTS.has(n.kind) && !n.fields.result) add('no-result', '끝났는데 결과 칸이 비었다', 'finished with an empty result')
    if ((n.progress === 'paused' || (n.progress === 'done' && (n.result === 'refuted' || n.result === 'dropped'))) && !n.reason) add('no-reason', '반증 · 폐기 · 멈춤의 이유가 없다', 'no reason for refuting, dropping or pausing')
    if (n.progress !== 'done' && (n.kind === 'question' || n.kind === 'calc') && !n.fields.criterion) add('no-criterion', '판정 기준이 없다 (무엇이 나오면 해결 · 반증인가)', 'no criterion (what result solves or refutes it)')
    if (isSolved(n) && !hasNext.has(n.id) && !n.end && !n.next) add('no-next', '다음 할 일도, 뒤따른 점도, 갈래 종결도 없다', 'no next step, no following dot and no branch end')
    for (const e of n.evidence) {
      if (!e.file) continue
      const h = evidenceHash(repo, e.file, e.section)
      if (h === 'missing') add('missing-file', `근거 파일이 없다: ${e.file}`, `evidence file missing: ${e.file}`)
      else if (h === 'no-section') add('missing-file', `근거 절이 없다: ${e.file} › ${e.section}`, `evidence section missing: ${e.file} › ${e.section}`)
      else if (e.stale) add('changed-evidence', `확인한 뒤 근거가 바뀌었다: ${e.title ?? e.file}`, `evidence changed after it was checked: ${e.title ?? e.file}`)
    }
    const open = n.steps.map((s, i) => [s, i + 1] as const).filter(([s]) => !s.uses || !(confirmed(s, 'agent') || confirmed(s, 'human')))
    if (open.length) add('step-gap', `확인 안 된 단계 ${open.map(([, i]) => i).join(', ')} / ${n.steps.length}`, `unchecked steps ${open.map(([, i]) => i).join(', ')} of ${n.steps.length}`)
    n.gaps = gaps
  }
}

/**
 * 해결 문턱: 점이 이번 저장으로 끝남(해결 · 반증 · 폐기)이나 멈춤으로 넘어갈 때 모자란 것. 비면 통과.
 * 미해결 · 진행은 빈 칸이 있어도 저장된다 (일하는 중이니까)
 */
export function flowGate(n: FlowNode, before?: Pick<FlowNode, 'progress' | 'result'>): string[] {
  const moved = !before || before.progress !== n.progress || (n.progress === 'done' && (before.result ?? 'solved') !== (n.result ?? 'solved'))
  if (!moved) return []
  const miss: string[] = []
  if (n.progress === 'paused' || (n.progress === 'done' && n.result !== undefined && n.result !== 'solved')) {
    if (!n.reason) miss.push(tl('이유', 'reason'))
    return miss
  }
  if (n.progress !== 'done') return miss
  for (const f of FLOW_REQUIRED[n.kind]) if (!n.fields[f]) miss.push(fieldName(f))
  if (n.kind !== 'question') {
    const anchored = n.evidence.some((e) => !!e.ref || !!e.section)
    const viaLine = n.kind === 'finding' && n.from.some((f) => f.type === 'support' || f.type === 'use')
    if (!anchored && !viaLine) miss.push(n.evidence.length ? tl('근거의 절 (노트 안의 제목 이름)', 'evidence section (a heading in the note)') : tl('근거', 'evidence'))
  }
  if (n.kind === 'calc' && !n.run?.code) miss.push(tl('실행의 코드', 'run code'))
  if (n.kind === 'proof') {
    if (!n.steps.length) miss.push(tl('단계', 'steps'))
    const noUse = n.steps.map((s, i) => (s.uses ? 0 : i + 1)).filter(Boolean)
    if (noUse.length) miss.push(tl(`단계 ${noUse.join(', ')}의 쓰는 것`, `what step ${noUse.join(', ')} uses`))
  }
  return miss
}
