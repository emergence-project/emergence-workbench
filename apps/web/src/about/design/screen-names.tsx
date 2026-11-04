import type { AboutSection } from '../types'

// 소개 › design › 화면 요소 이름 (10/30 16:51 "앱 소개에서 레일 정의를 보려는데 나타나지 않네").
// docs/design-system.md 5절 용어표와 같은 이름이다. 용어표를 바꾸면 여기도 고친다. ko와 en은 줄이 같다.

const KO: [string, string][] = [
  ['레일', '맨 왼쪽 아이콘 세로 줄(홈 · 프로젝트 · 지식 · 논문 · 그림 · 네트워킹 · 에이전트 · 피드백 · 소개 · 설정). 프로젝트 버튼은 진행 중인 것, 지금 연 것, "레일에 보이기"를 켠 것만 보이고 끌어서 순서를 바꿉니다'],
  ['상단바', '창 맨 위 한 줄(사이드바 여닫기 · 뒤로 · 위치 · 검색 · 두 패널 · 피드백)'],
  ['왼쪽 사이드바 · 오른쪽 사이드바', '레일 옆 목록 · 오른쪽의 정보와 기록'],
  ['패널 (주 패널 · 옆 패널)', '가운데 작업 영역. 두 패널로 나누면 고른 화면이 주 패널, 함께 볼 PDF가 옆 패널'],
  ['탭 바', '패널 위 탭 줄. 빈 곳을 끌어 두 패널을 맞바꿉니다'],
  ['툴바', '패널 · 화면 맨 위 도구 한 줄(왼쪽 무엇 · 가운데 보기 · 오른쪽 행동)'],
  ['헤더', '항목 · 카드 · 창의 맨 위 줄(제목과 항목 행동)'],
  ['배너', '화면 맨 위 가로 알림(예제 모드)'],
  ['세그먼트', '둘 이상 중 하나를 고르는 붙은 버튼(보기 전환 등)'],
  ['필터 · 그룹 · 정렬', '보일 것만 남기기 · 같은 값끼리 묶어 보이기 · 순서 정하기'],
  ['태그', '둥근 작은 이름(분야, 주제, 종류)'],
  ['배지', '레일 버튼의 주황 수 · 점'],
  ['툴팁', '가리키면 뜨는 작은 이름'],
  ['메뉴', '버튼 아래 펼치는 목록. 고른 글 메뉴(검정) · 하이라이트 메뉴(흰색)'],
  ['창', '화면 위에 뜨는 작은 창(수정 창, 내보내기 설정 창, 확인)'],
  ['입력란', '글을 적는 칸'],
  ['카드 · 만들기 카드', '모서리가 둥근 상자. 줄 맨 앞의 점선 카드가 만들기 카드'],
  ['알림', '잠깐 뜨는 한 줄("지웠습니다 · 되돌리기")'],
  ['기록 · 하이라이트 · 코멘트', '메모 · 할 일 · 질문 · 하이라이트(고른 글에 네 색을 칠한 것). 연구 내용에 남기는 말이 코멘트, 앱 화면에 남기는 말은 피드백'],
  ['점검', '앱이 자동으로 모은 볼 것(라이브러리 첫 화면)'],
]

const EN: [string, string][] = [
  ['Rail', 'The vertical icon strip at the far left (Home · projects · Knowledge · Papers · Figures · Network · Agents · Feedback · About · Settings). Project buttons show only active projects, the open one and those with "Show on rail"; drag to reorder'],
  ['Top bar', 'The single line at the top of the window (sidebar toggle · back · location · search · two panes · feedback)'],
  ['Left sidebar · right sidebar', 'The list next to the rail · Info and Records on the right'],
  ['Pane (main pane · side pane)', 'The central work area. Split in two, the chosen screen is the main pane and a PDF to read alongside is the side pane'],
  ['Tab bar', 'The row of tabs above a pane. Drag its empty space to swap the two panes'],
  ['Toolbar', 'The tool line at the top of a pane or screen (left what · middle view · right actions)'],
  ['Header', 'The top line of an item, card or dialog (title and item actions)'],
  ['Banner', 'A full-width notice at the top of the screen (example mode)'],
  ['Segmented control', 'Joined buttons that pick one of several (view switches and the like)'],
  ['Filter · group by · sort', 'Keep only what to show · show equal values together · set the order'],
  ['Tag', 'A small rounded name (field, topic, kind)'],
  ['Badge', 'The orange count or dot on a rail button'],
  ['Tooltip', 'The small name that shows on hover'],
  ['Menu', 'A list that opens under a button. Selection menu (black) · highlight menu (white)'],
  ['Dialog', 'A small window over the screen (edit dialog, export settings, confirmation)'],
  ['Input', 'A field to type in'],
  ['Card · new card', 'A rounded box. The dashed card at the start of a row is the new card'],
  ['Toast', 'A one-line message that shows briefly ("Deleted · Undo")'],
  ['Record · highlight · comment', 'Memo · to-do · question · highlight (selected text painted in one of four colours). Words left on research content are comments; words left on the app screen are feedback'],
  ['Check', 'Things the app gathered for you to look at (Library home)'],
]

const items = (rows: [string, string][]) => rows.map(([name, meaning]) => ({ text: <><b>{name}</b>: {meaning}</> }))

export const ko: AboutSection = { title: '화면 요소 이름', id: 'names', items: items(KO) }
export const en: AboutSection = { title: 'Names of screen parts', id: 'names', items: items(EN) }
