import { t } from './i18n'

/**
 * 피드백 대화 머리 태그의 이름과 뜻 (10/11 12:38: 태그의 종류와 설명을 각주로).
 * 피드백 화면의 태그 설명 줄과 앱 소개 › 피드백이 반영되는 길의 태그 표(10/14 13:32 제안)가 같은 목록을 쓴다.
 * 재답변 이름 (10/9 사용자 결정, 1안 두 글자): 처음 고르는 유형과 같은 말을 쓴다. 자료 값은 코멘트 · 반려 · 승인 · 중단 · 진행
 */
export const REPLY: Record<string, string> = {
  '코멘트': t('질문', 'Ask'), '반려': t('수정', 'Revise'), '승인': t('승인', 'Approve'), '진행': t('진행', 'Proceed'), '중단': t('중단', 'Stop'),
}

export type TagWho = 'agent' | 'user'
export const TAG_NOTES: Record<string, { name: string; note: string; who: TagWho }> = {
  '앱에 반영됨': { who: 'agent', name: t('앱에 반영됨', 'Applied to the app'), note: t('관리자가 앱을 고쳤고 그 변경이 합쳐졌습니다. 어느 변경인지는 처리 기록의 커밋에 있습니다.', 'The maintainer changed the app and the change was merged. The commit in the handling record says which.') },
  '답만 함': { who: 'agent', name: t('답만 함', 'Answered only'), note: t('앱은 고치지 않고 답만 했습니다. 질문, 거절, 나중에, 동의가 여기에 해당합니다.', 'The app was not changed; only an answer was given (questions, declines, later, agreed).') },
  '반려': { who: 'user', name: t('N번째 수정', 'Revision N'), note: t('처리 결과가 맞지 않아 수정을 눌러 다시 처리해 달라고 한 요청입니다.', 'You pressed Revise because the result was not right and asked for it to be reworked.') },
  '승인': { who: 'user', name: REPLY['승인']!, note: t('처리 결과를 받아들였습니다.', 'You accepted the result.') },
  '진행': { who: 'user', name: REPLY['진행']!, note: t('관리자가 묻거나 제안한 대로 진행하게 했습니다.', 'You told the maintainer to go ahead as asked or proposed.') },
  '중단': { who: 'user', name: REPLY['중단']!, note: t('하지 않기로 했습니다.', 'You decided not to do it.') },
  '코멘트': { who: 'user', name: REPLY['코멘트']!, note: t('다시 처리하지 않고 답만 받으려고 남긴 질문입니다.', 'A question left to get an answer only, without reworking.') },
}
