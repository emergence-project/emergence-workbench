import { StatesTable, TurnFigure } from '../../aboutFigures'
import type { AboutSection } from '../types'

// 소개 › principles › 상태와 차례. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '상태와 차례',
  figure: <><StatesTable /><TurnFigure /></>,
  items: [
    { text: <>상태는 글자 기호가 아니라 색 점과 짧은 이름입니다. 노트 · 맡긴 일 · 프로젝트가 같은 색을 씁니다: 파랑 진행, 주황 멈춤, 회색 고리 폐기, 청록 해결(프로젝트는 완료).</> },
    { text: <>주황은 "사용자 차례"이기도 합니다. 판단 대기·확인 필요처럼 내가 볼 것은 어디서나 주황 알약 수나 주황 점 하나의 모양이고, 에이전트를 기다리는 것은 무채색입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Status and turns',
  figure: <><StatesTable /><TurnFigure /></>,
  items: [
    { text: <>Status is shown as a colored dot and a short name, not a text symbol. Notes, delegated tasks and projects use the same colors: blue In progress, orange Blocked, gray ring Dropped, teal Solved (Done for projects).</> },
    { text: <>Orange also means "your turn". Anything you need to look at, such as Awaiting decision or Needs review, looks the same everywhere: an orange pill with a count or a single orange dot. Things waiting on an agent are neutral gray.</> },
  ],
}
