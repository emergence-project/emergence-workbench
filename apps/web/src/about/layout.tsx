import { mdSection } from './md'
import type { AboutPart } from './types'

const areas = mdSection('layout/areas')
const terms = mdSection('layout/terms')

// 소개 › 화면과 용어 (#/about/layout). 11/27 사용자 "구성요소의 용어와 개념을 화면과 함께 먼저, 원칙과 규칙은 그다음":
// 다섯 영역 그림(화면 구조) 다음에 용어를 화면의 자리 순서로 푼다. 원칙은 「일하는 방식」 맨 앞 쪽(principles)에 있다.

export const ko: AboutPart = {
  id: 'layout', title: '화면과 용어',
  sub: '화면이 어떻게 나뉘는지와, 각 자리에 나오는 말의 뜻입니다.',
  sections: [areas.ko, terms.ko],
}

export const en: AboutPart = {
  id: 'layout', title: 'Screens and terms',
  sub: 'How the screen is divided, and what the words in each place mean.',
  sections: [areas.en, terms.en],
}
