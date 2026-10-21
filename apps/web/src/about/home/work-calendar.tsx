import { HomeMarksTable } from '../../aboutFigures'
import type { AboutSection } from '../types'

// 소개 › home › 한 일 달력. 한국어(ko)와 영어(en)는 같은 모양으로 함께 고치고, prs(이 절을 고친 PR)는 ko에만 적는다.

export const ko: AboutSection = {
  title: '한 일 달력', prs: [192],
  figure: <HomeMarksTable />,
  items: [
    { text: <>한 주(일–토)를 보여 주고, ‹ · 이번 주 · ›로 주를 옮깁니다. 지난 날에는 끝낸 할 일 · 노트 고침 · 상태 바꿈 · 메모가, 앞으로의 날에는 마감 ⚑만 있습니다. 기록 › 내 차례의 달력도 같은 기호를 씁니다.</> },
    { text: <>"브리핑 복사"는 이 주의 한 일을 연구별로 묶어 글로 복사합니다.</> },
    { text: <>설정 › 계정에서 구글을 연결하면 구글 캘린더 일정이 무채색으로 함께 보입니다(읽기만). 로그인이 만료되면 달력 아래에 "구글 연결이 끊겼습니다 · 다시 연결"이 보입니다.</> },
  ],
}

export const en: AboutSection = {
  title: 'Work calendar',
  figure: <HomeMarksTable />,
  items: [
    { text: <>Shows one week (Sun to Sat); move between weeks with ‹ · This week · ›. Past days show finished to-dos, note edits, status changes and memos; future days show only deadlines ⚑. The calendar in Records › Your turn uses the same symbols.</> },
    { text: <>"Copy briefing" copies this week's work as text, grouped by project.</> },
    { text: <>If you connect Google in Settings › Accounts, Google Calendar events also appear, in neutral gray (read only). If the sign-in expires, "Google connection expired · Reconnect" shows under the calendar.</> },
  ],
}
