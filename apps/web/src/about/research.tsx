import * as experiments from './research/experiments'
import type { AboutPart } from './types'

// 소개 › 연구 중인 기능과 실험 (#/about/research, 2026-11-27 사용자 결정 "추천대로"). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다.

export const ko: AboutPart = {
  id: 'research', title: '연구 중인 기능과 실험',
  sub: '해 보는 중인 기능입니다. 써 보고 좋으면 남기고, 효과가 없으면 이유를 적고 되돌립니다.',
  sections: [experiments.ko],
}

export const en: AboutPart = {
  id: 'research', title: 'Features under research',
  sub: 'Features being tried out. Kept if they help; otherwise reverted with the reason written down.',
  sections: [experiments.en],
}
