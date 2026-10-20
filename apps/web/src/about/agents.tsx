import * as theRepositoryIsInCharge from './agents/the-repository-is-in-charge'
import * as keepingRealResearchSafe from './agents/keeping-real-research-safe'
import * as agentsPickingUpTheWork from './agents/agents-picking-up-the-work'
import type { AboutPart } from './types'

// 소개 › 에이전트와 안전 (#/about/agents). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'agents', title: '에이전트와 안전',
  sub: '이 앱은 각 저장소의 파일을 그대로 읽고 고치며, 코딩 에이전트와 같은 파일을 씁니다. 가장 먼저 지키는 것은 원고를 잃지 않는 것입니다.',
  sections: [theRepositoryIsInCharge.ko, keepingRealResearchSafe.ko, agentsPickingUpTheWork.ko],
  left: ['에이전트가 고친 것을 하나씩 확인하고 되돌리는 이력 화면은 아직입니다.'],
}

export const en: AboutPart = {
  id: 'agents', title: 'Agents and safety',
  sub: 'This app reads and edits each repository\'s files directly, and works on the same files as coding agents. The first thing it protects is never losing a manuscript.',
  sections: [theRepositoryIsInCharge.en, keepingRealResearchSafe.en, agentsPickingUpTheWork.en],
  left: ['A history screen to review and undo each change an agent made is not there yet.'],
}
