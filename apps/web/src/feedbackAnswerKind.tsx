import { stateOf, needsAnswer } from './feedbackBuckets'
import type { FeedbackItem, FeedbackState } from './api'
import { feedbackStateName as stateName } from './feedbackTags'
import { t } from './i18n'

/**
 * 답의 갈래 (11/8 20:38 논의 → 11/16 「시안은 다 추천대로」, 시안 N7ik 3절).
 * 답이 무엇에 대한 것인가로 셋: 구현(이미 고친 것) · 사실(지금 앱이 어떤지) · 계획(만들지 정하는 것).
 * 답이 오가는 중이거나 끝난 것은 갈래 없이 진행 상황(대기 · 끝남). 저장 칸은 그대로이고, 처리 상태와 처리 첫 줄에서 읽는다.
 * 표에서는 갈래 · 상태 · 결론을 제목 있는 칸 셋으로 나눈다(11/13 코멘트).
 */
export type AnswerKind = '구현' | '사실' | '계획' | '진행 상황'
export const ANSWER_KINDS: AnswerKind[] = ['구현', '사실', '계획', '진행 상황']
export type KindFilter = AnswerKind | '전체'
export const KIND_FILTERS: KindFilter[] = ['전체', ...ANSWER_KINDS]

const KIND_OF: Partial<Record<FeedbackState, AnswerKind>> = { 반영: '구현', 답변: '사실', 동의: '계획', '확인 필요': '계획', 보류: '계획', 나중에: '계획', 거절: '계획' }

export interface AnswerParts {
  kind: AnswerKind
  /** 상태 칸: 반영 · 답변 · 동의 · 확인 필요 · 나중에 · 거절 · 대기 · 끝남 */
  state: string
  /** 결론 칸: PR 번호 · 있음/없음/일부 · 구현 크기(크기 중간). 없으면 '' */
  result: string
  /** 끝남이면 승인인지 중단인지 */
  tip?: string
}

/** 처리 첫 줄에서 결론을 읽는다: 「수정 완료 (#414)」 · 「답변: 없음」 · 「의견에 동의 (중간)」 */
export function resultOf(state: FeedbackState, note = '', commit = ''): string {
  const first = note.split('\n')[0]!.trim()
  if (state === '반영') return first.match(/\(#(\d+)\)/)?.[0].slice(1, -1) ?? (/^#\d+$/.test(commit) ? commit : commit.slice(0, 7))
  if (state === '답변') return first.match(/^답변:\s*(있음|없음|일부)/)?.[1] ?? ''
  if (state === '동의') { const size = first.match(/\((작음|중간|큼)\)/)?.[1]; return size ? `${t('크기', 'Size')} ${size}` : '' }
  return ''
}

export function answerParts(e: FeedbackItem): AnswerParts {
  const st = stateOf(e)
  if (st === '대기') return { kind: '진행 상황', state: '대기', result: '' }
  if (st === '승인') return { kind: '진행 상황', state: '끝남', result: '', tip: e.review?.verdict === '중단' ? t('중단함', 'Stopped') : t('승인함', 'Approved') }
  const kind = KIND_OF[st] ?? '진행 상황'
  // 옛 상태 보류는 「계획 · 확인 필요」로 (기록은 그대로)
  const state = st === '보류' ? '확인 필요' : st
  return { kind, state, result: resultOf(st, e.status?.note, e.status?.commit) }
}

export const matchesKind = (f: KindFilter, e: FeedbackItem) => f === '전체' || answerParts(e).kind === f

const KIND_NAME: Record<string, string> = { 구현: t('구현', 'Built'), 사실: t('사실', 'Fact'), 계획: t('계획', 'Plan'), '진행 상황': t('진행 상황', 'In progress'), 끝남: t('끝남', 'Done') }
export const answerKindName = (k: string) => KIND_NAME[k] ?? stateName(k as FeedbackState | '대기')

/** 표 머리의 세 칸 */
export const AnswerHeads = () => <><th>{t('갈래', 'Kind')}</th><th>{t('상태', 'Status')}</th><th>{t('결론', 'Result')}</th></>

/** 표 줄의 세 칸. 주황(내 차례)은 계획 중 내가 고를 것(동의 · 확인 필요)에만 */
export function AnswerCells({ e }: { e: FeedbackItem }) {
  const a = answerParts(e)
  const turn = a.kind === '계획' && needsAnswer(e)
  return <>
    <td className="fbp-cell">{a.kind === '진행 상황' ? <span className="muted">—</span> : answerKindName(a.kind)}</td>
    <td className="fbp-cell-state" title={a.tip}><span className={`fbp-state${turn ? ' turn' : ''}`}>{answerKindName(a.state)}</span></td>
    <td className="fbp-cell">{a.result || <span className="muted">—</span>}</td>
  </>
}
