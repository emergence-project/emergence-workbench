import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › feedback › 처리와 반영. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '처리와 반영',
  items: [
    { text: <>처리 기록은 {c('feedback/status.yaml')} 한 곳에 남깁니다: 교정한 문장, 이해한 요구, 원인, 처리, 커밋.</> },
    { text: <>에이전트가 고친 것을 PR로 올리고, 검사(형 검사·테스트·빌드·화면 그림)가 통과하면 직접 합칩니다. 사용자는 설정 › 앱 기본정보의 업데이트만 누릅니다.</> },
    { text: <>승인된 항목은 이 소개의 설명으로 옮기고, 원문과 처리 기록은 지웁니다. 그래서 피드백 화면에는 아직 끝나지 않은 것만 남습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Handling and shipping',
  items: [
    { text: <>The handling record is kept in one place, {c('feedback/status.yaml')}: the corrected sentence, the understood request, the cause, the handling, and the commit.</> },
    { text: <>The agent puts its fix up as a PR and merges it itself once the checks (type check, tests, build, screenshots) pass. You only press Update in Settings › About this app.</> },
    { text: <>Approved items move into this About page as descriptions, and their originals and handling records are deleted. So the Feedback screen keeps only what is not finished.</> },
  ],
}
