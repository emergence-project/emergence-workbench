import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › project › 프로젝트 정보. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '프로젝트 정보', prs: [95, 103, 111, 144, 152, 158, 162],
  items: [
    { text: <>사이드바 맨 위 "프로젝트 정보"는 네 쪽입니다. 이름을 누르면 <b>개요</b>, 그 밑에 <b>현황</b> · <b>규칙</b> · <b>저장소</b>가 늘 보입니다.</> },
    { text: <><b>개요</b>는 이 프로젝트가 무엇이고 무엇이 들어 있는지입니다: 진행 상태 · 시작일 · 성격 · 분야 · 카드 그림, 그리고 주제 · 원고 · 노트 · 진술의 수. 제목 옆 연필 하나로 첫 화면과 같은 고치기 창을 엽니다. 이름 · 설명 · 시작일 · 카드 그림은 {c('workbench/research.yaml')}, 성격 · 분야 · 진행 상태는 이 컴퓨터의 설정에 씁니다.</> },
    { text: <><b>현황</b>은 에이전트가 {c('STATUS.md')}와 MCP로 읽는 것과 같은 내용을 칸으로 나눴습니다: 내 차례(판단을 기다리는 맡긴 일), 맡긴 일 수, 주제마다 노트 상태별 수, 최근 7일 기록. 줄을 누르면 그 일이나 주제로 갑니다. 맨 아래 "원문 보기"를 펼치면 {c('STATUS.md')}의 글이 보입니다. 그 가운데 규칙 절(공통 규칙 · 폴더와 편집 규칙 · 프로젝트 규칙)은 여기서 빼고 <b>규칙</b> 쪽에 보입니다. 흐름에 점이 있으면 원문에 "흐름 요약"(최근 점 다섯, 열린 점, 사람 승인 대기)과 "흐름 지도"(점마다 한 줄)가 함께 실려, 에이전트도 열린 질문과 폐기한 갈래를 압니다.</> },
    { text: <><b>규칙</b>은 에이전트가 이 저장소에서 먼저 읽는 것입니다: 저장소의 {c('AGENTS.md')} · {c('CLAUDE.md')}, {c('STATUS.md')}의 규칙 절(공통 규칙 포함), 그리고 아래 <b>결정</b>({c('workbench/decisions/')}, 새것부터, 뒤집힌 결정은 흐리게). 읽기만 하고, 고치려면 저장소의 파일을 고칩니다. 공통 규칙은 설정 › 공통 규칙에서 고칩니다.</> },
    { text: <><b>저장소</b>는 폴더, git 브랜치, GitHub 주소, 마지막 커밋(짧은 번호·제목·언제), 커밋 안 한 변경과 새 파일 수, GitHub와 같은지를 보여 줍니다. "확인하기"를 누르면 그때 GitHub에 새 커밋이 있는지 확인하고(git fetch), 받아오거나 올리지는 않습니다. GitHub에 새 커밋이 있으면 그 옆 "업데이트"(홈의 돌아가는 화살표도 같음)로 받아옵니다. 앱도 10분마다 같은 조건으로 저절로 받습니다. 빨리 감기만 하므로, 이 컴퓨터에만 있는 커밋이 있거나 커밋 안 한 변경이 새 커밋과 같은 파일을 고쳤으면 받지 않고 터미널의 git pull을 안내합니다. 인터넷이 없거나 원격이 없으면 그렇다고 적습니다. 아래에 자료 위치({c('research.yaml')}의 {c('sources:')})가 있습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Project info',
  items: [
    { text: <>"Project info" at the top of the sidebar has four pages. Clicking the name opens <b>Overview</b>; <b>Status</b> · <b>Rules</b> · <b>Repository</b> are always listed under it.</> },
    { text: <><b>Overview</b> is what this project is and what it holds: progress status · start date · kind · fields · card image, and counts of topics · manuscripts · notes · statements. The one pencil next to the title opens the same edit dialog as on the home screen. Name, description, start date and card image are written to {c('workbench/research.yaml')}; kind, fields and progress status to this computer's settings.</> },
    { text: <><b>Status</b> splits into sections the same content agents read in {c('STATUS.md')} and over MCP: your turn (delegated work waiting for your decision), delegated work counts, note counts by status for each topic, and the last 7 days of journal. Click a row to go to that task or topic. Open "Show the text agents read" at the bottom to see the {c('STATUS.md')} text. Its rules sections (common rules, folder and editing rules, project rules) are left out here and shown on the <b>Rules</b> page. When the flow has dots, the text also carries "Flow summary" (the five newest dots, open dots, dots awaiting human approval) and "Flow map" (one line per dot), so agents also know the open questions and dropped branches.</> },
    { text: <><b>Rules</b> is what agents read first in this repository: the repository's {c('AGENTS.md')} · {c('CLAUDE.md')}, the rule sections of {c('STATUS.md')} (including the common rules), and <b>Decisions</b> below ({c('workbench/decisions/')}, newest first, reversed decisions faded). Read only; to change them, edit the files in the repository. The common rules are edited in Settings › Common rules.</> },
    { text: <><b>Repository</b> shows the folder, git branch, GitHub address, last commit (short hash, title, when), counts of uncommitted changes and new files, and whether it matches GitHub. "Check" asks GitHub right then whether there are new commits (git fetch), without pulling or pushing. If GitHub has new commits, "Update" next to it (same as the circular arrow on Home) pulls them. The app also pulls on its own every 10 minutes under the same conditions. It only fast-forwards, so if this computer has commits of its own, or uncommitted changes touch the same files as the new commits, it does not pull and points you to git pull in a terminal. If there is no internet or no remote, it says so. Below it are the material locations ({c('sources:')} in {c('research.yaml')}).</> },
  ],
}
