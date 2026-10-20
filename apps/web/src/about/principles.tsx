import * as definitions from './principles/definitions'
import * as statusAndTurns from './principles/status-and-turns'
import * as workingPrinciples from './principles/working-principles'
import * as designPrinciples from './principles/design-principles'
import type { AboutPart } from './types'

// 소개 › 정의와 원칙 (#/about/principles). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'principles', title: '정의와 원칙',
  sub: '이 앱에서 쓰는 말의 뜻과, 앱을 만들고 고칠 때 지키는 원칙입니다.',
  sections: [definitions.ko, statusAndTurns.ko, workingPrinciples.ko, designPrinciples.ko],
}

export const en: AboutPart = {
  id: 'principles', title: 'Definitions and principles',
  sub: 'What the words in this app mean, and the principles followed when building and fixing it.',
  sections: [definitions.en, statusAndTurns.en, workingPrinciples.en, designPrinciples.en],
}
