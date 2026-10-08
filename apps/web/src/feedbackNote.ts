/**
 * 피드백 모드가 항목에 적는 "지금 연 노트" (10/8 11:42 "이것이 그 프로젝트의 Paper overview라는 것이 경로에 보여?").
 * 앱이 화면을 그릴 때 정하고, 피드백을 저장할 때 읽는다. "프로젝트 › 노트 이름 (경로)"
 */
let note: string | undefined

export function setFeedbackNote(next: string | undefined) { note = next }
export const feedbackNote = () => note
