import * as people from './network/people'
import * as personPage from './network/person-page'
import * as authorDetails from './network/author-details'
import type { AboutPart } from './types'

// 소개 › 네트워킹 (#/about/network). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'network', title: '네트워킹',
  sub: '레일의 사람 아이콘. 함께 연구하는 사람들과 내 저자 정보를 한곳에서 봅니다.',
  open: [{ label: '네트워킹 열기', to: { page: 'network' } }],
  sections: [people.ko, personPage.ko, authorDetails.ko],
  left: ['함께 연구하는 사람들의 arXiv 새 논문 모아 보기는 나중입니다.'],
}

export const en: AboutPart = {
  id: 'network', title: 'Networking',
  sub: 'The person icon on the rail. See the people you research with and your own author details in one place.',
  open: [{ label: 'Open Networking', to: { page: 'network' } }],
  sections: [people.en, personPage.en, authorDetails.en],
  left: ['Collecting new arXiv papers by the people you research with comes later.'],
}
