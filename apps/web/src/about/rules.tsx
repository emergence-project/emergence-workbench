import * as registry from './rules/registry'
import * as review from './rules/review'
import type { AboutPart } from './types'

// 소개 › 에이전트 규칙 (#/about/rules, 2026-11-27 사용자 결정 "규칙은 늘 의심하고 꼭 필요한지 확인"). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다.

export const ko: AboutPart = {
  id: 'rules', title: '에이전트 규칙',
  sub: '에이전트에게 지우는 규칙과 그 근거입니다. 사용자와 에이전트가 같은 표를 봅니다.',
  sections: [registry.ko, review.ko],
}

export const en: AboutPart = {
  id: 'rules', title: 'Agent rules',
  sub: 'The rules agents follow and why. You and the agents see the same table.',
  sections: [registry.en, review.en],
}
