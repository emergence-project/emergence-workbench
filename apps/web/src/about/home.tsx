import * as projectListAndCards from './home/project-list-and-cards'
import * as workCalendar from './home/work-calendar'
import * as screensOutsideProjects from './home/screens-outside-projects'
import type { AboutPart } from './types'

// 소개 › 홈 (#/about/home). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'home', title: '홈',
  sub: '모든 프로젝트를 한눈에 보는 화면입니다. 위에 프로젝트 목록(또는 카드), 아래에 이번 주에 한 일 달력이 있습니다.',
  open: [{ label: '홈 열기', to: { page: 'home' } }],
  sections: [projectListAndCards.ko, workCalendar.ko, screensOutsideProjects.ko],
  left: ['할 일 마감을 구글 캘린더에 쓰기는 다음 단계입니다.', '구글 연결은 Google Cloud에서 만든 "데스크톱 앱" 클라이언트를 설정에 넣어야 시작됩니다 (사용자 차례).'],
}

export const en: AboutPart = {
  id: 'home', title: 'Home',
  sub: 'The screen that shows all projects at a glance. The project list (or cards) is on top, and a calendar of this week\'s work is below.',
  open: [{ label: 'Open Home', to: { page: 'home' } }],
  sections: [projectListAndCards.en, workCalendar.en, screensOutsideProjects.en],
  left: ['Writing to-do deadlines to Google Calendar is a next step.', 'The Google connection starts only after a "Desktop app" client made in Google Cloud is entered in Settings (your turn).'],
}
