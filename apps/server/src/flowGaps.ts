// 흐름의 빈틈과 해결 문턱 (10/20 사용자 결정, docs/repo-format.md §14 "빈틈" · "해결 문턱").
// 빈틈은 앱이 계산해 화면 · STATUS · MCP가 같은 것을 본다. 문턱(flowGate)은 편집 화면과 함께 쓰려고 core flow-gate.ts에 있다.
import fs from 'node:fs'
import path from 'node:path'
import { CARD_LOCKED, JUDGE_SINCE, flowGate } from '@rw/core'
import type { FlowGap, FlowNode } from '@rw/core/contract/flow'
import { hashOf, isInside } from './fsutil.js'
import { t as tl } from './i18n.js'

/** 제목 줄의 수준 (Markdown #, TeX \section 계열). 제목이 아니면 0 */
function headingOf(line: string): { level: number; name: string } | null {
  const md = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
  if (md) return { level: md[1]!.length, name: md[2]! }
  const tex = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{(.*)\}\s*$/.exec(line)
  if (tex) return { level: ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph'].indexOf(tex[1]!) + 1, name: tex[2]! }
  return null
}
const norm = (s: string) => s.replace(/\\label\{[^}]*\}/g, '').replace(/[`*_$\\{}]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

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
/** 그림 · 표 머리 · 수식 줄을 뺀 첫 글 (절 미리 보기) */
function firstText(lines: string[]): string {
  for (const l of lines) {
    const t = l.trim()
    if (!t || /^(!\[|<|\$\$|\\begin|\|)/.test(t)) continue
    const s = t.replace(/^[-*>]\s+/, '').replace(/\*\*/g, '')
    return s.length > 160 ? `${s.slice(0, 159)}…` : s
  }
  return ''
}

/**
 * 노트의 절 목록 (10/26 "흐름 연결" ②, 근거 고르기): 근거의 절 이름과 같은 규칙(headingOf)으로 읽어
 * 고른 절이 evidenceHash에서 그대로 찾아진다. 맨 위 제목(# 하나)만 있는 노트는 빈 목록
 */
export function noteSections(repo: string, file: string): { name: string; level: number; preview: string }[] {
  const p = path.join(repo, file)
  if (!isInside(repo, p)) return []
  let lines: string[]
  try { lines = fs.readFileSync(p, 'utf8').split('\n') } catch { return [] }
  const heads = lines.map((l, i) => ({ i, h: headingOf(l) })).filter((x): x is { i: number; h: { level: number; name: string } } => !!x.h && x.h.name.trim() !== '')
  const top = heads.length && heads[0]!.h.level === 1 && heads.filter((x) => x.h.level === 1).length === 1 ? heads[0]!.i : -1
  return heads.filter((x) => x.i !== top).map((x, k, all) => {
    const next = all[k + 1]?.i ?? lines.length
    return { name: x.h.name.replace(/\\label\{[^}]*\}/g, '').trim(), level: x.h.level, preview: firstText(lines.slice(x.i + 1, next)) }
  })
}

/** 단계의 내용 해시 (글 · 쓰는 것) */
export const stepHash = (s: { text: string; uses?: string }) => hashOf(`${s.text}\n${s.uses ?? ''}`)

/** 발견의 진술 · 조건 해시 (10/23): 발견의 확인은 근거와 함께 이 문장에도 묶인다. 진술을 넓히면 확인이 낡는다 */
export const claimHash = (n: Pick<FlowNode, 'fields'>) => hashOf(`${n.fields.statement ?? ''}\n${n.fields.condition ?? ''}`)

/** 판단할 내용의 해시 (10/23): 발견은 진술 · 조건(claimHash), 질문(카드)은 질문과 완료 조건 */
export const judgmentHash = (n: Pick<FlowNode, 'kind' | 'fields'>) =>
  n.kind === 'finding' ? claimHash(n) : hashOf(CARD_LOCKED.map((k) => n.fields[k] ?? '').join('\n'))

/** 판단 기록의 낡음을 적고, 지금의 판단(낡지 않은 마지막 판단의 말)을 돌려준다. claim이 없는 기록은 내용을 보지 않는다 */
export function markJudgments(n: FlowNode): FlowNode['verdict'] {
  const h = judgmentHash(n)
  for (const j of n.judgments) { if (j.claim && j.claim !== h) j.stale = true; else delete j.stale }
  return [...n.judgments].reverse().find((j) => !j.stale)?.verdict
}

/**
 * 판단 대기열 (10/23 "판단 설계"): 판단 전이거나 수정으로 돌려보낸 명제 가운데, 에이전트가 설계 뒤(JUDGE_SINCE) 낸 것과
 * 끝나지 않은 카드가 사전 연구로 고른 것. 옛 명제는 카드가 쓸 때만 오른다. verdict는 markJudgments가 채운 값을 쓴다
 */
export function judgmentQueue(nodes: FlowNode[]): FlowNode[] {
  const givens = new Set(nodes.filter((n) => n.card && n.verdict !== 'end').flatMap((n) => n.card!.givens))
  return nodes.filter((n) => n.kind === 'finding' && (n.verdict === undefined || n.verdict === 'send-back')
    && (givens.has(n.id) || (!!n.by && n.by !== 'user' && (n.date ?? '') >= JUDGE_SINCE)))
}

/**
 * 카드의 상태: 종료 · 진행(사람이 시작했고 사전 연구가 모두 승인됨) · 준비(사전 연구가 모두 승인돼 시작을 기다림) · 대기(승인 안 된 사전 연구가 있음).
 * 카드가 아닌 점은 null
 */
export type CardState = 'ended' | 'active' | 'ready' | 'waiting'
export function cardState(n: FlowNode, byId: Map<string, FlowNode>): CardState | null {
  if (!n.card) return null
  if (n.verdict === 'end') return 'ended'
  const open = n.card.givens.filter((g) => byId.get(g)?.verdict !== 'approve')
  if (open.length) return 'waiting'
  return n.verdict === 'start' ? 'active' : 'ready'
}

/** 카드에서 정의(def)도 출처(ref)도 없는 용어 */
export const undefinedTerms = (n: FlowNode): string[] => (n.card?.terms ?? []).filter((x) => !x.def?.trim() && !x.ref?.trim()).map((x) => x.word)

/** 이 근거의 마지막 확인 뒤 발견의 진술 · 조건이 바뀌었나 (claim이 없는 옛 기록은 보지 않는다) */
export function claimChanged(n: FlowNode, e: FlowNode['evidence'][number]): boolean {
  if (n.kind !== 'finding') return false
  const last = [...e.checks].reverse().find((c) => !c.revoked && c.claim)
  return !!last && last.claim !== claimHash(n)
}

/** 그 역할의 지금 확인 (마지막 기록이 거둔 것도 낡은 것도 아니면) */
export const confirmed = (x: { checks: FlowNode['evidence'][number]['checks']; stale?: boolean }, role: 'agent' | 'human') => {
  const c = x.checks.filter((y) => y.role === role).pop()
  return !!c && !c.revoked && !x.stale
}

/** 근거 · 단계의 낡은 확인 표시 (마지막 확인의 hash가 지금 내용과 다르면) */
export function markStale(repo: string, n: FlowNode): void {
  for (const e of n.evidence) {
    if (claimChanged(n, e)) e.stale = true
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
    if (isSolved(n) && !hasNext.has(n.id) && !n.end && !n.next) add('no-next', '다음 할 일도, 뒤따른 점도, 흐름 종료도 없다', 'no next step, no following dot and no flow end')
    if (n.evidence.some((e) => claimChanged(n, e))) add('changed-evidence', '확인한 뒤 진술 · 조건이 바뀌었다', 'the statement or conditions changed after they were checked')
    for (const e of n.evidence) {
      if (!e.file) continue
      const h = evidenceHash(repo, e.file, e.section)
      const last = [...e.checks].reverse().find((c) => !c.revoked && c.hash)
      if (h === 'missing') add('missing-file', `근거 파일이 없다: ${e.file}`, `evidence file missing: ${e.file}`)
      else if (h === 'no-section') add('missing-file', `근거 절이 없다: ${e.file} › ${e.section}`, `evidence section missing: ${e.file} › ${e.section}`)
      else if (last && last.hash !== h) add('changed-evidence', `확인한 뒤 근거가 바뀌었다: ${e.title ?? e.file}`, `evidence changed after it was checked: ${e.title ?? e.file}`)
    }
    const open = n.steps.map((s, i) => [s, i + 1] as const).filter(([s]) => !s.uses || !(confirmed(s, 'agent') || confirmed(s, 'human')))
    if (open.length) add('step-gap', `확인 안 된 단계: ${open.map(([, i]) => i).join(', ')}번 (${n.steps.length}단계 중)`, `unchecked steps: ${open.map(([, i]) => i).join(', ')} (of ${n.steps.length})`)
    n.gaps = gaps
  }
}

export { flowGate }
