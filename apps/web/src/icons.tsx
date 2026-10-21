/* 첫 목업의 아이콘을 옮겼다. 선 굵기·크기는 CSS가 정한다. */
export const Icon = {
  manuscript: <svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M8 3.5v17M11 8h5M11 12h5M11 16h3" /></svg>,
  home: <svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5" /></svg>,
  back: <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>,
  forward: <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>,
  block: <svg viewBox="0 0 24 24"><path d="M7 4h7l4 4v12H7z" /><path d="M14 4v4h4M10 12h5M10 16h5" /></svg>,
  tree: <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /><path d="M12 7v4M12 11c-6 0-6 3-6 6M12 11c6 0 6 3 6 6" /></svg>,
  /** 연구(프로젝트): 플라스크 (10/16 아이콘 검토). Git 갈래 `branch`와 따로 둔다 */
  research: <svg viewBox="0 0 24 24"><path d="M14 3v5.5l5.6 9.8A1.8 1.8 0 0 1 18 21H6a1.8 1.8 0 0 1-1.6-2.7L10 8.5V3" /><path d="M6.8 15h10.4M8.5 3h7" /></svg>,
  library: <svg viewBox="0 0 24 24"><path d="M5 4.5h4v15H5zM10 4.5h4v15h-4z" /><path d="M15.5 5.2l3.6-1 3.4 14.5-3.6 1z" transform="translate(-2 0.5)" /></svg>,
  log: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h3M8 16.5h6" /></svg>,
  search: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
  // 설정: 이가 분명한 톱니바퀴. 전 아이콘은 밝기 조절처럼 보였고(피드백 10/1 19:37) 조절 막대도 다시 지적됨(10/2 23:10). 모양은 Lucide "settings" (ISC)
  network: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.3" /><path d="M16 14.2c2.5-.3 4.2 1.3 4.6 4.3" /></svg>,
  settings: <svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>,
  projectInfo: <svg viewBox="0 0 24 24"><path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2.3H19a1.5 1.5 0 0 1 1.5 1.5v8.7A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" /><path d="M12 12.2v4M12 10v.1" /></svg>,
  /** 수정 검토: ± 문서 (바뀐 곳 검토, GitHub diff와 같은 그림). 돋보기는 검색만 */
  review: <svg viewBox="0 0 24 24"><path d="M14.5 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7.5z" /><path d="M9 10.5h6M12 7.5v6M9 17h6" /></svg>,
  info: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.1" /></svg>,
  trash: <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /><path d="M10.5 11v5M13.5 11v5" /></svg>,
  // 순서 바꾸기·빼기·더하기 (내보내기 표, 10/4 18:58 "화살표 굵기를 키워줘")
  up: <svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg>,
  down: <svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6" /></svg>,
  x: <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  play: <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>,
  download: <svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19h14" /></svg>,
  /** 새 버전 받기 (10/21): 동그라미 안 아래 화살표. 내보내기 ⤓와 따로 */
  update: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v8M8.5 12.5L12 16l3.5-3.5" /></svg>,
  pencil: <svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 7.5l3 3" /></svg>,
  highlight: <svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-8 8H6.5v-5z" /><path d="M4 20.5h9" /></svg>,
  comment: <svg viewBox="0 0 24 24"><path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" /><path d="M8 10h8M8 13.2h5" /></svg>,
  // 칸 여닫기 (10/5 시안 "칸 여닫기 아이콘"): 여닫는 쪽을 채운 네모. 두 칸은 떨어진 네모 둘
  panelLeft: <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M5.5 5H9v14H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="currentColor" /></svg>,
  panelRight: <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M18.5 5H15v14h3.5a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" fill="currentColor" /></svg>,
  split: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="8" height="14" rx="1.6" /><rect x="13" y="5" width="8" height="14" rx="1.6" /></svg>,
  /** 메모: 접힌 귀퉁이 종이 (연필은 고치기만) */
  memo: <svg viewBox="0 0 24 24"><path d="M5 4.5h14v9.5l-5.5 5.5H5z" /><path d="M13.5 19.5V14H19M8.5 9h7M8.5 12h4" /></svg>,
  /** 가리키기: 점선 네모와 화살표 (화면 부위 고르기, 10/16). 핀은 피드백만 */
  point: <svg viewBox="0 0 24 24"><path d="M12 12.6a.5.5 0 0 1 .65-.65l8.5 3.3a.5.5 0 0 1-.03.94l-3.3 1a1 1 0 0 0-.66.66l-1 3.3a.5.5 0 0 1-.94.03z" /><path d="M5 3.5A1.5 1.5 0 0 0 3.5 5M19 3.5A1.5 1.5 0 0 1 20.5 5M5 20.5A1.5 1.5 0 0 1 3.5 19M9 3.5h1.5M9 20.5h1.5M14 3.5h1M3.5 9v1.5M20.5 9v1.5M3.5 14v1" /></svg>,
  /** 피드백: 위치 핀 + 글줄 ("이 자리에 남긴 말"). 말풍선은 코멘트만 */
  feedback: <svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11z" /><path d="M9.5 8.6h5M9.5 11.6h3.2" /></svg>,
  /** 더 보기 메뉴 ⋯ */
  more: <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></svg>,
  // 사이드바 블록 (10/4 08:42 피드백: 더 알아보기 쉬운 아이콘). 작업 = 체크한 상자, 노트 = 공책, 참고 자료 = 클립
  /** 작업(화면) · 맡긴 일: 클립보드와 체크 (10/16). 할 일 종류는 빈 체크 상자 `todo` */
  task: <svg viewBox="0 0 24 24"><rect x="8.5" y="2.5" width="7" height="4" rx="1" /><path d="M15.5 4.5h2A1.5 1.5 0 0 1 19 6v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V6a1.5 1.5 0 0 1 1.5-1.5h2" /><path d="M9 14l2 2 4-4" /></svg>,
  clip: <svg viewBox="0 0 24 24"><path d="M19 11.5l-7.3 7.3a4.5 4.5 0 0 1-6.4-6.4l7.6-7.6a3 3 0 0 1 4.2 4.2l-7.5 7.5a1.5 1.5 0 0 1-2.1-2.1l6.8-6.8" /></svg>,
  // 노트·탭 기호 (2026-10-04 기호와 행동: 글자 기호 § ◇ ▤ ⎙ 대신 같은 선 그림). 연구노트 = block, 지도 = tree
  concept: <svg viewBox="0 0 24 24"><path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" /></svg>,
  paper: <svg viewBox="0 0 24 24"><path d="M3.5 6c3-1.3 5.8-1.3 8.5.5 2.7-1.8 5.5-1.8 8.5-.5v13c-3-1.3-5.8-1.3-8.5.5-2.7-1.8-5.5-1.8-8.5-.5z" /><path d="M12 6.5v13" /></svg>,
  papers: <svg viewBox="0 0 24 24"><path d="M8 3.5h7l4 4v11H8z" /><path d="M15 3.5v4h4" /><path d="M5 7v13.5h10" /></svg>,
  pdf: <svg viewBox="0 0 24 24"><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4" /></svg>,
  /** 라이브러리 저장 위치 (10/6 라이브러리 정보): Git 갈래 · iCloud 구름 · Google Drive 세모 */
  branch: <svg viewBox="0 0 24 24"><circle cx="7" cy="5.5" r="2" /><circle cx="7" cy="18.5" r="2" /><circle cx="17" cy="8" r="2" /><path d="M7 7.5v9M17 10c0 4-10 2.5-10 6.5" /></svg>,
  cloud: <svg viewBox="0 0 24 24"><path d="M7.5 18.5h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.6a4.5 4.5 0 0 0 .5 8.9z" /></svg>,
  drive: <svg viewBox="0 0 24 24"><path d="M9 4.5h6l6 10.5-3 5H6l-3-5z" /><path d="M9 4.5l6 10.5H3M15 4.5L9 15M6 20l3-5M18 20l-3-5" /></svg>,
  figures: <svg viewBox="0 0 24 24"><circle cx="8.5" cy="8.5" r="4" /><path d="M15.5 11l5 8.5h-10z" /><path d="M3.5 19.5h6" /></svg>,
  image: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l4.5-4.5 3.5 3.5 2.5-2.5L19 17" /></svg>,
  slides: <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="11" rx="1.5" /><path d="M12 16v3.5M8.5 19.5h7" /></svg>,
  /** 진술: ⊢ (수학의 주장 기호, 10/16). T는 흐름의 정리 점만 */
  statement: <svg viewBox="0 0 24 24"><path d="M7 4.5v15M7 12h11" /></svg>,
  // 피드백 처리 확인 (10/4 19:06 "승인/반려 아이콘으로"): 승인 = 체크, 반려(10/7부터 화면 이름 "수정 요청") = 되돌려 보내는 꺾인 화살표 (× ·휴지통과 겹치지 않게). 10/7부터 둘 다 동그라미로 감싼다
  /** 업데이트 필요 (홈의 표시 기호: GitHub에 받을 새 커밋이 있음) */
  sync: <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>,
  /** 다시 열기: 가운데 점이 든 동그라미 + 화살표 (GitHub의 다시 연 이슈와 같은 그림, 10/16). 도는 화살표 둘 `sync`는 업데이트 필요만 */
  reopen: <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v4h-4" /><circle cx="12" cy="12" r="1.6" /></svg>,
  fold: <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>,
  check: <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  /** 피드백 승인 (10/7 사용자 "체크에 동그라미"): 다른 곳의 체크(끝냄·확인됨)와 구별되게 동그라미로 감싼다 */
  /** 설명 보기: 동그라미 안 ? (10/14). 동그라미 없는 ?는 Claude에게 묻기 */
  help: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-.9.8-.9 1.4v.6" /><path d="M12 16.4v.1" /></svg>,
  approve: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.2l2.6 2.6 5-5.2" /></svg>,
  /** 흐름: 세 점과 그 사이를 잇는 선 (연구 흐름, 10/14) */
  flow: <svg viewBox="0 0 24 24"><circle cx="5.5" cy="6.5" r="2.5" /><rect x="15" y="4" width="5" height="5" rx="1.2" /><rect x="15" y="15" width="5" height="5" rx="1.2" /><path d="M8 6.5h7M8 6.5c3.5 0 3.5 11 7 11" /></svg>,
  /** 피드백 수정 요청 (10/7 "동그라미에 되돌림"): 동그라미 안 되돌림 화살표 */
  sendBack: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M10.3 11.2L8 13.5l2.3 2.3" /><path d="M8 13.5h5.2a2.6 2.6 0 0 0 0-5.2H12" /></svg>,
  /** 되돌리기 (고침 검토, 10/13 시안): 왼쪽으로 굽은 화살표. 동그라미가 없어 수정(sendBack)과 구별된다 */
  revert: <svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>,
  /** 앞뒤 펼치기 · 접기 (고침 검토): 바깥으로 벌어진 겹꺾쇠 · 안으로 모인 겹꺾쇠 */
  expand: <svg viewBox="0 0 24 24"><path d="M7 9l5-5 5 5" /><path d="M7 15l5 5 5-5" /></svg>,
  collapse: <svg viewBox="0 0 24 24"><path d="M7 4l5 5 5-5" /><path d="M7 20l5-5 5 5" /></svg>,
  card: <svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2.5" /><path d="M8 10.5h8M8 13.5h5" /></svg>,
  /** 라이브러리 목록 (사이드바 "목록" 줄): 점 셋과 줄 셋 */
  list: <svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></svg>,
  /** 질문(기록 종류): 물음표가 든 말풍선. 말풍선은 기록 묶음의 그림이다 (10/16) */
  ask: <svg viewBox="0 0 24 24"><path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" /><path d="M10 9.3a2 2 0 1 1 2.6 1.9c-.5.2-.6.6-.6 1v.4M12 14.4v.1" /></svg>,
  /** 지시(기록 종류): 종이비행기, 에이전트에게 보낸다 (10/16) */
  send: <svg viewBox="0 0 24 24"><path d="M14.5 21.2a.5.5 0 0 0 .93-.03l6-17.2a.5.5 0 0 0-.64-.64l-17.2 6a.5.5 0 0 0-.03.93l7.2 2.9a1.5 1.5 0 0 1 .84.84z" /><path d="M21.3 2.7l-10.4 10.4" /></svg>,
  /** 할 일(기록 종류)의 필터·고르기 표시: 빈 체크 상자. 줄에서는 누르는 체크 상자 */
  todo: <svg viewBox="0 0 24 24"><rect x="4.5" y="4.5" width="15" height="15" rx="3" /></svg>,
  /** Claude에게 묻기: 반짝이 (AI가 하는 행동에만, 10/16) */
  spark: <svg viewBox="0 0 24 24"><path d="M10 15.3a2 2 0 0 0-1.3-1.3l-5.3-1.5a.5.5 0 0 1 0-1l5.3-1.5A2 2 0 0 0 10 8.7l1.5-5.3a.5.5 0 0 1 1 0L14 8.7a2 2 0 0 0 1.3 1.3l5.3 1.5a.5.5 0 0 1 0 1L15.3 14a2 2 0 0 0-1.3 1.3l-1.5 5.3a.5.5 0 0 1-1 0z" /><path d="M19.5 3v3.5M21.25 4.75h-3.5" /></svg>,
  /** 노트 열기: 상자에서 밖으로 나가는 화살표 (수정 검토의 노트 표, 10/19) */
  openNote: <svg viewBox="0 0 24 24"><path d="M14 4.5h5.5V10M19.5 4.5L11 13" /><path d="M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V8A1.5 1.5 0 0 1 6 6.5h5" /></svg>,
  /** 노트에서 이 자리로: 글 줄을 가리키는 화살표 (수정 검토의 바뀐 곳, 10/19) */
  gotoSpot: <svg viewBox="0 0 24 24"><path d="M3.5 12h9M9.5 8l4 4-4 4" /><path d="M16.5 6.5h4M16.5 12h4M16.5 17.5h4" /></svg>,
  /** 쓴 이 Claude: 무채색 Claude 표시 (기록 줄 · 대화에서 이름 앞, 누르지 않음, 10/19 피드백 "무채색 로고") */
  claude: <svg viewBox="0 0 24 24"><path d="M13.6 12.2L21.4 13.3M13.3 13L17.5 16.3M12.6 13.5L15.2 19.9M11.8 13.6L11.1 18.4M11 13.3L6.5 19.1M10.5 12.6L5 14.8M10.4 11.8L2.6 10.7M10.7 11L6.9 8M11.4 10.5L8.8 4.1M12.2 10.4L13 5.1M13 10.7L17.5 4.9M13.5 11.4L18 9.6" /></svg>,
  /** AGENTS.md: 로봇 (에이전트가 읽는 규칙, 10/16) */
  bot: <svg viewBox="0 0 24 24"><path d="M12 8V4.5H8.5" /><rect x="4.5" y="8" width="15" height="11.5" rx="2" /><path d="M2.5 13.5h2M19.5 13.5h2M9.5 12.5v2M14.5 12.5v2" /></svg>,
  /** 주제: 겹친 층 (노트를 묶는다, 10/16). 카드 `card`는 검색의 카드만 */
  layers: <svg viewBox="0 0 24 24"><path d="M12.7 3.2a1.6 1.6 0 0 0-1.4 0L3.6 6.8a.8.8 0 0 0 0 1.4l7.7 3.6a1.6 1.6 0 0 0 1.4 0l7.7-3.6a.8.8 0 0 0 0-1.4z" /><path d="M3.2 12.2l8.1 3.7a1.6 1.6 0 0 0 1.4 0l8.1-3.7M3.2 16.7l8.1 3.7a1.6 1.6 0 0 0 1.4 0l8.1-3.7" /></svg>,
  /** 즐겨찾기: 별. 켜짐은 `.on`으로 속을 채운다 (빈 별 · 찬 별 짝) */
  star: <svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg>,
  /** 마감 (달력): 깃발 */
  flag: <svg viewBox="0 0 24 24"><path d="M5.5 21V4M5.5 4H18l-2.5 4 2.5 4H5.5" /></svg>,
  /** 상태 바꿈 (달력·일지의 기록 표시): 맞선 두 화살표 */
  swap: <svg viewBox="0 0 24 24"><path d="M8 3.5L4 7.5l4 4M4 7.5h16M16 12.5l4 4-4 4M20 16.5H4" /></svg>,
  /** 확인 전 (개념노트): 빈 동그라미. 확인함은 체크 `check` */
  unchecked: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" /></svg>,
}
