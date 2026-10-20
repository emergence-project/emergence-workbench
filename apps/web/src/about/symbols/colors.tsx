import type { AboutSection } from '../types'

// 소개 › symbols › 색. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = { title: '색', id: 'colors', prs: [103, 197], items: [{ text: <>무채색이 기본이고, 색은 아래 뜻에만 씁니다. 텍스트 버튼과 링크는 무채색입니다. 색만으로 가르지 않습니다: 상태 옆에는 늘 이름이 함께 있고, 좁은 곳에서는 점을 가리키면 이름이 뜹니다. 네 상태 색은 적록 색약 눈으로 봐도 서로 갈리게 골랐습니다.</> }] }

export const en: AboutSection = { title: 'Colors', id: 'colors', items: [{ text: <>Neutral is the default, and color is used only for the meanings below. Text buttons and links are neutral. Color is never the only cue: a status always has its name next to it, and in narrow places hovering the dot shows the name. The four status colors were chosen to stay distinct for red-green color-blind eyes.</> }] }
