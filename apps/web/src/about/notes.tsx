import * as writingKinds from './notes/writing-kinds'
import * as manuscriptScreen from './notes/manuscript-screen'
import * as topicScreen from './notes/topic-screen'
import * as noteScreen from './notes/note-screen'
import * as claimNotes from './notes/claim-notes'
import * as map from './notes/map'
import * as citations from './notes/citations'
import type { AboutPart } from './types'

// 소개 › 노트 (#/about/notes). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고친다. 절은 같은 이름 폴더에 절마다 파일 하나다.

export const ko: AboutPart = {
  id: 'notes', title: '노트',
  sub: <>왼쪽 사이드바의 주제 › 노트 나무에서 노트를 엽니다. 개념노트 · 문헌노트 · 지도는 레일 "지식"에서 봅니다.</>,
  sections: [writingKinds.ko, manuscriptScreen.ko, topicScreen.ko, noteScreen.ko, claimNotes.ko, map.ko, citations.ko],
  left: ['\\ref 자동완성과 그림 끌어다 넣기는 노트 편집기에 아직 없습니다 ([@ 인용 찾기는 있습니다).'],
}

export const en: AboutPart = {
  id: 'notes', title: 'Notes',
  sub: <>Open notes from the topic › note tree in the left sidebar. Concept notes, literature notes and the map are under "Knowledge" on the rail.</>,
  sections: [writingKinds.en, manuscriptScreen.en, topicScreen.en, noteScreen.en, claimNotes.en, map.en, citations.en],
  left: ['\\ref autocomplete and dragging in figures are not in the note editor yet (searching citations with [@ is).'],
}
