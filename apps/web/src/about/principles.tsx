import { mdSection } from './md'
import type { AboutPart } from './types'

const working = mdSection('principles/working-principles')
const design = mdSection('principles/design-principles')

// 소개 › 원칙 (#/about/principles). 「일하는 방식」 맨 앞: 앱의 구성을 읽은 뒤 원칙, 그다음 에이전트 · 피드백 (11/27 사용자).
// 두 절은 규범 절(kind: norm)이라 앱 고치기 대화가 처음 앱 파일을 다룰 때 한 번 받는다. 구성요소의 정의는 앱의 구성 쪽(layout/)에 있다.
// 디자인 원칙에는 이유만 두고, 지킬 값 · 기호 · 배치 규칙은 화면 기준 쪽(design/)에 둔다.

export const ko: AboutPart = {
  id: 'principles', title: '원칙',
  sub: '앱을 만들고 고치고 쓸 때 사람과 에이전트가 함께 지키는 원칙입니다.',
  sections: [working.ko, design.ko],
}

export const en: AboutPart = {
  id: 'principles', title: 'Principles',
  sub: 'The principles people and agents keep when building, fixing and using the app.',
  sections: [working.en, design.en],
}
