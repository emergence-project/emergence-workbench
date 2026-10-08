/* 목업(planning/mockups/v0.html)의 아이콘을 옮겼다. 선 굵기·크기는 CSS가 정한다. */
export const Icon = {
  manuscript: <svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="1.5" /><path d="M8 3.5v17M11 8h5M11 12h5M11 16h3" /></svg>,
  home: <svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h4.5v-5.5h3V20H18V9.5" /></svg>,
  back: <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>,
  forward: <svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>,
  overview: <svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>,
  block: <svg viewBox="0 0 24 24"><path d="M7 4h7l4 4v12H7z" /><path d="M14 4v4h4M10 12h5M10 16h5" /></svg>,
  tree: <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /><path d="M12 7v4M12 11c-6 0-6 3-6 6M12 11c6 0 6 3 6 6" /></svg>,
  research: <svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="12" r="2.2" /><path d="M6 8.2v7.6M8.2 6h3.3a3 3 0 0 1 3 3v.8M14.5 12h1.3" /></svg>,
  library: <svg viewBox="0 0 24 24"><path d="M5 4.5h4v15H5zM10 4.5h4v15h-4z" /><path d="M15.5 5.2l3.6-1 3.4 14.5-3.6 1z" transform="translate(-2 0.5)" /></svg>,
  log: <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 13.5h3M8 16.5h6" /></svg>,
  search: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>,
  // 설정: 이가 분명한 톱니바퀴. 전 아이콘은 밝기 조절처럼 보였고(피드백 10/1 19:37) 조절 막대도 다시 지적됨(10/2 23:10). 모양은 Lucide "settings" (ISC)
  network: <svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.3" /><path d="M16 14.2c2.5-.3 4.2 1.3 4.6 4.3" /></svg>,
  tex: <svg viewBox="0 0 24 24"><path d="M3.5 7h7M7 7v10M11.5 10.5l9 6.5M20.5 10.5l-9 6.5" /></svg>,
  settings: <svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>,
  info: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.1" /></svg>,
  moon: <svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
  trash: <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /><path d="M10.5 11v5M13.5 11v5" /></svg>,
  // 순서 바꾸기·빼기·더하기 (내보내기 표, 10/4 18:58 "화살표 굵기를 키워줘")
  up: <svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg>,
  down: <svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6" /></svg>,
  x: <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  play: <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg>,
  download: <svg viewBox="0 0 24 24"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19h14" /></svg>,
  pencil: <svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" /><path d="M13.5 7.5l3 3" /></svg>,
  highlight: <svg viewBox="0 0 24 24"><path d="M14.5 4.5l5 5-8 8H6.5v-5z" /><path d="M4 20.5h9" /></svg>,
  comment: <svg viewBox="0 0 24 24"><path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" /><path d="M8 10h8M8 13.2h5" /></svg>,
  /** 모름 (공부할 것): 전구 */
  learn: <svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" /></svg>,
  // 칸 여닫기 (10/5 시안 "칸 여닫기 아이콘"): 여닫는 쪽을 채운 네모. 두 칸은 떨어진 네모 둘
  panelLeft: <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M5.5 5H9v14H5.5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="currentColor" /></svg>,
  panelRight: <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M18.5 5H15v14h3.5a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" fill="currentColor" /></svg>,
  split: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="8" height="14" rx="1.6" /><rect x="13" y="5" width="8" height="14" rx="1.6" /></svg>,
  /** 메모: 접힌 귀퉁이 종이 (연필은 고치기만) */
  memo: <svg viewBox="0 0 24 24"><path d="M5 4.5h14v9.5l-5.5 5.5H5z" /><path d="M13.5 19.5V14H19M8.5 9h7M8.5 12h4" /></svg>,
  /** 피드백: 위치 핀 + 글줄 ("이 자리에 남긴 말"). 말풍선은 코멘트만 */
  feedback: <svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11z" /><path d="M9.5 8.6h5M9.5 11.6h3.2" /></svg>,
  /** 더 보기 메뉴 ⋯ */
  more: <svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18" cy="12" r="1.4" fill="currentColor" /></svg>,
  sun: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>,
  // 사이드바 블록 (10/4 08:42 피드백: 더 알아보기 쉬운 아이콘). 작업 = 체크한 상자, 노트 = 공책, 참고 자료 = 클립
  task: <svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.2l2.4 2.4 4.6-5" /></svg>,
  note: <svg viewBox="0 0 24 24"><path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H6z" /><path d="M6 3.5v17M9.5 8h5.5M9.5 11.5h5.5" /></svg>,
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
  statement: <svg viewBox="0 0 24 24"><path d="M6 6h12M12 6v12M8.5 18h7" /></svg>,
  // 피드백 처리 확인 (10/4 19:06 "승인/반려 아이콘으로"): 승인 = 체크, 반려(10/7부터 화면 이름 "수정 요청") = 되돌려 보내는 꺾인 화살표 (× ·휴지통과 겹치지 않게). 10/7부터 둘 다 동그라미로 감싼다
  /** 업데이트 필요 (홈의 표시 기호: GitHub에 받을 새 커밋이 있음) */
  sync: <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></svg>,
  reopen: <svg viewBox="0 0 24 24"><path d="M20 9a8 8 0 1 0 .3 6" /><path d="M20 4v5h-5" /></svg>,
  fold: <svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" /></svg>,
  check: <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  /** 피드백 승인 (10/7 사용자 "체크에 동그라미"): 다른 곳의 체크(끝냄·확인됨)와 구별되게 동그라미로 감싼다 */
  approve: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M8.2 12.2l2.6 2.6 5-5.2" /></svg>,
  /** 피드백 수정 요청 (10/7 "동그라미에 되돌림"): 동그라미 안 되돌림 화살표 */
  sendBack: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M10.3 11.2L8 13.5l2.3 2.3" /><path d="M8 13.5h5.2a2.6 2.6 0 0 0 0-5.2H12" /></svg>,
  card: <svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="2.5" /><path d="M8 10.5h8M8 13.5h5" /></svg>,
  /** 라이브러리 목록 (사이드바 "목록" 줄): 점 셋과 줄 셋 */
  list: <svg viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11" /><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></svg>,
}
