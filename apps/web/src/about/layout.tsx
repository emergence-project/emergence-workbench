import { mdSection } from './md'
import type { AboutPart } from './types'

const structure = mdSection('layout/structure')
const project = mdSection('layout/project')
const library = mdSection('layout/library')
const agents = mdSection('layout/agents')
const networking = mdSection('layout/networking')
const feedback = mdSection('layout/feedback')
const settings = mdSection('layout/settings')
const status = mdSection('layout/status')

// 소개 › 앱의 구성 (#/about/layout). 11/28 사용자 "2부를 앱의 구성으로 두고 섹션별로": 한눈에(그림 둘) 다음에 구성요소마다 절 하나(정의 · 하위 요소 · 저장 위치 · 자세히).
// 구성요소의 정의는 여기 한 곳에만 두고, 뒤의 「화면」 묶음은 동작을 설명한다. 화면별 모양은 화면 기준(design/), 원칙은 「일하는 방식」 맨 앞(principles).

export const ko: AboutPart = {
  id: 'layout', title: '앱의 구성',
  sub: '앱을 이루는 구성요소마다 무엇이고, 무엇을 담고, 어디에 저장되는지입니다. 화면 하나하나의 자세한 동작은 다음 「화면」 묶음에 있습니다.',
  sections: [structure.ko, project.ko, library.ko, agents.ko, networking.ko, feedback.ko, settings.ko, status.ko],
}

export const en: AboutPart = {
  id: 'layout', title: 'How the app is built',
  sub: 'For each component of the app: what it is, what it holds, and where it is stored. How each screen works in detail is in the Screens group that follows.',
  sections: [structure.en, project.en, library.en, agents.en, networking.en, feedback.en, settings.en, status.en],
}
