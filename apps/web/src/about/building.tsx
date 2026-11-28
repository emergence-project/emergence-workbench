import { mdSection } from './md'
import type { AboutPart } from './types'

const repos = mdSection('building/repositories')
const stack = mdSection('building/tech-stack')
const policy = mdSection('building/management')
const split = mdSection('building/core-and-extensions')

// 소개 › 만드는 방식 (#/about/building). 「앱 개발」 맨 앞 (11/28 사용자 "그렇게 하자").
// 저장소는 참고(reference), 기술 선택과 관리 방침은 앱 고치기 대화가 처음 앱 파일을 다룰 때 받는 규범(norm)이다.

export const ko: AboutPart = {
  id: 'building', title: '만드는 방식',
  sub: '앱이 어느 저장소에 있고, 어떤 기술로 왜 만들었고, 고친 것이 어떻게 반영되고, 무엇이 본체이고 무엇이 확장인지입니다.',
  sections: [repos.ko, stack.ko, policy.ko, split.ko],
}

export const en: AboutPart = {
  id: 'building', title: 'How it is built',
  sub: 'Which repositories the app lives in, what it is built with and why, how changes land, and what is core and what is an extension.',
  sections: [repos.en, stack.en, policy.en, split.en],
}
