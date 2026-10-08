// 노트 성격의 화면 이름 (10/5 결정). 이 표 한 곳에서만 이름을 정한다
import type { NoteCategory, ProjectKind } from './api'
import { t } from './i18n'

export const NOTE_KIND_LABEL: Record<NoteCategory, string> = {
  proof: t('증명', 'Proof'),
  calc: t('계산', 'Calculation'),
  check: t('검증', 'Verification'),
  summary: t('요약', 'Summary'),
  explore: t('탐색', 'Exploration'),
  design: t('설계', 'Design'),
}
/** 성격을 적지 않은 노트 */
export const NO_KIND_LABEL = t('미분류', 'No kind')
/** 고를 수 있는 성격: 설계는 업무 프로젝트에만 (프로젝트 성격, 10/5) */
export const noteKindChoices = (project: ProjectKind): NoteCategory[] => ['proof', 'calc', 'check', 'summary', 'explore', ...(project === 'work' ? ['design' as const] : [])]
export const noteKindLabel = (k: NoteCategory | null | undefined) => (k ? NOTE_KIND_LABEL[k] : NO_KIND_LABEL)
/** 주제 없는 노트 묶음의 이름 ("분류 전" 대신, 10/5) */
export const LOOSE_NOTES_LABEL = t('노트들', 'Loose notes')
/** 같은 이름의 한국어 (data-ui-item 등 피드백 부위 이름에 쓴다) */
export const LOOSE_NOTES_UI = '노트들'
/** "노트들"을 주제 화면 모양으로 열 때 쓰는 예약 주제 id (#/r/<rid>/t/__loose). 서버가 만드는 주제 id(영문 소문자·숫자·-)와 겹치지 않는다 */
export const LOOSE_TOPIC_ID = '__loose'
