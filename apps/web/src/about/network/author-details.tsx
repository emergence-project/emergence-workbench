import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › network › 저자 정보. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '저자 정보',
  items: [
    { text: <>노트 저자는 내 페이지("나")의 프로필 카드 안 "노트 저자" 칸에서 사람 카드로 고릅니다(＋ 저자 추가, × 제거, 교신 저자는 "교신" 태그). 순서는 내보낼 때 정합니다. 내보낼 때 {c('\\author')}·{c('\\email')}(첫 이메일)·{c('\\affiliation')} 줄이 자동으로 들어갑니다. 저장은 {c('~/.config/research-workspace/config.yaml')}입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Author details',
  items: [
    { text: <>Note authors are chosen as person cards in the "Note authors" box inside the profile card on your page ("Me") (＋ Add author, × Remove; the corresponding author gets a "Corresponding" tag). The order is set at export. On export, {c('\\author')}, {c('\\email')} (first email) and {c('\\affiliation')} lines are added automatically. They are stored in {c('~/.config/research-workspace/config.yaml')}.</> },
  ],
}
