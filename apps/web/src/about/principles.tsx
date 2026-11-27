import { mdSection } from './md'
import type { AboutPart } from './types'

const terms = mdSection('principles/definitions')
const working = mdSection('principles/working-principles')
const design = mdSection('principles/design-principles')

// 소개 › 용어와 원칙 (#/about/principles). 절은 같은 이름 폴더에 절마다 .md 파일 하나다(형식은 packages/core/src/about-md.ts).
// 11/27 Fable 안: 용어(참조 절, 옛 상태와 차례를 합침) · 작업 원칙 · 디자인 원칙(규범 절: 앱 고치기 대화에 처음 한 번 건넴).
// 디자인 원칙에는 이유만 두고, 지킬 값 · 기호 · 배치 규칙은 화면 기준 쪽(design/)에 둔다.

export const ko: AboutPart = {
  id: 'principles', title: '용어와 원칙',
  sub: '이 앱에서 쓰는 말의 뜻과, 앱을 만들고 고칠 때 지키는 원칙입니다.',
  sections: [terms.ko, working.ko, design.ko],
}

export const en: AboutPart = {
  id: 'principles', title: 'Terms and principles',
  sub: 'What the words in this app mean, and the principles followed when building and fixing it.',
  sections: [terms.en, working.en, design.en],
}
