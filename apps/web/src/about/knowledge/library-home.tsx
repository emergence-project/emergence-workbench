import { c } from '../code'
import type { AboutSection } from '../types'

// 소개 › knowledge › 라이브러리 첫 화면 (지식 · 논문 · 그림). 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '라이브러리 첫 화면 (지식 · 논문 · 그림)', prs: [81, 158, 197],
  items: [
    { text: <>지식 · 논문 · 그림은 같은 틀의 첫 화면입니다: <b>최근</b>(맨 앞에 만들기 · 더하기 줄), <b>점검</b>(사용자가 볼 것, 주황 점), <b>통계</b>(누르면 그 항목들의 목록), 오른쪽 <b>라이브러리 정보</b>(저장 위치와 Git · 클라우드 상태, ⌥⌘\로 여닫기). 섹션 제목은 소제목 크기입니다.</> },
    { text: <>지식의 점검은 연구가 쓰는 노트(프로젝트 노트 · 원고가 링크한 개념노트와 그 전제 한 단계) 가운데 확인 전 · 확인 뒤 바뀐 것, 그리고 에이전트가 쓴 초안입니다. "＋ 개념노트 만들기"는 직접 쓰기와 에이전트에게 초안 맡기기 중에서 고릅니다. 초안을 맡기면 그 개념노트 기록에 확인할 할 일 하나와, 처음 막힌 곳 · 에이전트가 남긴 확인할 점을 담은 메모 하나가 남습니다.</> },
    { text: <>지식 목록은 색인에서 50개씩 정렬하고 거르는 표입니다. 사이드바에는 분류 나무만 있고, 분류를 고르면 오른쪽에 분류 정보(이름 고치기 · 하위 분류 더하기 · 이 분류의 논문 n · 그림 n)가 보입니다. 지도는 지식 사이드바의 "지도" 줄에서 엽니다.</> },
    { text: <>분류는 공유 라이브러리의 {c('subjects.yaml')} 나무(3단계까지)이고, 개념노트 · 그림 · 논문은 머리말이나 목록에 {c('subjects:')} ID를 1–3개 적습니다. 분류를 바꿔도 노트 본문 바이트는 그대로입니다.</> },
    { text: <>논문 첫 화면의 점검은 PDF 폴더 정하기 · 답이 온 질문, 통계는 PDF 없음 · arXiv로 받을 수 있음 · 프로젝트에 안 묶임입니다. 그림 첫 화면의 점검은 그림으로 못 바꾼 tikz입니다. 표 · 카드 목록은 사이드바 "목록"에 있습니다. 함께 쓰는 그림은 공유 라이브러리 {c('figures/')}, 한 프로젝트 것은 그 저장소 {c('workbench/figures/')}에 두고 노트에서 {c('![[이름]]')}이나 그림 문단 {c('![캡션](이름)')}으로 넣습니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Library home (Knowledge · Papers · Figures)',
  items: [
    { text: <>Knowledge, Papers and Figures share the same home layout: <b>Recent</b> (with a create/add row first), <b>Check</b> (things for you to look at, orange dot), <b>Stats</b> (click to list those items), and on the right <b>Library info</b> (storage location and Git and cloud status; toggle with ⌥⌘\). Section headings use the subheading size.</> },
    { text: <>The Knowledge check lists notes your research uses (concept notes linked from project notes or manuscripts, plus one level of their prerequisites) that are not reviewed yet or changed since review, and drafts written by an agent. "＋ New concept note" lets you choose between writing it yourself and delegating a draft to an agent. A delegated draft leaves, in that concept note's records, one to-do to check it and one memo with where you got stuck and what the agent asks you to check.</> },
    { text: <>The Knowledge list is a table sorted and filtered from the index, 50 at a time. The sidebar has only the subject tree; choosing a subject shows its info on the right (rename · add subsection · papers n · figures n in this subject). The map opens from the "Map" row in the Knowledge sidebar.</> },
    { text: <>Subjects are the tree in the shared library's {c('subjects.yaml')} (up to three levels), and concept notes, figures and papers write 1 to 3 {c('subjects:')} IDs in their front matter or list. Changing subjects leaves the note body bytes unchanged.</> },
    { text: <>The Papers home check is set the PDF folder · answered questions, and its stats are no PDF · available from arXiv · not linked to a project. The Figures home check is tikz that could not be turned into a figure. Table and card lists are under "List" in the sidebar. Shared figures go in the shared library's {c('figures/')}, a single project's in that repository's {c('workbench/figures/')}, and notes insert them with {c('![[name]]')} or a figure paragraph {c('![caption](name)')}.</> },
  ],
}
