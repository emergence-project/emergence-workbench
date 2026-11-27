import { mdSection } from './md'
import type { AboutPart } from './types'

const areas = mdSection('layout/areas')
const terms = mdSection('layout/terms')

// 소개 › 구성과 용어 (#/about/layout). 11/27 「화면」 묶음과 이름이 겹쳐 「화면과 용어」에서 바꿈. 11/27 사용자 "구성요소의 용어와 개념을 화면과 함께 먼저, 원칙과 규칙은 그다음":
// 다섯 영역 그림(화면 구조) 다음에 용어를 화면의 자리 순서로 푼다. 원칙은 「일하는 방식」 맨 앞 쪽(principles)에 있다.

export const ko: AboutPart = {
  id: 'layout', title: '구성과 용어',
  sub: '앱 전체가 어떻게 짜여 있는지와, 구성요소마다의 말뜻입니다. 화면 하나하나의 자세한 동작은 다음 「화면」 묶음에 있습니다.',
  sections: [areas.ko, terms.ko],
}

export const en: AboutPart = {
  id: 'layout', title: 'Structure and terms',
  sub: 'How the whole app is put together, and what each component is called. How each screen works in detail is in the Screens group that follows.',
  sections: [areas.en, terms.en],
}
