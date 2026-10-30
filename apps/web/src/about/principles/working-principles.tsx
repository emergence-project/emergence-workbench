import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › principles › 작업 원칙. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '작업 원칙',
  items: [
    { text: <><b>저장소가 주인이다.</b> 연구 저장소의 구조를 앱에 맞게 바꾸지 않고, 앱이 남기는 것은 {c('workbench/')}에만 둡니다.</> },
    { text: <><b>정본은 GitHub에 있다.</b> 맥의 폴더는 그 사본이고, 맥에만 있는 {c('workbench/')}는 한 시간마다 비공개 백업 저장소에 올립니다.</> },
    { text: <><b>원고는 잃지 않는다.</b> 다른 곳에서 같은 파일이 바뀌면 덮어쓰지 않고 멈춥니다.</> },
    { text: <><b>고친 것은 바로 반영한다.</b> 에이전트가 고치고 검사(CI)를 통과하면 합치며, 맥의 앱은 10분마다 새 버전을 받아 빌드해 두고, 입력 없이 5분이 지나면 자동으로 다시 시작합니다. 바로 쓰려면 상단바의 "새 버전 · 다시 시작"을 누릅니다.</> },
    { text: <><b>맡긴 일은 사람이 판단해 끝낸다.</b> 에이전트는 종결 조건을 먼저 정하고 결과를 보고서로 채우며, 승인은 사용자만 합니다.</> },
    { text: <><b>남긴 말은 기록으로 이어진다.</b> 피드백·코멘트·질문은 파일로 남고, 처리 결과는 {c('feedback/status.yaml')} 한 곳에 적습니다. 승인된 피드백은 이 소개의 설명으로 옮기고 원문은 지웁니다.</> },
    { text: <><b>모르면 묻고, 아니면 바로 한다.</b> 되돌릴 수 없는 일이나 목표가 바뀌는 일만 묻고, 그 밖에는 알맞은 기본값으로 진행한 뒤 무엇을 골랐는지 알립니다. "다음 단계"라고 답할 만한 것은 바로 만듭니다.</> },
    { text: <><b>물리·수학 검토는 사람이 한다.</b> 자동 검사나 수치 일치는 사용자의 검토를 대신하지 않습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Working principles',
  items: [
    { text: <><b>The repository is in charge.</b> The app does not reshape a research repository to suit itself, and everything the app keeps goes only in {c('workbench/')}.</> },
    { text: <><b>The source of truth is on GitHub.</b> The folder on the Mac is a copy, and {c('workbench/')} content that exists only on the Mac is pushed to a private backup repository every hour.</> },
    { text: <><b>Manuscripts are never lost.</b> If the same file changes somewhere else, the app stops instead of overwriting.</> },
    { text: <><b>Fixes ship right away.</b> An agent makes the fix and merges it once checks (CI) pass; the Mac app pulls and builds new versions every 10 minutes and restarts on its own after 5 minutes without input. To use it right away, press "New version · Restart" in the top bar.</> },
    { text: <><b>A person closes delegated tasks.</b> The agent sets completion criteria first and fills in the result as a report; only you approve.</> },
    { text: <><b>What you leave turns into records.</b> Feedback, comments and questions are saved as files, and how each was handled is written in one place, {c('feedback/status.yaml')}. Approved feedback moves into this About page as a description, and the original is deleted.</> },
    { text: <><b>Ask when unsure, otherwise just do it.</b> Only things that cannot be undone or that change the goal are asked about; otherwise the agent goes ahead with a sensible default and says what it chose. Anything you would answer with "next step" gets built right away.</> },
    { text: <><b>A person does the physics and math review.</b> Automatic checks and matching numbers do not replace your review.</> },
  ],
}
