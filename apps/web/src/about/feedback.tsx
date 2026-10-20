import * as leavingFeedback from './feedback/leaving-feedback'
import * as overview from './feedback/overview'
import * as handlingAndShipping from './feedback/handling-and-shipping'
import * as thisAboutPage from './feedback/this-about-page'
import type { AboutPart } from './types'

// 소개 › 피드백이 반영되는 길 (#/about/feedback). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'feedback', title: '피드백이 반영되는 길',
  sub: '앱을 쓰다 남긴 말이 고친 화면이 되어 돌아오기까지의 길입니다.',
  open: [{ label: '피드백 모아 보기 열기', to: { page: 'feedback' } }],
  sections: [leavingFeedback.ko, overview.ko, handlingAndShipping.ko, thisAboutPage.ko],
}

export const en: AboutPart = {
  id: 'feedback', title: 'How feedback gets in',
  sub: 'The path from something you said while using the app to a fixed screen coming back to you.',
  open: [{ label: 'Open feedback overview', to: { page: 'feedback' } }],
  sections: [leavingFeedback.en, overview.en, handlingAndShipping.en, thisAboutPage.en],
}
