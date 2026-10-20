import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › knowledge › 어디에 있나. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '어디에 있나', prs: [81],
  items: [
    { text: <>개념노트는 공유 라이브러리의 {c('concepts/')}에 Markdown + KaTeX(수식)로 있습니다. Obsidian Study의 개념노트 171개를 옮겨 왔고, 이제 앱이 정본입니다. Obsidian은 그대로 두고 더 고치지 않습니다.</> },
    { text: <>아직 옮기지 않은 Study 노트는 지식 사이드바 맨 아래에 읽기 전용으로 보입니다.</> },
    { text: <>노트가 {c('[[링크]]')}로 쓰는 개념노트는 그 노트의 오른쪽 사이드바 정보 "본문에 쓴 개념노트"에 모입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Where they live',
  items: [
    { text: <>Concept notes live in the shared library's {c('concepts/')} as Markdown + KaTeX (math). The 171 concept notes from Obsidian Study were moved over, and the app is now the source of truth. Obsidian is left as it is and no longer edited.</> },
    { text: <>Study notes not moved yet show read only at the bottom of the Knowledge sidebar.</> },
    { text: <>Concept notes a note uses through {c('[[links]]')} gather under "Concept notes used in the body" in that note's right sidebar Info.</> },
  ],
}
