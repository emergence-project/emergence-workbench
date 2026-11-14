import type { AttemptState, Claim, ClaimSide, FlowAnswer, FlowException } from './api'
import { t } from './i18n'

// 흐름 화면이 함께 쓰는 이름 (Problems.tsx · ProblemChart.tsx · ProblemDialogs.tsx · ProblemExceptions.tsx)

/** 시도의 상태 */
export const ATTEMPT_NAME: Record<AttemptState, string> = { candidate: t('후보', 'Candidate'), active: t('진행', 'Working'), reported: t('판정 대기', 'To judge'), holds: t('성립', 'Holds'), dropped: t('폐기', 'Dropped') }

/** 흐름을 닫을 때의 답 */
export const ANSWER_NAME: Record<FlowAnswer, string> = { yes: t('예', 'Yes'), no: t('아니오', 'No') }
/** 주장이 질문의 어느 쪽을 받치나. 방향 보고의 칸 이름과 같은 말 */
export const SIDE_NAME: Record<ClaimSide, string> = { for_yes: t('예 근거', 'For yes'), for_no: t('아니오 근거', 'For no'), neither: t('무관', 'For neither') }
/** 예외 기록의 종류 */
export const EXCEPTION_NAME: Record<FlowException['kind'], string> = {
  refused: t('거절', 'Refused'), 'no-claim': t('진술 불가', 'No claim'), 'no-verdict': t('판정 불가', 'No verdict'),
  'needs-user': t('결정 필요', 'Needs a decision'), workaround: t('우회', 'Workaround'), other: t('기타', 'Other'),
}

/** 진술 뒤에 붙는 태그: 예 근거 · 아니오 근거 · 무관 */
export function SideTag({ side }: { side?: ClaimSide }) {
  return side ? <span className="tag pb-side">{SIDE_NAME[side]}</span> : null
}

/** 숫자 뒤의 목적격 조사: 읽을 때 받침이 있으면 을 (영 · 일 · 삼 · 육 · 칠 · 팔 · 십), 없으면 를 (이 · 사 · 오 · 구) */
export const objOf = (n: string) => (/[2459]$/.test(n) && !/0$/.test(n) ? '를' : '을')

/**
 * 겨눌 곳 고르기: 질문 또는 주장 하나. 입력란을 연 뒤에도 바꿀 수 있어, 차트에서 고른 점이 그새 풀려도 엉뚱한 곳에 붙지 않는다
 * (11/14 실제 이력으로 채워 보기: 같은 점을 다시 누르면 선택이 풀려 아래 주장이 질문 바로 아래로 갔다)
 */
export function TargetSelect({ claims, value, onChange }: { claims: readonly Claim[]; value: string; onChange(v: string): void }) {
  return (
    <select className="rs-select pb-target" data-ui="겨눌 곳" aria-label={t('어디 아래에', 'Under')} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('질문', 'Question')}</option>
      {claims.map((c) => <option key={c.id} value={c.id}>{`${c.id} ${c.statement.length > 24 ? `${c.statement.slice(0, 24)}…` : c.statement}`}</option>)}
    </select>
  )
}
