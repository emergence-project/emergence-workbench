import type { ClaimSide, FlowAnswer, FlowException } from './api'
import { t } from './i18n'

// 흐름 화면이 함께 쓰는 이름 (Problems.tsx · ProblemDialogs.tsx · ProblemExceptions.tsx)

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
