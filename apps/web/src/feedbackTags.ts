import type { FeedbackState } from './api'
import { shown, t } from './i18n'

/**
 * 피드백 대화 머리 태그의 이름과 뜻 (10/11 12:38: 태그의 종류와 설명을 각주로).
 * 피드백 화면의 태그 설명 줄과 앱 소개 › 피드백이 반영되는 길의 태그 표(10/14 13:32 제안)가 같은 목록을 쓴다.
 * 재답변 이름 (10/9 사용자 결정, 1안 두 글자): 처음 고르는 유형과 같은 말을 쓴다. 자료 값은 코멘트 · 반려 · 승인 · 중단 · 진행 · 논의(11/8)
 */
export const REPLY: Record<string, string> = {
  '코멘트': t('질문', 'Ask'), '반려': t('반려', 'Revise'), '승인': t('승인', 'Approve'), '진행': t('진행', 'Proceed'), '중단': t('중단', 'Stop'), '논의': t('논의', 'Discuss'),
}

/**
 * 답 고르기 칸의 뜻 (11/8 안 C: 고르기 칸에는 「이름 · 뜻」 한 모양).
 * 질문과 논의를 가르는 기준 (11/9 09:22 코멘트): 앱을 바꾸려는 마음이 없으면 질문(답만), 바꿀지 아직 모르면 논의(시안 · 물음), 바꾸기로 정했으면 진행.
 */
export const REPLY_MEANING: Record<string, string> = {
  '승인': t('그대로 끝내기', 'accept as is'), '진행': t('이어서 더 하기', 'go on with more'), '반려': t('다시 고치기', 'fix it again'),
  '논의': t('바꿀지 시안 보고 정하기', 'decide after seeing a mockup'), '코멘트': t('궁금한 것만 묻기 (바꾸지 않음)', 'just ask (no change)'), '중단': t('여기서 멈추기', 'stop here'),
}

export type TagWho = 'agent' | 'user'
export const TAG_NOTES: Record<string, { name: string; note: string; who: TagWho }> = {
  '앱에 반영됨': { who: 'agent', name: t('앱에 반영됨', 'Applied to the app'), note: t('관리자가 앱을 고쳤고 그 변경이 합쳐졌습니다. 어느 변경인지는 처리 기록의 커밋에 있습니다.', 'The maintainer changed the app and the change was merged. The commit in the handling record says which.') },
  '답만 함': { who: 'agent', name: t('답만 함', 'Answered only'), note: t('앱은 고치지 않고 답만 했습니다. 질문, 거절, 나중에, 동의가 여기에 해당합니다.', 'The app was not changed; only an answer was given (questions, declines, later, agreed).') },
  '반려': { who: 'user', name: t('N번째 반려', 'Revision N'), note: t('처리 결과가 맞지 않아 반려를 눌러 다시 처리해 달라고 한 요청입니다.', 'You pressed Revise because the result was not right and asked for it to be reworked.') },
  '승인': { who: 'user', name: REPLY['승인']!, note: t('처리 결과를 받아들였습니다.', 'You accepted the result.') },
  '진행': { who: 'user', name: REPLY['진행']!, note: t('관리자가 묻거나 제안한 대로, 적은 글이 있으면 그 말대로 더 하게 했습니다. 반려로 세지 않습니다.', 'You told the maintainer to go ahead as asked or proposed, or to do more as you wrote. Not counted as a revision.') },
  '논의': { who: 'user', name: REPLY['논의']!, note: t('고치기 전에 시안이나 물음으로 먼저 이야기하자고 했습니다. 관리자는 고치지 않고 시안을 만들어 묻습니다.', 'You asked to talk it over first. The maintainer does not change anything yet and replies with a mockup and a question.') },
  '중단': { who: 'user', name: REPLY['중단']!, note: t('하지 않기로 했습니다.', 'You decided not to do it.') },
  '코멘트': { who: 'user', name: REPLY['코멘트']!, note: t('다시 처리하지 않고 답만 받으려고 남긴 질문입니다.', 'A question left to get an answer only, without reworking.') },
}

/** 필터 · 묶기 · 상태의 화면 이름 (값은 한국어 그대로 저장한다). 피드백 화면 · 맥 알림이 쓴다 */
const LABEL: Record<string, string> = {
  '확인 필요': t('확인 필요', 'Needs review'), '대기': t('대기', 'Waiting'), '완료': t('완료', 'Done'), '전체': t('전체', 'All'),
  '시각': t('시각', 'Time'), '화면': t('화면', 'Screen'), '테마': t('테마', 'Theme'), '종류': t('종류', 'Kind'),
  '반영': t('반영', 'Applied'), '답변': t('답변', 'Answered'), '보류': t('보류', 'On hold'), '승인': t('승인', 'Approved'),
  '거절': t('거절', 'Declined'), '동의': t('동의', 'Agreed'), '나중에': t('나중에', 'Later'),
  '처리': t('처리', 'Handled'), '다시 처리': t('다시 처리', 'Reworked'), '나': t('나', 'Me'),
}
export const feedbackLabel = (v: string) => LABEL[v] ?? shown(v)
/** 태그는 두 글자로 (10/9): 상태 · 요소 · 유형 태그에 세 글자 넘는 이름을 쓰지 않는다. 필터 이름은 그대로. 피드백 화면 · 폰 내 차례 카드가 쓴다 */
const TAG: Record<string, string> = {
  '확인 필요': t('질의', 'Asked'), '나중에': t('추후', 'Later'), '디자인': t('모양', 'Design'), '미분류': t('미정', 'None'),
}
export const feedbackStateName = (s: FeedbackState | '대기') => TAG[s] ?? feedbackLabel(s)
export const feedbackKindName = (k: string) => TAG[k] ?? shown(k)
