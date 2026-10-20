import type { AboutSection } from '../types'

// 소개 › knowledge › 정리 규칙. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '정리 규칙',
  items: [
    { text: <>정의는 한 곳에만 씁니다. 한 연구에서만 쓰면 그 연구의 노트에, 두 연구 이상이 쓰면 개념노트에 둡니다. 개념 하나에 노트 하나, 다른 이름은 별칭입니다.</> },
    { text: <>PDF로 볼 때는 설정의 LaTeX 서식 가운데 하나를 고릅니다. 고른 것은 노트마다 기억합니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Organizing rules',
  items: [
    { text: <>A definition is written in only one place. If only one research project uses it, it goes in that project's notes; if two or more use it, in a concept note. One note per concept; other names are aliases.</> },
    { text: <>To view as PDF, choose one of the LaTeX templates in Settings. The choice is remembered per note.</> },
  ],
}
