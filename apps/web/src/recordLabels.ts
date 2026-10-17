import { t } from './i18n'

/** 아래 입력란으로 적는 기록의 종류 (파일 값). 작업 탭의 기록 필터 */
export type RecordFilter = '메모' | '할 일' | '질문' | '지시'

/** 기록 종류·필터의 영어 이름. 파일에는 한국어 값 그대로 두고 보일 때만 바꾼다 */
const KIND_EN: Record<string, string> = {
  전체: 'All', 자동: 'Auto', 메모: 'Memo', '할 일': 'To-do', 질문: 'Question', 지시: 'Instruction', 코멘트: 'Comment', 하이라이트: 'Highlight',
  판단: 'To decide', '맡긴 일': 'Delegated',
}
/** 기록 상태의 영어 이름 */
const STATE_EN: Record<string, string> = { 대기: 'Waiting', 답함: 'Answered', 끝냄: 'Done' }

export const kindLabel = (k: string) => t(k, KIND_EN[k] ?? k)
export const stateLabel = (s: string) => t(s, STATE_EN[s] ?? s)
