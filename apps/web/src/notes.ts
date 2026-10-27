import type { NoteRow, Statement } from './api'
import { statusOf } from './format'
import { t } from './i18n'

/**
 * 진술 · 노트 · 개념.
 * - 진술: 무엇이 참인가 (저장소의 statements/). 사용(uses)으로 다른 진술에 기댄다
 * - 노트: 진술을 얻는 작업. 상태가 있다. 진술의 proofs가 어느 노트(폴더 이름)가 그 진술을 증명하는지 적는다
 * - 개념: 공부한 배경 (아직 없음)
 */
export type NoteRef = { k: 'statement'; id: string } | { k: 'derivation'; id: string }

export const KIND_LABEL: Record<string, string> = {
  axiom: t('공리', 'Axiom'), definition: t('정의', 'Definition'), lemma: t('보조정리', 'Lemma'), proposition: t('명제', 'Proposition'), corollary: t('따름정리', 'Corollary'), theorem: t('정리', 'Theorem'), statement: t('진술', 'Statement'),
}
/** 종류는 색이 아니라 진하기로 나눈다 (색은 상태에만 쓴다 — CLAUDE.md 화면 기준): 정리 > 명제·보조정리·따름정리 > 공리·정의·진술 */
export const KIND_COLOR: Record<string, string> = {
  axiom: 'var(--text-3)', definition: 'var(--text-3)', lemma: 'var(--text-2)', proposition: 'var(--text-2)', corollary: 'var(--text-2)', theorem: 'var(--text)', statement: 'var(--text-3)',
}
/** 증명 대상이 아닌 종류 */
export const isGiven = (s: Statement) => s.kind === 'axiom' || s.kind === 'definition'

/** "Proposition 3.9" → "Prop 3.9", 없으면 제목·id */
export function shortLabel(s: Statement): string {
  const l = (s.label ?? '').split(',')[0]!.replace('Proposition', 'Prop').replace('Corollary', 'Cor').replace('Definition', 'Def').replace('Theorem', 'Thm').replace(' of SKK', '').trim()
  return l || s.title || s.id
}

/** 진술과 노트: 증명 관계를 셀 때 함께 본다 */
export interface ProofCtx { statements: Statement[]; notes: NoteRow[] }

/** 진술을 증명하는 노트: 진술의 proofs에 적은 노트 폴더 이름 */
export function proofsOf(ctx: ProofCtx, s: Statement): NoteRow[] {
  const ids = new Set(s.proofs)
  return ctx.notes.filter((n) => ids.has(n.id))
}

/** 노트가 증명하려는 진술 */
export function provesOf(ctx: ProofCtx, id: string): Statement[] {
  return ctx.statements.filter((s) => s.proofs.includes(id))
}

/** 진술이 어디까지 됐나: 공리·정의 / 해결 / 멈춤 / 증명 작업 중 / 증명 작업 없음 */
export function proofState(ctx: ProofCtx, s: Statement): 'given' | 'solved' | 'blocked' | 'in-progress' | 'none' {
  if (isGiven(s)) return 'given'
  const ps = proofsOf(ctx, s).map((b) => statusOf(b.status))
  if (ps.includes('solved')) return 'solved'
  if (ps.includes('in-progress')) return 'in-progress'
  if (ps.includes('blocked')) return 'blocked'
  return 'none'
}
export const PROOF_TEXT = { given: t('공리·정의', 'Axiom or definition'), solved: t('증명됨', 'Proved'), blocked: t('증명 멈춤', 'Proof blocked'), 'in-progress': t('증명 작업 중', 'Proof in progress'), none: t('증명 작업 없음', 'No proof work') }

/** 진술을 쓰는 진술 */
export function usedBy(ctx: Pick<ProofCtx, 'statements'>, sid: string): Statement[] {
  return ctx.statements.filter((s) => s.uses.includes(sid))
}

/** 논문 순서: 바탕(외부 정리) → 공리 → 본문 → 부록. 같은 묶음 안에서는 번호 순 */
export function statementGroup(s: Statement): string {
  const l = s.label ?? ''
  if (!l || /^SSA|Ref\./.test(l)) return GROUPS[0]!
  if (s.kind === 'axiom' || l.startsWith('Eq')) return GROUPS[1]!
  if (/\b[A-Z]\.\d/.test(l)) return GROUPS[3]!
  return GROUPS[2]!
}
const GROUPS = [t('바탕', 'Background'), t('공리', 'Axioms'), t('본문', 'Main text'), t('부록', 'Appendix')]
export function paperOrder(list: Statement[]): Statement[] {
  const nums = (s: Statement) => ((s.label ?? '').match(/\d+(?:\.\d+)*/)?.[0] ?? '999').split('.').map(Number)
  return [...list].sort((a, b) => {
    const g = GROUPS.indexOf(statementGroup(a)) - GROUPS.indexOf(statementGroup(b))
    if (g) return g
    const x = nums(a), y = nums(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return a.id.localeCompare(b.id)
  })
}

