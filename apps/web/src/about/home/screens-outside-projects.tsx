import type { AboutSection } from '../types'

// 소개 › home › 프로젝트 밖 화면. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '프로젝트 밖 화면',
  items: [
    { text: <>홈·지식·논문·그림·네트워킹·피드백·소개·설정은 프로젝트 밖 화면입니다. 맨 위에는 지금 위치가 보입니다. 지식·논문·그림·네트워킹은 자기 목록을, 소개·설정은 부분 목록을 앱의 왼쪽 사이드바에 둡니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Screens outside projects',
  items: [
    { text: <>Home, Knowledge, Papers, Figures, Networking, Feedback, About and Settings are screens outside projects. Your current location shows at the very top. Knowledge, Papers, Figures and Networking put their own lists, and About and Settings their list of parts, in the app's left sidebar.</> },
  ],
}
