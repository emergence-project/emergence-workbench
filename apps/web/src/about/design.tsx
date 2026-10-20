import * as valuesAndComponents from './design/values-and-components'
import * as symbolsAndActions from './design/symbols-and-actions'
import * as screenRules from './design/screen-rules'
import { c } from './code'
import type { AboutPart } from './types'

// 소개 › 화면 기준 (#/about/design). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'design', title: '화면 기준',
  sub: <>모든 화면이 따르는 디자인 규칙입니다. 기준 문서는 {c('docs/design-system.md')}입니다.</>,
  sections: [valuesAndComponents.ko, symbolsAndActions.ko, screenRules.ko],
}

export const en: AboutPart = {
  id: 'design', title: 'Screen standards',
  sub: <>The design rules every screen follows. The reference document is {c('docs/design-system.md')}.</>,
  sections: [valuesAndComponents.en, symbolsAndActions.en, screenRules.en],
}
