import * as colors from './symbols/colors'
import * as actions from './symbols/actions'
import * as screens from './symbols/screens'
import * as flow from './symbols/flow'
import * as marks from './symbols/marks'
import * as tags from './symbols/tags'
import type { AboutPart } from './types'

// 소개 › 기호와 의미 (#/about/symbols). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'symbols', title: '기호와 의미',
  sub: '앱이 쓰는 색과 기호를 한곳에 모았습니다. 같은 기호는 어느 화면에서나 같은 뜻입니다.',
  sections: [colors.ko, actions.ko, screens.ko, flow.ko, marks.ko, tags.ko],
}

export const en: AboutPart = {
  id: 'symbols', title: 'Symbols and meanings',
  sub: 'The colors and symbols the app uses, in one place. A symbol means the same on every screen.',
  sections: [colors.en, actions.en, screens.en, flow.en, marks.en, tags.en],
}
