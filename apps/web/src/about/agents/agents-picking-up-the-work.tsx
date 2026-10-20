import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › agents › 에이전트가 이어받기. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '에이전트가 이어받기',
  items: [
    { text: <>앱이 각 프로젝트의 {c('workbench/STATUS.md')}에 요약(정본 위치, 작업 목록, 원고와 마지막 컴파일, 최근 7일)을 씁니다. 에이전트는 이것을 먼저 읽습니다. 정본은 아닙니다.</> },
    { text: <>맡긴 일의 규칙은 {c('docs/agent-delegated-work.md')} 하나이고, 각 {c('STATUS.md')} 맨 위 한 줄이 그것을 가리킵니다. 결과를 만든 에이전트는 자기 결과를 승인하지 않습니다.</> },
    { text: <>앱 없이도 {c('pnpm agent:status <연구 저장소 폴더>')}로 같은 요약(할 일 · 맡긴 일 · 질문 · 검토 대기 · 최근 기록)을 봅니다.</> },
    { text: <>폰·iPad용 웹 앱(PWA)이 GitHub를 통해 같은 {c('workbench/comments/')}를 읽고 씁니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Agents picking up the work',
  items: [
    { text: <>The app writes a summary (where the sources of truth are, task list, manuscript and last compile, last 7 days) to each project's {c('workbench/STATUS.md')}. Agents read this first. It is not a source of truth.</> },
    { text: <>The rules for delegated tasks are in one file, {c('docs/agent-delegated-work.md')}, and one line at the top of each {c('STATUS.md')} points to it. The agent that produced a result does not approve its own result.</> },
    { text: <>Without the app, {c('pnpm agent:status <research repository folder>')} shows the same summary (to-dos · delegated tasks · questions · awaiting review · recent records).</> },
    { text: <>A web app for phone and iPad (PWA) reads and writes the same {c('workbench/comments/')} through GitHub.</> },
  ],
}
